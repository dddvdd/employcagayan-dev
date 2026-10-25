import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {sourceDatabase} from '../support/extraction-source-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await sourceDatabase()})
after(async()=>await db?.close())
const source=async(type,id)=>(await db.query('SELECT public.get_ai_extraction_source($1,$2) AS result',[type,id])).rows[0].result
const forbidden=operation=>assert.rejects(operation,e=>e.code==='42501')
async function prepared(){
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'});await db.exec('RESET ROLE')
 await db.query("UPDATE public.jobseeker_profiles SET professional_summary='I can use Microsoft Excel.',career_interests='Office administration',previous_occupation='Office clerk',previous_industry='Retail',desired_occupation='Administrative assistant',skills='Excel',course_program='Business administration',first_name='PRIVATE-NAME',email='private@example.invalid',employment_accommodation_notes='PRIVATE-ACCOMMODATION' WHERE participant_id=$1",[f.profile.participant_id])
 await become(db,admin,{aal:'aal2'});return {...f,admin}
}
test('authorized source uses canonical participant identity and excludes protected structured fields',async()=>{
 const f=await prepared();assert.notEqual(f.user.id,f.profile.participant_id)
 const s=await source('jobseeker_profile',f.profile.participant_id)
 assert.equal(s.entity_id,f.profile.participant_id);assert.equal(s.source_kind,'canonical_employment_fields')
 assert.equal(s.source_version,'employment-extraction-source-v1');assert.match(s.source_hash,/^[a-f0-9]{64}$/)
 assert.ok(s.source_text.includes('I can use Microsoft Excel.'))
 assert.equal(s.source_segments.find(x=>x.field==='previous_occupation').intent,'historical')
 assert.equal(s.source_segments.find(x=>x.field==='desired_occupation').intent,'preference')
 for(const term of ['PRIVATE-NAME','private@example.invalid','PRIVATE-ACCOMMODATION',f.profile.resume_path||'NOT_A_REAL_RESUME_PATH'])assert.equal(JSON.stringify(s).includes(term),false)
 const fields=s.source_segments.map(x=>x.field)
 for(const key of ['first_name','sex','birthdate','email','contact_no','disability_type','resume_path','employment_accommodation_notes'])assert.equal(fields.includes(key),false)
 await forbidden(()=>source('jobseeker_profile',f.user.id))
})
test('source authorization preserves PESO MFA, active confirmation, verified factors and live sessions',async()=>{
 const f=await prepared()
 for(const actor of [
  await seedAccount(db,{role:'admin',active:false}),
  await seedAccount(db,{role:'staff',confirmed:false}),
  await seedAccount(db,{role:'supervisor',factor:false})
 ]){
  await become(db,actor,{aal:'aal2'});await forbidden(()=>source('jobseeker_profile',f.profile.participant_id))
 }
 await become(db,f.admin,{aal:'aal1'});await forbidden(()=>source('jobseeker_profile',f.profile.participant_id))
 await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE id=$1',[f.admin.sessionId])
 await become(db,f.admin,{aal:'aal2'});await forbidden(()=>source('jobseeker_profile',f.profile.participant_id))
})
test('self-service and medical identities cannot generate PESO source previews',async()=>{
 const f=await prepared()
 for(const actor of [f.user,f.owner,await seedAccount(db,{role:'medical'})]){
  await become(db,actor,{aal:'aal2'});await forbidden(()=>source('vacancy',f.vacancy))
 }
 await db.exec('RESET ROLE');const staff=await seedAccount(db,{role:'staff'})
 await become(db,staff,{aal:'aal2'});assert.ok((await source('vacancy',f.vacancy)).source_text.includes('Synthetic vacancy description'))
})
test('municipal source access follows canonical event scope and retains provincial oversight',async()=>{
 const f=await prepared(),municipal=await seedAccount(db,{role:'supervisor'})
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[municipal.id])
 await become(db,municipal,{aal:'aal2'})
 await forbidden(()=>source('jobseeker_profile',f.profile.participant_id));await forbidden(()=>source('vacancy',f.vacancy))
 await db.exec('RESET ROLE');await db.query("UPDATE public.events SET location='Aparri' WHERE id=$1",[f.event])
 await become(db,municipal,{aal:'aal2'});assert.equal((await source('vacancy',f.vacancy)).entity_id,f.vacancy)
 assert.equal((await source('jobseeker_profile',f.profile.participant_id)).entity_id,f.profile.participant_id)
 await db.exec('RESET ROLE');await db.query("UPDATE public.events SET location='Tuguegarao City' WHERE id=$1",[f.event]);await db.query('UPDATE public.profiles SET is_provincial=true WHERE id=$1',[municipal.id])
 await become(db,municipal,{aal:'aal2'});assert.equal((await source('vacancy',f.vacancy)).entity_id,f.vacancy)
})
test('source fingerprints capture selected historical text and isolate unrelated private edits',async()=>{
 const f=await prepared(),one=await source('jobseeker_profile',f.profile.participant_id)
 assert.equal((await source('jobseeker_profile',f.profile.participant_id)).source_hash,one.source_hash)
 await db.exec('RESET ROLE');await db.query("UPDATE public.jobseeker_profiles SET first_name='ANOTHER-PRIVATE-NAME' WHERE participant_id=$1",[f.profile.participant_id])
 await become(db,f.admin,{aal:'aal2'});assert.equal((await source('jobseeker_profile',f.profile.participant_id)).source_hash,one.source_hash)
 await db.exec('RESET ROLE');await db.query("UPDATE public.jobseeker_profiles SET previous_occupation='Bookkeeper' WHERE participant_id=$1",[f.profile.participant_id])
 await become(db,f.admin,{aal:'aal2'});assert.notEqual((await source('jobseeker_profile',f.profile.participant_id)).source_hash,one.source_hash)
 await db.exec('RESET ROLE');const other=(await db.query("INSERT INTO public.vacancy_definitions(employer_id,company_name,position,job_description,place_of_assignment,is_active) VALUES($1,'Synthetic source company','Same source','Same source','Tuguegarao City',true) RETURNING id",[f.company])).rows[0].id
 await db.query("UPDATE public.vacancy_definitions SET position='Same source',job_description='Same source',qualifications=null,requirements_summary=null WHERE id=$1",[f.vacancy])
 await become(db,f.admin,{aal:'aal2'});assert.notEqual((await source('vacancy',f.vacancy)).source_hash,(await source('vacancy',other)).source_hash)
})
test('typed field boundaries prevent identical display text from sharing source fingerprints',async()=>{
 const f=await prepared();await db.exec('RESET ROLE')
 await db.query("UPDATE public.vacancy_definitions SET position='X',job_description=E'A\\n\\nQualifications: B',qualifications=null,requirements_summary=null WHERE id=$1",[f.vacancy])
 await become(db,f.admin,{aal:'aal2'});const a=await source('vacancy',f.vacancy)
 await db.exec('RESET ROLE');await db.query("UPDATE public.vacancy_definitions SET job_description='A',qualifications='B' WHERE id=$1",[f.vacancy])
 await become(db,f.admin,{aal:'aal2'});const b=await source('vacancy',f.vacancy)
 assert.equal(a.source_text,b.source_text);assert.notEqual(a.source_hash,b.source_hash)
})
test('source bounds use browser UTF-16 length and reject oversized input without truncation',async()=>{
 const f=await prepared();await db.exec('RESET ROLE')
 await db.query('UPDATE public.vacancy_definitions SET position=$1,job_description=null,qualifications=null,requirements_summary=null WHERE id=$2',['😀'.repeat(9000),f.vacancy])
 await become(db,f.admin,{aal:'aal2'});const valid=await source('vacancy',f.vacancy);assert.ok(valid.source_text.length<=20000)
 await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET position=$1 WHERE id=$2',['😀'.repeat(14000),f.vacancy])
 await become(db,f.admin,{aal:'aal2'});await assert.rejects(()=>source('vacancy',f.vacancy),e=>e.code==='22001')
})
test('invalid IDs/types are denied uniformly and empty sources remain explicit',async()=>{
 const f=await prepared()
 for(const [type,id] of [['vacancy',crypto.randomUUID()],['jobseeker_profile',crypto.randomUUID()],['jobseeker',f.profile.participant_id],['vacancy',null],[null,f.vacancy]])await forbidden(()=>source(type,id))
 await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET position=$1,job_description=null,qualifications=null,requirements_summary=null WHERE id=$2',[' ',f.vacancy])
 await become(db,f.admin,{aal:'aal2'});const empty=await source('vacancy',f.vacancy)
 assert.equal(empty.source_text,'');assert.deepEqual(empty.source_segments,[])
})
test('source reading creates no runs or suggestions and exposes no private helper grants',async()=>{
 const f=await prepared();const before=(await db.query('SELECT count(*)::int AS n FROM public.ai_extraction_runs')).rows[0].n
 await source('vacancy',f.vacancy);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_extraction_runs')).rows[0].n,before)
 await db.exec('RESET ROLE')
 for(const role of ['anon','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.get_ai_extraction_source(text,uuid)','EXECUTE') AS ok",[role])).rows[0].ok,false)
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'app.build_extraction_source_snapshot(text,uuid)','EXECUTE') AS ok",[role])).rows[0].ok,false)
 assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') AS ok")).rows[0].ok,false)
})
