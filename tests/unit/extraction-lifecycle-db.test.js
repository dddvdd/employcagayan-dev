import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {lifecycleDatabase} from '../support/extraction-lifecycle-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await lifecycleDatabase()})
after(async()=>await db?.close())
async function actor(a,aal='aal2'){await become(db,a,{aal,extras:{exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),iss:'https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1'}})}
async function worker(){await db.exec('RESET ROLE; SET ROLE service_role');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})])}
const getSource=async(type,id)=>(await db.query('SELECT public.get_ai_extraction_source($1,$2) AS r',[type,id])).rows[0].r
const begin=async(type,id,hash)=>(await db.query('SELECT public.begin_ai_extraction($1,$2,$3) AS r',[type,id,hash])).rows[0].r
const output=()=>({extraction_version:'ai-extraction-v1',occupations:[],skills:[],certifications:[],education_requirements:[],experience_requirements:[],industries:[]})
const complete=async(r,payload)=>(await db.query('SELECT public.complete_ai_extraction($1,$2,$3::jsonb) AS r',[r.run_id,r.lease_token,JSON.stringify(payload)])).rows[0].r
async function fixture(){
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'});await db.exec('RESET ROLE')
 await db.query("UPDATE public.jobseeker_profiles SET professional_summary='I can use Synthetic Excel.',career_interests='Office administration',previous_occupation='Office clerk' WHERE participant_id=$1",[f.profile.participant_id])
 await actor(admin);const source=await getSource('jobseeker_profile',f.profile.participant_id)
 const run=await begin('jobseeker_profile',f.profile.participant_id,source.source_hash)
 return {...f,admin,source,managed:run}
}
const skillProposal=()=>({raw_term:'Synthetic Excel',confidence:.9,provenance:'explicit',source_text_fragment:'I can use Synthetic Excel.'})
test('managed begins bind source and actor, serialize cached processing and charge once',async()=>{
 const f=await fixture();assert.equal(f.managed.status,'processing');assert.equal(f.managed.cached,false);assert.ok(f.managed.lease_token)
 const cached=await begin('jobseeker_profile',f.profile.participant_id,f.source.source_hash)
 assert.equal(cached.run_id,f.managed.run_id);assert.equal(cached.cached,true);assert.equal(cached.lease_token,undefined)
 await db.exec('RESET ROLE');const work=(await db.query('SELECT actor_claims FROM app.extraction_work WHERE run_id=$1',[f.managed.run_id])).rows[0].actor_claims
 assert.equal(work.sub,f.admin.id);assert.equal(work.session_id,f.admin.sessionId)
 assert.equal(work.user_metadata,undefined);assert.equal(work.email,undefined)
 assert.equal((await db.query('SELECT request_count FROM public.ai_extraction_rate_limit WHERE user_id=$1',[f.admin.id])).rows[0].request_count,1)
})
test('source confirmation, MFA and empty sources fail before creating paid work',async()=>{
 const f=await fixture();await assert.rejects(()=>begin('jobseeker_profile',f.profile.participant_id,'0'.repeat(64)),e=>e.code==='55000')
 await actor(f.admin,'aal1');await assert.rejects(()=>begin('jobseeker_profile',f.profile.participant_id,f.source.source_hash),e=>e.code==='42501')
 await actor(f.admin);await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET position=$1,job_description=null,qualifications=null,requirements_summary=null WHERE id=$2',[' ',f.vacancy])
 await actor(f.admin);const empty=await getSource('vacancy',f.vacancy);await assert.rejects(()=>begin('vacancy',f.vacancy,empty.source_hash),e=>e.code==='22023')
})
test('only trusted completion can persist pending proposals and no qualification is written',async()=>{
 const f=await fixture(),payload=output();payload.skills=[skillProposal()]
 await assert.rejects(()=>complete(f.managed,payload),e=>e.code==='42501')
 await worker();const result=await complete(f.managed,payload);assert.equal(result.status,'completed');assert.equal(result.suggestion_count,1)
 assert.deepEqual((await db.query("SELECT auth.jwt() AS claims")).rows[0].claims,{role:'service_role'})
 await db.exec('RESET ROLE');const row=(await db.query('SELECT * FROM public.ai_extraction_suggestions WHERE run_id=$1',[f.managed.run_id])).rows[0]
 assert.equal(row.review_status,'pending');assert.equal(row.reviewed_by,null);assert.equal(row.producer_version,'employment-extraction-producer-v1')
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.jobseeker_skills WHERE jobseeker_profile_id=$1',[f.profile.participant_id])).rows[0].n,0)
 await actor(f.admin);assert.equal((await begin('jobseeker_profile',f.profile.participant_id,f.source.source_hash)).cached,true)
})
test('a late invalid proposal rolls back earlier inserts and completed status',async()=>{
 const f=await fixture(),payload=output();payload.skills=[skillProposal(),{...skillProposal(),source_text_fragment:'Invented source'}]
 await worker();await assert.rejects(()=>complete(f.managed,payload),e=>e.code==='22023')
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_extraction_suggestions WHERE run_id=$1',[f.managed.run_id])).rows[0].n,0)
 assert.equal((await db.query('SELECT status FROM public.ai_extraction_runs WHERE id=$1',[f.managed.run_id])).rows[0].status,'processing')
})
test('worker completion rechecks actual source, session revocation and account activation',async()=>{
 for(const change of ['source','session','inactive']){
  const f=await fixture();await db.exec('RESET ROLE')
  if(change==='source')await db.query("UPDATE public.jobseeker_profiles SET professional_summary='Changed source' WHERE participant_id=$1",[f.profile.participant_id])
  if(change==='session')await db.query('DELETE FROM auth.sessions WHERE id=$1',[f.admin.sessionId])
  if(change==='inactive')await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[f.admin.id])
  await worker();await assert.rejects(()=>complete(f.managed,output()),e=>e.code===(change==='source'?'55000':'42501'))
 }
})
test('expired/replaced leases fail and retries preserve run identity without accepting an old callback',async()=>{
 const f=await fixture();await db.exec('RESET ROLE');await db.query("UPDATE app.extraction_work SET lease_expires_at=now()-interval '1 minute' WHERE run_id=$1",[f.managed.run_id])
 await worker();await assert.rejects(()=>complete(f.managed,output()),e=>e.code==='55000')
 await actor(f.admin);const retry=await begin('jobseeker_profile',f.profile.participant_id,f.source.source_hash)
 assert.equal(retry.run_id,f.managed.run_id);assert.notEqual(retry.lease_token,f.managed.lease_token)
 await worker();await assert.rejects(()=>complete(f.managed,output()),e=>e.code==='42501')
 assert.equal((await complete(retry,output())).suggestion_count,0)
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT request_count FROM public.ai_extraction_runs WHERE id=$1',[retry.run_id])).rows[0].request_count,2)
})
test('failure classifications are generic, retryable and cannot downgrade completed work',async()=>{
 const f=await fixture();await worker()
 await assert.rejects(()=>db.query('SELECT public.fail_ai_extraction($1,$2,$3)',[f.managed.run_id,f.managed.lease_token,'private provider secret']),e=>e.code==='22023')
 const failure=(await db.query('SELECT public.fail_ai_extraction($1,$2,$3) AS r',[f.managed.run_id,f.managed.lease_token,'provider_error'])).rows[0].r;assert.equal(failure.status,'failed')
 await actor(f.admin);const retry=await begin('jobseeker_profile',f.profile.participant_id,f.source.source_hash)
 await worker();await complete(retry,output())
 assert.equal((await db.query('SELECT public.fail_ai_extraction($1,$2,$3) AS r',[retry.run_id,retry.lease_token,'provider_error'])).rows[0].r.status,'completed')
})
test('direct administrator writes cannot forge or change managed records',async()=>{
 const f=await fixture();await assert.rejects(()=>db.query("UPDATE public.ai_extraction_runs SET producer_version=null,status='completed' WHERE id=$1",[f.managed.run_id]),e=>e.code==='42501')
 await assert.rejects(()=>db.query('DELETE FROM public.ai_extraction_runs WHERE id=$1',[f.managed.run_id]),e=>e.code==='42501')
 await assert.rejects(()=>db.query("INSERT INTO public.ai_extraction_suggestions(run_id,entity_type,entity_id,suggestion_type,raw_term) VALUES($1,'jobseeker_profile',$2,'skill','Forged')",[f.managed.run_id,f.profile.participant_id]),e=>e.code==='42501')
})
test('active canonical targets are revalidated and acceptance remains unverified and source-fresh',async()=>{
 const f=await fixture(),payload=output();payload.skills=[{...skillProposal(),resolution_status:'RESOLVED',canonical_id:f.skill,canonical_name:'Forged name'}]
 await worker();await complete(f.managed,payload);await db.exec('RESET ROLE')
 const suggestion=(await db.query('SELECT * FROM public.ai_extraction_suggestions WHERE run_id=$1',[f.managed.run_id])).rows[0]
 assert.notEqual(suggestion.canonical_name,'Forged name')
 await actor(f.admin);const accepted=(await db.query('SELECT public.accept_ai_suggestion($1) AS r',[suggestion.id])).rows[0].r
 assert.equal(accepted.wrote_canonical,true)
 assert.deepEqual((await db.query('SELECT source,verification_status FROM public.jobseeker_skills WHERE jobseeker_profile_id=$1 AND skill_id=$2',[f.profile.participant_id,f.skill])).rows[0],{source:'llm_inferred',verification_status:'unverified'})
 const g=await fixture(),other=output();other.skills=[{...skillProposal(),resolution_status:'RESOLVED',canonical_id:g.skill}]
 await worker();await complete(g.managed,other);await db.exec('RESET ROLE')
 const id=(await db.query('SELECT id FROM public.ai_extraction_suggestions WHERE run_id=$1',[g.managed.run_id])).rows[0].id
 await db.query("UPDATE public.jobseeker_profiles SET professional_summary='New employment details' WHERE participant_id=$1",[g.profile.participant_id])
 await actor(g.admin);await assert.rejects(()=>db.query('SELECT public.accept_ai_suggestion($1)',[id]),e=>e.code==='55000')
 assert.equal((await db.query('SELECT public.reject_ai_suggestion($1) AS r',[id])).rows[0].r.success,true)
})
test('managed ambiguous intent does not create career preferences while explicit source preferences can',async()=>{
 for(const [field,expected] of [['previous_occupation',false],['professional_summary',false],['desired_occupation',true]]){
  const f=await fixture();await db.exec('RESET ROLE')
  await db.query('UPDATE public.jobseeker_profiles SET professional_summary=null,previous_occupation=null,desired_occupation=null,career_interests=null WHERE participant_id=$1',[f.profile.participant_id])
  await db.query('UPDATE public.jobseeker_profiles SET '+field+'=$1 WHERE participant_id=$2',['Synthetic role',f.profile.participant_id])
  const occupation=(await db.query("INSERT INTO public.occupations(canonical_name,normalized_name) VALUES($1,$2) RETURNING id",['Synthetic role '+crypto.randomUUID(),'synthetic '+crypto.randomUUID()])).rows[0].id
  await actor(f.admin);const s=await getSource('jobseeker_profile',f.profile.participant_id),r=await begin('jobseeker_profile',f.profile.participant_id,s.source_hash),payload=output()
  payload.occupations=[{raw_term:'Synthetic role',confidence:.9,provenance:'explicit',source_text_fragment:'Synthetic role',resolution_status:'RESOLVED',canonical_id:occupation}]
  await worker();await complete(r,payload);await db.exec('RESET ROLE');const id=(await db.query('SELECT id FROM public.ai_extraction_suggestions WHERE run_id=$1',[r.run_id])).rows[0].id
  await actor(f.admin);assert.equal((await db.query('SELECT public.accept_ai_suggestion($1) AS r',[id])).rows[0].r.wrote_canonical,expected)
 }
})
test('source leases remain private and worker execution is not granted to ordinary users',async()=>{
 const f=await fixture();await assert.rejects(()=>db.query('SELECT source_snapshot FROM app.extraction_work'),e=>e.code==='42501')
 await db.exec('RESET ROLE')
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.complete_ai_extraction(uuid,uuid,jsonb,integer,integer,integer)','EXECUTE') AS ok",[role])).rows[0].ok,false)
 assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') AS ok")).rows[0].ok,false)
})

test('managed preview metadata and legacy review behavior remain compatible',async()=>{
 const f=await fixture(),payload=output();payload.skills=[skillProposal()]
 await worker();await complete(f.managed,payload);await actor(f.admin)
 const list=(await db.query("SELECT public.list_pending_suggestions_v2('jobseeker_profile',$1,null) AS r",[f.profile.participant_id])).rows[0].r
 assert.equal(list.find(s=>s.run_id===f.managed.run_id).producer_version,'employment-extraction-producer-v1')
 assert.equal(list.find(s=>s.id===f.suggestion).producer_version,null)
 await db.exec('RESET ROLE');const occupation=(await db.query("INSERT INTO public.occupations(canonical_name,normalized_name) VALUES($1,$1) RETURNING id",['Synthetic legacy '+crypto.randomUUID()])).rows[0].id
 await db.query("UPDATE public.ai_extraction_suggestions SET suggestion_type='occupation',canonical_id=$1,source_text_fragment='Interested in this role.',source_intent='unknown' WHERE id=$2",[occupation,f.suggestion])
 await actor(f.admin);assert.equal((await db.query('SELECT public.accept_ai_suggestion($1) AS r',[f.suggestion])).rows[0].r.wrote_canonical,true)
})
test('inactive resolution targets and oversized or malformed batches fail atomically',async()=>{
 const f=await fixture();await db.exec('RESET ROLE');await db.query('UPDATE public.skills SET is_active=false WHERE id=$1',[f.skill])
 const inactive=output();inactive.skills=[{...skillProposal(),resolution_status:'RESOLVED',canonical_id:f.skill}]
 await worker();await assert.rejects(()=>complete(f.managed,inactive),e=>e.code==='22023')
 const tooMany=output();tooMany.skills=Array.from({length:101},()=>skillProposal())
 await assert.rejects(()=>complete(f.managed,tooMany),e=>e.code==='22023')
 for(const invalid of [
  {...skillProposal(),confidence:'0.9'},{...skillProposal(),provenance:null},
  {...skillProposal(),minimum_months:1.5},{...skillProposal(),raw_term:'😀'.repeat(140)}
 ]){
  const payload=output();payload.skills=[invalid]
  await assert.rejects(()=>complete(f.managed,payload),e=>e.code==='22023')
 }
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_extraction_suggestions WHERE run_id=$1',[f.managed.run_id])).rows[0].n,0)
})
