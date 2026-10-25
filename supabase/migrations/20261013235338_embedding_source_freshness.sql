-- Derived embedding freshness and compare-and-set worker writes. DEV only.
BEGIN;
CREATE TABLE app.embedding_source_revisions(
 entity_type public.entity_type NOT NULL CHECK(entity_type IN ('jobseeker_profile','vacancy')),
 entity_id uuid NOT NULL, revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 PRIMARY KEY(entity_type,entity_id));
ALTER TABLE app.embedding_source_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.embedding_source_revisions FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.employment_embeddings ADD COLUMN source_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION app.invalidate_embedding_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old jsonb; v_new jsonb; v_id uuid; v_ids uuid[]:='{}';
 v_type public.entity_type:=TG_ARGV[0]::public.entity_type; v_key text:=TG_ARGV[1];
 v_parent boolean:=TG_TABLE_NAME IN ('jobseeker_profiles','vacancy_definitions');
BEGIN
 IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN v_new:=to_jsonb(NEW); END IF;
 IF v_old IS NOT NULL THEN v_ids:=array_append(v_ids,(v_old->>v_key)::uuid); END IF;
 IF v_new IS NOT NULL THEN v_ids:=array_append(v_ids,(v_new->>v_key)::uuid); END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='jobseeker_profiles' THEN
   SELECT jsonb_object_agg(key,value) INTO v_old FROM jsonb_each(v_old) WHERE key=ANY(ARRAY[
    'highest_educational_attainment','years_of_experience','skills','desired_occupation','desired_industry',
    'province','municipality_city','willing_to_relocate','availability_status','available_start_date',
    'preferred_shift','desired_salary_min','desired_salary_max','desired_salary_currency','desired_salary_period',
    'career_interests','professional_summary','participant_id']);
   SELECT jsonb_object_agg(key,value) INTO v_new FROM jsonb_each(v_new) WHERE key=ANY(ARRAY[
    'highest_educational_attainment','years_of_experience','skills','desired_occupation','desired_industry',
    'province','municipality_city','willing_to_relocate','availability_status','available_start_date',
    'preferred_shift','desired_salary_min','desired_salary_max','desired_salary_currency','desired_salary_period',
    'career_interests','professional_summary','participant_id']);
  ELSE
   v_old:=v_old-ARRAY['id','created_at','updated_at'];
   v_new:=v_new-ARRAY['id','created_at','updated_at'];
  END IF;
  IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;
 END IF;
 FOR v_id IN SELECT DISTINCT value FROM unnest(v_ids) AS ids(value) WHERE value IS NOT NULL LOOP
  IF (TG_OP='DELETE' AND v_parent)
   OR (v_type='jobseeker_profile' AND NOT EXISTS(SELECT 1 FROM public.jobseeker_profiles WHERE participant_id=v_id))
   OR (v_type='vacancy' AND NOT EXISTS(SELECT 1 FROM public.vacancy_definitions WHERE id=v_id)) THEN
   DELETE FROM public.employment_embeddings WHERE entity_type=v_type AND entity_id=v_id;
   DELETE FROM app.embedding_source_revisions WHERE entity_type=v_type AND entity_id=v_id;
  ELSE
   INSERT INTO app.embedding_source_revisions(entity_type,entity_id,revision) VALUES(v_type,v_id,1)
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=embedding_source_revisions.revision+1;
   UPDATE public.employment_embeddings SET status='stale',updated_at=now()
    WHERE entity_type=v_type AND entity_id=v_id AND status='current';
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.invalidate_embedding_source() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_embedding_source_revision(p_entity_type public.entity_type,p_entity_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_revision bigint;
BEGIN
 IF NOT ((p_entity_type='jobseeker_profile' AND EXISTS(SELECT 1 FROM public.jobseeker_profiles WHERE participant_id=p_entity_id))
  OR (p_entity_type='vacancy' AND EXISTS(SELECT 1 FROM public.vacancy_definitions WHERE id=p_entity_id))) THEN
  RAISE EXCEPTION 'Canonical embedding source does not exist' USING ERRCODE='22023';
 END IF;
 INSERT INTO app.embedding_source_revisions(entity_type,entity_id) VALUES(p_entity_type,p_entity_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO v_revision FROM app.embedding_source_revisions WHERE entity_type=p_entity_type AND entity_id=p_entity_id;
 RETURN v_revision;
END $fn$;
REVOKE ALL ON FUNCTION public.get_embedding_source_revision(public.entity_type,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_embedding_source_revision(public.entity_type,uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.guard_current_embedding_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_revision bigint;
BEGIN
 IF NEW.entity_type NOT IN ('jobseeker_profile','vacancy') OR NEW.status<>'current' THEN RETURN NEW; END IF;
 v_revision:=public.get_embedding_source_revision(NEW.entity_type,NEW.entity_id);
 -- Coordinate with source edits, including edits during an in-flight generation.
 SELECT revision INTO v_revision FROM app.embedding_source_revisions
  WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id FOR UPDATE;
 IF NEW.source_revision IS DISTINCT FROM v_revision THEN
  RAISE EXCEPTION 'Embedding source changed; regenerate from current source' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_current_embedding_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_current_embedding_revision BEFORE INSERT OR UPDATE ON public.employment_embeddings
 FOR EACH ROW EXECUTE FUNCTION app.guard_current_embedding_revision();

CREATE OR REPLACE FUNCTION public.store_current_embedding(p_record jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_type public.entity_type:=(p_record->>'entity_type')::public.entity_type;
 v_id uuid:=(p_record->>'entity_id')::uuid; v_revision bigint; v_row public.employment_embeddings;
 v_vector extensions.vector;
BEGIN
 PERFORM public.get_embedding_source_revision(v_type,v_id);
 SELECT revision INTO v_revision FROM app.embedding_source_revisions WHERE entity_type=v_type AND entity_id=v_id FOR UPDATE;
 IF p_expected_revision IS DISTINCT FROM v_revision THEN
  RAISE EXCEPTION 'Embedding source changed; regenerate from current source' USING ERRCODE='40001';
 END IF;
 IF (v_type='jobseeker_profile' AND p_record->>'embedding_type' IS DISTINCT FROM 'jobseeker_match_profile')
  OR (v_type='vacancy' AND p_record->>'embedding_type' IS DISTINCT FROM 'vacancy_match_profile')
  OR (p_record->>'dimensions')::integer IS DISTINCT FROM 1536
  OR nullif(p_record->>'embedding_version','') IS NULL
  OR nullif(p_record->>'source_hash','') IS NULL THEN
  RAISE EXCEPTION 'Invalid canonical embedding metadata' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_record->'embedding') IS DISTINCT FROM 'array'
  OR nullif(p_record->>'provider','') IS NULL OR nullif(p_record->>'model','') IS NULL THEN
  RAISE EXCEPTION 'Invalid embedding result' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'embedding') AS e(value) WHERE jsonb_typeof(value)<>'number') THEN
  RAISE EXCEPTION 'Embedding values must be numeric' USING ERRCODE='22023';
 END IF;
 v_vector:=(p_record->'embedding')::text::extensions.vector;
 IF extensions.vector_dims(v_vector)<>1536 THEN
  RAISE EXCEPTION 'Embedding requires 1536 dimensions' USING ERRCODE='22023';
 END IF;
 IF (v_vector OPERATOR(extensions.<#>) v_vector)>=0 THEN
  RAISE EXCEPTION 'Embedding vector must be nonzero' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.employment_embeddings(entity_type,entity_id,embedding_type,embedding_version,
  source_text,source_hash,embedding,provider,model,dimensions,status,generated_at,source_revision)
 VALUES(v_type,v_id,(p_record->>'embedding_type')::public.embedding_type,p_record->>'embedding_version',
  p_record->>'source_text',p_record->>'source_hash',v_vector,
  p_record->>'provider',p_record->>'model',1536,'current',now(),v_revision)
 ON CONFLICT(entity_type,entity_id,embedding_type,embedding_version) DO UPDATE SET
  source_text=EXCLUDED.source_text,source_hash=EXCLUDED.source_hash,embedding=EXCLUDED.embedding,
  provider=EXCLUDED.provider,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,
  status='current',generated_at=now(),updated_at=now(),source_revision=v_revision
 RETURNING * INTO v_row;
 RETURN jsonb_build_object('id',v_row.id,'status',v_row.status,'source_revision',v_revision,'persisted',true,
  'provider',v_row.provider,'model',v_row.model,'dimensions',v_row.dimensions,'source_hash',v_row.source_hash);
END $fn$;
REVOKE ALL ON FUNCTION public.store_current_embedding(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_current_embedding(jsonb,bigint) TO service_role;
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_profiles FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','participant_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_education FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_skills FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_certifications FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_languages FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.work_experiences FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','participant_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_occupation_preferences FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_industry_preferences FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_employment_type_preferences FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_work_arrangement_preferences FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.jobseeker_location_preferences FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('jobseeker_profile','jobseeker_profile_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.vacancy_definitions FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('vacancy','id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.vacancy_skills FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('vacancy','vacancy_definition_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.vacancy_education_requirements FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('vacancy','vacancy_definition_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.vacancy_certification_requirements FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('vacancy','vacancy_definition_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.vacancy_language_requirements FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('vacancy','vacancy_definition_id');
CREATE TRIGGER invalidate_embedding_source AFTER INSERT OR UPDATE OR DELETE ON public.vacancy_experience_requirements FOR EACH ROW EXECUTE FUNCTION app.invalidate_embedding_source('vacancy','vacancy_definition_id');
NOTIFY pgrst,'reload schema';
COMMIT;
