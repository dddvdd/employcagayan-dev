-- Supabase Auth deletes users through its internal database role. The
-- profiles_id_fkey ON DELETE CASCADE invokes our profile guard in that role.
-- Preserve Auth's trusted cleanup while still rejecting direct API actors.
BEGIN;

CREATE OR REPLACE FUNCTION app.guard_direct_profile_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF current_setting('role', true) NOT IN
    ('none', 'postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RAISE EXCEPTION 'Profile deletion requires an approved records-disposition process'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $fn$;

REVOKE ALL ON FUNCTION app.guard_direct_profile_deletion()
  FROM PUBLIC, anon, authenticated;

COMMIT;
