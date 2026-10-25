import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {taxonomyDatabase} from '../support/taxonomy-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await taxonomyDatabase()})
after(async()=>await db?.close())
async function rev(type,id){await db.exec('RESET ROLE');return (await db.query('SELECT public.get_embedding_source_revision($1,$2) AS r',[type,id])).rows[0].r}
async function current(f){const r=await rev('jobseeker_profile',f.profile.participant_id);await db.query("UPDATE public.employment_embeddings SET status='current',source_revision=$1 WHERE id=$2",[r,f.embedding])}
const state=async(id)=>(await db.query('SELECT status FROM public.employment_embeddings WHERE id=$1',[id])).rows[0].status
test('historical dictionary label edit changes canonical text but leaves the old vector current',async()=>{
 const old=await taxonomyDatabase({repair:false})
 try{
  const f=await intelligenceFixture(old)
  await old.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[f.profile.participant_id,f.skill])
  const r=(await old.query("SELECT public.get_embedding_source_revision('jobseeker_profile',$1) AS r",[f.profile.participant_id])).rows[0].r
  await old.query("UPDATE public.employment_embeddings SET status='current',source_revision=$1 WHERE id=$2",[r,f.embedding])
  await old.query("UPDATE public.skills SET canonical_name='Changed synthetic dictionary' WHERE id=$1",[f.skill])
  assert.equal((await old.query('SELECT status FROM public.employment_embeddings WHERE id=$1',[f.embedding])).rows[0].status,'current')
 }finally{await old.close()}
})
test('dictionary edits invalidate only dependent profiles/vacancies; no-op edits preserve fresh caches',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[f.profile.participant_id,f.skill])
 await db.query('INSERT INTO public.vacancy_skills(vacancy_definition_id,skill_id) VALUES($1,$2)',[f.vacancy,f.skill])
 await current(f);const r=await rev('vacancy',f.vacancy)
 const v=(await db.query("INSERT INTO public.employment_embeddings(entity_type,entity_id,embedding_type,source_text,source_hash,embedding,status,source_revision) VALUES('vacancy',$1,'vacancy_match_profile','Synthetic','Synthetic','[.1]','current',$2) RETURNING id",[f.vacancy,r])).rows[0].id
 await db.query('UPDATE public.skills SET canonical_name=canonical_name WHERE id=$1',[f.skill])
 assert.equal(await state(f.embedding),'current');assert.equal(await state(v),'current')
 const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
 await db.query("UPDATE public.skills SET canonical_name='Changed synthetic skill dictionary' WHERE id=$1",[f.skill])
 assert.equal(await state(f.embedding),'stale');assert.equal(await state(v),'stale');assert.equal(await state(other.embedding),'current')
})
test('mapping and source-version edits invalidate linked canonical sources without replacing IDs',async()=>{
 const f=await intelligenceFixture(db)
 await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[f.profile.participant_id,f.skill])
 const source=(await db.query("INSERT INTO public.taxonomy_sources(code,name,version) VALUES('SYNTHETIC','Synthetic test source','fixture-v1') RETURNING id")).rows[0].id
 await current(f)
 const mapping=(await db.query("INSERT INTO public.taxonomy_mappings(taxonomy_source_id,entity_type,entity_id,external_code) VALUES($1,'skill',$2,'synthetic-1') RETURNING id",[source,f.skill])).rows[0].id
 assert.equal(await state(f.embedding),'stale')
 await current(f);await db.query("UPDATE public.taxonomy_sources SET version='fixture-v2' WHERE id=$1",[source]);assert.equal(await state(f.embedding),'stale')
 await current(f);await db.query('DELETE FROM public.taxonomy_mappings WHERE id=$1',[mapping]);assert.equal(await state(f.embedding),'stale')
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.skills WHERE id=$1',[f.skill])).rows[0].n,1)
})
test('dictionary helpers stay private and semantic API defaults select representation v2',async()=>{
 await db.exec('RESET ROLE')
 for(const role of ['anon','authenticated','service_role'])for(const signature of ['app.invalidate_dictionary_dependencies(text,uuid[])','app.invalidate_embedding_dictionary()'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,signature])).rows[0].allowed,false)
 const defaults=(await db.query("SELECT pg_get_function_arguments('public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text)'::regprocedure) AS args")).rows[0].args
 assert.match(defaults,/jobseeker-semantic-v2/);assert.match(defaults,/vacancy-semantic-v2/)
})
test('all 18 dictionary dependency paths invalidate their associated source only',async t=>{
 const relations=[
 ['skills','jobseeker_skills','skill_id'],['occupations','jobseeker_occupation_preferences','occupation_id'],
 ['certifications','jobseeker_certifications','certification_id'],['languages','jobseeker_languages','language_id'],
 ['education_levels','jobseeker_education','education_level_id'],['industries','jobseeker_industry_preferences','industry_id'],
 ['employment_types','jobseeker_employment_type_preferences','employment_type_id'],['work_arrangements','jobseeker_work_arrangement_preferences','work_arrangement_id'],
 ['skills','vacancy_skills','skill_id'],['certifications','vacancy_certification_requirements','certification_id'],
 ['languages','vacancy_language_requirements','language_id'],['education_levels','vacancy_education_requirements','education_level_id'],
 ['occupations','vacancy_experience_requirements','occupation_id'],['industries','vacancy_experience_requirements','industry_id'],
 ['occupations','vacancy_definitions','occupation_id'],['industries','vacancy_definitions','industry_id'],
 ['employment_types','vacancy_definitions','employment_type_id'],['work_arrangements','vacancy_definitions','work_arrangement_id']]
 for(const [dictionary,table,key]of relations)await t.test(dictionary+' -> '+table,async()=>{
  const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
  let id,label
  if(dictionary==='skills'){id=f.skill;label='canonical_name'}
  else if(dictionary==='certifications'){id=f.certification;label='canonical_name'}
  else if(dictionary==='education_levels'){id=(await db.query('SELECT id FROM public.education_levels LIMIT 1')).rows[0].id;label='name'}
  else if(['occupations','industries'].includes(dictionary)){id=(await db.query('INSERT INTO public.'+dictionary+"(canonical_name,normalized_name) VALUES('Synthetic dependency','synthetic dependency') RETURNING id")).rows[0].id;label='canonical_name'}
  else{id=(await db.query('INSERT INTO public.'+dictionary+"(code,name) VALUES(gen_random_uuid()::text,'Synthetic dependency') RETURNING id")).rows[0].id;label='name'}
  const vacancy=table.startsWith('vacancy_'),type=vacancy?'vacancy':'jobseeker_profile',entity=vacancy?f.vacancy:f.profile.participant_id
  if(table==='vacancy_definitions')await db.query('UPDATE public.vacancy_definitions SET '+key+'=$1 WHERE id=$2',[id,f.vacancy])
  else await db.query('INSERT INTO public.'+table+'('+(vacancy?'vacancy_definition_id':'jobseeker_profile_id')+','+key+') VALUES($1,$2)',[entity,id])
  let embedding=f.embedding
  if(vacancy){
   const r=await rev(type,entity)
   embedding=(await db.query("INSERT INTO public.employment_embeddings(entity_type,entity_id,embedding_type,source_text,source_hash,embedding,status,source_revision) VALUES('vacancy',$1,'vacancy_match_profile','Synthetic','Synthetic','[.1]','current',$2) RETURNING id",[entity,r])).rows[0].id
  }else await current(f)
  await db.query('UPDATE public.'+dictionary+' SET '+label+'='+label+' WHERE id=$1',[id]);assert.equal(await state(embedding),'current')
  await db.query('UPDATE public.'+dictionary+' SET '+label+"='Changed synthetic dependency' WHERE id=$1",[id])
  assert.equal(await state(embedding),'stale');assert.equal(await state(other.embedding),'current')
 })
})
