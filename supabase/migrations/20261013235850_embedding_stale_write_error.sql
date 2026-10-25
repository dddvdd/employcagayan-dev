-- Use a non-retryable state error for obsolete derived-source writes. DEV only.
BEGIN;
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
  RAISE EXCEPTION 'Embedding source changed; regenerate from current source' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.store_current_embedding(p_record jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_type public.entity_type:=(p_record->>'entity_type')::public.entity_type;
 v_id uuid:=(p_record->>'entity_id')::uuid; v_revision bigint; v_row public.employment_embeddings;
 v_vector extensions.vector;
BEGIN
 PERFORM public.get_embedding_source_revision(v_type,v_id);
 SELECT revision INTO v_revision FROM app.embedding_source_revisions WHERE entity_type=v_type AND entity_id=v_id FOR UPDATE;
 IF p_expected_revision IS DISTINCT FROM v_revision THEN
  RAISE EXCEPTION 'Embedding source changed; regenerate from current source' USING ERRCODE='55000';
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

REVOKE ALL ON FUNCTION app.guard_current_embedding_revision() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.store_current_embedding(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_current_embedding(jsonb,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
