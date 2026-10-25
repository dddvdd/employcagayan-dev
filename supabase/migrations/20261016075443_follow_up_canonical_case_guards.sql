BEGIN;
-- Reconcile only the two existing staff policies with canonical outcome scope.
-- Existing admin, identity, MFA policies and table grants are unchanged.
ALTER POLICY "Staff manage follow-ups" ON public.follow_ups
 USING (EXISTS(SELECT 1 FROM public.employment_outcomes eo
  WHERE eo.id=follow_ups.employment_outcome_id AND app.outcome_application_scope_satisfied(eo.application_id)))
 WITH CHECK (EXISTS(SELECT 1 FROM public.employment_outcomes eo
  WHERE eo.id=follow_ups.employment_outcome_id AND app.outcome_application_scope_satisfied(eo.application_id)));
ALTER POLICY "Staff view follow-ups" ON public.follow_ups
 USING (EXISTS(SELECT 1 FROM public.employment_outcomes eo
  WHERE eo.id=follow_ups.employment_outcome_id AND app.outcome_application_scope_satisfied(eo.application_id)));

CREATE OR REPLACE FUNCTION app.guard_follow_up_case_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.employment_outcome_id IS DISTINCT FROM OLD.employment_outcome_id
  OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Keep this follow-up linked to its original employment case and creation record' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.guard_follow_up_case_identity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_follow_up_case_identity BEFORE UPDATE OF id,employment_outcome_id,created_at ON public.follow_ups
 FOR EACH ROW EXECUTE FUNCTION app.guard_follow_up_case_identity();

CREATE OR REPLACE FUNCTION app.audit_follow_up_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_old jsonb;v_new jsonb;v_id uuid;
BEGIN
 -- Trusted fixture/maintenance operations do not impersonate a business actor.
 IF current_setting('role',true) IN ('none','service_role') OR auth.uid() IS NULL THEN
  IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'updated_at')=(to_jsonb(OLD)-'updated_at') THEN RETURN NEW;END IF;
 END IF;
 IF TG_OP<>'INSERT' THEN v_old:=jsonb_build_object('status',OLD.status,'follow_up_type',OLD.follow_up_type);v_id:=OLD.id;END IF;
 IF TG_OP<>'DELETE' THEN v_new:=jsonb_build_object('status',NEW.status,'follow_up_type',NEW.follow_up_type);v_id:=NEW.id;END IF;
 INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
 VALUES(auth.uid(),'follow_up_changed','follow_ups',v_id,v_old,v_new);
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app.audit_follow_up_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_follow_up_change AFTER INSERT OR UPDATE OR DELETE ON public.follow_ups
 FOR EACH ROW EXECUTE FUNCTION app.audit_follow_up_change();
NOTIFY pgrst,'reload schema';
COMMIT;
