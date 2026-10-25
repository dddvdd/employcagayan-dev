import {readFile} from 'node:fs/promises'
import {reviewDatabase} from './review-database.js'
export const SOURCE_MIGRATION='20261014060507_canonical_extraction_source_snapshot.sql'
export async function sourceDatabase(){
 const db=await reviewDatabase()
 try{
  const catalog=JSON.parse(await readFile(new URL('../../artifacts/extraction-producer-20261014/dev-catalog.json',import.meta.url),'utf8'))
  const fields=new Set(['professional_summary','career_interests','skills','desired_occupation','desired_industry','previous_occupation','previous_industry','highest_educational_attainment','course_program','position','job_description','qualifications','requirements_summary'])
  for(const table of ['jobseeker_profiles','vacancy_definitions']){
   const existing=new Set((await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',['public',table])).rows.map(c=>c.column_name))
   for(const c of catalog.columns.filter(c=>c.table===table&&fields.has(c.name)&&!existing.has(c.name))){
    if(c.type!=='text'||!/^\w+$/.test(c.name))throw Error('Unexpected source column')
    await db.exec('ALTER TABLE public.'+table+' ADD COLUMN '+c.name+' text')
   }
  }
  if(process.env.EMPLOY_SOURCE_DB_BASELINE!=='1')await db.exec(await readFile(new URL('../../supabase/migrations/'+SOURCE_MIGRATION,import.meta.url),'utf8'))
  return db
 }catch(e){await db.close();throw e}
}
