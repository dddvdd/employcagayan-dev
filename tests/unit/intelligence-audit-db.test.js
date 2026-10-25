import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {intelligenceDatabase} from '../support/intelligence-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{db=await intelligenceDatabase()})
after(async()=>await db?.close())
const rpc=async(name,args=[]) => (await db.query('SELECT public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS result',args)).rows[0].result
test('baseline municipal supervisor reads and rejects out-of-scope AI suggestions',async()=>{
 const f=await intelligenceFixture(db),actor=await seedAccount(db,{role:'supervisor'})
 await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[actor.id])
 await become(db,actor,{aal:'aal2'})
 assert.equal((await db.query('SELECT * FROM public.list_pending_suggestions(NULL,$1,NULL)',[f.profile.participant_id])).rows.length,1)
 assert.equal((await db.query('SELECT id FROM public.ai_extraction_suggestions WHERE id=$1',[f.suggestion])).rows.length,1)
 assert.equal((await rpc('reject_ai_suggestion',[f.suggestion])).success,true)
})
test('baseline password candidate with pending-company TOTP accepts canonical AI skill',async()=>{
 const f=await intelligenceFixture(db)
 await db.query("DELETE FROM auth.identities WHERE user_id=$1",[f.user.id]);f.user.google=false
 await db.query("INSERT INTO public.employers(registered_user_id,company_name,registration_status,is_active) VALUES($1,$2,'pending',true)",[f.user.id,'Synthetic pending '+f.user.id])
 await become(db,f.user,{aal:'aal2'})
 assert.equal((await rpc('accept_ai_suggestion',[f.suggestion])).success,true)
 assert.equal((await rpc('get_jobseeker_match_profile',[f.profile.participant_id])).participant_id,f.profile.participant_id)
})
test('baseline reviewed-state check discloses foreign reviewer before organization authorization',async()=>{
 const f=await intelligenceFixture(db),other=await intelligenceFixture(db)
 await db.query("UPDATE public.ai_extraction_suggestions SET review_status='accepted',reviewed_by=$1 WHERE id=$2",[f.owner.id,f.suggestion])
 await become(db,other.owner,{aal:'aal2'})
 assert.equal((await rpc('reject_ai_suggestion',[f.suggestion])).reviewed_by,f.owner.id)
})
test('baseline ordinary owner can spoof external certification verification',async()=>{
 const f=await intelligenceFixture(db);await become(db,f.user)
 const row=(await db.query("INSERT INTO public.jobseeker_certifications(jobseeker_profile_id,certification_id,source,verification_status) VALUES($1,$2,'admin_entered','verified') RETURNING source,verification_status",[f.profile.participant_id,f.certification])).rows[0]
 assert.equal(row.source,'admin_entered');assert.equal(row.verification_status,'verified')
})

test('baseline matching payload drops an explicitly recorded zero experience total',async()=>{
 const f=await intelligenceFixture(db)
 await db.query('UPDATE public.jobseeker_profiles SET years_of_experience=0 WHERE participant_id=$1',[f.profile.participant_id])
 await become(db,f.user)
 assert.equal((await rpc('get_jobseeker_match_profile',[f.profile.participant_id])).years_of_experience,undefined)
})
