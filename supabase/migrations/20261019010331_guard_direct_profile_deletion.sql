-- A profile is an identity/records anchor. Existing administrator table
-- permissions must not act as an unreviewed records-disposition route.
-- Trusted Auth/service maintenance retains its existing behavior.
BEGIN;

CREATE FUNCTION app.guard_direct_profile_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF current_setting('role', true) NOT IN
    ('none', 'postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'Profile deletion requires an approved records-disposition process'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $fn$;

REVOKE ALL ON FUNCTION app.guard_direct_profile_deletion()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_direct_profile_deletion
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app.guard_direct_profile_deletion();

COMMIT;
