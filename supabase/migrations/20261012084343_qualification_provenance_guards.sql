-- Provenance guards for ordinary direct qualification writes.
-- RLS still controls ownership and administrator access. Existing reviewed
-- SECURITY DEFINER writers retain their own authorization and audit contracts.
BEGIN;
ALTER TABLE public.jobseeker_skills ADD CONSTRAINT jobseeker_skill_source_check
 CHECK(source IN ('self_reported','admin_entered','employer_reported','legacy_backfill','llm_inferred'));
ALTER TABLE public.jobseeker_skills ADD CONSTRAINT jobseeker_skill_verification_check
 CHECK(verification_status IN ('unverified','pending','verified','expired','rejected'));
ALTER TABLE public.jobseeker_skills ADD CONSTRAINT jobseeker_skill_proficiency_check
 CHECK(proficiency_level IS NULL OR proficiency_level IN ('beginner','intermediate','advanced','expert'));
ALTER TABLE public.jobseeker_skills ADD CONSTRAINT jobseeker_skill_years_check CHECK(years_experience IS NULL OR years_experience>=0);

CREATE OR REPLACE FUNCTION app.guard_direct_skill_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 -- INVOKER is deliberate: current_user distinguishes ordinary REST writes
 -- from existing trusted definer writers. Do not convert to SECURITY DEFINER.
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF app.current_user_role()='admin' AND app.partner_mfa_satisfied() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.source IS DISTINCT FROM 'self_reported' OR NEW.verification_status IS DISTINCT FROM 'unverified' THEN
   RAISE EXCEPTION 'Self-reported skills cannot claim external provenance or verification' USING ERRCODE='42501';
  END IF;
 ELSE
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
   RAISE EXCEPTION 'Only an authorized administrator can change skill verification' USING ERRCODE='42501';
  END IF;
  IF NEW.source IS DISTINCT FROM OLD.source AND NEW.source IS DISTINCT FROM 'self_reported' THEN
   RAISE EXCEPTION 'Self-reported skills cannot claim external provenance' USING ERRCODE='42501';
  END IF;
  IF ROW(NEW.skill_id,NEW.proficiency_level,NEW.years_experience) IS DISTINCT FROM ROW(OLD.skill_id,OLD.proficiency_level,OLD.years_experience)
   OR NEW.source IS DISTINCT FROM OLD.source THEN
   NEW.source:='self_reported'; NEW.verification_status:='unverified';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_direct_skill_provenance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_direct_skill_provenance BEFORE INSERT OR UPDATE ON public.jobseeker_skills
 FOR EACH ROW EXECUTE FUNCTION app.guard_direct_skill_provenance();

CREATE OR REPLACE FUNCTION app.guard_direct_language_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF app.current_user_role()='admin' AND app.partner_mfa_satisfied() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.source IS DISTINCT FROM 'self_reported' THEN
   RAISE EXCEPTION 'Self-reported languages cannot claim external provenance' USING ERRCODE='42501';
  END IF;
 ELSE
  IF NEW.source IS DISTINCT FROM OLD.source AND NEW.source IS DISTINCT FROM 'self_reported' THEN
   RAISE EXCEPTION 'Self-reported languages cannot claim external provenance' USING ERRCODE='42501';
  END IF;
  IF ROW(NEW.language_id,NEW.speaking_proficiency,NEW.reading_proficiency,NEW.writing_proficiency,NEW.is_native)
   IS DISTINCT FROM ROW(OLD.language_id,OLD.speaking_proficiency,OLD.reading_proficiency,OLD.writing_proficiency,OLD.is_native)
   OR NEW.source IS DISTINCT FROM OLD.source THEN NEW.source:='self_reported'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_direct_language_provenance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_direct_language_provenance BEFORE INSERT OR UPDATE ON public.jobseeker_languages
 FOR EACH ROW EXECUTE FUNCTION app.guard_direct_language_provenance();

CREATE OR REPLACE FUNCTION app.audit_qualification_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $audit$
DECLARE v_new jsonb:=jsonb_build_object('source',to_jsonb(NEW)->>'source','verification_status',to_jsonb(NEW)->>'verification_status');
 v_old jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  v_old:=jsonb_build_object('source',to_jsonb(OLD)->>'source','verification_status',to_jsonb(OLD)->>'verification_status');
  IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;
 ELSIF v_new->>'source'='self_reported' AND coalesce(v_new->>'verification_status','unverified')='unverified' THEN
  RETURN NEW;
 END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
 VALUES(auth.uid(),'qualification_provenance_changed',TG_TABLE_NAME,NEW.id,v_old,v_new);
 RETURN NEW;
END $audit$;
REVOKE ALL ON FUNCTION app.audit_qualification_provenance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_skill_provenance AFTER INSERT OR UPDATE ON public.jobseeker_skills
 FOR EACH ROW EXECUTE FUNCTION app.audit_qualification_provenance();
CREATE TRIGGER audit_language_provenance AFTER INSERT OR UPDATE ON public.jobseeker_languages
 FOR EACH ROW EXECUTE FUNCTION app.audit_qualification_provenance();

NOTIFY pgrst,'reload schema';
COMMIT;
