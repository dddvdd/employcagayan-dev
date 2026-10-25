-- DEV administrative recovery uses existing private audit_logs, Auth factors,
-- and Auth sessions. No public reset token, role assignment or MFA exemption.
BEGIN;

CREATE OR REPLACE FUNCTION app.require_recovery_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM app.require_identity_admin();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) m
  WHERE m->>'method'='totp' AND CASE WHEN m->>'timestamp' ~ '^[0-9]{1,10}$'
   THEN to_timestamp((m->>'timestamp')::bigint) BETWEEN now()-interval '5 minutes' AND now()+interval '5 seconds'
   ELSE false END) THEN
  RAISE EXCEPTION 'Verify your administrator authenticator again before recovery' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION app.require_recovery_admin() FROM PUBLIC,anon,authenticated;

CREATE INDEX audit_mfa_recovery_target ON public.audit_logs(record_id,created_at)
 WHERE action IN ('mfa_recovery_prepared','mfa_recovery_completed');

CREATE OR REPLACE FUNCTION app.open_mfa_recovery(p_target_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a.new_data||jsonb_build_object('target_user_id',a.record_id,'prepared_by',a.user_id,'prepared_at',a.created_at)
 FROM public.audit_logs a WHERE a.action='mfa_recovery_prepared' AND a.record_id=p_target_user_id
 AND NOT EXISTS(SELECT 1 FROM public.audit_logs c WHERE c.action='mfa_recovery_completed'
   AND c.record_id=a.record_id AND c.new_data->>'request_id'=a.new_data->>'request_id')
 ORDER BY a.created_at DESC,a.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.open_mfa_recovery(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app.guard_mfa_recovery_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF app.open_mfa_recovery(OLD.id) IS NOT NULL AND (
  NEW.is_active OR ROW(NEW.id,NEW.email,NEW.role,NEW.jurisdiction,NEW.is_provincial)
    IS DISTINCT FROM ROW(OLD.id,OLD.email,OLD.role,OLD.jurisdiction,OLD.is_provincial)) THEN
  RAISE EXCEPTION 'Complete the audited recovery before changing account authority' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_mfa_recovery_hold() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_mfa_recovery_hold BEFORE UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION app.guard_mfa_recovery_hold();

CREATE OR REPLACE FUNCTION public.admin_prepare_mfa_recovery(
 p_target_user_id uuid,p_verification_reference text,p_verification_method text,p_identity_verified boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_profile public.profiles; v_open jsonb; v_request uuid; v_confirmed boolean; v_banned boolean;
BEGIN
 PERFORM app.require_recovery_admin();
 IF p_target_user_id IS NULL OR p_target_user_id=auth.uid() THEN
  RAISE EXCEPTION 'Another authorized administrator must recover this account' USING ERRCODE='42501';
 END IF;
 IF p_identity_verified IS DISTINCT FROM true OR p_verification_method IS NULL
  OR p_verification_method NOT IN ('in_person','verified_service_desk')
  OR p_verification_reference IS NULL OR p_verification_reference !~ '^[A-Z0-9][A-Z0-9/-]{4,79}$' THEN
  RAISE EXCEPTION 'Verified identity and a case reference are required; do not include personal identifiers' USING ERRCODE='22023';
 END IF;
 SELECT p.* INTO v_profile FROM public.profiles p WHERE p.id=p_target_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recovery account not found' USING ERRCODE='22023'; END IF;
 v_open:=app.open_mfa_recovery(p_target_user_id);
 IF v_open IS NOT NULL THEN
  IF v_open->>'verification_reference' IS DISTINCT FROM p_verification_reference
    OR v_open->>'verification_method' IS DISTINCT FROM p_verification_method THEN
   RAISE EXCEPTION 'Use the existing verified recovery case' USING ERRCODE='22023';
  END IF;
  RETURN v_open||jsonb_build_object('status','prepared');
 END IF;
 SELECT email_confirmed_at IS NOT NULL,banned_until IS NOT NULL AND banned_until>now()
  INTO v_confirmed,v_banned FROM auth.users WHERE id=p_target_user_id FOR UPDATE;
 IF NOT v_profile.is_active OR v_confirmed IS DISTINCT FROM true OR v_banned IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Only an active confirmed account can enter this recovery process' USING ERRCODE='42501';
 END IF;
 IF v_profile.role::text NOT IN ('employer','staff','supervisor','admin','medical')
  AND NOT (v_profile.role::text='applicant' AND EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=p_target_user_id AND is_active)) THEN
  RAISE EXCEPTION 'Account has no Partner authenticator scope' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=p_target_user_id AND status::text='verified') THEN
  RAISE EXCEPTION 'No verified device to recover; sign in and enroll an authenticator' USING ERRCODE='22023';
 END IF;
 v_request:=gen_random_uuid();
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(auth.uid(),'mfa_recovery_prepared','profiles',p_target_user_id,jsonb_build_object(
   'request_id',v_request,'verification_reference',p_verification_reference,'verification_method',p_verification_method,
   'identity_verified',true,'original_role',v_profile.role,'original_active',v_profile.is_active));
 UPDATE public.profiles SET is_active=false WHERE id=p_target_user_id;
 RETURN app.open_mfa_recovery(p_target_user_id)||jsonb_build_object('status','prepared');
END $$;
REVOKE ALL ON FUNCTION public.admin_prepare_mfa_recovery(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_prepare_mfa_recovery(uuid,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mfa_recovery_status(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_case public.audit_logs; v_complete timestamptz;
BEGIN
 PERFORM app.require_recovery_admin();
 SELECT * INTO v_case FROM public.audit_logs WHERE action='mfa_recovery_prepared'
  AND new_data->>'request_id'=p_request_id::text ORDER BY id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recovery case not found' USING ERRCODE='22023'; END IF;
 SELECT created_at INTO v_complete FROM public.audit_logs WHERE action='mfa_recovery_completed'
  AND record_id=v_case.record_id AND new_data->>'request_id'=p_request_id::text ORDER BY id DESC LIMIT 1;
 RETURN v_case.new_data||jsonb_build_object('target_user_id',v_case.record_id,
  'status',CASE WHEN v_complete IS NULL THEN 'prepared' ELSE 'completed' END,
  'completion_recent',v_complete IS NOT NULL AND v_complete>now()-interval '15 minutes',
  'operator_ban_matches',EXISTS(SELECT 1 FROM auth.users WHERE id=v_case.record_id
    AND raw_app_meta_data->>'mfa_recovery_request_id'=p_request_id::text AND banned_until>now()));
END $$;
REVOKE ALL ON FUNCTION public.admin_mfa_recovery_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_recovery_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_complete_mfa_recovery(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_case public.audit_logs; v_profile public.profiles; v_user auth.users;
BEGIN
 PERFORM app.require_recovery_admin();
 SELECT * INTO v_case FROM public.audit_logs WHERE action='mfa_recovery_prepared'
  AND new_data->>'request_id'=p_request_id::text ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR v_case.record_id=auth.uid() THEN RAISE EXCEPTION 'Verified recovery case required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE id=v_case.record_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recovery account not found' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.audit_logs WHERE action='mfa_recovery_completed'
   AND record_id=v_case.record_id AND new_data->>'request_id'=p_request_id::text) THEN
  RETURN public.admin_mfa_recovery_status(p_request_id);
 END IF;
 SELECT * INTO v_user FROM auth.users WHERE id=v_case.record_id FOR UPDATE;
 IF NOT FOUND OR v_user.banned_until IS NULL OR v_user.banned_until<=now()
   OR v_user.raw_app_meta_data->>'mfa_recovery_request_id' IS DISTINCT FROM p_request_id::text
   OR v_profile.is_active OR v_profile.role::text IS DISTINCT FROM v_case.new_data->>'original_role' THEN
  RAISE EXCEPTION 'Recovery hold and operator ban must be verified before completion' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=v_case.record_id)
  OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=v_case.record_id) THEN
  RAISE EXCEPTION 'Remove all authenticators and revoke all sessions before completion' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(auth.uid(),'mfa_recovery_completed','profiles',v_case.record_id,jsonb_build_object(
    'request_id',p_request_id,'original_role',v_profile.role,'factor_count',0,'session_count',0));
 UPDATE public.profiles SET is_active=true WHERE id=v_case.record_id;
 RETURN public.admin_mfa_recovery_status(p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_complete_mfa_recovery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_mfa_recovery(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
