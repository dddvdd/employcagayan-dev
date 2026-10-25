import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {requirementDatabase} from '../support/requirement-review-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db;before(async()=>{db=await requirementDatabase()});after(async()=>await db?.close())
async function proposal(type='skill'){
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'});await db.exec('RESET ROLE')
 const run=(await db.query("INSERT INTO public.ai_extraction_runs(entity_type,entity_id,extraction_type,provider,model,input_hash) VALUES('vacancy',$1,'requirements','mock','synthetic',gen_random_uuid()::text) RETURNING id",[f.vacancy])).rows[0].id
 const suggestion=(await db.query("INSERT INTO public.ai_extraction_suggestions(run_id,entity_type,entity_id,suggestion_type,raw_term,importance,provenance) VALUES($1,'vacancy',$2,$3,'Synthetic requirement','review_required','explicit') RETURNING id",[run,f.vacancy,type])).rows[0].id
 await become(db,admin,{aal:'aal2'});return {...f,admin,suggestion}
}
const edit=async(f,target,priority='required',months=null)=>(await db.query('SELECT public.edit_ai_requirement_suggestion($1,$2,$3,$4,$5) AS r',[f.suggestion,'Reviewed synthetic requirement',target,priority,months])).rows[0].r
test('human priority correction is atomic with canonical acceptance',async()=>{
 const f=await proposal();assert.equal((await edit(f,f.skill,'preferred')).success,true);await db.exec('RESET ROLE')
 assert.equal((await db.query('SELECT importance FROM public.vacancy_skills WHERE vacancy_definition_id=$1 AND skill_id=$2',[f.vacancy,f.skill])).rows[0].importance,'preferred')
 const suggestion=(await db.query('SELECT importance,review_status,reviewed_by,edited_term FROM public.ai_extraction_suggestions WHERE id=$1',[f.suggestion])).rows[0]
 assert.equal(suggestion.importance,'preferred');assert.equal(suggestion.reviewed_by,f.admin.id);assert.equal(suggestion.review_status,'accepted');assert.equal(suggestion.edited_term,'Reviewed synthetic requirement')
})
test('explicit zero and positive minimum months are retained while missing/negative input is denied',async()=>{
 for(const months of [0,24]){
  const f=await proposal('experience_requirement');await db.exec('RESET ROLE')
  const occupation=(await db.query("INSERT INTO public.occupations(canonical_name,normalized_name) VALUES($1,$1) RETURNING id",['Synthetic occupation '+crypto.randomUUID()])).rows[0].id
  await become(db,f.admin,{aal:'aal2'});assert.equal((await edit(f,occupation,'required',months)).success,true);await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT minimum_months FROM public.vacancy_experience_requirements WHERE vacancy_definition_id=$1',[f.vacancy])).rows[0].minimum_months,months)
 }
 const f=await proposal('experience_requirement')
 for(const months of [null,-1])await assert.rejects(()=>edit(f,f.skill,'required',months),e=>e.code==='22023')
})
test('failed canonical acceptance rolls back reviewed details and retains pending status',async()=>{
 const f=await proposal();const result=await edit(f,crypto.randomUUID(),'preferred')
 assert.equal(result.success,undefined);assert.ok(result.error)
 const row=(await db.query('SELECT importance,minimum_months,review_status,edited_term FROM public.ai_extraction_suggestions WHERE id=$1',[f.suggestion])).rows[0]
 assert.deepEqual(row,{importance:'review_required',minimum_months:null,review_status:'pending',edited_term:null})
})
test('MFA and employer organization isolation remain enforced for detail edits',async()=>{
 const f=await proposal();await become(db,f.admin,{aal:'aal1'});await assert.rejects(()=>edit(f,f.skill),e=>e.code==='42501')
 const outsider=await seedAccount(db,{role:'employer'});await db.exec('RESET ROLE');await db.query("INSERT INTO public.employers(registered_user_id,company_name,registration_status,is_active) VALUES($1,'Synthetic foreign company','approved',true)",[outsider.id])
 await become(db,outsider,{aal:'aal2'});await assert.rejects(()=>edit(f,f.skill),e=>e.code==='42501')
 await become(db,f.owner,{aal:'aal2'});assert.equal((await edit(f,f.skill)).success,true)
})
test('only vacancy requirements can change priority and months; repeated review remains first-writer-wins',async()=>{
 const f=await proposal();await assert.rejects(()=>edit(f,f.skill,'review_required'),e=>e.code==='22023')
 await assert.rejects(()=>edit(f,f.skill,'required',12),e=>e.code==='22023')
 assert.equal((await edit(f,f.skill,'required')).success,true);assert.equal((await edit(f,f.skill,'preferred')).error,'Already reviewed')
 assert.equal((await db.query('SELECT importance FROM public.ai_extraction_suggestions WHERE id=$1',[f.suggestion])).rows[0].importance,'required')
 const g=await proposal();await db.exec('RESET ROLE');await db.query("UPDATE public.ai_extraction_suggestions SET entity_type='jobseeker_profile',entity_id=$1 WHERE id=$2",[g.profile.participant_id,g.suggestion])
 await become(db,g.admin,{aal:'aal2'});await assert.rejects(()=>edit(g,g.skill),e=>e.code==='22023')
})
test('detail entrypoint denies anonymous/service execution and preserves private schema restrictions',async()=>{
 const f=await proposal();await db.exec('RESET ROLE')
 for(const role of ['anon','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.edit_ai_requirement_suggestion(uuid,text,uuid,text,integer)','EXECUTE') AS ok",[role])).rows[0].ok,false)
 assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') AS ok")).rows[0].ok,false)
})

test('managed requirement detail edits remain blocked after the canonical source changes',async()=>{
 const f=await proposal()
 await become(db,f.admin,{aal:'aal2',extras:{exp:Math.floor(Date.now()/1000)+3600}})
 const source=(await db.query("SELECT public.get_ai_extraction_source('vacancy',$1) AS r",[f.vacancy])).rows[0].r
 const managed=(await db.query("SELECT public.begin_ai_extraction('vacancy',$1,$2) AS r",[f.vacancy,source.source_hash])).rows[0].r
 await db.exec('RESET ROLE;SET ROLE service_role');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})])
 const output={extraction_version:'ai-extraction-v1',occupations:[],skills:[{raw_term:'Synthetic requirement',confidence:.9,provenance:'explicit',source_text_fragment:source.source_text,resolution_status:'RESOLVED',canonical_id:f.skill,importance:'review_required'}],certifications:[],education_requirements:[],experience_requirements:[],industries:[]}
 await db.query('SELECT public.complete_ai_extraction($1,$2,$3::jsonb)',[managed.run_id,managed.lease_token,JSON.stringify(output)])
 await db.exec('RESET ROLE');const id=(await db.query('SELECT id FROM public.ai_extraction_suggestions WHERE run_id=$1',[managed.run_id])).rows[0].id
 await db.query("UPDATE public.vacancy_definitions SET job_description='Changed employment text' WHERE id=$1",[f.vacancy])
 await become(db,f.admin,{aal:'aal2'})
 await assert.rejects(()=>edit({...f,suggestion:id},f.skill,'preferred'),e=>e.code==='55000')
 assert.equal((await db.query('SELECT review_status,importance FROM public.ai_extraction_suggestions WHERE id=$1',[id])).rows[0].review_status,'pending')
})
