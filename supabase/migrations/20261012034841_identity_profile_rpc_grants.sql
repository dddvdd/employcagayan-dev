-- The writer has an explicit verified-Google owner guard. Remove its inherited
-- anonymous/PUBLIC execution grant as defense at the API boundary as well.
BEGIN;
REVOKE ALL ON FUNCTION public.save_jobseeker_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_jobseeker_profile(jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
