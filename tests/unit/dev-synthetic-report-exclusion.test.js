import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { intelligenceDatabase, INTELLIGENCE_MIGRATION } from '../support/intelligence-database.js'
import { createRecruitmentFixture } from '../support/recruitment-fixture.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'
import { become, seedAccount } from '../support/identity-database.js'

let db
const sql = name => readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')
const metrics = ['unique_participants', 'unique_jobseekers', 'active_vacancies', 'active_approved_employers']
before(async () => {
  db = await intelligenceDatabase({ migration: INTELLIGENCE_MIGRATION })
  await db.exec(`CREATE TABLE public.employment_outcomes(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid REFERENCES public.applications(id),
    outcome text,hired_at date,verified_by uuid,verification_date date,created_at timestamptz DEFAULT now()
  ); GRANT SELECT ON public.employment_outcomes TO authenticated;
  CREATE TABLE public.interview_logs(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid REFERENCES public.applications(id),
    event_id uuid,interview_date timestamptz DEFAULT now()
  ); GRANT SELECT ON public.interview_logs TO authenticated`)
  await db.exec(await sql('20260915040755_phase_7a_employment_intelligence_aggregates.sql'))
  await db.exec(await sql('20261020010000_dev_synthetic_test_registry.sql'))
  await db.exec(await sql('20261020020000_dev_synthetic_provider_exclusion.sql'))
})
after(async () => await db?.close())

test('official profile, vacancy and employer denominators omit a classified test pair', async () => {
  const synthetic = await createDevSyntheticTestFixture(db)
  const genuine = await createRecruitmentFixture(db)
  const admin = await seedAccount(db, { role: 'admin' })
  await become(db, admin, { aal: 'aal2' })
  const report = async () => {
    const body = (await db.query('SELECT public.get_employment_intelligence($1::text[]) AS report', [metrics])).rows[0].report
    return Object.fromEntries(body.cells.map(cell => [cell.metric_id, cell.value]))
  }
  const beforeClassification = await report()
  for (const key of metrics) assert.equal(beforeClassification[key], 2, `baseline ${key}`)
  await db.exec('RESET ROLE')
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional report exclusion test','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, synthetic.user.id, synthetic.profile.participant_id])
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, synthetic.company])
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, synthetic.company, synthetic.vacancy])
  await become(db, admin, { aal: 'aal2' })
  const afterClassification = await report()
  for (const key of metrics) assert.equal(afterClassification[key], 1, `classified ${key}`)
  const authorized = async (type, id) => (await db.query('SELECT app.intelligence_entity_authorized($1,$2) AS allowed', [type, id])).rows[0].allowed
  assert.equal(await authorized('jobseeker_profile', synthetic.profile.participant_id), false)
  assert.equal(await authorized('vacancy', synthetic.vacancy), false)
  assert.equal(await authorized('jobseeker_profile', genuine.profile.participant_id), true)
  assert.equal(await authorized('vacancy', genuine.vacancy), true)
})
