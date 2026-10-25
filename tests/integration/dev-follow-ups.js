import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',phase=process.env.EMPLOY_FOLLOW_UP_PHASE
if(process.env.EMPLOY_VERIFIED_DEV_URL!==expected||process.env.EMPLOY_RUN_FOLLOW_UP_TESTS!=='1'||!['baseline','verify'].includes(phase))throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const claims=t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'))}catch{return null}}
const service=claims(env.SUPABASE_SERVICE_ROLE_KEY);if(service&&(service.role!=='service_role'||service.ref!=='cdmkzzmaswwiryymtycn'))throw Error('Fixture credential mismatch')
const run=randomUUID(),accounts=[],actors=[],cases=[],ids=[],requests=[],checks=[]
let company,event,passed=false,cleanup=false,step='configuration'
const ok=(v,label)=>{if(!v)throw Error(label)},data=(r,label)=>{ok(!r.error,label+' ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
const client=(mode,index,token=null)=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{...(token?{headers:{Authorization:'Bearer '+token}}:{}),fetch:async(input,init)=>{
 const u=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 ok(u.origin===expected&&u.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(headers.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&u.pathname.startsWith('/rest/'))ok(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===accounts[index]?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed fixture actor required')
 const r=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,path:u.pathname,method:init?.method||'GET',status:r.status});return r
}}})
const fixture=client('fixture'),anonymous=client('anonymous')
const insert=async(table,record)=>{const row=data(await fixture.from(table).insert(record).select().single(),'prepare '+table);if(row.id)ids.push(row.id);return row}
const reject=async(promise,code)=>{const r=await promise;ok(r.error?.code===code,'Expected '+code+', got '+(r.error?.code||'success'))}
const enroll=async index=>{
 const actor=client('actor',index);actors.push(actor)
 data(await actor.auth.signInWithPassword({email:accounts[index].email,password:accounts[index].password}),'actual password login')
 await reject(actor.from('follow_ups').select('id').eq('id',cases[0].followup.id),'42501')
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic follow-up acceptance'}),'TOTP enrollment')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'TOTP challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'actual TOTP verification')
 const token=data(await actor.auth.getSession(),'AAL2 session').session.access_token
 ok(claims(token)?.aal==='aal2','Actual AAL2 required');return {actor,token}
}
try{
 step='prepare isolated accounts and canonical cases'
 for(const role of ['admin','staff','supervisor']){
  const email='dev-followup-'+run+'-'+role+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
  const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'fixture Auth user').user
  accounts.push({id:user.id,email,password});ids.push(user.id)
  data(await fixture.from('profiles').update({role,...(role==='supervisor'?{jurisdiction:'Solana',is_provincial:false}:{})}).eq('id',user.id),'fixture canonical role')
 }
 company=await insert('employers',{company_name:'Synthetic follow-up '+run,registration_status:'approved',is_active:true})
 event=await insert('events',{event_name:'Synthetic follow-up '+run,event_date:new Date().toISOString().slice(0,10),location:'Tuguegarao City',status:'ongoing'})
 for(let i=0;i<2;i++){
  const c={};cases.push(c)
  c.participant=await insert('participants',{})
  c.profile=await insert('jobseeker_profiles',{participant_id:c.participant.id,first_name:'Synthetic',last_name:run,email:'followup-'+run+'-'+i+'@example.invalid',birthdate:'2000-01-01',data_subject_rights_agreed:true})
  c.registration=await insert('event_participations',{participant_id:c.participant.id,event_id:event.id,check_in_status:'checked_in',check_in_time:new Date().toISOString()})
  c.definition=await insert('vacancy_definitions',{employer_id:company.id,company_name:company.company_name,position:'Synthetic follow-up '+run+' '+i,is_active:true})
  c.offering=await insert('event_vacancies',{event_id:event.id,vacancy_definition_id:c.definition.id})
  c.application=await insert('applications',{participant_id:c.participant.id,vacancy_definition_id:c.definition.id,registrant_id:c.registration.id,event_vacancy_id:c.offering.id,source:'event',application_status:'applied'})
  c.outcome=await insert('employment_outcomes',{application_id:c.application.id,employer_id:company.id,outcome:'hired'})
  c.followup=await insert('follow_ups',{employment_outcome_id:c.outcome.id,follow_up_type:'30_day'})
 }
 const admin=await enroll(0),staff=await enroll(1),sup=await enroll(2),first=cases[0],other=cases[1]
 checks.push('Actual password AAL1 requests denied; administrator/staff/supervisor acceptance uses signed TOTP AAL2 sessions')
 step='canonical staff case access'
 ok(data(await staff.actor.from('employment_outcomes').select('id').eq('id',first.outcome.id),'staff canonical outcome').length===1,'Canonical outcome inaccessible')
 const rows=data(await staff.actor.from('follow_ups').select('id').eq('id',first.followup.id),'staff follow-up read')
 if(phase==='baseline'){
  ok(rows.length===0,'Baseline legacy-scope defect not reproduced')
  await reject(staff.actor.from('follow_ups').insert({employment_outcome_id:first.outcome.id,follow_up_type:'60_day'}),'42501')
  data(await admin.actor.from('follow_ups').update({employment_outcome_id:other.outcome.id}).eq('id',first.followup.id).select().single(),'baseline case reassignment')
  await reject(admin.actor.from('follow_ups').update({completed_date:''}).eq('id',first.followup.id),'22007')
  checks.push('Actual staff can read the canonical outcome but cannot read/create its follow-up; administrator can reassign that follow-up; empty date fails')
 }else{
  ok(rows.length===1,'Canonical follow-up remains hidden')
  const added=data(await staff.actor.from('follow_ups').insert({employment_outcome_id:first.outcome.id,follow_up_type:'60_day'}).select().single(),'actual staff follow-up insert');ids.push(added.id)
  const saved=data(await staff.actor.from('follow_ups').update({status:'unreachable',completed_date:null,still_employed:false,remarks:'Synthetic private working note'}).eq('id',first.followup.id).select().single(),'actual staff follow-up edit')
  ok(saved.completed_date===null&&saved.still_employed===false&&saved.status==='unreachable','Unknown date or explicit negative changed')
  await reject(admin.actor.from('follow_ups').update({employment_outcome_id:other.outcome.id}).eq('id',first.followup.id),'23514')
  await reject(admin.actor.from('follow_ups').update({id:randomUUID()}).eq('id',first.followup.id),'23514')
  await reject(admin.actor.from('follow_ups').update({created_at:'2000-01-01T00:00:00Z'}).eq('id',first.followup.id),'23514')
  checks.push('Actual staff can read/create/update canonical follow-ups; null date and false answers survive; administrator cannot change the case, record ID or creation provenance')
  step='municipal and provincial scope'
  ok(!data(await sup.actor.from('follow_ups').select('id').eq('id',first.followup.id),'outside municipal read').length,'Outside supervisor read allowed')
  ok(!data(await sup.actor.from('follow_ups').update({status:'completed'}).eq('id',first.followup.id).select('id'),'outside municipal update').length,'Outside supervisor update allowed')
  await reject(sup.actor.from('follow_ups').insert({employment_outcome_id:first.outcome.id,follow_up_type:'90_day'}),'42501')
  data(await fixture.from('profiles').update({jurisdiction:'Tuguegarao City'}).eq('id',accounts[2].id),'fixture matching jurisdiction')
  data(await sup.actor.from('follow_ups').update({status:'completed',completed_date:'2026-10-16'}).eq('id',first.followup.id).select().single(),'matching municipal update')
  data(await fixture.from('profiles').update({jurisdiction:'Solana',is_provincial:true}).eq('id',accounts[2].id),'fixture provincial scope')
  ok(data(await sup.actor.from('follow_ups').select('id').eq('id',other.followup.id),'provincial read').length===1,'Provincial access lost')
  const audit=data(await fixture.from('audit_logs').select('user_id,old_data,new_data').eq('action','follow_up_changed').eq('record_id',first.followup.id),'actual follow-up audit')
  ok(audit.length===2&&audit.some(r=>r.user_id===accounts[1].id)&&audit.some(r=>r.user_id===accounts[2].id),'Actual reviewer audit missing')
  for(const row of audit)for(const item of [row.old_data,row.new_data].filter(Boolean))ok(Object.keys(item).sort().join()===['follow_up_type','status'].join(),'Audit contains working text')
  checks.push('Municipal scope denies foreign reads/updates/inserts; matching/provincial scope succeeds; minimized audit attributes actual signed actors')
  step='revoked and anonymous sessions'
  data(await staff.actor.auth.signOut({scope:'global'}),'revoke actual staff session')
  await reject(client('actor',1,staff.token).from('follow_ups').select('id').eq('id',first.followup.id),'42501')
  const anon=await anonymous.from('follow_ups').select('id').eq('id',first.followup.id);ok(!!anon.error||anon.data.length===0,'Anonymous follow-up exposure')
  checks.push('Previously valid revoked staff session and anonymous requests cannot retrieve the synthetic follow-up')
 }
 passed=true
}catch(error){console.error('Synthetic follow-up '+phase+' failed at '+step+': '+error.message)}
finally{
 try{
  for(const a of accounts){const user=data(await fixture.auth.admin.getUserById(a.id),'verify cleanup account').user;ok(user.email===a.email&&user.user_metadata.test_run===run,'Refusing non-fixture account cleanup')}
  if(company)ok(data(await fixture.from('employers').select('company_name').eq('id',company.id).single(),'verify company').company_name==='Synthetic follow-up '+run,'Company marker mismatch')
  if(event)ok(data(await fixture.from('events').select('event_name').eq('id',event.id).single(),'verify event').event_name==='Synthetic follow-up '+run,'Event marker mismatch')
  for(const c of cases)if(c.profile){const p=data(await fixture.from('jobseeker_profiles').select('last_name,email').eq('participant_id',c.participant.id).single(),'verify participant');ok(p.last_name===run&&p.email===c.profile.email,'Participant marker mismatch')}
  for(const actor of actors)data(await actor.auth.signOut({scope:'global'}),'revoke fixture sessions')
  for(const c of cases)if(c.outcome){const rows=data(await fixture.from('follow_ups').select('id').eq('employment_outcome_id',c.outcome.id),'exact follow-up cleanup scope');ids.push(...rows.map(r=>r.id));data(await fixture.from('follow_ups').delete().eq('employment_outcome_id',c.outcome.id),'cleanup synthetic follow-ups')}
  for(const c of cases){
   if(c.outcome)data(await fixture.from('employment_outcomes').delete().eq('id',c.outcome.id).eq('application_id',c.application.id),'cleanup synthetic outcome')
   if(c.application)data(await fixture.from('applications').delete().eq('id',c.application.id).eq('participant_id',c.participant.id),'cleanup synthetic application')
   if(c.registration)data(await fixture.from('event_participations').delete().eq('id',c.registration.id).eq('participant_id',c.participant.id),'cleanup synthetic registration')
   if(c.offering)data(await fixture.from('event_vacancies').delete().eq('id',c.offering.id).eq('vacancy_definition_id',c.definition.id),'cleanup synthetic offering')
   if(c.definition){data(await fixture.from('vacancy_history').delete().eq('vacancy_definition_id',c.definition.id),'cleanup synthetic vacancy history');data(await fixture.from('vacancy_definitions').delete().eq('id',c.definition.id).eq('employer_id',company.id),'cleanup synthetic vacancy')}
   if(c.participant){data(await fixture.from('jobseeker_profiles').delete().eq('participant_id',c.participant.id),'cleanup synthetic profile');data(await fixture.from('participants').delete().eq('id',c.participant.id).is('auth_user_id',null),'cleanup synthetic participant')}
  }
  if(company)data(await fixture.from('employers').delete().eq('id',company.id).eq('company_name',company.company_name),'cleanup synthetic company')
  if(event)data(await fixture.from('events').delete().eq('id',event.id).eq('event_name',event.event_name),'cleanup synthetic event')
  for(const a of accounts)data(await fixture.auth.admin.deleteUser(a.id),'cleanup synthetic Auth user')
  if(ids.length){data(await fixture.from('audit_logs').delete().in('record_id',[...new Set(ids)]),'cleanup exact fixture audit');ok(!data(await fixture.from('audit_logs').select('id').in('record_id',[...new Set(ids)]),'verify audit cleanup').length,'Synthetic audit remains')}
  for(const [table,values]of [['profiles',accounts],['participants',cases.map(c=>c.participant)],['follow_ups',cases.map(c=>c.followup)],['employment_outcomes',cases.map(c=>c.outcome)],['applications',cases.map(c=>c.application)],['event_participations',cases.map(c=>c.registration)],['event_vacancies',cases.map(c=>c.offering)],['vacancy_definitions',cases.map(c=>c.definition)]]){const keys=values.filter(Boolean).map(v=>v.id);if(keys.length)ok(!data(await fixture.from(table).select('id').in('id',keys),'verify '+table+' cleanup').length,'Synthetic '+table+' remains')}
  cleanup=true
 }catch(error){passed=false;console.error('Synthetic follow-up cleanup incomplete: '+error.message)}
 const receipt={observed_at:new Date().toISOString(),verified_project_ref:'cdmkzzmaswwiryymtycn',phase,run_id:run,passed:passed&&cleanup,cleanup_complete:cleanup,account_ids:accounts.map(a=>a.id),fixture_ids:[...new Set(ids)],checks,requests,limitations:['No fabricated hosted Google identity or genuine personal records','Service access prepares, verifies and cleans exact synthetic fixtures; acceptance uses actual signed TOTP accounts','Medical/employer/jobseeker role boundaries have isolated SQL coverage; native acceptance covers administrator/staff/supervisor','No automatic follow-up scheduling, records disposal or retention policy activation']}
 await writeFile(new URL('../../artifacts/follow-up-security-20261016/native-'+phase+'.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify({phase,passed:receipt.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}));process.exitCode=receipt.passed?0:1
}
