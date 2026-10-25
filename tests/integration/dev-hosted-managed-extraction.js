import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_HOSTED_PHASE
if(process.env.EMPLOY_RUN_DEV_HOSTED_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
const aiRuns=[],aiSuggestions=[],skillRecords=[],embeddingRows=[]
let step='configuration',failed=false,cleanupComplete=false
const requireTrue=(value,label)=>{if(!value)throw Error(label)}
const fetchFor=mode=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 requireTrue(url.origin===expected&&url.protocol==='https:','Outbound target mismatch')
 requireTrue(process.env.EMPLOY_VERIFIED_DEV_URL===expected&&env.VITE_SUPABASE_URL===expected,'Verification changed')
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),token=headers.get('authorization')?.replace(/^Bearer /,'')
 const jwt=token?claims(token):null
 if(mode==='actor'&&(url.pathname.startsWith('/rest/')||url.pathname.startsWith('/storage/')||url.pathname.startsWith('/functions/')))requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Acceptance requires an actual signed DEV user session')
 if(mode!=='fixture')requireTrue(jwt?.role!=='service_role','Service key cannot satisfy acceptance')
 const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(url.pathname.startsWith('/functions/')?45000:20000)})
 requests.push({mode,method:init?.method||'GET',path:url.pathname,status:response.status})
 return response
}
const client=mode=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture'),anonymous=client('anonymous')
function data(result,label){requireTrue(!result.error,label+' failed ('+(result.error?.code||result.error?.status||'request')+')');return result.data}
function denied(result,label){requireTrue(!!result.error||(Array.isArray(result.data)&&result.data.length===0),label+' unexpectedly allowed')}
async function account(role,extra={}){
 const email='dev-hosted-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV managed fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV managed '+run}),'enroll factor')
 const challenge=data(await actor.client.auth.mfa.challenge({factorId:factor.id}),'challenge factor')
 data(await actor.client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'verify factor')
 requireTrue(claims(data(await actor.client.auth.getSession(),'actor session').session.access_token)?.aal==='aal2','Signed AAL2 missing')
 actor.factor=factor.id
}
async function company(owner,label,status='approved'){
 const name='Synthetic DEV '+run+' '+label
 const row=data(await fixture.from('employers').insert({registered_user_id:owner.id,company_name:name,employer_type:'local_direct',registration_status:status,is_active:true}).select('id,company_name,registered_user_id').single(),'fixture company')
 companies.push(row);return row
}
async function vacancy(company,label){
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV managed regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
 vacancies.push(row);return row
}
async function event(location){
 const row=data(await fixture.from('events').insert({event_name:'Synthetic DEV '+run+' '+location,event_date:'2026-10-13',location,status:'ongoing'}).select('id,event_name').single(),'fixture event')
 events.push(row);return row
}
async function offering(event,vacancy){
 const row=data(await fixture.from('event_vacancies').insert({event_id:event.id,vacancy_definition_id:vacancy.id}).select('id').single(),'fixture offering');offerings.push(row);return row
}
function pdf(){
 const stream='BT /F1 12 Tf 20 100 Td (Synthetic DEV resume) Tj ET'
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream']
 let text='%PDF-1.4\n',offsets=[0]
 objects.forEach((value,index)=>{offsets.push(Buffer.byteLength(text));text+=(index+1)+' 0 obj\n'+value+'\nendobj\n'})
 const xref=Buffer.byteLength(text);text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'
 return Buffer.from(text)
}
const bytes=pdf()
async function participant(actor){
 const parent=data(await fixture.from('participants').insert({auth_user_id:actor.id}).select('id,auth_user_id').single(),'fixture participant');participants.push(parent)
 const path=actor.id+'/'+randomUUID()+'.pdf';files.push(path)
 data(await fixture.storage.from('resumes').upload(path,bytes,{contentType:'application/pdf',cacheControl:'0',upsert:false}),'fixture PDF bytes')
 data(await fixture.from('jobseeker_profiles').insert({participant_id:parent.id,first_name:'Synthetic',last_name:'DEV '+run,email:'fixture@example.invalid',birthdate:'2000-01-01',data_subject_rights_agreed:true,years_of_experience:0,resume_path:path}),'fixture profile')
 return {...parent,path}
}
async function participation(parent,event){
 const row=data(await fixture.from('event_participations').insert({participant_id:parent.id,event_id:event.id,check_in_status:'checked_in',check_in_time:new Date().toISOString()}).select('id').single(),'fixture participation');participations.push(row);return row
}
async function application(parent,vacancy,ep=null,offer=null){
 return data(await fixture.from('applications').insert({participant_id:parent.id,vacancy_definition_id:vacancy.id,registrant_id:ep?.id||null,event_vacancy_id:offer?.id||null,application_status:'applied',source:ep?'event':'online'}).select('id,participant_id').single(),'fixture application')
}
async function download(actor,path,label){
 const blob=data(await actor.client.storage.from('resumes').download(path,{}, {cache:'no-store'}),label)
 requireTrue(Buffer.from(await blob.arrayBuffer()).equals(bytes),label+' returned incorrect bytes')
}
try{
 step='hosted local-browser CORS'
 const preflight=await fetchFor('anonymous')(expected+'/functions/v1/extract-employment',{method:'OPTIONS',headers:{Origin:'https://127.0.0.1:5173','Access-Control-Request-Method':'POST'}})
 requireTrue(preflight.ok&&preflight.headers.get('access-control-allow-origin')==='https://127.0.0.1:5173','Hosted local browser CORS unavailable')
 checks.push('Hosted preflight explicitly permits the local HTTPS browser origin')
 step='signed hosted actors'
 const candidate=await account('applicant'),peso=await account('admin'),other=await account('employer')
 const pa=await participant(candidate)
 const fragment='I use Microsoft Excel to maintain spreadsheets.'
 data(await fixture.from('jobseeker_profiles').update({professional_summary:fragment}).eq('participant_id',pa.id),'prepare synthetic employment source')
 const args={p_entity_type:'jobseeker_profile',p_entity_id:pa.id}
 const sourceHash=async()=>data(await peso.client.rpc('get_ai_extraction_source',args),'signed source preparation')
 const rawBody={mode:'managed',entity_type:'jobseeker_profile',entity_id:pa.id,source_hash:'a'.repeat(64)}
 step='hosted authority denials before provider work'
 denied(await anonymous.functions.invoke('extract-employment',{body:rawBody}),'anonymous hosted generation')
 denied(await fixture.functions.invoke('extract-employment',{body:rawBody}),'service hosted shortcut')
 denied(await candidate.client.functions.invoke('extract-employment',{body:rawBody}),'applicant hosted generation')
 denied(await other.client.functions.invoke('extract-employment',{body:rawBody}),'employer hosted generation')
 denied(await peso.client.functions.invoke('extract-employment',{body:rawBody}),'peso AAL1 hosted generation')
 await mfa(peso)
 denied(await peso.client.functions.invoke('extract-employment',{body:rawBody}),'stale source hosted generation')
 checks.push('Hosted gateway/canonical role/session/source checks deny anonymous, service, applicant, employer, AAL1 and stale-fingerprint requests before any valid attempt')
 step='actual provider managed completion'
 const source=await sourceHash()
 requireTrue(source.source_text==='Professional summary: '+fragment,'Source unexpectedly contains another profile field')
 const before=data(await peso.client.rpc('get_jobseeker_match_profile',{p_jobseeker_profile_id:pa.id}),'canonical profile before provider')
 const request={...rawBody,source_hash:source.source_hash}
 const generated=await peso.client.functions.invoke('extract-employment',{body:request})
 if(generated.error){const pending=data(await fixture.from('ai_extraction_runs').select('id').eq('entity_id',pa.id).eq('producer_version','employment-extraction-producer-v1'),'inspect failed hosted run');for(const r of pending)if(!aiRuns.includes(r.id))aiRuns.push(r.id)}
 const result=data(generated,'actual hosted provider generation')
 if(result.run_id&&!aiRuns.includes(result.run_id))aiRuns.push(result.run_id)
 requireTrue(result.status==='completed'&&result.producer_version==='employment-extraction-producer-v1'&&result.suggestion_count>0&&result.cached===false,'Hosted managed provider did not return completed pending work')
 requireTrue(!('source' in result)&&!('lease_token' in result),'Hosted receipt exposed private state')
 const proposals=data(await peso.client.from('ai_extraction_suggestions').select('id,review_status,reviewed_by,producer_version').eq('run_id',result.run_id),'signed pending proposals')
 aiSuggestions.push(...proposals.map(r=>r.id))
 requireTrue(proposals.length===result.suggestion_count&&proposals.every(r=>r.review_status==='pending'&&r.reviewed_by===null&&r.producer_version===result.producer_version),'Hosted provider bypassed human review')
 checks.push('One actual OpenRouter request with synthetic canonical source completes through hosted v9 and persists pending proposals only')
 step='canonical separation and cache'
 const after=data(await peso.client.rpc('get_jobseeker_match_profile',{p_jobseeker_profile_id:pa.id}),'canonical profile after provider')
 for(const key of ['skills','education','certifications','languages','work_experiences','occupation_preferences','industry_preferences'])requireTrue(JSON.stringify(before[key])===JSON.stringify(after[key]),'Provider changed canonical '+key)
 const cached=data(await peso.client.functions.invoke('extract-employment',{body:request}),'hosted completed cache')
 requireTrue(cached.cached===true&&cached.run_id===result.run_id&&cached.suggestion_count===result.suggestion_count,'Hosted completed cache missed')
 const status=data(await peso.client.rpc('get_ai_extraction_run',{p_run_id:result.run_id}),'signed hosted run receipt')
 requireTrue(status.status==='completed'&&status.request_count===1,'Hosted cache repeated a managed attempt')
 checks.push('Canonical qualification/preference arrays stay unchanged; repeated hosted request returns the same completed cache with one managed attempt')
 step='actual human review'
 data(await peso.client.rpc('reject_ai_suggestion',{p_suggestion_id:proposals[0].id,p_review_note:'Synthetic DEV hosted acceptance; discard test proposal'}),'signed human rejection')
 requireTrue(data(await peso.client.from('ai_extraction_suggestions').select('review_status').eq('id',proposals[0].id).single(),'review status').review_status==='rejected','Human rejection did not persist')
 checks.push('Actual signed PESO human review can reject hosted output independently')
}catch(error){failed=true;console.error('DEV hosted managed '+phase+' failed at '+step+': '+error.message)}

finally{
 step='fixture cleanup'
 try {
  const fixtureIds=participants.map(row=>row.id),vacancyIds=vacancies.map(row=>row.id)
  if(vacancyIds.length){
   const associated=data(await fixture.from('applications').select('id,participant_id').in('vacancy_definition_id',vacancyIds),'inspect cleanup associations')
   requireTrue(associated.every(row=>fixtureIds.includes(row.participant_id)),'Cleanup refused non-fixture recruitment association')
   if(associated.length)data(await fixture.from('applications').delete().in('id',associated.map(row=>row.id)),'delete fixture applications')
  }
  if(aiSuggestions.length)data(await fixture.from('ai_extraction_suggestions').delete().in('id',aiSuggestions),'delete synthetic suggestions')
  if(aiRuns.length)data(await fixture.from('ai_extraction_runs').delete().in('id',aiRuns),'delete synthetic extraction runs')
  if(embeddingRows.length)data(await fixture.from('employment_embeddings').delete().in('id',embeddingRows),'delete synthetic embedding metadata')
  if(fixtureIds.length)data(await fixture.from('jobseeker_skills').delete().in('jobseeker_profile_id',fixtureIds),'delete synthetic accepted skills')
  if(vacancyIds.length)data(await fixture.from('vacancy_skills').delete().in('vacancy_definition_id',vacancyIds),'delete synthetic vacancy skills')
  if(skillRecords.length)data(await fixture.from('skills').delete().in('id',skillRecords),'delete synthetic canonical skills')
  if(fixtureIds.length)data(await fixture.from('jobseeker_profiles').update({resume_path:null}).in('participant_id',fixtureIds),'unlink fixture resumes')
  if(files.length)data(await fixture.storage.from('resumes').remove(files),'delete synthetic PDF bytes')
  if(participations.length){const ids=participations.map(row=>row.id);data(await fixture.from('participation_vacancies').delete().in('participation_id',ids),'delete fixture interests');data(await fixture.from('event_participations').delete().in('id',ids),'delete fixture participations')}
  if(fixtureIds.length){data(await fixture.from('jobseeker_profiles').delete().in('participant_id',fixtureIds),'delete fixture profiles');data(await fixture.from('participants').delete().in('id',fixtureIds),'delete fixture participants')}
  if(offerings.length)data(await fixture.from('event_vacancies').delete().in('id',offerings.map(row=>row.id)),'delete fixture offerings')
  if(vacancyIds.length)data(await fixture.from('vacancy_definitions').delete().in('id',vacancyIds),'delete fixture vacancies')
  if(events.length)data(await fixture.from('events').delete().in('id',events.map(row=>row.id)),'delete fixture events')
  for(const company of companies){const stored=data(await fixture.from('employers').select('company_name,registered_user_id').eq('id',company.id).single(),'verify fixture company cleanup');requireTrue(stored.company_name===company.company_name&&stored.registered_user_id===company.registered_user_id,'Refusing genuine company cleanup');data(await fixture.from('employers').delete().eq('id',company.id).eq('registered_user_id',company.registered_user_id),'delete fixture company')}
  for(const account of accounts){const stored=data(await fixture.auth.admin.getUserById(account.id),'verify fixture user cleanup').user;requireTrue(stored.email===account.email&&stored.user_metadata.test_run===run,'Refusing genuine account cleanup');data(await fixture.auth.admin.deleteUser(account.id),'delete fixture auth user')}
  cleanupComplete=true
 }catch{failed=true;console.error('Synthetic fixture cleanup incomplete; inspect this run before another live test')}
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,provider_actor_role:'admin',checks,requests,limitations:['Service credentials are fixture-only plus a denied shortcut attempt; actual hosted generation uses a signed PESO user and real provider output','Ordinary start/read/human review acceptance uses actual signed users with real TOTP','No signed Google owner acceptance or genuine source data was used','Approved DEV v9 publication and one valid synthetic actual-provider attempt; cached repeat reuses that attempt']}
 await writeFile(new URL('../../artifacts/extraction-producer-20261014/hosted-live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
