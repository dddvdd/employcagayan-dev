-- Existing application-linked guards reject the fictional person's case.
-- These extra guards reject a classified organization or vacancy being
-- attributed to a genuine interview or employment outcome instead.
CREATE FUNCTION app.guard_dev_synthetic_interview_attribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF (NEW.employer_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM app.dev_synthetic_employers
        WHERE employer_id=NEW.employer_id
      )) OR (NEW.vacancy_definition_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM app.dev_synthetic_vacancies
        WHERE vacancy_definition_id=NEW.vacancy_definition_id
      )) THEN
    RAISE EXCEPTION 'Classified DEV employer or vacancy cannot enter official interview history'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_interview_attribution
  BEFORE INSERT OR UPDATE OF employer_id,vacancy_definition_id ON public.interview_logs
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_interview_attribution();

CREATE FUNCTION app.guard_dev_synthetic_outcome_employer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.employer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM app.dev_synthetic_employers WHERE employer_id=NEW.employer_id
  ) THEN
    RAISE EXCEPTION 'Classified DEV employer cannot enter official outcome history'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_outcome_employer
  BEFORE INSERT OR UPDATE OF employer_id ON public.employment_outcomes
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_outcome_employer();

REVOKE ALL ON FUNCTION app.guard_dev_synthetic_interview_attribution(),
  app.guard_dev_synthetic_outcome_employer()
  FROM PUBLIC,anon,authenticated,service_role;
