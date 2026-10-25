import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {knowledgeDatabase} from '../support/knowledge-database.js'
import {seedAccount,become} from '../support/identity-database.js'
let db;before(async()=>{db=await knowledgeDatabase()});after(async()=>await db?.close())
async function fixture(){
 const admin=await seedAccount(db,{role:'admin'});await db.exec('RESET ROLE')
 const occupation=(await db.query("INSERT INTO public.occupations(canonical_name,normalized_name) VALUES($1,$1) RETURNING id",['Synthetic occupation '+randomUUID()])).rows[0].id
 const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES($1,$1) RETURNING id",['Synthetic skill '+randomUUID()])).rows[0].id
 const source=(await db.query("INSERT INTO public.taxonomy_sources(code,name,version) VALUES($1,'Synthetic source','v1') RETURNING id",[randomUUID()])).rows[0].id
 const relationship=(await db.query("INSERT INTO public.occupation_skills(occupation_id,skill_id,source) VALUES($1,$2,'synthetic') RETURNING id,revision",[occupation,skill])).rows[0]
 await become(db,admin,{aal:'aal2'});return {admin,occupation,skill,source,...relationship}
}
const read=async f=>(await db.query('SELECT public.get_approved_occupation_skills($1::uuid[]) AS r',[[f.occupation]])).rows[0].r
const review=async(f,revision=f.revision,action='approve',version='v1',reference='Synthetic evidence')=>(await db.query('SELECT public.review_occupation_skill($1,$2,$3,$4,$5,$6) AS r',[f.id,revision,action,f.source,version,reference])).rows[0].r
const history=async f=>(await db.query('SELECT public.get_occupation_skill_history($1) AS r',[f.id])).rows[0].r
test('pending seed links stay out of the reviewed snapshot; explicit admin review binds versioned provenance',async()=>{
 const f=await fixture();assert.equal((await read(f)).relationships.length,0)
 const result=await review(f),snapshot=await read(f);assert.equal(result.review_status,'approved');assert.ok(result.revision>f.revision)
 assert.equal(snapshot.relationships.length,1);assert.equal(snapshot.relationships[0].source_version,'v1');assert.equal(snapshot.relationships[0].taxonomy_source_id,f.source)
 assert.equal(snapshot.knowledge_version,'occupation-skill-knowledge-v1');assert.match(snapshot.snapshot_hash,/^[0-9a-f]{64}$/)
 assert.equal('reviewed_by' in snapshot.relationships[0],false);assert.equal((await history(f)).at(-1).snapshot.reviewed_by,f.admin.id)
})
test('direct authenticated or service payloads cannot fabricate approval or revision stamps',async()=>{
 const f=await fixture()
 await assert.rejects(()=>db.query("UPDATE public.occupation_skills SET review_status='approved',reviewed_by=$2 WHERE id=$1",[f.id,f.admin.id]),e=>e.code==='42501')
 await assert.rejects(()=>db.query("UPDATE public.occupation_skills SET revision=999 WHERE id=$1",[f.id]),e=>e.code==='42501')
 await db.exec('RESET ROLE;SET ROLE service_role')
 // Invoker trigger still rejects direct privileged API stamping; RLS may deny earlier.
 await assert.rejects(()=>db.query("UPDATE public.occupation_skills SET review_status='approved' WHERE id=$1",[f.id]))
})
test('review requires canonical admin, active confirmed session and actual MFA',async()=>{
 const f=await fixture()
 for(const role of ['staff','supervisor','employer','applicant']){
  const other=await seedAccount(db,{role,google:role==='applicant'});await become(db,other,{aal:'aal2'})
  await assert.rejects(()=>review(f),e=>e.code==='42501')
 }
 await become(db,f.admin,{aal:'aal1'});await assert.rejects(()=>review(f),e=>e.code==='42501')
 const inactive=await seedAccount(db,{role:'admin',active:false});await become(db,inactive,{aal:'aal2'});await assert.rejects(()=>review(f),e=>e.code==='42501')
 const unconfirmed=await seedAccount(db,{role:'admin',confirmed:false});await become(db,unconfirmed,{aal:'aal2'});await assert.rejects(()=>review(f),e=>e.code==='42501')
})
test('revision compare-and-swap prevents stale approval and leaves history unchanged on failure',async()=>{
 const f=await fixture(),first=await review(f),before=await history(f)
 await assert.rejects(()=>review(f,f.revision),e=>e.code==='55000');assert.deepEqual(await history(f),before)
 const rejected=await review(f,first.revision,'reject');assert.equal(rejected.review_status,'rejected');assert.equal((await read(f)).relationships.length,0)
})
test('material edits reset approval; no-op saves preserve revision and fingerprint',async()=>{
 const f=await fixture(),approved=await review(f),snapshot=await read(f)
 await db.query('UPDATE public.occupation_skills SET importance=importance WHERE id=$1',[f.id]);assert.deepEqual(await read(f),snapshot)
 await db.query('UPDATE public.occupation_skills SET importance=4 WHERE id=$1',[f.id])
 const row=(await db.query('SELECT review_status,reviewed_by,revision FROM public.occupation_skills WHERE id=$1',[f.id])).rows[0]
 assert.equal(row.review_status,'pending');assert.equal(row.reviewed_by,null);assert.equal(Number(row.revision),Number(approved.revision)+1);assert.equal((await read(f)).relationships.length,0)
})
test('active entity/source and source-version gates suppress stale knowledge without promoting another version',async()=>{
 const f=await fixture();await review(f)
 await db.exec('RESET ROLE');await db.query("UPDATE public.taxonomy_sources SET version='v2' WHERE id=$1",[f.source]);await become(db,f.admin,{aal:'aal2'})
 assert.equal((await read(f)).relationships.length,0);const revision=(await db.query('SELECT revision FROM public.occupation_skills WHERE id=$1',[f.id])).rows[0].revision
 await assert.rejects(()=>review(f,revision,'approve','v1'),e=>e.code==='55000');await review(f,revision,'approve','v2')
 await db.exec('RESET ROLE');await db.query('UPDATE public.skills SET is_active=false WHERE id=$1',[f.skill]);await become(db,f.admin,{aal:'aal2'})
 assert.equal((await read(f)).relationships.length,0);const latestRevision=(await history(f)).at(-1).revision;await assert.rejects(()=>review(f,latestRevision,'approve','v2'),e=>e.code==='55000')
})
test('deletion preserves private history and only knowledge admins can retrieve it',async()=>{
 const f=await fixture();await review(f);await db.query('DELETE FROM public.occupation_skills WHERE id=$1',[f.id])
 assert.equal((await history(f)).at(-1).operation,'DELETE')
 const staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'});await assert.rejects(()=>history(f),e=>e.code==='42501')
})
test('invalid review evidence and request bounds fail before changing knowledge',async()=>{
 const f=await fixture()
 for(const reference of ['',null,'x'.repeat(1001)])await assert.rejects(()=>review(f,1,'approve','v1',reference),e=>e.code==='22023')
 await assert.rejects(()=>db.query('SELECT public.get_approved_occupation_skills(NULL)'),e=>e.code==='22023')
 await assert.rejects(()=>db.query('SELECT public.get_approved_occupation_skills($1::uuid[])',[[...Array(101)].map(()=>f.occupation)]),e=>e.code==='22023')
 assert.equal((await history(f)).length,1)
})
test('history/helper access is private and ordinary truncation cannot erase version records',async()=>{
 await db.exec('RESET ROLE')
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await db.query("SELECT has_table_privilege($1,'app.occupation_skill_history','SELECT') AS ok",[role])).rows[0].ok,false)
  assert.equal((await db.query("SELECT has_function_privilege($1,'app.require_knowledge_admin()','EXECUTE') AS ok",[role])).rows[0].ok,false)
  assert.equal((await db.query("SELECT has_table_privilege($1,'public.occupation_skills','TRUNCATE') AS ok",[role])).rows[0].ok,false)
 }
 await assert.rejects(()=>db.exec('TRUNCATE public.occupation_skills'),e=>e.code==='55000')
})
