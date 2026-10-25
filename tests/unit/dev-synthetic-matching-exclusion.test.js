import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { intelligenceDatabase, INTELLIGENCE_MIGRATION } from '../support/intelligence-database.js'
import { createRecruitmentFixture } from '../support/recruitment-fixture.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'
import { become, seedAccount } from '../support/identity-database.js'

let db
const root = new URL('../../supabase/migrations/', import.meta.url)
const sql = async name => readFile(new URL(name, root), 'utf8')
before(async () => {
  db = await intelligenceDatabase({ migration: INTELLIGENCE_MIGRATION })
  const files = await readdir(root)
  await db.exec(await sql('20261013063051_authorized_semantic_pair_similarity.sql'))
  await db.exec(await sql(files.find(file => file.endsWith('_authorized_match_keyword_signals.sql'))))
  await db.exec("CREATE FUNCTION public.get_approved_skill_relationships(uuid[]) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$")
  await db.exec(await sql(files.find(file => file.endsWith('_source_bound_matching_signals.sql'))))
  await db.exec(await sql('20261020010000_dev_synthetic_test_registry.sql'))
  await db.exec(await sql('20261020030000_dev_synthetic_matching_exclusion.sql'))
})
after(async () => await db?.close())

test('privileged matching excludes fictional profiles and vacancies before ranking', async () => {
  const synthetic = await createDevSyntheticTestFixture(db)
  const genuine = await createRecruitmentFixture(db)
  const admin = await seedAccount(db, { role: 'admin' })
  await db.exec('RESET ROLE')
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional matching exclusion test','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, synthetic.user.id, synthetic.profile.participant_id])
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, synthetic.company])
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, synthetic.company, synthetic.vacancy])

  await become(db, synthetic.user)
  const matched = async (name, ...args) => (await db.query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args)).rows[0].result
  await assert.rejects(() => matched('get_jobseeker_match_profile', synthetic.profile.participant_id), { code: '42501' })
  await assert.rejects(() => matched('get_vacancy_match_profile', synthetic.vacancy, null), { code: '42501' })
  const receipt = (await db.query('SELECT public.submit_application($1) AS receipt', [synthetic.vacancy])).rows[0].receipt
  assert.equal(receipt.status, 'created')

  await become(db, admin, { aal: 'aal2' })
  await assert.rejects(() => matched('get_jobseeker_match_profile', synthetic.profile.participant_id), { code: '42501' })
  const keyword = async (participantId, vacancyId) => db.query(
    'SELECT public.get_match_keyword_signals($1::jsonb) AS result',
    [JSON.stringify([{ jobseeker_profile_id: participantId, vacancy_id: vacancyId }])])
  const bound = async (participantId, vacancyId) => db.query(
    'SELECT public.get_bound_match_signals($1::jsonb) AS result',
    [JSON.stringify([{ jobseeker_profile_id: participantId, vacancy_id: vacancyId,
      jobseeker_source_hash: '0'.repeat(64), vacancy_source_hash: '0'.repeat(64),
      jobseeker_embedding_version: 'jobseeker-semantic-v2',
      vacancy_embedding_version: 'vacancy-semantic-v2' }])])
  for (const [participantId, vacancyId] of [
    [synthetic.profile.participant_id, genuine.vacancy],
    [genuine.profile.participant_id, synthetic.vacancy],
  ]) {
    await assert.rejects(() => keyword(participantId, vacancyId), { code: '42501' })
    await assert.rejects(() => bound(participantId, vacancyId), { code: '42501' })
    await assert.rejects(() => db.query(
      'SELECT public.get_pair_semantic_similarity($1,$2) AS result', [participantId, vacancyId]),
    { code: '42501' })
  }
  assert.equal((await keyword(genuine.profile.participant_id, genuine.vacancy)).rows[0].result.length, 1)
  assert.equal((await matched('get_jobseeker_match_profile', genuine.profile.participant_id)).participant_id, genuine.profile.participant_id)
  const vacancies = await matched('get_vacancies_match_profiles', null, null)
  assert.equal(vacancies.some(vacancy => vacancy.id === synthetic.vacancy), false)
  assert.equal(vacancies.some(vacancy => vacancy.id === genuine.vacancy), true)
  assert.deepEqual(await matched('get_vacancy_candidate_match_profiles', synthetic.vacancy, null), [])
})
