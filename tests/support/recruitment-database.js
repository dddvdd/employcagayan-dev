import {readFile} from 'node:fs/promises'
import {profileDatabase} from './profile-database.js'
export const RECRUITMENT_MIGRATION='20261013042419_recruitment_resume_authorization.sql'
const quote=s=>'"'+s.replaceAll('"','""')+'"'
const load=async name=>JSON.parse(await readFile(new URL('../../artifacts/recruitment-milestone-20261013/'+name,import.meta.url),'utf8'))
export async function recruitmentDatabase({migration=null}={}) {
 const db=await profileDatabase(),catalog=await load('dev-catalog.json'),extra=await load('dev-extra.json'),dependencies=await load('dev-dependencies.json')
 try {
 await db.exec("ALTER TABLE storage.objects ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb")
 for(const type of catalog.types) {
  if(!(await db.query('SELECT 1 FROM pg_type WHERE typname=$1',[type.type])).rows.length)
   await db.exec('CREATE TYPE public.'+quote(type.type)+' AS ENUM ('+type.values.map(v=>"'"+v.replaceAll("'","''")+"'").join(',')+')')
 }
 const columns=[...new Map([...catalog.columns,...catalog.event_participation_columns,...extra.columns,...dependencies].map(c=>[c.table+'.'+c.name,c])).values()]
 const tables=['employment_types','industries','occupations','work_arrangements','vacancy_experience_requirements','vacancy_skills','events','event_participations','vacancy_definitions','event_vacancies','participation_vacancies','applications','vacancy_history']
 for(const table of tables) {
  const existing=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table])).rows.map(r=>r.column_name)
  const ddl=columns.filter(c=>c.table===table&&!existing.includes(c.name)).map(c=>quote(c.name)+' '+(c.type==='USER-DEFINED'?'public.'+quote(c.udt):c.type==='ARRAY'?'text[]':c.type)+(c.default?' DEFAULT '+c.default:'')+(c.nullable==='NO'?' NOT NULL':''))
  if(existing.length) for(const column of ddl)await db.exec('ALTER TABLE public.'+quote(table)+' ADD COLUMN '+column)
  else await db.exec('CREATE TABLE public.'+quote(table)+' ('+ddl.join(',')+')')
  if(!(await db.query("SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'",['public.'+table])).rows.length)
   if(table!=='participation_vacancies')await db.exec('ALTER TABLE public.'+quote(table)+' ADD PRIMARY KEY(id)')
  await db.exec('ALTER TABLE public.'+quote(table)+' ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON public.'+quote(table)+' TO authenticated')
 }
 for(const constraint of catalog.constraints.filter(c=>tables.includes(c.table)&&!c.definition.startsWith('PRIMARY KEY')))
  await db.exec('ALTER TABLE public.'+quote(constraint.table)+' ADD CONSTRAINT '+quote(constraint.name)+' '+constraint.definition)
 await db.exec('ALTER TABLE public.event_participations ADD FOREIGN KEY(participant_id) REFERENCES public.participants(id), ADD FOREIGN KEY(event_id) REFERENCES public.events(id)')
 for(const index of catalog.indexes.filter(i=>tables.includes(i.table)&&!i.name.endsWith('_pkey')))
  if(!(await db.query('SELECT to_regclass($1) AS existing',['public.'+index.name])).rows[0].existing)await db.exec(index.definition)
 const publication=await load('dev-publication-functions.json')
 const functions=['publish_vacancy','close_vacancy','foldername','supervisor_can_view_event','app_current_user_role_text','is_event_staff','get_employer_applicants','submit_application','submit_event_application','withdraw_application','update_application_status','list_my_applications','list_employer_applications','enforce_application_canonical_identity','record_vacancy_history','validate_vacancy_publication','auto_link_employer']
 for(const fn of [...catalog.functions,...publication].filter(f=>functions.includes(f.name))) {
  await db.exec(fn.definition)
  await db.exec('REVOKE ALL ON FUNCTION '+fn.schema+'.'+quote(fn.name)+'('+fn.args+') FROM PUBLIC,anon,authenticated')
  if(fn.anon_execute)await db.exec('GRANT EXECUTE ON FUNCTION '+fn.schema+'.'+quote(fn.name)+'('+fn.args+') TO anon')
  if(fn.authenticated_execute)await db.exec('GRANT EXECUTE ON FUNCTION '+fn.schema+'.'+quote(fn.name)+'('+fn.args+') TO authenticated')
 }
 const policyTables=[...tables,'participants','jobseeker_profiles']
 for(const policy of (await db.query("SELECT schemaname,tablename,policyname FROM pg_policies WHERE (schemaname='public' AND tablename=ANY($1::text[])) OR (schemaname='storage' AND tablename='objects')",[policyTables])).rows)
  await db.exec('DROP POLICY '+quote(policy.policyname)+' ON '+quote(policy.schemaname)+'.'+quote(policy.tablename))
 const policies=[...catalog.policies,...catalog.event_participation_policies,...extra.policies].filter(p=>policyTables.includes(p.table)||p.schema==='storage')
 for(const p of policies)
  await db.exec('CREATE POLICY '+quote(p.name)+' ON '+quote(p.schema)+'.'+quote(p.table)+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',')+(p.using?' USING ('+p.using+')':'')+(p.check?' WITH CHECK ('+p.check+')':''))
 for(const t of catalog.triggers.filter(t=>tables.includes(t.table)))await db.exec(t.definition)
 if(migration)await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'))
 return db
 } catch(error) {await db.close();throw error}
}
