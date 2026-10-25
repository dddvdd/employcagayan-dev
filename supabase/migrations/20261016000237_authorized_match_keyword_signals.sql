-- DEV keyword signals: on-demand full-text search over authorized matching profiles.
-- No persisted personal text, table/RLS changes, provider calls or eligibility decisions.
CREATE OR REPLACE FUNCTION public.get_match_keyword_signals(p_pairs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public SET statement_timeout='8s' AS $fn$
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
   'event_vacancy_id',v_event,'model_version','keyword-fts-v1','text_config','simple','qualification_credit',false)||v_signal);
 END LOOP;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.get_match_keyword_signals(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_match_keyword_signals(jsonb) TO authenticated;
COMMENT ON FUNCTION public.get_match_keyword_signals(jsonb) IS
 'Bounded read-only on-demand keyword signal within existing matching authorization. No persisted text, provider or qualification credit.';
