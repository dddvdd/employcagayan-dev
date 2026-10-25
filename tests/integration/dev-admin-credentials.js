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
 if(index!==0)ok((await actor.rpc('app_current_user_role_text')).error?.code==='42501','Password login bypassed MFA')
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic credential acceptance'}),'fixture TOTP enroll')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'fixture TOTP challenge')
 const verifiedCode=totp(factor.totp.secret)
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:verifiedCode}),'fixture TOTP verify')
 const session=data(await actor.auth.getSession(),'fixture AAL2 session').session
 ok(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
 return {actor,token:session.access_token,refresh:session.refresh_token,factorId:factor.id,secret:factor.totp.secret,verifiedCode}
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
 step='actual administrator provisioning and first login'
 const createdEmail='dev-credentials-'+run+'-created@example.invalid',createdPassword=randomBytes(24).toString('base64url')+'!aA9',createdName='Synthetic credential '+run+' created'
 const createdId=data(await admin.actor.rpc('admin_create_user',{p_email:createdEmail,p_password:createdPassword,p_full_name:createdName,p_role:'staff',p_jurisdiction:null,p_is_provincial:false}),'administrator provisioning')
 ok(/^[0-9a-f-]{36}$/.test(createdId),'Created ID invalid')
 accounts.push({id:createdId,email:createdEmail,password:createdPassword,full_name:createdName,kind:'rpc'});ids.push(createdId)
 const createdUser=data(await fixture.auth.admin.getUserById(createdId),'Auth reads created user').user
 ok(createdUser.identities?.filter(i=>i.provider==='email').length===1,'Created email identity missing')
 const created=await enroll(2)
 ok(data(await created.actor.rpc('app_current_user_role_text'),'created protected role')==='staff','Created canonical role mismatch')
 const duplicate=await admin.actor.rpc('admin_create_user',{p_email:createdEmail.toUpperCase(),p_password:createdPassword,p_full_name:createdName,p_role:'admin'})
 ok(duplicate.error?.code==='22023','Duplicate identity accepted')
 observations.push({check:'rpc_created_account_login_and_mfa',passed:true,duplicate_identity_denied:true})
 step='password reset and previous-session denial'
 const replacement=randomBytes(24).toString('base64url')+'!aA9'
 data(await admin.actor.rpc('admin_reset_password',{p_user_id:accounts[1].id,p_password:replacement}),'administrator reset')
 ok((await client('actor',1,target.token).rpc('app_current_user_role_text')).error?.code==='42501','Previous protected session remains authorized')
 const staleRefresh=client('actor',1);actors.push(staleRefresh)
 ok(!!(await staleRefresh.auth.refreshSession({refresh_token:target.refresh})).error,'Previous refresh token remains usable')
 const changed=client('actor',1);actors.push(changed)
 data(await changed.auth.signInWithPassword({email:accounts[1].email,password:replacement}),'replacement password login')
 ok((await changed.rpc('app_current_user_role_text')).error?.code==='42501','Fresh password login bypassed MFA')
 const factors=data(await changed.auth.mfa.listFactors(),'preserved authenticator')
 ok(factors.totp.some(f=>f.id===target.factorId&&f.status==='verified'),'Reset removed authenticator')
 // Use the next TOTP period if necessary; no credential/secret is logged or persisted.
 if(totp(target.secret)===target.verifiedCode)await new Promise(resolve=>setTimeout(resolve,(31-Math.floor(Date.now()/1000)%30)*1000))
 const challenge=data(await changed.auth.mfa.challenge({factorId:target.factorId}),'existing factor challenge')
 data(await changed.auth.mfa.verify({factorId:target.factorId,challengeId:challenge.id,code:totp(target.secret)}),'existing factor verification')
 ok(data(await changed.rpc('app_current_user_role_text'),'restored protected target role')==='staff','Verified target cannot access its role')
 observations.push({check:'reset_revokes_old_sessions_refresh_preserves_factor_and_requires_fresh_mfa',passed:true})
 step='unknown target and audit minimization'
 ok((await admin.actor.rpc('admin_reset_password',{p_user_id:randomUUID(),p_password:replacement})).error?.code==='22023','Unknown reset target accepted')
 const events=data(await fixture.from('audit_logs').select('user_id,record_id,new_data').in('record_id',ids),'exact fixture audit events').filter(e=>e.new_data?.credential_operation)
 ok(events.length===2&&events.every(e=>e.user_id===accounts[0].id),'Credential operation audit missing')
 const audit=JSON.stringify(events)
 for(const value of [replacement,createdPassword,...accounts.map(a=>a.password),'encrypted_password'])ok(!audit.includes(value),'Credential leaked to audit')
 observations.push({check:'unknown_target_rejected_and_credential_audit_minimized',passed:true})
 step='administrator self-reset'
 data(await admin.actor.rpc('admin_reset_password',{p_user_id:accounts[0].id,p_password:randomBytes(24).toString('base64url')+'!aA9'}),'administrator self reset')
 ok((await client('actor',0,admin.token).rpc('app_current_user_role_text')).error?.code==='42501','Administrator self-reset left old session authorized')
 observations.push({check:'administrator_self_reset_ends_previous_protected_session',passed:true})
 passed=true
}catch(error){console.error('Synthetic credential verification failed at '+step+': '+error.message)}

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
 await writeFile(new URL('../../artifacts/admin-credential-security-20261016/native-verify.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({passed:evidence.passed,observations,requests:requests.length,cleanup_complete:cleanup,cleanup_failures:cleanupFailures.length}))
 process.exitCode=evidence.passed?0:1
}
