-- Recovered verbatim from verified DEV migration history on 2026-10-12.
-- Historical migration 20261006115723; do not reapply to a linked database blindly.
BEGIN;

-- Profile editing is no longer limited to two saves per database day.
DROP TRIGGER IF EXISTS jobseeker_profile_daily_limit ON public.jobseeker_profiles;

-- Track only records imported from registration. Manual edits retain their slot
-- but opt out of automatic updates, so registration cannot overwrite them.
ALTER TABLE public.jobseeker_education
  ADD COLUMN registration_slot text,
  ADD COLUMN registration_managed boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT jobseeker_education_registration_slot_check
    CHECK (registration_slot IN ('attainment', 'current'));
CREATE UNIQUE INDEX jobseeker_education_registration_slot_key
  ON public.jobseeker_education(jobseeker_profile_id, registration_slot)
  WHERE registration_slot IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registration_education_code(p_level text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(p_level) LIKE '%phd%' OR lower(p_level) LIKE '%doctor%' THEN 'doctorate'
    WHEN lower(p_level) LIKE '%master%' THEN 'master'
    WHEN lower(p_level) LIKE '%bachelor%' OR lower(p_level) LIKE '%college%' THEN 'bachelor'
    WHEN lower(p_level) LIKE '%associate%' THEN 'associate'
    WHEN lower(p_level) LIKE '%tesda%' OR lower(p_level) LIKE '%tvet%' OR lower(p_level) LIKE '%vocational%' THEN 'vocational'
    WHEN lower(p_level) LIKE '%senior high%' AND lower(p_level) LIKE '%graduate%' THEN 'senior_high_grad'
    WHEN lower(p_level) LIKE '%senior high%' THEN 'senior_high'
    WHEN lower(p_level) LIKE '%junior high%' AND lower(p_level) LIKE '%graduate%' THEN 'junior_high_grad'
    WHEN lower(p_level) LIKE '%junior high%' THEN 'junior_high'
    WHEN lower(p_level) LIKE '%elementary%' AND lower(p_level) LIKE '%graduate%' THEN 'elementary_grad'
    WHEN lower(p_level) LIKE '%elementary%' THEN 'elementary'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_registration_education(p_profile public.jobseeker_profiles)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_level uuid;
  v_status text;
  v_same_current boolean := coalesce(p_profile.is_currently_student, false)
    AND public.registration_education_code(p_profile.highest_educational_attainment)
      IS NOT DISTINCT FROM public.registration_education_code(p_profile.current_education_level)
    AND coalesce(p_profile.first_time_school, '') = coalesce(p_profile.current_school_name, '')
    AND coalesce(p_profile.course_program, '') = coalesce(p_profile.current_program_or_strand, '');
BEGIN
  FOR v_item IN
    SELECT * FROM (VALUES
      ('attainment', p_profile.highest_educational_attainment, p_profile.first_time_school,
       p_profile.course_program, p_profile.first_time_graduation_year, false,
       NOT v_same_current),
      ('current', p_profile.current_education_level, p_profile.current_school_name,
       p_profile.current_program_or_strand, NULL::smallint, true,
       coalesce(p_profile.is_currently_student, false))
    ) AS inputs(slot, level_name, school, course, graduation_year, is_current, enabled)
  LOOP
    SELECT id INTO v_level FROM public.education_levels
      WHERE code = public.registration_education_code(v_item.level_name);
    IF NOT v_item.enabled OR v_level IS NULL THEN
      DELETE FROM public.jobseeker_education
        WHERE jobseeker_profile_id = p_profile.participant_id
          AND registration_slot = v_item.slot AND registration_managed;
      CONTINUE;
    END IF;
    v_status := CASE
      WHEN v_item.is_current THEN 'currently_enrolled'
      WHEN lower(v_item.level_name) LIKE '%candidate%' AND v_item.graduation_year IS NULL THEN 'undergraduate'
      WHEN lower(v_item.level_name) LIKE '%graduate%' OR v_item.graduation_year IS NOT NULL THEN 'graduated'
      WHEN lower(v_item.level_name) LIKE '%certificate%' THEN 'completed'
      ELSE 'undergraduate' END;

    -- Existing manually entered equivalents remain authoritative.
    IF EXISTS (SELECT 1 FROM public.jobseeker_education
      WHERE jobseeker_profile_id = p_profile.participant_id AND registration_slot IS NULL
        AND education_level_id = v_level
        AND lower(coalesce(school_name, '')) = lower(coalesce(v_item.school, ''))
        AND lower(coalesce(course_program, '')) = lower(coalesce(v_item.course, '')))
    THEN CONTINUE; END IF;

    INSERT INTO public.jobseeker_education
      (jobseeker_profile_id, education_level_id, school_name, course_program,
       graduation_year, status, is_current, registration_slot, registration_managed)
    VALUES (p_profile.participant_id, v_level, nullif(v_item.school, ''), nullif(v_item.course, ''),
      v_item.graduation_year, v_status, v_item.is_current, v_item.slot, true)
    ON CONFLICT (jobseeker_profile_id, registration_slot) WHERE registration_slot IS NOT NULL
    DO UPDATE SET education_level_id = excluded.education_level_id,
      school_name = excluded.school_name, course_program = excluded.course_program,
      graduation_year = excluded.graduation_year, status = excluded.status,
      is_current = excluded.is_current
    WHERE public.jobseeker_education.registration_managed;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_registration_education_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_registration_education(NEW);
  ELSIF ROW(NEW.highest_educational_attainment, NEW.first_time_school, NEW.course_program,
    NEW.first_time_graduation_year, NEW.is_currently_student, NEW.current_school_name,
    NEW.current_education_level, NEW.current_program_or_strand)
    IS DISTINCT FROM ROW(OLD.highest_educational_attainment, OLD.first_time_school, OLD.course_program,
    OLD.first_time_graduation_year, OLD.is_currently_student, OLD.current_school_name,
    OLD.current_education_level, OLD.current_program_or_strand) THEN
    PERFORM public.sync_registration_education(NEW);
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.registration_education_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_registration_education(public.jobseeker_profiles) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_registration_education_trigger() FROM PUBLIC;

CREATE TRIGGER jobseeker_registration_education
  AFTER INSERT OR UPDATE ON public.jobseeker_profiles FOR EACH ROW
  EXECUTE FUNCTION public.sync_registration_education_trigger();

-- Fill the missing Education section for existing registrations as well.
DO $$ DECLARE v_profile public.jobseeker_profiles; BEGIN
  FOR v_profile IN SELECT * FROM public.jobseeker_profiles LOOP
    PERFORM public.sync_registration_education(v_profile);
  END LOOP;
END $$;

COMMIT;

