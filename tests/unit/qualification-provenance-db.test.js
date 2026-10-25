import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {profileDatabase} from '../support/profile-database.js'
import {recruitmentDatabase,RECRUITMENT_MIGRATION} from '../support/recruitment-database.js'
import {seedAccount,become} from '../support/identity-database.js'
let db,skillId,languageId
const profile={first_name:'Fixture',last_name:'Qualifications',email:'fixture@example.invalid',data_subject_rights_agreed:true,birthdate:'2000-01-01'}
async function references(target) {
 await target.exec('RESET ROLE')
 const skill=(await target.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Fixture Skill','fixture skill') RETURNING id")).rows[0].id
 const language=(await target.query("INSERT INTO public.languages(code,name) VALUES('fx','Fixture Language') RETURNING id")).rows[0].id
 return {skill,language}
}
async function owner(target=db) {
 const account=await seedAccount(target,{google:true})
 await become(target,account)
 const row=(await target.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify(profile)])).rows[0]
 return {...account,participantId:row.participant_id}
}
before(async()=>{db=await recruitmentDatabase({migration:RECRUITMENT_MIGRATION}); const refs=await references(db); skillId=refs.skill;languageId=refs.language})
after(async()=>await db?.close())

test('baseline permits direct owner provenance spoofing; the repair is necessary',async()=>{
 const baseline=await profileDatabase({applyQualificationFix:false})
 try {
  const refs=await references(baseline),account=await owner(baseline)
  const skill=(await baseline.query("INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,source,verification_status) VALUES($1,$2,'admin_entered','verified') RETURNING verification_status",[account.participantId,refs.skill])).rows[0]
  assert.equal(skill.verification_status,'verified')
  const language=(await baseline.query("INSERT INTO public.jobseeker_languages(jobseeker_profile_id,language_id,source) VALUES($1,$2,'admin_entered') RETURNING source",[account.participantId,refs.language])).rows[0]
  assert.equal(language.source,'admin_entered')
 } finally {await baseline.close()}
})

test('owner skill add, edit and reload preserve zero years and joined canonical identity',async()=>{
 const account=await owner()
 const row=(await db.query("INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,years_experience,proficiency_level) VALUES($1,$2,0,'beginner') RETURNING *",[account.participantId,skillId])).rows[0]
 assert.equal(row.source,'self_reported');assert.equal(row.verification_status,'unverified');assert.equal(row.years_experience,0)
 await db.query("UPDATE public.jobseeker_skills SET years_experience=3,proficiency_level='advanced' WHERE id=$1",[row.id])
 const reloaded=(await db.query('SELECT js.*,s.canonical_name FROM public.jobseeker_skills js JOIN public.skills s ON s.id=js.skill_id WHERE js.id=$1',[row.id])).rows[0]
 assert.equal(reloaded.years_experience,3);assert.equal(reloaded.proficiency_level,'advanced');assert.equal(reloaded.canonical_name,'Fixture Skill')
 await assert.rejects(()=>db.query("UPDATE public.jobseeker_skills SET years_experience=-1 WHERE id=$1",[row.id]))
 await assert.rejects(()=>db.query("UPDATE public.jobseeker_skills SET proficiency_level='made_up' WHERE id=$1",[row.id]))
})

test('owners cannot insert or update external provenance or verification',async()=>{
 const account=await owner()
 for(const source of ['admin_entered','employer_reported','legacy_backfill','llm_inferred']) {
  await assert.rejects(()=>db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,source) VALUES($1,$2,$3)',[account.participantId,skillId,source]),/provenance/)
  await assert.rejects(()=>db.query('INSERT INTO public.jobseeker_languages(jobseeker_profile_id,language_id,source) VALUES($1,$2,$3)',[account.participantId,languageId,source]),/provenance/)
 }
 await assert.rejects(()=>db.query("INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,verification_status) VALUES($1,$2,'verified')",[account.participantId,skillId]),/verification/)
 const row=(await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2) RETURNING id',[account.participantId,skillId])).rows[0]
 await assert.rejects(()=>db.query("UPDATE public.jobseeker_skills SET verification_status='verified' WHERE id=$1",[row.id]),/administrator/)
 await assert.rejects(()=>db.query("UPDATE public.jobseeker_skills SET source='admin_entered' WHERE id=$1",[row.id]),/provenance/)
})

test('verified administrator provenance survives no-op owner saves, material edits invalidate it',async()=>{
 const account=await owner()
 const skill=(await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2) RETURNING id',[account.participantId,skillId])).rows[0]
 const language=(await db.query('INSERT INTO public.jobseeker_languages(jobseeker_profile_id,language_id) VALUES($1,$2) RETURNING id',[account.participantId,languageId])).rows[0]
 const admin=await seedAccount(db,{role:'admin',factor:true})
 await become(db,admin,{aal:'aal2'})
 await db.query("UPDATE public.jobseeker_skills SET source='admin_entered',verification_status='verified' WHERE id=$1",[skill.id])
 await db.query("UPDATE public.jobseeker_languages SET source='admin_entered',speaking_proficiency='advanced' WHERE id=$1",[language.id])
 await become(db,account)
 await db.query('UPDATE public.jobseeker_skills SET years_experience=years_experience WHERE id=$1',[skill.id])
 let row=(await db.query('SELECT * FROM public.jobseeker_skills WHERE id=$1',[skill.id])).rows[0]
 assert.equal(row.verification_status,'verified');assert.equal(row.source,'admin_entered')
 await db.query("UPDATE public.jobseeker_skills SET proficiency_level='expert' WHERE id=$1",[skill.id])
 row=(await db.query('SELECT * FROM public.jobseeker_skills WHERE id=$1',[skill.id])).rows[0]
 assert.equal(row.verification_status,'unverified');assert.equal(row.source,'self_reported')
 await db.query("UPDATE public.jobseeker_languages SET speaking_proficiency='fluent' WHERE id=$1",[language.id])
 assert.equal((await db.query('SELECT source FROM public.jobseeker_languages WHERE id=$1',[language.id])).rows[0].source,'self_reported')
})

test('cross-account reads, writes and forged ownership remain denied',async()=>{
 const account=await owner()
 const row=(await db.query('INSERT INTO public.jobseeker_languages(jobseeker_profile_id,language_id) VALUES($1,$2) RETURNING id',[account.participantId,languageId])).rows[0]
 const other=await owner()
 assert.deepEqual((await db.query('SELECT id FROM public.jobseeker_languages WHERE id=$1',[row.id])).rows,[])
 assert.deepEqual((await db.query("UPDATE public.jobseeker_languages SET speaking_proficiency='native' WHERE id=$1 RETURNING id",[row.id])).rows,[])
 await assert.rejects(()=>db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2)',[account.participantId,skillId]))
 await become(db,other,{method:'password'})
 await assert.rejects(()=>db.query('INSERT INTO public.jobseeker_languages(jobseeker_profile_id,language_id) VALUES($1,$2)',[other.participantId,languageId]))
})

test('invoker provenance guard preserves the trusted definer execution boundary',async()=>{
 const account=await owner()
 await db.exec('RESET ROLE')
 await db.exec(`CREATE FUNCTION public.fixture_reviewed_skill(p_owner uuid,p_skill uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fixture$ INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,source) VALUES(p_owner,p_skill,'llm_inferred') $fixture$; GRANT EXECUTE ON FUNCTION public.fixture_reviewed_skill(uuid,uuid) TO authenticated;`)
 await become(db,account)
 await db.query('SELECT public.fixture_reviewed_skill($1,$2)',[account.participantId,skillId])
 assert.equal((await db.query('SELECT source FROM public.jobseeker_skills WHERE jobseeker_profile_id=$1',[account.participantId])).rows[0].source,'llm_inferred')
 // The isolated fixture demonstrates the PostgreSQL execution distinction;
 // it is never installed live and does not validate the full AI review RPC.
})

test('provenance transitions are privately audited without qualification or personal text',async()=>{
 await db.exec('RESET ROLE')
 const rows=(await db.query("SELECT user_id,old_data,new_data FROM public.audit_logs WHERE action='qualification_provenance_changed'")).rows
 assert.ok(rows.length>=4)
 for(const row of rows) {
  assert.ok(row.user_id)
  assert.deepEqual(Object.keys(row.new_data).sort(),['source','verification_status'])
  if(row.old_data)assert.deepEqual(Object.keys(row.old_data).sort(),['source','verification_status'])
 }
})
