import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_OUTCOME_PHASE
if(process.env.EMPLOY_RUN_DEV_OUTCOME_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
const aiRuns=[],aiSuggestions=[],skillRecords=[],embeddingRows=[],reviewDictionaries=[],interviewRows=[],outcomeRows=[]
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
 const email='dev-outcome-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV outcome fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV outcome '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV outcome regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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

 step='ordinary outcome preparation'
 const extraOffering=await offering(ta,vb)
 const wrongApp=await application(pa,vb,ea,extraOffering)
 const eventAppB=await application(pb,vb,eb,ob)
 const payload={p_registrant_id:ea.id,p_event_id:ta.id,p_employer_id:ca.id,p_vacancy_definition_id:va.id,p_status:'qualified',p_application_id:eventApp.id,p_interview_notes:'Synthetic private interview note'}
 denied(await staff.client.rpc('record_interview_result',payload),'existing AAL1 interview denial')
 checks.push('Existing signed AAL1 interview denial is preserved')
 for(const actor of roster)await mfa(actor)
 if(phase==='baseline'){
  step='mismatched RPC application link'
  const bad=data(await staff.client.rpc('record_interview_result',{...payload,p_application_id:wrongApp.id}),'baseline wrong application');interviewRows.push(bad.id)
  requireTrue(bad.application_id===wrongApp.id&&bad.vacancy_definition_id===va.id,'RPC mismatch not reproduced')
  checks.push('Signed staff linked another company/position application to an interview at the same event')
  step='forged direct interview references'
  const direct=data(await staff.client.from('interview_logs').insert({registrant_id:ea.id,event_id:tb.id,interviewer_id:staff.id,position:'Synthetic forged label',company:'Synthetic forged company',interview_status:'near_hire',employer_id:cb.id,vacancy_definition_id:vb.id}).select('id').single(),'baseline direct forged references');interviewRows.push(direct.id)
  checks.push('Signed direct staff insertion accepted a participation from another event with contradictory labels/references')
  step='canonical staff outcome access'
  const blocked=await staff.client.from('employment_outcomes').insert({application_id:eventApp.id,outcome:'hired',employer_id:ca.id}).select('id')
  requireTrue(!!blocked.error,'Legacy staff outcome denial not reproduced')
  checks.push('Signed staff could not record an outcome for a valid canonical event application')
  step='client-chosen outcome reviewer'
  const forged=data(await admin.client.from('employment_outcomes').insert({application_id:eventApp.id,outcome:'hired',employer_id:ca.id,verified_by:staff.id,verification_date:new Date().toISOString()}).select('id,verified_by').single(),'baseline reviewer spoof');outcomeRows.push(forged.id)
  requireTrue(forged.verified_by===staff.id,'Reviewer forgery not reproduced')
  checks.push('Signed administrator outcome persisted a client-selected different verifier')
 }else{
  step='canonical interview authorization'
  denied(await staff.client.rpc('record_interview_result',{...payload,p_application_id:wrongApp.id}),'mismatched application interview')
  denied(await staff.client.from('interview_logs').insert({registrant_id:ea.id,event_id:tb.id,interviewer_id:staff.id,position:'Forged',company:'Forged',interview_status:'qualified',employer_id:cb.id,vacancy_definition_id:vb.id}),'direct forged references')
  const valid=data(await staff.client.rpc('record_interview_result',payload),'valid linked interview');interviewRows.push(valid.id)
  requireTrue(valid.application_id===eventApp.id&&valid.interviewer_id===staff.id&&valid.company===ca.company_name,'Valid interview lost canonical identity')
  denied(await staff.client.rpc('record_interview_result',payload),'duplicate interview')
  const manual=data(await staff.client.rpc('record_interview_result',{...payload,p_status:'near_hire',p_application_id:null}),'unlinked manual interview');interviewRows.push(manual.id)
  denied(await employerA.client.rpc('record_interview_result',payload),'employer interview writer')
  denied(await municipal.client.rpc('record_interview_result',payload),'supervisor interview writer')
  denied(await candidateA.client.rpc('record_interview_result',payload),'password candidate interview writer')
  denied(await anonymous.rpc('record_interview_result',payload),'anonymous interview writer')
  checks.push('Valid linked/unlinked staff interviews persist; wrong company/event, duplicates and unauthorized roles are denied')
  step='canonical outcomes and attribution'
  const outcome=data(await staff.client.from('employment_outcomes').insert({application_id:eventApp.id,outcome:'hired',employer_id:ca.id,verified_by:admin.id,verification_date:'2000-01-01T00:00:00Z'}).select('id,verified_by,verification_date').single(),'canonical staff outcome');outcomeRows.push(outcome.id)
  requireTrue(outcome.verified_by===staff.id&&outcome.verification_date!=='2000-01-01T00:00:00+00:00','Actual outcome reviewer not stamped')
  const noop=data(await admin.client.from('employment_outcomes').update({verified_by:admin.id,verification_date:new Date().toISOString()}).eq('id',outcome.id).select('verified_by,verification_date').single(),'no-op attribution')
  requireTrue(noop.verified_by===staff.id&&noop.verification_date===outcome.verification_date,'No-op changed attribution')
  const changed=data(await admin.client.from('employment_outcomes').update({verification_notes:'Synthetic material note',verified_by:staff.id}).eq('id',outcome.id).select('verified_by').single(),'actual administrator update')
  requireTrue(changed.verified_by===admin.id,'Material update retained forged reviewer')
  denied(await staff.client.from('employment_outcomes').insert({application_id:eventApp.id,outcome:'hired',employer_id:cb.id}),'wrong outcome company')
  denied(await employerA.client.from('employment_outcomes').select('id').eq('id',outcome.id),'employer outcome read')
  checks.push('Canonical staff outcomes work; actual reviewer is stamped, no-ops preserve attribution and contradictory company references fail')
  step='municipal and provincial outcome scope'
  denied(await municipal.client.from('employment_outcomes').select('id').eq('id',outcome.id),'foreign municipal outcome read')
  denied(await municipal.client.from('employment_outcomes').insert({application_id:eventApp.id,outcome:'pending'}),'foreign municipal outcome write')
  const scoped=data(await municipal.client.from('employment_outcomes').insert({application_id:eventAppB.id,outcome:'pending'}).select('id,verified_by,verification_date').single(),'in-scope municipal outcome')
  outcomeRows.push(scoped.id)
  const provincialRead=data(await provincial.client.from('employment_outcomes').select('id').eq('id',outcome.id),'provincial oversight');requireTrue(provincialRead.length===1,'Provincial scope lost')
  checks.push('Municipal outcomes remain in event jurisdiction and provincial oversight remains available')
  step='private status-only audit'
  const audit=data(await admin.client.from('audit_logs').select('table_name,new_data').eq('action','employment_record_changed').in('record_id',[valid.id,manual.id,outcome.id]),'private employment audit')
  requireTrue(audit.length>=3&&audit.every(row=>Object.keys(row.new_data).join(',')===(row.table_name==='interview_logs'?'interview_status':'outcome')),'Audit included private details or omitted records')
  denied(await employerA.client.from('audit_logs').select('id').eq('record_id',valid.id),'employer employment audit')
  checks.push('Employment audit records statuses without notes, salaries or names and remains private')
  step='historical nullable application reference'
  data(await admin.client.from('vacancy_definitions').update({is_active:false}).eq('id',va.id).select('id').single(),'deactivate synthetic historical position')
  const protectedDelete=await admin.client.from('applications').delete().eq('id',eventApp.id).select('id')
  requireTrue(protectedDelete.error?.code==='42501','Established authenticated application DELETE denial was lost')
  // Privileged maintenance/cleanup is explicitly a fixture operation, not ordinary acceptance.
  data(await fixture.from('applications').delete().eq('id',eventApp.id).select('id').single(),'fixture maintenance deletes its synthetic historical application')
  const historic=data(await admin.client.from('interview_logs').select('application_id,company,position').eq('id',valid.id).single(),'historical interview snapshot')
  requireTrue(historic.application_id===null&&historic.company===ca.company_name,'Nullable application clearing lost the historical snapshot')
  checks.push('Existing ordinary application DELETE denial is preserved; synthetic fixture maintenance clears the nullable link and retains the historical interview snapshot')
  step='revoked staff interview session'
  const captured=data(await staff.client.auth.getSession(),'capture staff token').session.access_token
  data(await staff.client.auth.signOut({scope:'global'}),'revoke staff token')
  const revoked=await fetchFor('actor')(expected+'/rest/v1/rpc/record_interview_result',{method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+captured,'content-type':'application/json'},body:JSON.stringify({...payload,p_registrant_id:eb.id,p_event_id:tb.id,p_employer_id:cb.id,p_vacancy_definition_id:vb.id,p_application_id:null,p_status:'hots'})})
  requireTrue([401,403].includes(revoked.status),'Revoked staff session was not denied by the authorization boundary')
  checks.push('Revoked signed staff session cannot record an interview')
 }
}catch(error){failed=true;console.error('DEV outcome '+phase+' failed at '+step+': '+error.message)}
finally{
 step='fixture cleanup'
 try {
  const fixtureIds=participants.map(row=>row.id),vacancyIds=vacancies.map(row=>row.id)
  if(interviewRows.length)data(await fixture.from('interview_logs').delete().in('id',interviewRows),'delete synthetic interview records')
  if(outcomeRows.length)data(await fixture.from('employment_outcomes').delete().in('id',outcomeRows),'delete synthetic outcome records')
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

  if(fixtureIds.length){
   data(await fixture.from('jobseeker_occupation_preferences').delete().in('jobseeker_profile_id',fixtureIds),'delete synthetic occupation preferences')
   data(await fixture.from('jobseeker_industry_preferences').delete().in('jobseeker_profile_id',fixtureIds),'delete synthetic industry preferences')
  }
  for(const row of reviewDictionaries)data(await fixture.from(row.table).delete().eq('id',row.id),'delete synthetic review dictionary')
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
 await writeFile(new URL('../../artifacts/outcome-security-20261014/live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
