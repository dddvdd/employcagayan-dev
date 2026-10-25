import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn',phase=process.env.EMPLOY_RPC_SURFACE_PHASE
if(process.env.EMPLOY_RUN_RPC_SURFACE_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected||!['baseline','verify'].includes(phase))throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('Fixture configuration mismatch')
const claims=t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'))}catch{return null}}
const sc=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(sc&&(sc.role!=='service_role'||sc.ref!==ref))throw Error('Fixture credential mismatch')
const run=randomUUID(),label='Synthetic Surface '+run,email='dev-surface-'+run+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
const ids=[],companies=[],events=[],vacancies=[],offerings=[],participations=[],participants=[],checks=[],requests=[]
let account=null,actor=null,passed=false,cleanup=false,step='configuration'
const requireTrue=(v,label)=>{if(!v)throw Error(label)}
const data=(r,label)=>{requireTrue(!r.error,label+' failed ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
const fetchFor=mode=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 requireTrue(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const h=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(h.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&url.pathname.startsWith('/rest/'))requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===account?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed fixture actor required')
 const result=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,path:url.pathname,method:init?.method||'GET',status:result.status});return result
}
const client=mode=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture'),anonymous=client('anonymous')
const insert=async(table,values)=>data(await fixture.from(table).insert(values).select().single(),'fixture '+table)
const functions=JSON.parse(await readFile(new URL('../../artifacts/rpc-surface-security-20261016/anonymous-function-before.json',import.meta.url),'utf8')).functions
const parts=functions.find(f=>f.name==='create_walkin_registrant').args.split(', ').map(x=>{const p=x.indexOf(' ');return {name:x.slice(0,p),type:x.slice(p+1)}})
const walkinPayload=(extra={})=>({...Object.fromEntries(parts.map(p=>[p.name,p.type==='boolean'?false:p.type.endsWith('[]')?[]:null])),
 p_event_id:events[0].id,p_first_name:'Synthetic',p_last_name:run,p_email:email,p_birthdate:'2000-01-01',
 p_data_subject_rights_agreed:true,p_ofw_date_returned:'2026-02-28',p_rw_date_returned:'2026-10-01',...extra})
const denied=async(r,code='42501')=>requireTrue((await r).error?.code===code,'Expected scoped denial '+code)
try{
 step='prepare isolated baseline records'
 account=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'fixture identity').user;ids.push(account.id)
 data(await fixture.from('profiles').update({role:'staff',full_name:label}).eq('id',account.id),'fixture staff profile')
 for(let index=0;index<2;index++){const e=await insert('events',{event_name:label+' '+index,event_date:new Date().toISOString().slice(0,10),location:'Tuguegarao City',status:'ongoing'});events.push(e);ids.push(e.id)}
 for(let index=0;index<3;index++){
  const c=await insert('employers',{company_name:label+' company '+index,registration_status:index===1?'pending':'approved',is_active:index!==2});companies.push(c);ids.push(c.id)
  const v=await insert('vacancy_definitions',{employer_id:c.id,company_name:c.company_name,position:'Synthetic surface job',job_description:'Synthetic event vacancy used only for public directory boundary acceptance.',place_of_assignment:'Tuguegarao City',is_active:true,platform_status:'draft'});vacancies.push(v);ids.push(v.id)
  const ev=await insert('event_vacancies',{event_id:events[0].id,vacancy_definition_id:v.id});offerings.push(ev);ids.push(ev.id)
  const attendance=await insert('employer_event_participations',{event_id:events[0].id,employer_id:c.id,status:'registered'});ids.push(attendance.id)
 }
 const foreign=await insert('event_vacancies',{event_id:events[1].id,vacancy_definition_id:vacancies[0].id});offerings.push(foreign);ids.push(foreign.id)
 step='public email and directory boundaries'
 const lookup=await anonymous.rpc('resolve_login_email',{p_identifier:label})
 const directory=data(await anonymous.rpc('get_event_participating_employers',{p_event_id:events[0].id}),'public directory')
 if(phase==='baseline'){
  requireTrue(!lookup.error&&lookup.data===email,'Baseline synthetic directory leak not reproduced')
  requireTrue(directory.length===3,'Baseline public employer filter defect not reproduced')
  checks.push('Actual anonymous REST request returned the exact synthetic Partner email; value withheld')
  checks.push('Actual anonymous directory included pending and inactive synthetic employers')
 }else{
  requireTrue(!!lookup.error,'Legacy email lookup remained callable')
  requireTrue(directory.length===1&&directory[0].company_name===companies[0].company_name&&directory[0].vacancy_count===1,'Public approval/active filters mismatch')
  checks.push('Anonymous email lookup is closed; public directory includes only active approved synthetic company')
  step='real staff password login and MFA'
  actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed staff login')
  await denied(actor.rpc('check_in_registrant',{registrant_uuid:randomUUID()}))
  const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic surface '+run}),'enroll TOTP')
  const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'TOTP challenge')
  data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'verify TOTP')
  const session=data(await actor.auth.getSession(),'signed session').session;requireTrue(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
  checks.push('Real password session and TOTP verification; AAL1 staff denied')
  step='agreement and event selection validation'
  await denied(actor.rpc('create_walkin_registrant',walkinPayload({p_data_subject_rights_agreed:false})),'22023')
  await denied(actor.rpc('create_walkin_registrant',walkinPayload({p_ofw_date_returned:'2026-02-30'})),'22023')
  await denied(actor.rpc('create_walkin_registrant',walkinPayload({p_vacancy_ids:[foreign.id]})),'22023')
  await denied(anonymous.rpc('create_walkin_registrant',walkinPayload()))
  checks.push('False agreement, invalid date, foreign event offering and anonymous writer are rejected')
  step='successful walk-in and date round trip'
  const walkin=data(await actor.rpc('create_walkin_registrant',walkinPayload({p_vacancy_ids:[offerings[0].id]})),'real walk-in')
  participations.push(walkin.id);ids.push(walkin.id)
  const participation=data(await fixture.from('event_participations').select('id,participant_id,event_id,registration_type,check_in_status').eq('id',walkin.id).single(),'verify walk-in participation')
  participants.push(participation.participant_id);ids.push(participation.participant_id)
  const profile=data(await fixture.from('jobseeker_profiles').select('first_name,last_name,email,ofw_date_returned,rw_date_returned,data_subject_rights_agreed').eq('participant_id',participation.participant_id).single(),'verify walk-in profile')
  requireTrue(profile.first_name==='Synthetic'&&profile.last_name===run&&profile.email===email&&profile.ofw_date_returned==='2026-02-28'&&profile.rw_date_returned==='2026-10-01'&&profile.data_subject_rights_agreed===true&&participation.check_in_status==='checked_in','Walk-in persistence mismatch')
  checks.push('Signed staff walk-in persists the actual date fields and explicit agreement with distinct walk-in participant identity')
  step='staff registration and check-in remain operational'
  const prereg=data(await actor.rpc('staff_register_participant',{p_participant_id:participation.participant_id,p_event_id:events[1].id,p_vacancy_ids:[]}),'staff event registration')
  participations.push(prereg.id);ids.push(prereg.id)
  const checked=data(await actor.rpc('check_in_registrant',{registrant_uuid:prereg.id}),'staff event check-in')
  requireTrue(checked.check_in_status==='checked_in','Existing staff check-in failed')
  data(await fixture.from('events').update({status:'cancelled'}).eq('id',events[1].id),'cancel fixture event')
  await denied(actor.rpc('create_walkin_registrant',walkinPayload({p_event_id:events[1].id})),'22023')
  await denied(actor.rpc('check_in_registrant',{registrant_uuid:prereg.id}),'22023')
  checks.push('Existing signed staff registration/check-in work; cancelled event cannot accept walk-in or check-in')
  step='trigger privilege runtime and anonymous browsing'
  const accreditation=data(await fixture.from('employer_accreditation').select('id').eq('employer_id',companies[1].id).single(),'pending accreditation trigger')
  const requirements=data(await fixture.from('employer_accreditation_requirements').select('id').eq('accreditation_id',accreditation.id),'requirements trigger')
  requireTrue(requirements.length>0,'Trigger grants broke accreditation seeding')
  data(await fixture.from('vacancy_definitions').update({position:'Synthetic revised surface job'}).eq('id',vacancies[0].id),'vacancy edit trigger')
  const history=data(await fixture.from('vacancy_history').select('id').eq('vacancy_definition_id',vacancies[0].id),'vacancy history trigger')
  requireTrue(history.length>0,'Trigger grants broke vacancy history')
  const browse=await anonymous.rpc('list_event_vacancies',{p_event_id:events[0].id})
  requireTrue(!browse.error&&browse.data.some(v=>v.vacancy_definition_id===vacancies[0].id),'Public pre-request guard or vacancy browse broke')
  checks.push('Revoked trigger RPC grants preserve actual accreditation/history triggers and anonymous job browsing')
 }
 passed=true
}catch(error){console.error('DEV surface '+phase+' failed at '+step+': '+error.message)}
finally{
 try{
  if(actor)await actor.auth.signOut({scope:'global'})
  if(account){const user=data(await fixture.auth.admin.getUserById(account.id),'verify cleanup identity').user;requireTrue(user.email===email&&user.user_metadata.test_run===run,'Refusing non-fixture identity cleanup')}
  for(const c of companies){const row=data(await fixture.from('employers').select('company_name').eq('id',c.id).single(),'verify company scope');requireTrue(row.company_name===c.company_name&&row.company_name.includes(run),'Refusing non-fixture company cleanup')}
  // Also capture walk-in rows after a later verification failure: only this run's email/name and event IDs.
  if(events.length){
   const profiles=data(await fixture.from('jobseeker_profiles').select('participant_id').eq('email',email).eq('last_name',run),'find isolated walk-in cleanup')
   for(const p of profiles)if(!participants.includes(p.participant_id)){participants.push(p.participant_id);ids.push(p.participant_id)}
   const eps=data(await fixture.from('event_participations').select('id').in('event_id',events.map(e=>e.id)),'fixture participation cleanup scope')
   for(const ep of eps)if(!participations.includes(ep.id)){participations.push(ep.id);ids.push(ep.id)}
  }
  if(participations.length){data(await fixture.from('participation_vacancies').delete().in('participation_id',participations),'cleanup synthetic selected offerings');data(await fixture.from('event_participations').delete().in('id',participations),'cleanup synthetic participations')}
  for(const pid of participants){data(await fixture.from('jobseeker_profiles').delete().eq('participant_id',pid).eq('email',email),'cleanup synthetic walk-in profile');data(await fixture.from('participants').delete().eq('id',pid).is('auth_user_id',null),'cleanup synthetic walk-in participant')}
  if(offerings.length)data(await fixture.from('event_vacancies').delete().in('id',offerings.map(x=>x.id)),'cleanup synthetic offerings')
  for(const v of vacancies){data(await fixture.from('vacancy_history').delete().eq('vacancy_definition_id',v.id),'cleanup fixture vacancy history');data(await fixture.from('vacancy_definitions').delete().eq('id',v.id).eq('employer_id',v.employer_id),'cleanup fixture vacancy')}
  if(events.length)data(await fixture.from('employer_event_participations').delete().in('event_id',events.map(x=>x.id)),'cleanup fixture company attendance')
  for(const c of companies)data(await fixture.from('employers').delete().eq('id',c.id),'cleanup fixture company')
  for(const e of events)data(await fixture.from('events').delete().eq('id',e.id).eq('event_name',e.event_name),'cleanup fixture event')
  if(account)data(await fixture.auth.admin.deleteUser(account.id),'cleanup fixture Auth account')
  if(ids.length){data(await fixture.from('audit_logs').delete().in('record_id',ids),'cleanup exact synthetic audit rows');requireTrue(!data(await fixture.from('audit_logs').select('id').in('record_id',ids),'verify audit cleanup').length,'Fixture audit remains')}
  cleanup=true
 }catch(error){passed=false;console.error('Synthetic surface cleanup incomplete: '+error.message)}
 const evidence={phase,verified_project_ref:ref,observed_at:new Date().toISOString(),run_id:run,passed:passed&&cleanup,cleanup_complete:cleanup,
  account_id:account?.id??null,company_ids:companies.map(x=>x.id),event_ids:events.map(x=>x.id),vacancy_ids:vacancies.map(x=>x.id),participant_ids:participants,participation_ids:participations,fixture_ids:ids,
  checks,requests,limitations:['Only synthetic records; no genuine email-directory lookup, Google onboarding, provider request or Production operation','Service key used only for fixture preparation, verification and exact cleanup; acceptance actors use anonymous or real signed staff requests']}
 await writeFile(new URL('../../artifacts/rpc-surface-security-20261016/native-'+phase+'.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({phase,passed:evidence.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}))
 process.exitCode=evidence.passed?0:1
}
