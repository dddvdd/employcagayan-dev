import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {profileDatabase} from '../support/profile-database.js'
import {recruitmentDatabase,RECRUITMENT_MIGRATION} from '../support/recruitment-database.js'
import {seedAccount,become} from '../support/identity-database.js'

let db
before(async()=>{db=await recruitmentDatabase({migration:RECRUITMENT_MIGRATION})})
after(async()=>{await db?.close()})
const payload={first_name:'Fixture',last_name:'Learner',email:'fixture@example.invalid',birthdate:'2000-02-29',data_subject_rights_agreed:true,highest_educational_attainment:'College Level',first_time_school:'Fixture school',course_program:'Fixture course'}
const save=async data=>(await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify(data)])).rows[0]
const education=async()=> (await db.query('SELECT e.*,l.code,l.rank FROM public.jobseeker_education e JOIN public.education_levels l ON l.id=e.education_level_id ORDER BY e.registration_slot')).rows

test('explicit boolean consent is required before profile or education creation',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  for(const value of [false,null,'true',undefined]) await assert.rejects(()=>save({...payload,data_subject_rights_agreed:value}),/privacy notice/)
  assert.deepEqual((await db.query('SELECT id FROM public.participants')).rows,[])
  const profile=await save(payload)
  assert.equal(profile.data_subject_rights_agreed,true)
  assert.notEqual(profile.participant_id,user.id)
  await assert.rejects(()=>save({...payload,data_subject_rights_agreed:false}),/privacy notice/)
  assert.equal((await education()).length,1)
})

test('birthday roundtrip rejects future and impossible dates through the backend',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  for(const date of ['2999-01-01','2000-02-30','02/29/2000','1899-12-31']) await assert.rejects(()=>save({...payload,birthdate:date}))
  const profile=await save(payload)
  assert.equal((await db.query('SELECT birthdate::text AS date FROM public.jobseeker_profiles WHERE participant_id=$1',[profile.participant_id])).rows[0].date,'2000-02-29')
  await assert.rejects(()=>db.query("UPDATE public.jobseeker_profiles SET birthdate='2999-01-01'"),/Birthdate/)
})

test('attainment and current studies save atomically with actual canonical codes',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  const profile=await save({...payload,is_currently_student:true,current_education_level:"Master's Degree",current_school_name:'Current school',current_program_or_strand:'Current program',expected_graduation_year:2027})
  assert.equal(profile.expected_graduation_year,2027)
  const rows=await education()
  assert.equal(rows.length,2)
  assert.deepEqual(rows.map(row=>[row.registration_slot,row.code,row.status]),[['attainment','bachelor','undergraduate'],['current','master','currently_enrolled']])
  assert.equal(rows[1].school_name,'Current school')
  assert.equal(rows[1].graduation_year,null)
  assert.ok(rows.every(row=>row.jobseeker_profile_id===profile.participant_id && row.registration_managed))
})

test('repeated profile updates preserve a single slot and have no two-edits-per-day gate',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  for(let index=0;index<4;index++) await save({...payload,course_program:`Course ${index}`})
  const rows=await education()
  assert.equal(rows.length,1)
  assert.equal(rows[0].course_program,'Course 3')
})

test('incomplete/current study deduplicates, completed attainment remains separate',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  const same={...payload,is_currently_student:true,current_education_level:'College / Undergraduate',current_school_name:payload.first_time_school,current_program_or_strand:payload.course_program}
  await save(same)
  assert.equal((await education()).length,1)
  await save({...same,highest_educational_attainment:"Bachelor's Degree Graduate",first_time_graduation_year:2020})
  const rows=await education()
  assert.equal(rows.length,2)
  assert.ok(rows.some(row=>row.status==='graduated'))
  assert.ok(rows.some(row=>row.status==='currently_enrolled'))
})

test('Other and unspecified studies persist without pretending to be a named degree',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  await save({...payload,highest_educational_attainment:null,is_currently_student:true,current_education_level:'Graduate Studies',current_school_name:'Reported school',current_program_or_strand:'Unspecified qualification'})
  const rows=await education()
  assert.equal(rows.length,1)
  assert.equal(rows[0].code,'other_unspecified')
  assert.equal(rows[0].school_name,'Reported school')
  assert.equal(rows[0].status,'currently_enrolled')
})

test('ambiguous labels and unfinished qualifications never assert a completed degree',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  for(const label of ['Graduate Studies','Master plumber','Doctor assistant','Other / Not listed']) {
    await save({...payload,highest_educational_attainment:label,first_time_graduation_year:2020})
    const rows=await education()
    assert.equal(rows.length,1)
    assert.equal(rows[0].code,'other_unspecified')
    assert.equal(rows[0].status,'undergraduate')
  }
  await save({...payload,highest_educational_attainment:"Master's Degree Candidate/ Graduate",first_time_graduation_year:null})
  assert.equal((await education())[0].status,'undergraduate')
  await save({...payload,highest_educational_attainment:'TESDA Diploma Program',first_time_graduation_year:null})
  assert.equal((await education())[0].status,'completed')
})

test('manual education edits detach from onboarding and survive subsequent profile saves',async()=>{
  const user=await seedAccount(db,{google:true})
  await become(db,user)
  await save(payload)
  const row=(await education())[0]
  await db.query('UPDATE public.jobseeker_education SET school_name=$1 WHERE id=$2',['Manual correction',row.id])
  const edited=(await education())[0]
  assert.equal(edited.registration_managed,false)
  assert.equal(edited.registration_slot,null)
  await save({...payload,highest_educational_attainment:'Senior High School Graduate',course_program:'Another course'})
  assert.ok((await education()).some(item=>item.id===row.id && item.school_name==='Manual correction'))
})

test('cross-account education/profile access and private writer invocation are denied',async()=>{
  const owner=await seedAccount(db,{google:true})
  await become(db,owner)
  const profile=await save(payload),row=(await education())[0]
  const other=await seedAccount(db,{google:true})
  await become(db,other)
  assert.deepEqual((await db.query('SELECT id FROM public.jobseeker_education WHERE id=$1',[row.id])).rows,[])
  assert.deepEqual((await db.query('UPDATE public.jobseeker_education SET school_name=$1 WHERE id=$2 RETURNING id',['Other account',row.id])).rows,[])
  await assert.rejects(()=>db.query("INSERT INTO public.jobseeker_education(jobseeker_profile_id,education_level_id,status) VALUES($1,$2,'graduated')",[profile.participant_id,row.education_level_id]))
  await assert.rejects(()=>db.query('SELECT app.save_jobseeker_profile_core($1::jsonb)',[JSON.stringify(payload)]),/permission denied/)
  await become(db,owner,{method:'password'})
  await assert.rejects(()=>save(payload),/Google/)
})

test('consent audit records contain no names, email, birthday or school information',async()=>{
  await db.exec('RESET ROLE')
  const rows=(await db.query("SELECT new_data FROM public.audit_logs WHERE action='jobseeker_profile_consent_affirmed'")).rows
  assert.ok(rows.length>0)
  for(const {new_data:data} of rows) {
    assert.deepEqual(Object.keys(data).sort(),['affirmed','contract_version','source'])
    assert.equal(data.affirmed,true)
  }
})
