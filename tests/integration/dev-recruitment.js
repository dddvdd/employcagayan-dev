import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
const phase=process.env.EMPLOY_RECRUITMENT_PHASE
if(process.env.EMPLOY_RUN_DEV_RECRUITMENT_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV-only opt-in and phase required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture connection mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(service&&(service.role!=='service_role'||service.ref!==ref))throw Error('Fixture credential project mismatch')
const run=randomUUID(),accounts=[],companies=[],vacancies=[],events=[],offerings=[],participants=[],participations=[],files=[],checks=[],requests=[]
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
 const email='dev-recruitment-'+run+'-'+accounts.length+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
 const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run,role:'admin',full_name:'Synthetic DEV recruitment fixture'}}),'create fixture').user
 accounts.push({id:user.id,email})
 const initial=data(await fixture.from('profiles').select('role').eq('id',user.id).single(),'signup role')
 requireTrue(initial.role==='applicant','Signup metadata granted authority')
 data(await fixture.from('profiles').update({role,...extra}).eq('id',user.id),'fixture role assignment')
 const actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed password login')
 return {id:user.id,client:actor}
}
async function mfa(actor){
 const factor=data(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV recruitment '+run}),'enroll factor')
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
 const row=data(await fixture.from('vacancy_definitions').insert({employer_id:company.id,company_name:company.company_name,position:'Synthetic DEV '+run+' '+label,job_description:'Synthetic DEV recruitment regression fixture, never a real job opening.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'published',published_at:new Date().toISOString()}).select('id,employer_id').single(),'fixture vacancy')
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
 data(await fixture.from('jobseeker_profiles').insert({participant_id:parent.id,first_name:'Synthetic',last_name:'DEV '+run,email:'fixture@example.invalid',birthdate:'2000-01-01',data_subject_rights_agreed:true,resume_path:path}),'fixture profile')
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
 step='signed AAL1 authorization'
 if(phase==='verify'){
  denied(await employerA.client.rpc('list_employer_applications',{p_vacancy_definition_id:va.id}),'AAL1 employer inbox')
  denied(await admin.client.from('applications').select('id').eq('id',aa.id),'AAL1 administrator')
  denied(await municipal.client.storage.from('resumes').download(pb.path),'AAL1 supervisor file')
  checks.push('Mandatory partner AAL1 data access denied')
 }
 for(const actor of roster)await mfa(actor)
 if(phase==='baseline'){
  step='live baseline unapproved legacy contact'
  const contact=data(await pending.client.rpc('get_employer_applicants',{p_event_vacancy_id:oc.id}),'legacy pending contact baseline')
  requireTrue(contact.some(row=>row.id===ea.id&&row.email==='fixture@example.invalid'),'Legacy pending leak was not reproduced')
  checks.push('Reproduced contact disclosure to a signed pending employer with TOTP')
  step='live baseline password candidate submission'
  const created=data(await candidateA.client.rpc('submit_application',{p_vacancy_definition_id:vb.id}),'password candidate submission baseline')
  requireTrue(['created','existing'].includes(created.status),'Password candidate bypass was not reproduced')
  checks.push('Reproduced signed password candidate application despite Google-only policy')
  step='live baseline municipal resume exposure'
  await download(municipal,pa.path,'out-of-jurisdiction resume baseline')
  checks.push('Reproduced signed municipal supervisor reading out-of-jurisdiction PDF bytes')
 }else{
  step='approved organization application access'
  const own=data(await employerA.client.rpc('list_employer_applications',{p_vacancy_definition_id:va.id}),'own company inbox')
  requireTrue(own.some(row=>row.application_id===aa.id&&row.resume_path===pa.path),'Owned application/resume missing')
  requireTrue(own.every(row=>row.vacancy_definition_id===va.id&&row.participant_id===pa.id),'Inbox included another organization')
  denied(await employerA.client.rpc('list_employer_applications',{p_vacancy_definition_id:vb.id}),'other company inbox')
  denied(await employerA.client.from('applications').select('id').eq('id',ab.id),'other company application')
  denied(await employerA.client.rpc('update_application_status',{p_application_id:ab.id,p_new_status:'rejected'}),'other company status')
  denied(await employerA.client.from('vacancy_definitions').update({position:'forged other vacancy'}).eq('id',vb.id).select('id'),'other company vacancy update')
  denied(await employerA.client.from('vacancy_definitions').update({employer_id:cb.id}).eq('id',va.id).select('id'),'vacancy organization reassignment')
  denied(await employerA.client.from('profiles').update({role:'staff'}).eq('id',employerA.id).select('id'),'employer staff impersonation')
  denied(await employerA.client.rpc('admin_reject_employer',{p_employer_id:cb.id,p_reason:'synthetic'}),'privileged administrator RPC')
  data(await employerA.client.rpc('update_application_status',{p_application_id:aa.id,p_new_status:'shortlisted'}),'owned shortlist')
  denied(await employerA.client.rpc('update_application_status',{p_application_id:aa.id,p_new_status:'applied'}),'forbidden status reversal')
  checks.push('Owned employer review works; other organization reads/writes, ID reassignment, role impersonation and invalid status transitions denied')
  step='private resume bytes and storage manipulation'
  await download(employerA,pa.path,'owned applicant PDF')
  await download(employerB,pb.path,'second company applicant PDF')
  denied(await employerA.client.storage.from('resumes').download(pb.path),'foreign applicant PDF')
  denied(await pending.client.storage.from('resumes').download(pa.path),'pending employer PDF')
  denied(await pending.client.rpc('get_employer_applicants',{p_event_vacancy_id:oc.id}),'pending legacy contacts')
  denied(await pending.client.from('employers').update({registration_status:'approved'}).eq('id',cc.id).select('id'),'pending self approval')
  const removed=data(await employerA.client.storage.from('resumes').remove([pb.path]),'foreign deletion response')
  requireTrue(Array.isArray(removed)&&removed.length===0,'Foreign delete mutated a file')
  await download(employerB,pb.path,'foreign PDF remains after delete attempt')
  denied(await employerA.client.storage.from('resumes').update(pb.path,bytes,{contentType:'application/pdf',cacheControl:'0'}),'foreign file replacement')
  const attemptedForeignPath=candidateB.id+'/'+randomUUID()+'.pdf';files.push(attemptedForeignPath)
  denied(await employerA.client.storage.from('resumes').upload(attemptedForeignPath,bytes,{contentType:'application/pdf',cacheControl:'0'}),'foreign namespace upload')
  const publicRead=await fetchFor('anonymous')(expected+'/storage/v1/object/public/resumes/'+pa.path)
  requireTrue(!publicRead.ok,'Private bucket served public bytes')
  denied(await anonymous.storage.from('resumes').download(pa.path),'anonymous authenticated file endpoint')
  checks.push('Private bytes require the approved recruitment relationship; foreign mutation, unapproved and anonymous access denied')
  step='PESO geographic scope and oversight'
  await download(municipal,pb.path,'municipal in-scope PDF')
  denied(await municipal.client.storage.from('resumes').download(pa.path),'municipal out-of-scope PDF')
  denied(await municipal.client.from('jobseeker_profiles').select('participant_id').eq('participant_id',pa.id),'municipal out-of-scope profile')
  denied(await municipal.client.from('participants').select('id').eq('id',pa.id),'municipal out-of-scope participant')
  await download(provincial,pa.path,'provincial oversight PDF')
  await download(staff,pa.path,'staff oversight PDF')
  await download(admin,pa.path,'administrator oversight PDF')
  denied(await municipal.client.rpc('submit_event_application',{p_event_participation_id:ea.id,p_event_vacancy_id:oa.id}),'municipal out-of-scope event submission')
  data(await staff.client.rpc('submit_event_application',{p_event_participation_id:ea.id,p_event_vacancy_id:oa.id}),'authorized staff existing event application')
  checks.push('Municipal access stays in jurisdiction; established provincial/staff/admin oversight and scoped event coordination work')
  step='Google-only caller and identity validation'
  for(const name of ['submit_application','list_my_applications','withdraw_application']){
   const args=name==='submit_application'?{p_vacancy_definition_id:va.id}:name==='withdraw_application'?{p_application_id:aa.id}:{}
   denied(await candidateA.client.rpc(name,args),'password candidate '+name)
  }
  denied(await candidateA.client.from('applications').select('id').eq('id',aa.id),'password candidate direct history')
  denied(await candidateB.client.from('applications').select('id').eq('id',aa.id),'other password account application')
  denied(await candidateA.client.rpc('set_jobseeker_resume',{p_resume_path:pb.path,p_previous_path:pa.path}),'password/foreign resume pointer')
  denied(await admin.client.from('jobseeker_profiles').update({resume_path:pb.path}).eq('participant_id',pa.id),'foreign document reference even for authorized administrator')
  checks.push('Password candidate channel cannot bypass Google-only access; invalid cross-owner document references rejected')
  step='withdrawal revokes fresh recruitment document access'
  const withdrawn=data(await fixture.from('applications').update({application_status:'withdrawn'}).in('id',[aa.id,eventApp.id]).select('id,application_status'),'fixture withdrawal state')
  requireTrue(withdrawn.length===2&&withdrawn.every(row=>row.application_status==='withdrawn'),'Withdrawal state was not persisted')
  denied(await employerA.client.storage.from('resumes').download(pa.path,{}, {cache:'no-store'}),'immediate persisted-withdrawal PDF')
  const afterWithdrawal=data(await employerA.client.rpc('list_employer_applications',{p_vacancy_definition_id:va.id}),'inbox after withdrawal')
  requireTrue(afterWithdrawal.every(row=>row.resume_path===null),'Withdrawn inbox still authorizes resume')
  const token=data(await employerA.client.auth.getSession(),'capture authorized employer session').session.access_token
  const probe=await fetchFor('actor')(expected+'/storage/v1/object/resumes/'+pa.path,{headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'cache-control':'no-cache, no-store'},cache:'no-store'})
  checks.push('Withdrawal probe: '+JSON.stringify({status:probe.status,cache_control:probe.headers.get('cache-control'),cache:probe.headers.get('cf-cache-status'),age:probe.headers.get('age')}))
  await probe.arrayBuffer()
  const freshProbe=await fetchFor('actor')(expected+'/storage/v1/object/resumes/'+pa.path+'?authorization_check='+randomUUID(),{headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'cache-control':'no-cache, no-store'},cache:'no-store'})
  checks.push('Unique request probe: '+JSON.stringify({status:freshProbe.status,cache:freshProbe.headers.get('cf-cache-status')}))
  await freshProbe.arrayBuffer()
  denied(await employerA.client.storage.from('resumes').download(pa.path),'withdrawn applicant PDF')
  denied(await employerA.client.storage.from('resumes').createSignedUrl(pa.path,60),'withdrawn applicant signing')
  checks.push('No active application means fresh authenticated reads and signing fail')
  step='signed URL expiration and upload restrictions'
  const signed=data(await admin.client.storage.from('resumes').createSignedUrl(pa.path,2),'authorized synthetic signing')
  const url=new URL(signed.signedUrl)
  requireTrue(url.origin===expected,'Signed asset target mismatch')
  const cap=claims(url.searchParams.get('token'));requireTrue(cap&&cap.exp-cap.iat<=2,'Signed expiry exceeds requested duration')
  const capBefore=await fetchFor('signed')(url);requireTrue(capBefore.ok,'Authorized synthetic capability not usable')
  await capBefore.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,3200))
  const capAfter=await fetchFor('signed')(url);requireTrue(!capAfter.ok,'Expired capability still served bytes for no-cache fixture')
  const invalidPath=admin.id+'/'+randomUUID()+'.pdf';files.push(invalidPath)
  denied(await admin.client.storage.from('resumes').upload(invalidPath,Buffer.from('not PDF'),{contentType:'text/plain',cacheControl:'0'}),'unsupported MIME upload')
  denied(await admin.client.storage.from('resumes').upload(invalidPath,Buffer.alloc(5242881),{contentType:'application/pdf',cacheControl:'0'}),'oversized PDF upload')
  checks.push('Synthetic signed URL expires under no-cache fixture conditions; bucket MIME and 5 MB limits enforced')
  step='logout invalidates document authorization'
  const stale=data(await staff.client.auth.getSession(),'capture signed staff token').session.access_token
  data(await staff.client.auth.signOut({scope:'global'}),'staff global logout')
  const staleRead=await fetchFor('actor')(expected+'/storage/v1/object/resumes/'+pa.path,{headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+stale}})
  requireTrue(!staleRead.ok,'Revoked signed staff session still read private PDF')
  checks.push('Previously signed staff token cannot read private files after global logout')
 }
}catch(error){failed=true;console.error('DEV recruitment '+phase+' failed at '+step+': '+error.message)}
finally{
 step='fixture cleanup'
 try {
  const fixtureIds=participants.map(row=>row.id),vacancyIds=vacancies.map(row=>row.id)
  if(vacancyIds.length){
   const associated=data(await fixture.from('applications').select('id,participant_id').in('vacancy_definition_id',vacancyIds),'inspect cleanup associations')
   requireTrue(associated.every(row=>fixtureIds.includes(row.participant_id)),'Cleanup refused non-fixture recruitment association')
   if(associated.length)data(await fixture.from('applications').delete().in('id',associated.map(row=>row.id)),'delete fixture applications')
  }
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
 await writeFile(new URL('../../artifacts/recruitment-milestone-20261013/live-'+phase+'-results.json',import.meta.url),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify({passed:!failed,phase,checks:checks.length,requests:requests.length,synthetic_accounts:accounts.length,cleanup_complete:cleanupComplete}))
 process.exitCode=failed?1:0
}
