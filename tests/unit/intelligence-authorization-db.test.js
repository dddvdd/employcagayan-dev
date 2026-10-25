import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})})
after(async()=>await db?.close())
const rpc=async(name,args=[]) => (await db.query('SELECT public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS result',args)).rows[0].result
const denied=fn=>assert.rejects(fn,error=>error.code==='42501')
test('municipal AI queue, direct records, embeddings and mutations obey existing event jurisdiction',async()=>{
 const f=await intelligenceFixture(db),actor=await seedAccount(db,{role:'supervisor'})
 await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[actor.id])
 await become(db,actor,{aal:'aal2'})
 assert.deepEqual((await db.query('SELECT * FROM public.list_pending_suggestions(NULL,$1,NULL)',[f.profile.participant_id])).rows,[])
 for(const table of ['ai_extraction_suggestions','ai_extraction_runs','employment_embeddings']){
  const id=table==='ai_extraction_suggestions'?f.suggestion:table==='ai_extraction_runs'?f.run:f.embedding
  assert.deepEqual((await db.query('SELECT id FROM public.'+table+' WHERE id=$1',[id])).rows,[])
 }
 for(const [name,args] of [['accept_ai_suggestion',[f.suggestion]],['reject_ai_suggestion',[f.suggestion]],['edit_ai_suggestion',[f.suggestion,'Synthetic',f.skill]]])await denied(()=>rpc(name,args))
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Tuguegarao City' WHERE id=$1",[actor.id])
 await become(db,actor,{aal:'aal2'})
 assert.equal((await db.query('SELECT * FROM public.list_pending_suggestions(NULL,$1,NULL)',[f.profile.participant_id])).rows.length,1)
 assert.equal((await rpc('accept_ai_suggestion',[f.suggestion])).wrote_canonical,true)
})
test('provincial, staff and administrator oversight remains available',async()=>{
 for(const role of ['supervisor','staff','admin']){
  const f=await intelligenceFixture(db),actor=await seedAccount(db,{role})
  if(role==='supervisor')await db.query("UPDATE public.profiles SET is_provincial=true,jurisdiction='Aparri' WHERE id=$1",[actor.id])
  await become(db,actor,{aal:'aal2'})
  assert.equal((await db.query('SELECT * FROM public.list_pending_suggestions(NULL,$1,NULL)',[f.profile.participant_id])).rows.length,1)
  assert.equal((await rpc('reject_ai_suggestion',[f.suggestion])).success,true)
 }
})
test('password candidate pending-company TOTP cannot read matching data or review AI proposals',async()=>{
 const f=await intelligenceFixture(db)
 await db.query('DELETE FROM auth.identities WHERE user_id=$1',[f.user.id]);f.user.google=false
 await db.query("INSERT INTO public.employers(registered_user_id,company_name,registration_status,is_active) VALUES($1,$2,'pending',true)",[f.user.id,'Synthetic pending '+f.user.id])
 await become(db,f.user,{aal:'aal2'})
 for(const [name,args] of [['list_pending_suggestions',[null,f.profile.participant_id,null]],['accept_ai_suggestion',[f.suggestion]],['reject_ai_suggestion',[f.suggestion]],['get_jobseeker_match_profile',[f.profile.participant_id]],['get_vacancy_match_profile',[f.vacancy]],['get_vacancies_match_profiles',[[f.vacancy],null]]])await denied(()=>rpc(name,args))
})
test('Google owner confirms only owned proposals; canonical skill remains unverified AI provenance',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await become(db,f.user)
 await denied(()=>rpc('accept_ai_suggestion',[other.suggestion]))
 assert.equal((await rpc('accept_ai_suggestion',[f.suggestion])).success,true)
 const row=(await db.query('SELECT source,verification_status FROM public.jobseeker_skills WHERE jobseeker_profile_id=$1 AND skill_id=$2',[f.profile.participant_id,f.skill])).rows[0]
 assert.deepEqual(row,{source:'llm_inferred',verification_status:'unverified'})
 await db.exec('RESET ROLE')
 assert.equal((await db.query('SELECT status FROM public.employment_embeddings WHERE id=$1',[f.embedding])).rows[0].status,'stale')
})
test('foreign reviewed suggestions no longer disclose status or reviewer before authorization',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await db.query("UPDATE public.ai_extraction_suggestions SET review_status='accepted',reviewed_by=$1 WHERE id=$2",[f.owner.id,f.suggestion])
 await become(db,other.owner,{aal:'aal2'})
 for(const [name,args] of [['accept_ai_suggestion',[f.suggestion]],['reject_ai_suggestion',[f.suggestion]],['edit_ai_suggestion',[f.suggestion,'Synthetic',f.skill]]])await denied(()=>rpc(name,args))
})
test('mandatory Partner MFA and active sessions guard review and matching RPCs',async()=>{
 const f=await intelligenceFixture(db),actor=await seedAccount(db,{role:'admin'})
 await become(db,actor,{aal:'aal1'})
 for(const [name,args] of [['accept_ai_suggestion',[f.suggestion]],['list_pending_suggestions',[null,f.profile.participant_id,null]],['get_jobseeker_match_profile',[f.profile.participant_id]]])await denied(()=>rpc(name,args))
 await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE id=$1',[actor.sessionId])
 await become(db,actor,{aal:'aal2'});await denied(()=>rpc('accept_ai_suggestion',[f.suggestion]))
})
test('ordinary owners cannot create or upgrade external certification provenance',async()=>{
 const f=await intelligenceFixture(db);await become(db,f.user)
 await denied(()=>db.query("INSERT INTO public.jobseeker_certifications(jobseeker_profile_id,certification_id,source,verification_status) VALUES($1,$2,'admin_entered','verified')",[f.profile.participant_id,f.certification]))
 const row=(await db.query('INSERT INTO public.jobseeker_certifications(jobseeker_profile_id,certification_id) VALUES($1,$2) RETURNING id',[f.profile.participant_id,f.certification])).rows[0]
 await denied(()=>db.query("UPDATE public.jobseeker_certifications SET verification_status='verified' WHERE id=$1",[row.id]))
})
test('verified administrator certification survives no-op and resets after material owner edit',async()=>{
 const f=await intelligenceFixture(db),admin=await seedAccount(db,{role:'admin'})
 await become(db,admin,{aal:'aal2'})
 const id=(await db.query("INSERT INTO public.jobseeker_certifications(jobseeker_profile_id,certification_id,source,verification_status) VALUES($1,$2,'admin_entered','verified') RETURNING id",[f.profile.participant_id,f.certification])).rows[0].id
 await become(db,f.user)
 await db.query('UPDATE public.jobseeker_certifications SET updated_at=now() WHERE id=$1',[id])
 assert.equal((await db.query('SELECT verification_status FROM public.jobseeker_certifications WHERE id=$1',[id])).rows[0].verification_status,'verified')
 await db.query("UPDATE public.jobseeker_certifications SET expiration_date='2027-10-13' WHERE id=$1",[id])
 assert.deepEqual((await db.query('SELECT source,verification_status FROM public.jobseeker_certifications WHERE id=$1',[id])).rows[0],{source:'self_reported',verification_status:'unverified'})
})
test('new audit payloads omit extracted text, review notes and credential contents',async()=>{
 await db.exec('RESET ROLE')
 const rows=(await db.query("SELECT action,new_data FROM public.audit_logs WHERE action IN ('ai_suggestion_reviewed','qualification_provenance_changed')")).rows
 assert.ok(rows.length>5)
 for(const row of rows)assert.deepEqual(Object.keys(row.new_data).sort(),row.action==='ai_suggestion_reviewed'?['entity_type','review_status','suggestion_type']:['source','verification_status'])
})
test('private mutation helpers and trigger functions are not client-callable; AI RPCs deny anonymous grants',async()=>{
 await db.exec('RESET ROLE')
 for(const name of ['require_intelligence_session()','require_ai_suggestion_review(uuid)','guard_direct_certification_provenance()','audit_ai_review()']){
  assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed",['app.'+name])).rows[0].allowed,false)
 }
 for(const name of ['accept_ai_suggestion(uuid,uuid)','reject_ai_suggestion(uuid,text)','edit_ai_suggestion(uuid,text,uuid)','list_pending_suggestions(text,uuid,text)']){
  assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed",['public.'+name])).rows[0].allowed,false)
 }
})

test('matching payload preserves explicit zero experience without upgrading unknowns',async()=>{
 const f=await intelligenceFixture(db)
 await db.query('UPDATE public.jobseeker_profiles SET years_of_experience=0 WHERE participant_id=$1',[f.profile.participant_id])
 await become(db,f.user)
 assert.equal((await rpc('get_jobseeker_match_profile',[f.profile.participant_id])).years_of_experience,0)
})
test('employer review is bound to owned approved active vacancies',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await db.exec('RESET ROLE')
 const ids=[]
 for(const row of [f,other]){
  const id=(await db.query("INSERT INTO public.ai_extraction_suggestions(run_id,entity_type,entity_id,suggestion_type,raw_term,canonical_id,importance) VALUES($1,'vacancy',$2,'skill','Synthetic skill',$3,'required') RETURNING id",[row.run,row.vacancy,row.skill])).rows[0].id;ids.push(id)
 }
 await become(db,f.owner,{aal:'aal2'})
 await denied(()=>rpc('accept_ai_suggestion',[ids[1]]))
 assert.equal((await rpc('accept_ai_suggestion',[ids[0]])).success,true)
 await db.exec('RESET ROLE');await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[f.company])
 await become(db,f.owner,{aal:'aal2'})
 await denied(()=>rpc('reject_ai_suggestion',[ids[0]]))
})
