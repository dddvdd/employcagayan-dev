import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'

const expected='https://cdmkzzmaswwiryymtycn.supabase.co'
if(process.env.EMPLOY_RUN_PROFILE_DELETE_GUARD!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)
 throw Error('Verified DEV-only opt-in required')
const scope=process.env.EMPLOY_PROFILE_GUARD_SCOPE||'identity'
if(!['identity','jobseeker'].includes(scope))throw Error('Unsupported fixture scope')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const serviceClaims=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(serviceClaims&&(serviceClaims.ref!=='cdmkzzmaswwiryymtycn'||serviceClaims.role!=='service_role'))
 throw Error('Fixture credential mismatch')
const run=randomUUID(),accounts=[],requests=[],checks=[]
let passed=false,cleanup=false,actor,participant,step='configuration'
const ok=(condition,message)=>{if(!condition)throw Error(message)}
const data=(result,message)=>{ok(!result.error,`${message} (${result.error?.code??result.error?.status??'request'})`);return result.data}
const makeClient=(kind,actorId=null)=>createClient(expected,kind==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  ok(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound request left verified DEV')
  if(kind==='actor'&&url.pathname.startsWith('/rest/')){
   const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined))
   const jwt=claims(headers.get('authorization')?.replace(/^Bearer /,'')||'')
   ok(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===actorId&&jwt.session_id,'Signed actor required')
  }
  const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
  requests.push({kind,path:url.pathname,status:response.status})
  return response
 }},
})
const fixture=makeClient('fixture')

try{
 step='create exact synthetic accounts'
 for(const role of ['admin','target']){
  const email=`dev-profile-guard-${run}-${role}@example.invalid`
  const password=randomBytes(24).toString('base64url')+'!aA9'
  const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'create Auth fixture').user
  accounts.push({id:user.id,email,password,role})
 }
 data(await fixture.from('profiles').update({role:'admin'}).eq('id',accounts[0].id),'set fixture admin role')
 ok(data(await fixture.from('profiles').select('id').eq('id',accounts[1].id).single(),'read target profile').id===accounts[1].id,'Target profile absent')
 if(scope==='jobseeker'){
  participant=data(await fixture.from('participants').insert({auth_user_id:accounts[1].id})
   .select('id,auth_user_id').single(),'create exact synthetic participant')
  data(await fixture.from('jobseeker_profiles').insert({participant_id:participant.id,
   first_name:'Synthetic',last_name:'Record',email:accounts[1].email,data_subject_rights_agreed:true})
   .select('participant_id').single(),'create exact synthetic jobseeker profile')
 }

 step='real administrator TOTP session'
 actor=makeClient('actor',accounts[0].id)
 data(await actor.auth.signInWithPassword({email:accounts[0].email,password:accounts[0].password}),'admin login')
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic profile guard'}),'enroll TOTP')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'challenge TOTP')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'verify TOTP')
 const token=data(await actor.auth.getSession(),'read signed session').session.access_token
 ok(claims(token)?.aal==='aal2','AAL2 missing')
 checks.push('Real synthetic administrator reached AAL2')

 if(scope==='jobseeker'){
  step='direct jobseeker record deletion denial'
  const child=await actor.from('jobseeker_profiles').delete().eq('participant_id',participant.id).select('participant_id')
  const parent=await actor.from('participants').delete().eq('id',participant.id).select('id')
  ok(child.error?.code==='42501'&&parent.error?.code==='42501','Direct jobseeker DELETE did not return 42501')
  ok(data(await fixture.from('jobseeker_profiles').select('participant_id').eq('participant_id',participant.id).single(),'verify child').participant_id===participant.id,'Denied child deletion changed row')
  ok(data(await fixture.from('participants').select('id').eq('id',participant.id).single(),'verify parent').id===participant.id,'Denied parent deletion changed row')
  checks.push('Signed AAL2 administrator direct participant/profile DELETE denied; both rows preserved')
 }else{
  step='direct profile deletion denial'
  const deleted=await actor.from('profiles').delete().eq('id',accounts[1].id).select('id')
  ok(deleted.error?.code==='42501','Direct administrator profile DELETE did not return 42501')
  ok(data(await fixture.from('profiles').select('id').eq('id',accounts[1].id).single(),'verify denied target').id===accounts[1].id,'Denied deletion changed target')
  checks.push('Signed AAL2 administrator direct DELETE denied, target preserved')
 }
 passed=true
}catch(error){console.error(`Synthetic profile guard failed at ${step}: ${error.message}`)}
finally{
 try{
  for(const account of accounts){
   const user=data(await fixture.auth.admin.getUserById(account.id),'verify exact fixture user').user
   ok(user.email===account.email&&user.user_metadata.test_run===run,'Refusing non-fixture cleanup')
  }
  if(actor)data(await actor.auth.signOut({scope:'global'}),'revoke fixture session')
  if(participant){
   const parent=data(await fixture.from('participants').select('id,auth_user_id').eq('id',participant.id).single(),'verify exact participant cleanup')
   ok(parent.auth_user_id===accounts[1].id,'Refusing unrelated participant cleanup')
   const child=data(await fixture.from('jobseeker_profiles').select('participant_id,email').eq('participant_id',participant.id).maybeSingle(),'verify exact profile cleanup')
   if(child){
    ok(child.email===accounts[1].email,'Refusing unrelated jobseeker profile cleanup')
    data(await fixture.from('jobseeker_profiles').delete().eq('participant_id',participant.id).eq('email',accounts[1].email),'delete exact synthetic profile')
   }
   data(await fixture.from('participants').delete().eq('id',participant.id).eq('auth_user_id',accounts[1].id),'delete exact synthetic participant')
  }
  for(const account of accounts)data(await fixture.auth.admin.deleteUser(account.id),'delete exact synthetic Auth user')
  const audits=data(await fixture.from('audit_logs').select('id,record_id,action,table_name,old_data,new_data')
   .in('record_id',accounts.map(a=>a.id)),'inspect exact fixture audit')
  ok(audits.length===1&&audits[0].record_id===accounts[0].id&&audits[0].action==='identity_update'&&
   audits[0].table_name==='profiles'&&audits[0].old_data?.role==='applicant'&&audits[0].new_data?.role==='admin',
   'Unexpected fixture audit; refusing cleanup')
  const removed=data(await fixture.from('audit_logs').delete().eq('id',audits[0].id)
   .eq('record_id',accounts[0].id).select('id'),'remove exact synthetic audit')
  ok(removed.length===1&&removed[0].id===audits[0].id,'Synthetic audit cleanup failed')
  for(const account of accounts){
   ok(!data(await fixture.from('profiles').select('id').eq('id',account.id),'verify profile cleanup').length,'Fixture profile remains')
   const lookup=await fixture.auth.admin.getUserById(account.id)
   ok(lookup.error||!lookup.data?.user,'Fixture Auth user remains')
  }
  if(participant){
   ok(!data(await fixture.from('participants').select('id').eq('id',participant.id),'verify participant cleanup').length,'Fixture participant remains')
   ok(!data(await fixture.from('jobseeker_profiles').select('participant_id').eq('participant_id',participant.id),'verify jobseeker cleanup').length,'Fixture jobseeker profile remains')
  }
  cleanup=true
  checks.push('Internal Auth cleanup removed exact synthetic users and profiles')
 }catch(error){passed=false;console.error(`Synthetic profile guard cleanup incomplete: ${error.message}`)}
 const receipt={observed_at:new Date().toISOString(),verified_project_ref:'cdmkzzmaswwiryymtycn',run_id:run,scope,
  passed:passed&&cleanup,cleanup_complete:cleanup,account_ids:accounts.map(a=>a.id),participant_id:participant?.id??null,checks,requests,
  limitations:['Only synthetic password identities and real TOTP; no genuine Google login','No genuine personal record was changed']}
 const folder=new URL('../../artifacts/profile-delete-guard-20261019/',import.meta.url)
 await mkdir(folder,{recursive:true})
 await writeFile(new URL(scope==='jobseeker'?'native-jobseeker.json':'native.json',folder),JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify({passed:receipt.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}))
 process.exitCode=receipt.passed?0:1
}
