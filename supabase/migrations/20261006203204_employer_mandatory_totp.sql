-- Recovered verbatim from verified DEV migration history on 2026-10-12.
-- Historical migration 20261006203204; do not reapply to a linked database blindly.
-- DEV ONLY: Quest partner MFA. Existing authorization/ownership remains in force.
BEGIN;
CREATE OR REPLACE FUNCTION app.partner_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN false
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND
      (role::text IN ('staff','supervisor','admin','employer') OR
       (role::text = 'medical' AND EXISTS
         (SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status::text='verified'))))
      THEN COALESCE(auth.jwt()->>'aal','aal1')='aal2'
    ELSE true END
$$;
REVOKE ALL ON FUNCTION app.partner_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.partner_mfa_satisfied() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

