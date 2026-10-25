-- Repair the existing administrator credential workflow without changing its public signatures.
-- Auth managed-schema compatibility is tied to the independently inspected DEV schema and native acceptance.
BEGIN;
CREATE OR REPLACE FUNCTION public.hash_password(p_password text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_schema text; v_hash text;
BEGIN
 IF p_password IS NULL OR length(p_password)<8 OR octet_length(p_password)>72 THEN
  RAISE EXCEPTION 'Use a password with at least 8 characters and no more than 72 UTF-8 bytes' USING ERRCODE='22023';
 END IF;
 SELECT n.nspname INTO v_schema FROM pg_catalog.pg_extension e
 JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
 IF v_schema IS NULL THEN RAISE EXCEPTION 'Password service is unavailable'; END IF;
 EXECUTE pg_catalog.format('SELECT %I.crypt($1,%I.gen_salt(''bf'',10))',v_schema,v_schema) INTO v_hash USING p_password;
 RETURN v_hash;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_create_user(
 p_email text,p_password text,p_full_name text DEFAULT NULL::text,p_role text DEFAULT 'staff'::text,
 p_jurisdiction text DEFAULT NULL::text,p_is_provincial boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_id uuid; v_email text; v_hash text;
BEGIN
 PERFORM app.require_identity_admin();
 IF p_role IS NULL OR p_role NOT IN ('staff','supervisor','medical','admin') THEN
  RAISE EXCEPTION 'Choose a supported staff role' USING ERRCODE='22023';
 END IF;
 v_email:=lower(btrim(p_email));
 IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR coalesce(length(p_full_name),0)>200 OR coalesce(length(p_jurisdiction),0)>200 THEN
  RAISE EXCEPTION 'Enter valid account details' USING ERRCODE='22023';
 END IF;
 v_hash:=public.hash_password(p_password);
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=v_email) THEN
  RAISE EXCEPTION 'An account already uses this email; manage the existing identity' USING ERRCODE='22023';
 END IF;
 IF p_role<>'supervisor' THEN p_jurisdiction:=NULL; p_is_provincial:=false; END IF;
 v_id:=gen_random_uuid();
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change,email_change_token_new,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 VALUES('00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',v_email,v_hash,now(),
  '','','','',jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
  jsonb_build_object('full_name',nullif(btrim(p_full_name),'')),now(),now());
 INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
 VALUES(gen_random_uuid(),v_id,v_id::text,jsonb_build_object('sub',v_id::text,'email',v_email,'email_verified',true,'phone_verified',false),'email',now(),now());
 UPDATE public.profiles SET role=p_role::public.tc_user_role,is_active=true,
  full_name=coalesce(nullif(btrim(p_full_name),''),full_name),
  jurisdiction=nullif(btrim(p_jurisdiction),''),is_provincial=coalesce(p_is_provincial,false) WHERE id=v_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account profile was not created'; END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
 VALUES(auth.uid(),'INSERT','profiles',v_id,jsonb_build_object('credential_operation','account_provisioned','assigned_role',p_role));
 RETURN v_id;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'An account already uses these details; manage the existing identity' USING ERRCODE='22023';
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_reset_password(p_user_id uuid,p_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_target uuid; v_hash text; v_sessions integer;
BEGIN
 PERFORM app.require_identity_admin();
 SELECT u.id INTO v_target FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=p_user_id AND coalesce(u.encrypted_password,'')<>''
  AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email')
  AND (p.role::text IN ('staff','supervisor','medical','admin','employer')
    OR EXISTS(SELECT 1 FROM public.employers e WHERE e.registered_user_id=u.id))
 FOR UPDATE OF u;
 IF v_target IS NULL THEN
  RAISE EXCEPTION 'Select an existing Partner account with email and password sign-in' USING ERRCODE='22023';
 END IF;
 v_hash:=public.hash_password(p_password);
 UPDATE auth.users SET encrypted_password=v_hash,updated_at=now() WHERE id=v_target;
 -- Revoke access without deleting session records or removing authenticator factors.
 UPDATE auth.sessions SET not_after=statement_timestamp() WHERE user_id=v_target
  AND (not_after IS NULL OR not_after>statement_timestamp());
 GET DIAGNOSTICS v_sessions=ROW_COUNT;
 UPDATE auth.refresh_tokens SET revoked=true WHERE user_id::text=v_target::text AND revoked IS DISTINCT FROM true;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
 VALUES(auth.uid(),'UPDATE','profiles',v_target,jsonb_build_object('credential_operation','password_reset','sessions_restricted',v_sessions));
END $fn$;
-- Restore only legacy password-account formatting; retain password hashes, roles, flags and provider links.
DO $repair$
DECLARE v_ids uuid[]; v_normalized integer; v_added integer;
BEGIN
 SELECT array_agg(id) INTO v_ids FROM (
  SELECT id FROM auth.users WHERE coalesce(encrypted_password,'')<>''
   AND (confirmation_token IS NULL OR recovery_token IS NULL OR email_change IS NULL OR email_change_token_new IS NULL)
  FOR UPDATE
 ) legacy;
 IF coalesce(cardinality(v_ids),0)>0 THEN
  UPDATE auth.users SET confirmation_token=coalesce(confirmation_token,''),recovery_token=coalesce(recovery_token,''),
   email_change=coalesce(email_change,''),email_change_token_new=coalesce(email_change_token_new,'') WHERE id=ANY(v_ids);
  GET DIAGNOSTICS v_normalized=ROW_COUNT;
  -- Add the missing identity only for a confirmed, unambiguous Partner/company email account.
  -- Existing identities (including Google), ambiguous addresses and unconfirmed accounts are left intact.
  INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
  SELECT gen_random_uuid(),u.id,u.id::text,jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true,'phone_verified',false),'email',now(),now()
  FROM auth.users u WHERE u.id=ANY(v_ids) AND u.email_confirmed_at IS NOT NULL
   AND u.raw_app_meta_data->>'provider'='email' AND u.raw_app_meta_data->'providers'='["email"]'::jsonb
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=u.id AND
    (p.role::text IN ('staff','supervisor','medical','admin','employer') OR EXISTS(SELECT 1 FROM public.employers e WHERE e.registered_user_id=u.id)))
   AND u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   AND NOT EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=u.id)
   AND NOT EXISTS(SELECT 1 FROM auth.users other WHERE other.id<>u.id AND lower(other.email)=lower(u.email));
  GET DIAGNOSTICS v_added=ROW_COUNT;
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
  VALUES(NULL,'UPDATE','auth.users',NULL,jsonb_build_object('credential_operation','legacy_auth_compatibility',
   'accounts_normalized',v_normalized,'email_identities_added',v_added));
 END IF;
END $repair$;
COMMIT;
