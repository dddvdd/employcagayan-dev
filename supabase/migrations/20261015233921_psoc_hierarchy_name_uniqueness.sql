-- Permit identical PSOC names at distinct hierarchy levels while preserving legacy uniqueness.
-- No row changes, permission changes, or additional callable functions.
DO $index$
DECLARE v_index oid;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_database()<>'postgres' THEN
  RAISE EXCEPTION 'Verified DEV management identity required' USING ERRCODE='42501';
 END IF;
 v_index:=to_regclass('public.occupations_normalized_name_level_unique');
 IF v_index IS NULL THEN
  CREATE UNIQUE INDEX occupations_normalized_name_level_unique
   ON public.occupations(normalized_name,(coalesce(occupation_level,0)));
 ELSE
  IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE indexrelid=v_index AND indrelid='public.occupations'::regclass
   AND indisunique AND indisvalid AND indnkeyatts=2
   AND pg_get_indexdef(v_index,1,true)='normalized_name'
   AND regexp_replace(pg_get_indexdef(v_index,2,true),'[[:space:]]','','g')
    IN ('COALESCE((occupation_level)::integer,0)','COALESCE(occupation_level::integer,0)','COALESCE(occupation_level,0)')) THEN
   RAISE EXCEPTION 'Existing occupation level index differs' USING ERRCODE='55000';
  END IF;
 END IF;
 v_index:=to_regclass('public.occupations_normalized_name_unique');
 IF v_index IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE indexrelid=v_index AND indrelid='public.occupations'::regclass
   AND indisunique AND indnkeyatts=1 AND pg_get_indexdef(v_index,1,true)='normalized_name') THEN
   RAISE EXCEPTION 'Existing global occupation index differs' USING ERRCODE='55000';
  END IF;
  DROP INDEX public.occupations_normalized_name_unique;
 END IF;
END $index$;

