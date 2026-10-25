-- DEV-only foundation. Do not classify an account or publish a fixture vacancy
-- until ordinary-read, report, export, matching and provider exclusions pass.
CREATE TABLE app.dev_synthetic_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref text NOT NULL DEFAULT 'cdmkzzmaswwiryymtycn'
    CHECK (project_ref = 'cdmkzzmaswwiryymtycn'),
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 12 AND 500),
  approval_reference text NOT NULL CHECK (length(btrim(approval_reference)) BETWEEN 8 AND 300),
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > approved_at),
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'active', 'suspended', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.dev_synthetic_actors (
  case_id uuid NOT NULL REFERENCES app.dev_synthetic_cases(id),
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  participant_id uuid NOT NULL UNIQUE REFERENCES public.participants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.dev_synthetic_employers (
  case_id uuid NOT NULL REFERENCES app.dev_synthetic_cases(id),
  employer_id uuid PRIMARY KEY REFERENCES public.employers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, employer_id)
);

CREATE TABLE app.dev_synthetic_vacancies (
  case_id uuid NOT NULL,
  employer_id uuid NOT NULL,
  vacancy_definition_id uuid PRIMARY KEY REFERENCES public.vacancy_definitions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (case_id, employer_id)
    REFERENCES app.dev_synthetic_employers(case_id, employer_id)
);

CREATE TABLE app.dev_synthetic_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL,
  entity_kind text NOT NULL,
  entity_key uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update')),
  actor_uid uuid,
  actor_db_role text NOT NULL,
  old_data jsonb,
  new_data jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION app.audit_dev_synthetic_registry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_case_id uuid; v_entity_key uuid; v_old_data jsonb;
BEGIN
  IF TG_TABLE_NAME='dev_synthetic_cases' THEN
    v_case_id:=NEW.id; v_entity_key:=NEW.id;
  ELSIF TG_TABLE_NAME='dev_synthetic_actors' THEN
    v_case_id:=NEW.case_id; v_entity_key:=NEW.auth_user_id;
  ELSIF TG_TABLE_NAME='dev_synthetic_employers' THEN
    v_case_id:=NEW.case_id; v_entity_key:=NEW.employer_id;
  ELSE
    v_case_id:=NEW.case_id; v_entity_key:=NEW.vacancy_definition_id;
  END IF;
  IF TG_OP='UPDATE' THEN v_old_data:=to_jsonb(OLD); END IF;
  INSERT INTO app.dev_synthetic_audit(
    case_id,entity_kind,entity_key,action,actor_uid,actor_db_role,old_data,new_data)
  VALUES (
    v_case_id,TG_TABLE_NAME,v_entity_key,
    lower(TG_OP),auth.uid(),session_user,v_old_data,to_jsonb(NEW));
  RETURN NEW;
END $fn$;

CREATE FUNCTION app.guard_dev_synthetic_registry_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_TABLE_NAME='dev_synthetic_cases' THEN
    IF TG_OP='UPDATE'
       AND NEW.id=OLD.id AND NEW.project_ref=OLD.project_ref
       AND NEW.purpose=OLD.purpose
       AND NEW.approval_reference=OLD.approval_reference
       AND NEW.approved_at=OLD.approved_at
       AND NEW.created_at=OLD.created_at THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Synthetic classification is immutable; retire the case instead'
    USING ERRCODE='42501';
END $fn$;

CREATE TRIGGER guard_dev_synthetic_case_immutable
  BEFORE UPDATE OR DELETE ON app.dev_synthetic_cases
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_registry_immutable();
CREATE TRIGGER guard_dev_synthetic_actor_immutable
  BEFORE UPDATE OR DELETE ON app.dev_synthetic_actors
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_registry_immutable();
CREATE TRIGGER guard_dev_synthetic_employer_immutable
  BEFORE UPDATE OR DELETE ON app.dev_synthetic_employers
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_registry_immutable();
CREATE TRIGGER guard_dev_synthetic_vacancy_immutable
  BEFORE UPDATE OR DELETE ON app.dev_synthetic_vacancies
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_registry_immutable();
CREATE TRIGGER audit_dev_synthetic_case
  AFTER INSERT OR UPDATE ON app.dev_synthetic_cases
  FOR EACH ROW EXECUTE FUNCTION app.audit_dev_synthetic_registry();
CREATE TRIGGER audit_dev_synthetic_actor
  AFTER INSERT OR UPDATE ON app.dev_synthetic_actors
  FOR EACH ROW EXECUTE FUNCTION app.audit_dev_synthetic_registry();
CREATE TRIGGER audit_dev_synthetic_employer
  AFTER INSERT OR UPDATE ON app.dev_synthetic_employers
  FOR EACH ROW EXECUTE FUNCTION app.audit_dev_synthetic_registry();
CREATE TRIGGER audit_dev_synthetic_vacancy
  AFTER INSERT OR UPDATE ON app.dev_synthetic_vacancies
  FOR EACH ROW EXECUTE FUNCTION app.audit_dev_synthetic_registry();

CREATE FUNCTION app.validate_dev_synthetic_actor()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id=NEW.participant_id AND p.auth_user_id=NEW.auth_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.event_participations
    WHERE participant_id=NEW.participant_id
  ) OR EXISTS (
    SELECT 1 FROM public.applications
    WHERE participant_id=NEW.participant_id
  ) THEN
    RAISE EXCEPTION 'Synthetic actor must own an unlinked participant'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER validate_dev_synthetic_actor
  BEFORE INSERT OR UPDATE ON app.dev_synthetic_actors
  FOR EACH ROW EXECUTE FUNCTION app.validate_dev_synthetic_actor();

CREATE FUNCTION app.validate_dev_synthetic_employer()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employers e
    WHERE e.id=NEW.employer_id AND e.registered_user_id IS NULL
      AND e.registration_source='admin'
  ) OR EXISTS (
    SELECT 1 FROM public.vacancy_definitions vd
    JOIN public.applications a ON a.vacancy_definition_id=vd.id
    WHERE vd.employer_id=NEW.employer_id
  ) THEN
    RAISE EXCEPTION 'Synthetic employer must be admin-created and have no owner or existing cases'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER validate_dev_synthetic_employer
  BEFORE INSERT OR UPDATE ON app.dev_synthetic_employers
  FOR EACH ROW EXECUTE FUNCTION app.validate_dev_synthetic_employer();

CREATE FUNCTION app.validate_dev_synthetic_vacancy()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vacancy_definitions vd
    WHERE vd.id=NEW.vacancy_definition_id AND vd.employer_id=NEW.employer_id
  ) OR EXISTS (
    SELECT 1 FROM public.event_vacancies
    WHERE vacancy_definition_id=NEW.vacancy_definition_id
  ) OR EXISTS (
    SELECT 1 FROM public.applications
    WHERE vacancy_definition_id=NEW.vacancy_definition_id
  ) THEN
    RAISE EXCEPTION 'Synthetic vacancy must belong to its employer and have no event or case links'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER validate_dev_synthetic_vacancy
  BEFORE INSERT OR UPDATE ON app.dev_synthetic_vacancies
  FOR EACH ROW EXECUTE FUNCTION app.validate_dev_synthetic_vacancy();

-- Classification survives suspension or retirement: a past test case never
-- silently becomes a real case in reports after its test window ends.
CREATE FUNCTION app.is_dev_synthetic_participant(p_participant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT EXISTS (SELECT 1 FROM app.dev_synthetic_actors
                 WHERE participant_id=p_participant_id)
$fn$;

CREATE FUNCTION app.is_dev_synthetic_vacancy(p_vacancy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT EXISTS (SELECT 1 FROM app.dev_synthetic_vacancies
                 WHERE vacancy_definition_id=p_vacancy_id)
$fn$;

CREATE FUNCTION app.dev_synthetic_pair_active(p_participant_id uuid,p_vacancy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM app.dev_synthetic_actors a
    JOIN app.dev_synthetic_vacancies v ON v.case_id=a.case_id
    JOIN app.dev_synthetic_cases c ON c.id=a.case_id
    WHERE a.participant_id=p_participant_id
      AND v.vacancy_definition_id=p_vacancy_id
      AND c.status='active' AND now()<c.expires_at
  )
$fn$;

CREATE FUNCTION app.dev_synthetic_participant_readable(p_participant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT NOT app.is_dev_synthetic_participant(p_participant_id) OR EXISTS (
    SELECT 1 FROM app.dev_synthetic_actors
    WHERE participant_id=p_participant_id AND auth_user_id=auth.uid()
  )
$fn$;

CREATE FUNCTION app.dev_synthetic_vacancy_readable(p_vacancy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT NOT app.is_dev_synthetic_vacancy(p_vacancy_id) OR EXISTS (
    SELECT 1 FROM app.dev_synthetic_vacancies v
    JOIN app.dev_synthetic_actors a ON a.case_id=v.case_id
    WHERE v.vacancy_definition_id=p_vacancy_id AND a.auth_user_id=auth.uid()
  )
$fn$;

CREATE FUNCTION app.dev_synthetic_employer_readable(p_employer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT NOT EXISTS (SELECT 1 FROM app.dev_synthetic_employers
                     WHERE employer_id=p_employer_id)
$fn$;

CREATE FUNCTION app.dev_synthetic_vacancy_listable(p_vacancy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT NOT app.is_dev_synthetic_vacancy(p_vacancy_id) OR EXISTS (
    SELECT 1 FROM app.dev_synthetic_vacancies v
    JOIN app.dev_synthetic_actors a ON a.case_id=v.case_id
    JOIN app.dev_synthetic_cases c ON c.id=v.case_id
    WHERE v.vacancy_definition_id=p_vacancy_id AND a.auth_user_id=auth.uid()
      AND c.status='active' AND now()<c.expires_at
  )
$fn$;

-- Restrictive policies add a narrow exclusion to existing permissions. The
-- owner retains their profile, resume reference and formal application history.
CREATE POLICY dev_synthetic_participant_read ON public.participants
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(id));
CREATE POLICY dev_synthetic_profile_read ON public.jobseeker_profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(participant_id));
CREATE POLICY dev_synthetic_application_read ON public.applications
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_participant_readable(participant_id)
    AND app.dev_synthetic_vacancy_readable(vacancy_definition_id));
CREATE POLICY dev_synthetic_vacancy_read ON public.vacancy_definitions
  AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (app.dev_synthetic_vacancy_readable(id));
CREATE POLICY dev_synthetic_employer_read ON public.employers
  AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (app.dev_synthetic_employer_readable(id));

-- This public RPC is SECURITY DEFINER and therefore needs its own predicate;
-- table RLS alone does not protect the anonymous job board.
CREATE OR REPLACE FUNCTION public.list_platform_vacancies(p_search text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT jsonb_build_object(
    'id',vd.id,'company_name',vd.company_name,'position',vd.position,
    'job_description',vd.job_description,'qualifications',vd.qualifications,
    'requirements_summary',vd.requirements_summary,
    'employment_type',et.name,'work_arrangement',wa.name,
    'place_of_assignment',vd.place_of_assignment,'province',vd.province,
    'municipality_city',vd.municipality_city,'salary_min',vd.salary_min,
    'salary_max',vd.salary_max,'salary_currency',vd.salary_currency,
    'salary_period',vd.salary_period,'salary_negotiable',vd.salary_negotiable,
    'available_slots',vd.available_slots,'platform_status',vd.platform_status,
    'published_at',vd.published_at,
    'application_deadline',vd.platform_application_deadline
  )
  FROM public.vacancy_definitions vd
  JOIN public.employers e ON e.id=vd.employer_id
  LEFT JOIN public.employment_types et ON et.id=vd.employment_type_id
  LEFT JOIN public.work_arrangements wa ON wa.id=vd.work_arrangement_id
  WHERE vd.is_active=true AND vd.platform_status='published'
    AND vd.published_at IS NOT NULL
    AND (vd.platform_application_deadline IS NULL OR vd.platform_application_deadline>now())
    AND e.is_active=true AND e.registration_status='approved'
    AND app.dev_synthetic_vacancy_listable(vd.id)
    AND (NULLIF(btrim(p_search),'') IS NULL
      OR vd.position ILIKE '%'||btrim(p_search)||'%'
      OR vd.company_name ILIKE '%'||btrim(p_search)||'%'
      OR vd.place_of_assignment ILIKE '%'||btrim(p_search)||'%')
  ORDER BY vd.published_at DESC,vd.id;
$fn$;
REVOKE ALL ON FUNCTION public.list_platform_vacancies(text)
  FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION public.list_platform_vacancies(text)
  TO anon,authenticated;

-- Only a same-case, active fictional pair can create a formal application.
-- Status changes, including withdrawal after the test period, retain history.
CREATE FUNCTION app.guard_dev_synthetic_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND NEW.participant_id IS NOT DISTINCT FROM OLD.participant_id
     AND NEW.vacancy_definition_id IS NOT DISTINCT FROM OLD.vacancy_definition_id
     AND NEW.registrant_id IS NOT DISTINCT FROM OLD.registrant_id
     AND NEW.event_vacancy_id IS NOT DISTINCT FROM OLD.event_vacancy_id THEN
    RETURN NEW;
  END IF;
  IF app.is_dev_synthetic_participant(NEW.participant_id)
     OR app.is_dev_synthetic_vacancy(NEW.vacancy_definition_id) THEN
    IF NEW.registrant_id IS NOT NULL OR NEW.event_vacancy_id IS NOT NULL
       OR NOT app.dev_synthetic_pair_active(NEW.participant_id,NEW.vacancy_definition_id) THEN
      RAISE EXCEPTION 'Synthetic tests require an active paired online vacancy'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_application
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_application();

-- The approved test lane has no live event, selection or referral destination.
CREATE FUNCTION app.guard_dev_synthetic_event_participation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF app.is_dev_synthetic_participant(NEW.participant_id) THEN
    RAISE EXCEPTION 'Synthetic account cannot enter an official event'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_event_participation
  BEFORE INSERT OR UPDATE OF participant_id ON public.event_participations
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_event_participation();

CREATE FUNCTION app.guard_dev_synthetic_event_vacancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF app.is_dev_synthetic_vacancy(NEW.vacancy_definition_id) THEN
    RAISE EXCEPTION 'Synthetic vacancy cannot enter an official event'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_event_vacancy
  BEFORE INSERT OR UPDATE OF vacancy_definition_id ON public.event_vacancies
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_event_vacancy();

-- Nothing in this registry is a client-controlled flag or an API resource.
REVOKE ALL ON app.dev_synthetic_cases,app.dev_synthetic_actors,
  app.dev_synthetic_employers,app.dev_synthetic_vacancies,
  app.dev_synthetic_audit
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.is_dev_synthetic_participant(uuid),
  app.is_dev_synthetic_vacancy(uuid),app.dev_synthetic_pair_active(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.dev_synthetic_participant_readable(uuid),
  app.dev_synthetic_vacancy_readable(uuid),app.dev_synthetic_employer_readable(uuid),
  app.dev_synthetic_vacancy_listable(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app.dev_synthetic_participant_readable(uuid),
  app.dev_synthetic_vacancy_readable(uuid),app.dev_synthetic_employer_readable(uuid)
  TO anon,authenticated;
REVOKE ALL ON FUNCTION app.validate_dev_synthetic_actor(),
  app.validate_dev_synthetic_employer(),app.validate_dev_synthetic_vacancy(),
  app.guard_dev_synthetic_application(),app.guard_dev_synthetic_event_participation(),
  app.guard_dev_synthetic_event_vacancy(),app.audit_dev_synthetic_registry(),
  app.guard_dev_synthetic_registry_immutable()
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE app.dev_synthetic_cases IS
  'DEV-only governed fictional case registry; classification persists after retirement. No cleanup or disposal implied.';
