import {readFile} from 'node:fs/promises'
import {requirementDatabase} from './requirement-review-database.js'
export const DICTIONARY_MIGRATION='20261014083050_extraction_dictionary_consistency.sql'
export async function dictionaryConsistencyDatabase(){
 const db=await requirementDatabase()
 try{
  await db.exec(`CREATE TABLE public.occupation_aliases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),occupation_id uuid NOT NULL REFERENCES public.occupations(id),alias text NOT NULL,normalized_alias text NOT NULL,alias_type text DEFAULT 'common',language_code text DEFAULT 'en',source text,is_active boolean DEFAULT true,created_at timestamptz DEFAULT now());ALTER TABLE public.occupation_aliases ENABLE ROW LEVEL SECURITY;`)
  if(process.env.EMPLOY_DICTIONARY_BASELINE!=='1')await db.exec(await readFile(new URL('../../supabase/migrations/'+DICTIONARY_MIGRATION,import.meta.url),'utf8'))
  return db
 }catch(e){await db.close();throw e}
}
