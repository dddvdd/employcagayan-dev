-- DEV-only source consistency for canonical hybrid matching. No persisted text, table/RLS changes or provider calls.
CREATE OR REPLACE FUNCTION app.match_source_fingerprint(p_value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE v_kind text:=jsonb_typeof(p_value); v_body text;
BEGIN
 IF v_kind='object' THEN
  SELECT coalesce(string_agg(length(key)::text||':'||key||':'||app.match_source_fingerprint(value),',' ORDER BY key COLLATE "C"),'')
   INTO v_body FROM jsonb_each(p_value);
 ELSIF v_kind='array' THEN
  SELECT coalesce(string_agg(h,',' ORDER BY h COLLATE "C"),'') INTO v_body
   FROM (SELECT app.match_source_fingerprint(value) h FROM jsonb_array_elements(p_value)) entries;
 ELSE v_body:=p_value::text; END IF;
 RETURN encode(sha256(convert_to('matching-source-v1/'||v_kind||'/'||v_body,'UTF8')),'hex');
END $fn$;
REVOKE ALL ON FUNCTION app.match_source_fingerprint(jsonb) FROM PUBLIC,anon,authenticated,service_role;

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
CREATE OR REPLACE FUNCTION public.get_match_keyword_signals(p_pairs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
 v_role text; v_pair jsonb; v_job jsonb; v_vac jsonb; v_signal jsonb; v_result jsonb:='[]';
 v_jobs jsonb:='{}'; v_vacancies jsonb:='{}'; v_pools jsonb:='{}'; v_pool jsonb;
 v_pid uuid; v_vid uuid; v_event uuid; v_key text;
 v_query_text text; v_document_text text; v_terms text[]; v_matched text[];
 v_document tsvector; v_query tsquery; v_rank real; v_score numeric;
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authorized matching session required' USING ERRCODE='42501';
 END IF;
 v_role:=public.app_current_user_role_text();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN
  RAISE EXCEPTION 'Authorized matching session required' USING ERRCODE='42501';
 END IF;
 IF v_role IS NULL OR v_role NOT IN ('applicant','employer','staff','supervisor','admin') THEN
  RAISE EXCEPTION 'Authorized matching session required' USING ERRCODE='42501';
 END IF;
 IF v_role='applicant' THEN
  SELECT id INTO v_pid FROM public.participants WHERE auth_user_id=auth.uid();
  IF v_pid IS NULL OR public.get_jobseeker_match_profile(v_pid) IS NULL THEN
   RAISE EXCEPTION 'Authorized matching session required' USING ERRCODE='42501';
  END IF;
 END IF;
 IF v_role='employer' AND NOT EXISTS(SELECT 1 FROM public.employers
  WHERE registered_user_id=auth.uid() AND is_active AND registration_status='approved') THEN
  RAISE EXCEPTION 'Authorized matching session required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_pairs) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Provide at most 100 canonical matching pairs' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_pairs)>100 OR octet_length(p_pairs::text)>50000 THEN
  RAISE EXCEPTION 'Provide at most 100 canonical matching pairs' USING ERRCODE='22023';
 END IF;
 FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
  IF jsonb_typeof(v_pair) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Provide canonical matching pair identifiers' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_pair) k WHERE k NOT IN ('jobseeker_profile_id','vacancy_id','event_vacancy_id'))
   OR jsonb_typeof(v_pair->'jobseeker_profile_id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v_pair->'vacancy_id') IS DISTINCT FROM 'string'
   OR v_pair->>'jobseeker_profile_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR v_pair->>'vacancy_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (v_pair->'event_vacancy_id' IS NOT NULL AND v_pair->'event_vacancy_id'<>'null'::jsonb
    AND (jsonb_typeof(v_pair->'event_vacancy_id') IS DISTINCT FROM 'string'
     OR v_pair->>'event_vacancy_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN
   RAISE EXCEPTION 'Provide canonical matching pair identifiers' USING ERRCODE='22023';
  END IF;
  v_pid:=(v_pair->>'jobseeker_profile_id')::uuid;
  v_vid:=(v_pair->>'vacancy_id')::uuid;
  v_event:=(v_pair->>'event_vacancy_id')::uuid;
  v_key:=v_vid::text||'/'||coalesce(v_event::text,'platform');
  IF v_role='supervisor' AND v_event IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.event_vacancies WHERE id=v_event AND vacancy_definition_id=v_vid
    AND public.supervisor_can_view_event(event_id)) THEN
   RAISE EXCEPTION 'Not authorized for this matching context' USING ERRCODE='42501';
  END IF;
  -- Delegate all data access to the established authoritative matching readers.
  IF NOT v_jobs ? v_pid::text THEN
   v_job:=public.get_jobseeker_match_profile(v_pid);
   IF v_job IS NULL THEN RAISE EXCEPTION 'Not authorized for this matching pair' USING ERRCODE='42501'; END IF;
   v_jobs:=v_jobs||jsonb_build_object(v_pid::text,v_job);
  ELSE v_job:=v_jobs->v_pid::text; END IF;
  IF NOT v_vacancies ? v_key THEN
   v_vac:=public.get_vacancy_match_profile(v_vid,v_event);
   IF v_vac IS NULL THEN RAISE EXCEPTION 'Not authorized for this matching pair' USING ERRCODE='42501'; END IF;
   v_vacancies:=v_vacancies||jsonb_build_object(v_key,v_vac);
  ELSE v_vac:=v_vacancies->v_key; END IF;
  IF v_role='employer' THEN
   IF NOT v_pools ? v_key THEN
    v_pool:=public.get_vacancy_candidate_match_profiles(v_vid,v_event);
    v_pools:=v_pools||jsonb_build_object(v_key,coalesce(v_pool,'[]'::jsonb));
   ELSE v_pool:=v_pools->v_key; END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_pool,'[]'::jsonb)) item
    WHERE item->'profile'->>'participant_id'=v_pid::text) THEN
    RAISE EXCEPTION 'Not authorized for this matching pair' USING ERRCODE='42501';
   END IF;
  END IF;
  -- Query: canonical preferences plus verified skills and currently valid verified credentials.
  -- Never read names, address, age, sex, schools, employer names, CV or personal free text.
  SELECT string_agg(name,' ' ORDER BY name) INTO v_query_text FROM (
   SELECT x->>'canonical_name' name FROM jsonb_array_elements(coalesce(v_job->'occupation_preferences','[]'::jsonb)) x
   UNION SELECT x->>'canonical_name' FROM jsonb_array_elements(coalesce(v_job->'industry_preferences','[]'::jsonb)) x
   UNION SELECT x->>'canonical_name' FROM jsonb_array_elements(coalesce(v_job->'skills','[]'::jsonb)) x WHERE x->>'verification_status'='verified'
   UNION SELECT x->>'canonical_name' FROM jsonb_array_elements(coalesce(v_job->'certifications','[]'::jsonb)) x
    WHERE x->>'verification_status'='verified' AND (x->>'does_not_expire'='true' OR (x->>'expiration_date')::date>=current_date)
  ) q WHERE name IS NOT NULL;
  SELECT string_agg(name,' ' ORDER BY name) INTO v_document_text FROM (
   SELECT v_vac->>'position' name UNION SELECT v_vac->>'occupation_name' UNION SELECT v_vac->>'industry_name'
   UNION SELECT x->>'canonical_name' FROM jsonb_array_elements(coalesce(v_vac->'skills','[]'::jsonb)) x
   UNION SELECT x->>'canonical_name' FROM jsonb_array_elements(coalesce(v_vac->'certification_requirements','[]'::jsonb)) x
  ) d WHERE name IS NOT NULL;
  v_signal:=jsonb_build_object('status','not_applicable','reason','no_canonical_query_terms','score',NULL,
   'query_term_count',0,'matched_term_count',0,'matched_terms','[]'::jsonb,'rank',NULL);
  IF length(coalesce(v_query_text,''))>20000 OR length(coalesce(v_document_text,''))>20000 THEN
   v_signal:=v_signal||jsonb_build_object('status','unavailable','reason','text_limit');
  ELSE
   v_terms:=ARRAY(SELECT term FROM unnest(tsvector_to_array(to_tsvector('simple'::regconfig,coalesce(v_query_text,'')))) term
    WHERE length(term) BETWEEN 2 AND 64 ORDER BY term);
   IF cardinality(v_terms)>64 THEN
    v_signal:=v_signal||jsonb_build_object('status','unavailable','reason','query_limit');
   ELSIF cardinality(v_terms)>0 THEN
    v_document:=to_tsvector('simple'::regconfig,coalesce(v_document_text,''));
    -- Every term originates from a parsed lexeme; no caller-supplied query syntax or dynamic SQL.
    SELECT string_agg(quote_literal(term),' | ' ORDER BY term)::tsquery INTO v_query FROM unnest(v_terms) term;
    v_matched:=ARRAY(SELECT term FROM unnest(v_terms) term
     WHERE v_document @@ quote_literal(term)::tsquery ORDER BY term);
    v_rank:=CASE WHEN v_document @@ v_query THEN ts_rank_cd(v_document,v_query,32) ELSE 0 END;
    v_score:=round(100.0*cardinality(v_matched)/cardinality(v_terms),2);
    v_signal:=jsonb_build_object('status','available','reason',NULL,'score',v_score,
     'query_term_count',cardinality(v_terms),'matched_term_count',cardinality(v_matched),'matched_terms',to_jsonb(v_matched),'rank',v_rank);
   END IF;
  END IF;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('jobseeker_profile_id',v_pid,'vacancy_id',v_vid,
   'event_vacancy_id',v_event,'model_version','keyword-fts-v1','text_config','simple','qualification_credit',false,'source_version','matching-source-v1',
   'jobseeker_source_hash',v_job->>'match_source_hash','vacancy_source_hash',v_vac->>'match_source_hash')||v_signal);
 END LOOP;
 RETURN v_result;
END $function$
;
CREATE OR REPLACE FUNCTION public.get_bound_match_signals(p_pairs jsonb,p_skill_ids uuid[] DEFAULT NULL,p_knowledge_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_pair jsonb; v_ids jsonb:='[]'; v_keywords jsonb; v_keyword jsonb; v_result jsonb:='[]';
 v_index integer:=0; v_semantic jsonb; v_base jsonb; v_knowledge jsonb; v_knowledge_changed boolean:=false;
BEGIN
 -- Reuse the existing canonical session gate, including for empty/malformed calls.
 PERFORM public.get_match_keyword_signals('[]'::jsonb);
 IF jsonb_typeof(p_pairs) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Provide at most 100 bound matching pairs' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_pairs)>100 OR octet_length(p_pairs::text)>100000 THEN
  RAISE EXCEPTION 'Provide at most 100 bound matching pairs' USING ERRCODE='22023';
 END IF;
 FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
  IF jsonb_typeof(v_pair) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Provide canonical matching source fingerprints' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_pair) k WHERE k NOT IN
    ('jobseeker_profile_id','vacancy_id','event_vacancy_id','jobseeker_source_hash','vacancy_source_hash',
     'jobseeker_embedding_version','vacancy_embedding_version'))
   OR jsonb_typeof(v_pair->'jobseeker_source_hash') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v_pair->'vacancy_source_hash') IS DISTINCT FROM 'string'
   OR v_pair->>'jobseeker_source_hash' !~ '^[a-f0-9]{64}$'
   OR v_pair->>'vacancy_source_hash' !~ '^[a-f0-9]{64}$'
   OR jsonb_typeof(v_pair->'jobseeker_embedding_version') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v_pair->'vacancy_embedding_version') IS DISTINCT FROM 'string'
   OR length(v_pair->>'jobseeker_embedding_version') NOT BETWEEN 1 AND 200
   OR length(v_pair->>'vacancy_embedding_version') NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'Provide canonical matching source fingerprints' USING ERRCODE='22023';
  END IF;
  IF v_pair->>'jobseeker_embedding_version' !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
   OR v_pair->>'vacancy_embedding_version' !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$' THEN
   RAISE EXCEPTION 'Provide canonical matching source fingerprints' USING ERRCODE='22023';
  END IF;
  v_ids:=v_ids||jsonb_build_array(jsonb_build_object('jobseeker_profile_id',v_pair->'jobseeker_profile_id',
   'vacancy_id',v_pair->'vacancy_id','event_vacancy_id',v_pair->'event_vacancy_id'));
 END LOOP;
 -- Every authorization check runs before results. STABLE readers share this statement's snapshot.
 v_keywords:=public.get_match_keyword_signals(v_ids);
 IF p_knowledge_hash IS NOT NULL OR p_skill_ids IS NOT NULL THEN
  IF p_knowledge_hash IS NULL OR p_knowledge_hash !~ '^[a-f0-9]{64}$' OR p_skill_ids IS NULL
   OR cardinality(p_skill_ids) NOT BETWEEN 1 AND 100
   OR cardinality(p_skill_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_skill_ids) id) THEN
   RAISE EXCEPTION 'Provide a bounded reviewed knowledge fingerprint' USING ERRCODE='22023';
  END IF;
  v_knowledge:=public.get_approved_skill_relationships(p_skill_ids);
  v_knowledge_changed:=v_knowledge->>'snapshot_hash' IS DISTINCT FROM p_knowledge_hash;
 END IF;
 FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
  v_keyword:=v_keywords->v_index; v_index:=v_index+1;
  v_base:=jsonb_build_object('jobseeker_profile_id',v_keyword->'jobseeker_profile_id',
   'vacancy_id',v_keyword->'vacancy_id','event_vacancy_id',v_keyword->'event_vacancy_id',
   'binding_version','matching-signals-v1','observed_at',statement_timestamp());
  IF v_knowledge_changed OR v_keyword->>'jobseeker_source_hash' IS DISTINCT FROM v_pair->>'jobseeker_source_hash'
   OR v_keyword->>'vacancy_source_hash' IS DISTINCT FROM v_pair->>'vacancy_source_hash' THEN
   v_result:=v_result||jsonb_build_array(v_base||jsonb_build_object('status','source_changed','keyword',NULL,'semantic',NULL));
  ELSE
   v_semantic:=public.get_pair_semantic_similarity(
    (v_pair->>'jobseeker_profile_id')::uuid,(v_pair->>'vacancy_id')::uuid,(v_pair->>'event_vacancy_id')::uuid,
    v_pair->>'jobseeker_embedding_version',v_pair->>'vacancy_embedding_version');
   v_result:=v_result||jsonb_build_array(v_base||jsonb_build_object('status','bound',
    'jobseeker_source_hash',v_keyword->>'jobseeker_source_hash','vacancy_source_hash',v_keyword->>'vacancy_source_hash',
    'knowledge_snapshot_hash',p_knowledge_hash,
    'keyword',v_keyword,'semantic',v_semantic));
  END IF;
 END LOOP;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.get_bound_match_signals(jsonb,uuid[],text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_bound_match_signals(jsonb,uuid[],text) TO authenticated;
COMMENT ON FUNCTION public.get_bound_match_signals(jsonb,uuid[],text) IS
 'Read-only keyword/semantic bundle validated against the loaded canonical matching sources in one PostgreSQL statement snapshot.';
