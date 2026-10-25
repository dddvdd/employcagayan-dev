import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
if(process.env.EMPLOY_RUN_CREDENTIAL_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const claims=t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'))}catch{return null}}
const sc=claims(env.SUPABASE_SERVICE_ROLE_KEY);if(sc&&(sc.role!=='service_role'||sc.ref!==ref))throw Error('Fixture credential mismatch')
const run=randomUUID(),accounts=[],actors=[],ids=[],requests=[],observations=[],cleanupFailures=[]
let passed=false,cleanup=false,step='configuration'
const ok=(v,label)=>{if(!v)throw Error(label)}
const data=(r,label)=>{ok(!r.error,label+' failed ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
const fetchFor=(mode,index)=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 ok(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const h=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(h.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&url.pathname.startsWith('/rest/'))ok(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===accounts[index]?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed actor required')
 const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,path:url.pathname,method:init?.method||'GET',status:response.status});return response
}
const client=(mode,index,token=null)=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode,index),...(token?{headers:{Authorization:'Bearer '+token}}:{})}})
const fixture=client('fixture')
const enroll=async index=>{
 const actor=client('actor',index);actors.push(actor)
 data(await actor.auth.signInWithPassword({email:accounts[index].email,password:accounts[index].password}),'fixture password login')
 if(index===0)ok((await actor.rpc('admin_reset_password',{p_user_id:accounts[1].id,p_password:randomBytes(24).toString('base64url')+'!aA9'})).error?.code==='42501','AAL1 admin HTTP request accepted')
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic credential acceptance'}),'fixture TOTP enroll')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'fixture TOTP challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'fixture TOTP verify')
 const session=data(await actor.auth.getSession(),'fixture AAL2 session').session
 ok(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
 return {actor,token:session.access_token}
}
try{
 step='prepare isolated actual actors'
 for(let index=0;index<2;index++){
  const email='dev-credentials-'+run+'-'+index+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9',full_name='Synthetic credential '+run+' '+index
  const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,full_name}}),'fixture user').user
  accounts.push({id:user.id,email,password,full_name,kind:'fixture'});ids.push(user.id)
  data(await fixture.from('profiles').update({role:index?'staff':'admin'}).eq('id',user.id),'fixture canonical role')
 }
 const admin=await enroll(0),target=await enroll(1)
 observations.push({check:'real_admin_aal1_http_denied',passed:true})
 step='actual administrator provisioning'
 const createdEmail='dev-credentials-'+run+'-created@example.invalid',createdPassword=randomBytes(24).toString('base64url')+'!aA9',createdName='Synthetic credential '+run+' created'
 const provision=await admin.actor.rpc('admin_create_user',{p_email:createdEmail,p_password:createdPassword,p_full_name:createdName,p_role:'staff',p_jurisdiction:null,p_is_provincial:false})
 observations.push({check:'admin_rpc_provisioning',success:!provision.error,error_code:provision.error?.code??null})
 if(!provision.error){
  ok(/^[0-9a-f-]{36}$/.test(provision.data),'Created ID invalid')
  accounts.push({id:provision.data,email:createdEmail,password:createdPassword,full_name:createdName,kind:'rpc'});ids.push(provision.data)
  const profile=data(await fixture.from('profiles').select('email,full_name,role').eq('id',provision.data).single(),'created canonical profile')
  ok(profile.email===createdEmail&&profile.full_name===createdName&&profile.role==='staff','Created profile mismatch')
  const createdClient=client('actor',2);actors.push(createdClient)
  const login=await createdClient.auth.signInWithPassword({email:createdEmail,password:createdPassword})
  observations.push({check:'rpc_created_account_password_login',success:!login.error,error_code:login.error?.code??null,status:login.error?.status??200})
  if(!login.error)observations.push({check:'rpc_created_account_requires_mfa',denied:(await createdClient.rpc('app_current_user_role_text')).error?.code==='42501'})
 }
 step='actual administrator password reset'
 const replacement=randomBytes(24).toString('base64url')+'!aA9'
 const reset=await admin.actor.rpc('admin_reset_password',{p_user_id:accounts[1].id,p_password:replacement})
 observations.push({check:'admin_rpc_password_reset',success:!reset.error,error_code:reset.error?.code??null})
 if(!reset.error){
  const stale=await client('actor',1,target.token).rpc('app_current_user_role_text')
  observations.push({check:'previous_session_after_password_reset',still_authorized:!stale.error,error_code:stale.error?.code??null})
  const changed=client('actor',1);actors.push(changed)
  const login=await changed.auth.signInWithPassword({email:accounts[1].email,password:replacement})
  observations.push({check:'reset_password_login',success:!login.error,error_code:login.error?.code??null,status:login.error?.status??200})
 }
 passed=true
}catch(error){console.error('Synthetic credential baseline failed at '+step+': '+error.message)}
finally{
 for(const actor of actors){try{data(await actor.auth.signOut({scope:'global'}),'fixture session revocation')}catch{cleanupFailures.push('session_revocation')}}
 for(const account of accounts){
  try{
   const profile=data(await fixture.from('profiles').select('email,full_name').eq('id',account.id).single(),'verify cleanup ownership')
   ok(profile.email===account.email&&profile.full_name===account.full_name&&account.email.includes(run),'Refusing non-fixture cleanup')
   data(await fixture.auth.admin.deleteUser(account.id),'cleanup synthetic Auth account')
  }catch{cleanupFailures.push(account.id)}
 }
 try{
  if(ids.length){
   data(await fixture.from('audit_logs').delete().in('record_id',ids),'cleanup exact fixture audit rows')
   ok(!data(await fixture.from('profiles').select('id').in('id',ids),'verify profile cleanup').length,'Fixture remains')
  }
  cleanup=cleanupFailures.length===0
 }catch{cleanup=false}
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),run_id:run,passed:passed&&cleanup,observations_complete:passed,cleanup_complete:cleanup,
  fixture_accounts:accounts.map(({id,email,full_name,kind})=>({id,email,full_name,kind})),fixture_ids:ids,cleanup_failures:cleanupFailures,observations,requests,
  limitations:['Only synthetic accounts and actual signed MFA actors; no genuine credentials or Google identity used','Legacy hash/SQL Auth compatibility is observed through actual Auth endpoints, not simulated','Service key is fixture preparation/inspection/cleanup only']}
 await writeFile(new URL('../../artifacts/admin-credential-security-20261016/native-baseline.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({passed:evidence.passed,observations,requests:requests.length,cleanup_complete:cleanup,cleanup_failures:cleanupFailures.length}))
 process.exitCode=evidence.passed?0:1
}
