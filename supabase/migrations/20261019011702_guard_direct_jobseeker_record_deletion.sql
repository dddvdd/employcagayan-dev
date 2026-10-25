-- Participant and profile rows anchor operational jobseeker records. Keep
-- ordinary API updates, but do not permit direct unreviewed row disposal.
-- Existing trusted service/Auth cleanup remains available for exact fixtures.
BEGIN;

CREATE FUNCTION app.guard_direct_jobseeker_record_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF current_setting('role', true) NOT IN
    ('none', 'postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RAISE EXCEPTION 'Jobseeker record deletion requires an approved disposition process'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $fn$;

REVOKE ALL ON FUNCTION app.guard_direct_jobseeker_record_deletion()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_direct_participant_deletion
  BEFORE DELETE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION app.guard_direct_jobseeker_record_deletion();
CREATE TRIGGER guard_direct_jobseeker_profile_deletion
  BEFORE DELETE ON public.jobseeker_profiles
  FOR EACH ROW EXECUTE FUNCTION app.guard_direct_jobseeker_record_deletion();

COMMIT;
