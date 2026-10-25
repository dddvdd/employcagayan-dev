import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile, readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {preparePsocImport} from '../../scripts/lib/psoc-import.mjs'
const snapshotPath = new URL('../../artifacts/psa-references/2026-10-15T07-50-02-156Z/psoc-2022.json', import.meta.url)
const bytes = await readFile(snapshotPath), snapshot = JSON.parse(bytes)
const sha = text => createHash('sha256').update(text).digest('hex')
const prepared = preparePsocImport(snapshot, {snapshotSha256:sha(bytes)})
const migrationFiles = await readdir(new URL('../../supabase/migrations/',import.meta.url))
const indexSql = await readFile(new URL('../../supabase/migrations/'+migrationFiles.find(name=>name.endsWith('_psoc_hierarchy_name_uniqueness.sql')),import.meta.url),'utf8')
const before = JSON.parse(await readFile(new URL('../../artifacts/psoc-release-reconciliation-20261015/dev-before.json',import.meta.url),'utf8'))
const indexes = JSON.parse(await readFile(new URL('../../artifacts/psoc-release-reconciliation-20261015/dev-indexes.json',import.meta.url),'utf8')).indexes
const quote = value => '"' + value.replaceAll('"','""') + '"'
async function database({repairIndex=true}={}) {
 const db=new PGlite()
 await db.exec(`
 CREATE ROLE authenticated;
 CREATE TABLE public.occupations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),canonical_name text NOT NULL,
  normalized_name text NOT NULL,description text,occupation_level smallint,parent_id uuid REFERENCES public.occupations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.taxonomy_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL,
  version text,source_type text NOT NULL DEFAULT 'internal',country_code text,source_url text,is_active boolean NOT NULL DEFAULT true,
  metadata jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.taxonomy_mappings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),taxonomy_source_id uuid NOT NULL REFERENCES public.taxonomy_sources(id) ON DELETE CASCADE,
  entity_type text NOT NULL,entity_id uuid NOT NULL,external_code text,external_id text,external_name text,mapping_type text NOT NULL DEFAULT 'exact',
  confidence numeric(3,2),is_primary boolean NOT NULL DEFAULT false,metadata jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.occupation_aliases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),occupation_id uuid NOT NULL REFERENCES public.occupations(id) ON DELETE CASCADE,
  alias text NOT NULL,normalized_alias text NOT NULL,alias_type text NOT NULL DEFAULT 'common',language_code text DEFAULT 'en',
  source text,is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
 `)
 for(const index of indexes) if(!index.indexname.endsWith('_pkey') && index.indexname!=='taxonomy_sources_code_key')
  await db.exec(index.indexdef)
 for(const table of ['occupations','taxonomy_sources','taxonomy_mappings','occupation_aliases']) {
  await db.exec('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.'+table+' TO authenticated')
  await db.exec('CREATE POLICY read_reference ON public.'+table+' FOR SELECT TO authenticated USING (true)')
  const rows=before[{occupation_aliases:'aliases',taxonomy_sources:'sources',taxonomy_mappings:'mappings'}[table]??table]
  for(const row of rows) {
   const keys=Object.keys(row)
   await db.query('INSERT INTO public.'+table+'('+keys.map(quote).join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(key=>row[key]))
  }
 }
 if(repairIndex)await db.exec(indexSql)
 return db
}
async function dump(db) {
 const result={}
 for(const table of ['occupations','taxonomy_sources','taxonomy_mappings','occupation_aliases'])
  result[table]=(await db.query('SELECT * FROM public.'+table+' ORDER BY id')).rows
 return result
}
test('standalone index correction preserves rows/policies, is repeatable and refuses an ordinary SQL actor',async()=>{
 const db=await database({repairIndex:false})
 try{
  const original=await dump(db)
  const policies=(await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows
  await db.exec('SET ROLE authenticated')
  await assert.rejects(()=>db.exec(indexSql),error=>error.code==='42501')
  await db.exec('RESET ROLE')
  await db.exec(indexSql)
  await db.exec(indexSql)
  assert.deepEqual(await dump(db),original)
  assert.deepEqual((await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows,policies)
  assert.equal((await db.query("SELECT to_regclass('public.occupations_normalized_name_unique') AS old")).rows[0].old,null)
  assert.ok((await db.query("SELECT to_regclass('public.occupations_normalized_name_level_unique') AS scoped")).rows[0].scoped)
 }finally{await db.close()}
})
test('catalog import without its explicit index prerequisite fails atomically with no inserted rows',async()=>{
 const db=await database({repairIndex:false})
 try{
  const original=await dump(db)
  await assert.rejects(()=>db.exec(prepared.sql),error=>error.code==='55000')
  assert.deepEqual(await dump(db),original)
 }finally{await db.close()}
})
test('pinned real release prepares all 649 hierarchy entries and 466 code aliases with explicit source version', async()=>{
 assert.equal(prepared.rows.length,649)
 assert.deepEqual(prepared.rows.reduce((result,row)=>{result[row.level]=(result[row.level]??0)+1;return result},{}),{1:10,2:43,3:130,4:466})
 assert.equal(prepared.rows.find(row=>row.code==='0110').parent_code,'011')
 assert.equal(prepared.rows.find(row=>row.code==='2123').title,'ACTUARIES')
 assert.equal(prepared.metadata.documentation_count_conflict.documented_units,456)
 assert.equal(prepared.metadata.documentation_count_conflict.api_units,466)
 const files=await readdir(new URL('../../supabase/migrations/',import.meta.url))
 const migration=files.find(name=>name.endsWith('_psoc_2022_api_catalog_foundation.sql'))
 assert.equal(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'),prepared.sql)
})
test('changed rows remain rejected even after self-rehashing, as do older/mixed releases and broken page evidence',()=>{
 for(const mutate of [
  value=>{value.levels[3].records[0].title='Altered';value.levels[3].records_sha256=sha(JSON.stringify(value.levels[3].records));value.levels[3].pages[0].records_sha256=value.levels[3].records_sha256},
  value=>{value.version='2012'},
  value=>{value.levels[3].declared_count=456},
  value=>{value.levels[3].pages[0].count=0},
  value=>{value.download_complete=false},
 ]) {
  const changed=structuredClone(snapshot);mutate(changed)
  assert.throws(()=>preparePsocImport(changed,{snapshotSha256:sha(JSON.stringify(changed))}))
 }
 assert.throws(()=>preparePsocImport(snapshot),/Verified/)
})
test('actual SQL imports the complete tree and source identities while preserving every preexisting row and ACL',async()=>{
 const db=await database()
 try {
  const original=await dump(db)
  const policies=(await db.query('SELECT policyname,tablename,cmd,roles,qual FROM pg_policies ORDER BY tablename,policyname')).rows
  await db.exec(prepared.sql)
  const after=await dump(db)
  for(const table of Object.keys(original)) {
   const ids=new Set(original[table].map(row=>row.id))
   assert.deepEqual(after[table].filter(row=>ids.has(row.id)),original[table],table)
  }
  assert.equal(after.occupations.length,659);assert.equal(after.taxonomy_sources.length,6)
  assert.equal(after.taxonomy_mappings.length,671);assert.equal(after.occupation_aliases.length,471)
  const imported=(await db.query(`SELECT m.external_code,o.occupation_level,o.canonical_name,o.normalized_name,o.description,
   pm.external_code AS parent_code,m.external_id,m.mapping_type,m.confidence,m.is_primary
   FROM public.taxonomy_mappings m JOIN public.taxonomy_sources s ON s.id=m.taxonomy_source_id
   JOIN public.occupations o ON o.id=m.entity_id LEFT JOIN public.taxonomy_mappings pm
    ON pm.entity_id=o.parent_id AND pm.taxonomy_source_id=s.id
   WHERE s.code='PSOC_2022' ORDER BY o.occupation_level,m.external_code`)).rows
  assert.equal(imported.length,649)
  for(const row of imported) {
   const source=prepared.rows.find(value=>value.code===row.external_code)
   assert.equal(row.canonical_name,source.title);assert.equal(row.normalized_name,source.normalized_name)
   assert.equal(row.description,source.description);assert.equal(row.parent_code,source.parent_code)
   assert.equal(row.external_id,String(source.source_id));assert.equal(row.mapping_type,'exact')
   assert.equal(row.confidence,null);assert.equal(row.is_primary,true)
  }
  assert.deepEqual((await db.query('SELECT policyname,tablename,cmd,roles,qual FROM pg_policies ORDER BY tablename,policyname')).rows,policies)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,4)
  assert.equal((await db.query("SELECT to_regclass('pg_temp.psoc_2022_stage') AS stage")).rows[0].stage,null)
  assert.deepEqual((await db.query("SELECT occupation_level FROM public.occupations WHERE normalized_name='armed forces occupations other ranks' ORDER BY occupation_level")).rows.map(row=>row.occupation_level),[2,3,4])
  await assert.rejects(()=>db.exec("INSERT INTO public.occupations(canonical_name,normalized_name,occupation_level) VALUES('Duplicate unit','data scientist',4)"),error=>error.code==='23505')
  await assert.rejects(()=>db.exec("INSERT INTO public.occupations(canonical_name,normalized_name,occupation_level) VALUES('Duplicate legacy','nurse',0)"),error=>error.code==='23505')
 } finally {await db.close()}
})
test('reapplying the same reference is an exact no-op with stable UUIDs and timestamps',async()=>{
 const db=await database()
 try {await db.exec(prepared.sql);const first=await dump(db);await db.exec(prepared.sql);assert.deepEqual(await dump(db),first)}
 finally{await db.close()}
})
test('changed imported facts cause a closed failure and are never silently overwritten',async()=>{
 const db=await database()
 try {
  await db.exec(prepared.sql)
  await db.exec("UPDATE public.occupations SET description='Synthetic later curator edit' WHERE id=(SELECT entity_id FROM public.taxonomy_mappings m JOIN public.taxonomy_sources s ON s.id=m.taxonomy_source_id WHERE s.code='PSOC_2022' AND m.external_code='2123')")
  const changed=await dump(db)
  await assert.rejects(()=>db.exec(prepared.sql),error=>error.code==='55000')
  assert.deepEqual(await dump(db),changed)
 }finally{await db.close()}
})
test('a conflicting source namespace rolls back without adding occupations or relabeling old sources',async()=>{
 const db=await database()
 try {
  await db.exec("INSERT INTO public.taxonomy_sources(code,name,version) VALUES('PSOC_2022','Synthetic conflicting namespace','2012')")
  const original=await dump(db)
  await assert.rejects(()=>db.exec(prepared.sql),error=>error.code==='55000')
  assert.deepEqual(await dump(db),original)
 }finally{await db.close()}
})
test('ordinary SQL actor cannot run the management import and a tampered payload rolls back before inserts',async()=>{
 const db=await database()
 try {
  const original=await dump(db)
  await db.exec('SET ROLE authenticated')
  await assert.rejects(()=>db.exec(prepared.sql),error=>error.code==='42501')
  await db.exec('RESET ROLE')
  assert.deepEqual(await dump(db),original)
  const tampered=prepared.sql.replace('"title":"MATHEMATICIANS"','"title":"TAMPERED SOURCE"')
  assert.notEqual(tampered,prepared.sql)
  await assert.rejects(()=>db.exec(tampered),/hash mismatch/)
  assert.deepEqual(await dump(db),original)
 }finally{await db.close()}
})

