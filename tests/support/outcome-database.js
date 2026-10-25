import {readFile} from 'node:fs/promises'
import {reviewDatabase} from './review-database.js'
const quote=value=>'"'+value.replaceAll('"','""')+'"'
export const OUTCOME_MIGRATION='20261014015649_canonical_interview_outcome_authorization.sql'
export const OUTCOME_CASCADE_MIGRATION='20261014020557_employment_record_cascade_compatibility.sql'
export async function outcomeDatabase({repair=true}={}){
 const db=await reviewDatabase()
 try{
  const catalog=JSON.parse(await readFile(new URL('../../artifacts/outcome-security-20261014/dev-catalog.json',import.meta.url),'utf8'))
  const extra=JSON.parse(await readFile(new URL('../../artifacts/outcome-security-20261014/dev-extra.json',import.meta.url),'utf8'))
  // Legacy policy dependency is reproduced only to show the broken canonical join.
  await db.exec('CREATE TABLE IF NOT EXISTS public.registrants_legacy(id uuid PRIMARY KEY,event_id uuid REFERENCES public.events(id));GRANT SELECT ON public.registrants_legacy TO authenticated')
  for(const type of extra.types){
   if(!(await db.query('SELECT 1 FROM pg_type WHERE typname=$1',[type.type])).rows.length)await db.exec('CREATE TYPE public.'+quote(type.type)+' AS ENUM ('+type.values.map(value=>"'"+value.replaceAll("'","''")+"'").join(',')+')')
  }
  for(const table of ['interview_logs','employment_outcomes']){
   const columns=extra.columns.filter(row=>row.table===table).map(row=>quote(row.name)+' '+(row.type==='USER-DEFINED'?'public.'+quote(row.udt):row.type)+(row.default?' DEFAULT '+row.default:'')+(row.nullable==='NO'?' NOT NULL':''))
   await db.exec('CREATE TABLE public.'+quote(table)+' ('+columns.join(',')+')')
   for(const row of extra.constraints.filter(row=>row.table.replace('public.','')===table))await db.exec('ALTER TABLE public.'+quote(table)+' ADD CONSTRAINT '+quote(row.name)+' '+row.definition)
   for(const row of extra.indexes.filter(row=>row.tablename===table&&!row.indexname.endsWith('_pkey')))await db.exec(row.indexdef)
   await db.exec('ALTER TABLE public.'+quote(table)+' ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON public.'+quote(table)+' TO authenticated')
  }
  await db.exec(extra.roles_helper)
  for(const fn of catalog.functions){
   await db.exec(fn.definition)
   await db.exec('REVOKE ALL ON FUNCTION public.'+fn.name+'('+fn.args+') FROM PUBLIC,anon,authenticated,service_role')
   if(fn.anon_execute)await db.exec('GRANT EXECUTE ON FUNCTION public.'+fn.name+'('+fn.args+') TO anon')
   if(fn.auth_execute)await db.exec('GRANT EXECUTE ON FUNCTION public.'+fn.name+'('+fn.args+') TO authenticated')
  }
  for(const t of extra.triggers){await db.exec(t.function);await db.exec(t.definition)}
  for(const p of catalog.policies)await db.exec('CREATE POLICY '+quote(p.policyname)+' ON public.'+quote(p.tablename)+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(quote).join(',')+(p.qual?' USING ('+p.qual+')':'')+(p.with_check?' WITH CHECK ('+p.with_check+')':''))
  if(repair)await db.exec(await readFile(new URL('../../supabase/migrations/'+OUTCOME_MIGRATION,import.meta.url),'utf8'))
  if(repair)await db.exec(await readFile(new URL('../../supabase/migrations/'+OUTCOME_CASCADE_MIGRATION,import.meta.url),'utf8'))
  return db
 }catch(error){await db.close();throw error}
}
