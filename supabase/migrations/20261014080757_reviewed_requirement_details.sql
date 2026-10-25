-- DEV-only: atomic human correction of vacancy requirement details.
BEGIN;
CREATE OR REPLACE FUNCTION public.edit_ai_requirement_suggestion(
 p_suggestion_id uuid,p_edited_term text,p_edited_canonical_id uuid,
 p_importance text,p_minimum_months integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_suggestion public.ai_extraction_suggestions; v_result jsonb;
BEGIN
 PERFORM app.require_ai_suggestion_review(p_suggestion_id);
 PERFORM app.require_ai_suggestion_freshness(p_suggestion_id);
 SELECT * INTO v_suggestion FROM public.ai_extraction_suggestions WHERE id=p_suggestion_id FOR UPDATE;
 IF v_suggestion.review_status IS DISTINCT FROM 'pending' THEN
  RETURN jsonb_build_object('error','Already reviewed','current_status',v_suggestion.review_status);
 END IF;
 IF v_suggestion.entity_type IS DISTINCT FROM 'vacancy'
  OR v_suggestion.suggestion_type NOT IN ('skill','certification','education_requirement','experience_requirement','language') THEN
  RAISE EXCEPTION 'Only vacancy requirements have these review details' USING ERRCODE='22023';
 END IF;
 IF p_importance IS NULL OR p_importance NOT IN ('required','preferred')
  OR p_edited_term IS NULL OR btrim(p_edited_term)='' OR app.extraction_utf16_length(p_edited_term)>256
  OR p_edited_canonical_id IS NULL THEN
  RAISE EXCEPTION 'A reviewed term, target and requirement priority are required' USING ERRCODE='22023';
 END IF;
 IF v_suggestion.suggestion_type='experience_requirement' THEN
  IF p_minimum_months IS NULL OR p_minimum_months<0 THEN
   RAISE EXCEPTION 'Minimum experience must be a whole nonnegative number of months' USING ERRCODE='22023';
  END IF;
 ELSIF p_minimum_months IS NOT NULL THEN
  RAISE EXCEPTION 'Minimum months apply only to experience requirements' USING ERRCODE='22023';
 END IF;
 BEGIN
  UPDATE public.ai_extraction_suggestions SET importance=p_importance,
   minimum_months=CASE WHEN v_suggestion.suggestion_type='experience_requirement' THEN p_minimum_months ELSE minimum_months END
  WHERE id=p_suggestion_id;
  -- Existing edit/accept keeps all active-target, actor, source and provenance gates.
  v_result:=public.edit_ai_suggestion(p_suggestion_id,btrim(p_edited_term),p_edited_canonical_id);
  IF v_result->>'success' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Review correction was not accepted' USING ERRCODE='P4A01';
  END IF;
 EXCEPTION WHEN SQLSTATE 'P4A01' THEN
  RETURN v_result; -- subtransaction rolls back details and any consequential writes.
 END;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.edit_ai_requirement_suggestion(uuid,text,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.edit_ai_requirement_suggestion(uuid,text,uuid,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
