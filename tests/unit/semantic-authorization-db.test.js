import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
export const SEMANTIC_MIGRATION='20261013063051_authorized_semantic_pair_similarity.sql'
let db
before(async()=>{db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION});await db.exec(await readFile(new URL('../../supabase/migrations/'+SEMANTIC_MIGRATION,import.meta.url),'utf8'))})
after(async()=>await db?.close())
const pair=async(pid,vid,event=null)=>(await db.query('SELECT public.get_pair_semantic_similarity($1,$2,$3) AS result',[pid,vid,event])).rows[0].result
const denied=fn=>assert.rejects(fn,error=>error.code==='42501')
test('Google canonical owner can compare a visible vacancy without a raw vector grant',async()=>{
 const f=await intelligenceFixture(db);await become(db,f.user)
 assert.equal((await pair(f.profile.participant_id,f.vacancy)).status,'missing')
})
test('approved employer can compare its pipeline; cross-company and foreign PID pairs are denied',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await become(db,f.owner,{aal:'aal2'})
 assert.equal((await pair(f.profile.participant_id,f.vacancy)).status,'missing')
 await denied(()=>pair(f.profile.participant_id,other.vacancy))
 await denied(()=>pair(other.profile.participant_id,f.vacancy))
 await become(db,f.owner,{aal:'aal1'});await denied(()=>pair(f.profile.participant_id,f.vacancy))
})
test('municipal pair scope follows the existing participant and event permissions',async()=>{
 const f=await intelligenceFixture(db),actor=await seedAccount(db,{role:'supervisor'})
 await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[actor.id])
 await become(db,actor,{aal:'aal2'});await denied(()=>pair(f.profile.participant_id,f.vacancy,f.offering))
 await db.exec('RESET ROLE');await db.query('UPDATE public.profiles SET is_provincial=true WHERE id=$1',[actor.id])
 await become(db,actor,{aal:'aal2'});assert.equal((await pair(f.profile.participant_id,f.vacancy,f.offering)).status,'missing')
})
test('bounded batch validates every pair and denies anonymous/worker grants',async()=>{
 const f=await intelligenceFixture(db);await become(db,f.user)
 const rows=[{jobseeker_profile_id:f.profile.participant_id,vacancy_id:f.vacancy}]
 const result=(await db.query('SELECT public.get_semantic_similarities($1::jsonb) AS result',[JSON.stringify(rows)])).rows[0].result
 assert.equal(result[0].status,'missing');assert.equal(result[0].jobseeker_profile_id,f.profile.participant_id)
 await assert.rejects(()=>db.query('SELECT public.get_semantic_similarities($1::jsonb)',[JSON.stringify(Array(101).fill(rows[0]))]),error=>error.code==='22023')
 await db.exec('RESET ROLE')
 for(const role of ['anon','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text)','EXECUTE') AS allowed",[role])).rows[0].allowed,false)
})
test('baseline event visibility exposes an unapproved other-company vacancy',async()=>{
 const old=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 try{
  const f=await intelligenceFixture(old),other=await intelligenceFixture(old)
  await old.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[other.company])
  await become(old,f.owner,{aal:'aal2'})
  const result=(await old.query('SELECT public.get_vacancy_match_profile($1,$2) AS result',[other.vacancy,other.offering])).rows[0].result
  assert.equal(result.id,other.vacancy)
 }finally{await old.close()}
})
test('event matching uses the same active approved company filter as batch browsing',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[other.company])
 await become(db,f.owner,{aal:'aal2'})
 assert.equal((await db.query('SELECT public.get_vacancy_match_profile($1,$2) AS result',[other.vacancy,other.offering])).rows[0].result,null)
})
