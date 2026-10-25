import test from 'node:test'
import assert from 'node:assert/strict'
import {recruitmentDatabase} from '../support/recruitment-database.js'
import {seedAccount,become,validApplication} from '../support/identity-database.js'
import {createRecruitmentFixture as fixture,payload} from '../support/recruitment-fixture.js'

test('read-only audit baseline: pending TOTP employer legacy RPC exposes candidate contact',async()=>{
 const db=await recruitmentDatabase()
 try {
  const f=await fixture(db)
  await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[f.company])
  await become(db,f.owner,{aal:'aal2'})
  const rows=(await db.query('SELECT * FROM public.get_employer_applicants($1)',[f.offering])).rows
  assert.equal(rows.length,1);assert.equal(rows[0].email,payload.email)
 } finally {await db.close()}
})

test('read-only audit baseline: password applicant with pending-company TOTP can submit despite Google-only policy',async()=>{
 const db=await recruitmentDatabase()
 try {
  const f=await fixture(db)
  await become(db,f.user)
  await db.query('SELECT public.register_employer_application($1::jsonb)',[JSON.stringify(validApplication)])
  await become(db,f.user,{aal:'aal2',method:'password',path:'/rpc/submit_application'})
  await db.query('SELECT public.quest_enforce_partner_mfa()')
  const result=(await db.query('SELECT public.submit_application($1)',[f.vacancy])).rows[0].submit_application
  assert.equal(result.status,'created')
 } finally {await db.close()}
})

test('read-only audit baseline: profile writer accepts another account resume path',async()=>{
 const db=await recruitmentDatabase()
 try {
  const f=await fixture(db)
  await become(db,f.user)
  const result=(await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify({...payload,resume_path:f.owner.id+'/other.pdf'})])).rows[0]
  assert.equal(result.resume_path,f.owner.id+'/other.pdf')
 } finally {await db.close()}
})

test('read-only audit baseline: municipality supervisor reads an out-of-jurisdiction resume',async()=>{
 const db=await recruitmentDatabase()
 try {
  const f=await fixture(db),supervisor=await seedAccount(db,{role:'supervisor',factor:true})
  await db.exec('RESET ROLE')
  await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[supervisor.id])
  const path=f.user.id+'/fixture.pdf'
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('resumes',$1)",[path])
  await become(db,supervisor,{aal:'aal2'})
  assert.equal((await db.query("SELECT id FROM storage.objects WHERE bucket_id='resumes' AND name=$1",[path])).rows.length,1)
  assert.equal((await db.query('SELECT public.supervisor_can_view_event($1)',[f.event])).rows[0].supervisor_can_view_event,false)
 } finally {await db.close()}
})

test('read-only audit baseline: publication definer accepts a disabled company owner',async()=>{
 const db=await recruitmentDatabase()
 try {
  const f=await fixture(db)
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claims','{}',false)")
  await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[f.owner.id])
  await become(db,f.owner,{aal:'aal2'})
  const result=(await db.query('SELECT public.close_vacancy($1)',[f.vacancy])).rows[0].close_vacancy
  assert.equal(result.status,'closed')
 } finally {await db.close()}
})

test('read-only audit baseline: incomplete onboarding creates an application omitted from employer review',async()=>{
 const db=await recruitmentDatabase()
 try {
  const f=await fixture(db),user=await seedAccount(db,{google:true})
  await become(db,user)
  await db.query('SELECT public.get_or_create_participant()')
  assert.equal((await db.query('SELECT public.submit_application($1) AS result',[f.vacancy])).rows[0].result.status,'created')
  await become(db,f.owner,{aal:'aal2'})
  assert.deepEqual((await db.query('SELECT * FROM public.list_employer_applications($1)',[f.vacancy])).rows,[])
 } finally {await db.close()}
})
