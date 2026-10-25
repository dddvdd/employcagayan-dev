-- DEV-only; depends on 20261020010000_dev_synthetic_test_registry.sql.
-- Preserve the existing actor/organization authorization and add a provenance
-- denial before canonical text is assembled or an AI run is created.
CREATE OR REPLACE FUNCTION app.intelligence_entity_authorized(p_type text,p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.platform_identity_session_satisfied()
  AND NOT CASE p_type
    WHEN 'jobseeker_profile' THEN app.is_dev_synthetic_participant(p_id)
    WHEN 'vacancy' THEN app.is_dev_synthetic_vacancy(p_id)
    ELSE false END
  AND CASE app.current_user_role()
 WHEN 'admin' THEN p_type IN ('jobseeker_profile','vacancy')
 WHEN 'staff' THEN p_type IN ('jobseeker_profile','vacancy')
 WHEN 'supervisor' THEN p_type IN ('jobseeker_profile','vacancy') AND (
  EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND is_provincial)
  OR p_type='jobseeker_profile' AND app.supervisor_participant_scope_satisfied(p_id)
  OR p_type='vacancy' AND EXISTS(SELECT 1 FROM public.event_vacancies WHERE vacancy_definition_id=p_id AND public.supervisor_can_view_event(event_id)))
 WHEN 'applicant' THEN p_type='jobseeker_profile' AND app.jobseeker_identity_satisfied()
  AND EXISTS(SELECT 1 FROM public.jobseeker_profiles jp JOIN public.participants p ON p.id=jp.participant_id WHERE jp.participant_id=p_id AND p.auth_user_id=auth.uid())
 WHEN 'employer' THEN p_type='vacancy' AND app.approved_employer_session_satisfied()
  AND EXISTS(SELECT 1 FROM public.vacancy_definitions vd JOIN public.employers e ON e.id=vd.employer_id WHERE vd.id=p_id AND e.registered_user_id=auth.uid() AND e.is_active AND e.registration_status='approved')
 ELSE false END
$fn$;
REVOKE ALL ON FUNCTION app.intelligence_entity_authorized(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.intelligence_entity_authorized(text,uuid) TO authenticated;

-- A previously queued worker or service-role writer cannot make a new current
-- embedding for a classified fictional source. Staling an existing vector is
-- still allowed and does not delete derived history.
CREATE FUNCTION app.guard_dev_synthetic_current_embedding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NEW.status='current' AND (
   NEW.entity_type='jobseeker_profile' AND app.is_dev_synthetic_participant(NEW.entity_id)
   OR NEW.entity_type='vacancy' AND app.is_dev_synthetic_vacancy(NEW.entity_id)
 ) THEN
   RAISE EXCEPTION 'Synthetic sources cannot produce current embeddings'
     USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_current_embedding
 BEFORE INSERT OR UPDATE ON public.employment_embeddings
 FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_current_embedding();
REVOKE ALL ON FUNCTION app.guard_dev_synthetic_current_embedding()
 FROM PUBLIC,anon,authenticated,service_role;
