BEGIN;

CREATE OR REPLACE FUNCTION public.admin_link_employer_account(p_employer_id uuid, p_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE v_profile public.profiles; v_employer public.employers;
BEGIN
  PERFORM app.require_identity_admin();
  -- Use the same employer-then-profile lock order as approval. A disabled
  -- identity needs an explicit account activation decision before linking.
  SELECT * INTO v_employer FROM public.employers WHERE id=p_employer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employer not found' USING ERRCODE='22023'; END IF;
  IF v_employer.registered_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This employer is already linked to an account';
  END IF;
  SELECT p.* INTO v_profile FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE lower(u.email)=lower(trim(p_email)) AND u.email_confirmed_at IS NOT NULL FOR UPDATE OF p;
  IF NOT FOUND OR v_profile.role::text NOT IN ('applicant','employer') THEN
    RAISE EXCEPTION 'Eligible account not found; staff identities cannot be replaced';
  END IF;
  IF v_profile.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Activate the account explicitly before linking it to a company' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=v_profile.id) THEN
    RAISE EXCEPTION 'That account is already linked to another employer';
  END IF;
  UPDATE public.employers SET registered_user_id=v_profile.id,updated_at=now() WHERE id=p_employer_id;
  IF v_employer.registration_status='approved' AND v_employer.is_active THEN
    UPDATE public.profiles SET role='employer' WHERE id=v_profile.id;
  END IF;
  RETURN 'Linked';
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_approve_employer(p_employer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_user_id uuid;
  v_profile_role text;
  v_profile_active boolean;
  v_code text;
  v_caller_role text;
BEGIN
  PERFORM app.require_identity_admin();
  SELECT e.registered_user_id INTO v_user_id FROM public.employers e
    WHERE e.id=p_employer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employer % not found', p_employer_id USING ERRCODE='22023'; END IF;
  IF v_user_id IS NOT NULL THEN
    SELECT p.role::text,p.is_active INTO v_profile_role,v_profile_active
      FROM public.profiles p WHERE p.id=v_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked profile % missing for employer %',v_user_id,p_employer_id USING ERRCODE='22023';
    END IF;
    IF v_profile_role NOT IN ('applicant','employer') THEN
      RAISE EXCEPTION 'A staff identity cannot be replaced by an employer role' USING ERRCODE='42501';
    END IF;
    IF v_profile_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Activate the linked account explicitly before approving its company' USING ERRCODE='42501';
    END IF;
  END IF;
  PERFORM 1 FROM public.employer_accreditation_requirements r
    JOIN public.employer_accreditation a ON a.id=r.accreditation_id
    WHERE a.employer_id=p_employer_id FOR UPDATE OF r;
  IF NOT app.employer_requirements_approved(p_employer_id) THEN
    RAISE EXCEPTION 'All applicable accreditation requirements must be approved';
  END IF;
  v_caller_role := app.current_user_role();
  IF auth.uid() IS NULL OR v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employer_accreditation_requirements r
    JOIN public.employer_accreditation a ON a.id=r.accreditation_id
    JOIN public.employers e ON e.id=a.employer_id
    WHERE e.id=p_employer_id AND r.status IS DISTINCT FROM 'approved' AND (
      r.requirement_key IN ('letter_of_intent','company_profile','business_permit','bir_2303',
        'philhealth_registration','pagibig_registration','sss_registration','philjobnet_certificate')
      OR (r.requirement_key='sec_registration' AND e.business_structure IN ('corporation','partnership'))
      OR (r.requirement_key='dti_registration' AND e.business_structure='single_proprietorship')
      OR (r.requirement_key='cda_registration' AND e.business_structure='cooperative')
      OR (r.requirement_key='dole_rule_1020' AND e.employer_type='local_direct')
      OR (r.requirement_key='dole_do174' AND e.employer_type='local_agency')
      OR (r.requirement_key='bosh_certificate' AND e.osh_classification='low_risk')
      OR (r.requirement_key='cosh_certificate' AND e.osh_classification='construction_heavy_industrial')
    )
  ) THEN
    RAISE EXCEPTION 'Cannot approve: not all applicable accreditation requirements are approved yet';
  END IF;
  UPDATE public.employers SET registration_status='approved',rejection_reason=NULL,updated_at=now()
    WHERE id=p_employer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employer % not found',p_employer_id; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employers WHERE id=p_employer_id AND employer_code IS NOT NULL) THEN
    LOOP
      v_code := 'EMP-'||lpad(nextval('public.employer_code_seq'::regclass)::text,6,'0');
      EXIT WHEN NOT EXISTS(SELECT 1 FROM public.employers WHERE employer_code=v_code);
    END LOOP;
    UPDATE public.employers SET employer_code=v_code WHERE id=p_employer_id;
  END IF;
  UPDATE public.employer_accreditation SET status='approved',approved_at=now(),updated_at=now()
    WHERE employer_id=p_employer_id;
  IF v_user_id IS NOT NULL THEN
    -- Approval grants the employer role; it never changes an independent
    -- account activation decision. The target profile is still locked.
    UPDATE public.profiles SET role='employer' WHERE id=v_user_id;
  END IF;
END $fn$;

-- CREATE OR REPLACE retains the existing per-function execution ACLs.
NOTIFY pgrst,'reload schema';
COMMIT;
