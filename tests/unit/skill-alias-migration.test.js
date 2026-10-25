import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {skillGraphDatabase} from '../support/skill-graph-database.js'
import {seedAccount,become} from '../support/identity-database.js'

let db
before(async()=>{
  db=await skillGraphDatabase()
  const sql=await readFile(new URL('../../supabase/migrations/20261021105056_skill_alias_reviewed_discovery.sql',import.meta.url),'utf8')
  await db.exec(sql)
})
after(async()=>await db?.close())

test('pending aliases stay private; only MFA admin review exposes approved canonical candidates',async()=>{
  const admin=await seedAccount(db,{role:'admin'})
  const staff=await seedAccount(db,{role:'staff'})
  await db.exec('RESET ROLE')
  const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Synthetic welding','synthetic welding') RETURNING id")).rows[0].id
  const row=(await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference)
    VALUES($1,'MMAW','mmaw','local','local-2026-10-21','synthetic review fixture') RETURNING id,revision`,[skill])).rows[0]
  await become(db,staff,{aal:'aal2'})
  assert.deepEqual((await db.query("SELECT * FROM public.search_approved_skill_aliases('mmaw')")).rows,[])
  assert.deepEqual((await db.query('SELECT id FROM public.skill_aliases')).rows,[])
  await assert.rejects(()=>db.query("UPDATE public.skill_aliases SET review_status='approved' WHERE id=$1",[row.id]),e=>e.code==='42501')
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'approve','synthetic')",[row.id]),e=>e.code==='42501')
  await become(db,admin,{aal:'aal1'})
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'approve','synthetic')",[row.id]),e=>e.code==='42501')
  await become(db,admin,{aal:'aal2'})
  const reviewed=(await db.query("SELECT public.review_skill_alias($1,$2,'approve','Synthetic evidence checked') AS r",[row.id,row.revision])).rows[0].r
  assert.equal(reviewed.review_status,'approved')
  await become(db,staff,{aal:'aal2'})
  const hits=(await db.query("SELECT * FROM public.search_approved_skill_aliases('mmaw')")).rows
  assert.equal(hits.length,1)
  assert.equal(hits[0].skill_id,skill)
  assert.equal(hits[0].review_status,'approved')
  assert.equal('reviewed_by' in hits[0],false)
  assert.equal('evidence_reference' in hits[0],false)
  await db.exec('RESET ROLE')
  const history=(await db.query('SELECT operation,snapshot FROM app.skill_alias_history WHERE alias_id=$1 ORDER BY revision',[row.id])).rows
  assert.equal(history.length,3)
  assert.equal(history.at(-1).snapshot.review_status,'approved')
})

test('schema permits collision review while blocking duplicate source rows and unauthorized access',async()=>{
  await db.exec('RESET ROLE')
  const rows=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Synthetic process A','synthetic process a'),('Synthetic process B','synthetic process b') RETURNING id")).rows
  for(const row of rows) await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference)
    VALUES($1,'SMAW','smaw','local','local-2026-10-21','synthetic review fixture')`,[row.id])
  await assert.rejects(()=>db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference)
    VALUES($1,'SMAW','smaw','local','local-2026-10-21','duplicate')`,[rows[0].id]),e=>e.code==='23505')
  for(const role of ['anon','authenticated','service_role']) {
    assert.equal((await db.query("SELECT has_table_privilege($1,'app.skill_alias_history','SELECT') AS ok",[role])).rows[0].ok,false)
    assert.equal((await db.query("SELECT has_table_privilege($1,'public.skill_aliases','UPDATE') AS ok",[role])).rows[0].ok,false)
  }
})

test('anonymous, jobseeker and employer sessions cannot mutate or review aliases',async()=>{
  await db.exec('RESET ROLE')
  const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Protected fixture','protected fixture') RETURNING id")).rows[0].id
  const alias=(await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference)
    VALUES($1,'Protected name','protected name','local','fixture-v1','fixture') RETURNING id`,[skill])).rows[0].id
  await db.exec('SET ROLE anon')
  await assert.rejects(()=>db.query("INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference) VALUES($1,'bad','bad','local','v1','fixture')",[skill]),e=>e.code==='42501')
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'approve','fixture')",[alias]),e=>e.code==='42501')
  for(const role of ['applicant','employer']) {
    const account=await seedAccount(db,{role})
    await become(db,account,{aal:'aal2'})
    for(const sql of ["UPDATE public.skill_aliases SET alias_text='bad' WHERE id=$1","DELETE FROM public.skill_aliases WHERE id=$1"]) {
      await assert.rejects(()=>db.query(sql,[alias]),e=>e.code==='42501')
    }
    await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'reject','fixture')",[alias]),e=>e.code==='42501')
    await assert.rejects(()=>db.query('SELECT * FROM app.skill_alias_history WHERE alias_id=$1',[alias]),e=>e.code==='42501')
  }
})

test('review rejects null action, missing MFA and stale revision; rejection remains private',async()=>{
  await db.exec('RESET ROLE')
  const admin=await seedAccount(db,{role:'admin'})
  const noFactor=await seedAccount(db,{role:'admin',factor:false})
  const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Revision fixture','revision fixture') RETURNING id")).rows[0].id
  const alias=(await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference)
    VALUES($1,'Revision name','revision name','local','fixture-v1','fixture') RETURNING id,revision`,[skill])).rows[0]
  await become(db,noFactor,{aal:'aal2'})
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'reject','fixture')",[alias.id]),e=>e.code==='42501')
  await become(db,admin,{aal:'aal1'})
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'reject','fixture')",[alias.id]),e=>e.code==='42501')
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query('SELECT public.review_skill_alias($1,1,NULL,$2)',[alias.id,'fixture']),e=>e.code==='22023')
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,0,'reject','fixture')",[alias.id]),e=>e.code==='22023')
  const result=(await db.query("SELECT public.review_skill_alias($1,$2,'reject','No verified equivalence') AS r",[alias.id,alias.revision])).rows[0].r
  assert.equal(result.review_status,'rejected')
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,$2,'approve','stale')",[alias.id,alias.revision]),e=>e.code==='55000')
  assert.deepEqual((await db.query("SELECT * FROM public.search_approved_skill_aliases('revision name')")).rows,[])
  await db.exec('RESET ROLE')
  const history=(await db.query('SELECT snapshot FROM app.skill_alias_history WHERE alias_id=$1 ORDER BY revision',[alias.id])).rows
  assert.equal(history.at(-1).snapshot.review_note,'No verified equivalence')
  assert.equal(history.at(-1).snapshot.reviewed_by,admin.id)
  assert.ok(history.at(-1).snapshot.reviewed_at)
})

test('approval blocks canonical collisions and mismatched source types',async()=>{
  await db.exec('RESET ROLE')
  const admin=await seedAccount(db,{role:'admin'})
  const skills=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Collision target','collision target'),('Other target','other target') RETURNING id,normalized_name")).rows
  const collision=(await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference)
    VALUES($1,'Collision target','collision target','local','fixture-v1','fixture') RETURNING id`,[skills[1].id])).rows[0].id
  const source=(await db.query("INSERT INTO public.taxonomy_sources(code,name,version) VALUES('TESDA','Synthetic TESDA','fixture-v1') RETURNING id")).rows[0].id
  const wrongSource=(await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,taxonomy_source_id,source_version,source_sha256,evidence_reference)
    VALUES($1,'PSF misbinding','psf misbinding','psf_term',$2,'fixture-v1',repeat('a',64),'fixture') RETURNING id`,[skills[0].id,source])).rows[0].id
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'approve','fixture')",[collision]),e=>e.code==='55000')
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'approve','fixture')",[wrongSource]),e=>e.code==='55000')
})

test('invented ESCO URI cannot be approved without an official registry',async()=>{
  await db.exec('RESET ROLE')
  const admin=await seedAccount(db,{role:'admin'})
  const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('ESCO fixture','esco fixture') RETURNING id")).rows[0].id
  const source=(await db.query("INSERT INTO public.taxonomy_sources(code,name,version) VALUES('ESCO','Synthetic ESCO','1.2.1') RETURNING id")).rows[0].id
  const receipt='f9761b0b52be1828b38a3e5e0ae59a93a7b0ce358bc800f52f57a8b002adeb3e'
  await assert.rejects(()=>db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,taxonomy_source_id,source_version,source_sha256,external_concept_uri,evidence_reference)
    VALUES($1,'Malformed URI','malformed uri','esco_preferred',$2,'1.2.1',$3,'http://data.europa.eu/esco/skill/not-a-uuid','fixture')`,[skill,source,receipt]),e=>e.code==='23514')
  const row=(await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,taxonomy_source_id,source_version,source_sha256,external_concept_uri,evidence_reference)
    VALUES($1,'Invented ESCO term','invented esco term','esco_preferred',$2,'1.2.1',$3,'http://data.europa.eu/esco/skill/00000000-0000-4000-8000-000000000000','fixture') RETURNING id`,[skill,source,receipt])).rows[0]
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query("SELECT public.review_skill_alias($1,1,'approve','fixture')",[row.id]),e=>e.code==='55000')
  assert.deepEqual((await db.query("SELECT * FROM public.search_approved_skill_aliases('invented esco term')")).rows,[])
})

test('invalid search, saturated exact collisions and history truncation fail closed',async()=>{
  await db.exec('RESET ROLE')
  const admin=await seedAccount(db,{role:'admin'})
  const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002']
  await db.query("INSERT INTO public.skills(id,canonical_name,normalized_name) VALUES($1,'Cap skill A','cap skill a'),($2,'Cap skill B','cap skill b')",ids)
  for(let i=0;i<101;i++) await db.query(`INSERT INTO public.skill_aliases(skill_id,alias_text,normalized_name,alias_type,source_version,evidence_reference,review_status,reviewed_by,reviewed_at)
    VALUES($1,'Saturated','saturated','local',$2,'fixture','approved',$3,now())`,[i===100?ids[1]:ids[0],`v${i}`,admin.id])
  await become(db,admin,{aal:'aal2'})
  for(const term of ['a','x'.repeat(101),'bad%term',' bad']) {
    await assert.rejects(()=>db.query('SELECT * FROM public.search_approved_skill_aliases($1)',[term]),e=>e.code==='22023')
  }
  await assert.rejects(()=>db.query("SELECT * FROM public.search_approved_skill_aliases('saturated')"),e=>e.code==='55000')
  await db.exec('RESET ROLE')
  await assert.rejects(()=>db.exec('TRUNCATE public.skill_aliases'),e=>e.code==='55000')
})

test('rollback removes only alias objects and preserves canonical skills',async()=>{
  const isolated=await skillGraphDatabase()
  try {
    const original=(await isolated.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Rollback fixture','rollback fixture') RETURNING id")).rows[0].id
    const sql=await readFile(new URL('../../supabase/migrations/20261021105056_skill_alias_reviewed_discovery.sql',import.meta.url),'utf8')
    await isolated.exec(sql)
    await isolated.exec(`BEGIN;
      DROP FUNCTION public.search_approved_skill_aliases(text);
      DROP FUNCTION public.review_skill_alias(uuid,bigint,text,text);
      DROP TABLE public.skill_aliases;
      DROP FUNCTION app.record_skill_alias_history();
      DROP TABLE app.skill_alias_history;
      COMMIT;`)
    assert.equal((await isolated.query("SELECT to_regclass('public.skill_aliases') AS present")).rows[0].present,null)
    assert.equal((await isolated.query('SELECT id FROM public.skills WHERE id=$1',[original])).rows[0].id,original)
  } finally { await isolated.close() }
})
