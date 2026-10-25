-- Employer attendance has its own public event reader, independent of vacancy
-- offerings. A classified no-contact test employer cannot enter that path.
CREATE OR REPLACE FUNCTION app.validate_dev_synthetic_employer()
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
  ) OR EXISTS (
    SELECT 1 FROM public.employer_event_participations p
    WHERE p.employer_id=NEW.employer_id
  ) THEN
    RAISE EXCEPTION 'Synthetic employer must have no owner, cases or event attendance'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;

CREATE FUNCTION app.guard_dev_synthetic_employer_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM app.dev_synthetic_employers
             WHERE employer_id=NEW.employer_id) THEN
    RAISE EXCEPTION 'Classified DEV employer cannot enter an official event'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_employer_event
  BEFORE INSERT OR UPDATE OF employer_id ON public.employer_event_participations
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_employer_event();
REVOKE ALL ON FUNCTION app.guard_dev_synthetic_employer_event()
  FROM PUBLIC,anon,authenticated,service_role;
