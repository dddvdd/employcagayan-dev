import {readFile} from 'node:fs/promises'
import {taxonomyDatabase} from './taxonomy-database.js'
export const REVIEW_MIGRATION='20261014010705_ai_review_historical_intent.sql'
export async function reviewDatabase(){
 const db=await taxonomyDatabase()
 try{
 // These two baseline indexes were omitted by the older minimal test fixture.
 const baseline=await readFile(new URL('../../supabase/migrations/20260915000000_baseline_pre_phase7_schema.sql',import.meta.url),'utf8')
 for(const name of ['idx_jobseeker_ind_pref_profile_ind','idx_jobseeker_occ_pref_profile_occ']){
  const statement=baseline.match(new RegExp('CREATE UNIQUE INDEX '+name+'[^;]+;'))?.[0]
  if(!statement)throw Error('Missing baseline preference index')
  await db.exec(statement)
 }
 await db.exec(await readFile(new URL('../../supabase/migrations/'+REVIEW_MIGRATION,import.meta.url),'utf8'));return db}
 catch(error){await db.close();throw error}
}
