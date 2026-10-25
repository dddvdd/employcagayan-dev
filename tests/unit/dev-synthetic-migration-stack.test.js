import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { lifecycleDatabase } from '../support/extraction-lifecycle-database.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'
import { payload } from '../support/recruitment-fixture.js'
import { become, seedAccount } from '../support/identity-database.js'

let db
const root = new URL('../../supabase/migrations/', import.meta.url)
const sql = name => readFile(new URL(name, root), 'utf8')
before(async () => {
  db = await lifecycleDatabase()
  await db.exec('CREATE TABLE public.employer_event_participations(id uuid DEFAULT gen_random_uuid(),event_id uuid,employer_id uuid,status text)')
  const files = await readdir(root)
  for (const table of ['program_participations', 'program_service_deliveries', 'interview_logs', 'employment_outcomes']) {
    if (!(await db.query('SELECT to_regclass($1) AS present', ['public.' + table])).rows[0].present)
      await db.exec(`CREATE TABLE public.${table}(id uuid DEFAULT gen_random_uuid(),participant_id uuid,application_id uuid${table === 'interview_logs' ? ',employer_id uuid,vacancy_definition_id uuid' : table === 'employment_outcomes' ? ',employer_id uuid' : ''})`)
  }
  for (const table of ['program_participations', 'program_service_deliveries']) await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
  await db.exec(await sql('20261013063051_authorized_semantic_pair_similarity.sql'))
  await db.exec(await sql(files.find(file => file.endsWith('_authorized_match_keyword_signals.sql'))))
  await db.exec("CREATE OR REPLACE FUNCTION public.get_approved_skill_relationships(uuid[]) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$")
  await db.exec(await sql(files.find(file => file.endsWith('_source_bound_matching_signals.sql'))))
  for (const name of [
    '20261020010000_dev_synthetic_test_registry.sql',
    '20261020020000_dev_synthetic_provider_exclusion.sql',
    '20261020030000_dev_synthetic_matching_exclusion.sql',
    '20261020040000_dev_synthetic_program_exclusion.sql',
    '20261020050000_dev_synthetic_case_branch_exclusion.sql',
    '20261020060000_dev_synthetic_processing_preconditions.sql',
    '20261020070000_dev_synthetic_fixture_identity_guard.sql',
    '20261020080000_dev_synthetic_profile_detail_exclusion.sql',
    '20261020090000_dev_synthetic_resume_exclusion.sql',
    '20261020100000_dev_synthetic_employer_event_exclusion.sql',
    '20261020110000_dev_synthetic_case_attribution_exclusion.sql',
  ]) await db.exec(await sql(name))
})
after(async () => await db?.close())

test('all eleven guards coexist and preserve a fictional owner application history', async () => {
  const fictional = await createDevSyntheticTestFixture(db)
  const ordinary = await seedAccount(db, { google: true, factor: true })
  await become(db, ordinary)
  const ordinaryProfile = (await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',
    [JSON.stringify(payload)])).rows[0]
  await db.exec('RESET ROLE')
  const admin = await seedAccount(db, { role: 'admin' })
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional full-stack smoke test','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, fictional.user.id, fictional.profile.participant_id])
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, fictional.company])
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, fictional.company, fictional.vacancy])
  const skill = (await db.query('INSERT INTO public.skills(canonical_name,normalized_name) VALUES($1,$2) RETURNING id',
    ['Fictional profile detail', 'fictional-profile-detail-' + crypto.randomUUID()])).rows[0].id
  const fictionalSkill = (await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2) RETURNING id',
    [fictional.profile.participant_id, skill])).rows[0].id
  const ordinarySkill = (await db.query('INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id) VALUES($1,$2) RETURNING id',
    [ordinaryProfile.participant_id, skill])).rows[0].id
  await become(db, admin, { aal: 'aal2' })
  assert.deepEqual((await db.query('SELECT id FROM public.jobseeker_skills WHERE id IN ($1,$2)',
    [fictionalSkill, ordinarySkill])).rows.map(row => row.id), [ordinarySkill])
  assert.deepEqual((await db.query('SELECT public.list_platform_vacancies(NULL) AS job')).rows, [])
  await assert.rejects(() => db.query("SELECT public.get_ai_extraction_source('jobseeker_profile',$1)", [fictional.profile.participant_id]), { code: '42501' })
  await assert.rejects(() => db.query('SELECT public.get_jobseeker_match_profile($1)', [fictional.profile.participant_id]), { code: '42501' })
  await become(db, fictional.user)
  assert.deepEqual((await db.query('SELECT id FROM public.jobseeker_skills WHERE id IN ($1,$2)',
    [fictionalSkill, ordinarySkill])).rows.map(row => row.id), [fictionalSkill])
  const applied = (await db.query('SELECT public.submit_application($1) AS receipt', [fictional.vacancy])).rows[0].receipt
  assert.equal(applied.status, 'created')
  await db.query('SELECT public.withdraw_application($1)', [applied.application_id])
  assert.equal((await db.query('SELECT public.list_my_applications() AS item')).rows[0].item.application_status, 'withdrawn')
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM app.dev_synthetic_audit WHERE case_id=$1', [caseId])).rows[0].n, 4)
})
