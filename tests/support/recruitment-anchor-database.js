import {readFile,readdir} from 'node:fs/promises'
import {outcomeDatabase} from './outcome-database.js'
const current=JSON.parse(await readFile(new URL('../../artifacts/recruitment-provenance-20261016/dev-readers-before.json',import.meta.url),'utf8'))
const security=JSON.parse(await readFile(new URL('../../artifacts/recruitment-provenance-20261016/dev-table-security.json',import.meta.url),'utf8'))
const anchors=JSON.parse(await readFile(new URL('../../artifacts/recruitment-provenance-20261016/dev-anchor-schema.json',import.meta.url),'utf8'))
const dependencies=JSON.parse(await readFile(new URL('../../artifacts/recruitment-provenance-20261016/dev-anchor-dependencies.json',import.meta.url),'utf8'))
const quote=value=>'"'+value.replaceAll('"','""')+'"'
export async function applyRecruitmentProvenanceGuards(db){
 const file=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(f=>f.endsWith('_recruitment_case_provenance_guards.sql'))
 await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
}
export async function recruitmentAnchorDatabase({harden=false}={}){
 const db=await outcomeDatabase()
 try{
  await db.exec(current.application_guard)
  for(const f of current.functions)await db.exec(f.definition)
  // Restore the current FK actions as well: historical generic fixtures omit some selection FKs.
  const constraints=[...anchors.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY')).map(c=>({table:c.table,definition:c.definition})),
   ...dependencies.foreign_keys.filter(c=>['applications','participation_vacancies','interview_logs'].includes(c.child)).map(c=>({table:c.child,definition:c.definition}))]
  let index=0
  for(const c of constraints){
   const signature=c.definition.match(/^FOREIGN KEY\s*\([^)]+\)/)[0]
   const existing=(await db.query('SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype=$2',['public.'+c.table,'f'])).rows.filter(f=>f.definition.startsWith(signature))
   if(existing.some(f=>f.definition===c.definition))continue
   for(const f of existing)await db.exec('ALTER TABLE public.'+quote(c.table)+' DROP CONSTRAINT '+quote(f.conname))
   await db.exec('ALTER TABLE public.'+quote(c.table)+' ADD CONSTRAINT '+quote('fixture_current_boundary_fk_'+(++index))+' '+c.definition)
  }
  // Earlier generic fixtures regrant CRUD while loading tables. Restore exact current DEV grants/policies here.
  for(const table of ['applications','event_vacancies','event_participations','vacancy_definitions','participation_vacancies']){
   await db.exec('REVOKE ALL ON TABLE public.'+quote(table)+' FROM PUBLIC,anon,authenticated,service_role')
   for(const g of security.grants.filter(g=>g.table_name===table))await db.exec('GRANT '+g.privilege_type+' ON TABLE public.'+quote(table)+' TO '+(g.grantee==='PUBLIC'?'PUBLIC':quote(g.grantee)))
   for(const p of (await db.query("SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=$1",[table])).rows)await db.exec('DROP POLICY '+quote(p.policyname)+' ON public.'+quote(table))
   for(const p of security.policies.filter(p=>p.tablename===table))await db.exec('CREATE POLICY '+quote(p.policyname)+' ON public.'+quote(table)+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',')+(p.qual?' USING ('+p.qual+')':'')+(p.with_check?' WITH CHECK ('+p.with_check+')':''))
  }
  // These adjacent case categories are presence-only boundary fixtures, not clinical/legacy workflow simulations.
  for(const table of ['medical_referrals','returning_ofw_profiles','returning_worker_profiles'])
   if(!(await db.query('SELECT to_regclass($1) table_name',['public.'+table])).rows[0].table_name)await db.exec('CREATE TABLE public.'+quote(table)+' (id uuid DEFAULT gen_random_uuid(),registrant_id uuid REFERENCES public.event_participations(id) ON DELETE CASCADE)')
  if(!(await db.query("SELECT to_regclass('public.registrant_vacancies_legacy') table_name")).rows[0].table_name)await db.exec('CREATE TABLE public.registrant_vacancies_legacy(registrant_id uuid,event_vacancy_id uuid REFERENCES public.event_vacancies(id) ON DELETE CASCADE)')
  if(harden)await applyRecruitmentProvenanceGuards(db)
  await db.exec('REVOKE USAGE ON SCHEMA app FROM anon,authenticated,service_role')
  return db
 }catch(error){await db.close();throw error}
}
