-- DEV-only: raw curation metadata is administrative; consumers use the guarded approved snapshot.
BEGIN;
DROP POLICY "Skill knowledge readable" ON public.skill_relationships;
NOTIFY pgrst,'reload schema';
COMMIT;
