import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {outcomeDatabase} from '../support/outcome-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await outcomeDatabase()})
after(async()=>await db?.close())
async function application(f,offering=f.offering,vacancy=f.vacancy){
 await db.exec('RESET ROLE')
 return (await db.query("INSERT INTO public.applications(registrant_id,participant_id,event_vacancy_id,vacancy_definition_id,application_status,source) VALUES($1,$2,$3,$4,'applied','event') RETURNING id",[f.participation,f.profile.participant_id,offering,vacancy])).rows[0].id
}
const record=async(f,app=null)=> (await db.query("SELECT (public.record_interview_result($1,$2,$3,$4,'qualified',$5,'Synthetic private interview note')).id AS id",[f.participation,f.event,f.company,f.vacancy,app])).rows[0].id
test('interview RPC rejects an application for another company/vacancy at the same event',async()=>{
 const f=await createRecruitmentFixture(db),g=await createRecruitmentFixture(db),actor=await seedAccount(db,{role:'staff'})
 const foreignOffering=(await db.query('INSERT INTO public.event_vacancies(event_id,vacancy_definition_id) VALUES($1,$2) RETURNING id',[f.event,g.vacancy])).rows[0].id
 const foreignApp=await application(f,foreignOffering,g.vacancy)
 await become(db,actor,{aal:'aal2'})
 await assert.rejects(()=>record(f,foreignApp))
})
test('interview RPC enforces MFA/session independently of the surrounding Data API',async()=>{
 const f=await createRecruitmentFixture(db),actor=await seedAccount(db,{role:'staff'})
 await become(db,actor,{aal:'aal1'})
 await assert.rejects(()=>record(f),error=>error.code==='42501')
})
test('direct interview insertion cannot forge contradictory event and company references',async()=>{
 const f=await createRecruitmentFixture(db),g=await createRecruitmentFixture(db),actor=await seedAccount(db,{role:'staff'})
 await become(db,actor,{aal:'aal2'})
 await assert.rejects(()=>db.query("INSERT INTO public.interview_logs(registrant_id,event_id,interviewer_id,position,company,interview_status,employer_id,vacancy_definition_id) VALUES($1,$2,$3,'Forged','Forged','qualified',$4,$5)",[f.participation,g.event,actor.id,g.company,g.vacancy]))
})
test('staff outcome access uses the canonical event participation rather than a missing legacy row',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),actor=await seedAccount(db,{role:'staff'})
 await become(db,actor,{aal:'aal2'})
 const row=(await db.query("INSERT INTO public.employment_outcomes(application_id,outcome,employer_id) VALUES($1,'hired',$2) RETURNING id",[app,f.company])).rows[0]
 assert.ok(row.id)
})
test('a material outcome update records its actual reviewer instead of a client-chosen verifier',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),admin=await seedAccount(db,{role:'admin'}),other=await seedAccount(db,{role:'staff'})
 await become(db,admin,{aal:'aal2'})
 const row=(await db.query("INSERT INTO public.employment_outcomes(application_id,outcome,employer_id,verified_by,verification_date) VALUES($1,'hired',$2,$3,now()) RETURNING verified_by",[app,f.company,other.id])).rows[0]
 assert.equal(row.verified_by,admin.id)
})

test('legitimate linked and unlinked interview recording preserves duplicates, check-in and canonical snapshots',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),staff=await seedAccount(db,{role:'staff'})
 await become(db,staff,{aal:'aal2'})
 const id=await record(f,app)
 const row=(await db.query('SELECT interviewer_id,position,company,application_id FROM public.interview_logs WHERE id=$1',[id])).rows[0]
 assert.equal(row.interviewer_id,staff.id);assert.equal(row.application_id,app);assert.equal(row.company,'Fixture employer')
 await assert.rejects(()=>record(f,app),/already recorded/)
 const manual=(await db.query("SELECT (public.record_interview_result($1,$2,$3,$4,'near_hire',NULL,NULL)).id AS id",[f.participation,f.event,f.company,f.vacancy])).rows[0]
 assert.ok(manual.id)
 await db.exec('RESET ROLE');await db.query("UPDATE public.event_participations SET check_in_status='pending' WHERE id=$1",[f.participation])
 await become(db,staff,{aal:'aal2'})
 await assert.rejects(()=>db.query("SELECT public.record_interview_result($1,$2,$3,$4,'hots')",[f.participation,f.event,f.company,f.vacancy]),/checked in/)
})
test('direct valid interview insertion derives snapshot labels; historical notes stay editable after vacancy deactivation',async()=>{
 const f=await createRecruitmentFixture(db),admin=await seedAccount(db,{role:'admin'})
 await become(db,admin,{aal:'aal2'})
 const row=(await db.query("INSERT INTO public.interview_logs(registrant_id,event_id,interviewer_id,position,company,interview_status,employer_id,vacancy_definition_id) VALUES($1,$2,$3,'Forged title','Forged company','qualified',$4,$5) RETURNING id,position,company",[f.participation,f.event,admin.id,f.company,f.vacancy])).rows[0]
 assert.equal(row.company,'Fixture employer');assert.ok(row.position.startsWith('Fixture vacancy'))
 await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET is_active=false WHERE id=$1',[f.vacancy])
 await become(db,admin,{aal:'aal2'})
 assert.equal((await db.query("UPDATE public.interview_logs SET interview_notes='Synthetic later note' WHERE id=$1 RETURNING id",[row.id])).rows[0].id,row.id)
})
test('outcome jurisdiction preserves municipal limits, provincial oversight and medical event access',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),admin=await seedAccount(db,{role:'admin'})
 await become(db,admin,{aal:'aal2'})
 const interviewId=await record(f)
 const id=(await db.query("INSERT INTO public.employment_outcomes(application_id,outcome,employer_id) VALUES($1,'hired',$2) RETURNING id",[app,f.company])).rows[0].id
 const municipal=await seedAccount(db,{role:'supervisor'})
 await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[municipal.id])
 await become(db,municipal,{aal:'aal2'})
 assert.deepEqual((await db.query('SELECT id FROM public.employment_outcomes WHERE id=$1',[id])).rows,[])
 await assert.rejects(()=>db.query("INSERT INTO public.employment_outcomes(application_id,outcome) VALUES($1,'pending')",[app]),error=>error.code==='42501')
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Tuguegarao City' WHERE id=$1",[municipal.id])
 await become(db,municipal,{aal:'aal2'})
 assert.equal((await db.query('SELECT id FROM public.employment_outcomes WHERE id=$1',[id])).rows.length,1)
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=true WHERE id=$1",[municipal.id])
 await become(db,municipal,{aal:'aal2'});assert.equal((await db.query('SELECT id FROM public.employment_outcomes WHERE id=$1',[id])).rows.length,1)
 const medical=await seedAccount(db,{role:'medical'})
 await become(db,medical,{aal:'aal2'})
 assert.equal((await db.query('SELECT id FROM public.employment_outcomes WHERE id=$1',[id])).rows.length,1)
 assert.equal((await db.query('SELECT id FROM public.interview_logs WHERE id=$1',[interviewId])).rows.length,1)
})
test('outcome material updates stamp their reviewer, no-ops preserve attribution and pending clears verification',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),admin=await seedAccount(db,{role:'admin'}),staff=await seedAccount(db,{role:'staff'})
 await become(db,admin,{aal:'aal2'})
 const row=(await db.query("INSERT INTO public.employment_outcomes(application_id,outcome) VALUES($1,'hired') RETURNING id,employer_id,verified_by,verification_date",[app])).rows[0]
 assert.equal(row.employer_id,f.company);assert.equal(row.verified_by,admin.id)
 await become(db,staff,{aal:'aal2'})
 const noop=(await db.query('UPDATE public.employment_outcomes SET verified_by=$1,verification_date=now() WHERE id=$2 RETURNING verified_by,verification_date',[staff.id,row.id])).rows[0]
 assert.equal(noop.verified_by,admin.id);assert.deepEqual(noop.verification_date,row.verification_date)
 const changed=(await db.query("UPDATE public.employment_outcomes SET verification_notes='Synthetic material verification note',verified_by=$1 WHERE id=$2 RETURNING verified_by",[admin.id,row.id])).rows[0]
 assert.equal(changed.verified_by,staff.id)
 const pending=(await db.query("UPDATE public.employment_outcomes SET outcome='pending' WHERE id=$1 RETURNING verified_by,verification_date",[row.id])).rows[0]
 assert.deepEqual(pending,{verified_by:null,verification_date:null})
})
test('outcome company binding and revoked session checks apply through ordinary direct writes',async()=>{
 const f=await createRecruitmentFixture(db),g=await createRecruitmentFixture(db),app=await application(f),admin=await seedAccount(db,{role:'admin'})
 await become(db,admin,{aal:'aal2'})
 await assert.rejects(()=>db.query("INSERT INTO public.employment_outcomes(application_id,outcome,employer_id) VALUES($1,'hired',$2)",[app,g.company]),error=>error.code==='23514')
 await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE id=$1',[admin.sessionId])
 await become(db,admin,{aal:'aal2'})
 await assert.rejects(()=>record(f),error=>error.code==='42501')
})
test('privileged entrypoints deny anonymous access and audits contain statuses rather than personal details',async()=>{
 await db.exec('RESET ROLE')
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.record_interview_result(uuid,uuid,uuid,uuid,public.interview_status,uuid,text)','EXECUTE') AS ok")).rows[0].ok,false)
 for(const name of ['app.guard_interview_references()','app.guard_outcome_reviewer()','app.audit_employment_record()'])
  assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS ok",[name])).rows[0].ok,false)
 const logs=(await db.query("SELECT table_name,new_data FROM public.audit_logs WHERE action='employment_record_changed'")).rows
 assert.ok(logs.length>=5)
 for(const log of logs)assert.deepEqual(Object.keys(log.new_data),[log.table_name==='interview_logs'?'interview_status':'outcome'])
})

test('existing nullable application deletion preserves a historical inactive-position interview',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),admin=await seedAccount(db,{role:'admin'})
 await become(db,admin,{aal:'aal2'});const id=await record(f,app)
 await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET is_active=false WHERE id=$1',[f.vacancy])
 await become(db,admin,{aal:'aal2'})
 await db.query('DELETE FROM public.applications WHERE id=$1',[app])
 assert.equal((await db.query('SELECT application_id FROM public.interview_logs WHERE id=$1',[id])).rows[0].application_id,null)
})

test('existing verifier profile deletion clears its nullable attribution without claiming a new review',async()=>{
 const f=await createRecruitmentFixture(db),app=await application(f),reviewer=await seedAccount(db,{role:'staff'})
 await become(db,reviewer,{aal:'aal2'})
 const row=(await db.query("INSERT INTO public.employment_outcomes(application_id,outcome) VALUES($1,'hired') RETURNING id,verification_date",[app])).rows[0]
 const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
 await db.query('DELETE FROM public.profiles WHERE id=$1',[reviewer.id])
 const result=(await db.query('SELECT verified_by,verification_date FROM public.employment_outcomes WHERE id=$1',[row.id])).rows[0]
 assert.equal(result.verified_by,null);assert.deepEqual(result.verification_date,row.verification_date)
})
