-- DEV-only: preserve existing nullable FK clearing; ordinary direct writes still validate.
BEGIN;
CREATE OR REPLACE FUNCTION app.guard_interview_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_ep public.event_participations; v_vd public.vacancy_definitions; v_role text; v_changed boolean;
BEGIN
 -- Trusted maintenance/fixture connections retain their established privileges.
 IF current_setting('role',true) IN ('none','service_role') THEN RETURN NEW; END IF;
 PERFORM app.require_recruitment_session();
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1
   AND ((OLD.event_id IS NOT NULL AND NEW.event_id IS NULL) OR (OLD.employer_id IS NOT NULL AND NEW.employer_id IS NULL) OR (OLD.vacancy_definition_id IS NOT NULL AND NEW.vacancy_definition_id IS NULL) OR (OLD.application_id IS NOT NULL AND NEW.application_id IS NULL))
   AND (NEW.event_id IS NOT DISTINCT FROM OLD.event_id OR (OLD.event_id IS NOT NULL AND NEW.event_id IS NULL))
   AND (NEW.employer_id IS NOT DISTINCT FROM OLD.employer_id OR (OLD.employer_id IS NOT NULL AND NEW.employer_id IS NULL))
   AND (NEW.vacancy_definition_id IS NOT DISTINCT FROM OLD.vacancy_definition_id OR (OLD.vacancy_definition_id IS NOT NULL AND NEW.vacancy_definition_id IS NULL))
   AND (NEW.application_id IS NOT DISTINCT FROM OLD.application_id OR (OLD.application_id IS NOT NULL AND NEW.application_id IS NULL))
   AND (to_jsonb(NEW)-ARRAY['event_id','employer_id','vacancy_definition_id','application_id','updated_at'])=(to_jsonb(OLD)-ARRAY['event_id','employer_id','vacancy_definition_id','application_id','updated_at'])
 THEN RETURN NEW; END IF;
 v_role:=app.current_user_role()::text;
 IF coalesce(v_role,'') NOT IN ('staff','admin') OR TG_OP='UPDATE' AND v_role<>'admin' THEN
  RAISE EXCEPTION 'Not authorized to write interview records' USING ERRCODE='42501';
 END IF;
 v_changed:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
  v_changed:=ROW(NEW.registrant_id,NEW.event_id,NEW.employer_id,NEW.vacancy_definition_id,NEW.application_id)
    IS DISTINCT FROM ROW(OLD.registrant_id,OLD.event_id,OLD.employer_id,OLD.vacancy_definition_id,OLD.application_id);
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
CREATE OR REPLACE FUNCTION app.guard_outcome_reviewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_employer uuid; v_material boolean;
BEGIN
 IF current_setting('role',true) IN ('none','service_role') THEN RETURN NEW; END IF;
 PERFORM app.require_recruitment_session();
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1
   AND ((OLD.employer_id IS NOT NULL AND NEW.employer_id IS NULL) OR (OLD.verified_by IS NOT NULL AND NEW.verified_by IS NULL))
   AND (NEW.employer_id IS NOT DISTINCT FROM OLD.employer_id OR (OLD.employer_id IS NOT NULL AND NEW.employer_id IS NULL))
   AND (NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by OR (OLD.verified_by IS NOT NULL AND NEW.verified_by IS NULL))
   AND (to_jsonb(NEW)-ARRAY['employer_id','verified_by','updated_at'])=(to_jsonb(OLD)-ARRAY['employer_id','verified_by','updated_at'])
 THEN RETURN NEW; END IF;
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
COMMIT;
