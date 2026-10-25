import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {reviewDatabase} from '../support/review-database.js'
import {seedAccount,become} from '../support/identity-database.js'
export const QUOTA_MIGRATION='20261014012658_guarded_extraction_quota.sql'
let db
before(async()=>{
 db=await reviewDatabase()
 const file=process.env.EMPLOY_QUOTA_BASELINE==='1'?'20260927032604_ai_extraction_rate_limit.sql':QUOTA_MIGRATION
 await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
})
after(async()=>await db?.close())
const allow=async()=> (await db.query('SELECT public.ai_extraction_rate_limit_allow() AS ok')).rows[0].ok
test('the existing twenty-per-hour quota resets after an expired window',async()=>{
 const actor=await seedAccount(db,{role:'admin'})
 await become(db,actor,{aal:'aal2'})
 for(let i=0;i<20;i++)assert.equal(await allow(),true)
 assert.equal(await allow(),false)
 await db.exec('RESET ROLE')
 await db.query("UPDATE public.ai_extraction_rate_limit SET window_started_at=now()-interval '61 minutes' WHERE user_id=$1",[actor.id])
 await become(db,actor,{aal:'aal2'})
 assert.equal(await allow(),true)
 await db.exec('RESET ROLE')
 assert.equal((await db.query('SELECT request_count FROM public.ai_extraction_rate_limit WHERE user_id=$1',[actor.id])).rows[0].request_count,1)
})
test('quota is available only to active confirmed MFA verified PESO roles',async()=>{
 for(const role of ['admin','staff','supervisor']){
  const actor=await seedAccount(db,{role})
  await become(db,actor)
  await assert.rejects(allow,error=>error.code==='42501')
  await become(db,actor,{aal:'aal2'});assert.equal(await allow(),true)
 }
 for(const role of ['employer','medical','applicant']){
  const actor=await seedAccount(db,{role,google:role==='applicant'})
  if(role==='employer')await db.query("INSERT INTO public.employers(registered_user_id,company_name,employer_type,registration_status,is_active) VALUES($1,'Synthetic quota employer','local_direct','approved',true)",[actor.id])
  await become(db,actor,{aal:'aal2'})
  await assert.rejects(allow,error=>error.code==='42501')
 }
})
test('quota cannot outlive revocation or let a denied call mutate any counter',async()=>{
 const actor=await seedAccount(db,{role:'staff'})
 await become(db,actor,{aal:'aal2'});assert.equal(await allow(),true)
 await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE id=$1',[actor.sessionId])
 await become(db,actor,{aal:'aal2'});await assert.rejects(allow,error=>error.code==='42501')
 await db.exec('RESET ROLE')
 assert.equal((await db.query('SELECT request_count FROM public.ai_extraction_rate_limit WHERE user_id=$1',[actor.id])).rows[0].request_count,1)
 for(const options of [{confirmed:false},{active:false},{factor:false}]){
  const invalid=await seedAccount(db,{role:'admin',...options});await become(db,invalid,{aal:'aal2'})
  await assert.rejects(allow,error=>error.code==='42501')
 }
})
test('quota counters are private and denied attempts stop at the fixed ceiling',async()=>{
 const actor=await seedAccount(db,{role:'staff'}),other=await seedAccount(db,{role:'admin'})
 await become(db,actor,{aal:'aal2'})
 for(let i=0;i<25;i++)assert.equal(await allow(),i<20)
 await become(db,other,{aal:'aal2'});assert.equal(await allow(),true)
 await db.exec('RESET ROLE')
 assert.equal((await db.query('SELECT request_count FROM public.ai_extraction_rate_limit WHERE user_id=$1',[actor.id])).rows[0].request_count,20)
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await db.query("SELECT has_table_privilege($1,'public.ai_extraction_rate_limit','SELECT') AS ok",[role])).rows[0].ok,false)
 }
 for(const role of ['anon','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.ai_extraction_rate_limit_allow()','EXECUTE') AS ok",[role])).rows[0].ok,false)
})
