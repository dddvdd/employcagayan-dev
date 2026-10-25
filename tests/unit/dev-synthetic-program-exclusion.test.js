import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { recruitmentDatabase, RECRUITMENT_MIGRATION } from '../support/recruitment-database.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'

let db
const sql = name => readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')
before(async () => {
  db = await recruitmentDatabase({ migration: RECRUITMENT_MIGRATION })
  // Only columns used by the guard are needed in this isolated fixture.
  await db.exec(`CREATE TABLE public.program_participations(id uuid DEFAULT gen_random_uuid(),participant_id uuid);
    CREATE TABLE public.program_service_deliveries(id uuid DEFAULT gen_random_uuid(),participant_id uuid);
    ALTER TABLE public.program_participations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.program_service_deliveries ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.program_participations,public.program_service_deliveries TO authenticated;
    CREATE POLICY fixture_program_read ON public.program_participations FOR SELECT TO authenticated USING(true);
    CREATE POLICY fixture_delivery_read ON public.program_service_deliveries FOR SELECT TO authenticated USING(true)`)
  await db.exec(await sql('20261020010000_dev_synthetic_test_registry.sql'))
  await db.exec(await sql('20261020040000_dev_synthetic_program_exclusion.sql'))
})
after(async () => await db?.close())

test('classification rejects program history and classified actors cannot enter programs', async () => {
  const synthetic = await createDevSyntheticTestFixture(db)
  const priorCase = await createDevSyntheticTestFixture(db)
  await db.query('INSERT INTO public.program_participations(participant_id) VALUES($1)', [priorCase.profile.participant_id])
  const caseId = (await db.query(`INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at,status)
    VALUES('Fictional program exclusion test','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days','active') RETURNING id`)).rows[0].id
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, priorCase.user.id, priorCase.profile.participant_id]), { code: '23514' })
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, synthetic.user.id, synthetic.profile.participant_id])
  await assert.rejects(() => db.query('INSERT INTO public.program_participations(participant_id) VALUES($1)', [synthetic.profile.participant_id]), { code: '42501' })
  await assert.rejects(() => db.query('INSERT INTO public.program_service_deliveries(participant_id) VALUES($1)', [synthetic.profile.participant_id]), { code: '42501' })
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.program_participations')).rows[0].n, 1)
})
