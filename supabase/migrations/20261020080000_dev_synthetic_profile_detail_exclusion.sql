-- DEV synthetic profile details remain available to their owner, but direct
-- staff/admin table reads must not export them apart from the guarded profile.
-- These restrictive SELECT policies preserve every existing permission for
-- genuine records and add no client write permission.
CREATE POLICY dev_synthetic_education_read ON public.jobseeker_education
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_skills_read ON public.jobseeker_skills
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_certifications_read ON public.jobseeker_certifications
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_languages_read ON public.jobseeker_languages
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_occupation_preferences_read ON public.jobseeker_occupation_preferences
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_industry_preferences_read ON public.jobseeker_industry_preferences
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_location_preferences_read ON public.jobseeker_location_preferences
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_employment_type_preferences_read ON public.jobseeker_employment_type_preferences
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_work_arrangement_preferences_read ON public.jobseeker_work_arrangement_preferences
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(jobseeker_profile_id));
CREATE POLICY dev_synthetic_special_sectors_read ON public.jobseeker_special_sectors
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(participant_id));
