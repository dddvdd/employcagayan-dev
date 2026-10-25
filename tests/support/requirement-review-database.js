import {readFile} from 'node:fs/promises'
import {lifecycleDatabase} from './extraction-lifecycle-database.js'
export const REQUIREMENT_MIGRATION='20261014080757_reviewed_requirement_details.sql'
export async function requirementDatabase(){
 const db=await lifecycleDatabase()
 try{await db.exec(await readFile(new URL('../../supabase/migrations/'+REQUIREMENT_MIGRATION,import.meta.url),'utf8'));return db}
 catch(e){await db.close();throw e}
}
