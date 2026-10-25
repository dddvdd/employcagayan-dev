-- Versioned canonical representations and dependent dictionary cache invalidation. DEV only.
BEGIN;
CREATE OR REPLACE FUNCTION app.invalidate_dictionary_dependencies(p_dictionary text,p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT entity_type,entity_id FROM (
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_skills c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='skills' AND c.skill_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_occupation_preferences c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='occupations' AND c.occupation_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_certifications c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='certifications' AND c.certification_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_languages c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='languages' AND c.language_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_education c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='education_levels' AND c.education_level_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_industry_preferences c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='industries' AND c.industry_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_employment_type_preferences c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='employment_types' AND c.employment_type_id=ANY(p_ids)
 UNION ALL
 SELECT 'jobseeker_profile'::public.entity_type AS entity_type,jp.participant_id AS entity_id FROM public.jobseeker_work_arrangement_preferences c JOIN public.jobseeker_profiles jp ON jp.participant_id=c.jobseeker_profile_id WHERE p_dictionary='work_arrangements' AND c.work_arrangement_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_skills c JOIN public.vacancy_definitions vd ON vd.id=c.vacancy_definition_id WHERE p_dictionary='skills' AND c.skill_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_certification_requirements c JOIN public.vacancy_definitions vd ON vd.id=c.vacancy_definition_id WHERE p_dictionary='certifications' AND c.certification_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_language_requirements c JOIN public.vacancy_definitions vd ON vd.id=c.vacancy_definition_id WHERE p_dictionary='languages' AND c.language_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_education_requirements c JOIN public.vacancy_definitions vd ON vd.id=c.vacancy_definition_id WHERE p_dictionary='education_levels' AND c.education_level_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_experience_requirements c JOIN public.vacancy_definitions vd ON vd.id=c.vacancy_definition_id WHERE p_dictionary='occupations' AND c.occupation_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_experience_requirements c JOIN public.vacancy_definitions vd ON vd.id=c.vacancy_definition_id WHERE p_dictionary='industries' AND c.industry_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_definitions c JOIN public.vacancy_definitions vd ON vd.id=c.id WHERE p_dictionary='occupations' AND c.occupation_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_definitions c JOIN public.vacancy_definitions vd ON vd.id=c.id WHERE p_dictionary='industries' AND c.industry_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_definitions c JOIN public.vacancy_definitions vd ON vd.id=c.id WHERE p_dictionary='employment_types' AND c.employment_type_id=ANY(p_ids)
 UNION ALL
 SELECT 'vacancy'::public.entity_type AS entity_type,vd.id AS entity_id FROM public.vacancy_definitions c JOIN public.vacancy_definitions vd ON vd.id=c.id WHERE p_dictionary='work_arrangements' AND c.work_arrangement_id=ANY(p_ids)
 ) AS affected ORDER BY entity_type,entity_id LOOP
  INSERT INTO app.embedding_source_revisions(entity_type,entity_id,revision) VALUES(r.entity_type,r.entity_id,1)
   ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=embedding_source_revisions.revision+1;
  UPDATE public.employment_embeddings SET status='stale',updated_at=now()
   WHERE entity_type=r.entity_type AND entity_id=r.entity_id AND status='current';
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION app.invalidate_dictionary_dependencies(text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.invalidate_embedding_dictionary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old jsonb;v_new jsonb;v_ids uuid[]:='{}';r record;v_dictionary text;
BEGIN
 IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN v_new:=to_jsonb(NEW);END IF;
 IF TG_OP='UPDATE' AND (v_old-ARRAY['created_at','updated_at']) IS NOT DISTINCT FROM (v_new-ARRAY['created_at','updated_at']) THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='taxonomy_mappings' THEN
  FOR r IN SELECT DISTINCT entity_type,entity_id FROM (
   SELECT v_old->>'entity_type' AS entity_type,(v_old->>'entity_id')::uuid AS entity_id
   UNION SELECT v_new->>'entity_type',(v_new->>'entity_id')::uuid
  ) AS mappings WHERE entity_id IS NOT NULL LOOP
   v_dictionary:=CASE r.entity_type WHEN 'occupation' THEN 'occupations' WHEN 'skill' THEN 'skills' WHEN 'industry' THEN 'industries' WHEN 'certification' THEN 'certifications' WHEN 'language' THEN 'languages' WHEN 'education_level' THEN 'education_levels' ELSE NULL END;
   IF v_dictionary IS NOT NULL THEN PERFORM app.invalidate_dictionary_dependencies(v_dictionary,ARRAY[r.entity_id]);END IF;
  END LOOP;
 ELSIF TG_TABLE_NAME='taxonomy_sources' THEN
  FOR r IN SELECT entity_type,array_agg(DISTINCT entity_id) AS ids FROM public.taxonomy_mappings
   WHERE taxonomy_source_id=COALESCE((v_new->>'id')::uuid,(v_old->>'id')::uuid) GROUP BY entity_type LOOP
   v_dictionary:=CASE r.entity_type WHEN 'occupation' THEN 'occupations' WHEN 'skill' THEN 'skills' WHEN 'industry' THEN 'industries' WHEN 'certification' THEN 'certifications' WHEN 'language' THEN 'languages' WHEN 'education_level' THEN 'education_levels' ELSE NULL END;
   IF v_dictionary IS NOT NULL THEN PERFORM app.invalidate_dictionary_dependencies(v_dictionary,r.ids);END IF;
  END LOOP;
 ELSE
  IF v_old IS NOT NULL THEN v_ids:=array_append(v_ids,(v_old->>'id')::uuid);END IF;
  IF v_new IS NOT NULL THEN v_ids:=array_append(v_ids,(v_new->>'id')::uuid);END IF;
  PERFORM app.invalidate_dictionary_dependencies(TG_TABLE_NAME,v_ids);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.invalidate_embedding_dictionary() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.skills FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.occupations FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.certifications FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.languages FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.education_levels FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.industries FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.employment_types FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.work_arrangements FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_sources FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE TRIGGER invalidate_embedding_dictionary AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_mappings FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_dictionary();
CREATE OR REPLACE FUNCTION public.get_pair_semantic_similarity(
 p_jobseeker_profile_id uuid,p_vacancy_definition_id uuid,
 p_event_vacancy_id uuid DEFAULT NULL,
 p_jobseeker_embedding_version text DEFAULT 'jobseeker-semantic-v2',
 p_vacancy_embedding_version text DEFAULT 'vacancy-semantic-v2')
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
   coalesce(nullif(v_pair->>'jobseeker_embedding_version',''),'jobseeker-semantic-v2'),
   coalesce(nullif(v_pair->>'vacancy_embedding_version',''),'vacancy-semantic-v2'));
  v_result:=v_result||jsonb_build_array(jsonb_build_object(
   'jobseeker_profile_id',v_pair->>'jobseeker_profile_id','vacancy_id',v_pair->>'vacancy_id')||v_similarity);
 END LOOP;
 RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_semantic_similarities(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_semantic_similarities(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
