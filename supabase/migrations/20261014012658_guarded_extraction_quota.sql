-- DEV-only: restore the existing 20 requests/hour contract with authoritative session gates.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_extraction_rate_limit (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 window_started_at timestamptz NOT NULL DEFAULT now(),
 request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0)
);
ALTER TABLE public.ai_extraction_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_extraction_rate_limit FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.ai_extraction_rate_limit_allow()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE
 v_user uuid := auth.uid();
 v_limit constant integer := 20;
 v_window constant interval := interval '1 hour';
 v_now timestamptz := clock_timestamp();
 v_count integer;
BEGIN
 PERFORM app.require_intelligence_session();
 IF app.current_user_role() NOT IN ('admin','staff','supervisor') THEN
  RAISE EXCEPTION 'Not authorized to generate AI extraction' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.ai_extraction_rate_limit AS t(user_id,window_started_at,request_count)
 VALUES(v_user,v_now,1)
 ON CONFLICT(user_id) DO UPDATE SET
  request_count=CASE WHEN t.window_started_at<v_now-v_window THEN 1 ELSE t.request_count+1 END,
  window_started_at=CASE WHEN t.window_started_at<v_now-v_window THEN v_now ELSE t.window_started_at END
 WHERE t.window_started_at<v_now-v_window OR t.request_count<v_limit
 RETURNING request_count INTO v_count;
 RETURN v_count IS NOT NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.ai_extraction_rate_limit_allow() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ai_extraction_rate_limit_allow() TO authenticated;
COMMIT;
