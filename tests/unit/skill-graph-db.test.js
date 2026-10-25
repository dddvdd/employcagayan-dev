import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {skillGraphDatabase} from '../support/skill-graph-database.js'
import {seedAccount,become} from '../support/identity-database.js'
let db;before(async()=>{db=await skillGraphDatabase()});after(async()=>await db?.close())
async function fixture(kind='transferable'){
 const admin=await seedAccount(db,{role:'admin'});await db.exec('RESET ROLE')
 const skills=[];for(let i=0;i<3;i++)skills.push((await db.query('INSERT INTO public.skills(canonical_name,normalized_name) VALUES($1,$1) RETURNING id',['Synthetic graph '+randomUUID()])).rows[0].id)
 const [a,b,c]=skills.sort(),source=(await db.query("INSERT INTO public.taxonomy_sources(code,name,version) VALUES($1,'Synthetic graph source','v1') RETURNING id",[randomUUID()])).rows[0].id
 await become(db,admin,{aal:'aal2'})
 const link=(await db.query('INSERT INTO public.skill_relationships(source_skill_id,target_skill_id,relationship_type) VALUES($1,$2,$3) RETURNING id,revision',[a,b,kind])).rows[0]
 return {admin,a,b,c,source,...link}
}
const read=async f=>(await db.query('SELECT public.get_approved_skill_relationships($1::uuid[]) AS r',[[f.a,f.b]])).rows[0].r
const review=async(f,revision=f.revision,action='approve',version='v1')=>(await db.query('SELECT public.review_skill_relationship($1,$2,$3,$4,$5,$6) AS r',[f.id,revision,action,f.source,version,'Synthetic evidence section 2'])).rows[0].r
const history=async f=>(await db.query('SELECT public.get_skill_relationship_history($1) AS r',[f.id])).rows[0].r
test('only reviewed active version-bound skill links enter a hash-bound snapshot with no reviewer identity',async()=>{
 const f=await fixture();assert.equal((await read(f)).relationships.length,0);const approved=await review(f),snapshot=await read(f)
 assert.equal(snapshot.knowledge_version,'skill-relationship-knowledge-v1');assert.match(snapshot.snapshot_hash,/^[0-9a-f]{64}$/)
 assert.equal(snapshot.relationships.length,1);assert.equal(snapshot.relationships[0].source_skill_id,f.a);assert.equal(snapshot.relationships[0].target_skill_id,f.b)
 assert.equal(snapshot.relationships[0].relationship_type,'transferable');assert.equal(snapshot.relationships[0].revision,approved.revision);assert.equal('reviewed_by' in snapshot.relationships[0],false)
 assert.equal((await history(f)).at(-1).snapshot.reviewed_by,f.admin.id)
})
test('self-links, reversed/duplicate related pairs and unknown relationship kinds are rejected',async()=>{
 const f=await fixture('related')
 await assert.rejects(()=>db.query("INSERT INTO public.skill_relationships(source_skill_id,target_skill_id,relationship_type) VALUES($1,$1,'transferable')",[f.a]),e=>e.code==='23514')
 await assert.rejects(()=>db.query("INSERT INTO public.skill_relationships(source_skill_id,target_skill_id,relationship_type) VALUES($1,$2,'related')",[f.b,f.a]),e=>e.code==='23514')
 await assert.rejects(()=>db.query("INSERT INTO public.skill_relationships(source_skill_id,target_skill_id,relationship_type) VALUES($1,$2,'related')",[f.a,f.b]),e=>e.code==='23505')
 await assert.rejects(()=>db.query("INSERT INTO public.skill_relationships(source_skill_id,target_skill_id,relationship_type) VALUES($1,$2,'equivalent')",[f.a,f.c]),e=>e.code==='23514')
})
test('canonical admin MFA is required for CRUD/review and user metadata cannot grant authority',async()=>{
 const f=await fixture()
 for(const role of ['staff','supervisor','applicant','employer']){
  const actor=await seedAccount(db,{role,google:role==='applicant',metadata:{role:'admin'}});await become(db,actor,{aal:'aal2'})
  await assert.rejects(()=>db.query("INSERT INTO public.skill_relationships(source_skill_id,target_skill_id,relationship_type) VALUES($1,$2,'transferable')",[f.b,f.c]),e=>e.code==='42501')
  await assert.rejects(()=>review(f),e=>e.code==='42501');await assert.rejects(()=>history(f),e=>e.code==='42501')
 }
 await become(db,f.admin,{aal:'aal1'});await assert.rejects(()=>review(f),e=>e.code==='42501')
 const inactive=await seedAccount(db,{role:'admin',active:false});await become(db,inactive,{aal:'aal2'});await assert.rejects(()=>review(f),e=>e.code==='42501')
})
test('direct administrator and service payloads cannot forge review stamps or revision counters',async()=>{
 const f=await fixture()
 for(const sql of ["UPDATE public.skill_relationships SET review_status='approved' WHERE id=$1","UPDATE public.skill_relationships SET revision=100 WHERE id=$1"])await assert.rejects(()=>db.query(sql,[f.id]),e=>e.code==='42501')
 await db.exec('RESET ROLE;SET ROLE service_role');await assert.rejects(()=>db.query("UPDATE public.skill_relationships SET review_status='approved' WHERE id=$1",[f.id]),e=>e.code==='42501')
 assert.equal((await db.query("SELECT has_function_privilege('service_role','public.review_skill_relationship(uuid,bigint,text,uuid,text,text)','EXECUTE') AS ok")).rows[0].ok,false)
})
test('material direction changes reset approval; stale reviews fail; no-op saves preserve fingerprints',async()=>{
 const f=await fixture(),approved=await review(f),snapshot=await read(f)
 await db.query('UPDATE public.skill_relationships SET is_active=is_active WHERE id=$1',[f.id]);assert.deepEqual(await read(f),snapshot)
 await db.query('UPDATE public.skill_relationships SET target_skill_id=$2 WHERE id=$1',[f.id,f.c]);assert.equal((await read(f)).relationships.length,0)
 await assert.rejects(()=>review(f,approved.revision),e=>e.code==='55000')
 const row=(await db.query('SELECT review_status,reviewed_by,revision FROM public.skill_relationships WHERE id=$1',[f.id])).rows[0]
 assert.equal(row.review_status,'pending');assert.equal(row.reviewed_by,null);assert.ok(row.revision>approved.revision)
})
test('source versions, inactive skills and archive state suppress consumer knowledge',async()=>{
 const f=await fixture();let approved=await review(f)
 await db.exec('RESET ROLE');await db.query("UPDATE public.taxonomy_sources SET version='v2' WHERE id=$1",[f.source]);await become(db,f.admin,{aal:'aal2'})
 assert.equal((await read(f)).relationships.length,0);await assert.rejects(()=>review(f,approved.revision),e=>e.code==='55000')
 approved=await review(f,approved.revision,'approve','v2')
 await db.exec('RESET ROLE');await db.query('UPDATE public.skills SET is_active=false WHERE id=$1',[f.a]);await become(db,f.admin,{aal:'aal2'})
 assert.equal((await read(f)).relationships.length,0);await assert.rejects(()=>review(f,approved.revision,'approve','v2'),e=>e.code==='55000')
 await db.exec('RESET ROLE');await db.query('UPDATE public.skills SET is_active=true WHERE id=$1',[f.a]);await become(db,f.admin,{aal:'aal2'})
 await db.query('UPDATE public.skill_relationships SET is_active=false WHERE id=$1',[f.id]);assert.equal((await read(f)).relationships.length,0)
})
test('rejection/deletion preserve paged private history; FK cascade deletion also records history',async()=>{
 const f=await fixture(),approved=await review(f);await review(f,approved.revision,'reject')
 assert.equal((await read(f)).relationships.length,0);await db.query('DELETE FROM public.skill_relationships WHERE id=$1',[f.id])
 const records=await history(f);assert.equal(records.at(-1).operation,'DELETE')
 const page=(await db.query('SELECT public.get_skill_relationship_history($1,$2,2) AS r',[f.id,records[0].revision])).rows[0].r
 assert.equal(page.length,2);assert.ok(page[0].revision>records[0].revision)
 const g=await fixture();await db.exec('RESET ROLE');await db.query('DELETE FROM public.skills WHERE id=$1',[g.a]);await become(db,g.admin,{aal:'aal2'})
 assert.equal((await history(g)).at(-1).operation,'DELETE')
})
test('reader bounds, evidence limits and private schema/table/helper grants fail closed',async()=>{
 const f=await fixture()
 await assert.rejects(()=>db.query("SELECT public.review_skill_relationship($1,1,'approve',$2,'v1','')",[f.id,f.source]),e=>e.code==='22023')
 await assert.rejects(()=>db.query('SELECT public.get_approved_skill_relationships(NULL)'),e=>e.code==='22023')
 await assert.rejects(()=>db.query('SELECT public.get_approved_skill_relationships($1::uuid[])',[[...Array(101)].map(()=>f.a)]),e=>e.code==='22023')
 await db.exec('RESET ROLE')
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await db.query("SELECT has_table_privilege($1,'app.skill_relationship_history','SELECT') AS ok",[role])).rows[0].ok,false)
  assert.equal((await db.query("SELECT has_table_privilege($1,'public.skill_relationships','TRUNCATE') AS ok",[role])).rows[0].ok,false)
  assert.equal((await db.query("SELECT has_function_privilege($1,'app.record_skill_relationship_history()','EXECUTE') AS ok",[role])).rows[0].ok,false)
 }
 await assert.rejects(()=>db.exec('TRUNCATE public.skill_relationships'),e=>e.code==='55000')
})

test('pending curation metadata is administrator-only while approved snapshots remain available to staff',async()=>{
 const f=await fixture(),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
 assert.equal((await db.query('SELECT id,reviewed_by,evidence_reference FROM public.skill_relationships WHERE id=$1',[f.id])).rows.length,0)
 await become(db,f.admin,{aal:'aal2'});await review(f);await become(db,staff,{aal:'aal2'})
 assert.equal((await read(f)).relationships.length,1)
 assert.equal((await db.query('SELECT id,reviewed_by FROM public.skill_relationships WHERE id=$1',[f.id])).rows.length,0)
})
