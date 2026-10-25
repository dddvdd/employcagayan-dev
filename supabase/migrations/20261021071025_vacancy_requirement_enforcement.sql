-- DEV: keep the publication gate at the database boundary. This intentionally
-- recognizes only clear English requirement wording and exact canonical names.
-- Compared with the JavaScript preview, SQL splits every comma (more conservative);
-- both leave implicit, non-English and unreviewed synonym wording for human review.
CREATE OR REPLACE FUNCTION app.has_unresolved_vacancy_requirements(
  p_vacancy_id uuid, p_qualifications text, p_job_description text, p_requirements_summary text
) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_text text;
  v_source text;
  v_normalized text;
  v_covered boolean;
BEGIN
  FOR v_text IN SELECT unnest(ARRAY[p_qualifications, p_job_description, p_requirements_summary])
  LOOP
    FOR v_source IN
      SELECT btrim(part)
      FROM regexp_split_to_table(COALESCE(v_text, ''), E'[\n.;,]+|\\m(but|however)\\M', 'i') AS part
    LOOP
      IF v_source = '' OR v_source !~*
        '\m(must[[:space:]]+(have|hold|possess|be[[:space:]]+(skilled[[:space:]]+in|certified|licensed|proficient[[:space:]]+in|trained[[:space:]]+in))|required?|requires?|mandatory|need(s|ed)?|minimum[[:space:]]+qualification)\M'
      THEN CONTINUE; END IF;
      IF v_source ~* '\m(not[[:space:]]+required|no[[:space:]]+.{0,70}[[:space:]]+required|not[[:space:]]+mandatory|without[[:space:]]+.{0,50}[[:space:]]+requirement)\M'
      THEN CONTINUE; END IF;
      IF v_source ~* '\m(preferred|optional|nice[[:space:]]+to[[:space:]]+have|an?[[:space:]]+advantage|desirable)\M'
         AND v_source !~* '\m(and|or)\M'
      THEN CONTINUE; END IF;
      IF v_source ~* '^([[:space:]]*(must[[:space:]]+have|requires?|required|need(s|ed)?|mandatory|minimum[[:space:]]+qualification)[[:space:]:,-]*(experience|qualification|skills?|applicants?|candidates?)?[[:space:]]*)$'
      THEN CONTINUE; END IF;

      -- Numeric experience and degree wording need their own human review.
      IF v_source ~* '\m[0-9]+[[:space:]]*(years?|months?|yrs?)\M'
         OR v_source ~* '\m(bachelor(''s)?|degree|diploma|college[[:space:]]+graduate|education[[:space:]]+level)\M'
      THEN RETURN true; END IF;

      -- One canonical name cannot resolve a compound requirement.
      IF v_source ~* '\m(and|or|plus)\M' THEN RETURN true; END IF;
      v_normalized := btrim(regexp_replace(lower(v_source), '[^a-z0-9]+', ' ', 'g'));

      IF v_source ~* '\m(NC[[:space:]]*[IVX]+|national[[:space:]]+certificate|certificat(e|ion)|licen[sc]e)\M' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.vacancy_certification_requirements r
          JOIN public.certifications c ON c.id = r.certification_id
          CROSS JOIN LATERAL (SELECT btrim(regexp_replace(lower(c.canonical_name), '[^a-z0-9]+', ' ', 'g')) AS name) n
          WHERE r.vacancy_definition_id = p_vacancy_id AND r.importance = 'required'
            AND length(n.name) >= 3
            AND position(' ' || n.name || ' ' IN ' ' || v_normalized || ' ') > 0
        ) INTO v_covered;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.vacancy_skills r
          JOIN public.skills s ON s.id = r.skill_id
          CROSS JOIN LATERAL (SELECT btrim(regexp_replace(lower(s.canonical_name), '[^a-z0-9]+', ' ', 'g')) AS name) n
          WHERE r.vacancy_definition_id = p_vacancy_id AND r.importance = 'required'
            AND length(n.name) >= 3
            AND position(' ' || n.name || ' ' IN ' ' || v_normalized || ' ') > 0
        ) INTO v_covered;
      END IF;
      IF NOT COALESCE(v_covered, false) THEN RETURN true; END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END
$function$;

REVOKE ALL ON FUNCTION app.has_unresolved_vacancy_requirements(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app.guard_vacancy_requirement_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_changed boolean;
BEGIN
  IF NEW.platform_status <> 'published' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed := NEW.platform_status IS DISTINCT FROM OLD.platform_status
      OR NEW.qualifications IS DISTINCT FROM OLD.qualifications
      OR NEW.job_description IS DISTINCT FROM OLD.job_description
      OR NEW.requirements_summary IS DISTINCT FROM OLD.requirements_summary;
  END IF;
  IF v_changed AND app.has_unresolved_vacancy_requirements(
    NEW.id, NEW.qualifications, NEW.job_description, NEW.requirements_summary
  ) THEN
    RAISE EXCEPTION 'Resolve possible mandatory vacancy requirements before publication'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION app.guard_vacancy_requirement_publication()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_guard_vacancy_requirement_publication
BEFORE INSERT OR UPDATE OF platform_status, qualifications, job_description, requirements_summary
ON public.vacancy_definitions
FOR EACH ROW EXECUTE FUNCTION app.guard_vacancy_requirement_publication();

-- A direct requirement deletion/demotion must not reopen a published gap.
CREATE FUNCTION app.guard_published_vacancy_requirements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_vacancy public.vacancy_definitions%ROWTYPE;
BEGIN
  SELECT * INTO v_vacancy FROM public.vacancy_definitions
  WHERE id = OLD.vacancy_definition_id FOR UPDATE;
  IF v_vacancy.platform_status = 'published'
     AND app.has_unresolved_vacancy_requirements(
       v_vacancy.id, v_vacancy.qualifications,
       v_vacancy.job_description, v_vacancy.requirements_summary)
  THEN
    RAISE EXCEPTION 'Resolve possible mandatory vacancy requirements before removing structured evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION app.guard_published_vacancy_requirements()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_published_skill_requirement
AFTER DELETE OR UPDATE OF skill_id, importance, vacancy_definition_id
ON public.vacancy_skills
FOR EACH ROW EXECUTE FUNCTION app.guard_published_vacancy_requirements();
CREATE TRIGGER guard_published_certification_requirement
AFTER DELETE OR UPDATE OF certification_id, importance, vacancy_definition_id
ON public.vacancy_certification_requirements
FOR EACH ROW EXECUTE FUNCTION app.guard_published_vacancy_requirements();

-- The existing authorized matching function follows below with only the
-- job_description and requirements_summary result keys added. Its visibility
-- checks, source hash, and grants remain unchanged.
CREATE OR REPLACE FUNCTION public.get_vacancy_match_profile(p_vacancy_definition_id uuid, p_event_vacancy_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_deadline timestamptz;
  v_visible boolean := false;
  v_role text := public.app_current_user_role_text();
BEGIN
 PERFORM app.require_intelligence_session();
 IF app.is_dev_synthetic_vacancy(p_vacancy_definition_id) THEN
  RAISE EXCEPTION 'Synthetic vacancy is excluded from ordinary matching' USING ERRCODE='42501';
 END IF;
  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.application_deadline INTO v_deadline
    FROM public.event_vacancies ev
    JOIN public.events e ON e.id = ev.event_id
    JOIN public.vacancy_definitions event_vd ON event_vd.id=ev.vacancy_definition_id
    JOIN public.employers event_emp ON event_emp.id=event_vd.employer_id
    WHERE ev.id = p_event_vacancy_id
      AND ev.vacancy_definition_id = p_vacancy_definition_id
      AND e.status <> 'cancelled'
      AND event_vd.is_active=true AND event_emp.is_active=true AND event_emp.registration_status='approved';
    v_visible := FOUND;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND vd.is_active = true
        AND vd.platform_status = 'published'
        AND vd.published_at IS NOT NULL
        AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
        AND e.is_active = true AND e.registration_status = 'approved'
    ) INTO v_visible;
  END IF;

  IF NOT v_visible AND v_role = 'employer' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) INTO v_visible;
  ELSIF NOT v_visible AND v_role = 'admin' THEN
    v_visible := true;
  END IF;

  IF NOT v_visible THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', vd.id,
    'event_vacancy_id', p_event_vacancy_id,
    'employer_id', vd.employer_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'is_active', vd.is_active,
    'application_deadline', CASE WHEN p_event_vacancy_id IS NULL
      THEN vd.platform_application_deadline ELSE v_deadline END,
    'occupation_id', vd.occupation_id,
    'occupation_name', o.canonical_name,
    'industry_id', vd.industry_id,
    'industry_name', i.canonical_name,
    'employment_type_id', vd.employment_type_id,
    'employment_type_name', et.name,
    'work_arrangement_id', vd.work_arrangement_id,
    'work_arrangement_name', wa.name,
    'salary_min', vd.salary_min,
    'salary_max', vd.salary_max,
    'salary_currency', COALESCE(vd.salary_currency, 'PHP'),
    'salary_period', vd.salary_period,
    'salary_negotiable', COALESCE(vd.salary_negotiable, false),
    'province', vd.province,
    'municipality_city', vd.municipality_city,
    'place_of_assignment', vd.place_of_assignment,
    'qualifications', vd.qualifications,
    'job_description', vd.job_description,
    'requirements_summary', vd.requirements_summary,
    'education_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ve.id, 'education_level_id', ve.education_level_id,
        'level_code', el.code, 'level_name', el.name, 'rank', el.rank,
        'field_of_study', ve.field_of_study, 'importance', ve.importance, 'notes', ve.notes
      ))
      FROM public.vacancy_education_requirements ve
      JOIN public.education_levels el ON el.id = ve.education_level_id
      WHERE ve.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'experience_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vx.id, 'occupation_id', vx.occupation_id, 'industry_id', vx.industry_id,
        'minimum_months', vx.minimum_months, 'importance', vx.importance,
        'description', vx.description
      ))
      FROM public.vacancy_experience_requirements vx
      WHERE vx.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vs.id, 'skill_id', vs.skill_id, 'canonical_name', s.canonical_name,
        'skill_type', s.skill_type, 'importance', vs.importance,
        'minimum_proficiency', vs.minimum_proficiency,
        'minimum_years_experience', vs.minimum_years_experience
      ))
      FROM public.vacancy_skills vs
      JOIN public.skills s ON s.id = vs.skill_id
      WHERE vs.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'certification_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vc.id, 'certification_id', vc.certification_id,
        'canonical_name', c.canonical_name, 'importance', vc.importance,
        'must_be_valid', vc.must_be_valid, 'notes', vc.notes
      ))
      FROM public.vacancy_certification_requirements vc
      JOIN public.certifications c ON c.id = vc.certification_id
      WHERE vc.vacancy_definition_id = vd.id
    ), '[]'::jsonb),
    'language_requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vl.id, 'language_id', vl.language_id, 'code', l.code, 'name', l.name,
        'importance', vl.importance, 'minimum_speaking', vl.minimum_speaking,
        'minimum_reading', vl.minimum_reading, 'minimum_writing', vl.minimum_writing
      ))
      FROM public.vacancy_language_requirements vl
      JOIN public.languages l ON l.id = vl.language_id
      WHERE vl.vacancy_definition_id = vd.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.vacancy_definitions vd
  LEFT JOIN public.occupations o ON o.id = vd.occupation_id
  LEFT JOIN public.industries i ON i.id = vd.industry_id
  LEFT JOIN public.employment_types et ON et.id = vd.employment_type_id
  LEFT JOIN public.work_arrangements wa ON wa.id = vd.work_arrangement_id
  WHERE vd.id = p_vacancy_definition_id;

  IF v_result IS NULL THEN RETURN NULL; END IF;
  RETURN v_result||jsonb_build_object('match_source_version','matching-source-v1',
   'match_source_hash',app.match_source_fingerprint(v_result));
END
$function$
;


REVOKE ALL ON FUNCTION public.get_vacancy_match_profile(uuid,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_vacancy_match_profile(uuid,uuid) TO authenticated;
