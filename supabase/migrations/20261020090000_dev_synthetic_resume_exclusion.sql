-- Classified owner-folder objects must not enter ordinary staff download or
-- export paths. This predicate applies before or after profile linkage and
-- keeps the owner able to upload, read and manage the fictional résumé.
CREATE FUNCTION app.dev_synthetic_resume_readable(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM app.dev_synthetic_actors a
    WHERE a.auth_user_id::text=split_part(p_path,'/',1)
  ) OR split_part(p_path,'/',1)=auth.uid()::text
$fn$;
REVOKE ALL ON FUNCTION app.dev_synthetic_resume_readable(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app.dev_synthetic_resume_readable(text)
  TO authenticated;
CREATE POLICY dev_synthetic_resume_read ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id<>'resumes' OR app.dev_synthetic_resume_readable(name));
