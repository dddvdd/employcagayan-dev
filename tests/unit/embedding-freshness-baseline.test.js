import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
test('baseline profile and qualification edits leave a current embedding unchanged',async()=>{
 const db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 try{
  await db.exec(await readFile(new URL('../../supabase/migrations/20261013063051_authorized_semantic_pair_similarity.sql',import.meta.url),'utf8'))
  const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'})
  await become(db,admin,{aal:'aal2'})
  await db.query('UPDATE public.jobseeker_profiles SET years_of_experience=2 WHERE participant_id=$1',[f.profile.participant_id])
  await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[f.profile.participant_id,f.skill])
  assert.equal((await db.query('SELECT status FROM public.employment_embeddings WHERE id=$1',[f.embedding])).rows[0].status,'current')
 }finally{await db.close()}
})
