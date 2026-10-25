import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_LIFECYCLE_PHASE
if(process.env.EMPLOY_RUN_DEV_LIFECYCLE_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
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
 if(mode==='actor'&&(url.pathname.startsWith('/rest/')||url.pathname.startsWith('/storage/')))requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Acceptance requires an actual signed DEV user session')
 if(mode!=='fixture')requireTrue(jwt?.role!=='service_role','Service key cannot satisfy acceptance')
 const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,method:init?.method||'GET',path:url.pathname,status:response.status})
 return response
}
const client=mode=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture'),anonymous=client('anonymous')
function data(result,label){requireTrue(!result.error,label+' failed ('+(result.error?.code||result.error?.status||'request')+')');return result.data}
function denied(result,label){requireTrue(!!result.error||(Array.isArray(result.data)&&result.data.length===0),label+' unexpectedly allowed')}
async function account(role,extra={}){
 const email='dev-lifecycle-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV lifecycle fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV lifecycle '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV lifecycle regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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
try {
 step='synthetic lifecycle actors'
 const candidate=await account('applicant'),employer=await account('employer'),staff=await account('staff'),admin=await account('admin'),
 municipal=await account('supervisor',{jurisdiction:'Aparri',is_provincial:false}),provincial=await account('supervisor',{is_provincial:true})
 const ca=await company(employer,'lifecycle company'),va=await vacancy(ca,'lifecycle vacancy')
 const ta=await event('Tuguegarao City');await offering(ta,va)
 const pa=await participant(candidate);await participation(pa,ta)
 const term='Synthetic Excel '+run,fragment='I can use '+term+'.'
 data(await fixture.from('jobseeker_profiles').update({professional_summary:fragment}).eq('participant_id',pa.id),'prepare lifecycle source')
 const skill=data(await fixture.from('skills').insert({canonical_name:term,normalized_name:term.toLowerCase()}).select('id').single(),'prepare synthetic canonical target')
 skillRecords.push(skill.id)
 const snapshot=(actor,type,id)=>actor.client.rpc('get_ai_extraction_source',{p_entity_type:type,p_entity_id:id})
 const start=(actor,type,id,hash)=>actor.client.rpc('begin_ai_extraction',{p_entity_type:type,p_entity_id:id,p_source_hash:hash})
 const payload=()=>({extraction_version:'ai-extraction-v1',occupations:[],skills:[],certifications:[],education_requirements:[],experience_requirements:[],industries:[]})
 const finish=(r,output)=>fixture.rpc('complete_ai_extraction',{p_run_id:r.run_id,p_lease_token:r.lease_token,p_output:output})
 async function prepare(actor,extra=''){
  if(extra)data(await fixture.from('jobseeker_profiles').update({professional_summary:fragment+' '+extra}).eq('participant_id',pa.id),'prepare changed fixture source')
  const source=data(await snapshot(actor,'jobseeker_profile',pa.id),'authorized source snapshot')
  const r=data(await start(actor,'jobseeker_profile',pa.id,source.source_hash),'begin managed fixture run')
  if(r.run_id&&!aiRuns.includes(r.run_id))aiRuns.push(r.run_id)
  return r
 }
 step='ordinary role/MFA/jurisdiction gates'
 denied(await start(admin,'jobseeker_profile',pa.id,'0'.repeat(64)),'AAL1 lifecycle start')
 for(const actor of [employer,staff,admin,municipal,provincial])await mfa(actor)
 for(const actor of [candidate,employer,municipal])denied(await start(actor,'jobseeker_profile',pa.id,'0'.repeat(64)),'unauthorized lifecycle start')
 denied(await anonymous.rpc('begin_ai_extraction',{p_entity_type:'vacancy',p_entity_id:va.id,p_source_hash:'0'.repeat(64)}),'anonymous lifecycle start')
 checks.push('Actual signed lifecycle starts require current PESO MFA and existing entity/jurisdiction authority')
 step='concurrent source idempotency'
 const source=data(await snapshot(staff,'jobseeker_profile',pa.id),'concurrent source')
 const responses=await Promise.all(Array.from({length:12},()=>start(staff,'jobseeker_profile',pa.id,source.source_hash)))
 const records=responses.map(r=>data(r,'concurrent managed start'))
 requireTrue(records.filter(r=>r.cached===false).length===1&&new Set(records.map(r=>r.run_id)).size===1,'Concurrent starts created duplicate work')
 const first=records.find(r=>r.cached===false);aiRuns.push(first.run_id)
 const out=payload();out.skills=[{raw_term:term,confidence:.9,provenance:'explicit',source_text_fragment:fragment,resolution_status:'RESOLVED',canonical_id:skill.id,canonical_name:'FORGED-NAME',review_status:'accepted',verification_status:'verified'}]
 denied(await staff.client.rpc('complete_ai_extraction',{p_run_id:first.run_id,p_lease_token:first.lease_token,p_output:out}),'ordinary completion')
 denied(await admin.client.from('ai_extraction_runs').update({status:'completed',producer_version:null}).eq('id',first.run_id),'direct managed metadata rewrite')
 const completed=data(await finish(first,out),'synthetic trusted worker completion')
 requireTrue(completed.suggestion_count===1&&completed.status==='completed','Worker completion lost proposal')
 const proposed=data(await admin.client.from('ai_extraction_suggestions').select('id,review_status,reviewed_by,canonical_name,producer_version').eq('run_id',first.run_id).single(),'read pending proposal');aiSuggestions.push(proposed.id)
 requireTrue(proposed.review_status==='pending'&&proposed.reviewed_by===null&&proposed.canonical_name===term&&proposed.producer_version==='employment-extraction-producer-v1','Worker accepted model authority')
 requireTrue(data(await admin.client.from('jobseeker_skills').select('id').eq('jobseeker_profile_id',pa.id),'canonical state before review').length===0,'Completion wrote canonical qualification')
 const again=data(await start(provincial,'jobseeker_profile',pa.id,source.source_hash),'completed cache')
 requireTrue(again.cached&&again.run_id===first.run_id&&again.suggestion_count===1,'Authorized cache missed completed work')
 checks.push('12 signed parallel starts create one run; trusted fixture worker persists pending-only suggestions and ignores model verification/review/name fields')
 step='signed human acceptance'
 const listed=data(await admin.client.rpc('list_pending_suggestions_v2',{p_entity_type:'jobseeker_profile',p_entity_id:pa.id}),'managed review queue')
 requireTrue(listed.some(s=>s.id===proposed.id&&s.producer_version==='employment-extraction-producer-v1'),'Managed lineage absent from queue')
 requireTrue(data(await admin.client.rpc('accept_ai_suggestion',{p_suggestion_id:proposed.id}),'signed human review').wrote_canonical,'Human review did not persist approved fixture qualification')
 const qualification=data(await admin.client.from('jobseeker_skills').select('source,verification_status').eq('jobseeker_profile_id',pa.id).eq('skill_id',skill.id).single(),'qualification after human review')
 requireTrue(qualification.source==='llm_inferred'&&qualification.verification_status==='unverified','Human review fabricated verified qualification')
 checks.push('Actual signed human review is required for canonical persistence and retains llm_inferred/unverified provenance')
 step='atomic malformed output and retry'
 const atomic=await prepare(admin,'Atomic rollback case.'),bad=payload()
 bad.skills=[{...out.skills[0]},{...out.skills[0],source_text_fragment:'Invented quote'}]
 denied(await finish(atomic,bad),'invalid late proposal')
 requireTrue(data(await admin.client.from('ai_extraction_suggestions').select('id').eq('run_id',atomic.run_id),'rolled-back proposals').length===0,'Partial proposals survived invalid batch')
 requireTrue(data(await admin.client.rpc('get_ai_extraction_run',{p_run_id:atomic.run_id}),'unfinished run').status==='processing','Malformed output falsely completed work')
 data(await fixture.rpc('fail_ai_extraction',{p_run_id:atomic.run_id,p_lease_token:atomic.lease_token,p_reason:'invalid_output'}),'classify failed fixture work')
 const retry=await prepare(admin)
 requireTrue(retry.run_id===atomic.run_id&&retry.lease_token!==atomic.lease_token,'Retry duplicated run or retained nonce')
 denied(await finish(atomic,payload()),'obsolete completion callback')
 requireTrue(data(await finish(retry,payload()),'zero-result completion').suggestion_count===0,'Empty successful output not completed')
 checks.push('Late invalid output rolls back all suggestions; controlled failure retries replace the lease and zero-result completion works')
 step='stale-source completion and review'
 const stale=await prepare(admin,'Stale completion case.')
 data(await fixture.from('jobseeker_profiles').update({professional_summary:fragment+' New source after begin.'}).eq('participant_id',pa.id),'change pending source')
 const staleResult=await finish(stale,payload());requireTrue(staleResult.error?.code==='55000','Stale source completion was not denied')
 data(await fixture.rpc('fail_ai_extraction',{p_run_id:stale.run_id,p_lease_token:stale.lease_token,p_reason:'source_changed'}),'classify stale fixture work')
 const reviewStale=await prepare(admin,'Stale review case.')
 data(await finish(reviewStale,out),'prepare completed stale-review fixture')
 const staleSuggestion=data(await admin.client.from('ai_extraction_suggestions').select('id').eq('run_id',reviewStale.run_id).single(),'stale review suggestion');aiSuggestions.push(staleSuggestion.id)
 data(await fixture.from('jobseeker_profiles').update({professional_summary:fragment+' Changed before review.'}).eq('participant_id',pa.id),'change source before acceptance')
 const acceptance=await admin.client.rpc('accept_ai_suggestion',{p_suggestion_id:staleSuggestion.id});requireTrue(acceptance.error?.code==='55000','Stale human acceptance persisted canonical data')
 requireTrue(data(await admin.client.rpc('reject_ai_suggestion',{p_suggestion_id:staleSuggestion.id}),'reject obsolete proposal').success,'Obsolete suggestion could not be rejected')
 checks.push('Live source changes deny both worker persistence and human acceptance while still permitting authorized rejection')
 step='revoked producing session'
 const revoked=await prepare(staff,'Revoked producing session case.')
 data(await staff.client.auth.signOut({scope:'global'}),'revoke producing staff session')
 denied(await finish(revoked,payload()),'revoked producing session completion')
 data(await fixture.rpc('fail_ai_extraction',{p_run_id:revoked.run_id,p_lease_token:revoked.lease_token,p_reason:'session_expired'}),'fail revoked fixture work')
 checks.push('Trusted fixture completion cannot reuse a revoked actual signed producing session')
 step='real lease expiry'
 const expired=await prepare(provincial,'Real expiry case.')
 console.log('Waiting for the actual two-minute lease to expire; no provider request is made.')
 await new Promise(resolve=>setTimeout(resolve,125000))
 const expiredResult=await finish(expired,payload());requireTrue(expiredResult.error?.code==='55000','Actual expired lease retained write authority')
 data(await fixture.rpc('fail_ai_extraction',{p_run_id:expired.run_id,p_lease_token:expired.lease_token,p_reason:'lease_expired'}),'fail expired fixture work')
 checks.push('Actual elapsed lease expiry closes completion authority without clock fabrication')
 step='private lineage and minimal audit'
 const audit=data(await admin.client.from('audit_logs').select('new_data').in('record_id',aiRuns).in('action',['ai_extraction_started','ai_extraction_completed','ai_extraction_failed']),'fixture lifecycle audit')
 requireTrue(audit.length>0&&audit.every(x=>Object.keys(x.new_data).every(k=>['status','entity_type','suggestion_count','failure_reason'].includes(k))),'Source or claims entered operational audit')
 checks.push('Lifecycle audit records state/type/count only; source and authentication claims stay out of audit payloads')
}catch(error){failed=true;console.error('DEV lifecycle '+phase+' failed at '+step+': '+error.message)}

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
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,checks,requests,limitations:['Managed worker completion uses service credentials with synthetic output to test the trusted worker plane; it is not ordinary-user authorization or real provider acceptance','Ordinary start/read/human review acceptance uses actual signed users with real TOTP','No signed Google owner acceptance or genuine source data was used','No new Edge publication or provider request was performed']}
 await writeFile(new URL('../../artifacts/extraction-producer-20261014/lifecycle-live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
