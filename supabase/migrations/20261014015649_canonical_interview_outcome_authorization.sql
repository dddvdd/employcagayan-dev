-- DEV-only: canonical interview references, outcome scope and reviewer attribution.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_interview_result(p_registrant_id uuid, p_event_id uuid, p_employer_id uuid, p_vacancy_definition_id uuid, p_status interview_status, p_application_id uuid DEFAULT NULL::uuid, p_interview_notes text DEFAULT NULL::text)
 RETURNS interview_logs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_ep public.event_participations;
  v_vd public.vacancy_definitions;
  v_inserted public.interview_logs;
begin
  PERFORM app.require_recruitment_session();
  if coalesce(app.current_user_role()::text,'') not in ('staff', 'admin') then raise exception 'Not authorized' USING ERRCODE='42501'; end if;

  -- Participation must exist and belong to the given event.
  select * into v_ep from public.event_participations where id = p_registrant_id;
  if v_ep.id is null then raise exception 'Participation not found'; end if;
  if v_ep.event_id is distinct from p_event_id then raise exception 'Event does not match'; end if;

  -- Checked-in requirement: interviews are only recorded for checked-in participants.
  if v_ep.check_in_status is distinct from 'checked_in' then
    raise exception 'Participant must be checked in before recording an interview';
  end if;

  -- Optional application link: must belong to the same participation and event.
  if p_application_id is not null then
    if not exists (
      select 1
      from public.applications a
      join public.event_vacancies ev on ev.id = a.event_vacancy_id
      where a.id = p_application_id
        and a.registrant_id = v_ep.id
        and ev.event_id = p_event_id
        and a.participant_id = v_ep.participant_id
        and a.vacancy_definition_id = p_vacancy_definition_id
        and ev.vacancy_definition_id = p_vacancy_definition_id
    ) then
      raise exception 'Application does not match this participation, event and position';
    end if;
  end if;

  -- Vacancy definition must exist, be active, and belong to the employer.
  select * into v_vd from public.vacancy_definitions
    where id = p_vacancy_definition_id and is_active = true;
  if v_vd.id is null then raise exception 'Position not found'; end if;

  if v_vd.employer_id is distinct from p_employer_id then
    raise exception 'Position does not belong to the company';
  end if;

  -- The position must be offered at the event.
  if not exists (
    select 1 from public.event_vacancies ev
    where ev.event_id = p_event_id and ev.vacancy_definition_id = p_vacancy_definition_id
  ) then raise exception 'Position is not offered at this event'; end if;

  begin
    insert into public.interview_logs (
      registrant_id, event_id, interviewer_id,
      position, company,
      interview_status, interview_date,
      employer_id, vacancy_definition_id,
      application_id, interview_notes
    ) values (
      v_ep.id, p_event_id, auth.uid(),
      v_vd.position, v_vd.company_name,
      p_status, now(),
      v_vd.employer_id, v_vd.id,
      p_application_id, p_interview_notes
    )
    returning * into v_inserted;
  exception
    when unique_violation then
      raise exception 'Interview result already recorded for this applicant, company, position, and status.';
  end;

  return v_inserted;
end;
$function$
;
REVOKE ALL ON FUNCTION public.record_interview_result(uuid,uuid,uuid,uuid,public.interview_status,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_interview_result(uuid,uuid,uuid,uuid,public.interview_status,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION app.outcome_application_scope_satisfied(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.platform_identity_session_satisfied() AND app.is_event_staff() AND EXISTS(
  SELECT 1 FROM public.applications a
  JOIN public.event_participations ep ON ep.id=a.registrant_id AND ep.participant_id=a.participant_id
  WHERE a.id=p_id AND public.supervisor_can_view_event(ep.event_id))
$fn$;
REVOKE ALL ON FUNCTION app.outcome_application_scope_satisfied(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app.outcome_application_scope_satisfied(uuid) TO authenticated;
ALTER POLICY "Staff manage employment outcomes" ON public.employment_outcomes
 USING(app.outcome_application_scope_satisfied(application_id))
 WITH CHECK(app.outcome_application_scope_satisfied(application_id));
ALTER POLICY "Staff view employment outcomes" ON public.employment_outcomes
 USING(app.outcome_application_scope_satisfied(application_id));

CREATE OR REPLACE FUNCTION app.guard_interview_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_ep public.event_participations; v_vd public.vacancy_definitions; v_role text; v_changed boolean;
BEGIN
 -- Trusted maintenance/fixture connections retain their established privileges.
 IF current_setting('role',true) IN ('none','service_role') THEN RETURN NEW; END IF;
 PERFORM app.require_recruitment_session();
 v_role:=app.current_user_role()::text;
 IF coalesce(v_role,'') NOT IN ('staff','admin') OR TG_OP='UPDATE' AND v_role<>'admin' THEN
  RAISE EXCEPTION 'Not authorized to write interview records' USING ERRCODE='42501';
 END IF;
 v_changed:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
  v_changed:=ROW(NEW.registrant_id,NEW.event_id,NEW.employer_id,NEW.vacancy_definition_id,NEW.application_id)
    IS DISTINCT FROM ROW(OLD.registrant_id,OLD.event_id,OLD.employer_id,OLD.vacancy_definition_id,OLD.application_id);
  -- Existing nullable-FK delete actions can retain historical interview snapshots.
  IF pg_trigger_depth()>1 AND (NEW.event_id IS NULL OR NEW.employer_id IS NULL OR NEW.vacancy_definition_id IS NULL) THEN RETURN NEW; END IF;
 END IF;
 IF NOT v_changed THEN RETURN NEW; END IF;
 SELECT * INTO v_ep FROM public.event_participations WHERE id=NEW.registrant_id;
 IF NOT FOUND OR NEW.event_id IS DISTINCT FROM v_ep.event_id THEN
  RAISE EXCEPTION 'Interview participation/event references do not match' USING ERRCODE='23514';
 END IF;
 IF (TG_OP='INSERT' OR NEW.registrant_id IS DISTINCT FROM OLD.registrant_id) AND v_ep.check_in_status IS DISTINCT FROM 'checked_in' THEN
  RAISE EXCEPTION 'Participant must be checked in before recording an interview' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_vd FROM public.vacancy_definitions WHERE id=NEW.vacancy_definition_id;
 IF NOT FOUND OR NEW.employer_id IS DISTINCT FROM v_vd.employer_id OR NOT v_vd.is_active THEN
  RAISE EXCEPTION 'Interview company/position references do not match' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.event_vacancies WHERE event_id=NEW.event_id AND vacancy_definition_id=NEW.vacancy_definition_id) THEN
  RAISE EXCEPTION 'Position is not offered at this event' USING ERRCODE='23514';
 END IF;
 IF NEW.application_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.applications a JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id
  WHERE a.id=NEW.application_id AND a.registrant_id=v_ep.id AND a.participant_id=v_ep.participant_id
    AND a.vacancy_definition_id=v_vd.id AND ev.vacancy_definition_id=v_vd.id AND ev.event_id=NEW.event_id) THEN
  RAISE EXCEPTION 'Interview application references do not match' USING ERRCODE='23514';
 END IF;
 NEW.position:=v_vd.position; NEW.company:=v_vd.company_name;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_interview_references() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_interview_references BEFORE INSERT OR UPDATE ON public.interview_logs
 FOR EACH ROW EXECUTE FUNCTION app.guard_interview_references();

CREATE OR REPLACE FUNCTION app.guard_outcome_reviewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_employer uuid; v_material boolean;
BEGIN
 IF current_setting('role',true) IN ('none','service_role') THEN RETURN NEW; END IF;
 PERFORM app.require_recruitment_session();
 IF NOT coalesce(app.is_event_staff(),false) THEN RAISE EXCEPTION 'Not authorized to write employment outcomes' USING ERRCODE='42501'; END IF;
 SELECT vd.employer_id INTO v_employer FROM public.applications a
 JOIN public.vacancy_definitions vd ON vd.id=a.vacancy_definition_id WHERE a.id=NEW.application_id;
 IF NOT FOUND OR (NEW.employer_id IS NOT NULL AND NEW.employer_id IS DISTINCT FROM v_employer) THEN
  RAISE EXCEPTION 'Outcome application/company references do not match' USING ERRCODE='23514';
 END IF;
 NEW.employer_id:=v_employer;
 v_material:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
  v_material:=(to_jsonb(NEW)-ARRAY['verified_by','verification_date','updated_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['verified_by','verification_date','updated_at']);
 END IF;
 IF NEW.outcome='pending' THEN NEW.verified_by:=NULL; NEW.verification_date:=NULL;
 ELSIF v_material THEN NEW.verified_by:=auth.uid(); NEW.verification_date:=clock_timestamp();
 ELSE NEW.verified_by:=OLD.verified_by; NEW.verification_date:=OLD.verification_date;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_outcome_reviewer() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_outcome_reviewer BEFORE INSERT OR UPDATE ON public.employment_outcomes
 FOR EACH ROW EXECUTE FUNCTION app.guard_outcome_reviewer();

CREATE OR REPLACE FUNCTION app.audit_employment_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
 IF current_setting('role',true) IN ('none','service_role') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'updated_at')=(to_jsonb(OLD)-'updated_at') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='interview_logs' THEN
  v_new:=jsonb_build_object('interview_status',NEW.interview_status);
  IF TG_OP='UPDATE' THEN v_old:=jsonb_build_object('interview_status',OLD.interview_status); END IF;
 ELSE
  v_new:=jsonb_build_object('outcome',NEW.outcome);
  IF TG_OP='UPDATE' THEN v_old:=jsonb_build_object('outcome',OLD.outcome); END IF;
 END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
 VALUES(auth.uid(),'employment_record_changed',TG_TABLE_NAME,NEW.id,v_old,v_new);
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.audit_employment_record() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_interview_record AFTER INSERT OR UPDATE ON public.interview_logs
 FOR EACH ROW EXECUTE FUNCTION app.audit_employment_record();
CREATE TRIGGER audit_outcome_record AFTER INSERT OR UPDATE ON public.employment_outcomes
 FOR EACH ROW EXECUTE FUNCTION app.audit_employment_record();
COMMIT;
