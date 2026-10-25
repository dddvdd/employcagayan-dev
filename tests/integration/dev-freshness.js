import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_FRESHNESS_PHASE
if(process.env.EMPLOY_RUN_DEV_FRESHNESS_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
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
function data(result,label){requireTrue(!result.error,label+' failed ('+(result.error?.code||result.error?.status||'request')+'): '+(result.error?.message||''));return result.data}
function denied(result,label){requireTrue(!!result.error||(Array.isArray(result.data)&&result.data.length===0),label+' unexpectedly allowed')}
async function account(role,extra={}){
 const email='dev-freshness-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV freshness fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV freshness '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV freshness regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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
 step='synthetic actor preparation'
 const candidateA=await account('applicant'),candidateB=await account('applicant'),employerA=await account('employer'),employerB=await account('employer'),pending=await account('employer'),staff=await account('staff'),municipal=await account('supervisor',{jurisdiction:'Aparri',is_provincial:false}),provincial=await account('supervisor',{is_provincial:true}),admin=await account('admin')
 const ca=await company(employerA,'company A'),cb=await company(employerB,'company B'),cc=await company(pending,'legacy pending'),cd=await company(candidateA,'candidate pending','pending')
 const va=await vacancy(ca,'vacancy A'),vb=await vacancy(cb,'vacancy B'),vc=await vacancy(cc,'legacy vacancy')
 data(await fixture.from('employers').update({registration_status:'pending'}).eq('id',cc.id),'pending fixture status')
 const ta=await event('Tuguegarao City'),tb=await event('Aparri'),oa=await offering(ta,va),ob=await offering(tb,vb),oc=await offering(ta,vc)
 const pa=await participant(candidateA),pb=await participant(candidateB),ea=await participation(pa,ta),eb=await participation(pb,tb)
 data(await fixture.from('participation_vacancies').insert({participation_id:ea.id,event_vacancy_id:oc.id,preference_type:'local'}),'fixture selected opportunity')
 const aa=await application(pa,va),ab=await application(pb,vb),eventApp=await application(pa,va,ea,oa)
 const roster=[employerA,employerB,pending,staff,municipal,provincial,admin,candidateA]
 step='intelligence synthetic fixture preparation'
 const skill=data(await fixture.from('skills').insert({canonical_name:'Synthetic DEV '+run,normalized_name:'synthetic '+run}).select('id').single(),'synthetic canonical skill')
 skillRecords.push(skill.id)
 async function suggestion(type,id,reviewed=false){
  const row=data(await fixture.from('ai_extraction_runs').insert({entity_type:type,entity_id:id,extraction_type:'profile',provider:'mock',model:'synthetic',input_hash:randomUUID()}).select('id').single(),'synthetic extraction run');aiRuns.push(row.id)
  const item=data(await fixture.from('ai_extraction_suggestions').insert({run_id:row.id,entity_type:type,entity_id:id,suggestion_type:'skill',raw_term:'Synthetic DEV skill',source_text_fragment:'Synthetic DEV evidence only',canonical_id:skill.id,canonical_name:'Synthetic DEV skill',importance:'required',review_status:reviewed?'accepted':'pending',reviewed_by:reviewed?employerB.id:null}).select('id').single(),'synthetic suggestion');aiSuggestions.push(item.id);return item
 }
 const sjA=await suggestion('jobseeker_profile',pa.id),sjB=await suggestion('jobseeker_profile',pb.id)
 const svA=await suggestion('vacancy',va.id),svB=await suggestion('vacancy',vb.id)
 const foreignReviewed=await suggestion('vacancy',vb.id,true)
 async function embedding(type,id){
  const revision=phase==='verify'?data(await fixture.rpc('get_embedding_source_revision',{p_entity_type:type,p_entity_id:id}),'fixture source revision'):null
  const row=data(await fixture.from('employment_embeddings').insert({...(revision===null?{}:{source_revision:revision}),entity_type:type,entity_id:id,embedding_type:type==='vacancy'?'vacancy_match_profile':'jobseeker_match_profile',source_text:'Synthetic DEV evidence only',source_hash:run+'-'+id,embedding_version:type==='vacancy'?SEMANTIC_VERSIONS.VACANCY:SEMANTIC_VERSIONS.JOBSEEKER,status:'current',model:'synthetic',provider:'mock',embedding:JSON.stringify(Array(1536).fill(0.1)),generated_at:new Date().toISOString()}).select('id').single(),'synthetic embedding metadata');embeddingRows.push(row.id);return row
 }
 const ejA=await embedding('jobseeker_profile',pa.id),ejB=await embedding('jobseeker_profile',pb.id),evA=await embedding('vacancy',va.id)
 step='signed AAL1 authorization'
 if(phase==='verify'){
  denied(await admin.client.rpc('qualification_admin_write_satisfied'),'AAL1 qualification privilege helper')
  denied(await employerA.client.rpc('get_pair_semantic_similarity',{p_jobseeker_profile_id:pa.id,p_vacancy_definition_id:va.id}),'AAL1 semantic pair')
  denied(await employerA.client.rpc('accept_ai_suggestion',{p_suggestion_id:svA.id}),'AAL1 employer AI review')
  denied(await admin.client.rpc('list_pending_suggestions',{p_entity_id:pa.id}),'AAL1 administrator AI list')
  denied(await municipal.client.from('employment_embeddings').select('id').eq('id',ejB.id),'AAL1 supervisor vector read')
  denied(await employerA.client.rpc('list_employer_applications',{p_vacancy_definition_id:va.id}),'AAL1 employer inbox')
  denied(await admin.client.from('applications').select('id').eq('id',aa.id),'AAL1 administrator')
  denied(await municipal.client.storage.from('resumes').download(pb.path),'AAL1 supervisor file')
  checks.push('Mandatory partner AAL1 data access denied')
 }
 for(const actor of roster)await mfa(actor)
 if(phase==='baseline'){
  step='ordinary signed canonical edit freshness'
  const args={p_jobseeker_profile_id:pa.id,p_vacancy_definition_id:va.id}
  requireTrue(data(await employerA.client.rpc('get_pair_semantic_similarity',args),'initial paired similarity').status==='available','Initial synthetic vector unavailable')
  data(await admin.client.from('jobseeker_profiles').update({years_of_experience:2}).eq('participant_id',pa.id),'authorized canonical profile edit')
  const profileState=data(await admin.client.from('employment_embeddings').select('status').eq('id',ejA.id).single(),'profile embedding state')
  requireTrue(profileState.status==='current','Baseline profile invalidation gap was not reproduced')
  data(await admin.client.from('vacancy_definitions').update({job_description:'Synthetic changed employment description, never a real job.'}).eq('id',va.id),'authorized vacancy edit')
  const vacancyState=data(await admin.client.from('employment_embeddings').select('status').eq('id',evA.id).single(),'vacancy embedding state')
  requireTrue(vacancyState.status==='current','Baseline vacancy invalidation gap was not reproduced')
  requireTrue(data(await employerA.client.rpc('get_pair_semantic_similarity',args),'post-edit paired similarity').status==='available','Baseline stale numeric availability was not reproduced')
  checks.push('Signed administrator profile/vacancy edits leave old vectors current and numeric pair remains available')

 }else{
  const args={p_jobseeker_profile_id:pa.id,p_vacancy_definition_id:va.id}
  const pair=async()=>data(await employerA.client.rpc('get_pair_semantic_similarity',args),'authorized pair')
  const rev=async(type,id)=>data(await fixture.rpc('get_embedding_source_revision',{p_entity_type:type,p_entity_id:id}),'worker source revision')
  const record=(type,id)=>({entity_type:type,entity_id:id,embedding_type:type==='vacancy'?'vacancy_match_profile':'jobseeker_match_profile',embedding_version:type==='vacancy'?SEMANTIC_VERSIONS.VACANCY:SEMANTIC_VERSIONS.JOBSEEKER,source_text:'Synthetic DEV infrastructure only',source_hash:run+'-'+id,embedding:Array(1536).fill(.1),provider:'mock',model:'synthetic',dimensions:1536})
  const store=async(type,id,r)=>data(await fixture.rpc('store_current_embedding',{p_record:record(type,id),p_expected_revision:r}),'worker CAS persistence')
  step='ordinary no-op and demographic preservation'
  requireTrue((await pair()).status==='available','Initial pair missing')
  data(await admin.client.from('jobseeker_profiles').update({first_name:'Synthetic edited',birthdate:'2001-01-01',years_of_experience:0}).eq('participant_id',pa.id),'demographic/no-op save')
  requireTrue((await pair()).status==='available','Demographic/no-op invalidated')
  checks.push('Signed no-op/demographic saves preserve employment cache')
  step='ordinary profile change and captured revision rejection'
  const old=await rev('jobseeker_profile',pa.id)
  data(await admin.client.from('jobseeker_profiles').update({years_of_experience:2}).eq('participant_id',pa.id),'employment edit')
  requireTrue((await pair()).status==='stale','Profile edit did not stale pair')
  const obsolete=await fixture.rpc('store_current_embedding',{p_record:record('jobseeker_profile',pa.id),p_expected_revision:old});requireTrue(obsolete.error?.code==='55000','Obsolete generation unexpected result ('+(obsolete.error?.code||'success')+'): '+(obsolete.error?.message||''))
  requireTrue((await fixture.from('employment_embeddings').update({status:'current',source_revision:old}).eq('id',ejA.id)).error?.code==='55000','Obsolete raw current write accepted')
  const fresh=await store('jobseeker_profile',pa.id,await rev('jobseeker_profile',pa.id))
  requireTrue(fresh.persisted===true&&fresh.status==='current'&&fresh.id===ejA.id,'Native persistence unconfirmed')
  requireTrue((await pair()).status==='available','Fresh pair unavailable')
  checks.push('Signed source edits stale pair; CAS/direct guard reject obsolete revisions; native fresh persistence succeeds')
  step='ordinary qualification changes'
  const child=data(await admin.client.from('jobseeker_skills').insert({jobseeker_profile_id:pa.id,skill_id:skill.id,years_experience:0}).select('id').single(),'qualification insert')
  requireTrue((await pair()).status==='stale','Qualification insert not stale')
  await store('jobseeker_profile',pa.id,await rev('jobseeker_profile',pa.id))
  data(await admin.client.from('jobseeker_skills').update({years_experience:0}).eq('id',child.id),'qualification no-op')
  requireTrue((await pair()).status==='available','Qualification no-op stale')
  data(await admin.client.from('jobseeker_skills').update({years_experience:3}).eq('id',child.id),'qualification edit')
  requireTrue((await pair()).status==='stale','Qualification edit not stale')
  await store('jobseeker_profile',pa.id,await rev('jobseeker_profile',pa.id))
  data(await admin.client.from('jobseeker_skills').delete().eq('id',child.id),'qualification delete')
  requireTrue((await pair()).status==='stale','Qualification delete not stale')
  await store('jobseeker_profile',pa.id,await rev('jobseeker_profile',pa.id))
  checks.push('Ordinary signed qualification I/U/D invalidate; no-op preserves')
  step='ordinary owned vacancy and requirement changes'
  const oldV=await rev('vacancy',va.id)
  data(await employerA.client.from('vacancy_definitions').update({job_description:'Synthetic changed employment description, never a real job.'}).eq('id',va.id),'owned vacancy edit')
  requireTrue((await pair()).status==='stale'&&await rev('vacancy',va.id)>oldV,'Vacancy edit not stale')
  await store('vacancy',va.id,await rev('vacancy',va.id))
  const requirement=data(await employerA.client.from('vacancy_skills').insert({vacancy_definition_id:va.id,skill_id:skill.id,importance:'required'}).select('id').single(),'owned requirement')
  requireTrue((await pair()).status==='stale','Requirement insert not stale')
  await store('vacancy',va.id,await rev('vacancy',va.id))
  data(await employerA.client.from('vacancy_skills').delete().eq('id',requirement.id),'owned requirement delete')
  requireTrue((await pair()).status==='stale','Requirement delete not stale')
  checks.push('Signed approved employer vacancy and requirement edits invalidate')
  step='worker privileges and native vector validation'
  for(const actor of [employerA,admin,pending,candidateA,{client:anonymous}]){
   denied(await actor.client.rpc('get_embedding_source_revision',{p_entity_type:'vacancy',p_entity_id:va.id}),'ordinary source control')
   denied(await actor.client.rpc('store_current_embedding',{p_record:record('vacancy',va.id),p_expected_revision:await rev('vacancy',va.id)}),'ordinary worker persistence')
  }
  const currentV=await rev('vacancy',va.id)
  for(const vector of [Array(1536).fill(0),[.1],['1',...Array(1535).fill(.1)]]){
   requireTrue(!!(await fixture.rpc('store_current_embedding',{p_record:{...record('vacancy',va.id),embedding:vector},p_expected_revision:currentV})).error,'Invalid native vector persisted')
  }
  await store('vacancy',va.id,currentV);requireTrue((await pair()).status==='available','Final pair missing')
  checks.push('Ordinary/anonymous worker execution denied; native zero/wrong-dimension/nonnumeric vectors rejected')
  step='organizational and geographic regression'
  for(const actor of [employerB,pending,candidateA])denied(await actor.client.rpc('get_pair_semantic_similarity',args),'unauthorized pair')
  denied(await municipal.client.rpc('get_pair_semantic_similarity',{...args,p_event_vacancy_id:oa.id}),'municipal foreign jurisdiction')
  for(const actor of [provincial,staff,admin])requireTrue(data(await actor.client.rpc('get_pair_semantic_similarity',args),'established oversight').status==='available','Oversight lost')
  denied(await employerA.client.from('employment_embeddings').select('id').eq('id',ejA.id),'raw candidate vector isolation')
  checks.push('Employer A/B, approval, Google-channel, MFA, jurisdiction and PESO boundaries preserved')
 }

}catch(error){failed=true;console.error('DEV freshness '+phase+' failed at '+step+': '+error.message)}
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
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,synthetic_source_ids:[...participants.map(row=>row.id),...vacancies.map(row=>row.id)],checks,requests,limitations:['No real Google OAuth or signed Google jobseeker tested; owner positive tests are isolated database/browser cases','Synthetic profiles/applications and privilege assignments use service credentials only for preparation/cleanup','No genuine user records intentionally accessed or modified','Signed capabilities or downloaded copies already granted are not instantly revocable by database policy changes']}
 await writeFile(new URL('../../artifacts/embedding-freshness-20261013/live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
