import {readFile,readdir} from 'node:fs/promises'
import {identityDatabase} from './identity-database.js'
const current=JSON.parse(await readFile(new URL('../../artifacts/employer-rejection-20261016/dev-functions-before.json',import.meta.url),'utf8'))
const helpers=JSON.parse(await readFile(new URL('../../artifacts/employer-rejection-20261016/dev-helpers-before.json',import.meta.url),'utf8'))
const dependencies=JSON.parse(await readFile(new URL('../../artifacts/employer-rejection-20261016/dev-identity-dependencies.json',import.meta.url),'utf8'))
export async function employerRejectionDatabase({harden=false}={}){
 const db=await identityDatabase()
 try{
  for(const name of ['auth_session_active','session_aal2_satisfied','partner_mfa_satisfied','google_jobseeker_session','identity_admin_satisfied','require_identity_admin'])await db.exec(dependencies.find(f=>f.name===name).definition)
  for(const f of current)await db.exec(f.definition)
  for(const f of helpers.helpers)await db.exec(f.definition)
  for(const t of helpers.employer_triggers)await db.exec(t.function)
  await db.exec('REVOKE USAGE ON SCHEMA app FROM anon,authenticated,service_role')
  if(harden){const file=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_employer_rejection_account_boundaries.sql'));await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))}
  return db
 }catch(error){await db.close();throw error}
}
