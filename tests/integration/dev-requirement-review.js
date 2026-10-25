import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_REQUIREMENT_PHASE
if(process.env.EMPLOY_RUN_DEV_REQUIREMENT_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
const aiRuns=[],aiSuggestions=[],skillRecords=[],embeddingRows=[],occupationRecords=[]
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
 const email='dev-requirement-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV requirement fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV requirement '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV requirement regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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
 step='signed requirement actors'
 const owner=await account('employer'),foreign=await account('employer'),staff=await account('staff'),admin=await account('admin')
 const ca=await company(owner,'requirement owner'),cb=await company(foreign,'foreign requirement company'),va=await vacancy(ca,'reviewed requirement vacancy')
 const skill=data(await fixture.from('skills').insert({canonical_name:'Synthetic requirement skill '+run,normalized_name:'synthetic requirement skill '+run}).select('id').single(),'prepare target skill')
 skillRecords.push(skill.id)
 const occupation=data(await fixture.from('occupations').insert({canonical_name:'Synthetic requirement occupation '+run,normalized_name:'synthetic requirement occupation '+run}).select('id').single(),'prepare target occupation')
 occupationRecords.push({...occupation,canonical_name:'Synthetic requirement occupation '+run})
 async function suggestion(type){
  const r=data(await fixture.from('ai_extraction_runs').insert({entity_type:'vacancy',entity_id:va.id,extraction_type:'requirements',provider:'mock',model:'synthetic',input_hash:randomUUID()}).select('id').single(),'fixture requirement run');aiRuns.push(r.id)
  const row=data(await fixture.from('ai_extraction_suggestions').insert({run_id:r.id,entity_type:'vacancy',entity_id:va.id,suggestion_type:type,raw_term:'Synthetic requirement',importance:'review_required',minimum_months:null,provenance:'explicit'}).select('id').single(),'fixture requirement suggestion');aiSuggestions.push(row.id);return row
 }
 const first=await suggestion('skill'),experience=await suggestion('experience_requirement'),invalid=await suggestion('skill')
 const edit=(actor,s,target,priority='required',months=null)=>actor.client.rpc('edit_ai_requirement_suggestion',{p_suggestion_id:s.id,p_edited_term:'Reviewed synthetic requirement',p_edited_canonical_id:target,p_importance:priority,p_minimum_months:months})
 step='MFA and organization boundaries'
 denied(await edit(admin,first,skill.id),'AAL1 requirement edit')
 for(const actor of [owner,foreign,staff,admin])await mfa(actor)
 denied(await edit(foreign,first,skill.id),'foreign employer requirement edit')
 denied(await anonymous.rpc('edit_ai_requirement_suggestion',{p_suggestion_id:first.id,p_edited_term:'forged',p_edited_canonical_id:skill.id,p_importance:'required'}),'anonymous requirement correction')
 checks.push('Actual signed AAL1 and foreign/anonymous actors cannot correct vacancy requirements')
 step='owner priority correction'
 requireTrue(data(await edit(owner,first,skill.id,'preferred'),'owned employer correction').success,'Owner correction did not accept')
 const priority=data(await fixture.from('vacancy_skills').select('importance').eq('vacancy_definition_id',va.id).eq('skill_id',skill.id).single(),'inspect synthetic canonical requirement')
 requireTrue(priority.importance==='preferred','Reviewed priority not persisted')
 const reviewed=data(await admin.client.from('ai_extraction_suggestions').select('importance,review_status,reviewed_by,edited_term').eq('id',first.id).single(),'reviewer attribution')
 requireTrue(reviewed.importance==='preferred'&&reviewed.review_status==='accepted'&&reviewed.reviewed_by===owner.id,'Actual reviewer or priority missing')
 requireTrue(data(await edit(staff,first,skill.id,'required'),'second review').error==='Already reviewed','Second review overwrote first')
 checks.push('Approved owned employer correction persists reviewed priority and actual reviewer; first review wins')
 step='explicit zero minimum experience'
 denied(await edit(staff,experience,occupation.id,'required',null),'unknown experience minimum')
 denied(await edit(staff,experience,occupation.id,'required',-1),'negative experience minimum')
 requireTrue(data(await edit(staff,experience,occupation.id,'required',0),'explicit zero experience correction').success,'Zero experience omitted')
 const months=data(await fixture.from('vacancy_experience_requirements').select('minimum_months,importance').eq('vacancy_definition_id',va.id).eq('occupation_id',occupation.id).single(),'inspect explicit zero requirement')
 requireTrue(months.minimum_months===0&&months.importance==='required','Explicit zero changed or defaulted')
 checks.push('Actual signed staff must confirm a nonnegative whole minimum; explicit zero is retained')
 step='failed target rollback'
 const rejected=data(await edit(admin,invalid,randomUUID(),'preferred'),'invalid target result')
 requireTrue(!!rejected.error,'Invalid target accepted')
 const pending=data(await admin.client.from('ai_extraction_suggestions').select('importance,minimum_months,review_status,edited_term').eq('id',invalid.id).single(),'rollback metadata')
 requireTrue(pending.importance==='review_required'&&pending.minimum_months===null&&pending.review_status==='pending'&&pending.edited_term===null,'Partial review metadata survived failure')
 checks.push('Invalid canonical targets leave requirement details and pending status unchanged')
 // Explicit fixture cleanup for the extra occupation, after dependent requirements.
 data(await fixture.from('vacancy_experience_requirements').delete().eq('vacancy_definition_id',va.id),'clean synthetic experience requirement')

}catch(error){failed=true;console.error('DEV requirement review '+phase+' failed at '+step+': '+error.message)}

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
  for(const occupation of occupationRecords){const stored=data(await fixture.from('occupations').select('canonical_name').eq('id',occupation.id).single(),'verify synthetic occupation cleanup');requireTrue(stored.canonical_name===occupation.canonical_name,'Refusing genuine occupation cleanup');data(await fixture.from('occupations').delete().eq('id',occupation.id).eq('canonical_name',occupation.canonical_name),'delete synthetic occupation')}
  for(const company of companies){const stored=data(await fixture.from('employers').select('company_name,registered_user_id').eq('id',company.id).single(),'verify fixture company cleanup');requireTrue(stored.company_name===company.company_name&&stored.registered_user_id===company.registered_user_id,'Refusing genuine company cleanup');data(await fixture.from('employers').delete().eq('id',company.id).eq('registered_user_id',company.registered_user_id),'delete fixture company')}
  for(const account of accounts){const stored=data(await fixture.auth.admin.getUserById(account.id),'verify fixture user cleanup').user;requireTrue(stored.email===account.email&&stored.user_metadata.test_run===run,'Refusing genuine account cleanup');data(await fixture.auth.admin.deleteUser(account.id),'delete fixture auth user')}
  cleanupComplete=true
 }catch{failed=true;console.error('Synthetic fixture cleanup incomplete; inspect this run before another live test')}
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,checks,requests,limitations:['Ordinary review acceptance uses actual signed users and TOTP; service credentials prepare/inspect/clean synthetic fixtures only','Direct canonical-row fixture inspection is not evidence of broader ordinary read access','No real Google owner, provider request, genuine user change or publication was performed']}
 await writeFile(new URL('../../artifacts/extraction-producer-20261014/requirement-live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
