import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {recruitmentDatabase,RECRUITMENT_MIGRATION} from '../support/recruitment-database.js'
import {createRecruitmentFixture as fixture,payload} from '../support/recruitment-fixture.js'
import {seedAccount,become,validApplication} from '../support/identity-database.js'
let db
before(async()=>{db=await recruitmentDatabase({migration:RECRUITMENT_MIGRATION})})
after(async()=>{await db?.close()})
const rpc=async(name,args=[],placeholders=args.map((_,i)=>'$'+(i+1)).join(','))=>(await db.query('SELECT public.'+name+'('+placeholders+') AS result',args)).rows[0].result
async function object(account,{type='application/pdf',size=100}={}) {
 await db.exec('RESET ROLE')
 const path=account.id+'/'+crypto.randomUUID()+'.pdf'
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('resumes',$1,$2)",[path,{mimetype:type,size}])
 return path
}
async function link(f,path) {await become(db,f.user);return rpc('set_jobseeker_resume',[path,null])}
async function readFile(path) {return (await db.query("SELECT id FROM storage.objects WHERE bucket_id='resumes' AND name=$1",[path])).rows}

test('pending employer legacy contact and formal recruitment RPCs deny access even after TOTP',async()=>{
 const f=await fixture(db)
 await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[f.company])
 await become(db,f.owner,{aal:'aal2'})
 await assert.rejects(()=>rpc('get_employer_applicants',[f.offering]),/approved employer/)
 await assert.rejects(()=>rpc('list_employer_applications'),/approved employer/)
})

test('password candidate with pending-company TOTP cannot submit, list or read candidate applications',async()=>{
 const f=await fixture(db)
 await become(db,f.user)
 const application=await rpc('submit_application',[f.vacancy])
 await db.query('SELECT public.register_employer_application($1::jsonb)',[JSON.stringify(validApplication)])
 await become(db,f.user,{aal:'aal2',method:'password'})
 for(const [name,args] of [['submit_application',[f.vacancy]],['list_my_applications',[]],['withdraw_application',[application.application_id]],['submit_event_application',[f.participation,f.offering]],['register_for_event',[f.event]]])
  await assert.rejects(()=>rpc(name,args))
 assert.deepEqual((await db.query('SELECT id FROM public.applications WHERE id=$1',[application.application_id])).rows,[])
})

test('Google candidate derives ownership, submits once and retrieves status history',async()=>{
 const f=await fixture(db)
 await become(db,f.user)
 const first=await rpc('submit_application',[f.vacancy]),repeat=await rpc('submit_application',[f.vacancy])
 assert.equal(first.status,'created');assert.equal(repeat.status,'existing');assert.equal(repeat.application_id,first.application_id)
 const rows=(await db.query('SELECT participant_id FROM public.applications WHERE id=$1',[first.application_id])).rows
 assert.equal(rows[0].participant_id,f.profile.participant_id);assert.notEqual(rows[0].participant_id,f.user.id)
 assert.equal((await db.query('SELECT * FROM public.list_my_applications()')).rows.length,1)
 await become(db,f.owner,{aal:'aal2'})
 await rpc('update_application_status',[first.application_id,'shortlisted'])
 await become(db,f.user)
 assert.equal((await db.query('SELECT application_status FROM public.applications WHERE id=$1',[first.application_id])).rows[0].application_status,'shortlisted')
 await rpc('withdraw_application',[first.application_id])
 await assert.rejects(()=>rpc('withdraw_application',[first.application_id]),/current status/)
})

test('forged participant, other candidate reads/withdrawals and direct inserts/updates fail',async()=>{
 const a=await fixture(db),b=await fixture(db)
 await become(db,b.user)
 const other=await rpc('submit_application',[b.vacancy])
 await become(db,a.user)
 assert.deepEqual((await db.query('SELECT id FROM public.applications WHERE id=$1',[other.application_id])).rows,[])
 await assert.rejects(()=>rpc('withdraw_application',[other.application_id]),/not found/)
 await assert.rejects(()=>rpc('submit_event_application',[b.participation,b.offering]),/Not authorized/)
 await assert.rejects(()=>db.query("INSERT INTO public.applications(participant_id,vacancy_definition_id,application_status,source) VALUES($1,$2,'applied','online')",[b.profile.participant_id,b.vacancy]))
 assert.deepEqual((await db.query("UPDATE public.applications SET application_status='rejected' WHERE id=$1 RETURNING id",[other.application_id])).rows,[])
})

test('invalid, closed, expired and unapproved vacancies cannot accept an application',async()=>{
 const f=await fixture(db)
 await become(db,f.user)
 await assert.rejects(()=>rpc('submit_application',[crypto.randomUUID()]),/not open/)
 await db.exec('RESET ROLE')
 await db.query('UPDATE public.vacancy_definitions SET platform_application_deadline=now()-interval \'1 day\' WHERE id=$1',[f.vacancy])
 await become(db,f.user)
 await assert.rejects(()=>rpc('submit_application',[f.vacancy]),/not open/)
 await db.exec('RESET ROLE')
 await db.query("UPDATE public.vacancy_definitions SET platform_application_deadline=NULL WHERE id=$1",[f.vacancy])
 await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[f.company])
 await become(db,f.user)
 await assert.rejects(()=>rpc('submit_application',[f.vacancy]),/not open/)
})

test('event submissions require the owned checked-in participation and matching offering',async()=>{
 const a=await fixture(db),b=await fixture(db)
 await become(db,a.user)
 await assert.rejects(()=>rpc('submit_event_application',[a.participation,b.offering]),/not open/)
 await db.exec('RESET ROLE')
 await db.query("UPDATE public.event_participations SET check_in_status='pending',check_in_time=NULL WHERE id=$1",[a.participation])
 await become(db,a.user)
 await assert.rejects(()=>rpc('submit_event_application',[a.participation,a.offering]),/check-in/)
 await db.exec('RESET ROLE')
 await db.query("UPDATE public.event_participations SET check_in_status='checked_in',check_in_time=now() WHERE id=$1",[a.participation])
 await become(db,a.user)
 const result=await rpc('submit_event_application',[a.participation,a.offering]),repeat=await rpc('submit_event_application',[a.participation,a.offering])
 assert.equal(result.status,'created');assert.equal(repeat.application_id,result.application_id)
})

test('employer A cannot read employer B inbox, legacy contacts, applications or change vacancy organization',async()=>{
 const a=await fixture(db),b=await fixture(db)
 await become(db,b.user);const application=await rpc('submit_application',[b.vacancy])
 await become(db,a.owner,{aal:'aal2'})
 await assert.rejects(()=>rpc('list_employer_applications',[b.vacancy]),/not owned/)
 assert.deepEqual((await db.query('SELECT * FROM public.get_employer_applicants($1)',[b.offering])).rows,[])
 assert.deepEqual((await db.query('SELECT id FROM public.applications WHERE id=$1',[application.application_id])).rows,[])
 await assert.rejects(()=>rpc('update_application_status',[application.application_id,'rejected']),/not owned/)
 assert.deepEqual((await db.query('UPDATE public.vacancy_definitions SET position=$1 WHERE id=$2 RETURNING id',['Other owner',b.vacancy])).rows,[])
 await assert.rejects(()=>db.query('UPDATE public.vacancy_definitions SET employer_id=$1 WHERE id=$2',[b.company,a.vacancy]))
 await assert.rejects(()=>db.query("UPDATE public.profiles SET role='staff' WHERE id=$1",[a.owner.id]),/permission|administrator/i)
})

test('publication and recruitment APIs independently reject AAL1, active owned publication succeeds at AAL2',async()=>{
 const f=await fixture(db)
 await become(db,f.owner,{aal:'aal1'})
 for(const [name,args] of [['close_vacancy',[f.vacancy]],['publish_vacancy',[f.vacancy]],['list_employer_applications',[]],['get_employer_applicants',[f.offering]]])await assert.rejects(()=>rpc(name,args),error=>error.code==='42501')
 await become(db,f.owner,{aal:'aal2'})
 assert.equal((await rpc('publish_vacancy',[f.vacancy])).status,'published')
 assert.equal((await rpc('close_vacancy',[f.vacancy])).status,'closed')
 await assert.rejects(()=>rpc('publish_vacancy',[f.vacancy]),/draft/)
})

test('resume setter and direct writer reject other owners, missing objects and invalid metadata',async()=>{
 const f=await fixture(db),other=await fixture(db)
 const foreign=await object(other.user),invalid=await object(f.user,{type:'text/plain'}),large=await object(f.user,{size:5242881})
 await become(db,f.user)
 for(const path of [foreign,f.user.id+'/missing.pdf',invalid,large])await assert.rejects(()=>rpc('set_jobseeker_resume',[path,null]))
 await assert.rejects(()=>db.query('UPDATE public.jobseeker_profiles SET resume_path=$1 WHERE participant_id=$2',[foreign,f.profile.participant_id]),/profile owner/)
 await assert.rejects(()=>db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify({...payload,resume_path:foreign})]),/profile owner/)
})

test('owned resume save, profile edit, concurrent replacement and unlink preserve the correct reference',async()=>{
 const f=await fixture(db),first=await object(f.user),next=await object(f.user)
 await link(f,first)
 await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify({...payload,first_name:'Updated fixture'})])
 assert.equal((await db.query('SELECT resume_path FROM public.jobseeker_profiles WHERE participant_id=$1',[f.profile.participant_id])).rows[0].resume_path,first)
 await rpc('set_jobseeker_resume',[next,first])
 await assert.rejects(()=>rpc('set_jobseeker_resume',[null,first]),/another session/)
 assert.deepEqual((await db.query("DELETE FROM storage.objects WHERE bucket_id='resumes' AND name=$1 RETURNING id",[next])).rows,[])
 assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='resumes' AND name=$1 RETURNING id",[first])).rows.length,1)
 await rpc('set_jobseeker_resume',[null,next])
 assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='resumes' AND name=$1 RETURNING id",[next])).rows.length,1)
})

test('resume ownership governs read, upload, replacement, rename and deletion',async()=>{
 const a=await fixture(db),b=await fixture(db),own=await object(a.user),foreign=await object(b.user)
 await become(db,a.user)
 assert.equal((await readFile(own)).length,1);assert.deepEqual(await readFile(foreign),[])
 await assert.rejects(()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('resumes',$1)",[b.user.id+'/forged.pdf']))
 assert.deepEqual((await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2 RETURNING id',[{mimetype:'application/pdf',size:50},foreign])).rows,[])
 await assert.rejects(()=>db.query('UPDATE storage.objects SET name=$1 WHERE name=$2',[b.user.id+'/moved.pdf',own]))
 assert.deepEqual((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[foreign])).rows,[])
})

test('approved employer resumes require their active formal application; event interest and withdrawn history confer no file access',async()=>{
 const a=await fixture(db),b=await fixture(db),path=await object(a.user)
 await link(a,path)
 await become(db,a.owner,{aal:'aal2'})
 assert.deepEqual(await readFile(path),[])
 await become(db,a.user);const application=await rpc('submit_application',[a.vacancy])
 await become(db,a.owner,{aal:'aal2'})
 assert.equal((await readFile(path)).length,1)
 assert.equal((await db.query('SELECT * FROM public.list_employer_applications()')).rows[0].list_employer_applications.resume_path,path)
 assert.deepEqual((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[path])).rows,[])
 await become(db,b.owner,{aal:'aal2'});assert.deepEqual(await readFile(path),[])
 await become(db,a.user);await rpc('withdraw_application',[application.application_id])
 await become(db,a.owner,{aal:'aal2'});assert.deepEqual(await readFile(path),[])
})

test('current unlink can erase the PDF used when a retained application was submitted (known records gap)',async()=>{
 const f=await fixture(db),path=await object(f.user)
 await link(f,path)
 await become(db,f.user)
 const application=await rpc('submit_application',[f.vacancy])
 await rpc('withdraw_application',[application.application_id])
 await rpc('set_jobseeker_resume',[null,path])
 assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='resumes' AND name=$1 RETURNING id",[path])).rows.length,1)
 assert.equal((await db.query('SELECT application_status FROM public.applications WHERE id=$1',[application.application_id])).rows[0].application_status,'withdrawn')
 assert.equal((await db.query('SELECT public.list_my_applications() AS item')).rows.some(row=>row.item.application_id===application.application_id),true)
})

test('municipal supervisor scope protects participants, profile and resumes while provincial oversight is retained',async()=>{
 const f=await fixture(db),path=await object(f.user)
 await link(f,path)
 const supervisor=await seedAccount(db,{role:'supervisor',factor:true})
 await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[supervisor.id])
 await become(db,supervisor,{aal:'aal2'})
 assert.deepEqual((await db.query('SELECT id FROM public.participants WHERE id=$1',[f.profile.participant_id])).rows,[])
 assert.deepEqual((await db.query('SELECT participant_id FROM public.jobseeker_profiles WHERE participant_id=$1',[f.profile.participant_id])).rows,[])
 assert.deepEqual(await readFile(path),[])
 await assert.rejects(()=>rpc('submit_event_application',[f.participation,f.offering]),/Not authorized/)
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Tuguegarao City' WHERE id=$1",[supervisor.id])
 await become(db,supervisor,{aal:'aal2'})
 assert.equal((await readFile(path)).length,1)
 assert.equal((await rpc('submit_event_application',[f.participation,f.offering])).status,'created')
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=true WHERE id=$1",[supervisor.id])
 await become(db,supervisor,{aal:'aal2'});assert.equal((await readFile(path)).length,1)
 await become(db,supervisor,{aal:'aal1'});assert.deepEqual(await readFile(path),[])
})

test('staff delegation preserves event provenance and invalid status reversals remain denied',async()=>{
 const f=await fixture(db),staff=await seedAccount(db,{role:'staff',factor:true})
 await become(db,staff,{aal:'aal1'})
 await assert.rejects(()=>rpc('submit_event_application',[f.participation,f.offering]),/session/)
 await become(db,staff,{aal:'aal2'})
 const result=await rpc('submit_event_application',[f.participation,f.offering])
 assert.equal(result.status,'created')
 await assert.rejects(()=>db.query('UPDATE public.applications SET participant_id=$1 WHERE id=$2',[staff.id,result.application_id]),/immutable/)
 await db.query("UPDATE public.applications SET application_status='rejected' WHERE id=$1",[result.application_id])
 await assert.rejects(()=>db.query("UPDATE public.applications SET application_status='applied' WHERE id=$1",[result.application_id]),/transition/)
})

test('application and resume audit payloads contain only status, channel or presence',async()=>{
 await db.exec('RESET ROLE')
 const rows=(await db.query("SELECT action,old_data,new_data FROM public.audit_logs WHERE action IN ('application_status_changed','resume_reference_changed')")).rows
 assert.ok(rows.length>10)
 for(const row of rows) {
  assert.deepEqual(Object.keys(row.new_data).sort(),row.action==='resume_reference_changed'?['has_resume']:['channel','status'])
  if(row.old_data)assert.deepEqual(Object.keys(row.old_data),['status'])
 }
})

test('disabled company owners cannot publish or close through the definer RPCs',async()=>{
 const f=await fixture(db)
 await db.exec("RESET ROLE; SELECT set_config('request.jwt.claims','{}',false)")
 await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[f.owner.id])
 await become(db,f.owner,{aal:'aal2'})
 for(const name of ['publish_vacancy','close_vacancy'])await assert.rejects(()=>rpc(name,[f.vacancy]),error=>error.code==='42501')
})

test('onboarding must exist before an otherwise eligible Google candidate submits',async()=>{
 const f=await fixture(db),user=await seedAccount(db,{google:true})
 await become(db,user);await db.query('SELECT public.get_or_create_participant()')
 await assert.rejects(()=>rpc('submit_application',[f.vacancy]),/profile and consent/)
})
