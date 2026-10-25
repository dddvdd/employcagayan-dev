import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {freshnessDatabase} from '../support/freshness-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await freshnessDatabase()})
after(async()=>await db?.close())
const revision=async(type,id)=>{await db.exec('RESET ROLE');return (await db.query('SELECT public.get_embedding_source_revision($1,$2) AS revision',[type,id])).rows[0].revision}
const state=async(id)=>(await db.query('SELECT status,source_revision FROM public.employment_embeddings WHERE id=$1',[id])).rows[0]
async function current(f){const r=await revision('jobseeker_profile',f.profile.participant_id);await db.query("UPDATE public.employment_embeddings SET status='current',source_revision=$1 WHERE id=$2",[r,f.embedding]);return r}
test('signed Google owner material changes invalidate; name, birthdate and no-op preserve the cache',async()=>{
 const f=await intelligenceFixture(db),r=await current(f)
 await become(db,f.user)
 await db.query("UPDATE public.jobseeker_profiles SET first_name='Edited',birthdate='2001-01-01',years_of_experience=years_of_experience WHERE participant_id=$1",[f.profile.participant_id])
 assert.equal((await state(f.embedding)).status,'current');assert.equal(await revision('jobseeker_profile',f.profile.participant_id),r)
 await become(db,f.user);await db.query('UPDATE public.jobseeker_profiles SET years_of_experience=2 WHERE participant_id=$1',[f.profile.participant_id])
 assert.equal((await state(f.embedding)).status,'stale');assert.equal(await revision('jobseeker_profile',f.profile.participant_id),r+1)
})
test('qualification and preference insert, update, no-op, reassignment and deletion invalidate both canonical parents',async t=>{
 const f=await intelligenceFixture(db),g=await intelligenceFixture(db)
 const refs={skill:f.skill,certification:f.certification}
 refs.education=(await db.query('SELECT id FROM public.education_levels LIMIT 1')).rows[0].id
 refs.language=(await db.query("INSERT INTO public.languages(code,name) VALUES('freshness','Synthetic language') RETURNING id")).rows[0].id
 for(const table of ['occupations','industries'])refs[table]=(await db.query('INSERT INTO public.'+table+"(canonical_name,normalized_name) VALUES('Synthetic freshness','synthetic freshness') RETURNING id")).rows[0].id
 for(const table of ['employment_types','work_arrangements'])refs[table]=(await db.query('INSERT INTO public.'+table+"(code,name) VALUES('freshness','Synthetic freshness') RETURNING id")).rows[0].id
 const cases=[
 ['jobseeker_education','jobseeker_profile_id',{education_level_id:refs.education},'school_name','Edited school'],
 ['jobseeker_skills','jobseeker_profile_id',{skill_id:refs.skill},'years_experience',2],
 ['jobseeker_certifications','jobseeker_profile_id',{certification_id:refs.certification},'credential_name_override','Edited certificate'],
 ['jobseeker_languages','jobseeker_profile_id',{language_id:refs.language},'speaking_proficiency','advanced'],
 ['work_experiences','participant_id',{employer_name:'Synthetic',position_title:'Synthetic'},'position_title','Edited role'],
 ['jobseeker_occupation_preferences','jobseeker_profile_id',{occupation_id:refs.occupations},'priority',2],
 ['jobseeker_industry_preferences','jobseeker_profile_id',{industry_id:refs.industries},'priority',2],
 ['jobseeker_employment_type_preferences','jobseeker_profile_id',{employment_type_id:refs.employment_types},'priority',2],
 ['jobseeker_work_arrangement_preferences','jobseeker_profile_id',{work_arrangement_id:refs.work_arrangements},'priority',2],
 ['jobseeker_location_preferences','jobseeker_profile_id',{municipality_city:'Tuguegarao City'},'municipality_city','Aparri'],
 ['vacancy_skills','vacancy_definition_id',{skill_id:refs.skill},'importance','preferred'],
 ['vacancy_education_requirements','vacancy_definition_id',{education_level_id:refs.education},'importance','preferred'],
 ['vacancy_certification_requirements','vacancy_definition_id',{certification_id:refs.certification},'importance','preferred'],
 ['vacancy_language_requirements','vacancy_definition_id',{language_id:refs.language},'importance','preferred'],
 ['vacancy_experience_requirements','vacancy_definition_id',{minimum_months:12},'minimum_months',24]]
 for(const [table,key,values,field,value] of cases)await t.test(table,async()=>{
  const type=key==='vacancy_definition_id'?'vacancy':'jobseeker_profile',a=type==='vacancy'?f.vacancy:f.profile.participant_id,b=type==='vacancy'?g.vacancy:g.profile.participant_id
  const before=await revision(type,a),cols=[key,...Object.keys(values)],args=[a,...Object.values(values)]
  const row=(await db.query('INSERT INTO public.'+table+'('+cols.join(',')+') VALUES('+args.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING id',args)).rows[0].id
  assert.equal(await revision(type,a),before+1)
  await db.query('UPDATE public.'+table+' SET '+field+'=$1 WHERE id=$2',[value,row]);const edited=await revision(type,a);assert.equal(edited,before+2)
  await db.query('UPDATE public.'+table+' SET '+field+'='+field+' WHERE id=$1',[row]);assert.equal(await revision(type,a),edited)
  const oldB=await revision(type,b)
  await db.query('UPDATE public.'+table+' SET '+key+'=$1 WHERE id=$2',[b,row])
  assert.equal(await revision(type,a),edited+1);assert.equal(await revision(type,b),oldB+1)
  await db.query('DELETE FROM public.'+table+' WHERE id=$1',[row]);assert.equal(await revision(type,b),oldB+2)
 })
})
test('vacancy description update advances revision and refuses obsolete current writes',async()=>{
 const f=await intelligenceFixture(db),r=await revision('vacancy',f.vacancy)
 await db.query("INSERT INTO public.employment_embeddings(entity_type,entity_id,embedding_type,source_text,source_hash,embedding,status,source_revision) VALUES('vacancy',$1,'vacancy_match_profile','Synthetic','Synthetic','[.1]','current',$2)",[f.vacancy,r])
 await become(db,f.owner,{aal:'aal2'})
 await db.query("UPDATE public.vacancy_definitions SET job_description='Edited synthetic vacancy description, never a real job opening.' WHERE id=$1",[f.vacancy])
 assert.equal(await revision('vacancy',f.vacancy),r+1)
 await assert.rejects(()=>db.query("UPDATE public.employment_embeddings SET status='current',source_revision=$1 WHERE entity_type='vacancy' AND entity_id=$2",[r,f.vacancy]),e=>e.code==='55000')
 await db.query("UPDATE public.employment_embeddings SET status='current',source_revision=$1 WHERE entity_type='vacancy' AND entity_id=$2",[r+1,f.vacancy])
})
test('worker CAS rejects generation from an old source; ordinary roles cannot call worker RPCs or read controls',async()=>{
 const f=await intelligenceFixture(db),r=await revision('jobseeker_profile',f.profile.participant_id)
 await db.query('UPDATE public.jobseeker_profiles SET years_of_experience=3 WHERE participant_id=$1',[f.profile.participant_id])
 await assert.rejects(()=>db.query('SELECT public.store_current_embedding($1::jsonb,$2)',[JSON.stringify({entity_type:'jobseeker_profile',entity_id:f.profile.participant_id}),r]),e=>e.code==='55000')
 for(const role of ['anon','authenticated','service_role']){
  const rows=(await db.query("SELECT has_function_privilege($1,'public.get_embedding_source_revision(public.entity_type,uuid)','EXECUTE') AS read,has_function_privilege($1,'public.store_current_embedding(jsonb,bigint)','EXECUTE') AS write,has_table_privilege($1,'app.embedding_source_revisions','SELECT') AS controls",[role])).rows[0]
  assert.equal(rows.read,role==='service_role');assert.equal(rows.write,role==='service_role');assert.equal(rows.controls,false)
 }
 await become(db,f.user);await assert.rejects(()=>db.query("SELECT public.get_embedding_source_revision('jobseeker_profile',$1)",[f.profile.participant_id]),e=>e.code==='42501')
})
test('deleting a canonical parent removes its derived vector and control row even with child cascades',async()=>{
 const f=await intelligenceFixture(db)
 await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[f.profile.participant_id,f.skill])
 await db.query('DELETE FROM public.jobseeker_profiles WHERE participant_id=$1',[f.profile.participant_id])
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.employment_embeddings WHERE entity_id=$1',[f.profile.participant_id])).rows[0].n,0)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM app.embedding_source_revisions WHERE entity_id=$1',[f.profile.participant_id])).rows[0].n,0)
})
test('historical invoker guards fail under the actual private-schema ACL; repair keeps that schema private',async()=>{
 const {intelligenceDatabase,INTELLIGENCE_MIGRATION}=await import('../support/intelligence-database.js')
 const old=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 try{
  const f=await intelligenceFixture(old)
  await old.exec('REVOKE USAGE ON SCHEMA app FROM authenticated')
  await become(old,f.user)
  await assert.rejects(()=>old.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[f.profile.participant_id,f.skill]),e=>e.code==='42501'&&e.message.includes('schema app'))
 }finally{await old.close()}
 await db.exec('RESET ROLE')
 assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') AS allowed")).rows[0].allowed,false)
})
test('private-schema owner qualification writes work while provenance spoofing and MFA bypass stay denied',async()=>{
 const f=await intelligenceFixture(db),lang=(await db.query("INSERT INTO public.languages(code,name) VALUES('acl','Synthetic ACL language') RETURNING id")).rows[0].id
 await become(db,f.user)
 const skill=(await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2) RETURNING *',[f.profile.participant_id,f.skill])).rows[0]
 assert.equal(skill.source,'self_reported')
 await db.query('INSERT INTO public.jobseeker_languages(jobseeker_profile_id,language_id) VALUES($1,$2)',[f.profile.participant_id,lang])
 await db.query('INSERT INTO public.jobseeker_certifications(jobseeker_profile_id,certification_id) VALUES($1,$2)',[f.profile.participant_id,f.certification])
 await assert.rejects(()=>db.query("UPDATE public.jobseeker_skills SET source='admin_entered' WHERE id=$1",[skill.id]),e=>e.code==='42501')
 const admin=await seedAccount(db,{role:'admin'})
 await become(db,admin,{aal:'aal1'})
 await assert.rejects(()=>db.query('SELECT public.qualification_admin_write_satisfied() AS allowed'),e=>e.code==='42501')
 await become(db,admin,{aal:'aal2'})
 assert.equal((await db.query('SELECT public.qualification_admin_write_satisfied() AS allowed')).rows[0].allowed,true)
 await db.query("UPDATE public.jobseeker_skills SET source='admin_entered',verification_status='verified' WHERE id=$1",[skill.id])
 await become(db,f.user)
 await db.query('UPDATE public.jobseeker_skills SET years_experience=4 WHERE id=$1',[skill.id])
 const edited=(await db.query('SELECT source,verification_status FROM public.jobseeker_skills WHERE id=$1',[skill.id])).rows[0]
 assert.deepEqual(edited,{source:'self_reported',verification_status:'unverified'})
 await db.exec('RESET ROLE')
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.qualification_admin_write_satisfied()','EXECUTE') AS allowed")).rows[0].allowed,false)
 for(const fn of ['guard_direct_skill_provenance','guard_direct_language_provenance','guard_direct_certification_provenance'])assert.equal((await db.query("SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure",['app.'+fn+'()'])).rows[0].prosecdef,false)
})
