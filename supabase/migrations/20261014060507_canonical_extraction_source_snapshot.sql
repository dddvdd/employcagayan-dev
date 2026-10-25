-- DEV-only: bounded, authorized canonical employment text for extraction previews.
BEGIN;
CREATE OR REPLACE FUNCTION app.build_extraction_source_snapshot(p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_values jsonb; v_specs jsonb; v_spec jsonb; v_value text; v_segments jsonb:='[]'::jsonb;
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
 v_payload:=jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,
  'source_kind','canonical_employment_fields','source_version','employment-extraction-source-v1',
  'source_text',v_text,'source_segments',v_segments);
 -- Hash the typed segments as well as the text: field/intent boundaries matter.
 RETURN v_payload||jsonb_build_object('source_hash',encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'));
END $fn$;
REVOKE ALL ON FUNCTION app.build_extraction_source_snapshot(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_ai_extraction_source(p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM app.require_intelligence_session();
 IF coalesce(app.current_user_role()::text,'') NOT IN ('admin','staff','supervisor')
   OR p_entity_type IS NULL OR p_entity_id IS NULL
   OR p_entity_type NOT IN ('jobseeker_profile','vacancy')
   OR NOT coalesce(app.intelligence_entity_authorized(p_entity_type,p_entity_id),false) THEN
  RAISE EXCEPTION 'Employment extraction source is not available' USING ERRCODE='42501';
 END IF;
 RETURN app.build_extraction_source_snapshot(p_entity_type,p_entity_id);
END $fn$;
REVOKE ALL ON FUNCTION public.get_ai_extraction_source(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_extraction_source(text,uuid) TO authenticated;
COMMIT;
