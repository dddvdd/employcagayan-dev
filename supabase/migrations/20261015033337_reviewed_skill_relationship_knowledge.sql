-- DEV-only: reviewed skill knowledge, separate from personal qualifications.
BEGIN;
CREATE TABLE public.skill_relationships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
 target_skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
 relationship_type text NOT NULL CHECK(relationship_type IN ('related','transferable')),
 taxonomy_source_id uuid REFERENCES public.taxonomy_sources(id) ON DELETE RESTRICT,
 source_version text,
 evidence_reference text,
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_skill_id<>target_skill_id),
 CHECK(relationship_type<>'related' OR source_skill_id<target_skill_id),
 UNIQUE(source_skill_id,target_skill_id,relationship_type)
);
CREATE INDEX skill_relationships_target_idx ON public.skill_relationships(target_skill_id);
ALTER TABLE public.skill_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.skill_relationships FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.skill_relationships TO authenticated,service_role;
CREATE POLICY "Skill knowledge readable" ON public.skill_relationships FOR SELECT TO authenticated USING(true);
CREATE POLICY "Administrators manage skill knowledge" ON public.skill_relationships FOR ALL TO authenticated
 USING((SELECT app.current_user_role())='admin'::public.user_role)
 WITH CHECK((SELECT app.current_user_role())='admin'::public.user_role);
CREATE POLICY skill_knowledge_identity ON public.skill_relationships AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT app.platform_identity_session_satisfied())) WITH CHECK((SELECT app.platform_identity_session_satisfied()));
CREATE POLICY skill_knowledge_mfa ON public.skill_relationships AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT app.partner_mfa_satisfied())) WITH CHECK((SELECT app.partner_mfa_satisfied()));

CREATE TABLE app.skill_relationship_history(
 relationship_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>0),
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 snapshot jsonb NOT NULL,actor_id uuid,recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(relationship_id,revision)
);
ALTER TABLE app.skill_relationship_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.skill_relationship_history FROM PUBLIC,anon,authenticated,service_role;
-- The existing metadata guard is row-generic and uses these same review fields.
CREATE TRIGGER guard_skill_relationship_review BEFORE INSERT OR UPDATE ON public.skill_relationships
 FOR EACH ROW EXECUTE FUNCTION app.guard_occupation_skill_review();
CREATE TRIGGER deny_skill_relationship_truncate BEFORE TRUNCATE ON public.skill_relationships
 FOR EACH STATEMENT EXECUTE FUNCTION app.deny_occupation_skill_truncate();

CREATE OR REPLACE FUNCTION app.record_skill_relationship_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_snapshot jsonb;v_revision bigint;
BEGIN
 IF TG_OP='DELETE' THEN v_snapshot:=to_jsonb(OLD);v_revision:=OLD.revision+1;
 ELSE v_snapshot:=to_jsonb(NEW);v_revision:=NEW.revision;END IF;
 IF TG_OP='UPDATE' AND NEW.revision=OLD.revision THEN RETURN NULL;END IF;
 INSERT INTO app.skill_relationship_history(relationship_id,revision,operation,snapshot,actor_id)
 VALUES((v_snapshot->>'id')::uuid,v_revision,TG_OP,v_snapshot,auth.uid());
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.record_skill_relationship_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER record_skill_relationship_history AFTER INSERT OR UPDATE OR DELETE ON public.skill_relationships
 FOR EACH ROW EXECUTE FUNCTION app.record_skill_relationship_history();
CREATE OR REPLACE FUNCTION public.review_skill_relationship(
 p_relationship_id uuid,p_expected_revision bigint,p_action text,
 p_taxonomy_source_id uuid,p_source_version text,p_evidence_reference text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_initial public.skill_relationships;v_row public.skill_relationships;v_source public.taxonomy_sources;v_active_count integer;
 v_reference text:=btrim(p_evidence_reference);v_version text:=btrim(p_source_version);
BEGIN
 PERFORM app.require_knowledge_admin();
 IF p_action IS NULL OR p_action NOT IN ('approve','reject') OR p_expected_revision IS NULL OR p_expected_revision<1
  OR v_reference IS NULL OR v_reference='' OR char_length(v_reference)>1000 THEN
  RAISE EXCEPTION 'Review action, revision and bounded evidence reference are required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_initial FROM public.skill_relationships WHERE id=p_relationship_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge relationship is unavailable' USING ERRCODE='42501';END IF;
 IF p_action='approve' THEN
  IF p_taxonomy_source_id IS NULL OR v_version IS NULL OR v_version='' OR char_length(v_version)>128 THEN
   RAISE EXCEPTION 'A versioned taxonomy source is required' USING ERRCODE='22023';
  END IF;
  -- Parent-before-relationship locking avoids the dictionary-delete cascade cycle.
  SELECT * INTO v_source FROM public.taxonomy_sources WHERE id=p_taxonomy_source_id FOR SHARE;
  IF NOT FOUND OR NOT v_source.is_active OR btrim(v_source.version) IS DISTINCT FROM v_version THEN
   RAISE EXCEPTION 'Taxonomy source is inactive or its version changed' USING ERRCODE='55000';
  END IF;
  PERFORM id FROM public.skills WHERE id IN (v_initial.source_skill_id,v_initial.target_skill_id) AND is_active ORDER BY id FOR SHARE;
  GET DIAGNOSTICS v_active_count=ROW_COUNT;
  IF v_active_count<>2 OR NOT v_initial.is_active THEN RAISE EXCEPTION 'Two active skills and an active relationship are required' USING ERRCODE='55000';END IF;
 END IF;
 SELECT * INTO v_row FROM public.skill_relationships WHERE id=p_relationship_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge relationship is unavailable' USING ERRCODE='42501';END IF;
 IF v_row.revision<>p_expected_revision OR v_row.source_skill_id<>v_initial.source_skill_id OR v_row.target_skill_id<>v_initial.target_skill_id THEN
  RAISE EXCEPTION 'Knowledge relationship changed; reload before reviewing' USING ERRCODE='55000';
 END IF;
 IF p_action='approve' AND v_row.relationship_type NOT IN ('related','transferable') THEN
  RAISE EXCEPTION 'Supported skill relationship type required' USING ERRCODE='22023';
 END IF;
 -- Material evidence changes invalidate approval before the separate review stamp.
 UPDATE public.skill_relationships SET taxonomy_source_id=CASE WHEN p_action='approve' THEN p_taxonomy_source_id ELSE taxonomy_source_id END,
  source_version=CASE WHEN p_action='approve' THEN v_version ELSE source_version END,evidence_reference=v_reference
 WHERE id=p_relationship_id;
 UPDATE public.skill_relationships SET review_status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,
  reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
 WHERE id=p_relationship_id RETURNING * INTO v_row;
 RETURN jsonb_build_object('id',v_row.id,'revision',v_row.revision,'review_status',v_row.review_status);
END $fn$;
REVOKE ALL ON FUNCTION public.review_skill_relationship(uuid,bigint,text,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_skill_relationship(uuid,bigint,text,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_approved_skill_relationships(p_skill_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_items jsonb;v_payload jsonb;
BEGIN
 PERFORM app.require_intelligence_session();
 IF p_skill_ids IS NULL OR cardinality(p_skill_ids)>100 OR array_position(p_skill_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Supply at most 100 skill IDs' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) INTO v_items FROM (
  SELECT sr.id,sr.source_skill_id,sr.target_skill_id,sr.relationship_type,sr.revision,sr.reviewed_at,
   sr.evidence_reference,ts.id AS taxonomy_source_id,ts.code AS source_code,sr.source_version,
   a.canonical_name AS source_skill_name,b.canonical_name AS target_skill_name
  FROM public.skill_relationships sr
  JOIN public.skills a ON a.id=sr.source_skill_id AND a.is_active
  JOIN public.skills b ON b.id=sr.target_skill_id AND b.is_active
  JOIN public.taxonomy_sources ts ON ts.id=sr.taxonomy_source_id AND ts.is_active AND btrim(ts.version)=sr.source_version
  WHERE (sr.source_skill_id=ANY(p_skill_ids) OR sr.target_skill_id=ANY(p_skill_ids))
   AND sr.is_active AND sr.review_status='approved' AND sr.reviewed_by IS NOT NULL AND sr.reviewed_at IS NOT NULL
   AND sr.evidence_reference IS NOT NULL AND btrim(sr.evidence_reference)<>''
  ORDER BY sr.id LIMIT 1001
 )q;
 IF jsonb_array_length(v_items)>1000 THEN RAISE EXCEPTION 'Reviewed skill knowledge exceeds the processing bound' USING ERRCODE='22001';END IF;
 v_payload:=jsonb_build_object('knowledge_version','skill-relationship-knowledge-v1','relationships',v_items);
 RETURN v_payload||jsonb_build_object('snapshot_hash',encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'));
END $fn$;
REVOKE ALL ON FUNCTION public.get_approved_skill_relationships(uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_approved_skill_relationships(uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_skill_relationship_history(p_relationship_id uuid,p_after_revision bigint DEFAULT 0,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_history jsonb;
BEGIN
 PERFORM app.require_knowledge_admin();
 IF p_after_revision IS NULL OR p_after_revision<0 OR p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN
  RAISE EXCEPTION 'Invalid history page bounds' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.skill_relationship_history WHERE relationship_id=p_relationship_id) THEN
  RAISE EXCEPTION 'Knowledge relationship is unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.revision),'[]'::jsonb) INTO v_history
 FROM (SELECT * FROM app.skill_relationship_history WHERE relationship_id=p_relationship_id AND revision>p_after_revision ORDER BY revision LIMIT p_limit) h;
 RETURN v_history;
END $fn$;
REVOKE ALL ON FUNCTION public.get_skill_relationship_history(uuid,bigint,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_skill_relationship_history(uuid,bigint,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
