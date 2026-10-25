-- DEV-only governed occupation-to-skill knowledge; preserve existing seed content.
BEGIN;
ALTER TABLE public.occupation_skills
 ADD COLUMN taxonomy_source_id uuid REFERENCES public.taxonomy_sources(id) ON DELETE RESTRICT,
 ADD COLUMN source_version text,
 ADD COLUMN evidence_reference text,
 ADD COLUMN review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
 ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE app.occupation_skill_history(
 relationship_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 operation text NOT NULL CHECK(operation IN ('baseline','INSERT','UPDATE','DELETE')),
 snapshot jsonb NOT NULL,
 actor_id uuid,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(relationship_id,revision)
);
ALTER TABLE app.occupation_skill_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.occupation_skill_history FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO app.occupation_skill_history(relationship_id,revision,operation,snapshot)
 SELECT id,revision,'baseline',to_jsonb(os) FROM public.occupation_skills os;
REVOKE TRUNCATE ON public.occupation_skills FROM anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.guard_occupation_skill_review()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE v_material boolean;v_direct boolean:=current_user IN ('anon','authenticated','service_role');
BEGIN
 IF TG_OP='INSERT' THEN
  IF v_direct AND (NEW.review_status<>'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.revision<>1) THEN
   RAISE EXCEPTION 'Knowledge review metadata requires the authorized review operation' USING ERRCODE='42501';
  END IF;
  NEW.revision:=1;NEW.updated_at:=clock_timestamp();RETURN NEW;
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Knowledge relationship identity is immutable' USING ERRCODE='42501';
 END IF;
 IF v_direct AND ROW(NEW.review_status,NEW.reviewed_by,NEW.reviewed_at,NEW.revision)
  IS DISTINCT FROM ROW(OLD.review_status,OLD.reviewed_by,OLD.reviewed_at,OLD.revision) THEN
  RAISE EXCEPTION 'Knowledge review metadata requires the authorized review operation' USING ERRCODE='42501';
 END IF;
 v_material:=(to_jsonb(NEW)-ARRAY['id','created_at','updated_at','review_status','reviewed_by','reviewed_at','revision'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['id','created_at','updated_at','review_status','reviewed_by','reviewed_at','revision']);
 IF v_material THEN NEW.review_status:='pending';NEW.reviewed_by:=NULL;NEW.reviewed_at:=NULL;END IF;
 IF v_material OR ROW(NEW.review_status,NEW.reviewed_by,NEW.reviewed_at)
  IS DISTINCT FROM ROW(OLD.review_status,OLD.reviewed_by,OLD.reviewed_at) THEN
  NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();
 ELSE NEW.revision:=OLD.revision;NEW.updated_at:=OLD.updated_at;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_occupation_skill_review() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_occupation_skill_review BEFORE INSERT OR UPDATE ON public.occupation_skills
 FOR EACH ROW EXECUTE FUNCTION app.guard_occupation_skill_review();

CREATE OR REPLACE FUNCTION app.record_occupation_skill_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_row public.occupation_skills;v_revision bigint;
BEGIN
 IF TG_OP='DELETE' THEN v_row:=OLD;v_revision:=OLD.revision+1;
 ELSE v_row:=NEW;v_revision:=NEW.revision;END IF;
 IF TG_OP='UPDATE' AND NEW.revision=OLD.revision THEN RETURN NULL;END IF;
 INSERT INTO app.occupation_skill_history(relationship_id,revision,operation,snapshot,actor_id)
 VALUES(v_row.id,v_revision,TG_OP,to_jsonb(v_row),auth.uid());
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.record_occupation_skill_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER record_occupation_skill_history AFTER INSERT OR UPDATE OR DELETE ON public.occupation_skills
 FOR EACH ROW EXECUTE FUNCTION app.record_occupation_skill_history();

CREATE OR REPLACE FUNCTION app.deny_occupation_skill_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 RAISE EXCEPTION 'Delete knowledge relationships explicitly to preserve version history' USING ERRCODE='55000';
END $fn$;
REVOKE ALL ON FUNCTION app.deny_occupation_skill_truncate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER deny_occupation_skill_truncate BEFORE TRUNCATE ON public.occupation_skills
 FOR EACH STATEMENT EXECUTE FUNCTION app.deny_occupation_skill_truncate();

CREATE OR REPLACE FUNCTION app.require_knowledge_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' THEN
  RAISE EXCEPTION 'Authorized knowledge administrator session required' USING ERRCODE='42501';
 END IF;
 PERFORM app.require_intelligence_session();
 IF app.current_user_role() IS DISTINCT FROM 'admin'::public.user_role THEN
  RAISE EXCEPTION 'Authorized knowledge administrator session required' USING ERRCODE='42501';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_knowledge_admin() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.review_occupation_skill(
 p_relationship_id uuid,p_expected_revision bigint,p_action text,
 p_taxonomy_source_id uuid,p_source_version text,p_evidence_reference text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_initial public.occupation_skills;v_row public.occupation_skills;v_source public.taxonomy_sources;
 v_reference text:=btrim(p_evidence_reference);v_version text:=btrim(p_source_version);
BEGIN
 PERFORM app.require_knowledge_admin();
 IF p_action IS NULL OR p_action NOT IN ('approve','reject') OR p_expected_revision IS NULL OR p_expected_revision<1
  OR v_reference IS NULL OR v_reference='' OR char_length(v_reference)>1000 THEN
  RAISE EXCEPTION 'Review action, revision and bounded evidence reference are required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_initial FROM public.occupation_skills WHERE id=p_relationship_id;
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
  PERFORM 1 FROM public.occupations WHERE id=v_initial.occupation_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active occupation is required' USING ERRCODE='55000';END IF;
  PERFORM 1 FROM public.skills WHERE id=v_initial.skill_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active skill is required' USING ERRCODE='55000';END IF;
 END IF;
 SELECT * INTO v_row FROM public.occupation_skills WHERE id=p_relationship_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge relationship is unavailable' USING ERRCODE='42501';END IF;
 IF v_row.revision<>p_expected_revision OR v_row.occupation_id<>v_initial.occupation_id OR v_row.skill_id<>v_initial.skill_id THEN
  RAISE EXCEPTION 'Knowledge relationship changed; reload before reviewing' USING ERRCODE='55000';
 END IF;
 IF p_action='approve' AND v_row.relationship_type NOT IN ('essential','optional') THEN
  RAISE EXCEPTION 'Supported occupation relationship type required' USING ERRCODE='22023';
 END IF;
 -- Material evidence changes invalidate approval before the separate review stamp.
 UPDATE public.occupation_skills SET taxonomy_source_id=CASE WHEN p_action='approve' THEN p_taxonomy_source_id ELSE taxonomy_source_id END,
  source_version=CASE WHEN p_action='approve' THEN v_version ELSE source_version END,evidence_reference=v_reference
 WHERE id=p_relationship_id;
 UPDATE public.occupation_skills SET review_status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,
  reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
 WHERE id=p_relationship_id RETURNING * INTO v_row;
 RETURN jsonb_build_object('id',v_row.id,'revision',v_row.revision,'review_status',v_row.review_status);
END $fn$;
REVOKE ALL ON FUNCTION public.review_occupation_skill(uuid,bigint,text,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_occupation_skill(uuid,bigint,text,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_approved_occupation_skills(p_occupation_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_items jsonb;v_payload jsonb;
BEGIN
 PERFORM app.require_intelligence_session();
 IF p_occupation_ids IS NULL OR cardinality(p_occupation_ids)>100 OR array_position(p_occupation_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Supply at most 100 occupation IDs' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) INTO v_items FROM (
  SELECT os.id,os.occupation_id,os.skill_id,os.relationship_type,os.importance,os.revision,os.reviewed_at,
   os.evidence_reference,ts.id AS taxonomy_source_id,ts.code AS source_code,os.source_version,
   o.canonical_name AS occupation_name,s.canonical_name AS skill_name
  FROM public.occupation_skills os JOIN public.occupations o ON o.id=os.occupation_id AND o.is_active
  JOIN public.skills s ON s.id=os.skill_id AND s.is_active
  JOIN public.taxonomy_sources ts ON ts.id=os.taxonomy_source_id AND ts.is_active AND btrim(ts.version)=os.source_version
  WHERE os.occupation_id=ANY(p_occupation_ids) AND os.review_status='approved' AND os.reviewed_by IS NOT NULL
   AND os.reviewed_at IS NOT NULL AND os.evidence_reference IS NOT NULL AND btrim(os.evidence_reference)<>''
   AND os.relationship_type IN ('essential','optional')
  ORDER BY os.id LIMIT 1001
 )q;
 IF jsonb_array_length(v_items)>1000 THEN RAISE EXCEPTION 'Reviewed knowledge exceeds the processing bound' USING ERRCODE='22001';END IF;
 v_payload:=jsonb_build_object('knowledge_version','occupation-skill-knowledge-v1','relationships',v_items);
 RETURN v_payload||jsonb_build_object('snapshot_hash',encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'));
END $fn$;
REVOKE ALL ON FUNCTION public.get_approved_occupation_skills(uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_approved_occupation_skills(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_occupation_skill_history(p_relationship_id uuid,p_after_revision bigint DEFAULT 0,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_history jsonb;
BEGIN
 PERFORM app.require_knowledge_admin();
 IF p_after_revision IS NULL OR p_after_revision<0 OR p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN
  RAISE EXCEPTION 'Invalid history page bounds' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.occupation_skill_history WHERE relationship_id=p_relationship_id) THEN
  RAISE EXCEPTION 'Knowledge relationship is unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.revision),'[]'::jsonb) INTO v_history
 FROM (SELECT * FROM app.occupation_skill_history WHERE relationship_id=p_relationship_id AND revision>p_after_revision ORDER BY revision LIMIT p_limit) h;
 RETURN v_history;
END $fn$;
REVOKE ALL ON FUNCTION public.get_occupation_skill_history(uuid,bigint,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_occupation_skill_history(uuid,bigint,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
