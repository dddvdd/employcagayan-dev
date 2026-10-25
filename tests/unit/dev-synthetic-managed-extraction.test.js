import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { lifecycleDatabase } from '../support/extraction-lifecycle-database.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'
import { seedAccount, become } from '../support/identity-database.js'

let db
const sql = name => readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')
const source = async (type, id) => (await db.query('SELECT public.get_ai_extraction_source($1,$2) AS source', [type, id])).rows[0].source
const begin = async (type, id, hash) => (await db.query('SELECT public.begin_ai_extraction($1,$2,$3) AS run', [type, id, hash])).rows[0].run
before(async () => {
  db = await lifecycleDatabase()
  await db.exec(await sql('20261020010000_dev_synthetic_test_registry.sql'))
  await db.exec(await sql('20261020020000_dev_synthetic_provider_exclusion.sql'))
  await db.exec(await sql('20261020060000_dev_synthetic_processing_preconditions.sql'))
})
after(async () => await db?.close())

test('classification denies managed source and begin before work or quota allocation', async () => {
  const synthetic = await createDevSyntheticTestFixture(db)
  const admin = await seedAccount(db, { role: 'admin' })
  await db.query("UPDATE public.jobseeker_profiles SET professional_summary='Fictional office-skills test.' WHERE participant_id=$1", [synthetic.profile.participant_id])
  await become(db, admin, { aal: 'aal2', extras: { exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: 'https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1' } })
  const prepared = await source('jobseeker_profile', synthetic.profile.participant_id)
  assert.ok(prepared.source_text.includes('Fictional office-skills test.'))
  await db.exec('RESET ROLE')
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional managed extraction denial','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, synthetic.user.id, synthetic.profile.participant_id])
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, synthetic.company])
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, synthetic.company, synthetic.vacancy])
  await become(db, admin, { aal: 'aal2', extras: { exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: 'https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1' } })
  await assert.rejects(() => source('jobseeker_profile', synthetic.profile.participant_id), { code: '42501' })
  await assert.rejects(() => source('vacancy', synthetic.vacancy), { code: '42501' })
  await assert.rejects(() => begin('jobseeker_profile', synthetic.profile.participant_id, prepared.source_hash), { code: '42501' })
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_extraction_runs WHERE entity_id=$1', [synthetic.profile.participant_id])).rows[0].n, 0)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ai_extraction_rate_limit WHERE user_id=$1', [admin.id])).rows[0].n, 0)
})

test('an existing extraction run prevents later synthetic classification', async () => {
  const earlier = await createDevSyntheticTestFixture(db)
  await db.query("INSERT INTO public.ai_extraction_runs(entity_type,entity_id,extraction_type,provider,model,input_hash) VALUES('jobseeker_profile',$1,'profile','mock','synthetic',$2)", [earlier.profile.participant_id, crypto.randomUUID()])
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional processing precondition','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, earlier.user.id, earlier.profile.participant_id]), { code: '23514' })
})
