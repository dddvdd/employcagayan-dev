-- DEV-only; depends on the private synthetic registry. Program history is
-- official case evidence and cannot be used as a fictional test fixture.
CREATE FUNCTION app.guard_dev_synthetic_program_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF app.is_dev_synthetic_participant(NEW.participant_id) THEN
    RAISE EXCEPTION 'Synthetic account cannot enter an official program'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_dev_synthetic_program_participation
  BEFORE INSERT OR UPDATE OF participant_id ON public.program_participations
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_program_row();
CREATE TRIGGER guard_dev_synthetic_program_delivery
  BEFORE INSERT OR UPDATE OF participant_id ON public.program_service_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.guard_dev_synthetic_program_row();

CREATE FUNCTION app.validate_dev_synthetic_program_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.program_participations
             WHERE participant_id=NEW.participant_id)
     OR EXISTS (SELECT 1 FROM public.program_service_deliveries
                WHERE participant_id=NEW.participant_id) THEN
    RAISE EXCEPTION 'Participant with official program history cannot be classified as synthetic'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER validate_dev_synthetic_program_history
  BEFORE INSERT ON app.dev_synthetic_actors
  FOR EACH ROW EXECUTE FUNCTION app.validate_dev_synthetic_program_history();

CREATE FUNCTION app.dev_synthetic_program_row_readable(p_participant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT NOT app.is_dev_synthetic_participant(p_participant_id)
$fn$;

CREATE POLICY dev_synthetic_program_participation_read
  ON public.program_participations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_program_row_readable(participant_id));
CREATE POLICY dev_synthetic_program_delivery_read
  ON public.program_service_deliveries AS RESTRICTIVE FOR SELECT TO authenticated
  USING (app.dev_synthetic_program_row_readable(participant_id));

-- Policies execute with the caller and therefore need this limited predicate;
-- the private registry itself stays inaccessible to API roles.
REVOKE ALL ON FUNCTION app.dev_synthetic_program_row_readable(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app.dev_synthetic_program_row_readable(uuid) TO authenticated;
REVOKE ALL ON FUNCTION app.guard_dev_synthetic_program_row(),
  app.validate_dev_synthetic_program_history()
  FROM PUBLIC,anon,authenticated,service_role;
