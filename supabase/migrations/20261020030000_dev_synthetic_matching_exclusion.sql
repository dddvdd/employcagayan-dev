-- DEV-only, depends on 20261020010000_dev_synthetic_test_registry.sql.
-- Preserve current source-bound matching logic while denying classified actors
-- before privileged profile construction, pair scores or downstream ranking.
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
 IF app.is_dev_synthetic_participant(p_jobseeker_profile_id) THEN
  RAISE EXCEPTION 'Synthetic profile is excluded from ordinary matching' USING ERRCODE='42501';
 END IF;
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

  IF v_result IS NULL THEN RETURN NULL; END IF;
  RETURN v_result||jsonb_build_object('match_source_version','matching-source-v1',
   'match_source_hash',app.match_source_fingerprint(v_result));
END
$function$
;

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

REVOKE ALL ON FUNCTION public.get_jobseeker_match_profile(uuid),
  public.get_vacancy_match_profile(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_jobseeker_match_profile(uuid),
  public.get_vacancy_match_profile(uuid,uuid) TO authenticated;

-- Privileged candidate and vacancy-list functions bypass RLS, so filter before
-- aggregation, ranking or vector search without changing existing role checks.
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
      AND NOT app.is_dev_synthetic_vacancy(vd.id)
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
      AND NOT app.is_dev_synthetic_vacancy(vd.id)
      AND emp.is_active = true AND emp.registration_status = 'approved';
  END IF;

  RETURN COALESCE(v_results, '[]'::jsonb);
END
$function$
;

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
      AND NOT app.is_dev_synthetic_participant(a.participant_id)
      AND (p_event_vacancy_id IS NULL OR a.event_vacancy_id = p_event_vacancy_id)

    UNION ALL

    SELECT ep.participant_id, 'event_interest'::text, 'interested'::text, pv.created_at
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND NOT app.is_dev_synthetic_participant(ep.participant_id)
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
      AND NOT app.is_dev_synthetic_participant(a.participant_id)
      AND (p_event_vacancy_id IS NULL OR a.event_vacancy_id = p_event_vacancy_id)
    UNION ALL
    SELECT ep.participant_id, 'event_interest'::text
    FROM public.participation_vacancies pv
    JOIN public.event_vacancies ev ON ev.id = pv.event_vacancy_id
    JOIN public.event_participations ep ON ep.id = pv.participation_id
    WHERE ev.vacancy_definition_id = p_vacancy_definition_id
      AND NOT app.is_dev_synthetic_participant(ep.participant_id)
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

REVOKE ALL ON FUNCTION public.get_vacancies_match_profiles(uuid[],uuid),
  public.get_vacancy_candidate_match_profiles(uuid,uuid),
  public.search_similar_candidates(vector,uuid,uuid,text,integer,double precision)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_vacancies_match_profiles(uuid[],uuid),
  public.get_vacancy_candidate_match_profiles(uuid,uuid),
  public.search_similar_candidates(vector,uuid,uuid,text,integer,double precision)
  TO authenticated;
