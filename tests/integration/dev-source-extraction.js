import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_SOURCE_PHASE
if(process.env.EMPLOY_RUN_DEV_SOURCE_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
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
 const email='dev-source-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV source fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV source '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV source regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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
 step='synthetic source actors'
 const candidateA=await account('applicant'),candidateB=await account('applicant'),employer=await account('employer'),
 staff=await account('staff'),admin=await account('admin'),municipal=await account('supervisor',{jurisdiction:'Aparri',is_provincial:false}),
 provincial=await account('supervisor',{is_provincial:true}),medical=await account('medical')
 const ca=await company(employer,'source company'),va=await vacancy(ca,'source vacancy A'),vb=await vacancy(ca,'source vacancy B')
 const ta=await event('Tuguegarao City'),tb=await event('Aparri')
 await offering(ta,va);await offering(tb,vb)
 const pa=await participant(candidateA),pb=await participant(candidateB)
 await participation(pa,ta);await participation(pb,tb)
 data(await fixture.from('jobseeker_profiles').update({first_name:'PRIVATE-NAME',email:'private@example.invalid',professional_summary:'I can use Microsoft Excel.',career_interests:'Office administration',previous_occupation:'Office clerk',desired_occupation:'Administrative assistant',employment_accommodation_notes:'PRIVATE-ACCOMMODATION'}).eq('participant_id',pa.id),'prepare employment source')
 const snapshot=(actor,type,id)=>actor.client.rpc('get_ai_extraction_source',{p_entity_type:type,p_entity_id:id})
 step='signed AAL1 source denial'
 denied(await snapshot(admin,'jobseeker_profile',pa.id),'AAL1 source read')
 checks.push('Actual signed AAL1 administrator cannot read an extraction source')
 for(const actor of [employer,staff,admin,municipal,provincial,medical])await mfa(actor)
 step='signed role and entity scope'
 for(const actor of [candidateA,employer,medical])denied(await snapshot(actor,'vacancy',va.id),'non-PESO source role')
 denied(await anonymous.rpc('get_ai_extraction_source',{p_entity_type:'vacancy',p_entity_id:va.id}),'anonymous source read')
 checks.push('Password candidate, approved employer, verified medical and anonymous actors cannot use PESO source previews')
 step='canonical source contents'
 for(const actor of [staff,admin,provincial]){
  const profile=data(await snapshot(actor,'jobseeker_profile',pa.id),'authorized profile source')
  requireTrue(profile.entity_id===pa.id&&pa.id!==candidateA.id&&profile.source_version==='employment-extraction-source-v1','Canonical source identity/version mismatch')
  requireTrue(profile.source_segments.find(s=>s.field==='previous_occupation')?.intent==='historical'&&profile.source_segments.find(s=>s.field==='desired_occupation')?.intent==='preference','Source intent separation missing')
  requireTrue(/^[0-9a-f]{64}$/.test(profile.source_hash)&&profile.source_text.includes('I can use Microsoft Excel.'),'Employment source text/hash missing')
  for(const value of ['PRIVATE-NAME','private@example.invalid','PRIVATE-ACCOMMODATION','2000-01-01',pa.path,candidateA.id])requireTrue(!JSON.stringify(profile).includes(value),'Structured private field exposed')
  requireTrue(data(await snapshot(actor,'vacancy',va.id),'authorized vacancy source').entity_id===va.id,'Vacancy identity mismatch')
 }
 denied(await snapshot(staff,'jobseeker_profile',candidateA.id),'UID treated as participant identity')
 denied(await snapshot(staff,'vacancy',randomUUID()),'unknown canonical vacancy')
 denied(await snapshot(staff,'jobseeker',pa.id),'legacy entity type')
 checks.push('Actual signed staff/admin/provincial snapshots return employment fields with canonical PID/vacancy identity and omit structured personal/document data')
 step='municipal source scope'
 denied(await snapshot(municipal,'jobseeker_profile',pa.id),'municipal foreign profile source')
 denied(await snapshot(municipal,'vacancy',va.id),'municipal foreign vacancy source')
 requireTrue(data(await snapshot(municipal,'jobseeker_profile',pb.id),'municipal local profile source').entity_id===pb.id,'Local profile source denied')
 requireTrue(data(await snapshot(municipal,'vacancy',vb.id),'municipal local vacancy source').entity_id===vb.id,'Local vacancy source denied')
 checks.push('Actual signed municipal source access remains within canonical event jurisdiction')
 step='source fingerprint and byte limits'
 const original=data(await snapshot(staff,'jobseeker_profile',pa.id),'original source')
 requireTrue(data(await snapshot(staff,'jobseeker_profile',pa.id),'repeat source').source_hash===original.source_hash,'Unchanged source hash unstable')
 data(await fixture.from('jobseeker_profiles').update({first_name:'ANOTHER-PRIVATE-NAME'}).eq('participant_id',pa.id),'prepare unrelated private edit')
 requireTrue(data(await snapshot(staff,'jobseeker_profile',pa.id),'source after unrelated edit').source_hash===original.source_hash,'Private name changed employment fingerprint')
 data(await fixture.from('jobseeker_profiles').update({previous_occupation:'Bookkeeper'}).eq('participant_id',pa.id),'prepare changed employment history')
 requireTrue(data(await snapshot(staff,'jobseeker_profile',pa.id),'changed historical source').source_hash!==original.source_hash,'Historical source change missed')
 data(await fixture.from('jobseeker_profiles').update({professional_summary:'😀'.repeat(14000)}).eq('participant_id',pa.id),'prepare oversize synthetic source')
 const oversized=await snapshot(staff,'jobseeker_profile',pa.id)
 requireTrue(oversized.error?.code==='22001','Oversize UTF-16 source not rejected')
 data(await fixture.from('jobseeker_profiles').update({professional_summary:'I can use Microsoft Excel.'}).eq('participant_id',pa.id),'restore bounded fixture source')
 const empty=data(await snapshot(admin,'jobseeker_profile',pb.id),'empty source')
 requireTrue(empty.source_text===''&&empty.source_segments.length===0,'Empty source hidden or fabricated')
 for(const table of ['ai_extraction_runs','ai_extraction_suggestions'])requireTrue(data(await staff.client.from(table).select('id').in('entity_id',[pa.id,pb.id,va.id,vb.id]),'read source-only fixture runs').length===0,'Source preview created extraction work')
 checks.push('Live fingerprints change for historical employment only; empty sources remain explicit, oversize Unicode fails without truncation and previews create no runs')
 step='inactive and revoked source sessions'
 data(await fixture.from('profiles').update({is_active:false}).eq('id',admin.id),'deactivate synthetic actor')
 denied(await snapshot(admin,'vacancy',va.id),'inactive actor source access')
 const token=data(await staff.client.auth.getSession(),'capture signed staff source session').session.access_token
 data(await staff.client.auth.signOut({scope:'global'}),'revoke staff source session')
 const revoked=await fetchFor('actor')(expected+'/rest/v1/rpc/get_ai_extraction_source',{method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({p_entity_type:'vacancy',p_entity_id:va.id})})
 requireTrue(!revoked.ok,'Revoked signed session read source')
 checks.push('Deactivated and revoked actual signed PESO sessions cannot read canonical extraction sources')
}catch(error){failed=true;console.error('DEV source extraction '+phase+' failed at '+step+': '+error.message)}

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
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,checks,requests,limitations:['No real Google owner accepted; synthetic source profile preparation uses service fixture maintenance','Source acceptance uses actual signed PESO and other actors with verified TOTP','No provider request, extraction persistence or genuine personal source was used','Structured field omission does not guarantee sensitive text cannot occur in an employment summary']}
 await writeFile(new URL('../../artifacts/extraction-producer-20261014/source-live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
