import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',phase=process.env.EMPLOY_REJECTION_PHASE
if(process.env.EMPLOY_VERIFIED_DEV_URL!==expected||process.env.EMPLOY_RUN_REJECTION_TESTS!=='1'||!['baseline','verify'].includes(phase))throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const claims=t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'))}catch{return null}}
const svc=claims(env.SUPABASE_SERVICE_ROLE_KEY);if(svc&&(svc.role!=='service_role'||svc.ref!=='cdmkzzmaswwiryymtycn'))throw Error('Fixture credential mismatch')
const run=randomUUID(),accounts=[],actors=[],companies=[],ids=[],requests=[],checks=[]
let passed=false,cleanup=false,step='configuration'
const ok=(v,m)=>{if(!v)throw Error(m)},data=(r,m)=>{ok(!r.error,m+' ('+(r.error?.code||r.error?.status||'request')+')');return r.data}
const client=(mode,index,token=null)=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{...(token?{headers:{Authorization:'Bearer '+token}}:{}),fetch:async(input,init)=>{
 const u=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 ok(u.origin===expected&&u.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const h=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(h.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&u.pathname.startsWith('/rest/'))ok(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===accounts[index]?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed fixture actor required')
 const r=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});requests.push({mode,path:u.pathname,method:init?.method||'GET',status:r.status});return r
}}})
const fixture=client('fixture'),anonymous=client('anonymous')
const deny=async promise=>ok((await promise).error?.code==='42501','Expected canonical authorization denial')
const enroll=async index=>{
 const actor=client('actor',index);actors.push(actor)
 data(await actor.auth.signInWithPassword({email:accounts[index].email,password:accounts[index].password}),'actual password login')
 await deny(actor.rpc('admin_reject_employer',{p_employer_id:companies[0].id,p_reason:'Synthetic unauthorized request'}))
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic company decision'}),'TOTP enrollment'),challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'TOTP challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'actual TOTP verification')
 const token=data(await actor.auth.getSession(),'actual AAL2 session').session.access_token
 ok(claims(token)?.aal==='aal2','Actual AAL2 required');return {actor,token}
}
const bootstrap=async actor=>data(await actor.rpc('auth_account_bootstrap'),'actual account bootstrap')
try{
 step='prepare isolated accounts and company records'
 for(const role of ['admin','applicant','employer','staff']){
  const email='dev-rejection-'+run+'-'+role+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
  const user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'fixture Auth account').user
  accounts.push({id:user.id,email,password});ids.push(user.id)
  data(await fixture.from('profiles').update({role}).eq('id',user.id),'fixture canonical role')
 }
 for(let i=0;i<3;i++){
  const row=data(await fixture.from('employers').insert({company_name:'Synthetic rejection '+run+' '+i,registered_user_id:i?accounts[i+1].id:null,registration_status:'pending',registration_source:'admin',is_active:true,employer_type:'local_direct',business_structure:'corporation',osh_classification:'low_risk'}).select().single(),'fixture company')
  companies.push(row);ids.push(row.id)
  const acc=data(await fixture.from('employer_accreditation').select('id,employer_accreditation_requirements(id,status,document_path)').eq('employer_id',row.id).single(),'fixture accreditation')
  row.accreditation_id=acc.id;row.requirements=acc.employer_accreditation_requirements;ids.push(acc.id,...row.requirements.map(r=>r.id))
 }
 data(await fixture.from('employers').update({registration_status:'approved',employer_code:'EMP-'+run.replaceAll('-','').slice(0,12)}).eq('id',companies[1].id),'prepare approved company')
 data(await fixture.from('employer_accreditation').update({status:'approved',approved_at:'2026-10-15T00:00:00Z'}).eq('id',companies[1].accreditation_id),'prepare historical approval')
 const admin=await enroll(0),pending=await enroll(1),employer=await enroll(2),staff=await enroll(3)
 checks.push('Actual AAL1 write attempts are denied; ordinary acceptance uses real signed administrator/applicant/employer/staff accounts with TOTP AAL2')
 step='administrator company association'
 data(await admin.actor.rpc('admin_link_employer_account',{p_employer_id:companies[0].id,p_email:accounts[1].email}),'actual administrator company association')
 const before=await bootstrap(pending.actor)
 ok(before.role==='applicant'&&before.is_active===true&&before.partner_authorized===false&&before.jobseeker_authorized===false,'Password-only pending identity boundary changed')
 await deny(employer.actor.rpc('admin_reject_employer',{p_employer_id:companies[0].id,p_reason:'Synthetic wrong-role request'}))
 checks.push('Administrator links one confirmed existing account to the company; password-only applicant gains neither employer authority nor Google jobseeker authority; a verified employer cannot reject companies')
 step='pending applicant and historical staff rejection'
 for(const index of [0,2])data(await admin.actor.rpc('admin_reject_employer',{p_employer_id:companies[index].id,p_reason:'  Synthetic private company decision  '}),'actual company rejection')
 const pendingAfter=await bootstrap(pending.actor),staffAfter=await bootstrap(staff.actor)
 if(phase==='baseline'){
  ok(pendingAfter.is_active===false&&staffAfter.is_active===false,'Baseline unrelated identity deactivation not reproduced')
  const acc=data(await fixture.from('employer_accreditation').select('status').eq('id',companies[0].accreditation_id).single(),'baseline accreditation')
  ok(acc.status==='pending','Baseline accreditation divergence not reproduced')
  checks.push('Actual company rejection disables a pending applicant and a historically linked staff identity, while the pending accreditation remains unchanged')
 }else{
  ok(pendingAfter.is_active===true&&pendingAfter.role==='applicant'&&pendingAfter.partner_authorized===false&&pendingAfter.jobseeker_authorized===false,'Pending identity preservation weakened authentication rules')
  ok(pendingAfter.employer_application.registration_status==='rejected','Rejected company state missing')
  ok(staffAfter.is_active===true&&staffAfter.role==='staff'&&staffAfter.partner_authorized===true,'Staff identity changed')
  checks.push('Pending applicant remains active without gaining employer/Google jobseeker authority; historically linked staff remains active; rejected company status is authoritative')
 }
 step='approved employer rejection'
 data(await admin.actor.rpc('admin_reject_employer',{p_employer_id:companies[1].id,p_reason:null}),'actual approved employer rejection')
 const approvedAfter=await bootstrap(employer.actor)
 ok(approvedAfter.is_active===false&&approvedAfter.partner_authorized===false,'Approved employer retained Partner authority')
 const accreditation=data(await fixture.from('employer_accreditation').select('status,approved_at').eq('id',companies[1].accreditation_id).single(),'historical accreditation state')
 ok(accreditation.status===(phase==='baseline'?'approved':'rejected'),'Accreditation state mismatch')
 ok(new Date(accreditation.approved_at).toISOString()==='2026-10-15T00:00:00.000Z','Prior approval evidence removed')
 for(const company of companies){const req=data(await fixture.from('employer_accreditation_requirements').select('id,status,document_path').eq('accreditation_id',company.accreditation_id).order('id'),'unchanged requirement evidence');ok(JSON.stringify(req)===JSON.stringify([...company.requirements].sort((a,b)=>a.id.localeCompare(b.id))),'Requirement evidence changed')}
 checks.push('Approved employer rejection still denies Partner authority and preserves prior approval time and requirement evidence')
 if(phase==='verify'){
  step='idempotence, audit and revoked administrator'
  data(await admin.actor.rpc('admin_reject_employer',{p_employer_id:companies[0].id,p_reason:'Synthetic private company decision'}),'repeat company rejection')
  const audit=data(await fixture.from('audit_logs').select('user_id,new_data').eq('record_id',companies[0].id).eq('new_data->>registration_status','rejected'),'rejection audit')
  ok(audit.length===1&&audit[0].user_id===accounts[0].id&&!JSON.stringify(audit).includes('private company decision'),'Rejection audit not minimized/idempotent')
  data(await admin.actor.auth.signOut({scope:'global'}),'revoke actual admin session')
  await deny(client('actor',0,admin.token).rpc('admin_reject_employer',{p_employer_id:companies[0].id,p_reason:null}))
  ok(!!(await anonymous.rpc('admin_reject_employer',{p_employer_id:companies[0].id,p_reason:null})).error,'Anonymous company decision allowed')
  checks.push('Repeat rejection adds no duplicate authority decision; audit identifies actual administrator without private notes; revoked/anonymous requests are denied')
 }
 passed=true
}catch(error){console.error('Synthetic employer rejection '+phase+' failed at '+step+': '+error.message)}
finally{
 try{
  for(const a of accounts){const u=data(await fixture.auth.admin.getUserById(a.id),'verify cleanup account').user;ok(u.email===a.email&&u.user_metadata.test_run===run,'Refusing non-fixture account cleanup')}
  for(const c of companies)ok(data(await fixture.from('employers').select('company_name').eq('id',c.id).single(),'verify cleanup company').company_name===c.company_name&&c.company_name.includes(run),'Refusing non-fixture company cleanup')
  for(const actor of actors)data(await actor.auth.signOut({scope:'global'}),'revoke fixture session')
  for(const c of companies){const acc=data(await fixture.from('employer_accreditation').select('id,employer_accreditation_requirements(id)').eq('employer_id',c.id),'cleanup accreditation scope');for(const row of acc)ids.push(row.id,...row.employer_accreditation_requirements.map(r=>r.id));data(await fixture.from('employers').delete().eq('id',c.id).eq('company_name',c.company_name),'cleanup exact synthetic company')}
  for(const a of accounts)data(await fixture.auth.admin.deleteUser(a.id),'cleanup exact synthetic Auth user')
  if(ids.length){data(await fixture.from('audit_logs').delete().in('record_id',[...new Set(ids)]),'cleanup exact synthetic audit');ok(!data(await fixture.from('audit_logs').select('id').in('record_id',[...new Set(ids)]),'verify synthetic audit').length,'Synthetic audit remains')}
  for(const [table,values]of [['profiles',accounts.map(a=>a.id)],['employers',companies.map(c=>c.id)],['employer_accreditation',companies.map(c=>c.accreditation_id).filter(Boolean)],['employer_accreditation_requirements',companies.flatMap(c=>c.requirements?.map(r=>r.id)||[])]])if(values.length)ok(!data(await fixture.from(table).select('id').in('id',values),'verify '+table+' cleanup').length,'Synthetic '+table+' remains')
  cleanup=true
 }catch(error){passed=false;console.error('Synthetic rejection cleanup incomplete: '+error.message)}
 const receipt={observed_at:new Date().toISOString(),verified_project_ref:'cdmkzzmaswwiryymtycn',phase,run_id:run,passed:passed&&cleanup,cleanup_complete:cleanup,account_ids:accounts.map(a=>a.id),fixture_ids:[...new Set(ids)],checks,requests,limitations:['All hosted accounts use real password/email identities and verified TOTP; no fabricated Google identity','Google jobseeker continuation has isolated database/browser coverage, not genuine hosted OAuth acceptance','Company-account association is distinct from OAuth provider identity linking','Approved company/status assignments are synthetic fixture preparation, not accreditation approval acceptance','Service access prepares/verifies/cleans exact fixtures; no genuine records or AI-provider requests']}
 await writeFile(new URL('../../artifacts/employer-rejection-20261016/native-'+phase+'.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify({phase,passed:receipt.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}));process.exitCode=receipt.passed?0:1
}
