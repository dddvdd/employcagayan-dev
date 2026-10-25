-- Enforce existing event/organization rules at each privileged writer.
-- No table/RLS/grant changes or new authorities.
BEGIN;
CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS event_participations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_participant public.participants;
  v_inserted public.event_participations;
begin
  PERFORM app.require_jobseeker_identity();
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_participant from public.participants where auth_user_id = auth.uid();
  if not found then
    raise exception 'Complete your job seeker profile first.';
  end if;

  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.status in ('upcoming', 'ongoing')
  ) then
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

  begin
    insert into public.event_participations (participant_id, event_id, registration_type)
    values (v_participant.id, p_event_id, 'preregistered')
    returning * into v_inserted;
  exception
    when unique_violation then
      raise exception 'You are already registered for this Quest.';
  end;

  if p_vacancy_ids is not null and array_length(p_vacancy_ids, 1) > 0 then
    -- Preference derives from the reusable profile (Overseas -> overseas), never hardcoded.
    insert into public.participation_vacancies (participation_id, event_vacancy_id, preference_type)
    select v_inserted.id, unnest(p_vacancy_ids),
           case when jp.employment_preference = 'Overseas' then 'overseas' else 'local' end
    from public.jobseeker_profiles jp
    where jp.participant_id = v_participant.id;
  end if;

  return v_inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_in_employer(p_employer_code text, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_employer_id uuid;
  v_company text;
  v_reg_status text;
  v_part_status text;
  v_event_status text;
begin
  PERFORM app.require_recruitment_session();
  if not (app.is_event_staff() or app.current_user_role() = 'admin') then
    raise exception 'Not authorized to check in employers';
  end if;

  IF app.current_user_role()='supervisor' AND public.supervisor_can_view_event(p_event_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Event is outside your assigned jurisdiction' USING ERRCODE='42501';
  END IF;

  select id, company_name, registration_status
    into v_employer_id, v_company, v_reg_status
  from employers where employer_code = upper(trim(p_employer_code));
  if v_employer_id is null then
    raise exception 'Employer ID not recognized';
  end if;
  if v_reg_status IS DISTINCT FROM 'approved' OR NOT EXISTS(SELECT 1 FROM public.employers WHERE id=v_employer_id AND is_active) then
    raise exception 'Employer is not accredited';
  end if;

  select status into v_event_status from events where id = p_event_id;
  if v_event_status is null then
    raise exception 'Activity not found';
  end if;
  if v_event_status not in ('upcoming','ongoing') then
    raise exception 'Check-in is closed for this activity';
  end if;

  select status into v_part_status
  from employer_event_participations
  where event_id = p_event_id and employer_id = v_employer_id;
  if v_part_status is null then
    raise exception 'Employer is not registered for this activity';
  end if;
  if v_part_status = 'cancelled' then
    raise exception 'Participation was cancelled';
  end if;
  if v_part_status = 'checked_in' then
    return jsonb_build_object('company', v_company, 'already_checked_in', true);
  end if;

  update employer_event_participations
     set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
   where event_id = p_event_id and employer_id = v_employer_id;

  return jsonb_build_object('company', v_company, 'already_checked_in', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.participate_in_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_employer_id uuid;
  v_status text;
  v_event_status text;
begin
  PERFORM app.require_recruitment_partner();
  select id, registration_status into v_employer_id, v_status
  from employers where registered_user_id = auth.uid() AND is_active AND registration_status='approved';
  if v_employer_id is null then
    raise exception 'Employer profile not found';
  end if;
  if v_status <> 'approved' then
    raise exception 'Employer accreditation approval is required to participate in this activity';
  end if;

  select status into v_event_status from events where id = p_event_id;
  if v_event_status is null then
    raise exception 'Activity not found';
  end if;
  if v_event_status not in ('upcoming','ongoing') then
    raise exception 'This activity is not open for participation';
  end if;

  insert into employer_event_participations (event_id, employer_id)
  values (p_event_id, v_employer_id)
  on conflict (event_id, employer_id) do nothing;
end;
$function$;
COMMIT;
