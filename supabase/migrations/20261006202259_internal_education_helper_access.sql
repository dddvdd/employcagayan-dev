-- Recovered verbatim from verified DEV migration history on 2026-10-12.
-- Historical migration 20261006202259; do not reapply to a linked database blindly.
BEGIN;
REVOKE ALL ON FUNCTION public.registration_education_code(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_registration_education(public.jobseeker_profiles) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_registration_education_trigger() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

