-- Retained recruitment case evidence has no ordinary hard-delete workflow.
-- An exceptional disposition requires a separate, explicitly approved and
-- audited migration naming the records and preserving their evidence first.
-- One DO statement keeps this change atomic under statement-by-statement CLIs.
DO $migration$
BEGIN
  IF to_regclass('public.employment_outcomes') IS NULL
     OR to_regclass('public.follow_ups') IS NULL THEN
    RAISE EXCEPTION 'Recruitment evidence tables are missing';
  END IF;

  EXECUTE $ddl$
    CREATE FUNCTION app.block_recruitment_evidence_hard_delete()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $guard$
    BEGIN
      RAISE EXCEPTION 'Retained recruitment evidence cannot be hard deleted; use an approved, audited records disposition'
        USING ERRCODE = '42501';
    END
    $guard$
  $ddl$;

  EXECUTE 'REVOKE ALL ON FUNCTION app.block_recruitment_evidence_hard_delete() FROM PUBLIC, anon, authenticated, service_role';

  EXECUTE $ddl$
    CREATE TRIGGER block_employment_outcome_hard_delete
    BEFORE DELETE ON public.employment_outcomes
    FOR EACH ROW EXECUTE FUNCTION app.block_recruitment_evidence_hard_delete()
  $ddl$;
  EXECUTE $ddl$
    CREATE TRIGGER block_follow_up_hard_delete
    BEFORE DELETE ON public.follow_ups
    FOR EACH ROW EXECUTE FUNCTION app.block_recruitment_evidence_hard_delete()
  $ddl$;
  -- TRUNCATE bypasses row DELETE triggers and RLS, including when CASCADE is used.
  EXECUTE $ddl$
    CREATE TRIGGER block_employment_outcome_truncate
    BEFORE TRUNCATE ON public.employment_outcomes
    FOR EACH STATEMENT EXECUTE FUNCTION app.block_recruitment_evidence_hard_delete()
  $ddl$;
  EXECUTE $ddl$
    CREATE TRIGGER block_follow_up_truncate
    BEFORE TRUNCATE ON public.follow_ups
    FOR EACH STATEMENT EXECUTE FUNCTION app.block_recruitment_evidence_hard_delete()
  $ddl$;

  -- Defense in depth: table grants and RLS must not advertise direct disposal.
  -- Existing SELECT, INSERT, UPDATE grants/policies and correction triggers stay.
  EXECUTE 'REVOKE DELETE, TRUNCATE ON TABLE public.employment_outcomes, public.follow_ups FROM PUBLIC, anon, authenticated, service_role';
  EXECUTE $ddl$
    CREATE POLICY retained_employment_outcomes_no_delete
    ON public.employment_outcomes AS RESTRICTIVE FOR DELETE
    TO authenticated USING (false)
  $ddl$;
  EXECUTE $ddl$
    CREATE POLICY retained_follow_ups_no_delete
    ON public.follow_ups AS RESTRICTIVE FOR DELETE
    TO authenticated USING (false)
  $ddl$;
END
$migration$;
