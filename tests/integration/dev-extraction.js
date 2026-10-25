import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_EXTRACTION_PHASE
if(process.env.EMPLOY_RUN_DEV_EXTRACTION_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify','published'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
const aiRuns=[],aiSuggestions=[],skillRecords=[],embeddingRows=[],reviewDictionaries=[]
let step='configuration',failed=false,cleanupComplete=false,providerProbe=null
const requireTrue=(value,label)=>{if(!value)throw Error(label)}
const fetchFor=mode=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 requireTrue(url.origin===expected&&url.protocol==='https:','Outbound target mismatch')
 requireTrue(process.env.EMPLOY_VERIFIED_DEV_URL===expected&&env.VITE_SUPABASE_URL===expected,'Verification changed')
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),token=headers.get('authorization')?.replace(/^Bearer /,'')
 const jwt=token?claims(token):null
 if(mode==='actor'&&(url.pathname.startsWith('/rest/')||url.pathname.startsWith('/storage/')||url.pathname.startsWith('/functions/')))requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Acceptance requires an actual signed DEV user session')
 if(mode!=='fixture')requireTrue(jwt?.role!=='service_role','Service key cannot satisfy acceptance')
 const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(url.pathname.startsWith('/functions/')?40000:20000)})
 requests.push({mode,method:init?.method||'GET',path:url.pathname,status:response.status})
 return response
}
const client=mode=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture'),anonymous=client('anonymous')
function data(result,label){requireTrue(!result.error,label+' failed ('+(result.error?.code||result.error?.status||'request')+')');return result.data}
function denied(result,label){requireTrue(!!result.error||(Array.isArray(result.data)&&result.data.length===0),label+' unexpectedly allowed')}
async function account(role,extra={}){
 const email='dev-extraction-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV extraction fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV extraction '+run}),'enroll factor')
 const challenge=data(await actor.client.auth.mfa.challenge({factorId:factor.id}),'challenge factor')
 data(await actor.client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'verify factor')
 requireTrue(claims(data(await actor.client.auth.getSession(),'actor session').session.access_token)?.aal==='aal2','Signed AAL2 missing')
 actor.factor=factor.id
}

async function edge(actor,body,contentType='application/json'){
 const token=data(await actor.client.auth.getSession(),'signed edge session').session.access_token
 return fetchFor('actor')(expected+'/functions/v1/extract-employment',{
  method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'content-type':contentType},body
 })
}
try{
 step='signed actors'
 const applicant=await account('applicant'),employer=await account('employer'),admin=await account('admin'),staff=await account('staff'),supervisor=await account('supervisor')
 const company=data(await fixture.from('employers').insert({registered_user_id:employer.id,company_name:'Synthetic DEV extraction '+run,employer_type:'local_direct',registration_status:'approved',is_active:true}).select('id,registered_user_id,company_name').single(),'prepare approved employer fixture')
 companies.push(company)
 step='quota baseline and MFA denial'
 if(phase==='baseline'){
  const missing=await admin.client.rpc('ai_extraction_rate_limit_allow')
  requireTrue(missing.error?.code==='PGRST202','Missing DEV quota RPC not reproduced')
  checks.push('Actual signed DEV request confirms quota RPC is absent')
 }else{
  denied(await admin.client.rpc('ai_extraction_rate_limit_allow'),'AAL1 administrator quota')
  checks.push('Quota cannot be consumed with signed AAL1')
 }
 if(phase==='published'){
  requireTrue((await edge(admin,JSON.stringify({text:'Synthetic DEV MFA test.'}))).status===403,'Signed AAL1 reached provider')
  checks.push('Published endpoint denies signed AAL1 administrator before provider work')
 }
 for(const actor of [employer,admin,staff,supervisor])await mfa(actor)
 step='non-spend deployed edge authorization probe'
 const token=data(await employer.client.auth.getSession(),'signed employer session').session.access_token
 const response=await fetchFor('actor')(expected+'/functions/v1/extract-employment',{
  method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({text:''})
 })
 requireTrue(response.status===(phase==='published'?403:400),'Deployed employer role gate differs from expected phase')
 const reply=await response.json()
 requireTrue(reply.error===(phase==='published'?'Forbidden':'text is required and must be a non-empty string'),'Unexpected non-spend response')
 if(phase==='published'){
  requireTrue((await edge(applicant,JSON.stringify({text:''}))).status===403,'Password applicant reached provider')
  checks.push('Published endpoint denies signed password applicant and AAL2 approved employer before payload validation')
  for(const actor of [admin,staff,supervisor]){
   requireTrue((await edge(actor,JSON.stringify({text:''}))).status===400,'Authorized empty text not rejected')
   requireTrue((await edge(actor,JSON.stringify({text:'x'.repeat(20001)}))).status===413,'Oversize source not rejected')
   requireTrue((await edge(actor,'{')).status===400,'Malformed JSON not rejected')
   requireTrue((await edge(actor,'test','text/plain')).status===415,'Unsupported media not rejected')
  }
  requireTrue((await edge(admin,JSON.stringify({text:'x',ignored:'y'.repeat(130000)}))).status===413,'Oversize request stream not rejected')
  checks.push('All three signed PESO roles receive bounded payload/content-type validation before quota consumption')
 }else checks.push('UNREPAIRED deployed v7 admits signed AAL2 approved employer to payload validation instead of denying the PESO-only role; empty text prevents provider spend')
 if(phase==='verify'||phase==='published'){
  step='atomic actual signed quotas'
  for(const actor of [admin,staff,supervisor]){
   const results=await Promise.all(Array.from({length:25},()=>actor.client.rpc('ai_extraction_rate_limit_allow')))
   requireTrue(results.every(result=>!result.error),'Authorized quota call failed')
   requireTrue(results.filter(result=>result.data===true).length===20&&results.filter(result=>result.data===false).length===5,'Concurrent quota exceeded or undershot fixed cap')
   requireTrue(data(await actor.client.rpc('ai_extraction_rate_limit_allow'),'capped follow-up')===false,'Quota grew after cap')
   denied(await actor.client.from('ai_extraction_rate_limit').select('user_id'),'private quota counter')
  }
  checks.push('Actual signed admin/staff/supervisor concurrent calls each allow exactly 20 and deny excess without cross-account interference')
  if(phase==='published'){
   for(const actor of [admin,staff,supervisor]){
    const response=await edge(actor,JSON.stringify({text:'Synthetic DEV quota test.'}))
    requireTrue(response.status===429,'Published provider path bypassed exhausted quota')
    const reply=await response.json()
    requireTrue(reply.error==='Too many requests. Try again later.'&&typeof reply.request_id==='string','Published quota response contract')
   }
   checks.push('Published endpoint denies further extraction for all three signed PESO roles after each independent quota is exhausted')
   data(await fixture.from('profiles').update({is_active:false}).eq('id',admin.id),'deactivate synthetic administrator')
   requireTrue((await edge(admin,JSON.stringify({text:'Synthetic DEV inactive-account test.'}))).status===403,'Inactive account reached provider')
   checks.push('Published endpoint denies a deactivated signed PESO account')
  }
  step='unauthorized quota roles and identifiers'
  for(const actor of [applicant,employer])denied(await actor.client.rpc('ai_extraction_rate_limit_allow'),'non-PESO quota role')
  denied(await staff.client.rpc('ai_extraction_rate_limit_allow',{p_user_id:admin.id}),'forged quota owner argument')
  denied(await anonymous.rpc('ai_extraction_rate_limit_allow'),'anonymous quota RPC')
  checks.push('Employer/password candidate/anonymous requests and forged quota owner arguments cannot consume quota')
  step='revoked signed quota session'
  const captured=data(await staff.client.auth.getSession(),'capture staff session').session.access_token
  data(await staff.client.auth.signOut({scope:'global'}),'staff session revocation')
  const revoked=await fetchFor('actor')(expected+'/rest/v1/rpc/ai_extraction_rate_limit_allow',{
   method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+captured,'content-type':'application/json'},body:'{}'
  })
  requireTrue(!revoked.ok,'Revoked session consumed quota')
  checks.push('Revoked signed session cannot consume quota')
  if(phase==='published'){
   const revokedEdge=await fetchFor('actor')(expected+'/functions/v1/extract-employment',{
    method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+captured,'content-type':'application/json'},body:JSON.stringify({text:'Synthetic DEV revoked-session test.'})
   })
   requireTrue([401,403].includes(revokedEdge.status),'Revoked signed session reached published provider branch')
   checks.push('Published endpoint rejects a revoked signed PESO session')
   const medical=await account('medical');await mfa(medical)
   requireTrue((await edge(medical,JSON.stringify({text:''}))).status===403,'Medical role reached provider branch')
   checks.push('Published endpoint denies signed AAL2 medical role')
   const probeActor=await account('admin');await mfa(probeActor)
   const source='Synthetic DEV test: I can use Microsoft Excel.'
   const response=await edge(probeActor,JSON.stringify({text:source}))
   const reply=await response.json()
   requireTrue([200,502].includes(response.status),'Unexpected synthetic provider probe status')
   if(response.status===200){
    requireTrue(reply.status==='success'&&reply.provider==='openrouter','Provider response transport contract')
    const {validateExtractionResponse}=await import('../../supabase/functions/_shared/extraction-contract.js')
    requireTrue(validateExtractionResponse(reply,{sourceText:source}).valid,'Live grounded provider contract')
    providerProbe={status:200,completed:true,response:reply}
   }else{
    requireTrue(reply.error==='Unable to process extraction request','Provider error exposes internal detail')
    providerProbe={status:502,completed:false,generic_error:reply.error,request_id:reply.request_id}
   }
   checks.push(response.status===200?'One synthetic provider request succeeds with the strict grounded contract':'One synthetic provider request fails closed with a generic 502; provider integration remains unresolved')
  }
 }
}catch(error){failed=true;console.error('DEV extraction '+phase+' failed at '+step+': '+error.message)}
finally{
 try{
  for(const company of companies){
   const stored=data(await fixture.from('employers').select('registered_user_id,company_name').eq('id',company.id).single(),'verify company cleanup')
   requireTrue(stored.registered_user_id===company.registered_user_id&&stored.company_name===company.company_name,'Refusing nonfixture company cleanup')
   data(await fixture.from('employers').delete().eq('id',company.id).eq('registered_user_id',company.registered_user_id),'delete fixture company')
  }
  for(const actor of accounts){
   const user=data(await fixture.auth.admin.getUserById(actor.id),'verify cleanup user').user
   requireTrue(user.email===actor.email&&user.user_metadata.test_run===run,'Refusing nonfixture cleanup')
   data(await fixture.auth.admin.deleteUser(actor.id),'delete synthetic user')
  }
  cleanupComplete=true
 }catch{failed=true;console.error('Synthetic fixture cleanup incomplete')}
 const result={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,checks,requests,provider_probe:providerProbe,limitations:phase==='published'?['One synthetic nonpersonal provider request only; no quality benchmark or durable persistence is established','Service credentials prepare and clean actors only; acceptance uses actual signed users and verified TOTP']:['Deployed v7 is unchanged and its missing PESO role/quota guard remains confirmed','Only empty text was sent to the live Edge Function; no provider call or personal text was submitted','Service credentials prepare and clean actors only; quota acceptance uses actual signed users and verified TOTP']}
 await writeFile(new URL('../../artifacts/extraction-security-20261014/live-'+phase+'-results.json',import.meta.url),JSON.stringify(result,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
