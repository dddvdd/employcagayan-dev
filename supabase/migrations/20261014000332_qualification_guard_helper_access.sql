-- Preserve invoker provenance guards without exposing the private app schema. DEV only.
BEGIN;
CREATE OR REPLACE FUNCTION public.qualification_admin_write_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.current_user_role()='admin' AND app.partner_mfa_satisfied()
$fn$;
REVOKE ALL ON FUNCTION public.qualification_admin_write_satisfied() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qualification_admin_write_satisfied() TO authenticated;
CREATE OR REPLACE FUNCTION app.guard_direct_skill_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 -- INVOKER is deliberate: current_user distinguishes ordinary REST writes
 -- from existing trusted definer writers. Do not convert to SECURITY DEFINER.
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF public.qualification_admin_write_satisfied() THEN RETURN NEW; END IF;
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
CREATE OR REPLACE FUNCTION app.guard_direct_language_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF public.qualification_admin_write_satisfied() THEN RETURN NEW; END IF;
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
CREATE OR REPLACE FUNCTION app.guard_direct_certification_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF public.qualification_admin_write_satisfied() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.source IS DISTINCT FROM 'self_reported' OR NEW.verification_status IS DISTINCT FROM 'unverified' THEN
   RAISE EXCEPTION 'Self-reported certifications cannot claim external provenance or verification' USING ERRCODE='42501';
  END IF;
 ELSE
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
   RAISE EXCEPTION 'Only an authorized administrator can change certification verification' USING ERRCODE='42501';
  END IF;
  IF NEW.source IS DISTINCT FROM OLD.source AND NEW.source IS DISTINCT FROM 'self_reported' THEN
   RAISE EXCEPTION 'Self-reported certifications cannot claim external provenance' USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['id','created_at','updated_at','source','verification_status']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['id','created_at','updated_at','source','verification_status'])
     OR NEW.source IS DISTINCT FROM OLD.source THEN
   NEW.source:='self_reported'; NEW.verification_status:='unverified';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_direct_certification_provenance() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
