import {readFile} from 'node:fs/promises'
import {recruitmentDatabase,RECRUITMENT_MIGRATION} from './recruitment-database.js'
export const INTELLIGENCE_MIGRATION='20261013052240_intelligence_authorization_and_provenance.sql'
const quote=s=>'"'+s.replaceAll('"','""')+'"'
const load=async name=>JSON.parse(await readFile(new URL('../../artifacts/intelligence-security-20261013/'+name,import.meta.url),'utf8'))
export async function intelligenceDatabase({migration=null}={}){
 const db=await recruitmentDatabase({migration:RECRUITMENT_MIGRATION})
 try{
  const catalog=await load('dev-catalog.json'),extra=await load('dev-extra.json')
  for(const type of extra.types){
   if(!(await db.query('SELECT 1 FROM pg_type WHERE typname=$1',[type.type])).rows.length)
    await db.exec('CREATE TYPE public.'+quote(type.type)+' AS ENUM ('+type.values.map(value=>"'"+value.replaceAll("'","''")+"'").join(',')+')')
  }
  // Authorization fixtures only: vectors are opaque text, no vector math is simulated.
  // Real vector operators and retrieval authorization are tested against signed DEV.
  await db.exec('CREATE DOMAIN public.vector AS text; CREATE SCHEMA IF NOT EXISTS extensions')
  const columns=[...catalog.columns,...extra.location_columns]
  const tables=[...new Set(columns.map(row=>row.table))]
  for(const table of tables){
   const exists=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',['public',table])).rows.map(row=>row.column_name)
   const ddl=columns.filter(row=>row.table===table&&!exists.includes(row.name)).map(row=>quote(row.name)+' '+(row.type==='USER-DEFINED'?'public.'+quote(row.udt):row.type==='ARRAY'?'text[]':row.type)+(row.default?' DEFAULT '+row.default:'')+(row.nullable==='NO'?' NOT NULL':''))
   if(exists.length){for(const column of ddl)await db.exec('ALTER TABLE public.'+quote(table)+' ADD COLUMN '+column)}
   else await db.exec('CREATE TABLE public.'+quote(table)+' ('+ddl.join(',')+')')
   if(!(await db.query("SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'",['public.'+table])).rows.length)
    await db.exec('ALTER TABLE public.'+quote(table)+' ADD PRIMARY KEY(id)')
   await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON public.'+quote(table)+' TO authenticated')
  }
  for(const item of catalog.constraints.filter(c=>!c.definition.startsWith('PRIMARY KEY')))await db.exec('ALTER TABLE public.'+quote(item.table)+' ADD CONSTRAINT '+quote(item.name)+' '+item.definition)
  const dependencies=await load('dev-dependency-constraints.json')
  for(const item of dependencies.constraints.filter(row=>!row.definition.startsWith('PRIMARY KEY'))){
   if(!(await db.query('SELECT 1 FROM pg_constraint WHERE conname=$1 AND conrelid=$2::regclass',[item.name,'public.'+item.table])).rows.length)await db.exec('ALTER TABLE public.'+quote(item.table)+' ADD CONSTRAINT '+quote(item.name)+' '+item.definition)
  }
  for(const fn of catalog.functions){
   await db.exec(fn.definition)
   await db.exec('REVOKE ALL ON FUNCTION '+fn.schema+'.'+quote(fn.name)+'('+fn.args+') FROM PUBLIC,anon,authenticated,service_role')
   for(const role of ['anon','authenticated','service'])if(fn[role+'_execute'])await db.exec('GRANT EXECUTE ON FUNCTION '+fn.schema+'.'+quote(fn.name)+'('+fn.args+') TO '+(role==='service'?'service_role':role))
  }
  for(const table of ['ai_extraction_runs','ai_extraction_suggestions','employment_embeddings','jobseeker_certifications'])await db.exec('ALTER TABLE public.'+quote(table)+' ENABLE ROW LEVEL SECURITY')
  for(const p of catalog.policies)await db.exec('CREATE POLICY '+quote(p.name)+' ON public.'+quote(p.table)+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',')+(p.using?' USING ('+p.using+')':'')+(p.check?' WITH CHECK ('+p.check+')':''))
  for(const t of catalog.triggers)await db.exec(t.function+';'+t.definition)
  if(migration)await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'))
  return db
 }catch(error){await db.close();throw error}
}
