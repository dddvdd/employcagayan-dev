-- DEV-only: vocabulary revision participates in managed extraction identity.
BEGIN;
CREATE TABLE app.extraction_dictionary_revision(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 revision bigint NOT NULL CHECK(revision>0)
);
INSERT INTO app.extraction_dictionary_revision(singleton,revision) VALUES(true,1);
ALTER TABLE app.extraction_dictionary_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.extraction_dictionary_revision FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.advance_extraction_dictionary_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 UPDATE app.extraction_dictionary_revision SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Extraction dictionary revision is unavailable' USING ERRCODE='55000'; END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.advance_extraction_dictionary_revision() FROM PUBLIC,anon,authenticated,service_role;
DO $do$ DECLARE v_table text; BEGIN
 FOREACH v_table IN ARRAY ARRAY['occupations','occupation_aliases','skills','certifications','industries','education_levels','languages'] LOOP
  EXECUTE format('CREATE TRIGGER advance_extraction_dictionary_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION app.advance_extraction_dictionary_revision()',v_table);
 END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION app.lock_extraction_dictionary()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM 1 FROM app.extraction_dictionary_revision WHERE singleton FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Extraction dictionary revision is unavailable' USING ERRCODE='55000'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.lock_extraction_dictionary() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION app.build_extraction_source_snapshot(p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_values jsonb; v_specs jsonb; v_spec jsonb; v_value text; v_segments jsonb:='[]'::jsonb;
 v_dictionary bigint;
 v_text text:=''; v_payload jsonb; v_utf8 bytea; v_extra bigint;
BEGIN
 IF p_entity_type='jobseeker_profile' THEN
  SELECT jsonb_build_object(
   'professional_summary',jp.professional_summary,'career_interests',jp.career_interests,
   'skills',jp.skills,'desired_occupation',jp.desired_occupation,'desired_industry',jp.desired_industry,
   'previous_occupation',jp.previous_occupation,'previous_industry',jp.previous_industry,
   'highest_educational_attainment',jp.highest_educational_attainment,'course_program',jp.course_program)
   INTO v_values FROM public.jobseeker_profiles jp WHERE jp.participant_id=p_entity_id;
  v_specs:='[
   {"field":"professional_summary","label":"Professional summary","intent":"unknown"},
   {"field":"career_interests","label":"Career interests","intent":"preference"},
   {"field":"skills","label":"Reported skills","intent":"unknown"},
   {"field":"desired_occupation","label":"Desired occupation","intent":"preference"},
   {"field":"desired_industry","label":"Desired industry","intent":"preference"},
   {"field":"previous_occupation","label":"Previous occupation","intent":"historical"},
   {"field":"previous_industry","label":"Previous industry","intent":"historical"},
   {"field":"highest_educational_attainment","label":"Reported education","intent":"unknown"},
   {"field":"course_program","label":"Reported course or program","intent":"unknown"}]'::jsonb;
 ELSIF p_entity_type='vacancy' THEN
  SELECT jsonb_build_object('position',vd.position,'job_description',vd.job_description,
   'qualifications',vd.qualifications,'requirements_summary',vd.requirements_summary)
   INTO v_values FROM public.vacancy_definitions vd WHERE vd.id=p_entity_id;
  v_specs:='[
   {"field":"position","label":"Position","intent":"unknown"},
   {"field":"job_description","label":"Job description","intent":"unknown"},
   {"field":"qualifications","label":"Qualifications","intent":"unknown"},
   {"field":"requirements_summary","label":"Requirements summary","intent":"unknown"}]'::jsonb;
 ELSE
  RAISE EXCEPTION 'Employment extraction source is not available' USING ERRCODE='42501';
 END IF;
 IF v_values IS NULL THEN
  RAISE EXCEPTION 'Employment extraction source is not available' USING ERRCODE='42501';
 END IF;
 FOR v_spec IN SELECT value FROM jsonb_array_elements(v_specs) LOOP
  v_value:=btrim(v_values->>(v_spec->>'field'));
  IF v_value IS NULL OR v_value='' THEN CONTINUE; END IF;
  -- Early field bound before assembling the full source; never truncate.
  IF char_length(v_value)>20000 THEN
   RAISE EXCEPTION 'Employment extraction source exceeds the text limit' USING ERRCODE='22001';
  END IF;
  v_segments:=v_segments||jsonb_build_array(v_spec||jsonb_build_object('text',v_value));
  v_text:=v_text||CASE WHEN v_text='' THEN '' ELSE E'\n\n' END||(v_spec->>'label')||': '||v_value;
 END LOOP;
 IF char_length(v_text)>20000 THEN
  RAISE EXCEPTION 'Employment extraction source exceeds the text limit' USING ERRCODE='22001';
 END IF;
 -- Match JavaScript's UTF-16 text.length, including supplementary characters.
 v_utf8:=convert_to(v_text,'UTF8');
 SELECT count(*) INTO v_extra FROM generate_series(0,octet_length(v_utf8)-1) i
  WHERE get_byte(v_utf8,i) BETWEEN 240 AND 244;
 IF char_length(v_text)+v_extra>20000 THEN
  RAISE EXCEPTION 'Employment extraction source exceeds the text limit' USING ERRCODE='22001';
 END IF;
 SELECT revision INTO v_dictionary FROM app.extraction_dictionary_revision WHERE singleton;
 IF v_dictionary IS NULL THEN RAISE EXCEPTION 'Extraction dictionary revision is unavailable' USING ERRCODE='55000'; END IF;
 v_payload:=jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,
  'source_kind','canonical_employment_fields','source_version','employment-extraction-source-v1',
  'source_text',v_text,'source_segments',v_segments,'dictionary_revision',v_dictionary);
 -- Hash the typed segments as well as the text: field/intent boundaries matter.
 RETURN v_payload||jsonb_build_object('source_hash',encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'));
END $fn$;
REVOKE ALL ON FUNCTION app.build_extraction_source_snapshot(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
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
 PERFORM app.lock_extraction_dictionary();
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
 PERFORM app.lock_extraction_dictionary();
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
NOTIFY pgrst,'reload schema';
COMMIT;
