BEGIN;

CREATE FUNCTION public.admin_reactivate_employer_account(
  p_employer_id uuid, p_email text, p_reason_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_company public.employers;
  v_profile_id uuid;
  v_role text;
  v_active boolean;
  v_email text;
  v_confirmed_at timestamptz;
  v_banned_until timestamptz;
BEGIN
  PERFORM app.require_identity_admin();
  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'identity_and_access_reviewed', 'prior_deactivation_corrected'
  ) THEN
    RAISE EXCEPTION 'Choose a valid account-activation reason' USING ERRCODE='22023';
  END IF;
  SELECT e.* INTO v_company FROM public.employers e
    WHERE e.id=p_employer_id FOR UPDATE;
  IF NOT FOUND OR v_company.is_active IS DISTINCT FROM true
    OR v_company.registration_status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'Active pending or approved company required' USING ERRCODE='42501';
  END IF;
  IF v_company.registered_user_id IS NULL AND
    (p_email IS NULL OR btrim(p_email)='' OR length(btrim(p_email))>254) THEN
    RAISE EXCEPTION 'Exact account email required before linking' USING ERRCODE='22023';
  END IF;
  -- Match the lock order used by company link and approval. This routine
  -- changes account activation only; it never links or approves a company.
  SELECT p.id,p.role::text,p.is_active,u.email,u.email_confirmed_at,u.banned_until
    INTO v_profile_id,v_role,v_active,v_email,v_confirmed_at,v_banned_until
    FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE (v_company.registered_user_id IS NOT NULL AND p.id=v_company.registered_user_id)
       OR (v_company.registered_user_id IS NULL AND lower(u.email)=lower(btrim(p_email)))
    FOR UPDATE OF p,u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible linked or selected account not found' USING ERRCODE='22023';
  END IF;
  IF p_email IS NOT NULL AND btrim(p_email)<>'' AND
    lower(v_email) IS DISTINCT FROM lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'Account email does not match the selected company identity' USING ERRCODE='22023';
  END IF;
  IF v_role NOT IN ('applicant','employer') OR v_confirmed_at IS NULL
    OR (v_banned_until IS NOT NULL AND v_banned_until>now()) THEN
    RAISE EXCEPTION 'Account is not eligible for company activation' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.employers e
    WHERE e.registered_user_id=v_profile_id AND e.id<>p_employer_id) THEN
    RAISE EXCEPTION 'Account already belongs to another company' USING ERRCODE='42501';
  END IF;
  IF v_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Account is already active' USING ERRCODE='22023';
  END IF;
  UPDATE public.profiles SET is_active=true WHERE id=v_profile_id AND is_active=false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account status changed; reload and review again' USING ERRCODE='40001';
  END IF;
  -- Existing profile-authority trigger records the state transition. This
  -- separate decision records the reason category without contact/private text.
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
    VALUES(auth.uid(),'employer_account_reactivated','profiles',v_profile_id,
      jsonb_build_object('employer_id',p_employer_id,'reason_code',p_reason_code));
END $fn$;

REVOKE ALL ON FUNCTION public.admin_reactivate_employer_account(uuid,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_employer_account(uuid,text,text)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
