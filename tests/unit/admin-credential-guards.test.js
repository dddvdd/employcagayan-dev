import test from 'node:test'
import assert from 'node:assert/strict'
import {credentialDatabase,applyCredentialRepair} from '../support/credential-database.js'
import {seedAccount,become} from '../support/identity-database.js'
const denied=work=>assert.rejects(work,e=>e.code==='42501')
test('legacy compatibility repair keeps credential/authority values and does not link Google, ambiguous, existing or unconfirmed identities',async()=>{
 const db=await credentialDatabase()
 try{
  const good=await seedAccount(db,{role:'staff',active:false}),google=await seedAccount(db,{google:true}),unconfirmed=await seedAccount(db,{confirmed:false})
  const already=await seedAccount(db,{role:'staff'}),ambiguous=await seedAccount(db,{role:'staff'}),other=await seedAccount(db,{role:'staff'}),applicant=await seedAccount(db)
  const accounts=[good,google,unconfirmed,already,ambiguous,other,applicant]
  for(const a of accounts)await db.query("UPDATE auth.users SET encrypted_password='synthetic-preserved',raw_app_meta_data=$2 WHERE id=$1",[a.id,JSON.stringify({provider:a.google?'google':'email',providers:[a.google?'google':'email']})])
  await db.query("INSERT INTO auth.identities(user_id,provider) VALUES($1,'email')",[already.id])
  await db.query('UPDATE auth.users SET email=$2 WHERE id=$1',[other.id,ambiguous.email])
  const before=(await db.query('SELECT id,role,is_active,jurisdiction,is_provincial FROM public.profiles ORDER BY id')).rows
  await applyCredentialRepair(db)
  assert.deepEqual((await db.query('SELECT id,role,is_active,jurisdiction,is_provincial FROM public.profiles ORDER BY id')).rows,before)
  assert.ok((await db.query('SELECT encrypted_password,confirmation_token,recovery_token,email_change,email_change_token_new FROM auth.users')).rows.every(r=>
   r.encrypted_password==='synthetic-preserved'&&[r.confirmation_token,r.recovery_token,r.email_change,r.email_change_token_new].every(v=>v==='')))
  assert.equal((await db.query("SELECT count(*) n FROM auth.identities WHERE user_id=$1 AND provider='email'",[good.id])).rows[0].n,1)
  assert.equal((await db.query('SELECT count(*) n FROM auth.identities WHERE user_id=$1',[google.id])).rows[0].n,1)
  for(const a of [unconfirmed,ambiguous,other,applicant])assert.equal((await db.query('SELECT count(*) n FROM auth.identities WHERE user_id=$1',[a.id])).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*) n FROM auth.identities WHERE user_id=$1',[already.id])).rows[0].n,1)
  const audit=(await db.query("SELECT new_data FROM public.audit_logs WHERE new_data->>'credential_operation'='legacy_auth_compatibility'")).rows[0].new_data
  assert.equal(audit.accounts_normalized,7);assert.equal(audit.email_identities_added,1)
 }finally{await db.close()}
})
test('legacy formatting repair is idempotent and records only one aggregate repair event',async()=>{
 const db=await credentialDatabase()
 try{
  const a=await seedAccount(db,{role:'staff'})
  await db.query("UPDATE auth.users SET encrypted_password='synthetic-preserved',raw_app_meta_data=$2 WHERE id=$1",[a.id,JSON.stringify({provider:'email',providers:['email']})])
  await applyCredentialRepair(db);await applyCredentialRepair(db)
  assert.equal((await db.query('SELECT count(*) n FROM auth.identities WHERE user_id=$1',[a.id])).rows[0].n,1)
  const audits=(await db.query("SELECT user_id,record_id,new_data FROM public.audit_logs WHERE new_data->>'credential_operation'='legacy_auth_compatibility'")).rows
  assert.equal(audits.length,1);assert.equal(audits[0].user_id,null);assert.equal(audits[0].record_id,null)
  assert.equal(JSON.stringify(audits).includes(a.id),false);assert.equal(JSON.stringify(audits).includes(a.email),false)
 }finally{await db.close()}
})
const invalid=work=>assert.rejects(work,e=>e.code==='22023')
const create=(db,changes={})=>db.query('SELECT public.admin_create_user($1,$2,$3,$4,$5,$6) id',[
 changes.email??'synthetic-'+crypto.randomUUID()+'@example.invalid',Object.hasOwn(changes,'password')?changes.password:'synthetic-password-only',
 'Synthetic administrator fixture',Object.hasOwn(changes,'role')?changes.role:'staff',changes.jurisdiction??null,changes.provincial??false])
async function passwordAccount(db,options={}){
 const account=await seedAccount(db,{role:'staff',...options})
 await db.query("UPDATE auth.users SET encrypted_password='synthetic-existing-password' WHERE id=$1",[account.id])
 await db.query("INSERT INTO auth.identities(user_id,provider) VALUES($1,'email')",[account.id])
 return account
}
test('corrected credential writers require active canonical admin, MFA and a live session independently of HTTP',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const target=await passwordAccount(db),admin=await seedAccount(db,{role:'admin'}),staff=await seedAccount(db,{role:'staff'})
  for(const [account,aal]of [[admin,'aal1'],[staff,'aal2']]){
   await become(db,account,{aal});await denied(()=>create(db));await denied(()=>db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[target.id]))
  }
  await db.exec('RESET ROLE');await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[admin.id])
  await become(db,admin,{aal:'aal2'});await denied(()=>db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[target.id]))
  await db.exec('RESET ROLE');await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[admin.id]);await db.query('DELETE FROM auth.sessions WHERE id=$1',[admin.sessionId])
  await become(db,admin,{aal:'aal2'});await denied(()=>create(db));await denied(()=>db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[target.id]))
 }finally{await db.close()}
})
test('corrected creation records Auth-compatible token strings and an email identity atomically with the canonical staff role',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
  for(const role of ['staff','supervisor','medical','admin']){
   const id=(await create(db,{role,jurisdiction:'Solana',provincial:true})).rows[0].id
   await db.exec('RESET ROLE')
   const auth=(await db.query('SELECT confirmation_token,recovery_token,email_change,email_change_token_new FROM auth.users WHERE id=$1',[id])).rows[0]
   assert.deepEqual(Object.values(auth),['','','',''])
   const identity=(await db.query("SELECT * FROM auth.identities WHERE user_id=$1 AND provider='email'",[id])).rows[0]
   assert.equal(identity.provider_id,id);assert.equal(identity.identity_data.sub,id);assert.equal(identity.identity_data.email_verified,true)
   const profile=(await db.query('SELECT role,jurisdiction,is_provincial FROM public.profiles WHERE id=$1',[id])).rows[0]
   assert.equal(profile.role,role);assert.equal(profile.jurisdiction,role==='supervisor'?'Solana':null);assert.equal(profile.is_provincial,role==='supervisor')
   await become(db,admin,{aal:'aal2'})
  }
 }finally{await db.close()}
})
test('invalid roles, email and UTF-8 password bounds fail before creating any Auth row',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
  for(const options of [{role:null},{role:'applicant'},{role:'employer'},{email:'bad address'},{password:null},{password:'1234567'},{password:'😀'.repeat(19)}])await invalid(()=>create(db,options))
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*) n FROM auth.users')).rows[0].n,1)
  await become(db,admin,{aal:'aal2'})
  assert.ok((await create(db,{password:'a'.repeat(72)})).rows[0].id)
 }finally{await db.close()}
})
test('duplicate email case variants preserve the existing identity and canonical role',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'}),existing=await passwordAccount(db)
  await become(db,admin,{aal:'aal2'});await invalid(()=>create(db,{email:existing.email.toUpperCase(),role:'admin'}))
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*) n FROM auth.users')).rows[0].n,2)
  assert.equal((await db.query('SELECT role FROM public.profiles WHERE id=$1',[existing.id])).rows[0].role,'staff')
 }finally{await db.close()}
})
test('password reset restricts existing sessions and refresh tokens without deleting records or removing MFA',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'}),target=await passwordAccount(db)
  await db.query('INSERT INTO auth.refresh_tokens(user_id,session_id,revoked) VALUES($1,$2,false)',[target.id,target.sessionId])
  await become(db,admin,{aal:'aal2'});await db.query("SELECT public.admin_reset_password($1,'synthetic-replacement-password')",[target.id])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*) n FROM auth.sessions WHERE user_id=$1',[target.id])).rows[0].n,1)
  assert.ok((await db.query('SELECT not_after<=now() expired FROM auth.sessions WHERE user_id=$1',[target.id])).rows[0].expired)
  assert.equal((await db.query('SELECT revoked FROM auth.refresh_tokens WHERE user_id=$1',[target.id])).rows[0].revoked,true)
  assert.equal((await db.query('SELECT count(*) n FROM auth.mfa_factors WHERE user_id=$1',[target.id])).rows[0].n,1)
  await become(db,target,{aal:'aal2'});await denied(()=>db.query('SELECT public.quest_enforce_partner_mfa()'))
 }finally{await db.close()}
})
test('reset refuses unknown and Google-only identities, and cannot create a jobseeker password',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'}),google=await seedAccount(db,{google:true}),partner=await seedAccount(db,{role:'staff',google:true})
  await become(db,admin,{aal:'aal2'})
  for(const id of [null,crypto.randomUUID(),google.id,partner.id])await invalid(()=>db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[id]))
  await db.exec('RESET ROLE')
  assert.ok((await db.query('SELECT encrypted_password IS NULL unchanged FROM auth.users WHERE id=$1',[google.id])).rows[0].unchanged)
  assert.equal((await db.query("SELECT count(*) n FROM auth.identities WHERE user_id=$1 AND provider='email'",[google.id])).rows[0].n,0)
 }finally{await db.close()}
})
test('existing disabled staff and pending company password identities remain resettable without activation or role escalation',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'}),inactive=await passwordAccount(db,{active:false}),pending=await passwordAccount(db,{role:'applicant'})
  await db.query("INSERT INTO public.employers(company_name,registered_user_id,registration_status) VALUES('Synthetic pending',$1,'pending')",[pending.id])
  await become(db,admin,{aal:'aal2'})
  for(const target of [inactive,pending])await db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[target.id])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1',[inactive.id])).rows[0].is_active,false)
  assert.equal((await db.query('SELECT role FROM public.profiles WHERE id=$1',[pending.id])).rows[0].role,'applicant')
 }finally{await db.close()}
})
test('credential audit events contain actor, target and operation metadata without credential or contact values',async()=>{
 const db=await credentialDatabase({harden:true})
 try{
  const admin=await seedAccount(db,{role:'admin'}),target=await passwordAccount(db)
  await become(db,admin,{aal:'aal2'});await create(db);await db.query("SELECT public.admin_reset_password($1,'synthetic-secret-password-marker')",[target.id])
  await db.exec('RESET ROLE')
  const events=(await db.query("SELECT user_id,record_id,new_data FROM public.audit_logs WHERE new_data ? 'credential_operation'")).rows
  assert.equal(events.length,2);assert.ok(events.every(e=>e.user_id===admin.id&&e.record_id))
  const text=JSON.stringify(events)
  for(const secret of ['synthetic-secret-password-marker','synthetic-existing-password','synthetic-credential-write','@example.invalid','encrypted_password'])assert.equal(text.includes(secret),false)
 }finally{await db.close()}
})
test('baseline reset body accepts a null local caller role, although the HTTP pre-request guard rejects that actor',async()=>{
 const db=await credentialDatabase()
 try{
  const target=await seedAccount(db,{role:'staff'}),inactive=await seedAccount(db,{role:'admin',active:false})
  await become(db,inactive,{aal:'aal2'});await assert.rejects(()=>db.query('SELECT public.quest_enforce_partner_mfa()'),e=>e.code==='42501')
  await db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[target.id])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[target.id])).rows[0].encrypted_password,'synthetic-credential-write')
 }finally{await db.close()}
})
test('baseline reset accepts direct AAL1 admin while account creation is protected by the existing profile-authority trigger',async()=>{
 const db=await credentialDatabase()
 try{
  const admin=await seedAccount(db,{role:'admin'}),target=await seedAccount(db,{role:'staff'})
  await become(db,admin)
  await assert.rejects(()=>db.query('SELECT public.quest_enforce_partner_mfa()'),e=>e.code==='42501')
  await db.query("SELECT public.admin_reset_password($1,'synthetic-password-only')",[target.id])
  await assert.rejects(()=>db.query("SELECT public.admin_create_user('synthetic-created@example.invalid','synthetic-password-only','Synthetic','staff',NULL,false) id"),e=>e.code==='42501')
  await db.exec('RESET ROLE')
  assert.equal((await db.query("SELECT count(*) n FROM auth.users WHERE email='synthetic-created@example.invalid'")).rows[0].n,0)
 }finally{await db.close()}
})
