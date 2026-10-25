-- Preserve linked recruitment history and its event/company identity.
-- No retention periods, disposal executor, data deletion, policy change or existing grant expansion.
BEGIN;
CREATE OR REPLACE FUNCTION app.guard_recruitment_case_links()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_linked boolean; v_message text;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'event_vacancies' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
    AND NEW.vacancy_definition_id IS NOT DISTINCT FROM OLD.vacancy_definition_id THEN RETURN NEW; END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.applications WHERE event_vacancy_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.participation_vacancies WHERE event_vacancy_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.registrant_vacancies_legacy WHERE event_vacancy_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.interview_logs WHERE event_id=OLD.event_id AND vacancy_definition_id=OLD.vacancy_definition_id)
   INTO v_linked;
  v_message:='This offering has recruitment history and cannot be removed or reassigned. Close applications to keep the records.';
 WHEN 'event_participations' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
    AND NEW.participant_id IS NOT DISTINCT FROM OLD.participant_id THEN RETURN NEW; END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.applications WHERE registrant_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.participation_vacancies WHERE participation_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.interview_logs WHERE registrant_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.medical_referrals WHERE registrant_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.returning_ofw_profiles WHERE registrant_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.returning_worker_profiles WHERE registrant_id=OLD.id)
   INTO v_linked;
  v_message:='This registration has linked records and cannot be removed or reassigned.';
 WHEN 'vacancy_definitions' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.employer_id IS NOT DISTINCT FROM OLD.employer_id THEN RETURN NEW; END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.applications WHERE vacancy_definition_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.interview_logs WHERE vacancy_definition_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.event_vacancies ev JOIN public.participation_vacancies pv ON pv.event_vacancy_id=ev.id WHERE ev.vacancy_definition_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.event_vacancies ev JOIN public.registrant_vacancies_legacy pv ON pv.event_vacancy_id=ev.id WHERE ev.vacancy_definition_id=OLD.id)
   INTO v_linked;
  v_message:='This vacancy has recruitment history and cannot be deleted or transferred. Deactivate it instead.';
 ELSE RAISE EXCEPTION 'Recruitment history trigger is misconfigured';
 END CASE;
 IF v_linked THEN RAISE EXCEPTION '%',v_message USING ERRCODE='23503'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_recruitment_case_links() FROM PUBLIC,anon,authenticated,service_role;

-- Pin parents before existing canonical validators/FKs. Consistent lock order: definition, offering, registration.
CREATE OR REPLACE FUNCTION app.pin_recruitment_case_links()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_definition uuid; v_offering uuid; v_registration uuid; v_actual_definition uuid; v_event uuid; v_registration_event uuid;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'applications' THEN
  v_definition:=NEW.vacancy_definition_id; v_offering:=NEW.event_vacancy_id; v_registration:=NEW.registrant_id;
 WHEN 'participation_vacancies' THEN
  v_offering:=NEW.event_vacancy_id; v_registration:=NEW.participation_id;
 WHEN 'registrant_vacancies_legacy' THEN
  v_offering:=NEW.event_vacancy_id;
 WHEN 'interview_logs' THEN
  v_definition:=NEW.vacancy_definition_id; v_registration:=NEW.registrant_id;
  IF v_definition IS NOT NULL THEN
   SELECT id INTO v_offering FROM public.event_vacancies WHERE vacancy_definition_id=v_definition AND event_id=NEW.event_id;
   IF v_offering IS NULL AND TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Interview offering is no longer available' USING ERRCODE='23514';
   END IF;
  END IF;
 ELSE v_registration:=NEW.registrant_id;
 END CASE;
 IF v_definition IS NULL AND v_offering IS NOT NULL THEN
  SELECT vacancy_definition_id INTO v_definition FROM public.event_vacancies WHERE id=v_offering;
 END IF;
 IF v_definition IS NOT NULL THEN
  PERFORM 1 FROM public.vacancy_definitions WHERE id=v_definition FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recruitment position is no longer available' USING ERRCODE='23503'; END IF;
 END IF;
 IF v_offering IS NOT NULL THEN
  SELECT vacancy_definition_id,event_id INTO v_actual_definition,v_event
   FROM public.event_vacancies WHERE id=v_offering FOR KEY SHARE;
  IF NOT FOUND OR v_actual_definition IS DISTINCT FROM v_definition THEN
   RAISE EXCEPTION 'Recruitment offering changed; refresh and try again' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='interview_logs' THEN
   IF v_event IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'Interview offering belongs to a different event' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 IF v_registration IS NOT NULL THEN
  SELECT event_id INTO v_registration_event FROM public.event_participations WHERE id=v_registration FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event registration is no longer available' USING ERRCODE='23503'; END IF;
 END IF;
 IF TG_TABLE_NAME='participation_vacancies' THEN
  IF v_event IS DISTINCT FROM v_registration_event THEN
   RAISE EXCEPTION 'Select an offering belonging to the registration event' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.pin_recruitment_case_links() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER aa_recruitment_history_guard BEFORE UPDATE OF id,event_id,vacancy_definition_id OR DELETE ON public.event_vacancies
 FOR EACH ROW EXECUTE FUNCTION app.guard_recruitment_case_links();
CREATE TRIGGER aa_recruitment_history_guard BEFORE UPDATE OF id,event_id,participant_id OR DELETE ON public.event_participations
 FOR EACH ROW EXECUTE FUNCTION app.guard_recruitment_case_links();
CREATE TRIGGER aa_recruitment_history_guard BEFORE UPDATE OF id,employer_id OR DELETE ON public.vacancy_definitions
 FOR EACH ROW EXECUTE FUNCTION app.guard_recruitment_case_links();

CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();
CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.participation_vacancies FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();
CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.registrant_vacancies_legacy FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();
CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.interview_logs FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();
CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.medical_referrals FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();
CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.returning_ofw_profiles FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();
CREATE TRIGGER aa_pin_recruitment_case_links BEFORE INSERT OR UPDATE ON public.returning_worker_profiles FOR EACH ROW EXECUTE FUNCTION app.pin_recruitment_case_links();

CREATE OR REPLACE FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid)
 RETURNS TABLE(id uuid, unique_id text, first_name text, middle_name text, last_name text, email text, contact_no text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM app.require_recruitment_partner();
 RETURN QUERY select
    ep.id,
    ep.ticket_code::text as unique_id,
    jp.first_name,
    jp.middle_name,
    jp.last_name,
    jp.email,
    jp.contact_no
  from public.participation_vacancies pv
  join public.event_vacancies ev on ev.id = pv.event_vacancy_id
  join public.vacancy_definitions vd on vd.id = ev.vacancy_definition_id
  join public.employers emp on emp.id = vd.employer_id
  join public.event_participations ep on ep.id = pv.participation_id
  join public.participants p on p.id = ep.participant_id
  left join public.jobseeker_profiles jp on jp.participant_id = p.id
  where emp.registered_user_id = (select auth.uid())
    and emp.is_active=true and emp.registration_status='approved'
    and ep.event_id = ev.event_id
    and ev.id = p_event_vacancy_id;
END $function$;

CREATE OR REPLACE FUNCTION app.audit_event_offering_deadline()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 IF NEW.application_deadline IS DISTINCT FROM OLD.application_deadline THEN
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
  VALUES(auth.uid(),'event_offering_deadline_changed','event_vacancies',NEW.id,
   jsonb_build_object('application_deadline',OLD.application_deadline),
   jsonb_build_object('application_deadline',NEW.application_deadline));
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.audit_event_offering_deadline() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_event_offering_deadline AFTER UPDATE OF application_deadline ON public.event_vacancies
 FOR EACH ROW EXECUTE FUNCTION app.audit_event_offering_deadline();

CREATE OR REPLACE FUNCTION public.close_event_offering_applications(p_event_vacancy_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_role text:=public.app_current_user_role_text(); v_deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL OR v_role NOT IN ('admin','employer') THEN
  RAISE EXCEPTION 'An active verified employer or administrator is required' USING ERRCODE='42501';
 END IF;
 UPDATE public.event_vacancies SET application_deadline=least(coalesce(application_deadline,statement_timestamp()),statement_timestamp())
 WHERE id=p_event_vacancy_id RETURNING application_deadline INTO v_deadline;
 IF NOT FOUND THEN RAISE EXCEPTION 'Offering is not available for this account' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('event_vacancy_id',p_event_vacancy_id,'status','closed','application_deadline',v_deadline);
END $fn$;
REVOKE ALL ON FUNCTION public.close_event_offering_applications(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.close_event_offering_applications(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
