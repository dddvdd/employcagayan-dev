import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_CURATION_PHASE
if(process.env.EMPLOY_RUN_DEV_CURATION_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
const aiRuns=[],aiSuggestions=[],skillRecords=[],embeddingRows=[]
const occupationRecords=[],sourceRecords=[],relationshipRecords=[]
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
 const email='dev-curation-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
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
 step='signed knowledge actors'
 const admin=await account('admin'),staff=await account('staff')
 const occupation=data(await fixture.from('occupations').insert({canonical_name:'Synthetic Knowledge '+run,normalized_name:'synthetic knowledge '+run}).select('id').single(),'synthetic occupation');occupationRecords.push(occupation.id)
 const skill=data(await fixture.from('skills').insert({canonical_name:'Synthetic Knowledge Skill '+run,normalized_name:'synthetic knowledge skill '+run}).select('id').single(),'synthetic skill');skillRecords.push(skill.id)
 const source=data(await fixture.from('taxonomy_sources').insert({code:'SYNTHETIC_'+run,name:'Synthetic DEV knowledge '+run,version:'v1',is_active:true}).select('id').single(),'synthetic versioned source');sourceRecords.push(source.id)
 const link=data(await fixture.from('occupation_skills').insert({occupation_id:occupation.id,skill_id:skill.id,source:'synthetic '+run}).select('id,revision').single(),'synthetic link');relationshipRecords.push(link.id)
 const read=actor=>actor.client.rpc('get_approved_occupation_skills',{p_occupation_ids:[occupation.id]})
 const args=(revision,version='v1',action='approve')=>({p_relationship_id:link.id,p_expected_revision:revision,p_action:action,p_taxonomy_source_id:source.id,p_source_version:version,p_evidence_reference:'Synthetic DEV evidence '+run})
 const history=actor=>actor.client.rpc('get_occupation_skill_history',{p_relationship_id:link.id})
 step='authority guards'
 requireTrue((await admin.client.rpc('review_occupation_skill',args(1))).error?.code==='42501','Admin AAL1 approved knowledge')
 await mfa(admin);await mfa(staff)
 requireTrue((await staff.client.rpc('review_occupation_skill',args(1))).error?.code==='42501','Staff approved global knowledge')
 denied(await anonymous.rpc('review_occupation_skill',args(1)),'anonymous review')
 denied(await fixture.rpc('review_occupation_skill',args(1)),'service review shortcut')
 requireTrue((await admin.client.from('occupation_skills').update({review_status:'approved',reviewed_by:admin.id}).eq('id',link.id)).error?.code==='42501','Direct administrator forged approval')
 requireTrue((await fixture.from('occupation_skills').update({review_status:'approved'}).eq('id',link.id)).error?.code==='42501','Direct service forged approval')
 checks.push('Actual AAL1 admin, signed AAL2 staff, anonymous and service approval denied; direct metadata forgery denied even for administrator/service')
 step='actual curation client joins and paging'
 const {createOccupationKnowledgeService}=await import('../../src/services/occupationKnowledgeService.js')
 const curation=createOccupationKnowledgeService({getClient:async()=>admin.client})
 const listed=await curation.list('pending',0),chosen=await curation.get(link.id),sourceOptions=await curation.sources()
 requireTrue(listed.rows.some(r=>r.id===link.id)&&chosen.occupation.canonical_name==='Synthetic Knowledge '+run&&chosen.skill.canonical_name==='Synthetic Knowledge Skill '+run,'Curation embedded reference query failed')
 requireTrue(sourceOptions.some(r=>r.id===source.id&&r.version==='v1')&&(await curation.history(link.id)).length===1,'Curation source/history binding failed')
 checks.push('Actual signed curation client loads pending links, explicit foreign-key names, active source versions and private history')
 step='explicit review'
 requireTrue(data(await read(staff),'pending snapshot').relationships.length===0,'Pending seed was presented as reviewed knowledge')
 const approval=await curation.review({id:link.id,revision:chosen.revision,action:'approve',sourceId:source.id,sourceVersion:'v1',evidence:'Synthetic DEV evidence '+run})
 let revision=approval.revision
 const approved=data(await read(staff),'approved canonical snapshot')
 requireTrue(approved.relationships.length===1&&approved.relationships[0].source_version==='v1'&&!('reviewed_by' in approved.relationships[0]),'Reviewed snapshot provenance/privacy failed')
 const audit=data(await history(admin),'signed history')
 requireTrue(audit.at(-1).snapshot.reviewed_by===admin.id&&audit[0].operation==='INSERT','History lacks real reviewer/creation version')
 denied(await history(staff),'staff private history')
 checks.push('Actual signed administrator review binds explicit source version and evidence; caller snapshot contains no reviewer identity; staff cannot retrieve history')
 step='material changes and CAS'
 data(await admin.client.from('occupation_skills').update({importance:null}).eq('id',link.id),'no-op link save')
 requireTrue(data(await read(staff),'no-op snapshot').snapshot_hash===approved.snapshot_hash,'No-op changed knowledge fingerprint')
 data(await admin.client.from('occupation_skills').update({importance:4}).eq('id',link.id),'material link edit')
 requireTrue(data(await read(staff),'edited snapshot').relationships.length===0,'Material edit retained approval')
 requireTrue((await admin.client.rpc('review_occupation_skill',args(revision))).error?.code==='55000','Stale revision overwrote review')
 revision=data(await admin.client.from('occupation_skills').select('revision').eq('id',link.id).single(),'edited revision').revision
 revision=data(await admin.client.rpc('review_occupation_skill',args(revision)),'fresh rereview').revision
 checks.push('No-op save preserves fingerprint, material edit resets approval and stale review fails 55000 before a fresh signed rereview')
 step='source-version and inactive gates'
 data(await fixture.from('taxonomy_sources').update({version:'v2'}).eq('id',source.id),'synthetic source new version')
 requireTrue(data(await read(staff),'version mismatch').relationships.length===0,'Old source version stayed usable')
 requireTrue((await admin.client.rpc('review_occupation_skill',args(revision,'v1'))).error?.code==='55000','Old source version approved')
 revision=data(await admin.client.rpc('review_occupation_skill',args(revision,'v2')),'explicit v2 rereview').revision
 for(const [table,id] of [['taxonomy_sources',source.id],['occupations',occupation.id],['skills',skill.id]]){
  data(await fixture.from(table).update({is_active:false}).eq('id',id),'deactivate owned synthetic reference')
  requireTrue(data(await read(staff),'inactive reference snapshot').relationships.length===0,'Inactive '+table+' stayed usable')
  data(await fixture.from(table).update({is_active:true}).eq('id',id),'restore synthetic reference')
 }
 requireTrue(data(await read(staff),'restored active snapshot').relationships.length===1,'Active reviewed references did not recover')
 checks.push('Source-version change suppresses old approval until explicit rereview; inactive source/occupation/skill all suppress snapshot entries')
 step='deletion and paged private history'
 data(await admin.client.from('occupation_skills').delete().eq('id',link.id),'signed relationship deletion')
 const deleted=data(await history(admin),'history after deletion');requireTrue(deleted.at(-1).operation==='DELETE','Deletion erased version evidence')
 const first=data(await admin.client.rpc('get_occupation_skill_history',{p_relationship_id:link.id,p_after_revision:0,p_limit:2}),'first history page')
 const second=data(await admin.client.rpc('get_occupation_skill_history',{p_relationship_id:link.id,p_after_revision:first.at(-1).revision,p_limit:2}),'second history page')
 requireTrue(first.length===2&&second[0].revision>first.at(-1).revision,'History pages overlap or lost cursor')
 checks.push('Actual administrator deletion preserves history, which supports bounded revision-cursor pagination')
}catch(error){failed=true;console.error('DEV knowledge '+phase+' failed at '+step+': '+error.message)}

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
  if(relationshipRecords.length)data(await fixture.from('occupation_skills').delete().in('id',relationshipRecords),'delete synthetic knowledge links')
  if(occupationRecords.length)data(await fixture.from('occupations').delete().in('id',occupationRecords),'delete synthetic occupations')
  if(sourceRecords.length)data(await fixture.from('taxonomy_sources').delete().in('id',sourceRecords),'delete synthetic taxonomy sources')
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
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,relationship_records:relationshipRecords,occupation_records:occupationRecords,skill_records:skillRecords,private_history_cleanup_pending:true,checks,requests,limitations:['Service credentials prepare/inspect/clean synthetic fixtures only; ordinary review/read operations use signed actors','Ordinary start/read/human review acceptance uses actual signed users with real TOTP','No signed Google owner acceptance or genuine source data was used','No new Edge publication or provider request was performed']}
 await writeFile(new URL('../../artifacts/occupation-curation-20261015/curation-live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
