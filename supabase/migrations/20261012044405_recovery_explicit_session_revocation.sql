-- Verified DEV behavior: Auth Admin factor deletion downgrades the session;
-- it does not remove every session/refresh token. Recovery must revoke them
-- explicitly, scoped to a verified case, while the account and Auth ban hold.
BEGIN;

CREATE OR REPLACE FUNCTION app.session_aal2_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,auth AS $$
 SELECT app.auth_session_active() AND COALESCE(auth.jwt()->>'aal','aal1')='aal2'
 AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=auth.uid()
  AND s.id=CASE WHEN auth.jwt()->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (auth.jwt()->>'session_id')::uuid ELSE NULL END
  AND s.aal::text='aal2')
$$;
REVOKE ALL ON FUNCTION app.session_aal2_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.session_aal2_satisfied() TO authenticated,service_role;

-- Keep session existence separate from Partner assurance: Google jobseekers
-- do not acquire an extra MFA requirement when an optional factor is removed.
CREATE OR REPLACE FUNCTION app.partner_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
 SELECT CASE
 WHEN auth.uid() IS NULL THEN true
 WHEN NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN false
 WHEN NOT app.auth_session_active() THEN false
 WHEN NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL
   AND (banned_until IS NULL OR banned_until<=now())) THEN false
 WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text='medical')
   AND NOT EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=auth.uid())
   AND EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status::text='verified')
 THEN app.session_aal2_satisfied()
 WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND
   (role::text IN ('staff','supervisor','admin','employer') OR
    (role::text='medical' AND EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status::text='verified'))))
 THEN app.session_aal2_satisfied()
  AND EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=auth.uid() AND f.status::text='verified'
   AND f.factor_type::text='totp' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) m
    WHERE m->>'method'='totp' AND f.created_at<=to_timestamp(
      CASE WHEN m->>'timestamp' ~ '^[0-9]{1,10}$' THEN (m->>'timestamp')::bigint+1 ELSE 0 END)))
 ELSE true END
$$;
REVOKE ALL ON FUNCTION app.partner_mfa_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.partner_mfa_satisfied() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.employer_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT app.partner_mfa_satisfied() AND auth.uid() IS NOT NULL AND app.session_aal2_satisfied()
 AND EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=auth.uid() AND f.status::text='verified' AND f.factor_type::text='totp'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) m
   WHERE m->>'method'='totp' AND f.created_at<=to_timestamp(
    CASE WHEN m->>'timestamp' ~ '^[0-9]{1,10}$' THEN (m->>'timestamp')::bigint+1 ELSE 0 END)))
$$;
REVOKE ALL ON FUNCTION app.employer_mfa_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.employer_mfa_satisfied() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_complete_mfa_recovery(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_case public.audit_logs; v_profile public.profiles; v_user auth.users;
 v_sessions bigint; v_refresh_tokens bigint;
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
 -- The user lock and provider ban prevent a new primary session racing this
 -- removal. Existing profile/session guards already deny the held account.
 SELECT * INTO v_user FROM auth.users WHERE id=v_case.record_id FOR UPDATE;
 IF NOT FOUND OR v_user.banned_until IS NULL OR v_user.banned_until<=now()
   OR v_user.raw_app_meta_data->>'mfa_recovery_request_id' IS DISTINCT FROM p_request_id::text
   OR v_profile.is_active OR v_profile.role::text IS DISTINCT FROM v_case.new_data->>'original_role' THEN
  RAISE EXCEPTION 'Recovery hold and operator ban must be verified before completion' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=v_case.record_id) THEN
  RAISE EXCEPTION 'Remove all authenticators before recovery session revocation' USING ERRCODE='42501';
 END IF;
 -- Includes legacy refresh-token rows without a session_id. Values are never
 -- read or returned. The verified DEV session FK also cascades bound tokens.
 DELETE FROM auth.refresh_tokens WHERE user_id=v_case.record_id::text;
 GET DIAGNOSTICS v_refresh_tokens=ROW_COUNT;
 DELETE FROM auth.sessions WHERE user_id=v_case.record_id;
 GET DIAGNOSTICS v_sessions=ROW_COUNT;
 IF EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=v_case.record_id)
  OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=v_case.record_id)
  OR EXISTS(SELECT 1 FROM auth.refresh_tokens WHERE user_id=v_case.record_id::text) THEN
  RAISE EXCEPTION 'Recovery session revocation could not be verified' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(auth.uid(),'mfa_recovery_sessions_revoked','profiles',v_case.record_id,jsonb_build_object(
    'request_id',p_request_id,'sessions_revoked',v_sessions,'refresh_tokens_revoked',v_refresh_tokens));
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(auth.uid(),'mfa_recovery_completed','profiles',v_case.record_id,jsonb_build_object(
    'request_id',p_request_id,'original_role',v_profile.role,'factor_count',0,'session_count',0,'refresh_token_count',0));
 UPDATE public.profiles SET is_active=true WHERE id=v_case.record_id;
 RETURN public.admin_mfa_recovery_status(p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_complete_mfa_recovery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_mfa_recovery(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
