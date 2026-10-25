-- DEV-only; prevent classification while an AI run or derived vector could
-- already contain or process the purportedly fictional source.
CREATE FUNCTION app.validate_dev_synthetic_processing_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_type text; v_entity_id uuid;
BEGIN
  IF TG_TABLE_NAME='dev_synthetic_actors' THEN
    v_type:='jobseeker_profile'; v_entity_id:=NEW.participant_id;
  ELSE
    v_type:='vacancy'; v_entity_id:=NEW.vacancy_definition_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_extraction_runs
             WHERE entity_type::text=v_type AND entity_id=v_entity_id)
     OR EXISTS (SELECT 1 FROM public.employment_embeddings
                WHERE entity_type::text=v_type AND entity_id=v_entity_id) THEN
    RAISE EXCEPTION 'Existing AI processing must be reviewed before synthetic classification'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER validate_dev_synthetic_actor_processing
  BEFORE INSERT ON app.dev_synthetic_actors
  FOR EACH ROW EXECUTE FUNCTION app.validate_dev_synthetic_processing_history();
CREATE TRIGGER validate_dev_synthetic_vacancy_processing
  BEFORE INSERT ON app.dev_synthetic_vacancies
  FOR EACH ROW EXECUTE FUNCTION app.validate_dev_synthetic_processing_history();
REVOKE ALL ON FUNCTION app.validate_dev_synthetic_processing_history()
  FROM PUBLIC,anon,authenticated,service_role;
