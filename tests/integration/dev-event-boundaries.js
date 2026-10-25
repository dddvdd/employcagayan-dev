import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID,randomInt} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn',phase=process.env.EMPLOY_EVENT_BOUNDARY_PHASE
if(process.env.EMPLOY_RUN_EVENT_BOUNDARY_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture configuration mismatch')
const claims=t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'))}catch{return null}}
const sc=claims(env.SUPABASE_SERVICE_ROLE_KEY);if(sc&&(sc.role!=='service_role'||sc.ref!==ref))throw Error('Fixture credential mismatch')
const run=randomUUID(),accounts=[],actors=[],events=[],ids=[],requests=[],checks=[]
let company=null,passed=false,cleanup=false,step='configuration'
const ok=(v,label)=>{if(!v)throw Error(label)}
const data=(r,label)=>{ok(!r.error,label+' failed ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
const fetchFor=(mode,index)=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 ok(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const h=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(h.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&url.pathname.startsWith('/rest/'))ok(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===accounts[index]?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed fixture actor required')
 const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,path:url.pathname,method:init?.method||'GET',status:response.status});return response
}
const client=(mode,index,token=null)=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode,index),...(token?{headers:{Authorization:'Bearer '+token}}:{})}})
const fixture=client('fixture'),anonymous=client('anonymous')
const insert=async(table,record)=>data(await fixture.from(table).insert(record).select().single(),'fixture '+table)
const deny=async promise=>ok((await promise).error?.code==='42501','Expected scoped authorization denial')
const fail=async promise=>ok(!!(await promise).error,'Expected closed/inactive operation rejection')
const enroll=async(index,role)=>{
 const actor=client('actor',index);actors.push(actor)
 data(await actor.auth.signInWithPassword({email:accounts[index].email,password:accounts[index].password}),'actual password actor')
 await deny(role==='supervisor'?actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[0].id}):actor.rpc('participate_in_event',{p_event_id:events[1].id}))
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'DEV synthetic event scope'}),'fixture TOTP enrollment')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'fixture TOTP challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'actual TOTP verification')
 const session=data(await actor.auth.getSession(),'actual AAL2 session').session
 ok(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
 return {actor,token:session.access_token}
}
try{
 step='prepare isolated fixtures'
 for(let index=0;index<2;index++){
  const email='dev-event-scope-'+run+'-'+index+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
  const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'fixture account').user
  accounts.push({...user,password});ids.push(user.id)
  data(await fixture.from('profiles').update({role:index?'employer':'supervisor',jurisdiction:index?null:'Solana',is_provincial:false}).eq('id',user.id),'fixture actor role')
 }
 company=await insert('employers',{company_name:'Synthetic event scope '+run,registered_user_id:accounts[1].id,registration_status:'approved',is_active:true,employer_code:'EMP-'+randomInt(800000,999999)})
 ids.push(company.id)
 for(let index=0;index<2;index++){
  const event=await insert('events',{event_name:'Synthetic event scope '+run+' '+index,event_date:new Date().toISOString().slice(0,10),location:'Tuguegarao City',status:'upcoming'})
  events.push(event);ids.push(event.id)
 }
 const attendance=await insert('employer_event_participations',{event_id:events[0].id,employer_id:company.id});ids.push(attendance.id)
 const sup=await enroll(0,'supervisor'),owner=await enroll(1,'employer')
 checks.push('Actual password AAL1 supervisor/employer requests are denied; ordinary acceptance uses real signed TOTP AAL2 sessions')
 step='supervisor jurisdiction'
 const outside=await sup.actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[0].id})
 if(phase==='baseline')ok(!outside.error&&outside.data.already_checked_in===false,'Baseline jurisdiction defect not reproduced')
 else{
  ok(outside.error?.code==='42501','Outside supervisor scope accepted')
  const state=data(await fixture.from('employer_event_participations').select('status').eq('id',attendance.id).single(),'unchanged attendance')
  ok(state.status==='registered','Rejected check-in changed state')
 }
 checks.push(phase==='baseline'?'Actual guarded DEV endpoint reproduces out-of-jurisdiction supervisor check-in':'Actual guarded DEV endpoint rejects out-of-jurisdiction supervisor check-in without changing attendance')
 step='inactive company registration'
 data(await fixture.from('employers').update({is_active:false}).eq('id',company.id),'make synthetic company inactive')
 const inactive=await owner.actor.rpc('participate_in_event',{p_event_id:events[1].id})
 if(phase==='baseline')ok(!inactive.error,'Baseline inactive company defect not reproduced')
 else{
  ok(inactive.error?.code==='42501','Inactive company registration accepted')
  const state=data(await fixture.from('employer_event_participations').select('id').eq('event_id',events[1].id).eq('employer_id',company.id),'unchanged registration')
  ok(state.length===0,'Rejected inactive registration created attendance')
 }
 checks.push(phase==='baseline'?'Actual guarded DEV endpoint reproduces inactive approved company registration':'Actual guarded DEV endpoint rejects inactive approved company registration before creating attendance')
 if(phase==='verify'){
  step='inactive check-in and allowed scope'
  data(await fixture.from('profiles').update({jurisdiction:'Tuguegarao City'}).eq('id',accounts[0].id),'fixture matching jurisdiction')
  await fail(sup.actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[0].id}))
  data(await fixture.from('employers').update({is_active:true}).eq('id',company.id),'restore synthetic active company')
  data(await owner.actor.rpc('participate_in_event',{p_event_id:events[1].id}),'active company registration')
  data(await owner.actor.rpc('participate_in_event',{p_event_id:events[1].id}),'idempotent company registration')
  const state=data(await fixture.from('employer_event_participations').select('id').eq('event_id',events[1].id).eq('employer_id',company.id),'one attendance row')
  ok(state.length===1,'Duplicate company attendance');ids.push(state[0].id)
  ok(data(await sup.actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[0].id}),'same jurisdiction check-in').already_checked_in===false,'Same-scope check-in failed')
  ok(data(await sup.actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[0].id}),'repeat check-in').already_checked_in===true,'Repeated check-in not idempotent')
  data(await fixture.from('profiles').update({jurisdiction:'Solana',is_provincial:true}).eq('id',accounts[0].id),'fixture provincial scope')
  data(await sup.actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[1].id}),'provincial check-in')
  checks.push('Inactive company check-in rejected; active company registration and same-jurisdiction/provincial supervisor check-in succeed; repeats remain idempotent')
  step='closed events and revocation'
  data(await fixture.from('events').update({status:'cancelled'}).eq('id',events[1].id),'synthetic cancelled event')
  await fail(sup.actor.rpc('check_in_employer',{p_employer_code:company.employer_code,p_event_id:events[1].id}))
  await fail(owner.actor.rpc('participate_in_event',{p_event_id:events[1].id}))
  data(await owner.actor.auth.signOut({scope:'global'}),'revoke actual owner session')
  await deny(client('actor',1,owner.token).rpc('participate_in_event',{p_event_id:events[0].id}))
  checks.push('Cancelled event operations and an actually revoked previously valid signed session are rejected')
 }
 for(const name of ['check_in_employer','participate_in_event','register_for_event']){
  const args=name==='check_in_employer'?{p_employer_code:company.employer_code,p_event_id:events[0].id}:{p_event_id:events[0].id}
  ok(!!(await anonymous.rpc(name,args)).error,'Anonymous event write accepted')
 }
 await deny(sup.actor.rpc('register_for_event',{p_event_id:events[0].id,p_vacancy_ids:[]}))
 checks.push('Anonymous writes and Partner attempts to use the Google-jobseeker registration path are denied; no fabricated Google identity used')
 await sup.actor.auth.signOut({scope:'global'})
 if(phase==='baseline')await owner.actor.auth.signOut({scope:'global'})
 passed=true
}catch(error){console.error('Synthetic event scope '+phase+' failed at '+step+': '+error.message)}
finally{
 try{
  for(const a of accounts){const user=data(await fixture.auth.admin.getUserById(a.id),'verify cleanup account').user;ok(user.email===a.email&&user.user_metadata.test_run===run,'Refusing non-fixture account cleanup')}
  if(company){const c=data(await fixture.from('employers').select('company_name').eq('id',company.id).single(),'verify cleanup company');ok(c.company_name===company.company_name&&c.company_name.includes(run),'Refusing non-fixture company cleanup')}
  for(const e of events){const row=data(await fixture.from('events').select('event_name').eq('id',e.id).single(),'verify cleanup event');ok(row.event_name===e.event_name&&row.event_name.includes(run),'Refusing non-fixture event cleanup')}
  if(company&&events.length){
   const rows=data(await fixture.from('employer_event_participations').select('id').eq('employer_id',company.id).in('event_id',events.map(e=>e.id)),'exact fixture attendance scope')
   for(const row of rows)if(!ids.includes(row.id))ids.push(row.id)
   data(await fixture.from('employer_event_participations').delete().eq('employer_id',company.id).in('event_id',events.map(e=>e.id)),'cleanup fixture attendance')
  }
  if(company)data(await fixture.from('employers').delete().eq('id',company.id).eq('registered_user_id',accounts[1].id),'cleanup fixture company')
  for(const e of events)data(await fixture.from('events').delete().eq('id',e.id).eq('event_name',e.event_name),'cleanup fixture event')
  for(const actor of actors)data(await actor.auth.signOut({scope:'global'}),'revoke fixture sessions before deletion')
  for(const a of accounts)data(await fixture.auth.admin.deleteUser(a.id),'cleanup fixture Auth account')
  if(ids.length){data(await fixture.from('audit_logs').delete().in('record_id',ids),'cleanup exact fixture audit records');ok(!data(await fixture.from('audit_logs').select('id').in('record_id',ids),'verify fixture audit cleanup').length,'Fixture audit remains')}
  for(const [table,values]of [['profiles',accounts.map(a=>a.id)],['employers',company?[company.id]:[]],['events',events.map(e=>e.id)]]){
   if(values.length)ok(!data(await fixture.from(table).select('id').in('id',values),'verify '+table+' cleanup').length,'Fixture remains')
  }
  cleanup=true
 }catch(error){passed=false;console.error('Synthetic event scope cleanup incomplete: '+error.message)}
 const evidence={phase,verified_project_ref:ref,observed_at:new Date().toISOString(),run_id:run,passed:passed&&cleanup,cleanup_complete:cleanup,
  account_ids:accounts.map(a=>a.id),company_ids:company?[company.id]:[],event_ids:events.map(e=>e.id),fixture_ids:ids,checks,requests,
  limitations:['No real Google jobseeker registration/onboarding acceptance; that positive path uses isolated SQL tests only','No genuine personal records, AI providers, Production or hosting operations','Fixture service access only prepares/verifies/cleans isolated records; ordinary acceptance uses real signed actors']}
 await writeFile(new URL('../../artifacts/authenticated-rpc-review-20261016/native-'+phase+'.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({phase,passed:evidence.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}))
 process.exitCode=evidence.passed?0:1
}
