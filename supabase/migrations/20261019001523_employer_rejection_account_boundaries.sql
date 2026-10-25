BEGIN;
CREATE OR REPLACE FUNCTION public.admin_reject_employer(p_employer_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_user_id uuid;
BEGIN
 PERFORM app.require_identity_admin();
 SELECT registered_user_id INTO v_user_id FROM public.employers WHERE id=p_employer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employer not found' USING ERRCODE='22023';END IF;
 UPDATE public.employers SET registration_status='rejected',rejection_reason=nullif(btrim(p_reason),''),updated_at=now()
 WHERE id=p_employer_id;
 UPDATE public.employer_accreditation SET status='rejected',updated_at=now() WHERE employer_id=p_employer_id;
 -- Company rejection ends an employer identity's portal access. It must not
 -- deactivate a pending applicant's separate jobseeker identity or a staff identity.
 IF v_user_id IS NOT NULL THEN
  UPDATE public.profiles SET is_active=false WHERE id=v_user_id AND role::text='employer' AND is_active=true;
 END IF;
END $fn$;
-- Preserve existing execution ACLs; canonical active-admin/TOTP/session guard remains mandatory.
NOTIFY pgrst,'reload schema';
COMMIT;
