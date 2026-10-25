
-- Authorized DEV increment. Keep existing ownership/RLS and canonical tables.
BEGIN;

-- Public signup metadata cannot create any Partner role.
CREATE OR REPLACE FUNCTION app.create_profile_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.profiles(id,email,full_name,role,is_active)
  VALUES(NEW.id,NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name'),
    'applicant'::public.tc_user_role,true)
  ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.auth_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,auth AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=auth.uid()
  AND s.id=CASE WHEN auth.jwt()->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (auth.jwt()->>'session_id')::uuid ELSE NULL END
  AND (s.not_after IS NULL OR s.not_after>now()))
$$;
REVOKE ALL ON FUNCTION app.auth_session_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.auth_session_active() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.identity_admin_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT auth.uid() IS NOT NULL AND COALESCE(auth.jwt()->>'aal','aal1')='aal2'
 AND app.partner_mfa_satisfied()
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE p.id=auth.uid() AND p.is_active AND p.role::text='admin' AND u.email_confirmed_at IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now()))
$$;
REVOKE ALL ON FUNCTION app.identity_admin_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.identity_admin_satisfied() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.require_identity_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT app.identity_admin_satisfied() THEN
  RAISE EXCEPTION 'Active administrator with authenticator verification required' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION app.require_identity_admin() FROM PUBLIC,anon,authenticated;

-- No user_metadata or login-category claim is read by this predicate.
-- Google identity comes from Auth's server-managed identity table. Other OAuth
-- providers are unsupported for jobseeker accounts; password/email identities
-- may coexist but password-only sessions never satisfy the OAuth requirement.
CREATE OR REPLACE FUNCTION app.google_jobseeker_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
 SELECT auth.uid() IS NOT NULL
 AND app.auth_session_active()
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
   AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until <= now()))
 AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=auth.uid() AND i.provider='google')
 AND NOT EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=auth.uid() AND i.provider NOT IN ('google','email'))
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) method
   WHERE method->>'method'='oauth')
$$;
REVOKE ALL ON FUNCTION app.google_jobseeker_session() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.google_jobseeker_session() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.jobseeker_identity_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT app.google_jobseeker_session()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.role::text='applicant')
 AND NOT EXISTS(SELECT 1 FROM public.employers e WHERE e.registered_user_id=auth.uid() AND e.registration_status='approved' AND e.is_active)
$$;
REVOKE ALL ON FUNCTION app.jobseeker_identity_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.jobseeker_identity_satisfied() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.require_jobseeker_identity()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT app.jobseeker_identity_satisfied() THEN
  RAISE EXCEPTION 'Verified Google jobseeker identity required' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION app.require_jobseeker_identity() FROM PUBLIC,anon,authenticated;

-- Retain AAL2 for legacy employer profiles and prospective employers without
-- assigning them an employer role. Approval and ownership still grant access.
CREATE OR REPLACE FUNCTION app.partner_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
 SELECT CASE
 WHEN auth.uid() IS NULL THEN true
 WHEN NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN false
 WHEN NOT app.auth_session_active() THEN false
 WHEN NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL
   AND (banned_until IS NULL OR banned_until<=now())) THEN false
 WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text='medical')
   AND NOT EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=auth.uid())
   AND EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status::text='verified')
 THEN COALESCE(auth.jwt()->>'aal','aal1')='aal2'
 WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND
   (role::text IN ('staff','supervisor','admin','employer') OR
    (role::text='medical' AND EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status::text='verified'))))
 THEN COALESCE(auth.jwt()->>'aal','aal1')='aal2'
  AND EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=auth.uid() AND f.status::text='verified'
   AND f.factor_type::text='totp' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) method
    WHERE method->>'method'='totp' AND f.created_at <= to_timestamp(
      CASE WHEN method->>'timestamp' ~ '^[0-9]{1,10}$' THEN (method->>'timestamp')::bigint+1 ELSE 0 END)))
 ELSE true END
$$;
REVOKE ALL ON FUNCTION app.partner_mfa_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.partner_mfa_satisfied() TO authenticated,service_role;

-- Prospective employer scope is separate from the applicant role. Pending
-- applications cannot take away Google jobseeker access or force jobseeker MFA.
CREATE OR REPLACE FUNCTION app.employer_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT app.partner_mfa_satisfied() AND auth.uid() IS NOT NULL
 AND COALESCE(auth.jwt()->>'aal','aal1')='aal2'
 AND EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=auth.uid() AND f.status::text='verified' AND f.factor_type::text='totp'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) method
   WHERE method->>'method'='totp' AND f.created_at<=to_timestamp(
    CASE WHEN method->>'timestamp' ~ '^[0-9]{1,10}$' THEN (method->>'timestamp')::bigint+1 ELSE 0 END)))
$$;
REVOKE ALL ON FUNCTION app.employer_mfa_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.employer_mfa_satisfied() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS public.user_role LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_role public.user_role;
BEGIN
 SELECT p.role::text::public.user_role INTO v_role FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active;
 -- A concrete least-privilege value avoids SQL NULL comparison bypasses in
 -- legacy callers. The canonical stored role is unchanged.
 IF v_role IS NULL THEN RETURN 'applicant'::public.user_role; END IF;
 IF NOT app.partner_mfa_satisfied() THEN
  RAISE EXCEPTION 'Authenticator verification required' USING ERRCODE='42501';
 END IF;
 IF v_role::text='employer' AND NOT EXISTS(SELECT 1 FROM public.employers
   WHERE registered_user_id=auth.uid() AND registration_status='approved' AND is_active) THEN
  RETURN 'applicant'::public.user_role;
 END IF;
 RETURN v_role;
END $$;

CREATE OR REPLACE FUNCTION public.app_current_user_role_text()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$ SELECT app.current_user_role()::text $$;

-- Exact self-only pre-MFA bootstrap. No caller-selected ID or profile creation.
CREATE OR REPLACE FUNCTION public.auth_account_bootstrap()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT jsonb_build_object('id',p.id,'email',p.email,'full_name',p.full_name,
  'role',p.role,'is_active',p.is_active AND app.auth_session_active() AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())),
  'jurisdiction',p.jurisdiction,'is_provincial',p.is_provincial,
  'employer_association_count',(SELECT count(*) FROM public.employers WHERE registered_user_id=p.id),
  'employer_application',CASE WHEN (SELECT count(*) FROM public.employers WHERE registered_user_id=p.id)=1
    THEN (SELECT jsonb_build_object('id',e.id,'registration_status',e.registration_status,'is_active',e.is_active)
      FROM public.employers e WHERE e.registered_user_id=p.id) ELSE NULL END,
  'partner_authorized',p.is_active AND (p.role::text IN ('staff','supervisor','admin','medical') OR
    (p.role::text='employer' AND EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=p.id AND registration_status='approved' AND is_active))),
  'jobseeker_authorized',p.is_active AND app.jobseeker_identity_satisfied(),
  'mfa_satisfied',app.partner_mfa_satisfied(),
  'employer_mfa_satisfied',app.employer_mfa_satisfied(),
  'mfa_required',p.role::text IN ('staff','supervisor','admin','employer')
    OR (p.role::text='medical' AND EXISTS(SELECT 1 FROM auth.mfa_factors WHERE user_id=p.id AND status::text='verified')))
 FROM public.profiles p WHERE p.id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.auth_account_bootstrap() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.auth_account_bootstrap() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app.enforce_partner_mfa()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_role text;
BEGIN
 IF current_setting('request.path',true) IN ('/rpc/auth_account_bootstrap','/rpc/register_employer_application') THEN RETURN; END IF;
 IF NOT app.partner_mfa_satisfied() THEN
  RAISE EXCEPTION 'Authenticator verification required' USING ERRCODE='42501';
 END IF;
 SELECT role::text INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF v_role='applicant' AND NOT app.google_jobseeker_session()
    AND NOT (EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=auth.uid()) AND app.employer_mfa_satisfied()) THEN
  RAISE EXCEPTION 'Jobseekers sign in with Google' USING ERRCODE='42501';
 END IF;
END $$;

-- Defense at the table boundary as well as the PostgREST hook.
CREATE OR REPLACE FUNCTION app.jobseeker_data_session_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT app.jobseeker_identity_satisfied() OR
  (app.partner_mfa_satisfied() AND EXISTS(SELECT 1 FROM public.profiles
    WHERE id=auth.uid() AND is_active AND role::text IN ('staff','supervisor','medical','admin')))
$$;
REVOKE ALL ON FUNCTION app.jobseeker_data_session_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.jobseeker_data_session_satisfied() TO authenticated,service_role;

DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN (
   'participants','jobseeker_profiles','work_experiences','returning_ofw_profiles','returning_worker_profiles',
   'jobseeker_skills','jobseeker_education','jobseeker_certifications','jobseeker_languages','jobseeker_special_sectors',
   'jobseeker_occupation_preferences','jobseeker_industry_preferences','jobseeker_location_preferences',
   'jobseeker_employment_type_preferences','jobseeker_work_arrangement_preferences')
 LOOP
  EXECUTE format('CREATE POLICY authoritative_jobseeker_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT app.jobseeker_data_session_satisfied())) WITH CHECK ((SELECT app.jobseeker_data_session_satisfied()))',t.relname);
 END LOOP;
END $$;

CREATE POLICY authoritative_resume_session ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (bucket_id <> 'resumes' OR (SELECT app.jobseeker_data_session_satisfied()))
WITH CHECK (bucket_id <> 'resumes' OR (SELECT app.jobseeker_data_session_satisfied()));

-- Realtime/Storage and direct table access must obey the provider policy too,
-- even when they do not execute PostgREST's pre-request callback.
CREATE OR REPLACE FUNCTION app.platform_identity_session_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active
  AND app.partner_mfa_satisfied()
 AND CASE WHEN p.role::text='applicant' THEN app.google_jobseeker_session()
    OR (EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=p.id) AND app.employer_mfa_satisfied())
    ELSE true END)
$$;
REVOKE ALL ON FUNCTION app.platform_identity_session_satisfied() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.platform_identity_session_satisfied() TO authenticated,service_role;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND c.relrowsecurity AND (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects'))
 LOOP
  EXECUTE format('CREATE POLICY authoritative_identity_session ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT app.platform_identity_session_satisfied())) WITH CHECK ((SELECT app.platform_identity_session_satisfied()))',t.nspname,t.relname);
 END LOOP;
END $$;

CREATE POLICY accreditation_totp_session ON public.employer_accreditation AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT app.employer_mfa_satisfied())) WITH CHECK ((SELECT app.employer_mfa_satisfied()));
CREATE POLICY accreditation_requirement_totp_session ON public.employer_accreditation_requirements AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT app.employer_mfa_satisfied())) WITH CHECK ((SELECT app.employer_mfa_satisfied()));
CREATE POLICY employer_update_totp_session ON public.employers AS RESTRICTIVE FOR UPDATE TO authenticated
 USING ((SELECT app.employer_mfa_satisfied())) WITH CHECK ((SELECT app.employer_mfa_satisfied()));
CREATE POLICY employer_delete_totp_session ON public.employers AS RESTRICTIVE FOR DELETE TO authenticated
 USING ((SELECT app.employer_mfa_satisfied()));
CREATE POLICY accreditation_storage_totp_session ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id<>'accreditation-documents' OR (SELECT app.employer_mfa_satisfied()))
 WITH CHECK (bucket_id<>'accreditation-documents' OR (SELECT app.employer_mfa_satisfied()));

-- Existing table policies still determine WHICH rows; triggers freeze the
-- authorization fields even on otherwise permitted self-service updates.
CREATE OR REPLACE FUNCTION app.guard_profile_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
 IF ROW(NEW.id,NEW.email,NEW.role,NEW.is_active,NEW.jurisdiction,NEW.is_provincial)
    IS DISTINCT FROM ROW(OLD.id,OLD.email,OLD.role,OLD.is_active,OLD.jurisdiction,OLD.is_provincial)
 AND current_setting('role',true) NOT IN ('none','postgres','supabase_admin','service_role')
 AND NOT app.identity_admin_satisfied() THEN
  RAISE EXCEPTION 'Profile permissions can only be changed by a verified administrator' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_profile_authority() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_profile_authority BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app.guard_profile_authority();

CREATE OR REPLACE FUNCTION app.guard_employer_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
 IF current_setting('role',true) IN ('none','postgres','supabase_admin','service_role') OR app.identity_admin_satisfied() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NULL OR NEW.registered_user_id IS DISTINCT FROM auth.uid()
   OR NEW.registration_status IS DISTINCT FROM 'pending' OR NEW.registration_source IS DISTINCT FROM 'self_registered'
   OR NEW.is_active IS DISTINCT FROM true OR NEW.employer_code IS NOT NULL THEN
   RAISE EXCEPTION 'Pending owner application required' USING ERRCODE='42501';
  END IF;
 ELSE
  IF ROW(NEW.id,NEW.registered_user_id,NEW.registration_status,NEW.registration_source,NEW.is_active,NEW.employer_code)
     IS DISTINCT FROM ROW(OLD.id,OLD.registered_user_id,OLD.registration_status,OLD.registration_source,OLD.is_active,OLD.employer_code)
    OR (OLD.registration_status='approved' AND ROW(NEW.employer_type,NEW.business_structure,NEW.osh_classification)
       IS DISTINCT FROM ROW(OLD.employer_type,OLD.business_structure,OLD.osh_classification)) THEN
   RAISE EXCEPTION 'Approval and accreditation changes require verified PESO administration' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_employer_authority() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_employer_authority BEFORE INSERT OR UPDATE ON public.employers FOR EACH ROW EXECUTE FUNCTION app.guard_employer_authority();

-- One linked account per company identity, matching the existing service and
-- admin-link contract. Refuse migration if existing duplicates need review.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id IS NOT NULL GROUP BY registered_user_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Review duplicate employer account associations before applying this migration';
 END IF;
END $$;
CREATE UNIQUE INDEX employers_registered_user_identity_unique ON public.employers(registered_user_id) WHERE registered_user_id IS NOT NULL;

-- Remove the public direct-insert path. The narrowly scoped RPC below derives
-- ownership and pending state and creates no Partner role.
DROP POLICY IF EXISTS "Employers register own company" ON public.employers;
CREATE OR REPLACE FUNCTION public.register_employer_application(p_application jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_role text; v_email text;
BEGIN
 IF v_uid IS NULL OR jsonb_typeof(p_application) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Authenticated company application required' USING ERRCODE='42501';
 END IF;
 SELECT p.role::text,u.email INTO v_role,v_email FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=v_uid AND p.is_active AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now());
 IF v_role IS NULL OR v_role NOT IN ('applicant','employer') OR NOT app.auth_session_active() THEN
  RAISE EXCEPTION 'This account cannot submit a company application' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('employer-application:'||v_uid::text,0));
 SELECT id INTO v_id FROM public.employers WHERE registered_user_id=v_uid FOR UPDATE;
 IF FOUND THEN RETURN v_id; END IF;
 IF length(trim(COALESCE(p_application->>'company_name',''))) NOT BETWEEN 2 AND 200
  OR length(trim(COALESCE(p_application->>'contact_person',''))) NOT BETWEEN 2 AND 200
  OR COALESCE(p_application->>'contact_number','') !~ '^[0-9]{7,11}$'
  OR COALESCE(p_application->>'employer_type','') NOT IN ('local_direct','local_agency')
  OR COALESCE(p_application->>'business_structure','') NOT IN ('corporation','partnership','single_proprietorship','cooperative')
  OR COALESCE(p_application->>'osh_classification','') NOT IN ('low_risk','construction_heavy_industrial') THEN
  RAISE EXCEPTION 'Complete valid company, contact, business registration and safety information' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(p_application) f WHERE length(f.value)>2000) THEN
  RAISE EXCEPTION 'Company application field is too long' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.employers(company_name,employer_type,license_no,tin,business_structure,osh_classification,
  industry,contact_person,contact_number,email,address,building_street,province,municipality_city,barangay,
  has_cagayan_branch,branch_building_street,branch_province,branch_municipality_city,branch_barangay,branch_address,
  registration_status,registration_source,registered_user_id,is_active)
 VALUES(trim(p_application->>'company_name'),p_application->>'employer_type',nullif(p_application->>'license_no',''),
  nullif(p_application->>'tin',''),p_application->>'business_structure',p_application->>'osh_classification',
  nullif(p_application->>'industry',''),trim(p_application->>'contact_person'),p_application->>'contact_number',v_email,
  nullif(p_application->>'address',''),nullif(p_application->>'building_street',''),nullif(p_application->>'province',''),
  nullif(p_application->>'municipality_city',''),nullif(p_application->>'barangay',''),
  COALESCE((p_application->>'has_cagayan_branch')::boolean,false),nullif(p_application->>'branch_building_street',''),
  nullif(p_application->>'branch_province',''),nullif(p_application->>'branch_municipality_city',''),
  nullif(p_application->>'branch_barangay',''),nullif(p_application->>'branch_address',''),'pending','self_registered',v_uid,true)
 RETURNING id INTO v_id;
 UPDATE public.profiles SET full_name=trim(p_application->>'contact_person') WHERE id=v_uid;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.register_employer_application(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_employer_application(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_participant()
RETURNS public.participants LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_p public.participants;
BEGIN
 PERFORM app.require_jobseeker_identity();
 SELECT * INTO v_p FROM public.participants WHERE auth_user_id=auth.uid();
 IF NOT FOUND THEN INSERT INTO public.participants(auth_user_id) VALUES(auth.uid()) RETURNING * INTO v_p; END IF;
 RETURN v_p;
END $$;
REVOKE ALL ON FUNCTION public.get_or_create_participant() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_participant() TO authenticated;

-- Approval requires every applicable requirement, including rows that might
-- have failed to seed. A missing row is not equivalent to approved evidence.
CREATE OR REPLACE FUNCTION app.employer_requirements_approved(p_employer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT EXISTS(SELECT 1 FROM public.employers e WHERE e.id=p_employer_id AND e.is_active
  AND e.business_structure IN ('corporation','partnership','single_proprietorship','cooperative')
  AND e.osh_classification IN ('low_risk','construction_heavy_industrial')
  AND EXISTS(SELECT 1 FROM public.employer_accreditation a WHERE a.employer_id=e.id)
  AND NOT EXISTS(
   SELECT 1 FROM (VALUES
    ('letter_of_intent'),('company_profile'),('business_permit'),('bir_2303'),('philhealth_registration'),
    ('pagibig_registration'),('sss_registration'),('philjobnet_certificate'),
    (CASE WHEN e.business_structure IN ('corporation','partnership') THEN 'sec_registration'
      WHEN e.business_structure='single_proprietorship' THEN 'dti_registration' ELSE 'cda_registration' END),
    (CASE WHEN e.employer_type='local_direct' THEN 'dole_rule_1020' ELSE 'dole_do174' END),
    (CASE WHEN e.osh_classification='low_risk' THEN 'bosh_certificate' ELSE 'cosh_certificate' END)
   ) required(key)
   WHERE NOT EXISTS(SELECT 1 FROM public.employer_accreditation_requirements r
    JOIN public.employer_accreditation a ON a.id=r.accreditation_id
    WHERE a.employer_id=e.id AND r.requirement_key=required.key AND r.status='approved'
      AND r.document_path=e.id::text||'/'||r.id::text||'.pdf'
      AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='accreditation-documents' AND o.name=r.document_path))
  )
 )
$$;
REVOKE ALL ON FUNCTION app.employer_requirements_approved(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_link_employer_account(p_employer_id uuid,p_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_profile public.profiles; v_employer public.employers;
BEGIN
 PERFORM app.require_identity_admin();
 SELECT p.* INTO v_profile FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE lower(u.email)=lower(trim(p_email)) AND u.email_confirmed_at IS NOT NULL FOR UPDATE OF p;
 IF NOT FOUND OR v_profile.role::text NOT IN ('applicant','employer') THEN
  RAISE EXCEPTION 'Eligible account not found; staff identities cannot be replaced';
 END IF;
 SELECT * INTO v_employer FROM public.employers WHERE id=p_employer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employer not found'; END IF;
 IF v_employer.registered_user_id IS NOT NULL THEN RAISE EXCEPTION 'This employer is already linked to an account'; END IF;
 IF EXISTS(SELECT 1 FROM public.employers WHERE registered_user_id=v_profile.id) THEN RAISE EXCEPTION 'That account is already linked to another employer'; END IF;
 UPDATE public.employers SET registered_user_id=v_profile.id,updated_at=now() WHERE id=p_employer_id;
 IF v_employer.registration_status='approved' AND v_employer.is_active THEN
  UPDATE public.profiles SET role='employer',is_active=true WHERE id=v_profile.id;
 END IF;
 RETURN 'Linked';
END $$;
REVOKE ALL ON FUNCTION public.admin_link_employer_account(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_link_employer_account(uuid,text) TO authenticated;

-- Guards for the existing large profile writer and existing approval/rejection
-- bodies follow below; all existing persistence/approval behavior is retained.

CREATE OR REPLACE FUNCTION public.save_jobseeker_profile(p_profile jsonb)
 RETURNS jobseeker_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_participant public.participants;
  v_updated public.jobseeker_profiles;
  v_years_exp integer;
  v_ofw_years numeric;
  v_rw_years numeric;
  v_grad_year smallint;
  v_expected_grad_year smallint;
begin
  PERFORM app.require_jobseeker_identity();
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_participant from public.participants where auth_user_id = auth.uid();
  if not found then
    insert into public.participants (auth_user_id) values (auth.uid()) returning * into v_participant;
  end if;

  -- Numeric-tolerant casts
  v_years_exp := case when p_profile ->> 'years_of_experience' ~ '^[0-9]+$'
                      then (p_profile ->> 'years_of_experience')::integer else null end;
  v_ofw_years := case when p_profile ->> 'ofw_years_abroad' ~ '^[0-9]+(\.[0-9]+)?$'
                      then (p_profile ->> 'ofw_years_abroad')::numeric else null end;
  v_rw_years  := case when p_profile ->> 'rw_years_worked' ~ '^[0-9]+(\.[0-9]+)?$'
                      then (p_profile ->> 'rw_years_worked')::numeric else null end;
  v_grad_year := case when p_profile ->> 'first_time_graduation_year' ~ '^[0-9]{4}$'
                      then (p_profile ->> 'first_time_graduation_year')::smallint else null end;
  v_expected_grad_year := case when p_profile ->> 'expected_graduation_year' ~ '^[0-9]{4}$'
                      then (p_profile ->> 'expected_graduation_year')::smallint else null end;

  insert into public.jobseeker_profiles (
    participant_id, first_name, middle_name, last_name,
    birthdate, sex, civil_status, barangay, municipality_city, province,
    contact_no, email,
    first_time_jobseeker, returning_ofw, returning_worker,
    interested_in_skills_training, preferred_training_program,
    has_disability, disability_type, peso_assistance_programs,
    highest_educational_attainment, course_program, employment_preference,
    resume_path, data_subject_rights_agreed, interview_location,
    current_employment_status, previous_occupation, previous_industry,
    years_of_experience, skills, desired_occupation, desired_industry,
    desired_salary, willing_to_relocate,
    accommodation_needed, employment_accommodation_notes,
    first_time_school, first_time_graduation_year, first_time_ojt_experience,
    ofw_country_last_worked, ofw_previous_employer, ofw_previous_occupation,
    ofw_years_abroad, ofw_date_returned, ofw_reason_for_return,
    rw_previous_work_location, rw_previous_employer, rw_previous_occupation,
    rw_years_worked, rw_date_returned, rw_reason_for_return,
    is_currently_student, current_school_name, current_education_level,
    current_grade_year_level, current_program_or_strand, expected_graduation_year
  ) values (
    v_participant.id,
    p_profile ->> 'first_name', p_profile ->> 'middle_name', p_profile ->> 'last_name',
    nullif(p_profile ->> 'birthdate', '')::date, p_profile ->> 'sex', p_profile ->> 'civil_status',
    p_profile ->> 'barangay', p_profile ->> 'municipality_city', p_profile ->> 'province',
    p_profile ->> 'contact_no', p_profile ->> 'email',
    coalesce((p_profile ->> 'first_time_jobseeker')::boolean, false),
    coalesce((p_profile ->> 'returning_ofw')::boolean, false),
    coalesce((p_profile ->> 'returning_worker')::boolean, false),
    coalesce((p_profile ->> 'interested_in_skills_training')::boolean, false),
    p_profile ->> 'preferred_training_program',
    coalesce((p_profile ->> 'has_disability')::boolean, false),
    p_profile ->> 'disability_type',
    coalesce(array(select jsonb_array_elements_text(p_profile -> 'peso_assistance_programs')), '{}'::text[]),
    p_profile ->> 'highest_educational_attainment', p_profile ->> 'course_program',
    p_profile ->> 'employment_preference',
    p_profile ->> 'resume_path', true,
    p_profile ->> 'interview_location',
    p_profile ->> 'current_employment_status', p_profile ->> 'previous_occupation',
    p_profile ->> 'previous_industry',
    v_years_exp,
    p_profile ->> 'skills', p_profile ->> 'desired_occupation',
    p_profile ->> 'desired_industry', p_profile ->> 'desired_salary',
    coalesce((p_profile ->> 'willing_to_relocate')::boolean, false),
    p_profile ->> 'accommodation_needed', p_profile ->> 'employment_accommodation_notes',
    p_profile ->> 'first_time_school',
    v_grad_year,
    p_profile ->> 'first_time_ojt_experience',
    p_profile ->> 'ofw_country_last_worked', p_profile ->> 'ofw_previous_employer',
    p_profile ->> 'ofw_previous_occupation',
    v_ofw_years,
    nullif(p_profile ->> 'ofw_date_returned', '')::date,
    p_profile ->> 'ofw_reason_for_return',
    p_profile ->> 'rw_previous_work_location', p_profile ->> 'rw_previous_employer',
    p_profile ->> 'rw_previous_occupation',
    v_rw_years,
    nullif(p_profile ->> 'rw_date_returned', '')::date,
    p_profile ->> 'rw_reason_for_return',
    coalesce((p_profile ->> 'is_currently_student')::boolean, false),
    p_profile ->> 'current_school_name',
    p_profile ->> 'current_education_level',
    p_profile ->> 'current_grade_year_level',
    p_profile ->> 'current_program_or_strand',
    v_expected_grad_year
  )
  on conflict (participant_id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    birthdate = excluded.birthdate,
    sex = excluded.sex,
    civil_status = excluded.civil_status,
    barangay = excluded.barangay,
    municipality_city = excluded.municipality_city,
    province = excluded.province,
    contact_no = excluded.contact_no,
    email = excluded.email,
    first_time_jobseeker = excluded.first_time_jobseeker,
    returning_ofw = excluded.returning_ofw,
    returning_worker = excluded.returning_worker,
    interested_in_skills_training = excluded.interested_in_skills_training,
    preferred_training_program = excluded.preferred_training_program,
    has_disability = excluded.has_disability,
    disability_type = excluded.disability_type,
    peso_assistance_programs = excluded.peso_assistance_programs,
    highest_educational_attainment = excluded.highest_educational_attainment,
    course_program = excluded.course_program,
    employment_preference = excluded.employment_preference,
    resume_path = excluded.resume_path,
    data_subject_rights_agreed = true,
    interview_location = excluded.interview_location,
    current_employment_status = excluded.current_employment_status,
    previous_occupation = excluded.previous_occupation,
    previous_industry = excluded.previous_industry,
    years_of_experience = excluded.years_of_experience,
    skills = excluded.skills,
    desired_occupation = excluded.desired_occupation,
    desired_industry = excluded.desired_industry,
    desired_salary = excluded.desired_salary,
    willing_to_relocate = excluded.willing_to_relocate,
    accommodation_needed = excluded.accommodation_needed,
    employment_accommodation_notes = excluded.employment_accommodation_notes,
    first_time_school = excluded.first_time_school,
    first_time_graduation_year = excluded.first_time_graduation_year,
    first_time_ojt_experience = excluded.first_time_ojt_experience,
    ofw_country_last_worked = excluded.ofw_country_last_worked,
    ofw_previous_employer = excluded.ofw_previous_employer,
    ofw_previous_occupation = excluded.ofw_previous_occupation,
    ofw_years_abroad = excluded.ofw_years_abroad,
    ofw_date_returned = excluded.ofw_date_returned,
    ofw_reason_for_return = excluded.ofw_reason_for_return,
    rw_previous_work_location = excluded.rw_previous_work_location,
    rw_previous_employer = excluded.rw_previous_employer,
    rw_previous_occupation = excluded.rw_previous_occupation,
    rw_years_worked = excluded.rw_years_worked,
    rw_date_returned = excluded.rw_date_returned,
    rw_reason_for_return = excluded.rw_reason_for_return,
    is_currently_student = excluded.is_currently_student,
    current_school_name = excluded.current_school_name,
    current_education_level = excluded.current_education_level,
    current_grade_year_level = excluded.current_grade_year_level,
    current_program_or_strand = excluded.current_program_or_strand,
    expected_graduation_year = excluded.expected_graduation_year
  returning * into v_updated;

  -- Sync special sectors: clear existing, insert new
  delete from public.jobseeker_special_sectors
    where participant_id = v_participant.id;

  if p_profile -> 'special_sectors' is not null and jsonb_array_length(p_profile -> 'special_sectors') > 0 then
    insert into public.jobseeker_special_sectors (participant_id, sector_id)
    select v_participant.id, s.id
    from public.special_worker_sectors s
    where s.code in (
      select jsonb_array_elements_text(p_profile -> 'special_sectors')
    )
    and s.is_active = true
    on conflict do nothing;
  end if;

  -- Persist the fields edited by the employment-preferences page.
  UPDATE public.jobseeker_profiles SET
    availability_status = CASE WHEN p_profile ? 'availability_status' THEN nullif(p_profile ->> 'availability_status', '') ELSE availability_status END,
    available_start_date = CASE WHEN p_profile ? 'available_start_date' THEN nullif(p_profile ->> 'available_start_date', '')::date ELSE available_start_date END,
    preferred_shift = CASE WHEN p_profile ? 'preferred_shift' THEN nullif(p_profile ->> 'preferred_shift', '') ELSE preferred_shift END,
    desired_salary_min = CASE WHEN p_profile ? 'desired_salary_min' THEN nullif(p_profile ->> 'desired_salary_min', '')::numeric ELSE desired_salary_min END,
    desired_salary_max = CASE WHEN p_profile ? 'desired_salary_max' THEN nullif(p_profile ->> 'desired_salary_max', '')::numeric ELSE desired_salary_max END,
    desired_salary_period = CASE WHEN p_profile ? 'desired_salary_period' THEN nullif(p_profile ->> 'desired_salary_period', '') ELSE desired_salary_period END,
    career_interests = CASE WHEN p_profile ? 'career_interests' THEN nullif(p_profile ->> 'career_interests', '') ELSE career_interests END,
    professional_summary = CASE WHEN p_profile ? 'professional_summary' THEN nullif(p_profile ->> 'professional_summary', '') ELSE professional_summary END
  WHERE participant_id = v_participant.id RETURNING * INTO v_updated;

  return v_updated;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_approve_employer(p_employer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_code text;
  v_caller_role text;
BEGIN
  PERFORM app.require_identity_admin();
  PERFORM 1 FROM public.employers WHERE id=p_employer_id FOR UPDATE;
  PERFORM 1 FROM public.employer_accreditation_requirements r JOIN public.employer_accreditation a ON a.id=r.accreditation_id WHERE a.employer_id=p_employer_id FOR UPDATE OF r;
  IF NOT app.employer_requirements_approved(p_employer_id) THEN
    RAISE EXCEPTION 'All applicable accreditation requirements must be approved';
  END IF;
  IF EXISTS(SELECT 1 FROM public.employers e JOIN public.profiles p ON p.id=e.registered_user_id WHERE e.id=p_employer_id AND p.role::text NOT IN ('applicant','employer')) THEN
    RAISE EXCEPTION 'A staff identity cannot be replaced by an employer role';
  END IF;
  -- Strict, null-safe admin authorization check
  v_caller_role := app.current_user_role();

  IF auth.uid() IS NULL OR v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employer_accreditation_requirements r
    JOIN employer_accreditation a ON a.id = r.accreditation_id
    JOIN employers e ON e.id = a.employer_id
    WHERE e.id = p_employer_id
      AND r.status IS DISTINCT FROM 'approved'
      AND (
        r.requirement_key IN (
          'letter_of_intent','company_profile','business_permit','bir_2303',
          'philhealth_registration','pagibig_registration','sss_registration',
          'philjobnet_certificate'
        )
        OR (r.requirement_key = 'sec_registration'
            AND e.business_structure IN ('corporation','partnership'))
        OR (r.requirement_key = 'dti_registration'
            AND e.business_structure = 'single_proprietorship')
        OR (r.requirement_key = 'cda_registration'
            AND e.business_structure = 'cooperative')
        OR (r.requirement_key = 'dole_rule_1020' AND e.employer_type = 'local_direct')
        OR (r.requirement_key = 'dole_do174' AND e.employer_type = 'local_agency')
        OR (r.requirement_key = 'bosh_certificate'
            AND e.osh_classification = 'low_risk')
        OR (r.requirement_key = 'cosh_certificate'
            AND e.osh_classification = 'construction_heavy_industrial')
      )
  ) THEN
    RAISE EXCEPTION 'Cannot approve: not all applicable accreditation requirements are approved yet';
  END IF;

  UPDATE employers
  SET registration_status = 'approved',
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = p_employer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employer % not found', p_employer_id;
  END IF;

  -- Issue permanent Employer ID on first accreditation.
  IF NOT EXISTS (
    SELECT 1 FROM employers
    WHERE id = p_employer_id AND employer_code IS NOT NULL
  ) THEN
    LOOP
      v_code := 'EMP-' || lpad(nextval('employer_code_seq')::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM employers WHERE employer_code = v_code);
    END LOOP;
    UPDATE employers SET employer_code = v_code WHERE id = p_employer_id;
  END IF;

  UPDATE employer_accreditation
  SET status = 'approved', approved_at = now(), updated_at = now()
  WHERE employer_id = p_employer_id;

  SELECT registered_user_id INTO v_user_id
  FROM employers
  WHERE id = p_employer_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE profiles SET role = 'employer', is_active = true WHERE id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked profile % missing for employer %', v_user_id, p_employer_id;
    END IF;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_reject_employer(p_employer_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  PERFORM app.require_identity_admin();
  if app.current_user_role() <> 'admin' then
    raise exception 'Only admins may reject employers';
  end if;

  update employers
     set registration_status = 'rejected',
         rejection_reason = nullif(trim(p_reason), ''),
         updated_at = now()
   where id = p_employer_id;
  if not found then
    raise exception 'Employer % not found', p_employer_id;
  end if;

  -- Rejected employers lose portal access (same model as deactivated staff).
  select registered_user_id into v_user_id from employers where id = p_employer_id;
  if v_user_id is not null then
    update profiles set is_active = false where id = v_user_id;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION app.accreditation_object_writable(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT app.employer_mfa_satisfied() AND EXISTS(
  SELECT 1 FROM public.employer_accreditation_requirements r
  JOIN public.employer_accreditation a ON a.id=r.accreditation_id
  JOIN public.employers e ON e.id=a.employer_id
  WHERE e.registered_user_id=auth.uid() AND e.is_active AND e.registration_status IN ('pending','approved')
   AND r.status IS DISTINCT FROM 'approved' AND p_name=e.id::text||'/'||r.id::text||'.pdf')
$$;
REVOKE ALL ON FUNCTION app.accreditation_object_writable(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.accreditation_object_writable(text) TO authenticated,service_role;
CREATE POLICY protect_accreditation_pdf_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (bucket_id<>'accreditation-documents' OR app.accreditation_object_writable(name));
CREATE POLICY protect_accreditation_pdf_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (bucket_id<>'accreditation-documents' OR app.accreditation_object_writable(name))
 WITH CHECK (bucket_id<>'accreditation-documents' OR app.accreditation_object_writable(name));
CREATE POLICY protect_accreditation_pdf_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING (bucket_id<>'accreditation-documents' OR app.accreditation_object_writable(name));

CREATE OR REPLACE FUNCTION public.submit_accreditation_document(p_requirement_id uuid,p_path text,p_filename text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT app.employer_mfa_satisfied() THEN
  RAISE EXCEPTION 'Verified owner authenticator required' USING ERRCODE='42501';
 END IF;
 SELECT e.id,r.status INTO v_company,v_status FROM public.employer_accreditation_requirements r
 JOIN public.employer_accreditation a ON a.id=r.accreditation_id JOIN public.employers e ON e.id=a.employer_id
 WHERE r.id=p_requirement_id AND e.registered_user_id=auth.uid() AND e.is_active AND e.registration_status IN ('pending','approved')
 FOR UPDATE OF r;
 IF v_company IS NULL OR p_path IS DISTINCT FROM v_company::text||'/'||p_requirement_id::text||'.pdf'
  OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='accreditation-documents' AND name=p_path) THEN
  RAISE EXCEPTION 'Owned requirement PDF not found' USING ERRCODE='42501';
 END IF;
 IF v_status='approved' THEN RAISE EXCEPTION 'Approved documents require PESO review before replacement'; END IF;
 IF p_filename IS NULL OR length(p_filename) NOT BETWEEN 5 AND 200 OR p_filename !~* '\.pdf$' THEN
  RAISE EXCEPTION 'Valid PDF filename required' USING ERRCODE='22023';
 END IF;
 UPDATE public.employer_accreditation_requirements SET document_path=p_path,original_filename=p_filename,status='submitted',
 submitted_at=now(),reviewed_at=NULL,reviewed_by=NULL,review_notes=NULL,rejection_reason=NULL WHERE id=p_requirement_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_accreditation_document(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_accreditation_document(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_accreditation_requirement(p_requirement_id uuid,p_status text,p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM app.require_identity_admin();
 IF p_status IS NULL OR p_status NOT IN ('approved','needs_correction','rejected') THEN RAISE EXCEPTION 'Invalid review status'; END IF;
 IF p_status='approved' AND NOT EXISTS(SELECT 1 FROM public.employer_accreditation_requirements r
  JOIN public.employer_accreditation a ON a.id=r.accreditation_id JOIN public.employers e ON e.id=a.employer_id
  WHERE r.id=p_requirement_id AND r.document_path=e.id::text||'/'||r.id::text||'.pdf'
   AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='accreditation-documents' AND o.name=r.document_path)) THEN
  RAISE EXCEPTION 'Submitted requirement PDF not found';
 END IF;
 UPDATE public.employer_accreditation_requirements SET status=p_status,review_notes=p_notes,
 rejection_reason=CASE WHEN p_status IN ('needs_correction','rejected') THEN p_notes END,reviewed_at=now(),reviewed_by=auth.uid()
 WHERE id=p_requirement_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Requirement not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_accreditation_requirement(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_accreditation_requirement(uuid,text,text) TO authenticated;

-- Keep permission/approval history in the existing private audit store.
-- Only authorization fields are recorded, excluding names, emails, document
-- filenames, authentication tokens and TOTP secrets.
CREATE OR REPLACE FUNCTION app.audit_identity_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old jsonb; v_new jsonb; v_fields text[];
BEGIN
 v_fields:=CASE TG_TABLE_NAME WHEN 'profiles' THEN ARRAY['role','is_active','jurisdiction','is_provincial']
  WHEN 'employers' THEN ARRAY['registered_user_id','registration_status','registration_source','is_active','employer_code']
  ELSE ARRAY['status','reviewed_by'] END;
 SELECT jsonb_object_agg(key,value) INTO v_new FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(v_fields);
 IF TG_OP='UPDATE' THEN
  SELECT jsonb_object_agg(key,value) INTO v_old FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(v_fields);
 END IF;
 IF v_new IS DISTINCT FROM v_old THEN
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
   VALUES(auth.uid(),'identity_'||lower(TG_OP),TG_TABLE_NAME,NEW.id,v_old,v_new);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.audit_identity_decision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_profile_authority AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app.audit_identity_decision();
CREATE TRIGGER audit_employer_authority AFTER INSERT OR UPDATE ON public.employers FOR EACH ROW EXECUTE FUNCTION app.audit_identity_decision();
CREATE TRIGGER audit_accreditation_review AFTER UPDATE ON public.employer_accreditation_requirements FOR EACH ROW EXECUTE FUNCTION app.audit_identity_decision();

NOTIFY pgrst,'reload schema';
COMMIT;
