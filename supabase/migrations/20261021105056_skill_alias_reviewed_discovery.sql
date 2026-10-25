-- Proposed local-only migration. Do not apply without separate DEV authorization.
-- Canonical public.skills IDs remain authoritative. No aliases are seeded or approved.
BEGIN;

CREATE TABLE public.skill_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE RESTRICT,
  alias_text text NOT NULL CHECK (length(btrim(alias_text)) BETWEEN 2 AND 200),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) BETWEEN 2 AND 200),
  alias_type text NOT NULL CHECK (alias_type IN ('local','tesda_term','psf_term','esco_preferred','esco_alternative')),
  taxonomy_source_id uuid REFERENCES public.taxonomy_sources(id) ON DELETE RESTRICT,
  source_version text NOT NULL CHECK (length(btrim(source_version)) BETWEEN 1 AND 128),
  source_file text,
  source_sha256 text CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-fA-F]{64}$'),
  external_concept_uri text,
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 1000),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id,normalized_name,alias_type,source_version),
  CHECK (alias_type='local' OR taxonomy_source_id IS NOT NULL),
  CHECK ((alias_type IN ('esco_preferred','esco_alternative')) =
    (external_concept_uri IS NOT NULL)),
  CHECK (external_concept_uri IS NULL OR
    external_concept_uri ~ '^http://data[.]europa[.]eu/esco/skill/[0-9a-fA-F-]{36}$'),
  CHECK ((review_status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (review_status='pending' OR length(btrim(review_note)) BETWEEN 1 AND 1000)
);
-- Deliberately non-unique across canonical skill IDs: collisions stay visible for review.
CREATE INDEX skill_aliases_approved_lookup ON public.skill_aliases(normalized_name)
  WHERE review_status='approved';
CREATE INDEX skill_aliases_skill_idx ON public.skill_aliases(skill_id);
ALTER TABLE public.skill_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.skill_aliases FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.skill_aliases TO authenticated;
CREATE POLICY skill_alias_admin_read ON public.skill_aliases FOR SELECT TO authenticated
  USING ((SELECT app.current_user_role())='admin'::public.user_role
    AND (SELECT app.platform_identity_session_satisfied())
    AND (SELECT app.partner_mfa_satisfied()));
-- No direct client DML. Only a separately authorized import or the review RPC may mutate.
CREATE TRIGGER guard_skill_alias_review BEFORE INSERT OR UPDATE ON public.skill_aliases
  FOR EACH ROW EXECUTE FUNCTION app.guard_occupation_skill_review();
CREATE TRIGGER deny_skill_alias_truncate BEFORE TRUNCATE ON public.skill_aliases
  FOR EACH STATEMENT EXECUTE FUNCTION app.deny_occupation_skill_truncate();

CREATE TABLE app.skill_alias_history (
  alias_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision>0),
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  snapshot jsonb NOT NULL,
  actor_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(alias_id,revision)
);
ALTER TABLE app.skill_alias_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.skill_alias_history FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION app.record_skill_alias_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_row public.skill_aliases; v_revision bigint;
BEGIN
  IF TG_OP='DELETE' THEN v_row:=OLD; v_revision:=OLD.revision+1;
  ELSE v_row:=NEW; v_revision:=NEW.revision; END IF;
  IF TG_OP='UPDATE' AND NEW.revision=OLD.revision THEN RETURN NULL; END IF;
  INSERT INTO app.skill_alias_history(alias_id,revision,operation,snapshot,actor_id)
  VALUES(v_row.id,v_revision,TG_OP,to_jsonb(v_row),auth.uid());
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION app.record_skill_alias_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER record_skill_alias_history AFTER INSERT OR UPDATE OR DELETE ON public.skill_aliases
  FOR EACH ROW EXECUTE FUNCTION app.record_skill_alias_history();

CREATE FUNCTION public.review_skill_alias(
  p_alias_id uuid,p_expected_revision bigint,p_action text,p_review_note text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_initial public.skill_aliases; v_row public.skill_aliases; v_source public.taxonomy_sources;
BEGIN
  PERFORM app.require_knowledge_admin();
  IF p_action IS NULL OR p_action NOT IN ('approve','reject') OR
     p_expected_revision IS NULL OR p_expected_revision<1 OR
     length(btrim(coalesce(p_review_note,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Decision, revision and review note are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_initial FROM public.skill_aliases WHERE id=p_alias_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alias is unavailable' USING ERRCODE='42501'; END IF;
  IF p_action='approve' THEN
    -- Lock parents before the alias row to avoid a parent/child update deadlock.
    PERFORM 1 FROM public.skills WHERE id=v_initial.skill_id AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active canonical skill required' USING ERRCODE='55000'; END IF;
    IF v_initial.taxonomy_source_id IS NOT NULL THEN
      SELECT * INTO v_source FROM public.taxonomy_sources WHERE id=v_initial.taxonomy_source_id FOR SHARE;
      IF NOT FOUND OR NOT v_source.is_active OR btrim(v_source.version) IS DISTINCT FROM btrim(v_initial.source_version) THEN
        RAISE EXCEPTION 'Active, version-matched source required' USING ERRCODE='55000';
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_row FROM public.skill_aliases WHERE id=p_alias_id FOR UPDATE;
  IF NOT FOUND OR v_row.revision<>p_expected_revision OR
     v_row.skill_id IS DISTINCT FROM v_initial.skill_id OR
     v_row.taxonomy_source_id IS DISTINCT FROM v_initial.taxonomy_source_id THEN
    RAISE EXCEPTION 'Alias changed; reload before review' USING ERRCODE='55000';
  END IF;
  IF p_action='approve' THEN
    IF (v_row.alias_type='local' AND v_row.taxonomy_source_id IS NOT NULL AND v_source.code<>'INTERNAL') OR
       (v_row.alias_type='tesda_term' AND v_source.code<>'TESDA') OR
       (v_row.alias_type='psf_term' AND v_source.code<>'PSF') OR
       (v_row.alias_type IN ('esco_preferred','esco_alternative') AND v_source.code<>'ESCO') THEN
      RAISE EXCEPTION 'Alias type and taxonomy source disagree' USING ERRCODE='55000';
    END IF;
    IF v_row.alias_type IN ('esco_preferred','esco_alternative') AND
      (v_row.source_version<>'1.2.1' OR
       lower(coalesce(v_row.source_sha256,''))<>'f9761b0b52be1828b38a3e5e0ae59a93a7b0ce358bc800f52f57a8b002adeb3e') THEN
      RAISE EXCEPTION 'Pinned ESCO v1.2.1 receipt required' USING ERRCODE='55000';
    END IF;
    IF v_row.alias_type IN ('esco_preferred','esco_alternative') THEN
      RAISE EXCEPTION 'ESCO approval requires a separately verified URI and label registry' USING ERRCODE='55000';
    END IF;
    IF v_row.alias_type<>'local' AND v_row.source_sha256 IS NULL THEN
      RAISE EXCEPTION 'Official source file receipt required' USING ERRCODE='55000';
    END IF;
    IF EXISTS (SELECT 1 FROM public.skills s WHERE s.is_active AND s.id<>v_row.skill_id
      AND s.normalized_name=v_row.normalized_name) THEN
      RAISE EXCEPTION 'Alias collides with a different canonical skill' USING ERRCODE='55000';
    END IF;
  END IF;
  UPDATE public.skill_aliases SET review_note=btrim(p_review_note) WHERE id=p_alias_id;
  UPDATE public.skill_aliases
    SET review_status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,
        reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
    WHERE id=p_alias_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('id',v_row.id,'revision',v_row.revision,'review_status',v_row.review_status);
END $fn$;
REVOKE ALL ON FUNCTION public.review_skill_alias(uuid,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_skill_alias(uuid,bigint,text,text) TO authenticated;

-- Fixed-field, approved-only lookup. Never returns reviewer identity or pending records.
CREATE FUNCTION public.search_approved_skill_aliases(p_query text)
RETURNS TABLE(skill_id uuid,canonical_name text,normalized_name text,skill_type text,review_status text,
  alias_text text,alias_normalized_name text,alias_type text,source_code text,
  source_version text,external_concept_uri text,alias_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  PERFORM app.require_intelligence_session();
  IF p_query IS NULL OR length(p_query) NOT BETWEEN 2 AND 100 OR
    p_query <> btrim(p_query) OR p_query ~ '[%_[:cntrl:]]' THEN
    RAISE EXCEPTION 'Normalized search term required' USING ERRCODE='22023';
  END IF;
  -- Do not return a selectable subset when the 100-row cap hides a collision.
  IF (SELECT count(*) FROM (SELECT 1 FROM public.skill_aliases a
      JOIN public.skills s ON s.id=a.skill_id AND s.is_active
      LEFT JOIN public.taxonomy_sources ts ON ts.id=a.taxonomy_source_id
      WHERE a.review_status='approved' AND a.reviewed_by IS NOT NULL AND a.reviewed_at IS NOT NULL
        AND a.normalized_name=p_query
        AND (ts.id IS NULL AND a.alias_type='local' OR
             ts.is_active AND btrim(ts.version)=btrim(a.source_version))
      LIMIT 101) exact_rows)>100 THEN
    RAISE EXCEPTION 'Alias search is ambiguous; request review' USING ERRCODE='55000';
  END IF;
  RETURN QUERY
  SELECT s.id,s.canonical_name,s.normalized_name,s.skill_type,a.review_status,
    a.alias_text,a.normalized_name,a.alias_type,
    coalesce(ts.code,'LOCAL'),a.source_version,a.external_concept_uri,a.id
  FROM public.skill_aliases a
  JOIN public.skills s ON s.id=a.skill_id AND s.is_active
  LEFT JOIN public.taxonomy_sources ts ON ts.id=a.taxonomy_source_id
  WHERE a.review_status='approved' AND a.reviewed_by IS NOT NULL AND a.reviewed_at IS NOT NULL
    AND (ts.id IS NULL AND a.alias_type='local' OR
         ts.is_active AND btrim(ts.version)=btrim(a.source_version) AND
         (a.alias_type='local' AND ts.code='INTERNAL' OR
          a.alias_type='tesda_term' AND ts.code='TESDA' OR
          a.alias_type='psf_term' AND ts.code='PSF' OR
          a.alias_type IN ('esco_preferred','esco_alternative') AND ts.code='ESCO'))
    AND a.normalized_name LIKE '%'||split_part(p_query,' ',1)||'%'
  ORDER BY (a.normalized_name=p_query) DESC,a.normalized_name,s.id
  LIMIT 100;
END $fn$;
REVOKE ALL ON FUNCTION public.search_approved_skill_aliases(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.search_approved_skill_aliases(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
