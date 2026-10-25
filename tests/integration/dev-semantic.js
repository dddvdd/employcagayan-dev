import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_SEMANTIC_PHASE
if(process.env.EMPLOY_RUN_DEV_SEMANTIC_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
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
 const email='dev-semantic-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV semantic fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV semantic '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV semantic regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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
  step='authorized pair exposes the client retrieval gap'
  const profile=data(await employerA.client.rpc('get_jobseeker_match_profile',{p_jobseeker_profile_id:pa.id}),'authorized candidate profile')
  requireTrue(profile.participant_id===pa.id,'Employer is not authorized for this fixture profile')
  const privateCandidate=data(await employerA.client.from('employment_embeddings').select('embedding,status').eq('id',ejA.id),'ordinary employer candidate vector read')
  const ownVacancy=data(await employerA.client.from('employment_embeddings').select('embedding,status').eq('id',evA.id),'ordinary employer owned vacancy vector read')
  requireTrue(privateCandidate.length===0&&ownVacancy.length===1,'Expected raw-vector isolation was not observed')
  const source=data(await staff.client.from('employment_embeddings').select('embedding,status').eq('id',ejA.id).single(),'authorized fixture vector payload')
  requireTrue(typeof source.embedding==='string','Actual vector response type differs from the suspected client bug')
  checks.push('Authorized employer can read candidate matching profile but cannot fetch raw candidate vector; owned vacancy vector is available')
  checks.push('Actual DEV vector JSON field is a string, not a JavaScript number array')
  const unpublished=data(await employerA.client.rpc('get_vacancy_match_profile',{p_vacancy_definition_id:vc.id,p_event_vacancy_id:oc.id}),'unapproved event vacancy baseline');requireTrue(unpublished?.id===vc.id,'Event approval gap was not reproduced')
  checks.push('Other-company unapproved vacancy metadata is returned when its event offering ID is supplied')

 }else{
  step='authorized numeric similarity'
  const args={p_jobseeker_profile_id:pa.id,p_vacancy_definition_id:va.id}
  const good=data(await employerA.client.rpc('get_pair_semantic_similarity',args),'approved employer semantic pair')
  requireTrue(good.status==='available'&&Math.abs(good.similarity-1)<0.00001,'Identical native vectors did not return numeric similarity')
  requireTrue(Object.keys(good).sort().join(',')==='embedding_version,similarity,status','Semantic pair exposed private contents')
  denied(await employerA.client.from('employment_embeddings').select('id').eq('id',ejA.id),'raw candidate vector remains private')
  checks.push('Approved related employer receives numeric similarity and version only; raw candidate vectors remain private')
  step='identity, organization and jurisdiction'
  for(const [actor,request,label] of [
   [employerA,{p_jobseeker_profile_id:pb.id,p_vacancy_definition_id:va.id},'foreign candidate'],
   [employerA,{p_jobseeker_profile_id:pa.id,p_vacancy_definition_id:vb.id},'foreign organization'],
   [candidateA,args,'password candidate'],
   [pending,args,'pending employer'],
   [municipal,{...args,p_event_vacancy_id:oa.id},'municipal out-of-scope'],
  ])denied(await actor.client.rpc('get_pair_semantic_similarity',request),label)
  denied(await anonymous.rpc('get_pair_semantic_similarity',args),'anonymous pair')
  for(const actor of [provincial,staff,admin]){
   const result=data(await actor.client.rpc('get_pair_semantic_similarity',args),'authorized PESO pair')
   requireTrue(result.status==='available','Established PESO pair access missing')
  }
  const ownScope=data(await municipal.client.rpc('get_pair_semantic_similarity',{p_jobseeker_profile_id:pb.id,p_vacancy_definition_id:vb.id,p_event_vacancy_id:ob.id}),'municipal in-scope missing-vector pair')
  requireTrue(ownScope.status==='missing','Authorized missing embedding did not return fallback')
  checks.push('Canonical ownership, employer A/B, Google channel, MFA and established municipality/provincial/staff/admin scope preserved')
  step='native zero, incompatible model and invalid geometry'
  const orthogonal=[1,-1,...Array(1534).fill(0)]
  data(await fixture.from('employment_embeddings').update({embedding:JSON.stringify(orthogonal)}).eq('id',evA.id),'prepare orthogonal fixture')
  const zero=data(await employerA.client.rpc('get_pair_semantic_similarity',args),'orthogonal pair')
  requireTrue(zero.status==='available'&&Math.abs(zero.similarity)<0.00001,'Numeric zero was lost or treated as missing')
  data(await fixture.from('employment_embeddings').update({model:'different-synthetic-model'}).eq('id',evA.id),'prepare incompatible model')
  const incompatible=data(await employerA.client.rpc('get_pair_semantic_similarity',args),'incompatible pair')
  requireTrue(incompatible.status==='failed'&&incompatible.similarity===null,'Different model vectors were compared')
  data(await fixture.from('employment_embeddings').update({model:'synthetic',embedding:JSON.stringify(Array(1536).fill(0))}).eq('id',evA.id),'prepare zero magnitude fixture')
  const invalid=data(await employerA.client.rpc('get_pair_semantic_similarity',args),'invalid geometry pair')
  requireTrue(invalid.status==='failed'&&invalid.similarity===null,'Undefined cosine became an available result')
  checks.push('Native pgvector zero similarity stays numeric; incompatible models and zero magnitude fail closed')
  step='stale, failed and missing metadata fallback'
  data(await fixture.from('employment_embeddings').update({embedding:JSON.stringify(Array(1536).fill(0.1)),status:'stale'}).eq('id',evA.id),'prepare stale fixture')
  requireTrue(data(await employerA.client.rpc('get_pair_semantic_similarity',args),'stale pair').status==='stale','Stale vector was compared')
  data(await fixture.from('employment_embeddings').update({status:'failed'}).eq('id',evA.id),'prepare failed fixture')
  requireTrue(data(await employerA.client.rpc('get_pair_semantic_similarity',args),'failed pair').status==='failed','Failed vector was compared')
  requireTrue(data(await employerA.client.rpc('get_pair_semantic_similarity',{...args,p_jobseeker_embedding_version:'absent-fixture-version'}),'missing version pair').status==='missing','Missing version was compared')
  data(await fixture.from('employment_embeddings').update({status:'current'}).eq('id',evA.id),'restore current fixture')
  checks.push('Stale, failed and missing versions return explicit nonnumeric fallback states')
  step='event visibility approval boundary'
  const unpublished=data(await employerA.client.rpc('get_vacancy_match_profile',{p_vacancy_definition_id:vc.id,p_event_vacancy_id:oc.id}),'unapproved event vacancy filtered');requireTrue(unpublished===null,'Unapproved event vacancy still visible')
  checks.push('Event vacancy matching applies the active approved company filter already used by batch browsing')
  step='bounded semantic batch'
  const request={jobseeker_profile_id:pa.id,vacancy_id:va.id}
  const batch=data(await employerA.client.rpc('get_semantic_similarities',{p_pairs:[request]}),'authorized batch')
  requireTrue(batch.length===1&&batch[0].jobseeker_profile_id===pa.id&&batch[0].vacancy_id===va.id&&batch[0].status==='available','Batch identity or result mismatch')
  denied(await employerA.client.rpc('get_semantic_similarities',{p_pairs:Array(101).fill(request)}),'oversized semantic batch')
  denied(await employerA.client.rpc('get_semantic_similarities',{p_pairs:[request,{jobseeker_profile_id:pb.id,vacancy_id:va.id}]}),'foreign pair poisons entire batch')
  checks.push('Batch identity is preserved, bounded at 100 and fails for any unauthorized pair')
  step='revoked signed semantic session'
  const token=data(await staff.client.auth.getSession(),'signed session snapshot').session.access_token
  data(await staff.client.auth.signOut({scope:'global'}),'staff logout')
  const response=await fetchFor('actor')(expected+'/rest/v1/rpc/get_pair_semantic_similarity',{method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(args)})
  requireTrue(!response.ok,'Revoked signed session retained pair access')
  checks.push('Signed session revocation is enforced for numeric semantic access')

 }

}catch(error){failed=true;console.error('DEV semantic '+phase+' failed at '+step+': '+error.message)}
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
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,checks,requests,limitations:['No real Google OAuth or signed Google jobseeker tested; owner positive tests are isolated database/browser cases','Synthetic profiles/applications and privilege assignments use service credentials only for preparation/cleanup','No genuine user records intentionally accessed or modified','Signed capabilities or downloaded copies already granted are not instantly revocable by database policy changes']}
 await writeFile(new URL('../../artifacts/semantic-milestone-20261013/live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
