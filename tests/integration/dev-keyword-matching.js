import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
import {createKeywordMatchingService} from '../../src/services/keywordMatchingService.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
if(process.env.EMPLOY_RUN_KEYWORD_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture configuration mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const serviceClaims=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(serviceClaims&&(serviceClaims.role!=='service_role'||serviceClaims.ref!==ref))throw Error('Fixture credential mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],requests=[],checks=[],ids=[]
let actor=null,participant=null,application=null,preference=null,passed=false,cleanup=false,step='configuration'
const requireTrue=(v,label)=>{if(!v)throw Error(label)}
const data=(r,label)=>{requireTrue(!r.error,label+' failed ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
const fetchFor=mode=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 requireTrue(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(headers.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&url.pathname.startsWith('/rest/'))requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===accounts[0]?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed fixture actor required')
 const response=await fetch(input,{...init,redirect:'error',signal:init?.signal||AbortSignal.timeout(20000)})
 requests.push({mode,path:url.pathname,method:init?.method||'GET',status:response.status});return response
}
const client=mode=>createClient(expected,['fixture','service-negative'].includes(mode)?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture')
const insert=async(table,record)=>data(await fixture.from(table).insert(record).select().single(),'fixture '+table)
const pair=vacancy=>({jobseeker_profile_id:participant.id,vacancy_id:vacancy.id,event_vacancy_id:null})
const denied=async(pairs,code='42501')=>requireTrue((await actor.rpc('get_match_keyword_signals',{p_pairs:pairs})).error?.code===code,'Expected scoped keyword denial')
try{
 step='prepare isolated fixtures'
 for(let index=0;index<3;index++){
  const email='dev-keyword-'+run+'-'+index+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
  const account=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'fixture account').user
  accounts.push({...account,password});ids.push(account.id)
 }
 for(let index=0;index<2;index++){
  const company=await insert('employers',{company_name:'Synthetic keyword '+run+' '+index,registered_user_id:accounts[index].id,registration_status:'approved',is_active:true})
  companies.push(company);ids.push(company.id)
  data(await fixture.from('profiles').update({role:'employer'}).eq('id',accounts[index].id),'fixture canonical Partner')
 }
 participant=await insert('participants',{auth_user_id:accounts[2].id});ids.push(participant.id)
 requireTrue(participant.id!==accounts[2].id,'Distinct participant identity required')
 await insert('jobseeker_profiles',{participant_id:participant.id,first_name:'Nurse',last_name:'Synthetic',email:accounts[2].email,data_subject_rights_agreed:true})
 const occupation=data(await fixture.from('occupations').select('id').eq('canonical_name','Nurse').is('occupation_level',null).single(),'existing reference occupation')
 preference=await insert('jobseeker_occupation_preferences',{jobseeker_profile_id:participant.id,occupation_id:occupation.id,priority:1});ids.push(preference.id)
 for(const [company,index] of [[companies[0],0],[companies[0],1],[companies[1],2]]){
  const vacancy=await insert('vacancy_definitions',{employer_id:company.id,company_name:company.company_name,position:index===1?'Nurse support':'Nurse',
   occupation_id:index===1?null:occupation.id,job_description:'Synthetic keyword acceptance vacancy with no genuine personal information.',
   place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()})
  vacancies.push(vacancy);ids.push(vacancy.id)
 }
 application=await insert('applications',{participant_id:participant.id,vacancy_definition_id:vacancies[0].id,application_status:'applied',source:'online'});ids.push(application.id)
 checks.push('Isolated synthetic participant uses a UUID distinct from Auth; no fabricated Google identity or canonical dictionary edits')
 step='real Partner login and MFA'
 actor=client('actor');data(await actor.auth.signInWithPassword({email:accounts[0].email,password:accounts[0].password}),'signed Partner login')
 await denied([]);checks.push('Actual password AAL1 Partner cannot call keyword endpoint, including empty requests')
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic keyword '+run}),'TOTP enrollment')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'TOTP challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'TOTP verification')
 const session=data(await actor.auth.getSession(),'signed session').session
 requireTrue(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
 step='read through actual keyword client'
 const reader=createKeywordMatchingService({getClient:async()=>actor}),[signal]=await reader.load([pair(vacancies[0])])
 requireTrue(signal.status==='available'&&signal.score===100&&signal.matched_terms.join(',')==='nurse'&&signal.qualification_credit===false,'Authorized live keyword signal mismatch')
 checks.push('Signed employer AAL2 reads actual PostgreSQL full-text result through the production client adapter')
 step='organization and recruitment pool boundaries'
 await denied([pair(vacancies[1])]);await denied([pair(vacancies[2])])
 await denied([pair(vacancies[0]),pair(vacancies[2])])
 await denied([{...pair(vacancies[0]),query:'caller supplied text'}],'22023')
 checks.push('Same-company out-of-pool, cross-company, mixed foreign batch and caller text requests are rejected')
 step='freshness and missing-profile-keyword behavior'
 data(await fixture.from('vacancy_definitions').update({position:'Unrelated trade',occupation_id:null}).eq('id',vacancies[0].id),'fixture title edit')
 const [zero]=await reader.load([pair(vacancies[0])]);requireTrue(zero.status==='available'&&zero.score===0,'Current vacancy edit not reflected')
 data(await fixture.from('jobseeker_occupation_preferences').delete().eq('id',preference.id),'fixture preference removal')
 const [none]=await reader.load([pair(vacancies[0])]);requireTrue(none.status==='not_applicable','Personal name leaked into keyword query')
 checks.push('Current edits immediately change result; a personal name cannot replace missing canonical profile keywords')
 step='anonymous service and revoked-session denials'
 for(const mode of ['anonymous','service-negative'])requireTrue(!!(await client(mode).rpc('get_match_keyword_signals',{p_pairs:[]})).error,mode+' unexpectedly executed keyword RPC')
 data(await actor.auth.signOut({scope:'global'}),'revoke signed fixture session')
 const revoked=createClient(expected,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{headers:{Authorization:'Bearer '+session.access_token},fetch:fetchFor('actor')}})
 requireTrue((await revoked.rpc('get_match_keyword_signals',{p_pairs:[]})).error?.code==='42501','Revoked signed session still supplied keyword data')
 checks.push('Anonymous/service credentials and a previously valid JWT after actual session revocation cannot execute the endpoint')
 passed=true
}catch(error){console.error('DEV keyword acceptance failed at '+step+': '+error.message)}
finally{
 try{
  if(actor)await actor.auth.signOut({scope:'global'})
  for(const account of accounts){
   const user=data(await fixture.auth.admin.getUserById(account.id),'verify fixture identity scope').user
   requireTrue(user.email===account.email&&user.user_metadata?.test_run===run,'Refusing non-fixture cleanup')
  }
  for(const company of companies){const c=data(await fixture.from('employers').select('company_name').eq('id',company.id).single(),'verify company cleanup');requireTrue(c.company_name===company.company_name&&c.company_name.includes(run),'Refusing non-fixture company cleanup')}
  if(application)data(await fixture.from('applications').delete().eq('id',application.id).eq('participant_id',participant.id),'cleanup fixture application')
  for(const v of vacancies){
   data(await fixture.from('vacancy_history').delete().eq('vacancy_definition_id',v.id),'cleanup fixture vacancy history')
   data(await fixture.from('vacancy_definitions').delete().eq('id',v.id).eq('employer_id',v.employer_id),'cleanup fixture vacancy')
  }
  if(participant){
   data(await fixture.from('jobseeker_occupation_preferences').delete().eq('jobseeker_profile_id',participant.id),'cleanup fixture preferences')
   data(await fixture.from('jobseeker_profiles').delete().eq('participant_id',participant.id),'cleanup fixture profile')
   data(await fixture.from('participants').delete().eq('id',participant.id).eq('auth_user_id',accounts[2].id),'cleanup fixture participant')
  }
  for(const c of companies)data(await fixture.from('employers').delete().eq('id',c.id),'cleanup fixture company')
  for(const account of accounts)data(await fixture.auth.admin.deleteUser(account.id),'cleanup fixture Auth user')
  if(ids.length){
   data(await fixture.from('audit_logs').delete().in('record_id',ids),'cleanup exact fixture audit records')
   requireTrue(!data(await fixture.from('audit_logs').select('id').in('record_id',ids),'verify audit cleanup').length,'Fixture audit records remain')
  }
  for(const [table,key,values]of [['profiles','id',accounts.map(x=>x.id)],['participants','id',participant?[participant.id]:[]],['jobseeker_profiles','participant_id',participant?[participant.id]:[]],['employers','id',companies.map(x=>x.id)],['vacancy_definitions','id',vacancies.map(x=>x.id)]]){
   if(values.length)requireTrue(!data(await fixture.from(table).select(key).in(key,values),'verify '+table+' cleanup').length,'Fixture row remains')
  }
  cleanup=true
 }catch(error){passed=false;console.error('Synthetic keyword cleanup incomplete: '+error.message)}
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),run_id:run,passed:passed&&cleanup,cleanup_complete:cleanup,
  fixture_ids:ids,account_ids:accounts.map(a=>a.id),participant_id:participant?.id??null,company_ids:companies.map(x=>x.id),vacancy_ids:vacancies.map(x=>x.id),
  checks,requests,limitations:['No real Google owner acceptance, genuine personal records, provider calls, or vacancy/candidate relevance approval',
   'Read-only keyword endpoint; service key was used only for isolated fixture preparation/cleanup and its explicit negative control']}
 await writeFile(new URL('../../artifacts/keyword-matching-20261016/native-results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({passed:evidence.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}))
 process.exitCode=evidence.passed?0:1
}
