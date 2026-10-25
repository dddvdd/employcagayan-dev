import test from 'node:test'
import assert from 'node:assert/strict'
import {recruitmentAnchorDatabase,applyRecruitmentProvenanceGuards} from '../support/recruitment-anchor-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {become,seedAccount} from '../support/identity-database.js'
async function applicationFixture(db){
 const f=await createRecruitmentFixture(db);await become(db,f.user)
 const application=(await db.query('SELECT public.submit_event_application($1,$2) result',[f.participation,f.offering])).rows[0].result.application_id
 return {...f,application}
}
const protectedHistory=work=>assert.rejects(work,e=>e.code==='23503')

test('employer reader filters pre-existing cross-event selections without rewriting them and preserves valid company scope',async()=>{
 const db=await recruitmentAnchorDatabase()
 try{
  const legacy=await createRecruitmentFixture(db),valid=await createRecruitmentFixture(db)
  await become(db,legacy.owner,{aal:'aal2'})
  assert.equal((await db.query('SELECT id FROM public.get_employer_applicants($1)',[legacy.offering])).rows.length,1)
  await db.query('UPDATE public.event_vacancies SET event_id=$2 WHERE id=$1',[legacy.offering,valid.event])
  assert.equal((await db.query('SELECT id FROM public.get_employer_applicants($1)',[legacy.offering])).rows.length,1)
  await db.exec('RESET ROLE');await applyRecruitmentProvenanceGuards(db)
  await become(db,legacy.owner,{aal:'aal2'})
  assert.deepEqual((await db.query('SELECT id FROM public.get_employer_applicants($1)',[legacy.offering])).rows,[])
  assert.deepEqual((await db.query('SELECT id FROM public.get_employer_applicants($1)',[valid.offering])).rows,[])
  await become(db,valid.owner,{aal:'aal2'})
  assert.deepEqual((await db.query('SELECT id FROM public.get_employer_applicants($1)',[valid.offering])).rows.map(r=>r.id),[valid.participation])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*) n FROM public.participation_vacancies WHERE participation_id=$1 AND event_vacancy_id=$2',[legacy.participation,legacy.offering])).rows[0].n,1)
 }finally{await db.close()}
})
test('linked offerings cannot be moved, rebound or removed; normal edits and application review stay available',async()=>{
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  const f=await applicationFixture(db),other=await createRecruitmentFixture(db)
  await become(db,f.owner,{aal:'aal2'})
  await protectedHistory(()=>db.query('UPDATE public.event_vacancies SET event_id=$2 WHERE id=$1',[f.offering,other.event]))
  await protectedHistory(()=>db.query('DELETE FROM public.event_vacancies WHERE id=$1',[f.offering]))
  await db.query("UPDATE public.event_vacancies SET slots_offered=2,notes='Synthetic harmless edit' WHERE id=$1",[f.offering])
  assert.equal((await db.query("SELECT public.update_application_status($1,'shortlisted') result",[f.application])).rows[0].result.new_status,'shortlisted')
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT event_id FROM public.event_vacancies WHERE id=$1',[f.offering])).rows[0].event_id,f.event)
  assert.equal((await db.query('SELECT count(*) n FROM public.applications WHERE id=$1',[f.application])).rows[0].n,1)
 }finally{await db.close()}
})
test('used registrations and vacancy ownership cannot be reassigned or deleted by an administrator',async()=>{
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  const f=await applicationFixture(db),other=await createRecruitmentFixture(db),admin=await seedAccount(db,{role:'admin'})
  await become(db,admin,{aal:'aal2'})
  await protectedHistory(()=>db.query('UPDATE public.event_participations SET event_id=$2 WHERE id=$1',[f.participation,other.event]))
  await protectedHistory(()=>db.query('UPDATE public.event_participations SET participant_id=$2 WHERE id=$1',[f.participation,other.profile.participant_id]))
  await protectedHistory(()=>db.query('DELETE FROM public.event_participations WHERE id=$1',[f.participation]))
  await protectedHistory(()=>db.query('UPDATE public.vacancy_definitions SET employer_id=$2 WHERE id=$1',[f.vacancy,other.company]))
  await protectedHistory(()=>db.query('DELETE FROM public.vacancy_definitions WHERE id=$1',[f.vacancy]))
 }finally{await db.close()}
})
test('closed application history and manual interviews remain protected after recruitment ends',async()=>{
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  const f=await applicationFixture(db);await become(db,f.owner,{aal:'aal2'})
  await db.query("SELECT public.update_application_status($1,'rejected')",[f.application])
  await protectedHistory(()=>db.query('DELETE FROM public.event_vacancies WHERE id=$1',[f.offering]))
  const manual=await createRecruitmentFixture(db);await db.exec('RESET ROLE')
  await db.query('DELETE FROM public.participation_vacancies WHERE participation_id=$1',[manual.participation])
  const staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
  await db.query("SELECT id FROM public.record_interview_result($1,$2,$3,$4,'qualified',NULL,NULL)",[manual.participation,manual.event,manual.company,manual.vacancy])
  await db.exec('RESET ROLE')
  await protectedHistory(()=>db.query('DELETE FROM public.event_participations WHERE id=$1',[manual.participation]))
  await protectedHistory(()=>db.query('DELETE FROM public.event_vacancies WHERE id=$1',[manual.offering]))
  await protectedHistory(()=>db.query('DELETE FROM public.vacancy_definitions WHERE id=$1',[manual.vacancy]))
 }finally{await db.close()}
})
test('adjacent medical and returning-worker presence records prevent registration cascade loss',async()=>{
 for(const table of ['medical_referrals','returning_ofw_profiles','returning_worker_profiles']){
  const db=await recruitmentAnchorDatabase({harden:true})
  try{
   const f=await createRecruitmentFixture(db);await db.exec('RESET ROLE')
   await db.query('DELETE FROM public.participation_vacancies WHERE participation_id=$1',[f.participation])
   await db.query('INSERT INTO public.'+table+'(registrant_id) VALUES($1)',[f.participation])
   await protectedHistory(()=>db.query('DELETE FROM public.event_participations WHERE id=$1',[f.participation]))
  }finally{await db.close()}
 }
})
test('unlinked offering moves/removal still work; closure preserves cases, uses server time and is idempotent',async()=>{
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  const f=await applicationFixture(db);await db.exec('RESET ROLE')
  const b=(await db.query("INSERT INTO public.events(event_name,event_date,location) VALUES('Synthetic unused B','2026-10-17','Solana') RETURNING id")).rows[0].id
  const c=(await db.query("INSERT INTO public.events(event_name,event_date,location) VALUES('Synthetic unused C','2026-10-17','Solana') RETURNING id")).rows[0].id
  const free=(await db.query('INSERT INTO public.event_vacancies(event_id,vacancy_definition_id) VALUES($1,$2) RETURNING id',[b,f.vacancy])).rows[0].id
  await become(db,f.owner,{aal:'aal2'})
  await db.query('UPDATE public.event_vacancies SET event_id=$2 WHERE id=$1',[free,c])
  await db.query('DELETE FROM public.event_vacancies WHERE id=$1',[free])
  const close=async()=>(await db.query('SELECT public.close_event_offering_applications($1) result',[f.offering])).rows[0].result
  const first=await close(),second=await close()
  assert.equal(first.status,'closed');assert.equal(first.application_deadline,second.application_deadline)
  assert.equal((await db.query("SELECT public.update_application_status($1,'shortlisted') result",[f.application])).rows[0].result.new_status,'shortlisted')
  await become(db,f.user)
  await assert.rejects(()=>db.query('SELECT public.submit_event_application($1,$2)',[f.participation,f.offering]),e=>e.code==='22023')
  await db.exec('RESET ROLE')
  const state=(await db.query('SELECT application_deadline<=statement_timestamp() closed FROM public.event_vacancies WHERE id=$1',[f.offering])).rows[0]
  assert.equal(state.closed,true)
  const audit=(await db.query("SELECT old_data,new_data FROM public.audit_logs WHERE action='event_offering_deadline_changed' AND record_id=$1",[f.offering])).rows
  assert.equal(audit.length,1);assert.deepEqual(Object.keys(audit[0].new_data),['application_deadline'])
 }finally{await db.close()}
})
test('closure keeps owner/admin/MFA boundaries and exposes no private trigger execution',async()=>{
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  const f=await applicationFixture(db),other=await createRecruitmentFixture(db),admin=await seedAccount(db,{role:'admin'})
  await become(db,f.owner);await assert.rejects(()=>db.query('SELECT public.close_event_offering_applications($1)',[f.offering]),e=>e.code==='42501')
  await become(db,other.owner,{aal:'aal2'});await assert.rejects(()=>db.query('SELECT public.close_event_offering_applications($1)',[f.offering]),e=>e.code==='42501')
  await become(db,admin,{aal:'aal2'});assert.equal((await db.query('SELECT public.close_event_offering_applications($1) result',[f.offering])).rows[0].result.status,'closed')
  await db.exec('RESET ROLE')
  for(const name of ['guard_recruitment_case_links','pin_recruitment_case_links','audit_event_offering_deadline'])for(const role of ['anon','authenticated','service_role'])
   assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) allowed',[role,'app.'+name+'()','EXECUTE'])).rows[0].allowed,false)
  assert.equal((await db.query("SELECT prosecdef FROM pg_proc WHERE oid='public.close_event_offering_applications(uuid)'::regprocedure")).rows[0].prosecdef,false)
  assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') allowed")).rows[0].allowed,false)
 }finally{await db.close()}
})
test('canonical selection insertion rejects a foreign event even for an administrator',async()=>{
 const db=await recruitmentAnchorDatabase({harden:true})
 try{
  const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db),admin=await seedAccount(db,{role:'admin'})
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query("INSERT INTO public.participation_vacancies(participation_id,event_vacancy_id,preference_type) VALUES($1,$2,'local')",[f.participation,other.offering]),e=>e.code==='23514')
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*) n FROM public.participation_vacancies WHERE participation_id=$1',[f.participation])).rows[0].n,1)
 }finally{await db.close()}
})
test('baseline ordinary employer can move a used offering and strand an otherwise valid application transition',async()=>{
 const db=await recruitmentAnchorDatabase()
 try{
  const f=await applicationFixture(db);await db.exec('RESET ROLE')
  const next=(await db.query("INSERT INTO public.events(event_name,event_date,location) VALUES('Synthetic next event','2026-10-17','Solana') RETURNING id")).rows[0].id
  await become(db,f.owner,{aal:'aal2'})
  await db.query('UPDATE public.event_vacancies SET event_id=$2 WHERE id=$1',[f.offering,next])
  await assert.rejects(()=>db.query("SELECT public.update_application_status($1,'shortlisted')",[f.application]),e=>e.code==='23514')
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT ep.event_id<>ev.event_id mismatch FROM public.applications a JOIN public.event_participations ep ON ep.id=a.registrant_id JOIN public.event_vacancies ev ON ev.id=a.event_vacancy_id WHERE a.id=$1',[f.application])).rows[0].mismatch,true)
 }finally{await db.close()}
})
test('baseline offering deletion cascades a formal application even when ordinary employer cannot delete it directly',async()=>{
 const db=await recruitmentAnchorDatabase()
 try{
  const f=await applicationFixture(db);await become(db,f.owner,{aal:'aal2'})
  await assert.rejects(()=>db.query('DELETE FROM public.applications WHERE id=$1',[f.application]),e=>e.code==='42501')
  await db.query('DELETE FROM public.event_vacancies WHERE id=$1',[f.offering])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*) n FROM public.applications WHERE id=$1',[f.application])).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*) n FROM public.participation_vacancies WHERE event_vacancy_id=$1',[f.offering])).rows[0].n,0)
 }finally{await db.close()}
})
test('baseline administrator participant deletion cascades application and interview history',async()=>{
 const db=await recruitmentAnchorDatabase()
 try{
  const f=await applicationFixture(db)
  const staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
  const log=(await db.query("SELECT id FROM public.record_interview_result($1,$2,$3,$4,'qualified',$5,NULL)",[f.participation,f.event,f.company,f.vacancy,f.application])).rows[0].id
  await db.exec('RESET ROLE')
  const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
  await db.query('DELETE FROM public.event_participations WHERE id=$1',[f.participation])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*) n FROM public.applications WHERE id=$1',[f.application])).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*) n FROM public.interview_logs WHERE id=$1',[log])).rows[0].n,0)
 }finally{await db.close()}
})
