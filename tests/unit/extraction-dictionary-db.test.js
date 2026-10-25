import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {dictionaryConsistencyDatabase} from '../support/extraction-dictionary-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db;before(async()=>{db=await dictionaryConsistencyDatabase()});after(async()=>await db?.close())
async function actor(a){await become(db,a,{aal:'aal2',extras:{exp:Math.floor(Date.now()/1000)+3600}})}
async function fixture(){
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'});await db.exec('RESET ROLE')
 await db.query("UPDATE public.jobseeker_profiles SET professional_summary='I can use Synthetic Excel.' WHERE participant_id=$1",[f.profile.participant_id]);await actor(admin)
 const source=(await db.query("SELECT public.get_ai_extraction_source('jobseeker_profile',$1) AS r",[f.profile.participant_id])).rows[0].r
 return {...f,admin,source}
}
const snapshot=async f=>(await db.query("SELECT public.get_ai_extraction_source('jobseeker_profile',$1) AS r",[f.profile.participant_id])).rows[0].r
const begin=async(f,s)=>(await db.query("SELECT public.begin_ai_extraction('jobseeker_profile',$1,$2) AS r",[f.profile.participant_id,s.source_hash])).rows[0].r
async function worker(){await db.exec('RESET ROLE;SET ROLE service_role');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})])}
const empty=()=>({extraction_version:'ai-extraction-v1',occupations:[],skills:[],certifications:[],education_requirements:[],experience_requirements:[],industries:[]})
test('dictionary changes alter extraction identity without altering employment text',async()=>{
 const f=await fixture();await db.exec('RESET ROLE');await db.query("UPDATE public.skills SET canonical_name=canonical_name||' revised' WHERE id=$1",[f.skill]);await actor(f.admin)
 const changed=await snapshot(f);assert.equal(changed.source_text,f.source.source_text);assert.notEqual(changed.source_hash,f.source.source_hash)
 assert.ok(changed.dictionary_revision>f.source.dictionary_revision)
})
test('completion rejects a dictionary revision changed during provider/resolution work',async()=>{
 const f=await fixture(),r=await begin(f,f.source);await db.exec('RESET ROLE')
 await db.query("UPDATE public.skills SET normalized_name=normalized_name||' revised' WHERE id=$1",[f.skill]);await worker()
 await assert.rejects(()=>db.query('SELECT public.complete_ai_extraction($1,$2,$3::jsonb)',[r.run_id,r.lease_token,JSON.stringify(empty())]),e=>e.code==='55000')
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM public.ai_extraction_runs WHERE id=$1',[r.run_id])).rows[0].status,'processing')
})
test('completed cache cannot hide a later vocabulary change',async()=>{
 const f=await fixture(),r=await begin(f,f.source);await worker();await db.query('SELECT public.complete_ai_extraction($1,$2,$3::jsonb)',[r.run_id,r.lease_token,JSON.stringify(empty())])
 await db.exec('RESET ROLE');await db.query("UPDATE public.skills SET canonical_name=canonical_name||' new concept label' WHERE id=$1",[f.skill]);await actor(f.admin)
 const fresh=await begin(f,await snapshot(f));assert.notEqual(fresh.run_id,r.run_id);assert.equal(fresh.cached,false)
})
if(process.env.EMPLOY_DICTIONARY_BASELINE!=='1'){
 test('all seven reference-table statement paths advance the private revision',async()=>{
  const f=await fixture();await db.exec('RESET ROLE')
  for(const table of ['occupations','occupation_aliases','skills','certifications','industries','education_levels','languages']){
   const before=(await db.query('SELECT revision FROM app.extraction_dictionary_revision')).rows[0].revision
   await db.exec('UPDATE public.'+table+' SET is_active=is_active WHERE false')
   const after=(await db.query('SELECT revision FROM app.extraction_dictionary_revision')).rows[0].revision
   assert.equal(Number(after),Number(before)+1,table)
   const trigger=(await db.query("SELECT tgtype FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='advance_extraction_dictionary_revision'",['public.'+table])).rows[0]
   assert.ok(trigger);assert.equal(trigger.tgtype&1,0)
  }
 })
 test('private revision data and trigger helpers remain inaccessible to ordinary and service callers',async()=>{
  await fixture();await db.exec('RESET ROLE')
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await db.query("SELECT has_table_privilege($1,'app.extraction_dictionary_revision','SELECT') AS ok",[role])).rows[0].ok,false)
   for(const fn of ['app.advance_extraction_dictionary_revision()','app.lock_extraction_dictionary()'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS ok',[role,fn])).rows[0].ok,false)
  }
  assert.equal((await db.query("SELECT has_schema_privilege('authenticated','app','USAGE') AS ok")).rows[0].ok,false)
 })
}
