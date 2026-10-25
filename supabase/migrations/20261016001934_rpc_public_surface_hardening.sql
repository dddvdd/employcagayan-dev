-- DEV-only: targeted public RPC privacy, registration integrity and least privilege.
-- No table/RLS grant broadening, row deletion, scheduled disposal or Production operation.
CREATE OR REPLACE FUNCTION public.get_event_participating_employers(p_event_id uuid)
 RETURNS TABLE(employer_code text, company_name text, industry text, vacancy_count bigint, on_site boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select e.employer_code,
         e.company_name,
         e.industry,
         (select count(*)
            from public.vacancy_definitions vd
            join public.event_vacancies ev on ev.vacancy_definition_id = vd.id
           where vd.employer_id = e.id and ev.event_id = get_event_participating_employers.p_event_id
              and vd.is_active = true) as vacancy_count,
         (p.status = 'checked_in') as on_site
  from public.employer_event_participations p
  join public.employers e on e.id = p.employer_id
  join public.events evt on evt.id = p.event_id
  where p.event_id = get_event_participating_employers.p_event_id
    and p.status in ('registered','checked_in')
    and e.is_active = true and e.registration_status = 'approved'
    and evt.status <> 'cancelled'
  order by (p.status = 'checked_in') desc, e.company_name;
$function$
;
CREATE OR REPLACE FUNCTION public.check_in_registrant(registrant_uuid uuid)
 RETURNS event_participations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  updated_row public.event_participations;
begin
  if app.current_user_role() not in ('staff', 'admin') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.event_participations ep join public.events e on e.id=ep.event_id
    where ep.id=registrant_uuid and e.status in ('upcoming','ongoing')) then
    raise exception 'This event is not open for check-in' using errcode='22023';
  end if;
  update public.event_participations
     set check_in_status = 'checked_in', check_in_time = now(), check_in_by = auth.uid()
   where id = registrant_uuid and check_in_status = 'pending'
  returning * into updated_row;
  if updated_row.id is null then raise exception 'Registrant was not found or has already checked in'; end if;
  return updated_row;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.staff_register_participant(p_participant_id uuid, p_event_id uuid, p_vacancy_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS event_participations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_inserted public.event_participations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Staff/medical/admin, or supervisor within the event's jurisdiction.
  if app.current_user_role() not in ('staff', 'medical', 'admin') then
    if not (
      (select app.current_user_role()) = 'supervisor'
      and public.supervisor_can_view_event(p_event_id)
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  -- Event must be open.
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status in ('upcoming', 'ongoing')) then
    raise exception 'This Quest is not open for registration.';
  end if;

  if coalesce(cardinality(p_vacancy_ids),0)>100
     or coalesce(cardinality(p_vacancy_ids),0)<>(select count(distinct id) from unnest(p_vacancy_ids) id)
     or exists (
      select 1 from unnest(p_vacancy_ids) selected
      left join public.event_vacancies ev on ev.id=selected
      left join public.vacancy_definitions vd on vd.id=ev.vacancy_definition_id
      left join public.employers emp on emp.id=vd.employer_id
      where ev.id is null or ev.event_id is distinct from p_event_id
       or not coalesce(vd.is_active,false) or not coalesce(emp.is_active,false)
       or emp.registration_status is distinct from 'approved'
     ) then
    raise exception 'Select at most 100 distinct active vacancies belonging to this event' using errcode='22023';
  end if;

  -- Participant must exist (never create here).
  if not exists (select 1 from public.participants where id = p_participant_id) then
    raise exception 'Participant not found.';
  end if;

  -- Create the participation (unique (participant_id, event_id) enforced by
  -- the constraint event_participations_unique).
  begin
    insert into public.event_participations (participant_id, event_id, registration_type, registered_by)
    values (p_participant_id, p_event_id, 'preregistered', auth.uid())
    returning * into v_inserted;
  exception
    when unique_violation then
      raise exception 'This participant is already registered for this Quest.';
  end;

  -- Optional vacancy links.
  if p_vacancy_ids is not null and array_length(p_vacancy_ids, 1) > 0 then
    insert into public.participation_vacancies (participation_id, event_vacancy_id, preference_type)
    select v_inserted.id, unnest(p_vacancy_ids), 'local';
  end if;

  return v_inserted;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_walkin_registrant(p_event_id uuid, p_first_name text, p_middle_name text, p_last_name text, p_birthdate date, p_sex text, p_civil_status text, p_province text, p_municipality_city text, p_barangay text, p_contact_no text, p_email text, p_highest_educational_attainment text, p_course_program text, p_employment_preference text, p_interview_location text, p_first_time_jobseeker boolean, p_first_time_school text, p_first_time_graduation_year text, p_first_time_ojt_experience text, p_returning_ofw boolean, p_returning_worker boolean, p_ofw_country_last_worked text, p_ofw_previous_employer text, p_ofw_previous_occupation text, p_ofw_years_abroad text, p_ofw_date_returned text, p_ofw_reason_for_return text, p_rw_previous_work_location text, p_rw_previous_employer text, p_rw_previous_occupation text, p_rw_years_worked text, p_rw_date_returned text, p_rw_reason_for_return text, p_interested_in_skills_training boolean, p_preferred_training_program text, p_has_disability boolean, p_disability_type text, p_peso_assistance_programs text[], p_data_subject_rights_agreed boolean, p_vacancy_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_participant public.participants;
  v_participation public.event_participations;
begin
  -- Preserve existing staff/medical/admin authorization.
  if app.current_user_role() not in ('staff', 'medical', 'admin') then raise exception 'Not authorized'; end if;

  if p_data_subject_rights_agreed is distinct from true then
    raise exception 'Record the data subject rights agreement before registration' using errcode='22023';
  end if;
  if (nullif(btrim(p_ofw_date_returned),'') is not null and
       (p_ofw_date_returned !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(p_ofw_date_returned,'date')))
     or (nullif(btrim(p_rw_date_returned),'') is not null and
       (p_rw_date_returned !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(p_rw_date_returned,'date'))) then
    raise exception 'Use valid calendar dates for return dates' using errcode='22023';
  end if;
  if not exists(select 1 from public.events where id=p_event_id and status in ('upcoming','ongoing')) then
    raise exception 'This event is not open for registration' using errcode='22023';
  end if;
  if coalesce(cardinality(p_vacancy_ids),0)>100
     or coalesce(cardinality(p_vacancy_ids),0)<>(select count(distinct id) from unnest(p_vacancy_ids) id)
     or exists (
      select 1 from unnest(p_vacancy_ids) selected
      left join public.event_vacancies ev on ev.id=selected
      left join public.vacancy_definitions vd on vd.id=ev.vacancy_definition_id
      left join public.employers emp on emp.id=vd.employer_id
      where ev.id is null or ev.event_id is distinct from p_event_id
       or not coalesce(vd.is_active,false) or not coalesce(emp.is_active,false)
       or emp.registration_status is distinct from 'approved'
     ) then
    raise exception 'Select at most 100 distinct active vacancies belonging to this event' using errcode='22023';
  end if;

  -- Create the participant (walk-in identity: no auth user, distinct public pass).
  insert into public.participants (auth_user_id, public_pass_id)
  values (null, 'QST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)))
  returning * into v_participant;

  -- Reusable Job Seeker Profile with the classification details.
  -- Numeric-safe casts: invalid values become NULL, never crash the RPC.
  insert into public.jobseeker_profiles (
    participant_id, first_name, middle_name, last_name,
    birthdate, sex, civil_status, province, municipality_city, barangay,
    contact_no, email, highest_educational_attainment, course_program,
    employment_preference, interview_location,
    first_time_jobseeker, first_time_school, first_time_graduation_year, first_time_ojt_experience,
    returning_ofw, returning_worker,
    ofw_country_last_worked, ofw_previous_employer, ofw_previous_occupation,
    ofw_years_abroad, ofw_date_returned, ofw_reason_for_return,
    rw_previous_work_location, rw_previous_employer, rw_previous_occupation,
    rw_years_worked, rw_date_returned, rw_reason_for_return,
    interested_in_skills_training, preferred_training_program,
    has_disability, disability_type, peso_assistance_programs,
    data_subject_rights_agreed
  ) values (
    v_participant.id, p_first_name, p_middle_name, p_last_name,
    p_birthdate, p_sex, p_civil_status, p_province, p_municipality_city, p_barangay,
    p_contact_no, coalesce(nullif(btrim(p_email),''),''), p_highest_educational_attainment, p_course_program,
    p_employment_preference, p_interview_location,
    p_first_time_jobseeker, p_first_time_school,
    case when p_first_time_graduation_year ~ '^[0-9]{4}$' then p_first_time_graduation_year::smallint else null end,
    p_first_time_ojt_experience,
    p_returning_ofw, p_returning_worker,
    p_ofw_country_last_worked, p_ofw_previous_employer, p_ofw_previous_occupation,
    case when p_ofw_years_abroad ~ '^[0-9]+(\.[0-9]+)?$' then p_ofw_years_abroad::numeric else null end,
    nullif(btrim(p_ofw_date_returned),'')::date, p_ofw_reason_for_return,
    p_rw_previous_work_location, p_rw_previous_employer, p_rw_previous_occupation,
    case when p_rw_years_worked ~ '^[0-9]+(\.[0-9]+)?$' then p_rw_years_worked::numeric else null end,
    nullif(btrim(p_rw_date_returned),'')::date, p_rw_reason_for_return,
    p_interested_in_skills_training, p_preferred_training_program,
    p_has_disability, p_disability_type, p_peso_assistance_programs,
    p_data_subject_rights_agreed
  );

  -- Event participation (walk-in is checked in immediately).
  insert into public.event_participations (
    participant_id, event_id, registration_type,
    check_in_status, check_in_time, check_in_by
  ) values (
    v_participant.id, p_event_id, 'walkin',
    'checked_in', now(), auth.uid()
  ) returning * into v_participation;

  -- Optional vacancy selection, with overseas/local preference.
  if p_vacancy_ids is not null and array_length(p_vacancy_ids, 1) > 0 then
    insert into public.participation_vacancies (participation_id, event_vacancy_id, preference_type)
    select v_participation.id, unnest(p_vacancy_ids),
           case when p_employment_preference = 'Overseas' then 'overseas' else 'local' end;
  end if;

  -- Return the Participant Pass info WalkinPage needs.
  return jsonb_build_object(
    'id', v_participation.id,
    'unique_id', v_participation.ticket_code,
    'qr_token', v_participation.qr_token,
    'event_id', v_participation.event_id,
    'check_in_time', v_participation.check_in_time,
    'first_name', p_first_name,
    'middle_name', p_middle_name,
    'last_name', p_last_name,
    'public_pass_id', v_participant.public_pass_id
  );
end;
$function$
;
-- Unused legacy name-to-email lookup has no runtime callers in unified login.
REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC,anon,authenticated,service_role;
-- Trigger/event-trigger execution is retained through existing bindings, not public RPC calls.
REVOKE ALL ON FUNCTION public.create_pending_accreditation() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.seed_accreditation_requirements() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_vacancy_history() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.enforce_jobseeker_profile_daily_limit() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.create_pending_accreditation() SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION public.seed_accreditation_requirements() SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION public.record_vacancy_history() SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION public.enforce_jobseeker_profile_daily_limit() SET search_path=pg_catalog,public,pg_temp;
-- Existing signed staff/medical/admin/supervisor checks remain authoritative.
REVOKE ALL ON FUNCTION public.check_in_registrant(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.staff_register_participant(uuid,uuid,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_walkin_registrant(uuid,text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text,text,boolean,boolean,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,text,text[],boolean,uuid[]) FROM PUBLIC,anon;
-- Public vacancy browsing, signup capacity, scope helpers and the PostgREST pre-request MFA guard retain their ACLs.
