-- DEV profile contract. Preserve the existing aggregate writer and atomic
-- education trigger; require the caller's actual consent and valid birthday.
BEGIN;

ALTER FUNCTION public.save_jobseeker_profile(jsonb) SET SCHEMA app;
ALTER FUNCTION app.save_jobseeker_profile(jsonb) RENAME TO save_jobseeker_profile_core;
REVOKE ALL ON FUNCTION app.save_jobseeker_profile_core(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_jobseeker_profile(p_profile jsonb)
RETURNS public.jobseeker_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_saved public.jobseeker_profiles;
BEGIN
 PERFORM app.require_jobseeker_identity();
 IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object'
  OR p_profile->'data_subject_rights_agreed' IS DISTINCT FROM 'true'::jsonb THEN
  RAISE EXCEPTION 'Confirm the privacy notice before saving your profile' USING ERRCODE='22023';
 END IF;
 IF NULLIF(p_profile->>'birthdate','') IS NOT NULL AND p_profile->>'birthdate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'Birthdate must be a valid calendar date in YYYY-MM-DD format' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_saved FROM app.save_jobseeker_profile_core(p_profile);
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(auth.uid(),'jobseeker_profile_consent_affirmed','jobseeker_profiles',v_saved.participant_id,
    jsonb_build_object('affirmed',true,'source','owner_profile_save','contract_version','explicit-profile-consent-v1'));
 RETURN v_saved;
END $$;
REVOKE ALL ON FUNCTION public.save_jobseeker_profile(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_jobseeker_profile(jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.guard_jobseeker_birthdate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.birthdate IS NOT NULL AND (NEW.birthdate<DATE '1900-01-01'
  OR NEW.birthdate>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date) THEN
  RAISE EXCEPTION 'Birthdate must be between 1900 and today' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_jobseeker_birthdate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_jobseeker_birthdate BEFORE INSERT OR UPDATE OF birthdate ON public.jobseeker_profiles
 FOR EACH ROW EXECUTE FUNCTION app.guard_jobseeker_birthdate();

-- Preserve unspecified studies without assigning a named degree or rank.
INSERT INTO public.education_levels(code,name,rank,description,is_active)
 SELECT 'other_unspecified','Other / Qualification not specified',0,
  'Unclassified self-reported qualification. Rank zero is not proof of educational failure.',true
 WHERE NOT EXISTS(SELECT 1 FROM public.education_levels WHERE code='other_unspecified');

CREATE OR REPLACE FUNCTION public.registration_education_code(p_level text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE lower(trim(p_level))
  WHEN '' THEN NULL
  WHEN 'elementary' THEN 'elementary'
  WHEN 'elementary level' THEN 'elementary'
  WHEN 'elementary graduate' THEN 'elementary_grad'
  WHEN 'junior high school' THEN 'junior_high'
  WHEN 'junior high school level' THEN 'junior_high'
  WHEN 'junior high school graduate' THEN 'junior_high_grad'
  WHEN 'senior high school' THEN 'senior_high'
  WHEN 'senior high school level' THEN 'senior_high'
  WHEN 'senior high school graduate' THEN 'senior_high_grad'
  WHEN 'technical-vocational' THEN 'vocational'
  WHEN 'tvet course' THEN 'vocational'
  WHEN 'tesda national certificate i' THEN 'vocational'
  WHEN 'tesda national certificate ii' THEN 'vocational'
  WHEN 'tesda national certificate iii' THEN 'vocational'
  WHEN 'tesda national certificate iv' THEN 'vocational'
  WHEN 'tesda diploma program' THEN 'vocational'
  WHEN 'associate degree' THEN 'associate'
  WHEN 'associate degree graduate' THEN 'associate'
  WHEN 'college level' THEN 'bachelor'
  WHEN 'college / undergraduate' THEN 'bachelor'
  WHEN 'bachelor''s degree' THEN 'bachelor'
  WHEN 'bachelor''s degree graduate' THEN 'bachelor'
  WHEN 'post-graduate diploma' THEN 'postgraduate'
  WHEN 'postgraduate diploma' THEN 'postgraduate'
  WHEN 'master''s degree' THEN 'master'
  WHEN 'master''s degree candidate/ graduate' THEN 'master'
  WHEN 'doctorate / phd' THEN 'doctorate'
  WHEN 'doctor''s degree/ phd candidate/ graduate' THEN 'doctorate'
  ELSE CASE WHEN p_level IS NULL THEN NULL ELSE 'other_unspecified' END END
$$;
REVOKE ALL ON FUNCTION public.registration_education_code(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app.registration_education_status(p_level text,p_graduation_year integer,p_current boolean)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE
  WHEN p_current THEN 'currently_enrolled'
  WHEN public.registration_education_code(p_level)='other_unspecified' THEN 'undergraduate'
  WHEN lower(p_level) LIKE '%undergraduate%' OR lower(p_level) LIKE '% level%' THEN 'undergraduate'
  WHEN lower(p_level) LIKE '%candidate%' AND p_graduation_year IS NULL THEN 'undergraduate'
  WHEN lower(p_level) LIKE '%certificate%' OR lower(p_level) LIKE '%diploma%' THEN 'completed'
  WHEN lower(p_level) LIKE '%graduate' OR p_graduation_year IS NOT NULL THEN 'graduated'
  ELSE 'undergraduate' END
$$;
REVOKE ALL ON FUNCTION app.registration_education_status(text,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_registration_education(p_profile public.jobseeker_profiles)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_item record; v_level uuid; v_status text;
 v_same_current boolean:=coalesce(p_profile.is_currently_student,false)
  AND app.registration_education_status(p_profile.highest_educational_attainment,p_profile.first_time_graduation_year,false) NOT IN ('graduated','completed')
  AND public.registration_education_code(p_profile.highest_educational_attainment) IS NOT DISTINCT FROM public.registration_education_code(p_profile.current_education_level)
  AND lower(trim(coalesce(p_profile.first_time_school,'')))=lower(trim(coalesce(p_profile.current_school_name,'')))
  AND lower(trim(coalesce(p_profile.course_program,'')))=lower(trim(coalesce(p_profile.current_program_or_strand,'')));
BEGIN
 FOR v_item IN SELECT * FROM (VALUES
  ('attainment',p_profile.highest_educational_attainment,p_profile.first_time_school,p_profile.course_program,p_profile.first_time_graduation_year,false,NOT v_same_current),
  ('current',p_profile.current_education_level,p_profile.current_school_name,p_profile.current_program_or_strand,NULL::smallint,true,coalesce(p_profile.is_currently_student,false))
 ) AS inputs(slot,level_name,school,course,graduation_year,is_current,enabled)
 LOOP
  SELECT id INTO v_level FROM public.education_levels WHERE code=public.registration_education_code(v_item.level_name) AND is_active;
  IF NOT v_item.enabled OR v_level IS NULL THEN
   DELETE FROM public.jobseeker_education WHERE jobseeker_profile_id=p_profile.participant_id
    AND registration_slot=v_item.slot AND registration_managed;
   CONTINUE;
  END IF;
  v_status:=app.registration_education_status(v_item.level_name,v_item.graduation_year,v_item.is_current);
  IF EXISTS(SELECT 1 FROM public.jobseeker_education WHERE jobseeker_profile_id=p_profile.participant_id
   AND registration_slot IS NULL AND education_level_id=v_level
   AND lower(trim(coalesce(school_name,'')))=lower(trim(coalesce(v_item.school,'')))
   AND lower(trim(coalesce(course_program,'')))=lower(trim(coalesce(v_item.course,'')))
   AND status IS NOT DISTINCT FROM v_status AND is_current IS NOT DISTINCT FROM v_item.is_current
   AND graduation_year IS NOT DISTINCT FROM v_item.graduation_year) THEN
   DELETE FROM public.jobseeker_education WHERE jobseeker_profile_id=p_profile.participant_id
    AND registration_slot=v_item.slot AND registration_managed;
   CONTINUE;
  END IF;
  INSERT INTO public.jobseeker_education(jobseeker_profile_id,education_level_id,school_name,course_program,
   graduation_year,status,is_current,registration_slot,registration_managed)
  VALUES(p_profile.participant_id,v_level,nullif(trim(v_item.school),''),nullif(trim(v_item.course),''),
   v_item.graduation_year,v_status,v_item.is_current,v_item.slot,true)
  ON CONFLICT(jobseeker_profile_id,registration_slot) WHERE registration_slot IS NOT NULL
  DO UPDATE SET education_level_id=excluded.education_level_id,school_name=excluded.school_name,
   course_program=excluded.course_program,graduation_year=excluded.graduation_year,status=excluded.status,is_current=excluded.is_current
  WHERE public.jobseeker_education.registration_managed;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.sync_registration_education(public.jobseeker_profiles) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app.detach_manual_education_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 -- Nested updates made by the profile synchronization remain managed. Direct
 -- record edits become manual so the next onboarding save preserves them.
 IF pg_trigger_depth()=1 THEN NEW.registration_managed:=false; NEW.registration_slot:=NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.detach_manual_education_edit() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER detach_manual_education_edit BEFORE UPDATE OF education_level_id,school_name,field_of_study,
 course_program,start_date,end_date,graduation_year,status,is_current ON public.jobseeker_education
 FOR EACH ROW EXECUTE FUNCTION app.detach_manual_education_edit();

-- Add precise current qualifications without changing existing stored labels.
ALTER TABLE public.jobseeker_profiles DROP CONSTRAINT jobseeker_profiles_current_education_level_check;
ALTER TABLE public.jobseeker_profiles ADD CONSTRAINT jobseeker_profiles_current_education_level_check
 CHECK(current_education_level IN ('Junior High School','Senior High School','Technical-Vocational',
 'College / Undergraduate','Graduate Studies','Other','Post-Graduate Diploma','Master''s Degree','Doctorate / PhD'));

NOTIFY pgrst,'reload schema';
COMMIT;
