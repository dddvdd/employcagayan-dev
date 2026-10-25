import {readFile} from 'node:fs/promises'
import {sourceDatabase} from './extraction-source-database.js'
export const LIFECYCLE_MIGRATION='20261014071515_controlled_extraction_runs.sql'
export async function lifecycleDatabase(){
 const db=await sourceDatabase()
 try{
  await db.exec(await readFile(new URL('../../supabase/migrations/20261014012658_guarded_extraction_quota.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/'+LIFECYCLE_MIGRATION,import.meta.url),'utf8'))
  return db
 }catch(e){await db.close();throw e}
}
