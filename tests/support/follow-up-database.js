import {readFile,readdir} from 'node:fs/promises'
import {recruitmentAnchorDatabase} from './recruitment-anchor-database.js'
const schema=JSON.parse(await readFile(new URL('../../artifacts/follow-up-security-20261016/dev-follow-up-schema.json',import.meta.url),'utf8'))
const current=JSON.parse(await readFile(new URL('../../artifacts/follow-up-security-20261016/dev-policies-and-constraints.json',import.meta.url),'utf8'))
const quote=s=>'"'+s.replaceAll('"','""')+'"'
export async function applyFollowUpGuards(db){
 const file=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_follow_up_canonical_case_guards.sql'))
 await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
}
export async function followUpDatabase({harden=false}={}){
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  await db.exec('CREATE TABLE public.follow_ups ('+schema.columns.map(c=>quote(c.column)+' '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.nullable==='NO'?' NOT NULL':'')).join(',')+')')
  for(const c of current.constraints.filter(c=>c.table==='follow_ups'))await db.exec('ALTER TABLE public.follow_ups ADD '+c.definition)
  await db.exec(schema.outcome_scope)
  for(const t of schema.triggers){await db.exec(t.function);await db.exec(t.definition)}
  await db.exec('ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.follow_ups FROM PUBLIC,anon,authenticated,service_role')
  for(const g of schema.grants)await db.exec('GRANT '+g.privilege_type+' ON public.follow_ups TO '+quote(g.grantee))
  for(const p of current.policies.filter(p=>p.tablename==='follow_ups'))await db.exec('CREATE POLICY '+quote(p.policyname)+' ON public.follow_ups AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(quote).join(',')+(p.qual?' USING ('+p.qual+')':'')+(p.with_check?' WITH CHECK ('+p.with_check+')':''))
  if(harden)await applyFollowUpGuards(db)
  return db
 }catch(error){await db.close();throw error}
}
