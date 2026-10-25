-- DEV-only controlled extraction lifecycle. New managed work stays pending until human review.
BEGIN;
ALTER TABLE public.ai_extraction_runs
 ADD COLUMN producer_version text,
 ADD COLUMN source_kind text,
 ADD COLUMN source_version text,
 ADD COLUMN source_hash text,
 ADD COLUMN producing_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_extraction_suggestions ADD COLUMN producer_version text;
CREATE UNIQUE INDEX managed_extraction_source_once ON public.ai_extraction_runs
 (entity_type,entity_id,source_hash,producer_version,extraction_version,provider,model)
 WHERE producer_version IS NOT NULL;
CREATE TABLE app.extraction_work(
 run_id uuid PRIMARY KEY REFERENCES public.ai_extraction_runs(id) ON DELETE CASCADE,
 source_snapshot jsonb NOT NULL,
 actor_claims jsonb NOT NULL,
 lease_token uuid NOT NULL,
 lease_expires_at timestamptz NOT NULL
);
ALTER TABLE app.extraction_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.extraction_work FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.extraction_utf16_length(p_text text)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
DECLARE v_bytes bytea:=convert_to(p_text,'UTF8');v_extra bigint;
BEGIN
 SELECT count(*) INTO v_extra FROM generate_series(0,octet_length(v_bytes)-1) i WHERE get_byte(v_bytes,i) BETWEEN 240 AND 244;
 RETURN char_length(p_text)+v_extra;
END $fn$;
REVOKE ALL ON FUNCTION app.extraction_utf16_length(text) FROM PUBLIC,anon,authenticated,service_role;

-- Invoker context distinguishes direct client writes from guarded owner RPCs.
CREATE OR REPLACE FUNCTION app.guard_managed_extraction()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE v_managed boolean:=false;
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='ai_extraction_runs' THEN
  IF TG_OP<>'INSERT' THEN v_managed:=OLD.producer_version IS NOT NULL; END IF;
  IF TG_OP<>'DELETE' THEN v_managed:=v_managed OR NEW.producer_version IS NOT NULL
   OR NEW.source_kind IS NOT NULL OR NEW.source_version IS NOT NULL OR NEW.source_hash IS NOT NULL OR NEW.producing_user_id IS NOT NULL; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN v_managed:=OLD.producer_version IS NOT NULL; END IF;
  IF TG_OP<>'DELETE' THEN v_managed:=v_managed OR NEW.producer_version IS NOT NULL; END IF;
  IF TG_OP<>'INSERT' THEN
   SELECT v_managed OR EXISTS(SELECT 1 FROM public.ai_extraction_runs WHERE id=OLD.run_id AND producer_version IS NOT NULL) INTO v_managed;
  END IF;
  IF TG_OP<>'DELETE' THEN
   v_managed:=v_managed OR EXISTS(SELECT 1 FROM public.ai_extraction_runs WHERE id=NEW.run_id AND producer_version IS NOT NULL);
  END IF;
 END IF;
 IF v_managed THEN RAISE EXCEPTION 'Managed extraction writes require the controlled workflow' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_managed_extraction() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_managed_extraction_run BEFORE INSERT OR UPDATE OR DELETE ON public.ai_extraction_runs
 FOR EACH ROW EXECUTE FUNCTION app.guard_managed_extraction();
CREATE TRIGGER guard_managed_extraction_suggestion BEFORE INSERT OR UPDATE OR DELETE ON public.ai_extraction_suggestions
 FOR EACH ROW EXECUTE FUNCTION app.guard_managed_extraction();

CREATE OR REPLACE FUNCTION app.lock_extraction_entity(p_type text,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF p_type='jobseeker_profile' THEN
  PERFORM 1 FROM public.jobseeker_profiles WHERE participant_id=p_id FOR SHARE;
 ELSIF p_type='vacancy' THEN
  PERFORM 1 FROM public.vacancy_definitions WHERE id=p_id FOR SHARE;
 ELSE RAISE EXCEPTION 'Employment source is not available' USING ERRCODE='42501';
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employment source is not available' USING ERRCODE='42501'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.lock_extraction_entity(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.begin_ai_extraction(p_entity_type text,p_entity_id uuid,p_source_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_source jsonb; v_run public.ai_extraction_runs; v_work app.extraction_work;
 v_claims jsonb; v_exp numeric; v_nonce uuid; v_deadline timestamptz; v_count integer;
BEGIN
 v_source:=public.get_ai_extraction_source(p_entity_type,p_entity_id);
 IF p_source_hash IS DISTINCT FROM v_source->>'source_hash' THEN
  RAISE EXCEPTION 'Employment source changed; reload before extraction' USING ERRCODE='55000';
 END IF;
 IF v_source->>'source_text'='' THEN RAISE EXCEPTION 'Employment text is required' USING ERRCODE='22023'; END IF;
 -- Serialize the exact managed cache key, then lock source before run/work rows.
 PERFORM pg_advisory_xact_lock(hashtextextended('ai-producer-v1:'||p_entity_type||':'||p_entity_id::text||':'||p_source_hash,0));
 PERFORM app.lock_extraction_entity(p_entity_type,p_entity_id);
 v_source:=public.get_ai_extraction_source(p_entity_type,p_entity_id);
 IF p_source_hash IS DISTINCT FROM v_source->>'source_hash' THEN
  RAISE EXCEPTION 'Employment source changed; reload before extraction' USING ERRCODE='55000';
 END IF;
 SELECT * INTO v_run FROM public.ai_extraction_runs
 WHERE entity_type=p_entity_type AND entity_id=p_entity_id AND source_hash=p_source_hash
  AND producer_version='employment-extraction-producer-v1' AND extraction_version='ai-extraction-v1'
  AND provider='openrouter' AND model='openai/gpt-4o-mini' FOR UPDATE;
 IF v_run.id IS NOT NULL THEN
  SELECT * INTO v_work FROM app.extraction_work WHERE run_id=v_run.id FOR UPDATE;
  IF v_run.status='completed' THEN
   SELECT count(*) INTO v_count FROM public.ai_extraction_suggestions WHERE run_id=v_run.id;
   RETURN jsonb_build_object('run_id',v_run.id,'status','completed','cached',true,'suggestion_count',v_count);
  ELSIF v_run.status='processing' AND v_work.lease_expires_at>clock_timestamp() THEN
   RETURN jsonb_build_object('run_id',v_run.id,'status','processing','cached',true,'retry_after',v_work.lease_expires_at);
  END IF;
 END IF;
 IF jsonb_typeof(auth.jwt()->'exp') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'An unexpired signed session is required' USING ERRCODE='42501';
 END IF;
 v_exp:=(auth.jwt()->>'exp')::numeric;
 IF v_exp<extract(epoch FROM clock_timestamp())+60 THEN
  RAISE EXCEPTION 'Refresh the signed session before extraction' USING ERRCODE='42501';
 END IF;
 IF NOT public.ai_extraction_rate_limit_allow() THEN
  RETURN jsonb_build_object('status','rate_limited','cached',false);
 END IF;
 v_claims:=jsonb_build_object('sub',auth.uid(),'session_id',auth.jwt()->>'session_id','role','authenticated',
  'aal',auth.jwt()->>'aal','amr',auth.jwt()->'amr','exp',auth.jwt()->'exp','iat',auth.jwt()->'iat','iss',auth.jwt()->>'iss');
 v_nonce:=gen_random_uuid();v_deadline:=least(clock_timestamp()+interval '2 minutes',to_timestamp(v_exp::double precision));
 IF v_run.id IS NULL THEN
  INSERT INTO public.ai_extraction_runs(entity_type,entity_id,extraction_type,provider,model,input_hash,status,
   producer_version,source_kind,source_version,source_hash,producing_user_id)
  VALUES(p_entity_type,p_entity_id,CASE WHEN p_entity_type='vacancy' THEN 'requirements' ELSE 'profile' END,
   'openrouter','openai/gpt-4o-mini',p_source_hash,'processing','employment-extraction-producer-v1',
   v_source->>'source_kind',v_source->>'source_version',p_source_hash,auth.uid()) RETURNING * INTO v_run;
 ELSE
  UPDATE public.ai_extraction_runs SET status='processing',failure_reason=NULL,request_count=coalesce(request_count,0)+1,
   producing_user_id=auth.uid(),input_tokens=NULL,output_tokens=NULL,latency_ms=NULL WHERE id=v_run.id RETURNING * INTO v_run;
 END IF;
 INSERT INTO app.extraction_work(run_id,source_snapshot,actor_claims,lease_token,lease_expires_at)
 VALUES(v_run.id,v_source,v_claims,v_nonce,v_deadline)
 ON CONFLICT(run_id) DO UPDATE SET source_snapshot=excluded.source_snapshot,actor_claims=excluded.actor_claims,
  lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
 VALUES(auth.uid(),'ai_extraction_started','ai_extraction_runs',v_run.id,
  jsonb_build_object('status','processing','entity_type',p_entity_type));
 RETURN jsonb_build_object('run_id',v_run.id,'status','processing','cached',false,'lease_token',v_nonce,
  'lease_expires_at',v_deadline,'source',v_source);
END $fn$;
REVOKE ALL ON FUNCTION public.begin_ai_extraction(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_ai_extraction(text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ai_extraction_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_run public.ai_extraction_runs; v_source jsonb; v_count integer;
BEGIN
 PERFORM app.require_intelligence_session();
 IF coalesce(app.current_user_role()::text,'') NOT IN ('admin','staff','supervisor') THEN
  RAISE EXCEPTION 'Extraction run is not available' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_run FROM public.ai_extraction_runs WHERE id=p_run_id AND producer_version IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Extraction run is not available' USING ERRCODE='42501'; END IF;
 BEGIN
  v_source:=public.get_ai_extraction_source(v_run.entity_type,v_run.entity_id);
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'Extraction run is not available' USING ERRCODE='42501';
 END;
 SELECT count(*) INTO v_count FROM public.ai_extraction_suggestions WHERE run_id=v_run.id;
 RETURN jsonb_build_object('run_id',v_run.id,'entity_type',v_run.entity_type,'entity_id',v_run.entity_id,
  'status',v_run.status,'failure_reason',v_run.failure_reason,'source_version',v_run.source_version,
  'source_hash',v_run.source_hash,'source_changed',v_run.source_hash IS DISTINCT FROM v_source->>'source_hash',
  'suggestion_count',v_count,'request_count',v_run.request_count,'producer_version',v_run.producer_version);
END $fn$;
REVOKE ALL ON FUNCTION public.get_ai_extraction_run(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_extraction_run(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION app.extraction_canonical_target(p_type text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_name text;
BEGIN
 IF p_id IS NULL THEN RETURN NULL; END IF;
 CASE p_type
 WHEN 'skill' THEN SELECT canonical_name INTO v_name FROM public.skills WHERE id=p_id AND is_active;
 WHEN 'certification' THEN SELECT canonical_name INTO v_name FROM public.certifications WHERE id=p_id AND is_active;
 WHEN 'occupation','experience_requirement' THEN SELECT canonical_name INTO v_name FROM public.occupations WHERE id=p_id AND is_active;
 WHEN 'industry' THEN SELECT canonical_name INTO v_name FROM public.industries WHERE id=p_id AND is_active;
 WHEN 'education_requirement' THEN SELECT name INTO v_name FROM public.education_levels WHERE id=p_id AND is_active;
 ELSE RETURN NULL;
 END CASE;
 IF v_name IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',p_id,'canonical_name',v_name);
END $fn$;
REVOKE ALL ON FUNCTION app.extraction_canonical_target(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.complete_ai_extraction(
 p_run_id uuid,p_lease_token uuid,p_output jsonb,
 p_input_tokens integer DEFAULT NULL,p_output_tokens integer DEFAULT NULL,p_latency_ms integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_run public.ai_extraction_runs; v_work app.extraction_work; v_source jsonb;
 v_original_claims text:=current_setting('request.jwt.claims',true);
 v_category text; v_type text; v_item jsonb; v_target jsonb; v_candidate jsonb; v_candidates jsonb;
 v_canonical uuid; v_resolution text; v_method text; v_fragment text; v_term text; v_provenance text;
 v_importance text; v_months integer; v_confidence numeric; v_count integer:=0; v_intent text;
 v_historical boolean; v_preference boolean; v_unknown boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Trusted extraction completion is required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_run FROM public.ai_extraction_runs WHERE id=p_run_id AND producer_version='employment-extraction-producer-v1';
 SELECT * INTO v_work FROM app.extraction_work WHERE run_id=p_run_id;
 IF v_run.id IS NULL OR v_work.run_id IS NULL OR v_work.lease_token IS DISTINCT FROM p_lease_token THEN
  RAISE EXCEPTION 'Extraction lease is not available' USING ERRCODE='42501';
 END IF;
 -- Source -> run -> work is the shared lock order used by begin/completion/review.
 PERFORM app.lock_extraction_entity(v_run.entity_type,v_run.entity_id);
 SELECT * INTO v_run FROM public.ai_extraction_runs WHERE id=p_run_id FOR UPDATE;
 SELECT * INTO v_work FROM app.extraction_work WHERE run_id=p_run_id FOR UPDATE;
 IF v_work.lease_token IS DISTINCT FROM p_lease_token OR v_work.lease_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Extraction lease is no longer current' USING ERRCODE='55000';
 END IF;
 IF jsonb_typeof(v_work.actor_claims->'exp') IS DISTINCT FROM 'number'
  OR (v_work.actor_claims->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN
  RAISE EXCEPTION 'Producing session expired' USING ERRCODE='42501';
 END IF;
 -- Delegate only the minimal actual signed claims captured by guarded begin.
 -- No caller-supplied user ID/claims are accepted by this completion interface.
 PERFORM set_config('request.jwt.claims',v_work.actor_claims::text,true);
 v_source:=public.get_ai_extraction_source(v_run.entity_type,v_run.entity_id);
 IF v_source->>'source_hash' IS DISTINCT FROM v_run.source_hash
  OR v_work.source_snapshot->>'source_hash' IS DISTINCT FROM v_run.source_hash
  OR v_work.source_snapshot->>'source_version' IS DISTINCT FROM v_run.source_version THEN
  RAISE EXCEPTION 'Employment source changed during extraction' USING ERRCODE='55000';
 END IF;
 IF v_run.status='completed' THEN
  SELECT count(*) INTO v_count FROM public.ai_extraction_suggestions WHERE run_id=p_run_id;
  PERFORM set_config('request.jwt.claims',coalesce(v_original_claims,'{}'),true);
  RETURN jsonb_build_object('run_id',p_run_id,'status','completed','cached',true,'suggestion_count',v_count);
 END IF;
 IF v_run.status IS DISTINCT FROM 'processing' THEN RAISE EXCEPTION 'Extraction is not processing' USING ERRCODE='55000'; END IF;
 IF (p_input_tokens IS NOT NULL AND p_input_tokens<0) OR (p_output_tokens IS NOT NULL AND p_output_tokens<0)
  OR (p_latency_ms IS NOT NULL AND p_latency_ms<0)
  OR jsonb_typeof(p_output) IS DISTINCT FROM 'object'
  OR p_output->>'extraction_version' IS DISTINCT FROM 'ai-extraction-v1'
  OR octet_length(p_output::text)>128000 THEN
  RAISE EXCEPTION 'Invalid extraction result' USING ERRCODE='22023';
 END IF;
 -- Inserts and final completion are one transaction: a late invalid item rolls all back.
 FOR v_category,v_type IN SELECT * FROM (VALUES
  ('occupations','occupation'),('skills','skill'),('certifications','certification'),
  ('education_requirements','education_requirement'),('experience_requirements','experience_requirement'),
  ('industries','industry')) AS categories(category,kind)
 LOOP
  IF jsonb_typeof(p_output->v_category) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Invalid extraction categories' USING ERRCODE='22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_output->v_category) LOOP
   v_count:=v_count+1;
   IF v_count>100 OR jsonb_typeof(v_item) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_item->'raw_term') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_item->'confidence') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_item->'provenance') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_item->'source_text_fragment') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid extraction proposal' USING ERRCODE='22023';
   END IF;
   v_term:=btrim(v_item->>'raw_term');v_fragment:=v_item->>'source_text_fragment';
   v_confidence:=(v_item->>'confidence')::numeric;v_provenance:=v_item->>'provenance';
   IF v_term='' OR app.extraction_utf16_length(v_item->>'raw_term')>256
    OR btrim(v_fragment)='' OR app.extraction_utf16_length(v_fragment)>2000
    OR strpos(v_work.source_snapshot->>'source_text',v_fragment)=0
    OR v_confidence<0 OR v_confidence>1 OR v_provenance NOT IN ('explicit','inferred','ambiguous') THEN
    RAISE EXCEPTION 'Invalid grounded extraction proposal' USING ERRCODE='22023';
   END IF;
   v_importance:=coalesce(v_item->>'importance','review_required');
   IF v_importance NOT IN ('required','preferred','nice_to_have','review_required') THEN
    RAISE EXCEPTION 'Invalid extraction importance' USING ERRCODE='22023';
   END IF;
   v_months:=NULL;
   IF v_item->'minimum_months' IS NOT NULL AND v_item->'minimum_months'<>'null'::jsonb THEN
    IF jsonb_typeof(v_item->'minimum_months') IS DISTINCT FROM 'number'
     OR (v_item->>'minimum_months')::numeric<0 OR (v_item->>'minimum_months')::numeric>2147483647
     OR mod((v_item->>'minimum_months')::numeric,1)<>0 THEN
     RAISE EXCEPTION 'Invalid extraction experience duration' USING ERRCODE='22023';
    END IF;
    IF v_type='experience_requirement' THEN v_months:=(v_item->>'minimum_months')::integer; END IF;
   END IF;
   v_resolution:=coalesce(v_item->>'resolution_status','UNRESOLVED');
   IF v_resolution NOT IN ('RESOLVED','AMBIGUOUS','UNRESOLVED') THEN
    RAISE EXCEPTION 'Invalid extraction resolution' USING ERRCODE='22023';
   END IF;
   v_canonical:=NULL;v_target:=NULL;
   IF v_item->>'canonical_id' IS NOT NULL THEN
    IF v_item->>'canonical_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
     RAISE EXCEPTION 'Invalid canonical resolution' USING ERRCODE='22023';
    END IF;
    v_canonical:=(v_item->>'canonical_id')::uuid;
    v_target:=app.extraction_canonical_target(v_type,v_canonical);
   END IF;
   IF (v_resolution='RESOLVED' AND v_target IS NULL)
    OR (v_resolution<>'RESOLVED' AND v_canonical IS NOT NULL) THEN
    RAISE EXCEPTION 'Canonical resolution requires an active valid target' USING ERRCODE='22023';
   END IF;
   v_candidates:='[]'::jsonb;
   IF v_item->'candidate_matches' IS NOT NULL AND v_item->'candidate_matches'<>'null'::jsonb THEN
    IF jsonb_typeof(v_item->'candidate_matches') IS DISTINCT FROM 'array' OR jsonb_array_length(v_item->'candidate_matches')>25 THEN
     RAISE EXCEPTION 'Invalid resolution candidates' USING ERRCODE='22023';
    END IF;
    FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_item->'candidate_matches') LOOP
     IF jsonb_typeof(v_candidate) IS DISTINCT FROM 'object'
      OR coalesce(v_candidate->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid resolution candidate' USING ERRCODE='22023';
     END IF;
     IF app.extraction_canonical_target(v_type,(v_candidate->>'id')::uuid) IS NULL THEN
      RAISE EXCEPTION 'Resolution candidate is not active' USING ERRCODE='22023';
     END IF;
     v_candidates:=v_candidates||jsonb_build_array(app.extraction_canonical_target(v_type,(v_candidate->>'id')::uuid));
    END LOOP;
   END IF;
   v_method:=coalesce(v_item->>'resolution_method','no_match');
   IF char_length(v_method)>64 THEN RAISE EXCEPTION 'Invalid resolution method' USING ERRCODE='22023'; END IF;
   -- Source intent comes from captured typed segments, never a model field.
   SELECT coalesce(bool_or(s->>'intent'='historical'),false),
    coalesce(bool_or(s->>'intent'='preference'),false),coalesce(bool_or(s->>'intent'='unknown'),false)
   INTO v_historical,v_preference,v_unknown FROM jsonb_array_elements(v_work.source_snapshot->'source_segments') s
   WHERE strpos((s->>'label')||': '||(s->>'text'),v_fragment)>0;
   v_intent:=CASE WHEN v_preference AND NOT v_historical AND NOT v_unknown THEN 'preference'
    WHEN v_historical AND NOT v_preference AND NOT v_unknown THEN 'historical' ELSE 'unknown' END;
   INSERT INTO public.ai_extraction_suggestions(run_id,entity_type,entity_id,suggestion_type,raw_term,
    confidence,provenance,source_text_fragment,resolution_status,canonical_id,canonical_name,candidate_matches,
    resolution_method,review_status,reviewed_by,reviewed_at,source_intent,importance,minimum_months,producer_version)
   VALUES(p_run_id,v_run.entity_type,v_run.entity_id,v_type,v_term,v_confidence,v_provenance,v_fragment,
    v_resolution,v_canonical,v_target->>'canonical_name',v_candidates,v_method,'pending',NULL,NULL,
    v_intent,v_importance,v_months,v_run.producer_version);
  END LOOP;
 END LOOP;
 UPDATE public.ai_extraction_runs SET status='completed',failure_reason=NULL,input_tokens=p_input_tokens,
  output_tokens=p_output_tokens,latency_ms=p_latency_ms WHERE id=p_run_id;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
 VALUES(auth.uid(),'ai_extraction_completed','ai_extraction_runs',p_run_id,
  jsonb_build_object('status','completed','suggestion_count',v_count,'entity_type',v_run.entity_type));
 PERFORM set_config('request.jwt.claims',coalesce(v_original_claims,'{}'),true);
 RETURN jsonb_build_object('run_id',p_run_id,'status','completed','cached',false,'suggestion_count',v_count);
END $fn$;
REVOKE ALL ON FUNCTION public.complete_ai_extraction(uuid,uuid,jsonb,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_extraction(uuid,uuid,jsonb,integer,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.fail_ai_extraction(p_run_id uuid,p_lease_token uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_run public.ai_extraction_runs; v_work app.extraction_work; v_actor uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Trusted extraction completion is required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_run FROM public.ai_extraction_runs WHERE id=p_run_id AND producer_version='employment-extraction-producer-v1' FOR UPDATE;
 SELECT * INTO v_work FROM app.extraction_work WHERE run_id=p_run_id FOR UPDATE;
 IF v_run.id IS NULL OR v_work.run_id IS NULL OR v_work.lease_token IS DISTINCT FROM p_lease_token THEN
  RAISE EXCEPTION 'Extraction lease is not available' USING ERRCODE='42501';
 END IF;
 IF v_run.status='completed' THEN RETURN jsonb_build_object('run_id',p_run_id,'status','completed'); END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('provider_error','invalid_output','source_changed','session_expired','authorization_changed','lease_expired') THEN
  RAISE EXCEPTION 'Invalid extraction failure classification' USING ERRCODE='22023';
 END IF;
 UPDATE public.ai_extraction_runs SET status='failed',failure_reason=p_reason WHERE id=p_run_id;
 UPDATE app.extraction_work SET lease_expires_at=clock_timestamp() WHERE run_id=p_run_id;
 SELECT id INTO v_actor FROM public.profiles WHERE id=(v_work.actor_claims->>'sub')::uuid;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
 VALUES(v_actor,'ai_extraction_failed','ai_extraction_runs',p_run_id,
  jsonb_build_object('status','failed','failure_reason',p_reason));
 RETURN jsonb_build_object('run_id',p_run_id,'status','failed','failure_reason',p_reason);
END $fn$;
REVOKE ALL ON FUNCTION public.fail_ai_extraction(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fail_ai_extraction(uuid,uuid,text) TO service_role;

-- Freshness is checked only for consequential acceptance/editing; authorized
-- reviewers may still reject obsolete proposals.
CREATE OR REPLACE FUNCTION app.require_ai_suggestion_freshness(p_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_run public.ai_extraction_runs; v_source jsonb;
BEGIN
 SELECT r.* INTO v_run FROM public.ai_extraction_runs r
 JOIN public.ai_extraction_suggestions s ON s.run_id=r.id WHERE s.id=p_id;
 IF v_run.producer_version IS NULL THEN RETURN; END IF;
 PERFORM app.lock_extraction_entity(v_run.entity_type,v_run.entity_id);
 v_source:=app.build_extraction_source_snapshot(v_run.entity_type,v_run.entity_id);
 IF v_run.status IS DISTINCT FROM 'completed' OR v_source->>'source_hash' IS DISTINCT FROM v_run.source_hash THEN
  RAISE EXCEPTION 'Employment details changed; generate new suggestions before accepting' USING ERRCODE='55000';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_ai_suggestion_freshness(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.list_pending_suggestions_v2(
 p_entity_type text DEFAULT NULL,p_entity_id uuid DEFAULT NULL,p_resolution_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_result jsonb;
BEGIN
 PERFORM app.require_intelligence_session();
 SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('producer_version',s.producer_version) ORDER BY p.created_at DESC),'[]'::jsonb)
 INTO v_result FROM public.list_pending_suggestions(p_entity_type,p_entity_id,p_resolution_status) p
 JOIN public.ai_extraction_suggestions s ON s.id=p.id;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.list_pending_suggestions_v2(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_suggestions_v2(text,uuid,text) TO authenticated;
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
 PERFORM app.require_ai_suggestion_freshness(p_suggestion_id);
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
          v_suggestion.producer_version IS NULL
          AND v_suggestion.source_intent = 'unknown'
          AND v_suggestion.provenance = 'explicit'
          AND v_suggestion.source_text_fragment IS NOT NULL
          AND NOT (
            v_suggestion.source_text_fragment ~* '\y(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\y'
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
          v_suggestion.producer_version IS NULL
          AND v_suggestion.source_intent = 'unknown'
          AND v_suggestion.provenance = 'explicit'
          AND v_suggestion.source_text_fragment IS NOT NULL
          AND NOT (
            v_suggestion.source_text_fragment ~* '\y(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\y'
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
 PERFORM app.require_ai_suggestion_freshness(p_suggestion_id);
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
NOTIFY pgrst,'reload schema';
COMMIT;
