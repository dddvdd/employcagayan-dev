import {readFile} from 'node:fs/promises'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from './intelligence-database.js'
export const FRESHNESS_MIGRATION='20261013235338_embedding_source_freshness.sql'
export async function freshnessDatabase(){
 const db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 try{
  await db.exec(await readFile(new URL('../../supabase/migrations/20261013063051_authorized_semantic_pair_similarity.sql',import.meta.url),'utf8'))
  // Opaque vector domain only; successful vector persistence/math are tested on DEV.
  await db.exec('CREATE DOMAIN extensions.vector AS text')
  await db.exec(await readFile(new URL('../../supabase/migrations/'+FRESHNESS_MIGRATION,import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261013235850_embedding_stale_write_error.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261014000332_qualification_guard_helper_access.sql',import.meta.url),'utf8'))
  await db.exec('REVOKE USAGE ON SCHEMA app FROM anon,authenticated,service_role')
  return db
 }catch(error){await db.close();throw error}
}
