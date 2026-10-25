-- DEV-only continuation of the immutable private synthetic registry. A
-- classified no-contact employer must never acquire a real login, and its
-- classified vacancy must never be reassigned to a genuine employer.
CREATE FUNCTION app.guard_dev_synthetic_employer_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM app.dev_synthetic_employers
             WHERE employer_id=OLD.id)
     AND (NEW.id IS DISTINCT FROM OLD.id
       OR NEW.registered_user_id IS NOT NULL
       OR NEW.company_name IS DISTINCT FROM OLD.company_name
       OR NEW.registration_source IS DISTINCT FROM OLD.registration_source
       OR NEW.registration_status IS DISTINCT FROM OLD.registration_status
       OR NEW.employer_type IS DISTINCT FROM OLD.employer_type
       OR NEW.employer_code IS NOT NULL
       OR NEW.email IS NOT NULL
       OR NEW.contact_person IS NOT NULL
       OR NEW.contact_number IS NOT NULL) THEN
    RAISE EXCEPTION 'Classified DEV employer identity and no-contact scope are fixed'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_employer_identity
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_employer_identity();

CREATE FUNCTION app.guard_dev_synthetic_vacancy_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF EXISTS (SELECT 1 FROM app.dev_synthetic_employers
               WHERE employer_id=NEW.employer_id) THEN
      RAISE EXCEPTION 'Additional vacancies require a separately governed DEV case'
        USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM app.dev_synthetic_vacancies
             WHERE vacancy_definition_id=OLD.id)
     AND (NEW.id IS DISTINCT FROM OLD.id
       OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
       OR NEW.company_name IS DISTINCT FROM OLD.company_name
       OR NEW.position IS DISTINCT FROM OLD.position) THEN
    RAISE EXCEPTION 'Classified DEV vacancy ownership and label are fixed'
      USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM app.dev_synthetic_employers
             WHERE employer_id=NEW.employer_id)
     AND NOT EXISTS (SELECT 1 FROM app.dev_synthetic_vacancies
                     WHERE vacancy_definition_id=OLD.id
                       AND employer_id=NEW.employer_id) THEN
    RAISE EXCEPTION 'Unclassified vacancy cannot move into a DEV test employer'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_vacancy_identity
  BEFORE INSERT OR UPDATE ON public.vacancy_definitions
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_vacancy_identity();

REVOKE ALL ON FUNCTION app.guard_dev_synthetic_employer_identity(),
  app.guard_dev_synthetic_vacancy_identity()
  FROM PUBLIC,anon,authenticated,service_role;
