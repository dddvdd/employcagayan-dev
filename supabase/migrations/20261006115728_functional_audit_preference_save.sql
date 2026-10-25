-- Recovered verbatim from verified DEV migration history on 2026-10-12.
-- Historical migration 20261006115728; do not reapply to a linked database blindly.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_jobseeker_profile(p_profile jsonb)
 RETURNS jobseeker_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_participant public.participants;
  v_updated public.jobseeker_profiles;
  v_years_exp integer;
  v_ofw_years numeric;
  v_rw_years numeric;
  v_grad_year smallint;
  v_expected_grad_year smallint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_participant from public.participants where auth_user_id = auth.uid();
  if not found then
    insert into public.participants (auth_user_id) values (auth.uid()) returning * into v_participant;
  end if;

  -- Numeric-tolerant casts
  v_years_exp := case when p_profile ->> 'years_of_experience' ~ '^[0-9]+$'
                      then (p_profile ->> 'years_of_experience')::integer else null end;
  v_ofw_years := case when p_profile ->> 'ofw_years_abroad' ~ '^[0-9]+(\.[0-9]+)?$'
                      then (p_profile ->> 'ofw_years_abroad')::numeric else null end;
  v_rw_years  := case when p_profile ->> 'rw_years_worked' ~ '^[0-9]+(\.[0-9]+)?$'
                      then (p_profile ->> 'rw_years_worked')::numeric else null end;
  v_grad_year := case when p_profile ->> 'first_time_graduation_year' ~ '^[0-9]{4}$'
                      then (p_profile ->> 'first_time_graduation_year')::smallint else null end;
  v_expected_grad_year := case when p_profile ->> 'expected_graduation_year' ~ '^[0-9]{4}$'
                      then (p_profile ->> 'expected_graduation_year')::smallint else null end;

  insert into public.jobseeker_profiles (
    participant_id, first_name, middle_name, last_name,
    birthdate, sex, civil_status, barangay, municipality_city, province,
    contact_no, email,
    first_time_jobseeker, returning_ofw, returning_worker,
    interested_in_skills_training, preferred_training_program,
    has_disability, disability_type, peso_assistance_programs,
    highest_educational_attainment, course_program, employment_preference,
    resume_path, data_subject_rights_agreed, interview_location,
    current_employment_status, previous_occupation, previous_industry,
    years_of_experience, skills, desired_occupation, desired_industry,
    desired_salary, willing_to_relocate,
    accommodation_needed, employment_accommodation_notes,
    first_time_school, first_time_graduation_year, first_time_ojt_experience,
    ofw_country_last_worked, ofw_previous_employer, ofw_previous_occupation,
    ofw_years_abroad, ofw_date_returned, ofw_reason_for_return,
    rw_previous_work_location, rw_previous_employer, rw_previous_occupation,
    rw_years_worked, rw_date_returned, rw_reason_for_return,
    is_currently_student, current_school_name, current_education_level,
    current_grade_year_level, current_program_or_strand, expected_graduation_year
  ) values (
    v_participant.id,
    p_profile ->> 'first_name', p_profile ->> 'middle_name', p_profile ->> 'last_name',
    nullif(p_profile ->> 'birthdate', '')::date, p_profile ->> 'sex', p_profile ->> 'civil_status',
    p_profile ->> 'barangay', p_profile ->> 'municipality_city', p_profile ->> 'province',
    p_profile ->> 'contact_no', p_profile ->> 'email',
    coalesce((p_profile ->> 'first_time_jobseeker')::boolean, false),
    coalesce((p_profile ->> 'returning_ofw')::boolean, false),
    coalesce((p_profile ->> 'returning_worker')::boolean, false),
    coalesce((p_profile ->> 'interested_in_skills_training')::boolean, false),
    p_profile ->> 'preferred_training_program',
    coalesce((p_profile ->> 'has_disability')::boolean, false),
    p_profile ->> 'disability_type',
    coalesce(array(select jsonb_array_elements_text(p_profile -> 'peso_assistance_programs')), '{}'::text[]),
    p_profile ->> 'highest_educational_attainment', p_profile ->> 'course_program',
    p_profile ->> 'employment_preference',
    p_profile ->> 'resume_path', true,
    p_profile ->> 'interview_location',
    p_profile ->> 'current_employment_status', p_profile ->> 'previous_occupation',
    p_profile ->> 'previous_industry',
    v_years_exp,
    p_profile ->> 'skills', p_profile ->> 'desired_occupation',
    p_profile ->> 'desired_industry', p_profile ->> 'desired_salary',
    coalesce((p_profile ->> 'willing_to_relocate')::boolean, false),
    p_profile ->> 'accommodation_needed', p_profile ->> 'employment_accommodation_notes',
    p_profile ->> 'first_time_school',
    v_grad_year,
    p_profile ->> 'first_time_ojt_experience',
    p_profile ->> 'ofw_country_last_worked', p_profile ->> 'ofw_previous_employer',
    p_profile ->> 'ofw_previous_occupation',
    v_ofw_years,
    nullif(p_profile ->> 'ofw_date_returned', '')::date,
    p_profile ->> 'ofw_reason_for_return',
    p_profile ->> 'rw_previous_work_location', p_profile ->> 'rw_previous_employer',
    p_profile ->> 'rw_previous_occupation',
    v_rw_years,
    nullif(p_profile ->> 'rw_date_returned', '')::date,
    p_profile ->> 'rw_reason_for_return',
    coalesce((p_profile ->> 'is_currently_student')::boolean, false),
    p_profile ->> 'current_school_name',
    p_profile ->> 'current_education_level',
    p_profile ->> 'current_grade_year_level',
    p_profile ->> 'current_program_or_strand',
    v_expected_grad_year
  )
  on conflict (participant_id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    birthdate = excluded.birthdate,
    sex = excluded.sex,
    civil_status = excluded.civil_status,
    barangay = excluded.barangay,
    municipality_city = excluded.municipality_city,
    province = excluded.province,
    contact_no = excluded.contact_no,
    email = excluded.email,
    first_time_jobseeker = excluded.first_time_jobseeker,
    returning_ofw = excluded.returning_ofw,
    returning_worker = excluded.returning_worker,
    interested_in_skills_training = excluded.interested_in_skills_training,
    preferred_training_program = excluded.preferred_training_program,
    has_disability = excluded.has_disability,
    disability_type = excluded.disability_type,
    peso_assistance_programs = excluded.peso_assistance_programs,
    highest_educational_attainment = excluded.highest_educational_attainment,
    course_program = excluded.course_program,
    employment_preference = excluded.employment_preference,
    resume_path = excluded.resume_path,
    data_subject_rights_agreed = true,
    interview_location = excluded.interview_location,
    current_employment_status = excluded.current_employment_status,
    previous_occupation = excluded.previous_occupation,
    previous_industry = excluded.previous_industry,
    years_of_experience = excluded.years_of_experience,
    skills = excluded.skills,
    desired_occupation = excluded.desired_occupation,
    desired_industry = excluded.desired_industry,
    desired_salary = excluded.desired_salary,
    willing_to_relocate = excluded.willing_to_relocate,
    accommodation_needed = excluded.accommodation_needed,
    employment_accommodation_notes = excluded.employment_accommodation_notes,
    first_time_school = excluded.first_time_school,
    first_time_graduation_year = excluded.first_time_graduation_year,
    first_time_ojt_experience = excluded.first_time_ojt_experience,
    ofw_country_last_worked = excluded.ofw_country_last_worked,
    ofw_previous_employer = excluded.ofw_previous_employer,
    ofw_previous_occupation = excluded.ofw_previous_occupation,
    ofw_years_abroad = excluded.ofw_years_abroad,
    ofw_date_returned = excluded.ofw_date_returned,
    ofw_reason_for_return = excluded.ofw_reason_for_return,
    rw_previous_work_location = excluded.rw_previous_work_location,
    rw_previous_employer = excluded.rw_previous_employer,
    rw_previous_occupation = excluded.rw_previous_occupation,
    rw_years_worked = excluded.rw_years_worked,
    rw_date_returned = excluded.rw_date_returned,
    rw_reason_for_return = excluded.rw_reason_for_return,
    is_currently_student = excluded.is_currently_student,
    current_school_name = excluded.current_school_name,
    current_education_level = excluded.current_education_level,
    current_grade_year_level = excluded.current_grade_year_level,
    current_program_or_strand = excluded.current_program_or_strand,
    expected_graduation_year = excluded.expected_graduation_year
  returning * into v_updated;

  -- Sync special sectors: clear existing, insert new
  delete from public.jobseeker_special_sectors
    where participant_id = v_participant.id;

  if p_profile -> 'special_sectors' is not null and jsonb_array_length(p_profile -> 'special_sectors') > 0 then
    insert into public.jobseeker_special_sectors (participant_id, sector_id)
    select v_participant.id, s.id
    from public.special_worker_sectors s
    where s.code in (
      select jsonb_array_elements_text(p_profile -> 'special_sectors')
    )
    and s.is_active = true
    on conflict do nothing;
  end if;

  -- Persist the fields edited by the employment-preferences page.
  UPDATE public.jobseeker_profiles SET
    availability_status = CASE WHEN p_profile ? 'availability_status' THEN nullif(p_profile ->> 'availability_status', '') ELSE availability_status END,
    available_start_date = CASE WHEN p_profile ? 'available_start_date' THEN nullif(p_profile ->> 'available_start_date', '')::date ELSE available_start_date END,
    preferred_shift = CASE WHEN p_profile ? 'preferred_shift' THEN nullif(p_profile ->> 'preferred_shift', '') ELSE preferred_shift END,
    desired_salary_min = CASE WHEN p_profile ? 'desired_salary_min' THEN nullif(p_profile ->> 'desired_salary_min', '')::numeric ELSE desired_salary_min END,
    desired_salary_max = CASE WHEN p_profile ? 'desired_salary_max' THEN nullif(p_profile ->> 'desired_salary_max', '')::numeric ELSE desired_salary_max END,
    desired_salary_period = CASE WHEN p_profile ? 'desired_salary_period' THEN nullif(p_profile ->> 'desired_salary_period', '') ELSE desired_salary_period END,
    career_interests = CASE WHEN p_profile ? 'career_interests' THEN nullif(p_profile ->> 'career_interests', '') ELSE career_interests END,
    professional_summary = CASE WHEN p_profile ? 'professional_summary' THEN nullif(p_profile ->> 'professional_summary', '') ELSE professional_summary END
  WHERE participant_id = v_participant.id RETURNING * INTO v_updated;

  return v_updated;
end;
$function$
;

COMMIT;

