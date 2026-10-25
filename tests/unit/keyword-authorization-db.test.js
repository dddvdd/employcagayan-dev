import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {intelligenceFixture} from '../support/intelligence-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
let db
before(async()=>{
 db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 await db.exec(await readFile(new URL('../../supabase/migrations/20261013063051_authorized_semantic_pair_similarity.sql',import.meta.url),'utf8'))
 const name=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_authorized_match_keyword_signals.sql'))
 await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'))
 await db.exec('REVOKE USAGE ON SCHEMA app FROM authenticated,anon,service_role')
})
after(async()=>await db?.close())
const query=async pairs=>(await db.query('SELECT public.get_match_keyword_signals($1::jsonb) result',[JSON.stringify(pairs)])).rows[0].result
const one=f=>({jobseeker_profile_id:f.profile.participant_id,vacancy_id:f.vacancy,event_vacancy_id:null})
async function fixture(){
 const f=await intelligenceFixture(db);await db.exec('RESET ROLE')
 const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Quantum Welding',$1) RETURNING id",['quantum welding '+randomUUID()])).rows[0].id
 await db.query("INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,verification_status) VALUES($1,$2,'verified')",[f.profile.participant_id,skill])
 await db.query("UPDATE public.employers SET company_name=$2 WHERE id=$1",[f.company,'Keyword '+f.company])
 await db.query("UPDATE public.vacancy_definitions SET position='Quantum Welding',company_name=$2 WHERE id=$1",[f.vacancy,'Keyword '+f.company])
 return {...f,keywordSkill:skill}
}
const denied=fn=>assert.rejects(fn,error=>error.code==='42501')
test('actual PostgreSQL full-text matching derives current canonical words and returns no personal document',async()=>{
 const f=await fixture();await become(db,f.user)
 const [r]=await query([one(f)])
 assert.equal(r.status,'available');assert.equal(r.score,100);assert.equal(r.query_term_count,2)
 assert.deepEqual(r.matched_terms,['quantum','welding']);assert.equal(r.qualification_credit,false);assert.ok(r.rank>0)
 assert.equal('query_text' in r,false);assert.equal('source_text' in r,false)
})
test('names, demographics, free text and unverified skills cannot manufacture keyword evidence',async()=>{
 const f=await fixture();await db.query("UPDATE public.jobseeker_skills SET verification_status='unverified' WHERE jobseeker_profile_id=$1",[f.profile.participant_id])
 await db.query("UPDATE public.jobseeker_profiles SET first_name='Quantum',last_name='Welding',professional_summary='Quantum Welding',desired_occupation='Quantum Welding' WHERE participant_id=$1",[f.profile.participant_id])
 await become(db,f.user)
 const [r]=await query([one(f)]);assert.equal(r.status,'not_applicable');assert.equal(r.score,null);assert.deepEqual(r.matched_terms,[])
})
test('current source changes are observed immediately and zero matches remain a valid result',async()=>{
 const f=await fixture();await become(db,f.user);assert.equal((await query([one(f)]))[0].score,100)
 await db.exec('RESET ROLE');await db.query("UPDATE public.vacancy_definitions SET position='Unrelated Clerical' WHERE id=$1",[f.vacancy])
 await become(db,f.user);const [r]=await query([one(f)])
 assert.equal(r.status,'available');assert.equal(r.score,0);assert.equal(r.rank,0);assert.deepEqual(r.matched_terms,[])
})
test('cross-owner, unapproved-company and same-company out-of-pool pairs are rejected',async()=>{
 const f=await fixture(),other=await fixture();await become(db,f.owner,{aal:'aal2'})
 assert.equal((await query([one(f)]))[0].score,100)
 await denied(()=>query([{...one(f),vacancy_id:other.vacancy}]))
 await denied(()=>query([{...one(f),jobseeker_profile_id:other.profile.participant_id}]))
 await db.exec('RESET ROLE')
 const extra=(await db.query("INSERT INTO public.vacancy_definitions(employer_id,company_name,position,job_description,place_of_assignment,is_active,platform_status,published_at) VALUES($1,'Fixture employer','Quantum Welding','Synthetic publication description of sufficient length.','Tuguegarao City',true,'published',now()) RETURNING id",[f.company])).rows[0].id
 await become(db,f.owner,{aal:'aal2'})
 assert.deepEqual((await db.query('SELECT public.get_vacancy_candidate_match_profiles($1,NULL) pool',[extra])).rows[0].pool,[])
 await denied(()=>query([{...one(f),vacancy_id:extra}]))
 await db.exec('RESET ROLE');await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[f.company])
 await become(db,f.owner,{aal:'aal2'});await denied(()=>query([]))
})
test('Partner MFA, actual identity session and caller grants apply even to empty requests',async()=>{
 const f=await fixture();await become(db,f.owner,{aal:'aal1'});await denied(()=>query([]))
 await become(db,f.user);await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE user_id=$1',[f.user.id])
 await become(db,f.user);await denied(()=>query([one(f)]))
 await db.exec('RESET ROLE')
 for(const role of ['anon','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.get_match_keyword_signals(jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false)
 assert.equal((await db.query("SELECT prosecdef FROM pg_proc WHERE oid='public.get_match_keyword_signals(jsonb)'::regprocedure")).rows[0].prosecdef,false)
})
test('bounded canonical requests reject raw text, malformed identifiers and invalid event contexts',async()=>{
 const f=await fixture();await become(db,f.user)
 for(const value of [null,{},Array(101).fill(one(f)),[{...one(f),query:'private'}],[{...one(f),vacancy_id:'invalid'}],[{...one(f),event_vacancy_id:4}]])
  await assert.rejects(()=>query(value),e=>e.code==='22023')
 await denied(()=>query([{...one(f),event_vacancy_id:randomUUID()}]))
 assert.deepEqual(await query([]),[])
})
test('term and text bounds do not silently truncate or grant partial keyword credit',async()=>{
 const f=await fixture();await db.query("UPDATE public.skills SET canonical_name=$2 WHERE id=$1",[f.keywordSkill,Array.from({length:65},(_,i)=>'lexeme'+i).join(' ')])
 await become(db,f.user);assert.equal((await query([one(f)]))[0].reason,'query_limit')
 await db.exec('RESET ROLE');await db.query("UPDATE public.skills SET canonical_name=$2 WHERE id=$1",[f.keywordSkill,'verylong '.repeat(3000)])
 await become(db,f.user);const [r]=await query([one(f)]);assert.equal(r.reason,'text_limit');assert.equal(r.score,null)
})
test('operator characters in canonical vocabulary are treated as parsed data',async()=>{
 const f=await fixture();await db.query("UPDATE public.skills SET canonical_name=$2 WHERE id=$1",[f.keywordSkill,"O'Reilly Welding | !Quantum"])
 await become(db,f.user);const [r]=await query([one(f)]);assert.equal(r.status,'available');assert.ok(r.matched_terms.includes('welding'))
})

test('expired or unverified credentials never enter the keyword query; current verified credentials do',async()=>{
 const f=await fixture();await db.query("UPDATE public.certifications SET canonical_name='Pilot' WHERE id=$1",[f.certification])
 await db.query("INSERT INTO public.jobseeker_certifications(jobseeker_profile_id,certification_id,verification_status,does_not_expire,expiration_date) VALUES($1,$2,'verified',false,current_date-1)",[f.profile.participant_id,f.certification])
 await become(db,f.user);assert.equal((await query([one(f)]))[0].query_term_count,2)
 await db.exec('RESET ROLE');await db.query("UPDATE public.jobseeker_certifications SET expiration_date=current_date+1 WHERE jobseeker_profile_id=$1",[f.profile.participant_id])
 await become(db,f.user);assert.equal((await query([one(f)]))[0].query_term_count,3)
 await db.exec('RESET ROLE');await db.query("UPDATE public.jobseeker_certifications SET verification_status='unverified' WHERE jobseeker_profile_id=$1",[f.profile.participant_id])
 await become(db,f.user);assert.equal((await query([one(f)]))[0].query_term_count,2)
})
test('supervisor event jurisdiction is checked before producing keyword evidence',async()=>{
 const f=await fixture(),supervisor=await seedAccount(db,{role:'supervisor'})
 await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[supervisor.id])
 await become(db,supervisor,{aal:'aal2'});await denied(()=>query([{...one(f),event_vacancy_id:f.offering}]))
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET is_provincial=true WHERE id=$1",[supervisor.id])
 await become(db,supervisor,{aal:'aal2'});assert.equal((await query([{...one(f),event_vacancy_id:f.offering}]))[0].score,100)
})
test('a mixed authorized and foreign batch returns no partial keyword results',async()=>{
 const f=await fixture(),other=await fixture();await become(db,f.user)
 await denied(()=>query([one(f),one(other)]))
})
