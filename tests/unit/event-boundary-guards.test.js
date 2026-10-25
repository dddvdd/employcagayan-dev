import test from 'node:test'
import assert from 'node:assert/strict'
import {eventBoundaryDatabase} from '../support/event-boundary-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
const denied=fn=>assert.rejects(fn,e=>e.code==='42501')
const invalid=fn=>assert.rejects(fn,e=>e.code==='22023')
const register=(db,event,ids)=>(db.query('SELECT * FROM public.register_for_event($1,$2)',[event,ids]))
test('corrected registration rejects foreign, duplicate, null, excessive, inactive and unapproved selections before insertion',async()=>{
 const db=await eventBoundaryDatabase({harden:true})
 try{
  const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db)
  for(const ids of [[f.offering],[other.offering,other.offering],[null],Array(101).fill(other.offering)]){
   await become(db,f.user);await invalid(()=>register(db,other.event,ids))
   await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*) n FROM public.event_participations WHERE participant_id=$1 AND event_id=$2',[f.profile.participant_id,other.event])).rows[0].n,0)
  }
  for(const update of ["UPDATE public.vacancy_definitions SET is_active=false WHERE id=$1","UPDATE public.employers SET registration_status='pending' WHERE id=$1","UPDATE public.employers SET registration_status='approved',is_active=false WHERE id=$1"]){
   await db.exec('RESET ROLE')
   await db.query(update,[update.includes('vacancy_definitions')?other.vacancy:other.company])
   if(!update.includes('vacancy_definitions'))await db.query('UPDATE public.vacancy_definitions SET is_active=true WHERE id=$1',[other.vacancy])
   await become(db,f.user);await invalid(()=>register(db,other.event,[other.offering]))
  }
 }finally{await db.close()}
})
test('corrected registration preserves valid selection, overseas preference, duplicate protection and empty selection',async()=>{
 const db=await eventBoundaryDatabase({harden:true})
 try{
  const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db)
  await db.query("UPDATE public.jobseeker_profiles SET employment_preference='Overseas' WHERE participant_id=$1",[f.profile.participant_id])
  await become(db,f.user)
  const r=(await register(db,other.event,[other.offering])).rows[0]
  assert.equal(r.participant_id,f.profile.participant_id);assert.notEqual(r.participant_id,f.user.id)
  await assert.rejects(()=>register(db,other.event,[other.offering]))
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT preference_type FROM public.participation_vacancies WHERE participation_id=$1',[r.id])).rows[0].preference_type,'overseas')
  const event=(await db.query("INSERT INTO public.events(event_name,event_date,location) VALUES('Synthetic empty','2026-10-16','Solana') RETURNING id")).rows[0].id
  await become(db,f.user);assert.equal((await register(db,event,[])).rows[0].event_id,event)
 }finally{await db.close()}
})
test('corrected employer check-in enforces supervisor scope, permits provincial oversight and remains idempotent',async()=>{
 const db=await eventBoundaryDatabase({harden:true})
 try{
  const f=await createRecruitmentFixture(db),sup=await seedAccount(db,{role:'supervisor'})
  await db.query("UPDATE public.profiles SET jurisdiction='Solana',is_provincial=false WHERE id=$1",[sup.id])
  await db.query("UPDATE public.employers SET employer_code='EMP-SYNTHETIC' WHERE id=$1",[f.company])
  await db.query("INSERT INTO public.employer_event_participations(event_id,employer_id) VALUES($1,$2)",[f.event,f.company])
  await become(db,sup,{aal:'aal2'})
  await denied(()=>db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1)",[f.event]))
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM public.employer_event_participations WHERE employer_id=$1',[f.company])).rows[0].status,'registered')
  await db.query('UPDATE public.profiles SET is_provincial=true WHERE id=$1',[sup.id])
  await become(db,sup,{aal:'aal2'})
  assert.equal((await db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1) result",[f.event])).rows[0].result.already_checked_in,false)
  assert.equal((await db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1) result",[f.event])).rows[0].result.already_checked_in,true)
 }finally{await db.close()}
})
test('corrected company registration requires active approval and genuine current MFA/session state',async()=>{
 const db=await eventBoundaryDatabase({harden:true})
 try{
  const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db)
  await become(db,f.owner);await denied(()=>db.query('SELECT public.participate_in_event($1)',[other.event]))
  await db.exec('RESET ROLE');await db.query('UPDATE public.employers SET is_active=false WHERE id=$1',[f.company])
  await become(db,f.owner,{aal:'aal2'});await denied(()=>db.query('SELECT public.participate_in_event($1)',[other.event]))
  await db.exec('RESET ROLE');await db.query('UPDATE public.employers SET is_active=true WHERE id=$1',[f.company])
  await become(db,f.owner,{aal:'aal2'});await db.query('SELECT public.participate_in_event($1)',[other.event])
  await db.query('SELECT public.participate_in_event($1)',[other.event])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*) n FROM public.employer_event_participations WHERE employer_id=$1',[f.company])).rows[0].n,1)
  await db.query('DELETE FROM auth.sessions WHERE id=$1',[f.owner.sessionId])
  await become(db,f.owner,{aal:'aal2'});await denied(()=>db.query('SELECT public.participate_in_event($1)',[f.event]))
 }finally{await db.close()}
})
test('corrected check-in preserves existing medical/staff access while rejecting inactive companies and closed/cancelled participation',async()=>{
 const db=await eventBoundaryDatabase({harden:true})
 try{
  const f=await createRecruitmentFixture(db),staff=await seedAccount(db,{role:'staff'}),medical=await seedAccount(db,{role:'medical',factor:false})
  await db.query("UPDATE public.employers SET employer_code='EMP-SYNTHETIC' WHERE id=$1",[f.company])
  await db.query("INSERT INTO public.employer_event_participations(event_id,employer_id) VALUES($1,$2)",[f.event,f.company])
  await become(db,staff);await denied(()=>db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1)",[f.event]))
  await db.exec('RESET ROLE');await db.query('UPDATE public.employers SET is_active=false WHERE id=$1',[f.company])
  await become(db,staff,{aal:'aal2'});await assert.rejects(()=>db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1)",[f.event]))
  await db.exec('RESET ROLE');await db.query('UPDATE public.employers SET is_active=true WHERE id=$1',[f.company])
  await db.query("UPDATE public.events SET status='cancelled' WHERE id=$1",[f.event])
  await become(db,staff,{aal:'aal2'});await assert.rejects(()=>db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1)",[f.event]))
  await db.exec('RESET ROLE');await db.query("UPDATE public.events SET status='upcoming' WHERE id=$1",[f.event])
  await db.query("UPDATE public.employer_event_participations SET status='cancelled' WHERE employer_id=$1",[f.company])
  await become(db,medical);await assert.rejects(()=>db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1)",[f.event]))
  await db.exec('RESET ROLE');await db.query("UPDATE public.employer_event_participations SET status='registered' WHERE employer_id=$1",[f.company])
  await become(db,medical);assert.equal((await db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1) result",[f.event])).rows[0].result.already_checked_in,false)
 }finally{await db.close()}
})
test('baseline accepts a foreign-event selection through the current jobseeker registration RPC',async()=>{
 const db=await eventBoundaryDatabase()
 try{
  const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db);await become(db,f.user)
  await db.query('SELECT public.quest_enforce_partner_mfa()')
  const r=(await db.query('SELECT * FROM public.register_for_event($1,$2)',[other.event,[f.offering]])).rows[0]
  await db.exec('RESET ROLE')
  const mismatch=(await db.query('SELECT ev.event_id FROM public.participation_vacancies pv JOIN public.event_vacancies ev ON ev.id=pv.event_vacancy_id WHERE pv.participation_id=$1',[r.id])).rows[0]
  assert.equal(r.event_id,other.event);assert.equal(mismatch.event_id,f.event)
 }finally{await db.close()}
})
test('baseline permits supervisor employer check-in outside jurisdiction despite the configured MFA pre-request guard',async()=>{
 const db=await eventBoundaryDatabase()
 try{
  const f=await createRecruitmentFixture(db),sup=await seedAccount(db,{role:'supervisor'})
  await db.query("UPDATE public.profiles SET jurisdiction='Solana',is_provincial=false WHERE id=$1",[sup.id])
  await db.query("UPDATE public.employers SET employer_code='EMP-SYNTHETIC' WHERE id=$1",[f.company])
  await db.query("INSERT INTO public.employer_event_participations(event_id,employer_id) VALUES($1,$2)",[f.event,f.company])
  await become(db,sup,{aal:'aal2'});await db.query('SELECT public.quest_enforce_partner_mfa()')
  assert.equal((await db.query('SELECT public.supervisor_can_view_event($1) allowed',[f.event])).rows[0].allowed,false)
  assert.equal((await db.query("SELECT public.check_in_employer('EMP-SYNTHETIC',$1) result",[f.event])).rows[0].result.already_checked_in,false)
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT status FROM public.employer_event_participations WHERE event_id=$1 AND employer_id=$2',[f.event,f.company])).rows[0].status,'checked_in')
 }finally{await db.close()}
})
test('baseline permits an inactive approved company to register despite the configured MFA pre-request guard',async()=>{
 const db=await eventBoundaryDatabase()
 try{
  const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db)
  await db.query('UPDATE public.employers SET is_active=false WHERE id=$1',[f.company])
  await become(db,f.owner,{aal:'aal2'});await db.query('SELECT public.quest_enforce_partner_mfa()')
  await db.query('SELECT public.participate_in_event($1)',[other.event])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*) n FROM public.employer_event_participations WHERE event_id=$1 AND employer_id=$2',[other.event,f.company])).rows[0].n,1)
 }finally{await db.close()}
})
