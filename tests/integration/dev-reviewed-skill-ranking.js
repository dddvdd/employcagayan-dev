import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
import {createReviewedSkillMatchingService} from '../../src/services/reviewedSkillMatchingService.js'
import {computeReviewedHybridScore} from '../../src/domain/reviewedSkillMatching.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
if(process.env.EMPLOY_RUN_REVIEWED_SKILL_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture URL mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const serviceClaims=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(serviceClaims&&(serviceClaims.role!=='service_role'||serviceClaims.ref!==ref))throw Error('Fixture credential mismatch')
const run=randomUUID(),email='dev-reviewed-skills-'+run+'@example.invalid',requests=[],checks=[]
let account=null,actor=null,passed=false,cleanup=false,step='configuration'
const requireTrue=(value,label)=>{if(!value)throw Error(label)}
const fetchFor=mode=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 requireTrue(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(headers.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&url.pathname.startsWith('/rest/'))requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed actor session required')
 const result=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,path:url.pathname,method:init?.method||'GET',status:result.status});return result
}
const client=mode=>createClient(expected,mode==='fixture'||mode==='service-negative'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture')
const data=(r,label)=>{requireTrue(!r.error,label+' failed ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
try{
 step='prepare signed synthetic staff actor'
 account=data(await fixture.auth.admin.createUser({email,password:randomBytes(24).toString('base64url')+'!aA9',email_confirm:true,user_metadata:{test_run:run}}),'fixture account').user
 const password=randomBytes(24).toString('base64url')+'!aA9'
 data(await fixture.auth.admin.updateUserById(account.id,{password}),'fixture password')
 data(await fixture.from('profiles').update({role:'staff'}).eq('id',account.id),'fixture canonical role')
 actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed login')
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic ranking '+run}),'enroll fixture TOTP')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'verify TOTP')
 const session=data(await actor.auth.getSession(),'signed session').session
 requireTrue(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
 checks.push('Real signed staff session with actual TOTP verification')
 step='guarded approved snapshot client read'
 const skills=data(await actor.from('skills').select('id').eq('is_active',true).order('id').limit(2),'current canonical skills')
 requireTrue(skills.length===2,'Current reference skill sample required')
 const vacancy={skills:skills.map(s=>({skill_id:s.id,importance:'required'}))}
 const reader=createReviewedSkillMatchingService({getClient:async()=>actor}),knowledge=await reader.load([vacancy])
 requireTrue(knowledge.status==='available'&&knowledge.snapshot.relationships.length===0,'Expected current empty approved snapshot')
 const result=computeReviewedHybridScore({ranking_score:60,eligibility:{status:'conditionally_eligible'}},null,{skills:[]},vacancy,knowledge)
 requireTrue(result.score===60&&result.reviewed_skill_support.applied_bonus===0&&/^[0-9a-f]{64}$/.test(result.reviewed_skill_support.snapshot_hash),'Empty catalog baseline/fingerprint mismatch')
 checks.push('Actual guarded snapshot through the new client is available, bounded and empty; baseline score and fingerprint retained')
 step='anonymous and service negative controls'
 for(const mode of ['anonymous','service-negative']){
  const response=await client(mode).rpc('get_approved_skill_relationships',{p_skill_ids:skills.map(s=>s.id)})
  requireTrue(!!response.error,mode+' unexpectedly supplied a knowledge snapshot')
 }
 checks.push('Anonymous and service credentials cannot supply a user knowledge snapshot')
 step='revoked-session negative control'
 data(await actor.auth.signOut({scope:'global'}),'revoke fixture sessions')
 const revoked=createClient(expected,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+session.access_token},fetch:fetchFor('actor')}})
 const stale=await createReviewedSkillMatchingService({getClient:async()=>revoked}).load([vacancy])
 requireTrue(stale.status==='unavailable'&&stale.snapshot===null,'Revoked signed session supplied knowledge')
 checks.push('Previously valid JWT fails after real session revocation; reader safely reports unavailable')
 passed=true
}catch(error){console.error('DEV reviewed skill acceptance failed at '+step+': '+error.message)}
finally{
 try{
  if(actor)await actor.auth.signOut({scope:'global'})
  if(account){
   const stored=data(await fixture.auth.admin.getUserById(account.id),'verify fixture cleanup').user
   requireTrue(stored.email===email&&stored.user_metadata.test_run===run,'Refusing non-fixture cleanup')
   data(await fixture.auth.admin.deleteUser(account.id),'delete fixture auth user')
  }
  cleanup=true
 }catch{passed=false;console.error('Synthetic account cleanup incomplete; inspect run before retry')}
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),run_id:run,passed:passed&&cleanup,cleanup_complete:cleanup,synthetic_accounts:account?1:0,checks,requests,limitations:['No graph/source/node/jobseeker-profile/vacancy fixtures or new private graph history were created','Current approved graph is empty; positive-link ranking is verified with isolated/browser fixtures','No Google ownership acceptance, provider request or Edge publication was performed']}
 await writeFile(new URL('../../artifacts/reviewed-skill-ranking-20261015/native-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:evidence.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}))
 process.exitCode=evidence.passed?0:1
}
