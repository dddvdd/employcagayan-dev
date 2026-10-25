-- Make `jobseeker_education` the single canonical education store, with the
-- /register form contributing exactly one owned row.
--
-- Why
-- ---
-- Two independent education systems exist today:
--
--   * /register writes only flat columns on `jobseeker_profiles`
--     (highest_educational_attainment, course_program, first_time_school,
--      is_currently_student, …). It never touches `jobseeker_education`.
--   * /jobseeker/education reads and writes only `jobseeker_education`.
--
-- Result: nothing a jobseeker enters during registration ever appears on their
-- Education page, and the two views drift apart.
--
-- This migration makes `jobseeker_education` canonical and gives the
-- registration form a first-class, identifiable, single row inside it. To do
-- that without duplicating on every re-save, it needs provenance — so add a
-- `source` column mirroring the vocabulary already used by
-- `jobseeker_languages`, `jobseeker_skills`, `jobseeker_certifications` and
-- `jobseeker_industry_preferences`.
--
-- A partial unique index then enforces the invariant structurally: at most one
-- registration-owned education row per profile. Duplicates are impossible at
-- the database level rather than by application convention.
--
-- Security
-- --------
-- * The new function is SECURITY INVERVER-by-default (SECURITY INVOKER), so the
--   existing RLS policies still apply to every statement it runs. It is *not*
--   granted to `anon`.
-- * It resolves the target profile itself from auth.uid() and refuses to touch
--   any other jobseeker's row, so a caller cannot pass someone else's
--   participant id.
-- * It does not weaken, widen or re-scope any existing policy.

-- ---------------------------------------------------------------------------
-- 1. Provenance column. Existing rows are self-reported by definition.
-- ---------------------------------------------------------------------------
ALTER TABLE public.jobseeker_education
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'self_reported';

ALTER TABLE public.jobseeker_education
  DROP CONSTRAINT IF EXISTS jobseeker_education_source_check;

ALTER TABLE public.jobseeker_education
  ADD CONSTRAINT jobseeker_education_source_check
  CHECK (source = ANY (ARRAY[
    'self_reported',      -- entered on the Education profile page
    'registration_form',  -- mirrored from /register
    'admin_entered',
    'legacy_backfill'
  ]));

-- ---------------------------------------------------------------------------
-- 2. One registration-owned row per profile, enforced structurally.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS jobseeker_education_registration_unique
  ON public.jobseeker_education (jobseeker_profile_id)
  WHERE source = 'registration_form';

-- ---------------------------------------------------------------------------
-- 3. Upsert RPC used by /register after save_jobseeker_profile succeeds.
--
--    SECURITY INVOKER on purpose: RLS on jobseeker_education and
--    education_levels keeps enforcing "jobseekers manage own education".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_registration_education(
  p_education_level_code text,
  p_school_name          text,
  p_course_program       text,
  p_field_of_study       text,
  p_graduation_year      smallint,
  p_status               text,
  p_is_current           boolean
)
RETURNS public.jobseeker_education
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_participant public.participants;
  v_level_id   uuid;
  v_status     text;
  v_saved      public.jobseeker_education;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Resolve the caller's own participant. Never accept one as an argument.
  SELECT * INTO v_participant
  FROM public.participants
  WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No participant record for the current user' USING ERRCODE = '42501';
  END IF;

  IF p_education_level_code IS NULL THEN
    RAISE EXCEPTION 'An education level is required' USING ERRCODE = '23502';
  END IF;

  SELECT id INTO v_level_id
  FROM public.education_levels
  WHERE code = p_education_level_code AND is_active;

  IF v_level_id IS NULL THEN
    RAISE EXCEPTION 'Unknown education level "%"', p_education_level_code
      USING ERRCODE = '23503';
  END IF;

  -- Mirrors the jobseeker_education_status_check allow-list.
  v_status := COALESCE(p_status, 'completed');
  IF v_status NOT IN ('graduated','completed','undergraduate','currently_enrolled','incomplete','dropped') THEN
    RAISE EXCEPTION 'Invalid education status "%"', v_status USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.jobseeker_education (
    jobseeker_profile_id, education_level_id, school_name, course_program,
    field_of_study, graduation_year, status, is_current, source
  )
  VALUES (
    v_participant.id, v_level_id,
    NULLIF(btrim(p_school_name), ''),
    NULLIF(btrim(p_course_program), ''),
    NULLIF(btrim(p_field_of_study), ''),
    p_graduation_year,
    v_status,
    COALESCE(p_is_current, false),
    'registration_form'
  )
  ON CONFLICT (jobseeker_profile_id) WHERE source = 'registration_form'
  DO UPDATE SET
    education_level_id = EXCLUDED.education_level_id,
    school_name        = EXCLUDED.school_name,
    course_program     = EXCLUDED.course_program,
    field_of_study     = EXCLUDED.field_of_study,
    graduation_year    = EXCLUDED.graduation_year,
    status             = EXCLUDED.status,
    is_current         = EXCLUDED.is_current,
    updated_at         = now()
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

-- jobseekers may call it for themselves; admins keep working through RLS and
-- the Education page as before. anon is explicitly excluded.
REVOKE ALL ON FUNCTION public.save_registration_education(
  text, text, text, text, smallint, text, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_registration_education(
  text, text, text, text, smallint, text, boolean
) TO authenticated;

COMMENT ON FUNCTION public.save_registration_education(
  text, text, text, text, smallint, text, boolean
) IS 'Upserts the single registration-form-owned row in jobseeker_education for the calling jobseeker. SECURITY INVOKER: RLS still applies.';
