import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {createDevSyntheticTestFixture} from '../support/dev-synthetic-test-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'

const original='20260915040755_phase_7a_employment_intelligence_aggregates.sql'
const correction='20261019020000_include_online_applications_in_intelligence.sql'
const sql=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
const metrics=[
 'applications_submitted','event_application_count','hires_recorded',
 'application_to_recorded_interview_rate','application_to_confirmed_hire_rate',
 'recorded_interview_to_confirmed_hire_rate','applications_without_final_outcome',
 'application_outcome_coverage',
]
let db

before(async()=>{
 db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 // This focused aggregate fixture needs only the outcome columns referenced
 // by the read-only function; it creates no official case in hosted DEV.
 await db.exec(`CREATE TABLE public.employment_outcomes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid REFERENCES public.applications(id),
  outcome text, hired_at date, verified_by uuid, verification_date date,
  created_at timestamptz DEFAULT now()
 ); GRANT SELECT ON public.employment_outcomes TO authenticated;
 CREATE TABLE public.interview_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid REFERENCES public.applications(id),
  event_id uuid, interview_date timestamptz DEFAULT now()
 ); GRANT SELECT ON public.interview_logs TO authenticated`)
 await db.exec(await sql(original))
})
after(async()=>await db?.close())

async function report(eventId=null) {
 const result=(await db.query('SELECT public.get_employment_intelligence($1::text[],NULL::date,NULL::date,NULL::text,NULL::text,$2::uuid) AS report',[metrics,eventId])).rows[0].report
 return Object.fromEntries(result.cells.map(cell=>[cell.metric_id,cell]))
}

test('global application measures include online cases; event scope stays event-only',async()=>{
 const onlineHire=await createRecruitmentFixture(db)
 const onlinePending=await createRecruitmentFixture(db)
 const event=await createRecruitmentFixture(db)
 await become(db,onlineHire.user)
 const hired=(await db.query('SELECT public.submit_application($1) AS receipt',[onlineHire.vacancy])).rows[0].receipt
 assert.equal(hired.status,'created')
 await become(db,onlinePending.user)
 assert.equal((await db.query('SELECT public.submit_application($1) AS receipt',[onlinePending.vacancy])).rows[0].receipt.status,'created')
 await become(db,event.user)
 assert.equal((await db.query('SELECT public.submit_event_application($1,$2) AS receipt',[event.participation,event.offering])).rows[0].receipt.status,'created')
 await db.exec('RESET ROLE')
 await db.query('INSERT INTO public.interview_logs(application_id) VALUES($1)',[hired.application_id])
 await db.query("INSERT INTO public.employment_outcomes(application_id,outcome,hired_at,verified_by,verification_date) VALUES($1,'hired',CURRENT_DATE,$2,CURRENT_DATE)",[hired.application_id,onlineHire.owner.id])
 const admin=await seedAccount(db,{role:'admin',factor:true})
 await become(db,admin,{aal:'aal2'})

 const before=await report()
 assert.equal(before.applications_submitted.value,1,'original function omits the online application')
 assert.equal(before.event_application_count.value,1)
 assert.equal(before.hires_recorded.value,0)
 assert.equal(before.application_to_recorded_interview_rate.numerator,0)
 assert.equal(before.application_to_confirmed_hire_rate.numerator,0)
 assert.equal(before.recorded_interview_to_confirmed_hire_rate.status,'zero_denominator')

 await db.exec('RESET ROLE')
 await db.exec(await sql(correction))
 await db.exec(await sql('20261020010000_dev_synthetic_test_registry.sql'))
 const synthetic=await createDevSyntheticTestFixture(db)
 const syntheticCase=(await db.query(`INSERT INTO app.dev_synthetic_cases(
   purpose,approval_reference,approved_at,expires_at,status)
   VALUES('Fictional online application exclusion regression',
   'codex-local-report-exclusion-regression',now(),now()+interval '7 days','active')
   RETURNING id`)).rows[0].id
 await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)',
   [syntheticCase,synthetic.user.id,synthetic.profile.participant_id])
 await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)',
   [syntheticCase,synthetic.company])
 await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)',
   [syntheticCase,synthetic.company,synthetic.vacancy])
 await become(db,synthetic.user)
 assert.equal((await db.query('SELECT public.submit_application($1) AS receipt',[synthetic.vacancy])).rows[0].receipt.status,'created')
 await become(db,admin,{aal:'aal2'})
 const all=await report()
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.applications')).rows[0].n,3,
   'ordinary administrator cannot read the classified application')
 assert.equal(all.applications_submitted.value,3)
 assert.equal(all.event_application_count.value,1)
 assert.equal(all.hires_recorded.value,1)
 assert.equal(all.application_to_recorded_interview_rate.numerator,1)
 assert.equal(all.application_to_recorded_interview_rate.denominator,3)
 assert.equal(all.application_to_confirmed_hire_rate.numerator,1)
 assert.equal(all.application_to_confirmed_hire_rate.denominator,3)
 assert.equal(all.recorded_interview_to_confirmed_hire_rate.numerator,1)
 assert.equal(all.recorded_interview_to_confirmed_hire_rate.denominator,1)
 assert.equal(all.applications_without_final_outcome.value,2)
 assert.equal(all.application_outcome_coverage.numerator,1)
 assert.equal(all.application_outcome_coverage.denominator,3)
 assert.equal((await report(event.event)).applications_submitted.value,1)
 assert.equal((await report(onlineHire.event)).applications_submitted.value,0)
 await become(db,onlineHire.user)
 await assert.rejects(()=>report(),error=>error.code==='42501')
})
