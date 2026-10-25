-- Milestone 3C. Targeted recruitment and private-resume authorization.
-- Existing canonical identities, status transitions and scoped staff delegation remain.
BEGIN;
CREATE OR REPLACE FUNCTION app.require_recruitment_session()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT app.platform_identity_session_satisfied() THEN
  RAISE EXCEPTION 'An active authorized session is required' USING ERRCODE='42501';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_recruitment_session() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION app.require_recruitment_partner()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM app.require_recruitment_session();
 IF NOT app.employer_mfa_satisfied() OR NOT EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=auth.uid() AND is_active AND registration_status='approved') THEN
  RAISE EXCEPTION 'An active approved employer and verified TOTP are required' USING ERRCODE='42501';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_recruitment_partner() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.approved_employer_session_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.platform_identity_session_satisfied() AND app.employer_mfa_satisfied()
  AND EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=auth.uid() AND is_active AND registration_status='approved')
$fn$;
REVOKE ALL ON FUNCTION app.approved_employer_session_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.approved_employer_session_satisfied() TO authenticated;
CREATE POLICY recruitment_application_identity ON public.applications AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT app.jobseeker_data_session_satisfied()) OR (SELECT app.approved_employer_session_satisfied()))
 WITH CHECK((SELECT app.jobseeker_data_session_satisfied()) OR (SELECT app.approved_employer_session_satisfied()));

CREATE OR REPLACE FUNCTION app.supervisor_participant_scope_satisfied(p_participant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.platform_identity_session_satisfied() AND (
  app.current_user_role()<>'supervisor'
  OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND is_provincial)
  OR EXISTS(SELECT 1 FROM public.participants WHERE id=p_participant_id AND auth_user_id=auth.uid())
  OR EXISTS(SELECT 1 FROM public.event_participations WHERE participant_id=p_participant_id AND public.supervisor_can_view_event(event_id))
 )
$fn$;
REVOKE ALL ON FUNCTION app.supervisor_participant_scope_satisfied(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.supervisor_participant_scope_satisfied(uuid) TO authenticated;
CREATE POLICY supervisor_participant_scope ON public.participants AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app.supervisor_participant_scope_satisfied(id));
CREATE POLICY supervisor_profile_scope ON public.jobseeker_profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app.supervisor_participant_scope_satisfied(participant_id));

CREATE OR REPLACE FUNCTION app.staff_can_read_resume(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.platform_identity_session_satisfied() AND app.is_event_staff() AND (
  app.current_user_role()<>'supervisor'
  OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND is_provincial)
  OR EXISTS(SELECT 1 FROM public.jobseeker_profiles jp WHERE jp.resume_path=p_path AND app.supervisor_participant_scope_satisfied(jp.participant_id))
 )
$fn$;
REVOKE ALL ON FUNCTION app.staff_can_read_resume(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.staff_can_read_resume(text) TO authenticated;
CREATE OR REPLACE FUNCTION app.employer_can_read_resume(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT app.approved_employer_session_satisfied() AND EXISTS(
  SELECT 1 FROM public.jobseeker_profiles jp JOIN public.participants p ON p.id=jp.participant_id
  JOIN public.applications a ON a.participant_id=jp.participant_id
  JOIN public.vacancy_definitions vd ON vd.id=a.vacancy_definition_id
  JOIN public.employers e ON e.id=vd.employer_id
  WHERE jp.resume_path=p_path AND p.auth_user_id IS NOT NULL
   AND split_part(p_path,'/',1)=p.auth_user_id::text
   AND a.application_status IN ('applied','shortlisted')
   AND e.registered_user_id=auth.uid() AND e.is_active AND e.registration_status='approved'
   AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='resumes' AND o.name=p_path)
 )
$fn$;
REVOKE ALL ON FUNCTION app.employer_can_read_resume(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.employer_can_read_resume(text) TO authenticated;
ALTER POLICY "Applicants read own resumes" ON storage.objects
 USING(bucket_id='resumes' AND ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR app.staff_can_read_resume(name)));
CREATE POLICY "Approved employers read active application resumes" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='resumes' AND app.employer_can_read_resume(name));
DROP POLICY authoritative_resume_session ON storage.objects;
CREATE POLICY authoritative_resume_session ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'resumes' OR (SELECT app.jobseeker_data_session_satisfied()) OR app.employer_can_read_resume(name));
CREATE POLICY authoritative_resume_insert_session ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'resumes' OR (SELECT app.jobseeker_data_session_satisfied()));
CREATE POLICY authoritative_resume_update_session ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'resumes' OR (SELECT app.jobseeker_data_session_satisfied()))
 WITH CHECK(bucket_id<>'resumes' OR (SELECT app.jobseeker_data_session_satisfied()));
CREATE POLICY authoritative_resume_delete_session ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'resumes' OR (SELECT app.jobseeker_data_session_satisfied()));
CREATE OR REPLACE FUNCTION app.resume_is_referenced(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.jobseeker_profiles WHERE resume_path=p_path)
$fn$;
REVOKE ALL ON FUNCTION app.resume_is_referenced(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.resume_is_referenced(text) TO authenticated;
CREATE POLICY protect_active_resume_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'resumes' OR NOT app.resume_is_referenced(name));

CREATE OR REPLACE FUNCTION app.guard_resume_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_owner uuid;
BEGIN
 IF nullif(NEW.resume_path,'') IS NULL THEN RETURN NEW; END IF;
 SELECT auth_user_id INTO v_owner FROM public.participants WHERE id=NEW.participant_id;
 IF v_owner IS NULL OR split_part(NEW.resume_path,'/',1) IS DISTINCT FROM v_owner::text THEN
  RAISE EXCEPTION 'Resume must belong to the profile owner' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='resumes' AND o.name=NEW.resume_path
  AND o.metadata->>'mimetype'='application/pdf'
  AND CASE WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric ELSE 0 END BETWEEN 1 AND 5242880) THEN
  RAISE EXCEPTION 'Resume must refer to an existing PDF within the file limit' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_resume_reference() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_resume_reference BEFORE INSERT OR UPDATE OF resume_path,participant_id ON public.jobseeker_profiles
 FOR EACH ROW EXECUTE FUNCTION app.guard_resume_reference();
CREATE OR REPLACE FUNCTION public.set_jobseeker_resume(p_resume_path text,p_previous_path text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_profile public.jobseeker_profiles; v_next text:=nullif(p_resume_path,'');
BEGIN
 PERFORM app.require_jobseeker_identity();
 SELECT jp.* INTO v_profile FROM public.jobseeker_profiles jp JOIN public.participants p ON p.id=jp.participant_id
 WHERE p.auth_user_id=auth.uid() FOR UPDATE OF jp;
 IF v_profile.participant_id IS NULL THEN RAISE EXCEPTION 'Complete your jobseeker profile first' USING ERRCODE='42501'; END IF;
 IF nullif(v_profile.resume_path,'') IS DISTINCT FROM nullif(p_previous_path,'') THEN
  RAISE EXCEPTION 'Resume changed in another session; reload and try again' USING ERRCODE='40001';
 END IF;
 IF nullif(v_profile.resume_path,'') IS NOT DISTINCT FROM v_next THEN
  RETURN jsonb_build_object('resume_path',v_next,'previous_resume_path',v_profile.resume_path);
 END IF;
 UPDATE public.jobseeker_profiles SET resume_path=v_next,updated_at=now() WHERE participant_id=v_profile.participant_id;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
 VALUES(auth.uid(),'resume_reference_changed','jobseeker_profiles',v_profile.participant_id,jsonb_build_object('has_resume',v_next IS NOT NULL));
 RETURN jsonb_build_object('resume_path',v_next,'previous_resume_path',v_profile.resume_path);
END $fn$;
REVOKE ALL ON FUNCTION public.set_jobseeker_resume(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_jobseeker_resume(text,text) TO authenticated;


CREATE OR REPLACE FUNCTION app.require_application_profile(p_participant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.jobseeker_profiles WHERE participant_id=p_participant_id AND data_subject_rights_agreed=true) THEN
  RAISE EXCEPTION 'Complete your jobseeker profile and consent before applying' USING ERRCODE='22023';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION app.require_application_profile(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.submit_application(p_vacancy_definition_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_application public.applications%ROWTYPE;
BEGIN
  PERFORM app.require_jobseeker_identity();
  IF public.app_current_user_role_text() <> 'applicant' THEN
    RAISE EXCEPTION 'Only an active applicant can submit an application' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_participant_id
  FROM public.participants p
  WHERE p.auth_user_id = auth.uid();
  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'No participant profile is linked to this account' USING ERRCODE = '42501';
  END IF;

  PERFORM app.require_application_profile(v_participant_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.vacancy_definitions vd
    JOIN public.employers e ON e.id = vd.employer_id
    WHERE vd.id = p_vacancy_definition_id
      AND vd.is_active = true
      AND vd.platform_status = 'published'
      AND vd.published_at IS NOT NULL
      AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline > now())
      AND e.is_active = true AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Vacancy is not open for platform applications' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_application
  FROM public.applications a
  WHERE a.participant_id = v_participant_id
    AND a.vacancy_definition_id = p_vacancy_definition_id
    AND a.registrant_id IS NULL AND a.event_vacancy_id IS NULL
    AND a.application_status IN ('applied', 'shortlisted')
  ORDER BY a.applied_at DESC LIMIT 1;

  IF v_application.id IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END IF;

  BEGIN
    INSERT INTO public.applications (
      participant_id, vacancy_definition_id, registrant_id, event_vacancy_id,
      application_status, source, notes
    ) VALUES (
      v_participant_id, p_vacancy_definition_id, NULL, NULL,
      'applied', 'online', NULLIF(btrim(p_notes), '')
    ) RETURNING * INTO v_application;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_application
    FROM public.applications a
    WHERE a.participant_id = v_participant_id
      AND a.vacancy_definition_id = p_vacancy_definition_id
      AND a.registrant_id IS NULL AND a.event_vacancy_id IS NULL
      AND a.application_status IN ('applied', 'shortlisted')
    ORDER BY a.applied_at DESC LIMIT 1;
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', 'created');
END
$function$
;
REVOKE ALL ON FUNCTION public.submit_application(p_vacancy_definition_id uuid, p_notes text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_application(p_vacancy_definition_id uuid, p_notes text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_applications()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_participant_id uuid;
BEGIN
  PERFORM app.require_jobseeker_identity();
  SELECT p.id INTO v_participant_id
  FROM public.participants p
  WHERE p.auth_user_id = auth.uid();
  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'No participant profile is linked to this account' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'application_id', a.id,
    'vacancy_definition_id', a.vacancy_definition_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'application_status', a.application_status,
    'source', a.source,
    'channel', CASE WHEN a.event_vacancy_id IS NULL THEN 'online' ELSE 'event' END,
    'applied_at', a.applied_at,
    'can_withdraw', a.application_status IN ('applied', 'shortlisted'),
    'event_vacancy_id', a.event_vacancy_id,
    'event_name', e.event_name
  )
  FROM public.applications a
  JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
  LEFT JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
  LEFT JOIN public.events e ON e.id = ev.event_id
  WHERE a.participant_id = v_participant_id
  ORDER BY a.applied_at DESC, a.id;
END
$function$
;
REVOKE ALL ON FUNCTION public.list_my_applications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_my_applications() TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_application(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_old_status text;
BEGIN
  PERFORM app.require_jobseeker_identity();
  SELECT p.id INTO v_participant_id
  FROM public.participants p WHERE p.auth_user_id = auth.uid();
  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'No participant profile is linked to this account' USING ERRCODE = '42501';
  END IF;

  SELECT a.application_status INTO v_old_status
  FROM public.applications a
  WHERE a.id = p_application_id AND a.participant_id = v_participant_id
  FOR UPDATE;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42501';
  END IF;
  IF v_old_status NOT IN ('applied', 'shortlisted') THEN
    RAISE EXCEPTION 'Application cannot be withdrawn from its current status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.applications SET application_status = 'withdrawn', updated_at = now()
  WHERE id = p_application_id;
  RETURN jsonb_build_object('application_id', p_application_id, 'status', 'withdrawn');
END
$function$
;
REVOKE ALL ON FUNCTION public.withdraw_application(p_application_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.withdraw_application(p_application_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_event_application(p_event_participation_id uuid, p_event_vacancy_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_participant_id uuid;
  v_definition_id uuid;
  v_event_id uuid;
  v_owner boolean;
  v_valid_check_in boolean;
  v_application public.applications%ROWTYPE;
BEGIN
  PERFORM app.require_recruitment_session();
  SELECT ep.participant_id, ep.event_id,
         (p.auth_user_id = auth.uid()),
         ep.check_in_status = 'checked_in' AND ep.check_in_time IS NOT NULL
  INTO v_participant_id, v_event_id, v_owner, v_valid_check_in
  FROM public.event_participations ep
  JOIN public.participants p ON p.id = ep.participant_id
  WHERE ep.id = p_event_participation_id;

  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'Event participation not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (COALESCE(v_owner, false) AND app.jobseeker_identity_satisfied()) AND NOT (
    public.app_current_user_role_text() IN ('staff', 'supervisor', 'admin')
    AND public.supervisor_can_view_event(v_event_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to submit for this participation' USING ERRCODE = '42501';
  END IF;

  PERFORM app.require_application_profile(v_participant_id);

  IF NOT COALESCE(v_valid_check_in, false) THEN
    RAISE EXCEPTION 'Formal event application requires completed event check-in' USING ERRCODE = '22023';
  END IF;

  SELECT ev.vacancy_definition_id INTO v_definition_id
  FROM public.event_vacancies ev
  JOIN public.events e ON e.id = ev.event_id
  JOIN public.vacancy_definitions vd ON vd.id = ev.vacancy_definition_id
  JOIN public.employers emp ON emp.id = vd.employer_id
  WHERE ev.id = p_event_vacancy_id
    AND ev.event_id = v_event_id
    AND (ev.application_deadline IS NULL OR ev.application_deadline > now())
    AND e.status IN ('upcoming', 'ongoing')
    AND vd.is_active = true
    AND emp.is_active = true AND emp.registration_status = 'approved';

  IF v_definition_id IS NULL THEN
    RAISE EXCEPTION 'Event offering is not open or does not belong to this event' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_application
  FROM public.applications a
  WHERE a.registrant_id = p_event_participation_id
    AND a.event_vacancy_id = p_event_vacancy_id
    AND a.application_status IN ('applied', 'shortlisted')
  ORDER BY a.applied_at DESC LIMIT 1;

  IF v_application.id IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END IF;

  BEGIN
    INSERT INTO public.applications (
      participant_id, vacancy_definition_id, registrant_id, event_vacancy_id,
      application_status, source, notes
    ) VALUES (
      v_participant_id, v_definition_id, p_event_participation_id, p_event_vacancy_id,
      'applied', 'event', NULLIF(btrim(p_notes), '')
    ) RETURNING * INTO v_application;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_application FROM public.applications a
    WHERE a.registrant_id = p_event_participation_id
      AND a.event_vacancy_id = p_event_vacancy_id
      AND a.application_status IN ('applied', 'shortlisted')
    ORDER BY a.applied_at DESC LIMIT 1;
    RETURN jsonb_build_object('application_id', v_application.id, 'status', 'existing');
  END;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', 'created');
END
$function$
;
REVOKE ALL ON FUNCTION public.submit_event_application(p_event_participation_id uuid, p_event_vacancy_id uuid, p_notes text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_event_application(p_event_participation_id uuid, p_event_vacancy_id uuid, p_notes text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_employer_applications(p_vacancy_definition_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_employer_id uuid;
BEGIN
  PERFORM app.require_recruitment_partner();
  SELECT e.id INTO v_employer_id
  FROM public.employers e
  WHERE e.registered_user_id = auth.uid()
    AND e.is_active = true AND e.registration_status = 'approved';
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'No active approved employer is linked to this account' USING ERRCODE = '42501';
  END IF;

  IF p_vacancy_definition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vacancy_definitions vd
    WHERE vd.id = p_vacancy_definition_id AND vd.employer_id = v_employer_id
  ) THEN
    RAISE EXCEPTION 'Vacancy not found or not owned by this employer' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'application_id', a.id,
    'participant_id', a.participant_id,
    'first_name', jp.first_name,
    'last_name', jp.last_name,
    'resume_path', CASE WHEN app.employer_can_read_resume(jp.resume_path) THEN jp.resume_path ELSE NULL END,
    'vacancy_definition_id', a.vacancy_definition_id,
    'company_name', vd.company_name,
    'position', vd.position,
    'application_status', a.application_status,
    'channel', CASE WHEN a.event_vacancy_id IS NULL THEN 'online' ELSE 'event' END,
    'source', a.source,
    'applied_at', a.applied_at,
    'event_vacancy_id', a.event_vacancy_id,
    'event_name', e.event_name
  )
  FROM public.applications a
  JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
  JOIN public.jobseeker_profiles jp ON jp.participant_id = a.participant_id
  LEFT JOIN public.event_vacancies ev ON ev.id = a.event_vacancy_id
  LEFT JOIN public.events e ON e.id = ev.event_id
  WHERE vd.employer_id = v_employer_id
    AND (p_vacancy_definition_id IS NULL OR vd.id = p_vacancy_definition_id)
  ORDER BY a.applied_at DESC, a.id;
END
$function$
;
REVOKE ALL ON FUNCTION public.list_employer_applications(p_vacancy_definition_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_employer_applications(p_vacancy_definition_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_application_status(p_application_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_employer_id uuid;
  v_old_status text;
BEGIN
  PERFORM app.require_recruitment_partner();
  SELECT e.id INTO v_employer_id
  FROM public.employers e
  WHERE e.registered_user_id = auth.uid()
    AND e.is_active = true AND e.registration_status = 'approved';
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'No active approved employer is linked to this account' USING ERRCODE = '42501';
  END IF;

  SELECT a.application_status INTO v_old_status
  FROM public.applications a
  JOIN public.vacancy_definitions vd ON vd.id = a.vacancy_definition_id
  WHERE a.id = p_application_id AND vd.employer_id = v_employer_id
  FOR UPDATE OF a;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Application not found or not owned by this employer' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    (v_old_status = 'applied' AND p_new_status IN ('shortlisted', 'rejected'))
    OR (v_old_status = 'shortlisted' AND p_new_status = 'rejected')
  ) THEN
    RAISE EXCEPTION 'Application status transition is not permitted' USING ERRCODE = '22023';
  END IF;

  UPDATE public.applications SET application_status = p_new_status, updated_at = now()
  WHERE id = p_application_id;
  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END
$function$
;
REVOKE ALL ON FUNCTION public.update_application_status(p_application_id uuid, p_new_status text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_application_status(p_application_id uuid, p_new_status text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_vacancy(p_vacancy_definition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_role text := public.app_current_user_role_text();
  v_employer_id uuid;
  v_status text;
BEGIN
  PERFORM app.require_recruitment_session();
  SELECT vd.employer_id, vd.platform_status
  INTO v_employer_id, v_status
  FROM public.vacancy_definitions vd
  WHERE vd.id = p_vacancy_definition_id
  FOR UPDATE;

  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'Vacancy not found or missing employer ownership' USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1
    FROM public.employers e
    WHERE e.id = v_employer_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true
      AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this vacancy' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'published' THEN
    RETURN jsonb_build_object(
      'vacancy_definition_id', p_vacancy_definition_id,
      'status', 'published'
    );
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft vacancy can be published' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.platform_transition_authorized', 'true', true);
  UPDATE public.vacancy_definitions
  SET platform_status = 'published',
      published_at = now(),
      closed_at = NULL
  WHERE id = p_vacancy_definition_id;

  RETURN jsonb_build_object(
    'vacancy_definition_id', p_vacancy_definition_id,
    'status', 'published'
  );
END
$function$
;
REVOKE ALL ON FUNCTION public.publish_vacancy(p_vacancy_definition_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_vacancy(p_vacancy_definition_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_vacancy(p_vacancy_definition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_role text := public.app_current_user_role_text();
  v_employer_id uuid;
  v_status text;
BEGIN
  PERFORM app.require_recruitment_session();
  SELECT vd.employer_id, vd.platform_status
  INTO v_employer_id, v_status
  FROM public.vacancy_definitions vd
  WHERE vd.id = p_vacancy_definition_id
  FOR UPDATE;

  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'Vacancy not found or missing employer ownership' USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1
    FROM public.employers e
    WHERE e.id = v_employer_id
      AND e.registered_user_id = auth.uid()
      AND e.is_active = true
      AND e.registration_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Not authorized to close this vacancy' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'closed' THEN
    RETURN jsonb_build_object(
      'vacancy_definition_id', p_vacancy_definition_id,
      'status', 'closed'
    );
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published vacancy can be closed' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.platform_transition_authorized', 'true', true);
  UPDATE public.vacancy_definitions
  SET platform_status = 'closed',
      closed_at = now()
  WHERE id = p_vacancy_definition_id;

  RETURN jsonb_build_object(
    'vacancy_definition_id', p_vacancy_definition_id,
    'status', 'closed'
  );
END
$function$
;
REVOKE ALL ON FUNCTION public.close_vacancy(p_vacancy_definition_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_vacancy(p_vacancy_definition_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS event_participations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
$function$
;
REVOKE ALL ON FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_for_event(p_event_id uuid, p_vacancy_ids uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_employer_applicants(p_event_vacancy_id uuid)
RETURNS TABLE(id uuid,unique_id text,first_name text,middle_name text,last_name text,email text,contact_no text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
    and ev.id = p_event_vacancy_id;
END $fn$;
REVOKE ALL ON FUNCTION public.get_employer_applicants(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_employer_applicants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_jobseeker_profile(p_profile jsonb)
 RETURNS jobseeker_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
 IF NOT (p_profile ? 'resume_path') THEN
  p_profile:=p_profile || jsonb_build_object('resume_path',(SELECT jp.resume_path FROM public.jobseeker_profiles jp JOIN public.participants p ON p.id=jp.participant_id WHERE p.auth_user_id=auth.uid()));
 END IF;
 SELECT * INTO v_saved FROM app.save_jobseeker_profile_core(p_profile);
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(auth.uid(),'jobseeker_profile_consent_affirmed','jobseeker_profiles',v_saved.participant_id,
    jsonb_build_object('affirmed',true,'source','owner_profile_save','contract_version','explicit-profile-consent-v1'));
 RETURN v_saved;
END $function$
;
REVOKE ALL ON FUNCTION public.save_jobseeker_profile(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_jobseeker_profile(jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.audit_application_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='UPDATE' AND NEW.application_status IS NOT DISTINCT FROM OLD.application_status THEN RETURN NEW; END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
 VALUES(auth.uid(),'application_status_changed','applications',NEW.id,
  CASE WHEN TG_OP='UPDATE' THEN jsonb_build_object('status',OLD.application_status) ELSE NULL END,
  jsonb_build_object('status',NEW.application_status,'channel',CASE WHEN NEW.event_vacancy_id IS NULL THEN 'online' ELSE 'event' END));
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.audit_application_status() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_application_status AFTER INSERT OR UPDATE OF application_status ON public.applications
 FOR EACH ROW EXECUTE FUNCTION app.audit_application_status();
NOTIFY pgrst,'reload schema';
COMMIT;
