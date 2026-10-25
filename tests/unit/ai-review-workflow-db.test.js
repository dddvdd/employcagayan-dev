import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {reviewDatabase} from '../support/review-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
import {isHistoricalSuggestion,canWritePreference} from '../../src/domain/aiReviewIntent.js'
let db
before(async()=>{db=await reviewDatabase()})
after(async()=>await db?.close())
async function proposal(f,type,id,fragment,intent='unknown',provenance='explicit'){
 await db.exec('RESET ROLE')
 const run=(await db.query("INSERT INTO public.ai_extraction_runs(entity_type,entity_id,extraction_type,provider,model,input_hash) VALUES('jobseeker_profile',$1,'profile','mock','synthetic',gen_random_uuid()::text) RETURNING id",[f.profile.participant_id])).rows[0].id
 return (await db.query("INSERT INTO public.ai_extraction_suggestions(run_id,entity_type,entity_id,suggestion_type,raw_term,canonical_id,source_text_fragment,source_intent,provenance) VALUES($1,'jobseeker_profile',$2,$3,'Synthetic term',$4,$5,$6,$7) RETURNING id",[run,f.profile.participant_id,type,id,fragment,intent,provenance])).rows[0].id
}
test('past employment accepted as evidence does not become a career preference',async()=>{
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'})
 const occupation=(await db.query("INSERT INTO public.occupations(canonical_name,normalized_name) VALUES('Synthetic history role','synthetic history role') RETURNING id")).rows[0].id
 const id=await proposal(f,'occupation',occupation,'I previously worked as a synthetic history role.')
 const revision=(await db.query("SELECT public.get_embedding_source_revision('jobseeker_profile',$1) AS r",[f.profile.participant_id])).rows[0].r
 await become(db,admin,{aal:'aal2'})
 const result=(await db.query('SELECT public.accept_ai_suggestion($1) AS result',[id])).rows[0].result
 assert.equal(result.success,true);assert.equal(result.wrote_canonical,false);assert.equal(result.embedding_staled,false)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.jobseeker_occupation_preferences WHERE jobseeker_profile_id=$1',[f.profile.participant_id])).rows[0].n,0)
 await db.exec('RESET ROLE')
 assert.equal((await db.query("SELECT public.get_embedding_source_revision('jobseeker_profile',$1) AS r",[f.profile.participant_id])).rows[0].r,revision)
 assert.equal((await db.query('SELECT status FROM public.employment_embeddings WHERE id=$1',[f.embedding])).rows[0].status,'current')
})
test('occupation and industry history, explicit preferences and unknown intent match the UI policy',async()=>{
 const phrases=['Worked as a nurse.','WAS EMPLOYED AS a nurse.','Previously worked in health.','Formerly worked in health.','Employment history: health.','Past experience in health.','Previous role: nurse.','Former role: nurse.','Held the position of nurse.','Served as a nurse.','Employed at a hospital.','Worked at a hospital.','Worked for a hospital.','Worked in health.','Five years of experience.','Background in health.','Experience in health.','Resigned in May.','Terminated in May.','Left the hospital.','Departed in May.','Retired from health.']
 const cases=[...phrases.map(fragment=>({fragment,intent:'unknown',provenance:'explicit',write:false})),
  {fragment:'Interested in health.',intent:'historical',provenance:'explicit',write:false},
  {fragment:'Previously worked as a nurse; seeking nursing again.',intent:'preference',provenance:'explicit',write:true},
  {fragment:'Interested in health.',intent:'unknown',provenance:'explicit',write:true},
  {fragment:'Interested in health.',intent:'unknown',provenance:'inferred',write:false},
  {fragment:null,intent:'unknown',provenance:'explicit',write:false},
  {fragment:'Hardworked as an unrelated substring.',intent:'unknown',provenance:'explicit',write:true}]
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'})
 for(const type of ['occupation','industry']){
  for(const [index,item] of cases.entries()){
   await db.exec('RESET ROLE')
   const table=type==='occupation'?'occupations':'industries'
   const name='Synthetic '+type+' '+index
   const canonical=(await db.query('INSERT INTO public.'+table+'(canonical_name,normalized_name) VALUES($1,$1) RETURNING id',[name])).rows[0].id
   const id=await proposal(f,type,canonical,item.fragment,item.intent,item.provenance)
   const ui={entity_type:'jobseeker_profile',suggestion_type:type,source_intent:item.intent,provenance:item.provenance,source_text_fragment:item.fragment}
   assert.equal(canWritePreference(ui),item.write)
   if(item.intent==='unknown'&&item.provenance==='explicit'&&item.fragment!=null)assert.equal(isHistoricalSuggestion(ui),!item.write)
   await become(db,admin,{aal:'aal2'})
   const result=(await db.query('SELECT public.accept_ai_suggestion($1) AS r',[id])).rows[0].r
   assert.equal(result.success,true);assert.equal(result.wrote_canonical,item.write,type+' '+item.fragment)
   assert.equal(result.embedding_staled,item.write)
   const prefTable='jobseeker_'+type+'_preferences',column=type+'_id'
   const rows=(await db.query('SELECT source FROM public.'+prefTable+' WHERE jobseeker_profile_id=$1 AND '+column+'=$2',[f.profile.participant_id,canonical])).rows
   assert.deepEqual(rows,item.write?[{source:'llm_inferred'}]:[])
  }
 }
})
test('review correction preserves MFA, first review wins and private minimal audit',async()=>{
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'})
 await become(db,admin)
 await assert.rejects(()=>db.query('SELECT public.accept_ai_suggestion($1)',[f.suggestion]),error=>error.code==='42501')
 await become(db,admin,{aal:'aal2'})
 assert.equal((await db.query('SELECT public.accept_ai_suggestion($1) AS r',[f.suggestion])).rows[0].r.wrote_canonical,true)
 assert.equal((await db.query('SELECT public.accept_ai_suggestion($1) AS r',[f.suggestion])).rows[0].r.error,'Already reviewed')
 assert.deepEqual((await db.query('SELECT source,verification_status FROM public.jobseeker_skills WHERE jobseeker_profile_id=$1 AND skill_id=$2',[f.profile.participant_id,f.skill])).rows[0],{source:'llm_inferred',verification_status:'unverified'})
 await db.exec('RESET ROLE')
 const logs=(await db.query("SELECT new_data FROM public.audit_logs WHERE action='ai_suggestion_reviewed' AND record_id=$1",[f.suggestion])).rows
 assert.ok(logs.length)
 for(const row of logs)assert.deepEqual(Object.keys(row.new_data).sort(),['entity_type','review_status','suggestion_type'])
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.accept_ai_suggestion(uuid,uuid)','EXECUTE') AS ok")).rows[0].ok,false)
})
