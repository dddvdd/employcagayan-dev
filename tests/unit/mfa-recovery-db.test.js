import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { identityDatabase, seedAccount, become } from '../support/identity-database.js'

let db
before(async()=>{
  db=await identityDatabase()
  await db.exec(await readFile(new URL('../../supabase/migrations/20261012041121_audited_admin_mfa_recovery.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261012044405_recovery_explicit_session_revocation.sql',import.meta.url),'utf8'))
})
after(async()=>{await db?.close()})
const prepare=async target=>(await db.query("SELECT public.admin_prepare_mfa_recovery($1,'DEV-TEST-CASE','in_person',true) AS recovery",[target.id])).rows[0].recovery
const complete=async request=>(await db.query('SELECT public.admin_complete_mfa_recovery($1) AS recovery',[request.request_id])).rows[0].recovery
const deny=action=>assert.rejects(action,/administrator|authenticator|recovery|verified|account|case|identity|device|scope|Complete|Remove/i)

test('recovery requires active administrator, live AAL2 and recent TOTP',async()=>{
  const target=await seedAccount(db,{role:'staff'})
  for(const role of ['applicant','employer','staff','supervisor','medical']) {
    const actor=await seedAccount(db,{role})
    await become(db,actor,{aal:'aal2'})
    await deny(()=>prepare(target))
  }
  const admin=await seedAccount(db,{role:'admin'})
  await become(db,admin)
  await deny(()=>prepare(target))
  await become(db,admin,{aal:'aal2',extras:{amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-600}]}})
  await deny(()=>prepare(target))
  const inactive=await seedAccount(db,{role:'admin',active:false})
  await become(db,inactive,{aal:'aal2'})
  await deny(()=>prepare(target))
})

test('self reset, missing identity verification and personal identifiers are refused',async()=>{
  const admin=await seedAccount(db,{role:'admin'})
  const target=await seedAccount(db,{role:'staff'})
  await become(db,admin,{aal:'aal2'})
  await deny(()=>prepare(admin))
  await deny(()=>db.query("SELECT public.admin_prepare_mfa_recovery($1,'DEV-TEST-CASE','in_person',false)",[target.id]))
  await deny(()=>db.query("SELECT public.admin_prepare_mfa_recovery($1,'person@example.invalid','in_person',true)",[target.id]))
  await deny(()=>db.query("SELECT public.admin_prepare_mfa_recovery($1,'DEV-TEST-CASE','email_only',true)",[target.id]))
})

test('inactive, banned, pure jobseeker and unenrolled targets cannot be silently activated',async()=>{
  const admin=await seedAccount(db,{role:'admin'})
  const cases=[await seedAccount(db,{role:'staff',active:false}),await seedAccount(db,{role:'staff',factor:false}),await seedAccount(db,{google:true})]
  const banned=await seedAccount(db,{role:'staff'})
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[banned.id])
  cases.push(banned)
  for(const target of cases) {
    await become(db,admin,{aal:'aal2'})
    await deny(()=>prepare(target))
  }
})

test('preparation is idempotent, locks the target and cannot be undone by ordinary administration',async()=>{
  const admin=await seedAccount(db,{role:'admin'})
  const target=await seedAccount(db,{role:'supervisor'})
  await become(db,admin,{aal:'aal2'})
  const request=await prepare(target)
  assert.equal(request.status,'prepared')
  assert.equal((await prepare(target)).request_id,request.request_id)
  await deny(()=>db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[target.id]))
  await deny(()=>db.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[target.id]))
  await become(db,target,{aal:'aal2'})
  assert.equal((await db.query('SELECT public.auth_account_bootstrap() AS profile')).rows[0].profile.is_active,false)
  await deny(()=>db.query('SELECT app.enforce_partner_mfa()'))
  await db.exec('RESET ROLE')
  const logs=(await db.query("SELECT count(*)::int AS count FROM public.audit_logs WHERE action='mfa_recovery_prepared' AND record_id=$1",[target.id])).rows[0]
  assert.equal(logs.count,1)
  await deny(()=>db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[target.id]))
})

test('completion requires matching ban and removed factors, then revokes every session and refresh token',async()=>{
  const admin=await seedAccount(db,{role:'admin'})
  const target=await seedAccount(db,{role:'staff'})
  const unrelated=await seedAccount(db,{role:'staff'})
  await db.query('INSERT INTO auth.refresh_tokens(user_id,session_id) VALUES($1,$2),($1,NULL),($3,$4)',[target.id,target.sessionId,unrelated.id,unrelated.sessionId])
  await become(db,admin,{aal:'aal2'})
  const request=await prepare(target)
  await deny(()=>complete(request))
  await db.exec('RESET ROLE')
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day',raw_app_meta_data=jsonb_build_object('mfa_recovery_request_id',$1::text) WHERE id=$2",[request.request_id,target.id])
  await become(db,admin,{aal:'aal2'})
  await deny(()=>complete(request))
  await db.exec('RESET ROLE')
  await db.query('DELETE FROM auth.mfa_factors WHERE user_id=$1',[target.id])
  await become(db,admin,{aal:'aal2'})
  const finished=await complete(request)
  assert.equal(finished.status,'completed')
  assert.equal(finished.operator_ban_matches,true)
  assert.equal((await complete(request)).status,'completed')
  const profile=(await db.query('SELECT role,is_active FROM public.profiles WHERE id=$1',[target.id])).rows[0]
  assert.deepEqual(profile,{role:'staff',is_active:true})
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1',[target.id])).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1',[target.id])).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1',[unrelated.id])).rows[0].n,1)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1',[unrelated.id])).rows[0].n,1)
  await db.query("UPDATE auth.users SET banned_until=NULL,raw_app_meta_data='{}' WHERE id=$1",[target.id])
  await become(db,target,{aal:'aal2'})
  await deny(()=>db.query('SELECT app.enforce_partner_mfa()'))
  await db.exec('RESET ROLE')
  const newSession=crypto.randomUUID()
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[newSession,target.id])
  await become(db,{...target,sessionId:newSession})
  const bootstrap=(await db.query('SELECT public.auth_account_bootstrap() AS profile')).rows[0].profile
  assert.equal(bootstrap.is_active,true)
  assert.equal(bootstrap.mfa_required,true)
  assert.equal(bootstrap.mfa_satisfied,false)
  await deny(()=>db.query('SELECT app.enforce_partner_mfa()'))
})

test('actual session assurance downgrade overrides an old signed AAL2 claim',async()=>{
  const user=await seedAccount(db,{role:'staff'})
  await become(db,user,{aal:'aal2'})
  await db.query('SELECT app.enforce_partner_mfa()')
  await db.exec('RESET ROLE')
  await db.query("UPDATE auth.sessions SET aal='aal1' WHERE id=$1",[user.sessionId])
  await become(db,user,{aal:'aal2'})
  const bootstrap=(await db.query('SELECT public.auth_account_bootstrap() AS profile')).rows[0].profile
  assert.equal(bootstrap.mfa_satisfied,false)
  assert.equal(bootstrap.is_active,true)
  await deny(()=>db.query('SELECT app.enforce_partner_mfa()'))
})

test('Google jobseeker still has no extra MFA requirement after optional session downgrade',async()=>{
  const user=await seedAccount(db,{google:true})
  await db.query("UPDATE auth.sessions SET aal='aal1' WHERE id=$1",[user.sessionId])
  await become(db,user,{aal:'aal2'})
  const bootstrap=(await db.query('SELECT public.auth_account_bootstrap() AS profile')).rows[0].profile
  assert.equal(bootstrap.jobseeker_authorized,true)
  assert.equal(bootstrap.mfa_required,false)
  assert.equal(bootstrap.mfa_satisfied,true)
  assert.equal(bootstrap.employer_mfa_satisfied,false)
  await db.query('SELECT app.enforce_partner_mfa()')
})

test('recovery APIs and private hold helpers have explicit least-privilege grants',async()=>{
  await db.exec('RESET ROLE')
  for(const fn of ['public.admin_prepare_mfa_recovery(uuid,text,text,boolean)','public.admin_complete_mfa_recovery(uuid)','public.admin_mfa_recovery_status(uuid)']) {
    const privilege=(await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anonymous,has_function_privilege('authenticated',$1,'EXECUTE') AS signed_in",[fn])).rows[0]
    assert.deepEqual(privilege,{anonymous:false,signed_in:true})
  }
  for(const fn of ['app.require_recovery_admin()','app.open_mfa_recovery(uuid)','app.guard_mfa_recovery_hold()']) {
    assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS permitted",[fn])).rows[0].permitted,false)
  }
})
