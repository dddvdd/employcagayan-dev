-- Authorized numeric semantic results. Raw vectors and source text remain private.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_pair_semantic_similarity(
 p_jobseeker_profile_id uuid,p_vacancy_definition_id uuid,
 p_event_vacancy_id uuid DEFAULT NULL,
 p_jobseeker_embedding_version text DEFAULT 'jobseeker-semantic-v1',
 p_vacancy_embedding_version text DEFAULT 'vacancy-semantic-v1')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_job public.employment_embeddings; v_vac public.employment_embeddings;
 v_job_exists boolean; v_role public.user_role; v_similarity double precision;
 v_version text:='semantic-v2-authorized/'||p_jobseeker_embedding_version||'+'||p_vacancy_embedding_version;
BEGIN
 PERFORM app.require_intelligence_session();
 v_role:=app.current_user_role();
 IF v_role='employer' AND NOT EXISTS(
  SELECT 1 FROM public.vacancy_definitions vd JOIN public.employers e ON e.id=vd.employer_id
  WHERE vd.id=p_vacancy_definition_id AND e.registered_user_id=auth.uid() AND e.is_active AND e.registration_status='approved'
 ) THEN RAISE EXCEPTION 'Not authorized for this semantic pair' USING ERRCODE='42501'; END IF;
 IF p_event_vacancy_id IS NOT NULL AND v_role='supervisor' AND NOT EXISTS(
  SELECT 1 FROM public.event_vacancies WHERE id=p_event_vacancy_id AND vacancy_definition_id=p_vacancy_definition_id
   AND public.supervisor_can_view_event(event_id)
 ) THEN RAISE EXCEPTION 'Not authorized for this event context' USING ERRCODE='42501'; END IF;
 -- Existing canonical profile and vacancy authorization runs before metadata lookup.
 IF public.get_jobseeker_match_profile(p_jobseeker_profile_id) IS NULL
  OR public.get_vacancy_match_profile(p_vacancy_definition_id,p_event_vacancy_id) IS NULL THEN
  RAISE EXCEPTION 'Not authorized for this semantic pair' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_job FROM public.employment_embeddings
 WHERE entity_type='jobseeker_profile' AND entity_id=p_jobseeker_profile_id
  AND embedding_type='jobseeker_match_profile' AND embedding_version=p_jobseeker_embedding_version;
 v_job_exists:=FOUND;
 SELECT * INTO v_vac FROM public.employment_embeddings
 WHERE entity_type='vacancy' AND entity_id=p_vacancy_definition_id
  AND embedding_type='vacancy_match_profile' AND embedding_version=p_vacancy_embedding_version;
 IF NOT v_job_exists OR NOT FOUND THEN
  RETURN jsonb_build_object('status','missing','similarity',NULL,'embedding_version',v_version);
 END IF;
 IF v_job.status='failed' OR v_vac.status='failed' THEN
  RETURN jsonb_build_object('status','failed','similarity',NULL,'embedding_version',v_version);
 END IF;
 IF v_job.status='stale' OR v_vac.status='stale' THEN
  RETURN jsonb_build_object('status','stale','similarity',NULL,'embedding_version',v_version);
 END IF;
 IF v_job.status<>'current' OR v_vac.status<>'current' OR v_job.embedding IS NULL OR v_vac.embedding IS NULL THEN
  RETURN jsonb_build_object('status','missing','similarity',NULL,'embedding_version',v_version);
 END IF;
 IF v_job.provider IS DISTINCT FROM v_vac.provider OR v_job.model IS DISTINCT FROM v_vac.model
  OR v_job.dimensions IS DISTINCT FROM v_vac.dimensions OR v_job.dimensions<>1536 THEN
  RETURN jsonb_build_object('status','failed','similarity',NULL,'embedding_version',v_version);
 END IF;
 v_similarity:=1-(v_job.embedding OPERATOR(extensions.<=>) v_vac.embedding);
 IF v_similarity IS NULL OR v_similarity::text IN ('NaN','Infinity','-Infinity') THEN
  RETURN jsonb_build_object('status','failed','similarity',NULL,'embedding_version',v_version);
 END IF;
 RETURN jsonb_build_object('status','available','similarity',least(1.0,greatest(-1.0,v_similarity)),'embedding_version',v_version);
END $fn$;
REVOKE ALL ON FUNCTION public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_semantic_similarities(p_pairs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_pair jsonb; v_result jsonb:='[]'::jsonb; v_similarity jsonb;
BEGIN
 PERFORM app.require_intelligence_session();
 IF jsonb_typeof(p_pairs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pairs)>100 THEN
  RAISE EXCEPTION 'Provide at most 100 semantic pairs' USING ERRCODE='22023';
 END IF;
 FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
  IF jsonb_typeof(v_pair) IS DISTINCT FROM 'object'
   OR jsonb_typeof(v_pair->'jobseeker_profile_id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v_pair->'vacancy_id') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Provide canonical semantic pair identifiers' USING ERRCODE='22023';
  END IF;
  v_similarity:=public.get_pair_semantic_similarity(
   (v_pair->>'jobseeker_profile_id')::uuid,(v_pair->>'vacancy_id')::uuid,
   NULLIF(v_pair->>'event_vacancy_id','')::uuid,
   coalesce(nullif(v_pair->>'jobseeker_embedding_version',''),'jobseeker-semantic-v1'),
   coalesce(nullif(v_pair->>'vacancy_embedding_version',''),'vacancy-semantic-v1'));
  v_result:=v_result||jsonb_build_array(jsonb_build_object(
   'jobseeker_profile_id',v_pair->>'jobseeker_profile_id','vacancy_id',v_pair->>'vacancy_id')||v_similarity);
 END LOOP;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.get_semantic_similarities(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_semantic_similarities(jsonb) TO authenticated;
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

  RETURN v_result;
END
$function$
;
NOTIFY pgrst,'reload schema';
COMMIT;
