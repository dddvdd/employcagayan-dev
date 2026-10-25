import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_SKILL_GRAPH_PHASE
if(process.env.EMPLOY_RUN_DEV_SKILL_GRAPH_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
const aiRuns=[],aiSuggestions=[],skillRecords=[],embeddingRows=[]
const occupationRecords=[],sourceRecords=[],relationshipRecords=[]
let graphNodeIDs=[]
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
 const email='dev-skill-graph-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
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
 step='signed graph actors'
 const admin=await account('admin'),staff=await account('staff')
 for(let i=0;i<3;i++){const row=data(await fixture.from('skills').insert({canonical_name:'Synthetic Graph '+run+' '+i,normalized_name:'synthetic graph '+run+' '+i}).select('id').single(),'synthetic graph node');skillRecords.push(row.id)}
 graphNodeIDs=skillRecords.slice().sort();const [a,b,c]=graphNodeIDs
 const source=data(await fixture.from('taxonomy_sources').insert({code:'SYNTHETIC_'+run,name:'Synthetic graph source '+run,version:'v1',is_active:true}).select('id').single(),'synthetic graph source');sourceRecords.push(source.id)
 const insert=kind=>admin.client.from('skill_relationships').insert({source_skill_id:a,target_skill_id:b,relationship_type:kind}).select('id,revision').single()
 requireTrue((await insert('transferable')).error?.code==='42501','AAL1 administrator created graph knowledge')
 await mfa(admin);await mfa(staff)
 requireTrue((await staff.client.from('skill_relationships').insert({source_skill_id:a,target_skill_id:b,relationship_type:'transferable'})).error?.code==='42501','Staff created global skill knowledge')
 const edge=data(await insert('transferable'),'signed administrator draft');relationshipRecords.push(edge.id)
 const args=(id,revision,version='v1',action='approve')=>({p_relationship_id:id,p_expected_revision:revision,p_action:action,p_taxonomy_source_id:source.id,p_source_version:version,p_evidence_reference:'Synthetic graph evidence '+run})
 const history=id=>admin.client.rpc('get_skill_relationship_history',{p_relationship_id:id})
 const read=()=>staff.client.rpc('get_approved_skill_relationships',{p_skill_ids:[a,b,c]})
 requireTrue((await staff.client.rpc('review_skill_relationship',args(edge.id,1))).error?.code==='42501','Staff approved skill knowledge')
 denied(await anonymous.rpc('get_approved_skill_relationships',{p_skill_ids:[a]}),'anonymous graph reader')
 denied(await fixture.rpc('review_skill_relationship',args(edge.id,1)),'service review shortcut')
 requireTrue((await admin.client.from('skill_relationships').update({review_status:'approved'}).eq('id',edge.id)).error?.code==='42501','Administrator forged graph approval')
 requireTrue((await fixture.from('skill_relationships').update({review_status:'approved'}).eq('id',edge.id)).error?.code==='42501','Service forged graph approval')
 checks.push('Actual signed administrator MFA is required for graph creation/review; staff, anonymous, service shortcut and direct approval stamps are denied')
 requireTrue(data(await staff.client.from('skill_relationships').select('id,reviewed_by,evidence_reference').eq('id',edge.id),'private pending graph rows').length===0,'Staff read raw pending curation metadata')
 step='relationship shape constraints'
 for(const values of [{source_skill_id:a,target_skill_id:a,relationship_type:'transferable'},{source_skill_id:b,target_skill_id:a,relationship_type:'related'},{source_skill_id:a,target_skill_id:c,relationship_type:'equivalent'}])requireTrue((await admin.client.from('skill_relationships').insert(values)).error?.code==='23514','Invalid graph shape accepted')
 requireTrue((await insert('transferable')).error?.code==='23505','Duplicate graph edge accepted')
 checks.push('Self edges, reversed related pairs, invented equivalence and duplicate relationships are rejected by actual constraints')
 step='reviewed snapshot and directional evidence'
 requireTrue(data(await read(),'pending graph snapshot').relationships.length===0,'Pending relationship entered reviewed knowledge')
 let approval=data(await admin.client.rpc('review_skill_relationship',args(edge.id,1)),'signed graph approval')
 const snapshot=data(await read(),'reviewed graph snapshot')
 requireTrue(data(await staff.client.from('skill_relationships').select('id,reviewed_by').eq('id',edge.id),'private approved graph rows').length===0,'Staff read raw reviewer metadata')
 const {deriveRelatedSkillEvidence}=await import('../../src/domain/skillRelationshipEvidence.js')
 const profile=id=>({skills:[{skill_id:id,verification_status:'verified'}]}),vacancy=id=>({skills:[{skill_id:id,importance:'required'}]})
 requireTrue(snapshot.relationships.length===1&&!('reviewed_by' in snapshot.relationships[0]),'Graph snapshot missing provenance or exposed reviewer')
 const forward=deriveRelatedSkillEvidence(profile(a),vacancy(b),snapshot),reverse=deriveRelatedSkillEvidence(profile(b),vacancy(a),snapshot)
 requireTrue(forward.hints.length===1&&forward.hints[0].qualification_credit===false&&reverse.hints.length===0,'Directional graph evidence was inverted or granted qualifications')
 const related=data(await insert('related'),'related draft');relationshipRecords.push(related.id)
 data(await admin.client.rpc('review_skill_relationship',args(related.id,1)),'related review')
 requireTrue(deriveRelatedSkillEvidence(profile(b),vacancy(a),data(await read(),'related snapshot')).hints.length===1,'Symmetric related evidence unavailable')
 checks.push('Actual reviewed snapshot feeds traceable forward-only transferable and symmetric related hints without qualification credit')
 step='material changes and stale revisions'
 data(await admin.client.from('skill_relationships').update({target_skill_id:c}).eq('id',edge.id),'edit transfer direction')
 requireTrue((await admin.client.rpc('review_skill_relationship',args(edge.id,approval.revision))).error?.code==='55000','Stale graph review accepted')
 let current=data(await admin.client.from('skill_relationships').select('revision,review_status,reviewed_by').eq('id',edge.id).single(),'edited graph state')
 requireTrue(current.review_status==='pending'&&current.reviewed_by===null,'Graph edit retained approval')
 approval=data(await admin.client.rpc('review_skill_relationship',args(edge.id,current.revision)),'graph rereview')
 const before=data(await read(),'graph before noop');data(await admin.client.from('skill_relationships').update({is_active:true}).eq('id',edge.id),'graph noop')
 requireTrue(data(await read(),'graph after noop').snapshot_hash===before.snapshot_hash,'No-op graph save changed fingerprint')
 checks.push('Material direction edits reset approval, stale revision review fails and no-op saves preserve graph fingerprint')
 step='source versions and inactive references'
 data(await fixture.from('taxonomy_sources').update({version:'v2'}).eq('id',source.id),'synthetic graph version')
 requireTrue(data(await read(),'mismatched graph version').relationships.length===0,'Old graph source version stayed usable')
 requireTrue((await admin.client.rpc('review_skill_relationship',args(edge.id,approval.revision))).error?.code==='55000','Old graph source version approved')
 approval=data(await admin.client.rpc('review_skill_relationship',args(edge.id,approval.revision,'v2')),'review explicit graph v2')
 data(await admin.client.from('skill_relationships').update({is_active:false}).eq('id',edge.id),'archive graph link')
 requireTrue(data(await read(),'archived graph').relationships.length===0,'Archived relationship stayed usable')
 const other=data(await admin.client.from('skill_relationships').select('revision').eq('id',related.id).single(),'related current revision')
 data(await admin.client.rpc('review_skill_relationship',args(related.id,other.revision,'v2')),'related v2 review')
 data(await fixture.from('skills').update({is_active:false}).eq('id',b),'deactivate owned graph node')
 requireTrue(data(await read(),'inactive graph node').relationships.length===0,'Inactive skill stayed in graph')
 data(await fixture.from('skills').update({is_active:true}).eq('id',b),'restore owned graph node')
 checks.push('Source-version mismatch, archive state and inactive skill nodes suppress reviewed graph evidence')
 step='private history and cascade'
 data(await fixture.from('skills').delete().eq('id',a),'delete owned graph parent')
 const records=data(await history(related.id),'graph cascade history');requireTrue(records.at(-1).operation==='DELETE','Graph cascade erased version history')
 denied(await staff.client.rpc('get_skill_relationship_history',{p_relationship_id:related.id}),'staff graph history')
 const page=data(await admin.client.rpc('get_skill_relationship_history',{p_relationship_id:related.id,p_after_revision:records[0].revision,p_limit:2}),'paged graph history');requireTrue(page.length===2&&page[0].revision>records[0].revision,'Graph history cursor failed')
 checks.push('Parent cascade deletion retains administrator-only version history with bounded revision-cursor pages')
}catch(error){failed=true;console.error('DEV skill graph '+phase+' failed at '+step+': '+error.message)}

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
  if(relationshipRecords.length)data(await fixture.from('skill_relationships').delete().in('id',relationshipRecords),'delete synthetic knowledge links')
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
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),phase,run_id:run,passed:!failed,cleanup_complete:cleanupComplete,synthetic_accounts:accounts.length,relationship_records:relationshipRecords,occupation_records:occupationRecords,skill_records:skillRecords,graph_nodes:graphNodeIDs,source_records:sourceRecords,private_history_cleanup_pending:true,checks,requests,limitations:['Service credentials prepare/inspect/clean synthetic fixtures only; ordinary review/read operations use signed actors','Ordinary graph CRUD/read/review acceptance uses actual signed users with real TOTP','No signed Google owner acceptance or genuine source data was used','No new Edge publication or provider request was performed']}
 await writeFile(new URL('../../artifacts/skill-graph-20261015/graph-live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
