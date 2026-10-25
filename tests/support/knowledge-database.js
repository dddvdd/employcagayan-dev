import {readFile} from 'node:fs/promises'
import {taxonomyDatabase} from './taxonomy-database.js'
export const KNOWLEDGE_MIGRATION='20261014085342_reviewed_occupation_skill_knowledge.sql'
const quote=v=>'"'+v.replaceAll('"','""')+'"'
export async function knowledgeDatabase(){
 const db=await taxonomyDatabase()
 try{
  await db.exec('ALTER ROLE service_role BYPASSRLS')
  const c=JSON.parse(await readFile(new URL('../../artifacts/taxonomy-milestone-20261014/dev-taxonomy-catalog.json',import.meta.url),'utf8'))
  const table='occupation_skills',ddl=c.columns.filter(r=>r.table===table).map(r=>quote(r.name)+' '+r.type+(r.default?' DEFAULT '+r.default:'')+(r.nullable==='NO'?' NOT NULL':''))
  await db.exec('CREATE TABLE public.'+table+' ('+ddl.join(',')+')')
  for(const item of c.constraints.filter(r=>r.table===table))await db.exec('ALTER TABLE public.'+table+' ADD CONSTRAINT '+quote(item.name)+' '+item.definition)
  await db.exec('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.'+table+' TO authenticated,service_role')
  for(const p of c.policies.filter(r=>r.table===table))await db.exec('CREATE POLICY '+quote(p.name)+' ON public.'+table+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(quote).join(',')+(p.using?' USING ('+p.using+')':'')+(p.check?' WITH CHECK ('+p.check+')':''))
  await db.exec(await readFile(new URL('../../supabase/migrations/'+KNOWLEDGE_MIGRATION,import.meta.url),'utf8'))
  return db
 }catch(e){await db.close();throw e}
}
