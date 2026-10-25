import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { recruitmentDatabase, RECRUITMENT_MIGRATION } from '../support/recruitment-database.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'
import { createRecruitmentFixture } from '../support/recruitment-fixture.js'
import { become } from '../support/identity-database.js'

let db
const sql = name => readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')
before(async () => {
  db = await recruitmentDatabase({ migration: RECRUITMENT_MIGRATION })
  await db.exec(`CREATE TABLE public.interview_logs(id uuid DEFAULT gen_random_uuid(),application_id uuid,employer_id uuid,vacancy_definition_id uuid);
    CREATE TABLE public.employment_outcomes(id uuid DEFAULT gen_random_uuid(),application_id uuid,employer_id uuid)`)
  await db.exec(await sql('20261020010000_dev_synthetic_test_registry.sql'))
  await db.exec(await sql('20261020050000_dev_synthetic_case_branch_exclusion.sql'))
  await db.exec(await sql('20261020110000_dev_synthetic_case_attribution_exclusion.sql'))
})
after(async () => await db?.close())

test('a fictional application cannot create interview or outcome records', async () => {
  const synthetic = await createDevSyntheticTestFixture(db)
  const genuine = await createRecruitmentFixture(db)
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional case branch exclusion','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, synthetic.user.id, synthetic.profile.participant_id])
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, synthetic.company])
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, synthetic.company, synthetic.vacancy])
  await become(db, synthetic.user)
  const testApplication = (await db.query('SELECT public.submit_application($1) AS receipt', [synthetic.vacancy])).rows[0].receipt.application_id
  await become(db, genuine.user)
  const genuineApplication = (await db.query('SELECT public.submit_application($1) AS receipt', [genuine.vacancy])).rows[0].receipt.application_id
  await db.exec('RESET ROLE')
  for (const table of ['interview_logs', 'employment_outcomes']) {
    await assert.rejects(() => db.query(`INSERT INTO public.${table}(application_id) VALUES($1)`, [testApplication]), { code: '42501' })
    const row = (await db.query(`INSERT INTO public.${table}(application_id,employer_id) VALUES($1,$2) RETURNING id`,
      [genuineApplication, genuine.company])).rows[0]
    await assert.rejects(() => db.query(`INSERT INTO public.${table}(application_id,employer_id) VALUES($1,$2)`,
      [genuineApplication, synthetic.company]), { code: '42501' })
    await assert.rejects(() => db.query(`UPDATE public.${table} SET employer_id=$1 WHERE id=$2`,
      [synthetic.company, row.id]), { code: '42501' })
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n, 1)
  }
  await assert.rejects(() => db.query('INSERT INTO public.interview_logs(application_id,vacancy_definition_id) VALUES($1,$2)',
    [genuineApplication, synthetic.vacancy]), { code: '42501' })
  const interview = (await db.query('SELECT id FROM public.interview_logs LIMIT 1')).rows[0]
  await assert.rejects(() => db.query('UPDATE public.interview_logs SET vacancy_definition_id=$1 WHERE id=$2',
    [synthetic.vacancy, interview.id]), { code: '42501' })
})
