import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {become} from '../support/identity-database.js'
let db
const files=await readdir(new URL('../../supabase/migrations/',import.meta.url))
before(async()=>{
 db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 await db.exec(await readFile(new URL('../../supabase/migrations/20261013063051_authorized_semantic_pair_similarity.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../supabase/migrations/'+files.find(f=>f.endsWith('_authorized_match_keyword_signals.sql')),import.meta.url),'utf8'))
 // The approved-graph reader has its own real-schema tests. Here its opaque fingerprint is controlled to test stale binding.
 await db.exec("CREATE FUNCTION public.get_approved_skill_relationships(uuid[]) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('snapshot_hash',current_setting('fixture.knowledge_hash',true)) $$")
 await db.exec(await readFile(new URL('../../supabase/migrations/'+files.find(f=>f.endsWith('_source_bound_matching_signals.sql')),import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../supabase/migrations/'+files.find(f=>f.endsWith('_bound_matching_duplicate_pair_cache.sql')),import.meta.url),'utf8'))
 await db.exec('REVOKE USAGE ON SCHEMA app FROM anon,authenticated,service_role')
})
after(async()=>await db?.close())
const bound=async(pairs,skillIds=null,knowledgeHash=null)=>(await db.query('SELECT public.get_bound_match_signals($1::jsonb,$2,$3) result',[JSON.stringify(pairs),skillIds,knowledgeHash])).rows[0].result
async function snapshots(f){
 const job=(await db.query('SELECT public.get_jobseeker_match_profile($1) p',[f.profile.participant_id])).rows[0].p
 const vacancy=(await db.query('SELECT public.get_vacancy_match_profile($1,NULL) p',[f.vacancy])).rows[0].p
 return {job,vacancy,pair:{jobseeker_profile_id:job.participant_id,vacancy_id:vacancy.id,event_vacancy_id:null,
  jobseeker_source_hash:job.match_source_hash,vacancy_source_hash:vacancy.match_source_hash,
  jobseeker_embedding_version:'jobseeker-semantic-v2',vacancy_embedding_version:'vacancy-semantic-v2'}}
}
test('canonical fingerprint ignores object/row order but preserves values, type and duplicate multiplicity',async()=>{
 const fingerprint=async value=>(await db.query('SELECT app.match_source_fingerprint($1::jsonb) h',[JSON.stringify(value)])).rows[0].h
 assert.equal(await fingerprint({a:[{id:1},{id:2}],b:'α'}),await fingerprint({b:'α',a:[{id:2},{id:1}]}))
 assert.notEqual(await fingerprint([1,1]),await fingerprint([1]));assert.notEqual(await fingerprint({a:1}),await fingerprint({a:'1'}))
 assert.match(await fingerprint(null),/^[a-f0-9]{64}$/)
})
test('authorized readers return stable opaque fingerprints and a consistent current bound bundle',async()=>{
 const f=await createRecruitmentFixture(db);await become(db,f.user)
 const first=await snapshots(f),second=await snapshots(f)
 assert.equal(first.job.match_source_hash,second.job.match_source_hash);assert.equal(first.vacancy.match_source_hash,second.vacancy.match_source_hash)
 assert.equal(first.job.match_source_version,'matching-source-v1')
 const [r]=await bound([first.pair]);assert.equal(r.status,'bound');assert.equal(r.keyword.jobseeker_source_hash,first.job.match_source_hash)
 assert.equal(r.semantic.status,'missing');assert.equal(r.knowledge_snapshot_hash,null)
})
test('a profile edit after initial load suppresses both extra signals until the sources are reloaded',async()=>{
 const f=await createRecruitmentFixture(db);await become(db,f.user);const initial=await snapshots(f)
 await db.exec('RESET ROLE');await db.query("UPDATE public.jobseeker_profiles SET first_name='Synthetic changed' WHERE participant_id=$1",[f.profile.participant_id])
 await become(db,f.user);const [stale]=await bound([initial.pair])
 assert.equal(stale.status,'source_changed');assert.equal(stale.keyword,null);assert.equal(stale.semantic,null)
 const fresh=await snapshots(f);assert.notEqual(fresh.job.match_source_hash,initial.job.match_source_hash);assert.equal((await bound([fresh.pair]))[0].status,'bound')
})
test('vacancy edits and dictionary label changes invalidate the old matching source',async()=>{
 const f=await createRecruitmentFixture(db);await become(db,f.user);const initial=await snapshots(f)
 await db.exec('RESET ROLE');await db.query("UPDATE public.vacancy_definitions SET position='Synthetic changed position' WHERE id=$1",[f.vacancy])
 await become(db,f.user);assert.equal((await bound([initial.pair]))[0].status,'source_changed')
 const fresh=await snapshots(f);assert.equal((await bound([fresh.pair]))[0].status,'bound')
 await db.exec('RESET ROLE')
 const occupation=(await db.query('INSERT INTO public.occupations(canonical_name,normalized_name) VALUES($1,$2) RETURNING id',['Synthetic bound '+f.company,'synthetic bound '+f.company])).rows[0].id
 await db.query('UPDATE public.vacancy_definitions SET occupation_id=$2 WHERE id=$1',[f.vacancy,occupation])
 await become(db,f.user);const beforeLabel=await snapshots(f)
 await db.exec('RESET ROLE');await db.query('UPDATE public.occupations SET canonical_name=$2 WHERE id=$1',[occupation,'Synthetic renamed '+f.company])
 await become(db,f.user);assert.equal((await bound([beforeLabel.pair]))[0].status,'source_changed')
})
test('reviewed knowledge fingerprint is checked in the same bound call',async()=>{
 const f=await createRecruitmentFixture(db);await become(db,f.user);const {pair}=await snapshots(f)
 await db.query("SELECT set_config('fixture.knowledge_hash',$1,false)",['a'.repeat(64)])
 assert.equal((await bound([pair],[f.vacancy],'a'.repeat(64)))[0].status,'bound')
 await db.query("SELECT set_config('fixture.knowledge_hash',$1,false)",['b'.repeat(64)])
 const [r]=await bound([pair],[f.vacancy],'a'.repeat(64));assert.equal(r.status,'source_changed');assert.equal(r.semantic,null)
})
test('fingerprints never bypass owner, company pool, MFA or revoked-session guards',async()=>{
 const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db);await become(db,f.user);const {pair}=await snapshots(f)
 await assert.rejects(()=>bound([{...pair,jobseeker_profile_id:other.profile.participant_id}]),e=>e.code==='42501')
 await become(db,f.owner,{aal:'aal1'});await assert.rejects(()=>bound([]),e=>e.code==='42501')
 await become(db,f.owner,{aal:'aal2'});assert.equal((await bound([pair]))[0].status,'bound')
 await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE user_id=$1',[f.owner.id])
 await become(db,f.owner,{aal:'aal2'});await assert.rejects(()=>bound([pair]),e=>e.code==='42501')
})
test('duplicate semantic pairs reuse one read per request without sharing model keys or bypassing guards',async()=>{
 const f=await createRecruitmentFixture(db),other=await createRecruitmentFixture(db)
 await become(db,f.user);const {pair}=await snapshots(f);await db.exec('RESET ROLE')
 const original=(await db.query("SELECT pg_get_functiondef('public.get_pair_semantic_similarity(uuid,uuid,uuid,text,text)'::regprocedure) definition")).rows[0].definition
 await db.exec(`CREATE SEQUENCE public.fixture_semantic_calls;
 CREATE OR REPLACE FUNCTION public.get_pair_semantic_similarity(
  p_jobseeker_profile_id uuid,p_vacancy_definition_id uuid,p_event_vacancy_id uuid DEFAULT NULL,
  p_jobseeker_embedding_version text DEFAULT 'jobseeker-semantic-v1',p_vacancy_embedding_version text DEFAULT 'vacancy-semantic-v1')
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('status','missing','fixture_call',nextval('public.fixture_semantic_calls'))
 $$`)
 const calls=async()=>(await db.query('SELECT CASE WHEN is_called THEN last_value ELSE 0 END n FROM public.fixture_semantic_calls')).rows[0].n
 try{
  await become(db,f.user)
  const repeated=await bound(Array(5).fill(pair))
  assert.equal(repeated.length,5);assert.ok(repeated.every(r=>r.semantic.fixture_call===1))
  await db.exec('RESET ROLE');assert.equal(Number(await calls()),1)
  await become(db,f.user)
  const changedModel={...pair,vacancy_embedding_version:'vacancy-semantic-v3'}
  const mixed=await bound([pair,changedModel,pair,changedModel])
  assert.deepEqual(mixed.map(r=>r.semantic.fixture_call),[2,3,2,3])
  // A fresh request must not reuse the preceding request's cached value.
  assert.equal((await bound([pair]))[0].semantic.fixture_call,4)
  // A later foreign pair must reject the entire batch before any semantic read.
  await assert.rejects(()=>bound([pair,{...pair,jobseeker_profile_id:other.profile.participant_id}]),e=>e.code==='42501')
  const stale=await bound([{...pair,jobseeker_source_hash:'0'.repeat(64)}])
  assert.equal(stale[0].status,'source_changed')
  await db.exec('RESET ROLE');assert.equal(Number(await calls()),4)
 }finally{
  await db.exec('RESET ROLE');await db.exec(original);await db.exec('DROP SEQUENCE public.fixture_semantic_calls')
 }
})

test('request grammar and private/public execution privileges remain bounded',async()=>{
 const f=await createRecruitmentFixture(db);await become(db,f.user);const {pair}=await snapshots(f)
 for(const pairs of [null,{},Array(101).fill(pair),[{...pair,jobseeker_source_hash:null}],[{...pair,query:'private text'}]])
  await assert.rejects(()=>bound(pairs),e=>e.code==='22023')
 await assert.rejects(()=>bound([pair],null,'a'.repeat(64)),e=>e.code==='22023')
 await db.exec('RESET ROLE')
 for(const role of ['anon','service_role']){
  assert.equal((await db.query("SELECT has_function_privilege($1,'public.get_bound_match_signals(jsonb,uuid[],text)','EXECUTE') allowed",[role])).rows[0].allowed,false)
  assert.equal((await db.query("SELECT has_function_privilege($1,'app.match_source_fingerprint(jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false)
 }
 assert.equal((await db.query("SELECT has_function_privilege('authenticated','app.match_source_fingerprint(jsonb)','EXECUTE') allowed")).rows[0].allowed,false)
 assert.equal((await db.query("SELECT prosecdef,provolatile FROM pg_proc WHERE oid='public.get_bound_match_signals(jsonb,uuid[],text)'::regprocedure")).rows[0].prosecdef,false)
 assert.equal((await db.query("SELECT provolatile FROM pg_proc WHERE oid='public.get_bound_match_signals(jsonb,uuid[],text)'::regprocedure")).rows[0].provolatile,'s')
})
