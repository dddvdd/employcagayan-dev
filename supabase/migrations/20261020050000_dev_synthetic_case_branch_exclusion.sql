-- DEV-only; the approved fictional workflow ends with application withdrawal.
-- Neither a synthetic person nor a synthetic vacancy can enter a real
-- interview/outcome branch, including through a privileged direct writer.
CREATE FUNCTION app.guard_dev_synthetic_case_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.application_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id=NEW.application_id
      AND (app.is_dev_synthetic_participant(a.participant_id)
        OR app.is_dev_synthetic_vacancy(a.vacancy_definition_id))
  ) THEN
    RAISE EXCEPTION 'Synthetic application cannot enter official interview or outcome history'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_interview
  BEFORE INSERT OR UPDATE OF application_id ON public.interview_logs
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_case_branch();
CREATE TRIGGER guard_dev_synthetic_outcome
  BEFORE INSERT OR UPDATE OF application_id ON public.employment_outcomes
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_case_branch();
REVOKE ALL ON FUNCTION app.guard_dev_synthetic_case_branch()
  FROM PUBLIC,anon,authenticated,service_role;
