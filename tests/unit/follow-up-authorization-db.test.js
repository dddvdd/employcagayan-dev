import test from 'node:test'
import assert from 'node:assert/strict'
import {followUpDatabase} from '../support/follow-up-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
async function caseRecord(db){
 const f=await createRecruitmentFixture(db);await become(db,f.user)
 const app=(await db.query('SELECT public.submit_event_application($1,$2) result',[f.participation,f.offering])).rows[0].result.application_id
 const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
 const outcome=(await db.query("INSERT INTO public.employment_outcomes(application_id,outcome) VALUES($1,'hired') RETURNING id",[app])).rows[0].id
 const followup=(await db.query("INSERT INTO public.follow_ups(employment_outcome_id,follow_up_type) VALUES($1,'30_day') RETURNING id",[outcome])).rows[0].id
 return {...f,admin,app,outcome,followup}
}
test('baseline follow-ups hide canonical cases from authorized staff while outcomes remain accessible',async()=>{
 const db=await followUpDatabase()
 try{const f=await caseRecord(db),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
  assert.equal((await db.query('SELECT id FROM public.employment_outcomes WHERE id=$1',[f.outcome])).rows.length,1)
  assert.equal((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows.length,0)
  await assert.rejects(()=>db.query("INSERT INTO public.follow_ups(employment_outcome_id,follow_up_type) VALUES($1,'60_day')",[f.outcome]),e=>e.code==='42501')
 }finally{await db.close()}
})
test('baseline administrator can reassign an existing follow-up to another employment case',async()=>{
 const db=await followUpDatabase()
 try{const f=await caseRecord(db),other=await caseRecord(db);await become(db,f.admin,{aal:'aal2'})
  assert.equal((await db.query('UPDATE public.follow_ups SET employment_outcome_id=$2 WHERE id=$1 RETURNING employment_outcome_id',[f.followup,other.outcome])).rows[0].employment_outcome_id,other.outcome)
 }finally{await db.close()}
})
test('baseline blank completion date is rejected by the actual date column',async()=>{
 const db=await followUpDatabase()
 try{const f=await caseRecord(db);await become(db,f.admin,{aal:'aal2'})
  await assert.rejects(()=>db.query("UPDATE public.follow_ups SET completed_date='' WHERE id=$1",[f.followup]),e=>e.code==='22007')
 }finally{await db.close()}
})

test('canonical follow-up access supports staff reads, inserts and ordinary edits without legacy rows',async()=>{
 const db=await followUpDatabase({harden:true})
 try{const f=await caseRecord(db),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
  assert.equal((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows.length,1)
  const changed=(await db.query("UPDATE public.follow_ups SET status='unreachable',completed_date=NULL,still_employed=false,remarks='Synthetic private follow-up note' WHERE id=$1 RETURNING status,completed_date,still_employed",[f.followup])).rows[0]
  assert.deepEqual(changed,{status:'unreachable',completed_date:null,still_employed:false})
  assert.ok((await db.query("INSERT INTO public.follow_ups(employment_outcome_id,follow_up_type) VALUES($1,'60_day') RETURNING id",[f.outcome])).rows[0].id)
 }finally{await db.close()}
})
test('canonical follow-up scope preserves municipal limits, provincial oversight and existing medical scope',async()=>{
 const db=await followUpDatabase({harden:true})
 try{const f=await caseRecord(db),sup=await seedAccount(db,{role:'supervisor'})
  await db.query("UPDATE public.profiles SET jurisdiction='Solana',is_provincial=false WHERE id=$1",[sup.id]);await become(db,sup,{aal:'aal2'})
  assert.deepEqual((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows,[])
  assert.equal((await db.query("UPDATE public.follow_ups SET status='completed' WHERE id=$1 RETURNING id",[f.followup])).rows.length,0)
  await assert.rejects(()=>db.query("INSERT INTO public.follow_ups(employment_outcome_id,follow_up_type) VALUES($1,'90_day')",[f.outcome]),e=>e.code==='42501')
  await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Tuguegarao City' WHERE id=$1",[sup.id]);await become(db,sup,{aal:'aal2'})
  assert.equal((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows.length,1)
  await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Solana',is_provincial=true WHERE id=$1",[sup.id]);await become(db,sup,{aal:'aal2'})
  assert.equal((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows.length,1)
  const medical=await seedAccount(db,{role:'medical'});await become(db,medical,{aal:'aal2'})
  assert.equal((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows.length,1)
 }finally{await db.close()}
})
test('follow-up identity and creation provenance cannot be reassigned even by an administrator',async()=>{
 const db=await followUpDatabase({harden:true})
 try{const f=await caseRecord(db),other=await caseRecord(db);await become(db,f.admin,{aal:'aal2'})
  await assert.rejects(()=>db.query('UPDATE public.follow_ups SET employment_outcome_id=$2 WHERE id=$1',[f.followup,other.outcome]),e=>e.code==='23514')
  await assert.rejects(()=>db.query('UPDATE public.follow_ups SET id=gen_random_uuid() WHERE id=$1',[f.followup]),e=>e.code==='23514')
  await assert.rejects(()=>db.query("UPDATE public.follow_ups SET created_at='2000-01-01' WHERE id=$1",[f.followup]),e=>e.code==='23514')
  assert.equal((await db.query('UPDATE public.follow_ups SET employment_outcome_id=employment_outcome_id WHERE id=$1 RETURNING id',[f.followup])).rows[0].id,f.followup)
 }finally{await db.close()}
})
test('follow-up audit identifies the actual actor and status without recording private working text; no-ops do not duplicate it',async()=>{
 const db=await followUpDatabase({harden:true})
 try{const f=await caseRecord(db),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
  await db.query("UPDATE public.follow_ups SET remarks='Synthetic private salary/contact content' WHERE id=$1",[f.followup])
  await db.query("UPDATE public.follow_ups SET remarks='Synthetic private salary/contact content' WHERE id=$1",[f.followup])
  await db.exec('RESET ROLE')
  const rows=(await db.query("SELECT user_id,old_data,new_data FROM public.audit_logs WHERE record_id=$1 AND action='follow_up_changed' ORDER BY created_at",[f.followup])).rows
  assert.equal(rows.length,2);assert.equal(rows[1].user_id,staff.id)
  for(const row of rows)for(const value of [row.old_data,row.new_data].filter(Boolean))assert.deepEqual(Object.keys(value).sort(),['follow_up_type','status'])
  assert.ok(!JSON.stringify(rows).includes('salary/contact'))
 }finally{await db.close()}
})
test('follow-up scope denies inactive/AAL1/revoked Partners and employer/jobseeker access without expanding trigger execution',async()=>{
 const db=await followUpDatabase({harden:true})
 try{const f=await caseRecord(db),staff=await seedAccount(db,{role:'staff'})
  for(const role of ['employer','applicant']){const actor=await seedAccount(db,{role,google:role==='applicant'});await become(db,actor,{aal:'aal2'})
   assert.deepEqual((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows,[])
  }
  await become(db,staff,{aal:'aal1'});assert.deepEqual((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows,[])
  await db.exec('RESET ROLE');await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[staff.id]);await become(db,staff,{aal:'aal2'})
  assert.deepEqual((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows,[])
  await db.exec('RESET ROLE');await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[staff.id]);await db.query('DELETE FROM auth.sessions WHERE id=$1',[staff.sessionId]);await become(db,staff,{aal:'aal2'})
  assert.deepEqual((await db.query('SELECT id FROM public.follow_ups WHERE id=$1',[f.followup])).rows,[])
  await db.exec('RESET ROLE')
  for(const role of ['anon','authenticated','service_role'])for(const fn of ['app.guard_follow_up_case_identity()','app.audit_follow_up_change()'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).rows[0].allowed,false)
  assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') allowed")).rows[0].allowed,false)
 }finally{await db.close()}
})
