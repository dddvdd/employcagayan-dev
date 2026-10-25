-- Reuse identical semantic reads within one authorized, source-bound request only.
-- No durable cache, permission change, source-check shortcut or cross-request reuse.
CREATE OR REPLACE FUNCTION public.get_bound_match_signals(p_pairs jsonb, p_skill_ids uuid[] DEFAULT NULL::uuid[], p_knowledge_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_pair jsonb; v_ids jsonb:='[]'; v_keywords jsonb; v_keyword jsonb; v_result jsonb:='[]';
 v_index integer:=0; v_semantic jsonb; v_base jsonb; v_knowledge jsonb; v_knowledge_changed boolean:=false;
 v_semantic_cache jsonb:='{}'; v_cache_key text;
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
   -- Request-local reuse follows every pair's authorization and current-source checks.
   -- The whole canonical pair includes event, source and model identities.
   v_cache_key:=encode(sha256(convert_to(v_pair::text,'UTF8')),'hex');
   IF v_semantic_cache ? v_cache_key THEN
    v_semantic:=v_semantic_cache->v_cache_key;
   ELSE
   v_semantic:=public.get_pair_semantic_similarity(
    (v_pair->>'jobseeker_profile_id')::uuid,(v_pair->>'vacancy_id')::uuid,(v_pair->>'event_vacancy_id')::uuid,
    v_pair->>'jobseeker_embedding_version',v_pair->>'vacancy_embedding_version');
    v_semantic_cache:=v_semantic_cache||jsonb_build_object(v_cache_key,v_semantic);
   END IF;
   v_result:=v_result||jsonb_build_array(v_base||jsonb_build_object('status','bound',
    'jobseeker_source_hash',v_keyword->>'jobseeker_source_hash','vacancy_source_hash',v_keyword->>'vacancy_source_hash',
    'knowledge_snapshot_hash',p_knowledge_hash,
    'keyword',v_keyword,'semantic',v_semantic));
  END IF;
 END LOOP;
 RETURN v_result;
END $function$
;
