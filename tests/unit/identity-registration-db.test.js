import { before,after,test } from 'node:test'
import assert from 'node:assert/strict'
import { identityDatabase, seedAccount, become, validApplication } from '../support/identity-database.js'

let db
before(async () => { db = await identityDatabase() })
after(async () => { await db?.close() })
const denied = work => assert.rejects(work, error => error.code === '42501')
const bootstrap = async () => (await db.query('SELECT public.auth_account_bootstrap() AS account')).rows[0].account
const register = async data => (await db.query('SELECT public.register_employer_application($1::jsonb) AS id',[JSON.stringify(data)])).rows[0].id

test('new signup cannot request any privileged role through metadata', async () => {
  for (const role of ['employer','admin','staff','supervisor','medical']) {
    const user = await seedAccount(db,{metadata:{role}})
    await become(db,user)
    assert.equal((await bootstrap()).role,'applicant')
  }
})

test('jobseeker requires confirmed Google identity and OAuth authentication', async () => {
  const google = await seedAccount(db,{google:true})
  await become(db,google)
  assert.equal((await bootstrap()).jobseeker_authorized,true)
  await db.query('SELECT app.enforce_partner_mfa()')
  const participant = (await db.query('SELECT (public.get_or_create_participant()).*')).rows[0]
  assert.notEqual(participant.id,google.id)
  assert.equal(participant.auth_user_id,google.id)
  await become(db,google,{method:'password'})
  assert.equal((await bootstrap()).jobseeker_authorized,false)
  await denied(() => db.query('SELECT public.get_or_create_participant()'))
  await denied(() => db.query('SELECT public.save_jobseeker_profile($1)',[JSON.stringify({first_name:'Fixture'})]))
  await denied(() => db.query('SELECT app.enforce_partner_mfa()'))
})

test('OAuth metadata spoof and unsupported identity do not substitute for Google', async () => {
  const user = await seedAccount(db)
  await become(db,user,{method:'oauth',extras:{user_metadata:{provider:'google',role:'admin'}}})
  assert.equal((await bootstrap()).jobseeker_authorized,false)
  await denied(() => db.query('SELECT public.get_or_create_participant()'))
  const google = await seedAccount(db,{google:true})
  await db.query("INSERT INTO auth.identities VALUES($1,'github')",[google.id])
  await become(db,google)
  assert.equal((await bootstrap()).jobseeker_authorized,false)
})

test('new confirmed password applicant can submit only an owner pending application', async () => {
  const user = await seedAccount(db)
  await become(db,user,{path:'/rpc/register_employer_application'})
  await db.query('SELECT app.enforce_partner_mfa()')
  const id = await register({...validApplication,registered_user_id:crypto.randomUUID(),registration_status:'approved',registration_source:'admin',role:'admin',employer_code:'FAKE',is_active:false})
  const account = await bootstrap()
  assert.equal(account.role,'applicant')
  assert.equal(account.partner_authorized,false)
  assert.equal(account.jobseeker_authorized,false)
  assert.equal(account.mfa_required,false)
  assert.equal(account.employer_mfa_satisfied,false)
  assert.equal(account.employer_application.id,id)
  assert.equal(account.employer_application.registration_status,'pending')
  assert.equal(await register(validApplication),id)
  await db.exec('RESET ROLE')
  const row = (await db.query('SELECT * FROM public.employers WHERE id=$1',[id])).rows[0]
  assert.equal(row.registered_user_id,user.id)
  assert.equal(row.email,user.email)
  assert.equal(row.registration_source,'self_registered')
  assert.equal(row.is_active,true)
  assert.equal(row.employer_code,null)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.employer_accreditation_requirements r JOIN public.employer_accreditation a ON a.id=r.accreditation_id WHERE a.employer_id=$1',[id])).rows[0].n,15)
})

test('unconfirmed, inactive and staff accounts cannot self-register a company', async () => {
  for (const options of [{confirmed:false},{active:false},{role:'staff'}]) {
    const user=await seedAccount(db,options)
    await become(db,user,{aal:'aal2',path:'/rpc/register_employer_application'})
    await denied(() => register(validApplication))
  }
})

test('invalid company data and public direct inserts are rejected', async () => {
  const user=await seedAccount(db)
  await become(db,user,{path:'/rpc/register_employer_application'})
  for (const patch of [{company_name:''},{business_structure:''},{osh_classification:'bogus'},{contact_number:'text'}]) {
    await assert.rejects(() => register({...validApplication,...patch}),error=>error.code==='22023')
  }
  await denied(() => db.query("INSERT INTO public.employers(company_name,registered_user_id,registration_status,registration_source) VALUES('Bypass',$1,'pending','self_registered')",[user.id]))
})

test('approved employer association cannot create a duplicate jobseeker participant', async () => {
  const user=await seedAccount(db,{google:true})
  await become(db,user,{path:'/rpc/register_employer_application'})
  await register(validApplication)
  await db.exec('RESET ROLE')
  await db.query("UPDATE public.employers SET registration_status='approved' WHERE registered_user_id=$1",[user.id])
  await become(db,user,{aal:'aal2'})
  await denied(()=>db.query('SELECT public.get_or_create_participant()'))
  assert.equal((await bootstrap()).jobseeker_authorized,false)
})

test('pending employer can manage own accreditation at AAL2 without vacancy privileges', async () => {
  const user=await seedAccount(db)
  await become(db,user,{path:'/rpc/register_employer_application'})
  const id=await register(validApplication)
  await become(db,user)
  await denied(()=>db.query('SELECT app.enforce_partner_mfa()'))
  await become(db,user,{aal:'aal2'})
  await db.query('SELECT app.enforce_partner_mfa()')
  assert.equal((await db.query('SELECT id FROM public.employers')).rows.some(row=>row.id===id),true)
  await denied(()=>db.query("INSERT INTO public.vacancy_definitions(employer_id,is_active,position) VALUES($1,true,'Bypass')",[id]))
  const requirement=(await db.query('SELECT r.id FROM public.employer_accreditation_requirements r JOIN public.employer_accreditation a ON a.id=r.accreditation_id WHERE a.employer_id=$1 LIMIT 1',[id])).rows[0]
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('accreditation-documents',$1)",[`${id}/${requirement.id}.pdf`])
  await denied(()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('accreditation-documents',$1)",[`${crypto.randomUUID()}/other.pdf`]))
})

test('self-service cannot change profile permissions or company approval fields', async () => {
  const user=await seedAccount(db)
  await become(db,user,{path:'/rpc/register_employer_application'})
  const id=await register(validApplication)
  const admin=await seedAccount(db,{role:'admin'})
  await db.query("UPDATE public.profiles SET role='employer' WHERE id=$1",[user.id])
  await become(db,user,{aal:'aal2'})
  await denied(()=>db.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[user.id]))
  await denied(()=>db.query("UPDATE public.profiles SET email='spoof@example.invalid' WHERE id=$1",[user.id]))
  await denied(()=>db.query("UPDATE public.employers SET employer_code='FAKE' WHERE id=$1",[id]))
  await denied(()=>db.query("UPDATE public.employers SET registered_user_id=$1 WHERE id=$2",[admin.id,id]))
})

test('approval fails if mandatory rows are absent; valid approval assigns the Partner role', async () => {
  const user=await seedAccount(db)
  await become(db,user,{path:'/rpc/register_employer_application'})
  const id=await register(validApplication)
  const admin=await seedAccount(db,{role:'admin'})
  await become(db,admin,{aal:'aal1'})
  await denied(()=>db.query('SELECT public.admin_approve_employer($1)',[id]))
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query('SELECT public.admin_approve_employer($1)',[id]),/All applicable/)
  await db.exec('RESET ROLE')
  await db.query("UPDATE public.employer_accreditation_requirements SET status='approved' WHERE accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1)",[id])
  await db.query("DELETE FROM public.employer_accreditation_requirements WHERE requirement_key='company_profile' AND accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1)",[id])
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query('SELECT public.admin_approve_employer($1)',[id]),/All applicable/)
  await db.exec('RESET ROLE')
  await db.query("INSERT INTO public.employer_accreditation_requirements(accreditation_id,requirement_key,status) SELECT id,'company_profile','approved' FROM public.employer_accreditation WHERE employer_id=$1",[id])
  await db.query("UPDATE public.employer_accreditation_requirements r SET document_path=$1::text||'/'||r.id::text||'.pdf' WHERE accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1)",[id])
  await db.query("INSERT INTO storage.objects(bucket_id,name) SELECT 'accreditation-documents',document_path FROM public.employer_accreditation_requirements WHERE accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1)",[id])
  await become(db,admin,{aal:'aal2'})
  await db.query('SELECT public.admin_approve_employer($1)',[id])
  await become(db,user,{aal:'aal2'})
  assert.equal((await bootstrap()).role,'employer')
  assert.equal((await bootstrap()).partner_authorized,true)
  await db.query("INSERT INTO public.vacancy_definitions(employer_id,is_active,position) VALUES($1,true,'Authorized')",[id])
  await denied(()=>db.query("INSERT INTO public.vacancy_definitions(employer_id,is_active,position) VALUES($1,true,'Other company')",[crypto.randomUUID()]))
})

test('admin link and reject use null-safe active AAL2 authorization', async () => {
  const user=await seedAccount(db)
  await become(db,user,{aal:'aal2'})
  await denied(()=>db.query('SELECT public.admin_link_employer_account($1,$2)',[crypto.randomUUID(),user.email]))
  await denied(()=>db.query('SELECT public.admin_reject_employer($1,$2)',[crypto.randomUUID(),'fixture']))
  const inactive=await seedAccount(db,{role:'admin',active:false})
  await become(db,inactive,{aal:'aal2'})
  await denied(()=>db.query('SELECT public.admin_link_employer_account($1,$2)',[crypto.randomUUID(),user.email]))
})

test('Google profile writer derives ownership and password sessions cannot read the saved row or resume',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  const payload={first_name:'Fixture',last_name:'Owner',email:user.email,birthdate:'2000-01-01',data_subject_rights_agreed:true,participant_id:crypto.randomUUID()}
  const profile=(await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify(payload)])).rows[0]
  const participant=(await db.query('SELECT id,auth_user_id FROM public.participants')).rows[0]
  assert.equal(profile.participant_id,participant.id)
  assert.equal(participant.auth_user_id,user.id)
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('resumes',$1)",[`${user.id}/fixture.pdf`])
  await become(db,user,{method:'password'})
  assert.deepEqual((await db.query('SELECT participant_id FROM public.jobseeker_profiles')).rows,[])
  assert.deepEqual((await db.query('SELECT id FROM storage.objects')).rows,[])
  await denied(()=>db.query('SELECT public.save_jobseeker_profile($1::jsonb)',[JSON.stringify(payload)]))
})

test('document submission and review require ownership, AAL2 and an actual requirement object',async()=>{
  const owner=await seedAccount(db)
  await become(db,owner,{path:'/rpc/register_employer_application'})
  const company=await register(validApplication)
  await become(db,owner,{aal:'aal2'})
  const requirement=(await db.query('SELECT r.id FROM public.employer_accreditation_requirements r JOIN public.employer_accreditation a ON a.id=r.accreditation_id WHERE a.employer_id=$1 LIMIT 1',[company])).rows[0]
  const path=`${company}/${requirement.id}.pdf`
  await denied(()=>db.query('SELECT public.submit_accreditation_document($1,$2,$3)',[requirement.id,path,'fixture.pdf']))
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('accreditation-documents',$1)",[path])
  await db.query('SELECT public.submit_accreditation_document($1,$2,$3)',[requirement.id,path,'fixture.pdf'])
  const attacker=await seedAccount(db,{google:true})
  await become(db,attacker,{aal:'aal2'})
  await denied(()=>db.query('SELECT public.submit_accreditation_document($1,$2,$3)',[requirement.id,path,'fixture.pdf']))
  await denied(()=>db.query('SELECT public.review_accreditation_requirement($1,$2)',[requirement.id,'approved']))
  const admin=await seedAccount(db,{role:'admin'})
  await become(db,admin,{aal:'aal2'})
  await db.query('SELECT public.review_accreditation_requirement($1,$2)',[requirement.id,'approved'])
  await become(db,owner,{aal:'aal2'})
  await assert.rejects(()=>db.query('SELECT public.submit_accreditation_document($1,$2,$3)',[requirement.id,path,'fixture.pdf']),/Approved documents/)
  assert.deepEqual((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name',[path])).rows,[])
  assert.deepEqual((await db.query("UPDATE storage.objects SET name=$1 WHERE name=$1 RETURNING name",[path])).rows,[])
  await denied(()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('accreditation-documents',$1)",[path]))
})

test('banned identities and unconfirmed admins cannot retain database privileges',async()=>{
  const admin=await seedAccount(db,{role:'admin',confirmed:false})
  await become(db,admin,{aal:'aal2'})
  await denied(()=>db.query('SELECT public.admin_reject_employer($1,$2)',[crypto.randomUUID(),'fixture']))
  const user=await seedAccount(db,{google:true})
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[user.id])
  await become(db,user,{aal:'aal2'})
  assert.equal((await bootstrap()).is_active,false)
  await denied(()=>db.query('SELECT app.enforce_partner_mfa()'))
  assert.deepEqual((await db.query('SELECT id FROM public.profiles')).rows,[])
})

test('unapproved or absent profile returns no privileged role even for legacy NULL-unsafe checks',async()=>{
  const user=await seedAccount(db,{role:'employer'})
  await become(db,user,{aal:'aal2'})
  assert.equal((await db.query('SELECT app.current_user_role()::text AS role')).rows[0].role,'applicant')
  assert.equal((await bootstrap()).role,'employer')
  assert.equal((await bootstrap()).partner_authorized,false)
  await become(db,{id:crypto.randomUUID(),google:false},{aal:'aal2'})
  assert.equal((await db.query('SELECT app.current_user_role()::text AS role')).rows[0].role,'applicant')
})

test('authorization decisions are audited without contact data, names or secrets',async()=>{
  await db.exec('RESET ROLE')
  const rows=(await db.query('SELECT old_data,new_data FROM public.audit_logs')).rows
  assert.ok(rows.length>0)
  for(const row of rows) {
    for(const data of [row.old_data,row.new_data]) {
      if(!data) continue
      assert.equal(Object.keys(data).some(key=>['email','full_name','company_name','document_path','original_filename','password','secret'].includes(key)),false)
    }
  }
})

test('factor removal, replacement and session revocation invalidate an old AAL2 claim',async()=>{
  const staff=await seedAccount(db,{role:'staff'})
  await become(db,staff,{aal:'aal2'})
  await db.query('SELECT app.enforce_partner_mfa()')
  await db.exec('RESET ROLE')
  await db.query('DELETE FROM auth.mfa_factors WHERE user_id=$1',[staff.id])
  await become(db,staff,{aal:'aal2'})
  assert.equal((await bootstrap()).mfa_satisfied,false)
  await denied(()=>db.query('SELECT app.enforce_partner_mfa()'))
  await db.exec('RESET ROLE')
  await db.query("INSERT INTO auth.mfa_factors(user_id,status,factor_type,created_at) VALUES($1,'verified','totp',now())",[staff.id])
  await become(db,staff,{aal:'aal2',extras:{amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-60}]}})
  await denied(()=>db.query('SELECT app.enforce_partner_mfa()'))
  await become(db,staff,{aal:'aal2'})
  await db.query('SELECT app.enforce_partner_mfa()')
  await db.exec('RESET ROLE')
  await db.query('DELETE FROM auth.sessions WHERE id=$1',[staff.sessionId])
  await become(db,staff,{aal:'aal2'})
  assert.equal((await bootstrap()).is_active,false)
  await denied(()=>db.query('SELECT app.enforce_partner_mfa()'))
})

test('medical opt-in MFA retains its existing phone-factor behavior',async()=>{
  const medical=await seedAccount(db,{role:'medical',factor:false})
  await become(db,medical)
  await db.query('SELECT app.enforce_partner_mfa()')
  await db.exec('RESET ROLE')
  await db.query("INSERT INTO auth.mfa_factors(user_id,status,factor_type) VALUES($1,'verified','phone')",[medical.id])
  await become(db,medical)
  await denied(()=>db.query('SELECT app.enforce_partner_mfa()'))
  await become(db,medical,{aal:'aal2',extras:{amr:[{method:'otp',timestamp:Math.floor(Date.now()/1000)}]}})
  await db.query('SELECT app.enforce_partner_mfa()')
})

test('pending accreditation preserves Google jobseeker access without additional MFA',async()=>{
  const user=await seedAccount(db,{google:true,factor:false})
  await become(db,user,{path:'/rpc/register_employer_application'})
  const company=await register(validApplication)
  await become(db,user)
  const account=await bootstrap()
  assert.equal(account.jobseeker_authorized,true)
  assert.equal(account.mfa_required,false)
  assert.equal(account.employer_mfa_satisfied,false)
  await db.query('SELECT app.enforce_partner_mfa()')
  const participant=(await db.query('SELECT * FROM public.get_or_create_participant()')).rows[0]
  assert.equal(participant.auth_user_id,user.id)
  assert.deepEqual((await db.query('SELECT id FROM public.employer_accreditation')).rows,[])
  await denied(()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('accreditation-documents',$1)",[`${company}/not-authorized.pdf`]))
})

test('profile writer has no anonymous or PUBLIC execution path',async()=>{
  await db.exec('RESET ROLE')
  const privileges=(await db.query("SELECT has_function_privilege('anon','public.save_jobseeker_profile(jsonb)','EXECUTE') AS anonymous,has_function_privilege('authenticated','public.save_jobseeker_profile(jsonb)','EXECUTE') AS signed_in")).rows[0]
  assert.equal(privileges.anonymous,false)
  assert.equal(privileges.signed_in,true)
})
