-- Intelligence authorization and certification provenance; DEV-only milestone.
BEGIN;
CREATE OR REPLACE FUNCTION app.require_intelligence_session()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_role public.user_role;
BEGIN
 PERFORM app.require_recruitment_session();
 v_role:=app.current_user_role();
 IF v_role='applicant' THEN PERFORM app.require_jobseeker_identity();
 ELSIF v_role='employer' THEN PERFORM app.require_recruitment_partner();
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_intelligence_session() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.intelligence_entity_authorized(p_type text,p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.platform_identity_session_satisfied() AND CASE app.current_user_role()
 WHEN 'admin' THEN p_type IN ('jobseeker_profile','vacancy')
 WHEN 'staff' THEN p_type IN ('jobseeker_profile','vacancy')
 WHEN 'supervisor' THEN p_type IN ('jobseeker_profile','vacancy') AND (
  EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND is_provincial)
  OR p_type='jobseeker_profile' AND app.supervisor_participant_scope_satisfied(p_id)
  OR p_type='vacancy' AND EXISTS(SELECT 1 FROM public.event_vacancies WHERE vacancy_definition_id=p_id AND public.supervisor_can_view_event(event_id)))
 WHEN 'applicant' THEN p_type='jobseeker_profile' AND app.jobseeker_identity_satisfied()
  AND EXISTS(SELECT 1 FROM public.jobseeker_profiles jp JOIN public.participants p ON p.id=jp.participant_id WHERE jp.participant_id=p_id AND p.auth_user_id=auth.uid())
 WHEN 'employer' THEN p_type='vacancy' AND app.approved_employer_session_satisfied()
  AND EXISTS(SELECT 1 FROM public.vacancy_definitions vd JOIN public.employers e ON e.id=vd.employer_id WHERE vd.id=p_id AND e.registered_user_id=auth.uid() AND e.is_active AND e.registration_status='approved')
 ELSE false END
$fn$;
REVOKE ALL ON FUNCTION app.intelligence_entity_authorized(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.intelligence_entity_authorized(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app.require_ai_suggestion_review(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_type text; v_entity uuid;
BEGIN
 PERFORM app.require_intelligence_session();
 -- Lock before authorization and retain that lock through the outer review.
 SELECT entity_type,entity_id INTO v_type,v_entity FROM public.ai_extraction_suggestions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT app.intelligence_entity_authorized(v_type,v_entity) THEN
  RAISE EXCEPTION 'Not authorized to review this suggestion' USING ERRCODE='42501';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_ai_suggestion_review(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE POLICY intelligence_run_scope ON public.ai_extraction_runs AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app.intelligence_entity_authorized(entity_type,entity_id));
CREATE POLICY intelligence_suggestion_scope ON public.ai_extraction_suggestions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app.intelligence_entity_authorized(entity_type,entity_id));
CREATE POLICY intelligence_embedding_scope ON public.employment_embeddings AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app.intelligence_entity_authorized(entity_type::text,entity_id));
CREATE POLICY supervisor_certification_scope ON public.jobseeker_certifications AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app.supervisor_participant_scope_satisfied(jobseeker_profile_id));

CREATE OR REPLACE FUNCTION app.guard_direct_certification_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF app.current_user_role()='admin' AND app.partner_mfa_satisfied() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.source IS DISTINCT FROM 'self_reported' OR NEW.verification_status IS DISTINCT FROM 'unverified' THEN
   RAISE EXCEPTION 'Self-reported certifications cannot claim external provenance or verification' USING ERRCODE='42501';
  END IF;
 ELSE
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
   RAISE EXCEPTION 'Only an authorized administrator can change certification verification' USING ERRCODE='42501';
  END IF;
  IF NEW.source IS DISTINCT FROM OLD.source AND NEW.source IS DISTINCT FROM 'self_reported' THEN
   RAISE EXCEPTION 'Self-reported certifications cannot claim external provenance' USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['id','created_at','updated_at','source','verification_status']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['id','created_at','updated_at','source','verification_status'])
     OR NEW.source IS DISTINCT FROM OLD.source THEN
   NEW.source:='self_reported'; NEW.verification_status:='unverified';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_direct_certification_provenance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_direct_certification_provenance BEFORE INSERT OR UPDATE ON public.jobseeker_certifications
 FOR EACH ROW EXECUTE FUNCTION app.guard_direct_certification_provenance();
CREATE TRIGGER audit_certification_provenance AFTER INSERT OR UPDATE ON public.jobseeker_certifications
 FOR EACH ROW EXECUTE FUNCTION app.audit_qualification_provenance();

CREATE OR REPLACE FUNCTION app.audit_ai_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NEW.review_status IS NOT DISTINCT FROM OLD.review_status THEN RETURN NEW; END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
 VALUES(auth.uid(),'ai_suggestion_reviewed','ai_extraction_suggestions',NEW.id,
  jsonb_build_object('review_status',OLD.review_status),
  jsonb_build_object('review_status',NEW.review_status,'entity_type',NEW.entity_type,'suggestion_type',NEW.suggestion_type));
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.audit_ai_review() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_ai_review AFTER UPDATE OF review_status ON public.ai_extraction_suggestions
 FOR EACH ROW EXECUTE FUNCTION app.audit_ai_review();
CREATE OR REPLACE FUNCTION public.get_jobseeker_match_profile(p_jobseeker_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_role text;
BEGIN
 PERFORM app.require_intelligence_session();
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
  END IF;
  v_role := public.app_current_user_role_text();

  IF v_role = 'admin' THEN
    NULL;
  ELSIF v_role IN ('staff', 'supervisor') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.event_participations ep
      WHERE ep.participant_id = p_jobseeker_profile_id
        AND public.supervisor_can_view_event(ep.event_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'applicant' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = p_jobseeker_profile_id AND p.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE a.participant_id = p_jobseeker_profile_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
      UNION ALL
      SELECT 1
      FROM public.participation_vacancies pv
      JOIN public.event_participations ep ON ep.id = pv.participation_id
      JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
      JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE ep.participant_id = p_jobseeker_profile_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to view jobseeker matching profile' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'participant_id', jp.participant_id,
    'first_name', jp.first_name,
    'last_name', jp.last_name,
    'province', jp.province,
    'municipality_city', jp.municipality_city,
    'willing_to_relocate', COALESCE(jp.willing_to_relocate, false),
    'availability_status', jp.availability_status,
    'available_start_date', jp.available_start_date,
    'preferred_shift', jp.preferred_shift,
    'desired_salary_min', jp.desired_salary_min,
    'desired_salary_max', jp.desired_salary_max,
    'desired_salary_currency', COALESCE(jp.desired_salary_currency, 'PHP'),
    'desired_salary_period', jp.desired_salary_period,
    'highest_educational_attainment', jp.highest_educational_attainment,
    'years_of_experience', jp.years_of_experience,
    'education', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', je.id, 'education_level_id', je.education_level_id,
        'level_code', el.code, 'level_name', el.name, 'rank', el.rank,
        'school_name', je.school_name, 'field_of_study', je.field_of_study,
        'course_program', je.course_program, 'status', je.status,
        'graduation_year', je.graduation_year
      ) ORDER BY el.rank DESC)
      FROM public.jobseeker_education je
      JOIN public.education_levels el ON el.id = je.education_level_id
      WHERE je.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', js.id, 'skill_id', js.skill_id, 'canonical_name', s.canonical_name,
        'skill_type', s.skill_type, 'proficiency_level', js.proficiency_level,
        'years_experience', js.years_experience, 'verification_status', js.verification_status
      ))
      FROM public.jobseeker_skills js
      JOIN public.skills s ON s.id = js.skill_id
      WHERE js.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'certifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jc.id, 'certification_id', jc.certification_id,
        'canonical_name', c.canonical_name,
        'issuing_organization', COALESCE(jc.issuing_organization_override, c.issuing_organization),
        'certification_type', c.certification_type, 'does_not_expire', jc.does_not_expire,
        'expiration_date', jc.expiration_date, 'date_issued', jc.date_issued,
        'verification_status', jc.verification_status
      ))
      FROM public.jobseeker_certifications jc
      LEFT JOIN public.certifications c ON c.id = jc.certification_id
      WHERE jc.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'languages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jl.id, 'language_id', jl.language_id, 'code', l.code, 'name', l.name,
        'speaking_proficiency', jl.speaking_proficiency,
        'reading_proficiency', jl.reading_proficiency,
        'writing_proficiency', jl.writing_proficiency, 'is_native', jl.is_native
      ))
      FROM public.jobseeker_languages jl
      JOIN public.languages l ON l.id = jl.language_id
      WHERE jl.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'work_experiences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', we.id, 'employer_name', we.employer_name,
        'position_title', we.position_title, 'industry', we.industry,
        'start_date', we.start_date, 'end_date', we.end_date,
        'is_current', we.is_current, 'description', we.description
      ) ORDER BY COALESCE(we.end_date, '9999-12-31'::date) DESC)
      FROM public.work_experiences we
      WHERE we.participant_id = jp.participant_id
    ), '[]'::jsonb),
    'occupation_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'occupation_id', op.occupation_id, 'canonical_name', o.canonical_name,
        'priority', op.priority, 'preference_type', op.preference_type
      ) ORDER BY op.priority)
      FROM public.jobseeker_occupation_preferences op
      JOIN public.occupations o ON o.id = op.occupation_id
      WHERE op.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'industry_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'industry_id', ip.industry_id, 'canonical_name', i.canonical_name,
        'priority', ip.priority
      ) ORDER BY ip.priority)
      FROM public.jobseeker_industry_preferences ip
      JOIN public.industries i ON i.id = ip.industry_id
      WHERE ip.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'employment_type_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employment_type_id', ep.employment_type_id, 'code', et.code,
        'name', et.name, 'priority', ep.priority
      ) ORDER BY ep.priority)
      FROM public.jobseeker_employment_type_preferences ep
      JOIN public.employment_types et ON et.id = ep.employment_type_id
      WHERE ep.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'work_arrangement_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'work_arrangement_id', wp.work_arrangement_id, 'code', wa.code,
        'name', wa.name, 'priority', wp.priority
      ) ORDER BY wp.priority)
      FROM public.jobseeker_work_arrangement_preferences wp
      JOIN public.work_arrangements wa ON wa.id = wp.work_arrangement_id
      WHERE wp.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb),
    'location_preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'province', lp.province, 'municipality_city', lp.municipality_city,
        'region', lp.region, 'is_primary', lp.is_primary, 'priority', lp.priority
      ) ORDER BY lp.priority)
      FROM public.jobseeker_location_preferences lp
      WHERE lp.jobseeker_profile_id = jp.participant_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.jobseeker_profiles jp
  WHERE jp.participant_id = p_jobseeker_profile_id;

  RETURN v_result;
END
$function$
;
REVOKE ALL ON FUNCTION public.get_jobseeker_match_profile(p_jobseeker_profile_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_jobseeker_match_profile(p_jobseeker_profile_id uuid) TO authenticated;

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
  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.application_deadline INTO v_deadline
    FROM public.event_vacancies ev
    JOIN public.events e ON e.id = ev.event_id
    WHERE ev.id = p_event_vacancy_id
      AND ev.vacancy_definition_id = p_vacancy_definition_id
      AND e.status <> 'cancelled';
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

  RETURN v_result;
END
$function$
;
REVOKE ALL ON FUNCTION public.get_vacancy_match_profile(p_vacancy_definition_id uuid, p_event_vacancy_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_vacancy_match_profile(p_vacancy_definition_id uuid, p_event_vacancy_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vacancies_match_profiles(p_vacancy_definition_ids uuid[] DEFAULT NULL::uuid[], p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_results jsonb;
BEGIN
 PERFORM app.require_intelligence_session();
  IF p_event_id IS NULL THEN
    SELECT jsonb_agg(public.get_vacancy_match_profile(vd.id, NULL) ORDER BY vd.id)
    INTO v_results
    FROM public.vacancy_definitions vd
    JOIN public.employers emp ON emp.id = vd.employer_id
    WHERE (p_vacancy_definition_ids IS NULL OR vd.id = ANY(p_vacancy_definition_ids))
      AND vd.is_active = true
      AND vd.platform_status = 'published'
      AND vd.published_at IS NOT NULL
      AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
      AND emp.is_active = true AND emp.registration_status = 'approved';
  ELSE
    SELECT jsonb_agg(public.get_vacancy_match_profile(ev.vacancy_definition_id, ev.id) ORDER BY ev.id)
    INTO v_results
    FROM public.event_vacancies ev
    JOIN public.events e ON e.id = ev.event_id
    JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
    JOIN public.employers emp ON emp.id = vd.employer_id
    WHERE ev.event_id = p_event_id
      AND (p_vacancy_definition_ids IS NULL OR ev.vacancy_definition_id = ANY(p_vacancy_definition_ids))
      AND e.status <> 'cancelled'
      AND vd.is_active = true
      AND emp.is_active = true AND emp.registration_status = 'approved';
  END IF;

  RETURN COALESCE(v_results, '[]'::jsonb);
END
$function$
;
REVOKE ALL ON FUNCTION public.get_vacancies_match_profiles(p_vacancy_definition_ids uuid[], p_event_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_vacancies_match_profiles(p_vacancy_definition_ids uuid[], p_event_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vacancy_candidate_match_profiles(p_vacancy_definition_id uuid, p_event_vacancy_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_results jsonb;
  v_role text := public.app_current_user_role_text();
  v_event_id uuid;
BEGIN
 PERFORM app.require_intelligence_session();
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.event_id INTO v_event_id FROM public.event_vacancies ev
    WHERE ev.id = p_event_vacancy_id AND ev.vacancy_definition_id = p_vacancy_definition_id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'Event offering does not match the vacancy' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'admin' THEN
    NULL;
  ELSIF v_role IN ('staff', 'supervisor') AND v_event_id IS NOT NULL
        AND public.supervisor_can_view_event(v_event_id) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
  END IF;

  WITH authorized_candidates AS (
    SELECT a.participant_id, 'application'::text AS candidate_source,
           a.application_status, a.applied_at
    FROM public.applications a
    WHERE a.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR a.event_vacancy_id = p_event_vacancy_id)

    UNION ALL

    SELECT ep.participant_id, 'event_interest'::text, 'interested'::text, pv.created_at
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.applications a2
        WHERE a2.participant_id = ep.participant_id
          AND a2.vacancy_definition_id = p_vacancy_definition_id
          AND (p_event_vacancy_id IS NULL OR a2.event_vacancy_id = p_event_vacancy_id)
      )
  ), deduped AS (
    SELECT DISTINCT ON (participant_id) *
    FROM authorized_candidates
    ORDER BY participant_id, CASE candidate_source WHEN 'application' THEN 1 ELSE 2 END, applied_at DESC
  )
  SELECT jsonb_agg(jsonb_build_object(
    'candidate_source', d.candidate_source,
    'application_status', d.application_status,
    'applied_at', d.applied_at,
    'profile', public.get_jobseeker_match_profile(d.participant_id)
  )) INTO v_results
  FROM deduped d;

  RETURN COALESCE(v_results, '[]'::jsonb);
END
$function$
;
REVOKE ALL ON FUNCTION public.get_vacancy_candidate_match_profiles(p_vacancy_definition_id uuid, p_event_vacancy_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_vacancy_candidate_match_profiles(p_vacancy_definition_id uuid, p_event_vacancy_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_similar_candidates(p_vacancy_embedding vector, p_vacancy_definition_id uuid, p_event_vacancy_id uuid DEFAULT NULL::uuid, p_embedding_version text DEFAULT 'jobseeker-semantic-v1'::text, p_limit integer DEFAULT 10, p_min_similarity double precision DEFAULT 0.3)
 RETURNS TABLE(jobseeker_profile_id uuid, semantic_similarity double precision, embedding_version text, model text, generated_at timestamp with time zone, candidate_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_role text := public.app_current_user_role_text();
  v_event_id uuid;
BEGIN
 PERFORM app.require_intelligence_session();
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_event_vacancy_id IS NOT NULL THEN
    SELECT ev.event_id INTO v_event_id FROM public.event_vacancies ev
    WHERE ev.id = p_event_vacancy_id AND ev.vacancy_definition_id = p_vacancy_definition_id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'Event offering does not match the vacancy' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_role = 'employer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = p_vacancy_definition_id
        AND e.registered_user_id = auth.uid()
        AND e.is_active = true AND e.registration_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'admin' THEN
    NULL;
  ELSIF v_role IN ('staff', 'supervisor') AND v_event_id IS NOT NULL
        AND public.supervisor_can_view_event(v_event_id) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized for this candidate pool' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH authorized_candidates AS (
    SELECT a.participant_id, 'application'::text AS source
    FROM public.applications a
    WHERE a.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR a.event_vacancy_id = p_event_vacancy_id)
    UNION ALL
    SELECT ep.participant_id, 'event_interest'::text
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND (p_event_vacancy_id IS NULL OR ev.id = p_event_vacancy_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.applications a2
        WHERE a2.participant_id = ep.participant_id
          AND a2.vacancy_definition_id = p_vacancy_definition_id
          AND (p_event_vacancy_id IS NULL OR a2.event_vacancy_id = p_event_vacancy_id)
      )
  ), deduped AS (
    SELECT DISTINCT ON (participant_id) participant_id, source
    FROM authorized_candidates
    ORDER BY participant_id, CASE source WHEN 'application' THEN 1 ELSE 2 END
  )
  SELECT ee.entity_id,
         1 - (ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding),
         ee.embedding_version, ee.model, ee.generated_at, d.source
  FROM deduped d
  JOIN public.employment_embeddings ee
    ON ee.entity_id = d.participant_id
   AND ee.entity_type = 'jobseeker_profile'
   AND ee.embedding_type = 'jobseeker_match_profile'
   AND ee.embedding_version = p_embedding_version
   AND ee.status = 'current' AND ee.embedding IS NOT NULL
  WHERE (1 - (ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding)) >= p_min_similarity
  ORDER BY ee.embedding OPERATOR(extensions.<=>) p_vacancy_embedding
  LIMIT GREATEST(0, LEAST(p_limit, 100));
END
$function$
;
REVOKE ALL ON FUNCTION public.search_similar_candidates(p_vacancy_embedding vector, p_vacancy_definition_id uuid, p_event_vacancy_id uuid, p_embedding_version text, p_limit integer, p_min_similarity double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_similar_candidates(p_vacancy_embedding vector, p_vacancy_definition_id uuid, p_event_vacancy_id uuid, p_embedding_version text, p_limit integer, p_min_similarity double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_similar_vacancies(p_jobseeker_embedding vector, p_embedding_version text DEFAULT 'vacancy-semantic-v1'::text, p_limit integer DEFAULT 10, p_min_similarity double precision DEFAULT 0.3)
 RETURNS TABLE(vacancy_id uuid, semantic_similarity double precision, embedding_version text, model text, generated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 PERFORM app.require_intelligence_session();
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ee.entity_id,
         1 - (ee.embedding OPERATOR(extensions.<=>) p_jobseeker_embedding),
         ee.embedding_version, ee.model, ee.generated_at
  FROM public.employment_embeddings ee
  JOIN public.vacancy_definitions vd ON vd.id = ee.entity_id
  JOIN public.employers emp ON emp.id = vd.employer_id
  WHERE ee.entity_type = 'vacancy'
    AND ee.embedding_type = 'vacancy_match_profile'
    AND ee.embedding_version = p_embedding_version
    AND ee.status = 'current' AND ee.embedding IS NOT NULL
    AND vd.is_active = true
    AND vd.platform_status = 'published'
    AND vd.published_at IS NOT NULL
    AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
    AND emp.is_active = true AND emp.registration_status = 'approved'
    AND (1 - (ee.embedding OPERATOR(extensions.<=>) p_jobseeker_embedding)) >= p_min_similarity
  ORDER BY ee.embedding OPERATOR(extensions.<=>) p_jobseeker_embedding
  LIMIT GREATEST(0, LEAST(p_limit, 100));
END
$function$
;
REVOKE ALL ON FUNCTION public.search_similar_vacancies(p_jobseeker_embedding vector, p_embedding_version text, p_limit integer, p_min_similarity double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_similar_vacancies(p_jobseeker_embedding vector, p_embedding_version text, p_limit integer, p_min_similarity double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_suggestion RECORD;
  v_reviewer uuid;
  v_reviewer_role text;
  v_final_canonical_id uuid;
  v_target text;
  v_should_write_preference boolean;
  v_wrote_canonical boolean DEFAULT false;
BEGIN
 PERFORM app.require_ai_suggestion_review(p_suggestion_id);
  v_reviewer := auth.uid();

  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_reviewer_role := app.current_user_role();

  -- Lock before status check and all consequential work.
  SELECT * INTO v_suggestion
  FROM public.ai_extraction_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Suggestion not found');
  END IF;

  -- CONCURRENT SAFETY: Must be pending (first-writer-wins)
  IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Already reviewed',
      'current_status', v_suggestion.review_status,
      'reviewed_by', v_suggestion.reviewed_by
    );
  END IF;

  -- AUTHORIZATION
  IF v_reviewer_role = 'admin' THEN
    NULL;
  ELSIF v_reviewer_role = 'staff' THEN
    NULL;
  ELSIF v_reviewer_role = 'supervisor' THEN
    NULL;
  ELSIF v_reviewer_role = 'applicant' THEN
    IF v_suggestion.entity_type != 'jobseeker_profile' THEN
      RETURN jsonb_build_object('error', 'Jobseekers can only review their own suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE p.auth_user_id = v_reviewer
        AND jp.participant_id = v_suggestion.entity_id
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized to review this suggestion');
    END IF;
  ELSIF v_reviewer_role = 'employer' THEN
    IF v_suggestion.entity_type != 'vacancy' THEN
      RETURN jsonb_build_object('error', 'Employers can only review vacancy suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = v_suggestion.entity_id AND e.registered_user_id = v_reviewer
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized to review this vacancy suggestion');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Unauthorized role');
  END IF;

  -- Resolve canonical ID
  v_final_canonical_id := COALESCE(p_edited_canonical_id, v_suggestion.canonical_id);
  v_target := v_suggestion.suggestion_type;

  IF v_final_canonical_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No canonical ID resolved');
  END IF;

  IF NOT (
    (v_suggestion.entity_type = 'jobseeker_profile' AND v_target IN ('skill', 'certification', 'occupation', 'industry'))
    OR (v_suggestion.entity_type = 'vacancy' AND v_target IN ('skill', 'certification', 'occupation', 'industry', 'education_requirement', 'experience_requirement', 'language'))
  ) OR v_target IS NULL OR v_suggestion.entity_type IS NULL THEN
    RETURN jsonb_build_object('error', 'Unsupported canonical write target');
  END IF;

  -- Validate canonical exists in the appropriate table
  IF v_target = 'skill' THEN
    IF NOT EXISTS (SELECT 1 FROM public.skills WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical skill ID');
    END IF;
  ELSIF v_target = 'certification' THEN
    IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical certification ID');
    END IF;
  ELSIF v_target IN ('occupation', 'experience_requirement') THEN
    IF NOT EXISTS (SELECT 1 FROM public.occupations WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical occupation ID');
    END IF;
  ELSIF v_target = 'industry' THEN
    IF NOT EXISTS (SELECT 1 FROM public.industries WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical industry ID');
    END IF;
  ELSIF v_target = 'education_requirement' THEN
    IF NOT EXISTS (SELECT 1 FROM public.education_levels WHERE id = v_final_canonical_id) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical education level ID');
    END IF;
  ELSIF v_target = 'language' THEN
    IF NOT EXISTS (SELECT 1 FROM public.languages WHERE id = v_final_canonical_id AND is_active = true) THEN
      RETURN jsonb_build_object('error', 'Invalid canonical language ID');
    END IF;
  END IF;

  -- CANONICAL WRITES (with intent check for preference tables)
  IF v_suggestion.entity_type = 'jobseeker_profile' THEN

    IF v_target = 'skill' THEN
      INSERT INTO public.jobseeker_skills (jobseeker_profile_id, skill_id, source)
      VALUES (v_suggestion.entity_id, v_final_canonical_id, 'llm_inferred')
      ON CONFLICT (jobseeker_profile_id, skill_id) DO NOTHING;
      v_wrote_canonical := FOUND;

    ELSIF v_target = 'certification' THEN
      IF v_suggestion.provenance = 'explicit' THEN
        INSERT INTO public.jobseeker_certifications (jobseeker_profile_id, certification_id, source, verification_status)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, 'llm_inferred', 'unverified')
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Certifications require explicit provenance');
      END IF;

    ELSIF v_target = 'occupation' THEN
      v_should_write_preference := (
        v_suggestion.source_intent = 'preference'
        OR (
          v_suggestion.source_intent = 'unknown'
          AND v_suggestion.provenance = 'explicit'
          AND v_suggestion.source_text_fragment IS NOT NULL
          AND NOT (
            v_suggestion.source_text_fragment ~* '\b(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\b'
          )
        )
      );

      IF v_should_write_preference THEN
        INSERT INTO public.jobseeker_occupation_preferences (jobseeker_profile_id, occupation_id, preference_type, source)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, 'exploratory', 'llm_inferred')
        ON CONFLICT (jobseeker_profile_id, occupation_id) DO NOTHING;
        v_wrote_canonical := FOUND;
      END IF;

    ELSIF v_target = 'industry' THEN
      v_should_write_preference := (
        v_suggestion.source_intent = 'preference'
        OR (
          v_suggestion.source_intent = 'unknown'
          AND v_suggestion.provenance = 'explicit'
          AND v_suggestion.source_text_fragment IS NOT NULL
          AND NOT (
            v_suggestion.source_text_fragment ~* '\b(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\b'
          )
        )
      );

      IF v_should_write_preference THEN
        INSERT INTO public.jobseeker_industry_preferences (jobseeker_profile_id, industry_id, source)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, 'llm_inferred')
        ON CONFLICT (jobseeker_profile_id, industry_id) DO NOTHING;
        v_wrote_canonical := FOUND;
      END IF;
    END IF;

  ELSIF v_suggestion.entity_type = 'vacancy' THEN
    IF v_target = 'occupation' THEN
      UPDATE public.vacancy_definitions
      SET occupation_id = v_final_canonical_id
      WHERE id = v_suggestion.entity_id
        AND occupation_id IS DISTINCT FROM v_final_canonical_id;
      v_wrote_canonical := FOUND;
    ELSIF v_target = 'industry' THEN
      UPDATE public.vacancy_definitions
      SET industry_id = v_final_canonical_id
      WHERE id = v_suggestion.entity_id
        AND industry_id IS DISTINCT FROM v_final_canonical_id;
      v_wrote_canonical := FOUND;
    ELSIF v_target = 'skill' THEN
      INSERT INTO public.vacancy_skills (vacancy_definition_id, skill_id, importance)
      VALUES (v_suggestion.entity_id, v_final_canonical_id, COALESCE(v_suggestion.importance, 'required'))
      ON CONFLICT (vacancy_definition_id, skill_id) DO NOTHING;
      v_wrote_canonical := FOUND;
    ELSIF v_target = 'education_requirement' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_education_requirements (vacancy_definition_id, education_level_id, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.importance)
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Education importance must be required or preferred');
      END IF;
    ELSIF v_target = 'experience_requirement' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_experience_requirements (vacancy_definition_id, occupation_id, minimum_months, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.minimum_months, v_suggestion.importance)
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Experience importance must be required or preferred');
      END IF;
    ELSIF v_target = 'certification' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_certification_requirements (vacancy_definition_id, certification_id, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.importance)
        ON CONFLICT DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Certification importance must be required or preferred');
      END IF;
    ELSIF v_target = 'language' THEN
      IF v_suggestion.importance IN ('required', 'preferred') THEN
        INSERT INTO public.vacancy_language_requirements (vacancy_definition_id, language_id, importance)
        VALUES (v_suggestion.entity_id, v_final_canonical_id, v_suggestion.importance)
        ON CONFLICT (vacancy_definition_id, language_id) DO NOTHING;
        v_wrote_canonical := FOUND;
      ELSE
        RETURN jsonb_build_object('error', 'Language importance must be required or preferred');
      END IF;
    END IF;
  END IF;

  -- Lock remains held through canonical write, review status, and invalidation.
  UPDATE public.ai_extraction_suggestions
  SET review_status = 'accepted',
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      edited_canonical_id = v_final_canonical_id
  WHERE id = p_suggestion_id
    AND review_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review status changed while suggestion lock held' USING ERRCODE = '40001';
  END IF;

  -- Invalidate affected embeddings ONLY if canonical data actually changed
  -- Historical accepts (no canonical write) do NOT stale embeddings
  IF v_wrote_canonical THEN
    IF v_suggestion.entity_type = 'jobseeker_profile' THEN
      PERFORM public.mark_embeddings_stale('jobseeker_profile', v_suggestion.entity_id, NULL);
    ELSIF v_suggestion.entity_type = 'vacancy' THEN
      PERFORM public.mark_embeddings_stale('vacancy', v_suggestion.entity_id, NULL);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'suggestion_id', p_suggestion_id,
    'canonical_id', v_final_canonical_id,
    'review_status', 'accepted',
    'preference_written', v_should_write_preference,
    'wrote_canonical', v_wrote_canonical,
    'embedding_staled', v_wrote_canonical
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_ai_suggestion(p_suggestion_id uuid, p_edited_canonical_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_ai_suggestion(p_suggestion_id uuid, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_suggestion RECORD;
  v_reviewer uuid;
  v_reviewer_role text;
BEGIN
 PERFORM app.require_ai_suggestion_review(p_suggestion_id);
  v_reviewer := auth.uid();

  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_reviewer_role := app.current_user_role();

  SELECT * INTO v_suggestion
  FROM public.ai_extraction_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Suggestion not found');
  END IF;

  -- CONCURRENT SAFETY
  IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Already reviewed',
      'current_status', v_suggestion.review_status,
      'reviewed_by', v_suggestion.reviewed_by
    );
  END IF;

  -- AUTHORIZATION (same as accept)
  IF v_reviewer_role = 'admin' THEN
    NULL;
  ELSIF v_reviewer_role = 'staff' THEN
    NULL;
  ELSIF v_reviewer_role = 'supervisor' THEN
    NULL;
  ELSIF v_reviewer_role = 'applicant' THEN
    IF v_suggestion.entity_type != 'jobseeker_profile' THEN
      RETURN jsonb_build_object('error', 'Jobseekers can only review their own suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE p.auth_user_id = v_reviewer
        AND jp.participant_id = v_suggestion.entity_id
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSIF v_reviewer_role = 'employer' THEN
    IF v_suggestion.entity_type != 'vacancy' THEN
      RETURN jsonb_build_object('error', 'Employers can only review vacancy suggestions');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = v_suggestion.entity_id AND e.registered_user_id = v_reviewer
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Unauthorized role');
  END IF;

  -- CONCURRENT SAFETY: atomic update with pending check
  UPDATE public.ai_extraction_suggestions
  SET review_status = 'rejected',
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      review_note = p_review_note
  WHERE id = p_suggestion_id
    AND review_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review status changed while suggestion lock held' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'suggestion_id', p_suggestion_id,
    'review_status', 'rejected'
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.reject_ai_suggestion(p_suggestion_id uuid, p_review_note text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_ai_suggestion(p_suggestion_id uuid, p_review_note text) TO authenticated;

CREATE OR REPLACE FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_suggestion RECORD;
  v_reviewer uuid;
  v_reviewer_role text;
  v_result jsonb;
BEGIN
 PERFORM app.require_ai_suggestion_review(p_suggestion_id);
  v_reviewer := auth.uid();

  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_reviewer_role := app.current_user_role();

  SELECT * INTO v_suggestion
  FROM public.ai_extraction_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Suggestion not found');
  END IF;

  -- CONCURRENT SAFETY
  IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Already reviewed',
      'current_status', v_suggestion.review_status,
      'reviewed_by', v_suggestion.reviewed_by
    );
  END IF;

  -- AUTHORIZATION (same as accept)
  IF v_reviewer_role = 'admin' THEN
    NULL;
  ELSIF v_reviewer_role = 'staff' THEN
    NULL;
  ELSIF v_reviewer_role = 'supervisor' THEN
    NULL;
  ELSIF v_reviewer_role = 'applicant' THEN
    IF v_suggestion.entity_type != 'jobseeker_profile' THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.jobseeker_profiles jp
      JOIN public.participants p ON p.id = jp.participant_id
      WHERE p.auth_user_id = v_reviewer
        AND jp.participant_id = v_suggestion.entity_id
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSIF v_reviewer_role = 'employer' THEN
    IF v_suggestion.entity_type != 'vacancy' THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vacancy_definitions vd
      JOIN public.employers e ON e.id = vd.employer_id
      WHERE vd.id = v_suggestion.entity_id AND e.registered_user_id = v_reviewer
    ) THEN
      RETURN jsonb_build_object('error', 'Not authorized');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Unauthorized role');
  END IF;

  IF p_edited_canonical_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No edited canonical ID supplied');
  END IF;

  -- Same transaction: accept re-enters our row lock and validates before writing.
  v_result := public.accept_ai_suggestion(p_suggestion_id, p_edited_canonical_id);
  IF v_result->>'success' IS DISTINCT FROM 'true' THEN
    RETURN v_result; -- accept returned before any mutation; no edit metadata written.
  END IF;

  UPDATE public.ai_extraction_suggestions
  SET edited_term = p_edited_term,
      edited_canonical_id = p_edited_canonical_id
  WHERE id = p_suggestion_id AND review_status = 'accepted'
    AND reviewed_by = v_reviewer;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted suggestion missing during edit' USING ERRCODE = '40001';
  END IF;
  RETURN v_result;
END;
$function$
;
REVOKE ALL ON FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_ai_suggestion(p_suggestion_id uuid, p_edited_term text, p_edited_canonical_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_suggestions(p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_resolution_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, run_id uuid, entity_type text, entity_id uuid, suggestion_type text, raw_term text, confidence numeric, provenance text, source_text_fragment text, source_intent text, resolution_status text, canonical_id uuid, canonical_name text, candidate_matches jsonb, resolution_method text, review_status text, importance text, minimum_months integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path=pg_catalog,public
AS $function$
DECLARE
  v_caller_role text;
  v_caller_id uuid;
BEGIN
 PERFORM app.require_intelligence_session();
  v_caller_role := app.current_user_role();
  v_caller_id := auth.uid();

  RETURN QUERY
  SELECT
    s.id, s.run_id, s.entity_type, s.entity_id, s.suggestion_type,
    s.raw_term, s.confidence, s.provenance, s.source_text_fragment,
    s.source_intent, s.resolution_status, s.canonical_id, s.canonical_name,
    s.candidate_matches, s.resolution_method, s.review_status,
    s.importance, s.minimum_months, s.created_at
  FROM public.ai_extraction_suggestions s
  WHERE s.review_status = 'pending'
    AND app.intelligence_entity_authorized(s.entity_type,s.entity_id)
    AND (p_entity_type IS NULL OR s.entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR s.entity_id = p_entity_id)
    AND (p_resolution_status IS NULL OR s.resolution_status = p_resolution_status)
    -- AUTHORIZATION filter (server-side only, never rely on frontend)
    AND (
      -- Admin: global access
      v_caller_role = 'admin'
      -- Staff: global employment data access (consistent with is_event_staff())
      OR v_caller_role = 'staff'
      -- Supervisor: global access (event-scoping deferred to application layer)
      OR v_caller_role = 'supervisor'
      -- Applicant: own jobseeker_profile suggestions ONLY (via participants.auth_user_id chain)
      OR (v_caller_role = 'applicant' AND s.entity_type = 'jobseeker_profile'
          AND EXISTS (
            SELECT 1 FROM public.jobseeker_profiles jp
            JOIN public.participants p ON p.id = jp.participant_id
            WHERE p.auth_user_id = v_caller_id
              AND jp.participant_id = s.entity_id
          ))
      -- Employer: own vacancy suggestions ONLY (via employers.registered_user_id)
      OR (v_caller_role = 'employer' AND s.entity_type = 'vacancy'
          AND EXISTS (SELECT 1 FROM public.vacancy_definitions vd
                      JOIN public.employers e ON e.id = vd.employer_id
                      WHERE vd.id = s.entity_id AND e.registered_user_id = v_caller_id))
    )
  ORDER BY s.created_at DESC;
END;
$function$
;
REVOKE ALL ON FUNCTION public.list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_pending_suggestions(p_entity_type text, p_entity_id uuid, p_resolution_status text) TO authenticated;

ALTER FUNCTION public.set_updated_at_ai_extraction_suggestions() SET search_path=pg_catalog,public;
REVOKE ALL ON FUNCTION public.set_updated_at_ai_extraction_suggestions() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.set_updated_at_ai_extraction_runs() SET search_path=pg_catalog,public;
REVOKE ALL ON FUNCTION public.set_updated_at_ai_extraction_runs() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
