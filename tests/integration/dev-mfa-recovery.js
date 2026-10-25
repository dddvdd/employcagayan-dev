import { randomUUID,randomBytes } from 'node:crypto'
import { writeFile,mkdir } from 'node:fs/promises'
import { devClients } from '../../scripts/lib/devClients.js'
import { recoverPartnerMfa } from '../../scripts/lib/mfaRecovery.js'
import { totp } from '../support/totp.js'

if(process.env.EMPLOY_RUN_DEV_AUTH_TESTS !== '1') throw new Error('Explicit synthetic DEV recovery test opt-in required')
const {operator,normal,normalWithToken,requests}=await devClients()
const run=randomUUID(), accounts=[],checks=[]
let phase='fixture setup',failed=false,diagnostic=null
const safe=(value,label)=>{if(value.error) throw new Error(`${label} failed (${value.error.code ?? value.error.status ?? 'request'})`);return value.data}
const check=(condition,label)=>{if(!condition)throw new Error(label)}
const denied=value=>check(Boolean(value.error) || (Array.isArray(value.data) && !value.data.length),'Protected recovery access unexpectedly allowed')
const rpc=(client,name,params)=>client.rpc(name,params)
async function account(role) {
  const email=`dev-recovery-${run}-${accounts.length}@example.invalid`,password=`${randomBytes(24).toString('base64url')}!aA9`
  const user=safe(await operator.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run},app_metadata:{recovery_canary:'synthetic-canary'}}),'create synthetic recovery fixture').user
  accounts.push({id:user.id,email})
  safe(await operator.from('profiles').update({role}).eq('id',user.id),'fixture role setup')
  const client=normal()
  safe(await client.auth.signInWithPassword({email,password}),'signed fixture login')
  return {client,id:user.id,email,password}
}
async function verifyTotp(client) {
  const factor=safe(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic recovery test'}),'fixture TOTP enrollment')
  const challenge=safe(await client.auth.mfa.challenge({factorId:factor.id}),'fixture challenge')
  safe(await client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'fixture TOTP verification')
}
try {
  const admin=await account('admin'),target=await account('staff')
  await verifyTotp(target.client)
  const oldSession=safe(await target.client.auth.getSession(),'capture original signed session').session
  const params={p_target_user_id:target.id,p_verification_reference:'DEV-TEST-RECOVERY',p_verification_method:'in_person',p_identity_verified:true}
  phase='signed authorization denials'
  denied(await rpc(admin.client,'admin_prepare_mfa_recovery',params))
  denied(await rpc(target.client,'admin_prepare_mfa_recovery',{...params,p_target_user_id:admin.id}))
  await verifyTotp(admin.client)
  denied(await rpc(admin.client,'admin_prepare_mfa_recovery',{...params,p_target_user_id:admin.id}))
  denied(await rpc(admin.client,'admin_prepare_mfa_recovery',{...params,p_identity_verified:false}))
  checks.push('Actual signed requests deny AAL1 admin, non-admin, self reset and unverified identity')
  phase='prepared target hold'
  const prepared=safe(await rpc(admin.client,'admin_prepare_mfa_recovery',params),'prepare verified synthetic case')
  const held=safe(await rpc(target.client,'auth_account_bootstrap'),'held target bootstrap')
  check(!held.is_active,'Recovery did not lock target')
  denied(await target.client.from('profiles').select('id').eq('id',target.id))
  denied(await admin.client.from('profiles').update({is_active:true}).eq('id',target.id).select('id'))
  denied(await rpc(admin.client,'admin_complete_mfa_recovery',{p_request_id:prepared.request_id}))
  checks.push('Target locks immediately; direct admin reactivation and premature completion are denied')
  phase='operator reset and audited completion'
  const actor={rpc:async(name,args)=>{
    const value=await admin.client.rpc(name,args)
    const allowed=[
      'Recovery hold and operator ban must be verified before completion',
      'Remove all authenticators and revoke all sessions before completion',
      'Complete the audited recovery before changing account authority',
      'Verify your administrator authenticator again before recovery',
    ]
    if(value.error) diagnostic=allowed.find(message=>value.error.message===message) ?? 'Other authorization failure'
    return value
  }}
  const recovery=await recoverPartnerMfa({actor,operator,targetUserId:target.id,requestId:prepared.request_id})
  check(recovery.status==='completed','Recovery did not complete')
  const status=safe(await rpc(admin.client,'admin_mfa_recovery_status',{p_request_id:prepared.request_id}),'completed case status')
  check(status.status==='completed' && !status.operator_ban_matches,'Completed operator ban not released')
  const user=safe(await operator.auth.admin.getUserById(target.id),'target Auth state').user
  check(user.app_metadata.recovery_canary==='synthetic-canary' && user.app_metadata.provider==='email','Unrelated Auth metadata changed')
  check(!user.banned_until || new Date(user.banned_until)<=new Date(),'Target remains banned')
  const factors=safe(await operator.auth.admin.mfa.listFactors({userId:target.id}),'post-recovery factor inventory').factors
  check(factors.length===0,'Old factors remain')
  denied(await target.client.from('profiles').select('id').eq('id',target.id))
  checks.push('Provider reset revokes all factors/sessions, role remains staff, metadata is preserved and stale AAL2 access is denied')
  phase='new session and mandatory reenrollment'
  safe(await target.client.auth.signInWithPassword({email:target.email,password:target.password}),'fresh target sign-in')
  const fresh=safe(await rpc(target.client,'auth_account_bootstrap'),'fresh target bootstrap')
  check(fresh.role==='staff' && fresh.is_active && fresh.mfa_required && !fresh.mfa_satisfied,'Recovery bypassed mandatory MFA')
  denied(await target.client.from('profiles').select('id').eq('id',target.id))
  await verifyTotp(target.client)
  const own=safe(await target.client.from('profiles').select('id,role').eq('id',target.id),'reenrolled target access')
  check(own.length===1 && own[0].role==='staff','Reenrolled target did not regain existing role')
  denied(await normalWithToken(oldSession.access_token).from('profiles').select('id').eq('id',target.id))
  check(Boolean((await normal().auth.refreshSession({refresh_token:oldSession.refresh_token})).error),'Revoked refresh token unexpectedly accepted')
  checks.push('Fresh AAL1 stays locked until new TOTP; old signed token and refresh token remain unusable afterward')
} catch(error) {
  failed=true
  console.error(`DEV recovery integration failed at ${phase}: ${error.message}`)
  if(diagnostic) console.error(`Sanitized database diagnostic: ${diagnostic}`)
  if(process.env.EMPLOY_RECOVERY_DIAGNOSTIC_WAIT==='1') {
    console.log(`Synthetic diagnostic run: ${run}; fixtures retained for up to 30 seconds before cleanup`)
    await Promise.race([new Promise(resolve=>process.stdin.once('data',resolve)),new Promise(resolve=>setTimeout(resolve,30000))])
  }
} finally {
  try {
    for(const value of accounts) {
      const user=safe(await operator.auth.admin.getUserById(value.id),'cleanup fixture identity').user
      check(user.email===value.email && user.user_metadata.test_run===run,'Non-fixture cleanup refused')
      safe(await operator.auth.admin.deleteUser(value.id),'remove synthetic fixture')
    }
    checks.push(`Cleaned up ${accounts.length} synthetic accounts; private case audit retained`)
  } catch {failed=true;console.error('Recovery fixture cleanup incomplete; inspect this run before another live test')}
  const folder=new URL('../../artifacts/recovery-milestone-20261012/',import.meta.url)
  await mkdir(folder,{recursive:true})
  await writeFile(new URL('live-recovery-results.json',folder),JSON.stringify({verified_project_ref:'cdmkzzmaswwiryymtycn',run_id:run,observed_at:new Date().toISOString(),passed:!failed,checks,requests,diagnostic},null,2))
  console.log(JSON.stringify({passed:!failed,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length}))
  process.exitCode=failed ? 1 : 0
}
