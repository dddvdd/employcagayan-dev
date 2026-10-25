-- Recovered verbatim from verified DEV migration history on 2026-10-12.
-- Historical migration 20261006200423; do not reapply to a linked database blindly.
BEGIN;
CREATE OR REPLACE FUNCTION public.quest_enforce_partner_mfa()
RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT app.enforce_partner_mfa() $$;
REVOKE ALL ON FUNCTION public.quest_enforce_partner_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quest_enforce_partner_mfa() TO anon,authenticated,service_role;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.quest_enforce_partner_mfa';
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
COMMIT;

