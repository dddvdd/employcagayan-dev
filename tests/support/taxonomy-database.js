import {readFile} from 'node:fs/promises'
import {freshnessDatabase} from './freshness-database.js'
export const TAXONOMY_MIGRATION='20261014003159_semantic_dictionary_freshness_v2.sql'
const quote=value=>'"'+value.replaceAll('"','""')+'"'
export async function taxonomyDatabase({repair=true}={}){
 const db=await freshnessDatabase()
 try{
  const c=JSON.parse(await readFile(new URL('../../artifacts/taxonomy-milestone-20261014/dev-taxonomy-catalog.json',import.meta.url),'utf8'))
  for(const table of ['taxonomy_sources','taxonomy_mappings']){
   const columns=c.columns.filter(row=>row.table===table).map(row=>quote(row.name)+' '+row.type+(row.default?' DEFAULT '+row.default:'')+(row.nullable==='NO'?' NOT NULL':''))
   await db.exec('CREATE TABLE public.'+quote(table)+' ('+columns.join(',')+')')
   for(const item of c.constraints.filter(row=>row.table===table))await db.exec('ALTER TABLE public.'+quote(table)+' ADD CONSTRAINT '+quote(item.name)+' '+item.definition)
   await db.exec('ALTER TABLE public.'+quote(table)+' ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON public.'+quote(table)+' TO authenticated')
   for(const p of c.policies.filter(row=>row.table===table))await db.exec('CREATE POLICY '+quote(p.name)+' ON public.'+quote(table)+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(quote).join(',')+(p.using?' USING ('+p.using+')':'')+(p.check?' WITH CHECK ('+p.check+')':''))
  }
  if(repair)await db.exec(await readFile(new URL('../../supabase/migrations/'+TAXONOMY_MIGRATION,import.meta.url),'utf8'))
  return db
 }catch(error){await db.close();throw error}
}
