-- Recovered verbatim from verified DEV migration history on 2026-10-12.
-- Historical migration 20261006200041; do not reapply to a linked database blindly.
-- DEV ONLY: Quest partner MFA. Existing authorization/ownership remains in force.
BEGIN;
CREATE OR REPLACE FUNCTION app.partner_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN false
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND
      (role::text IN ('staff','supervisor','admin') OR
       (role::text IN ('employer','medical') AND EXISTS
         (SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status::text='verified'))))
      THEN COALESCE(auth.jwt()->>'aal','aal1')='aal2'
    ELSE true END
$$;
REVOKE ALL ON FUNCTION app.partner_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.partner_mfa_satisfied() TO authenticated, service_role;

-- The sole pre-MFA Data API exception exposes only the caller's account summary.
CREATE OR REPLACE FUNCTION public.auth_account_bootstrap()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT jsonb_build_object('id',p.id,'email',p.email,'full_name',p.full_name,
   'role',p.role,'is_active',p.is_active,'jurisdiction',p.jurisdiction,'is_provincial',p.is_provincial)
 FROM public.profiles p WHERE p.id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.auth_account_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_account_bootstrap() TO authenticated;

CREATE OR REPLACE FUNCTION app.enforce_partner_mfa()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
 IF current_setting('request.path',true)='/rpc/auth_account_bootstrap' THEN RETURN; END IF;
 IF NOT app.partner_mfa_satisfied() THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authenticator verification required';
 END IF;
END $$;
REVOKE ALL ON FUNCTION app.enforce_partner_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enforce_partner_mfa() TO anon, authenticated, service_role;

-- Restrictive policies AND existing policies; never grant new row access.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='r' AND c.relrowsecurity AND (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects'))
 LOOP
   EXECUTE format('CREATE POLICY quest_partner_mfa ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT app.partner_mfa_satisfied())) WITH CHECK ((SELECT app.partner_mfa_satisfied()))',t.nspname,t.relname);
 END LOOP;
END $$;

-- Supabase Data API pre-request covers SECURITY DEFINER RPCs and views too.
-- Inspection confirmed no existing db_pre_request hook to replace.
ALTER ROLE authenticator SET pgrst.db_pre_request='app.enforce_partner_mfa';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
COMMIT;

