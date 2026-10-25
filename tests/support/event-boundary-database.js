import {readFile,readdir} from 'node:fs/promises'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from './intelligence-database.js'
const catalog=JSON.parse(await readFile(new URL('../../artifacts/authenticated-rpc-review-20261016/dev-function-catalog.json',import.meta.url),'utf8'))
const schema=JSON.parse(await readFile(new URL('../../artifacts/authenticated-rpc-review-20261016/dev-boundary-baseline.json',import.meta.url),'utf8'))
const names=['auth_session_active','session_aal2_satisfied','google_jobseeker_session','partner_mfa_satisfied','current_user_role','employer_mfa_satisfied','platform_identity_session_satisfied','require_recruitment_session','require_recruitment_partner','jobseeker_identity_satisfied','require_jobseeker_identity','is_event_staff','supervisor_can_view_event','enforce_partner_mfa','quest_enforce_partner_mfa','check_in_employer','participate_in_event','register_for_event']
export async function eventBoundaryDatabase({harden=false}={}){
 const db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 try{
  await db.exec('CREATE TABLE public.employer_event_participations('+schema.employer_participation_columns.map(c=>'"'+c.name+'" '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.required?' NOT NULL':'')).join(',')+')')
  for(const c of schema.employer_participation_constraints)await db.exec('ALTER TABLE public.employer_event_participations ADD CONSTRAINT "'+c.name+'" '+c.definition)
  for(const name of names){
   const f=catalog.functions.find(f=>f.name===name)
   await db.exec(f.definition)
   await db.exec('REVOKE ALL ON FUNCTION '+f.schema+'.'+f.identity.replace(/^(public|app)\./,'')+' FROM PUBLIC,anon,authenticated,service_role')
   for(const role of ['anon','authenticated','service_role'])if(f[role==='service_role'?'service_execute':role+'_execute'])await db.exec('GRANT EXECUTE ON FUNCTION '+f.schema+'.'+f.identity.replace(/^(public|app)\./,'')+' TO '+role)
  }
  if(harden){
   const file=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(f=>f.endsWith('_event_registration_scope_guards.sql'))
   await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
  }
  await db.exec('REVOKE USAGE ON SCHEMA app FROM anon,authenticated,service_role')
  return db
 }catch(error){await db.close();throw error}
}
