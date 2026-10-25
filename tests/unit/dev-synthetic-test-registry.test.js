import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { recruitmentDatabase, RECRUITMENT_MIGRATION } from '../support/recruitment-database.js'
import { createRecruitmentFixture } from '../support/recruitment-fixture.js'
import { createDevSyntheticTestFixture } from '../support/dev-synthetic-test-fixture.js'
import { become, seedAccount } from '../support/identity-database.js'

let db
before(async () => {
  db = await recruitmentDatabase({ migration: RECRUITMENT_MIGRATION })
  await db.exec('CREATE TABLE public.employer_event_participations(id uuid DEFAULT gen_random_uuid(),event_id uuid,employer_id uuid,status text)')
  await db.exec(await readFile(new URL('../../supabase/migrations/20261020010000_dev_synthetic_test_registry.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261020070000_dev_synthetic_fixture_identity_guard.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261020090000_dev_synthetic_resume_exclusion.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261020100000_dev_synthetic_employer_event_exclusion.sql', import.meta.url), 'utf8'))
})
after(async () => await db?.close())

test('only the approved, unexpired paired fictional actors receive test scope', async () => {
  const paired = await createDevSyntheticTestFixture(db)
  const other = await createDevSyntheticTestFixture(db)
  const eventBound = await createDevSyntheticTestFixture(db)
  const genuine = await createRecruitmentFixture(db)
  const makeCase = async () => (await db.query(`
    INSERT INTO app.dev_synthetic_cases(purpose,approval_reference,approved_at,expires_at)
    VALUES('Fictional owner workflow test','codex-chat-2026-10-20-guarded-dev-test',now(),now()+interval '7 days')
    RETURNING id
  `)).rows[0].id
  const caseId = await makeCase()
  const otherCase = await makeCase()
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, paired.user.id, other.profile.participant_id]), { code: '23514' })
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, genuine.user.id, genuine.profile.participant_id]), { code: '23514' })
  await db.query('INSERT INTO app.dev_synthetic_actors(case_id,auth_user_id,participant_id) VALUES($1,$2,$3)', [caseId, paired.user.id, paired.profile.participant_id])
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, genuine.company]), { code: '23514' })
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [caseId, paired.company])
  await db.query("INSERT INTO public.employer_event_participations(event_id,employer_id,status) VALUES($1,$2,'registered')",
    [genuine.event, eventBound.company])
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)',
    [otherCase, eventBound.company]), { code: '23514', message: /event attendance/ })
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, paired.company, other.vacancy]), { code: '23514' })
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, paired.company, paired.vacancy])
  await assert.rejects(() => db.query("INSERT INTO public.employer_event_participations(event_id,employer_id,status) VALUES($1,$2,'registered')",
    [genuine.event, paired.company]), { code: '42501', message: /official event/ })
  await db.query("INSERT INTO public.employer_event_participations(event_id,employer_id,status) VALUES($1,$2,'registered')",
    [genuine.event, genuine.company])
  await assert.rejects(() => db.query('UPDATE public.employer_event_participations SET employer_id=$1 WHERE employer_id=$2',
    [paired.company, genuine.company]), { code: '42501', message: /official event/ })
  assert.deepEqual((await db.query('SELECT employer_id FROM public.employer_event_participations WHERE event_id=$1 AND employer_id=$2',
    [genuine.event, genuine.company])).rows.map(row => row.employer_id), [genuine.company])
  const fictionalResume = paired.user.id + '/fictional.pdf'
  const ordinaryResume = genuine.user.id + '/ordinary.pdf'
  for (const path of [fictionalResume, ordinaryResume])
    await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('resumes',$1,$2)",
      [path, { mimetype: 'application/pdf', size: 64 }])
  await assert.rejects(() => db.query('UPDATE public.employers SET registered_user_id=$1 WHERE id=$2',
    [genuine.owner.id, paired.company]), { code: '42501', message: /Classified DEV employer identity/ })
  await assert.rejects(() => db.query('UPDATE public.employers SET company_name=$1 WHERE id=$2',
    ['Real company', paired.company]), { code: '42501', message: /Classified DEV employer identity/ })
  await assert.rejects(() => db.query('UPDATE public.vacancy_definitions SET employer_id=$1 WHERE id=$2',
    [genuine.company, paired.vacancy]), { code: '42501', message: /Classified DEV vacancy ownership/ })
  await assert.rejects(() => db.query('UPDATE public.vacancy_definitions SET employer_id=$1 WHERE id=$2',
    [paired.company, other.vacancy]), { code: '42501', message: /Unclassified vacancy cannot move/ })
  await assert.rejects(() => db.query(`INSERT INTO public.vacancy_definitions(
    employer_id,company_name,position,platform_status)
    VALUES($1,'PESO DEV TEST — Fictional Employer','Extra test vacancy','draft')`,
  [paired.company]), { code: '42501', message: /Additional vacancies require/ })
  await assert.rejects(() => db.query('INSERT INTO public.event_vacancies(event_id,vacancy_definition_id) VALUES($1,$2)', [genuine.event, paired.vacancy]), { code: '42501' })
  await db.query('INSERT INTO app.dev_synthetic_employers(case_id,employer_id) VALUES($1,$2)', [otherCase, other.company])
  await db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [otherCase, other.company, other.vacancy])
  const call = async (name, ...args) => (await db.query(`SELECT app.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS allowed`, args)).rows[0].allowed

  assert.equal(await call('is_dev_synthetic_participant', paired.profile.participant_id), true)
  assert.equal(await call('is_dev_synthetic_participant', other.profile.participant_id), false)
  assert.equal(await call('is_dev_synthetic_vacancy', paired.vacancy), true)
  assert.equal(await call('dev_synthetic_pair_active', paired.profile.participant_id, paired.vacancy), false)
  await db.query("UPDATE app.dev_synthetic_cases SET status='active' WHERE id=$1", [caseId])
  assert.equal(await call('dev_synthetic_pair_active', paired.profile.participant_id, paired.vacancy), true)
  assert.equal(await call('dev_synthetic_pair_active', paired.profile.participant_id, other.vacancy), false)
  await assert.rejects(() => db.query('INSERT INTO app.dev_synthetic_vacancies(case_id,employer_id,vacancy_definition_id) VALUES($1,$2,$3)', [caseId, other.company, crypto.randomUUID()]))
  await become(db, paired.user)
  await assert.rejects(() => db.query('SELECT public.submit_application($1)', [other.vacancy]), { code: '42501' })
  await assert.rejects(() => db.query('SELECT public.register_for_event($1)', [genuine.event]), { code: '42501' })
  const application = (await db.query('SELECT public.submit_application($1) AS receipt', [paired.vacancy])).rows[0].receipt
  assert.equal(application.status, 'created')
  await become(db, genuine.owner, { aal: 'aal2' })
  await assert.rejects(() => db.query('SELECT public.list_employer_applications($1)', [paired.vacancy]), { code: '42501' })
  assert.equal((await db.query('SELECT public.list_employer_applications(NULL) AS item')).rows
    .some(row => row.item.application_id === application.application_id), false)
  await become(db, other.user)
  await assert.rejects(() => db.query('SELECT public.submit_application($1)', [paired.vacancy]), { code: '42501' })
  const admin = await seedAccount(db, { role: 'admin' })
  await become(db, admin, { aal: 'aal2' })
  for (const [table, column, syntheticId, genuineId] of [
    ['participants', 'id', paired.profile.participant_id, genuine.profile.participant_id],
    ['jobseeker_profiles', 'participant_id', paired.profile.participant_id, genuine.profile.participant_id],
    ['vacancy_definitions', 'id', paired.vacancy, genuine.vacancy],
    ['employers', 'id', paired.company, genuine.company],
  ]) {
    assert.equal((await db.query(`SELECT ${column} FROM public.${table} WHERE ${column}=$1`, [syntheticId])).rows.length, 0, `ordinary ${table} excludes synthetic row`)
    assert.equal((await db.query(`SELECT ${column} FROM public.${table} WHERE ${column}=$1`, [genuineId])).rows.length, 1, `ordinary ${table} retains genuine row`)
  }
  assert.deepEqual((await db.query('SELECT id FROM public.applications WHERE id=$1', [application.application_id])).rows, [])
  assert.deepEqual((await db.query("SELECT name FROM storage.objects WHERE bucket_id='resumes' ORDER BY name")).rows
    .map(row => row.name), [ordinaryResume])
  const ordinaryJobs = (await db.query('SELECT public.list_platform_vacancies(NULL) AS job')).rows.map(row => row.job.id)
  assert.equal(ordinaryJobs.includes(paired.vacancy), false)
  assert.equal(ordinaryJobs.includes(genuine.vacancy), true)
  await become(db, paired.user)
  assert.equal((await db.query('SELECT participant_id FROM public.jobseeker_profiles WHERE participant_id=$1', [paired.profile.participant_id])).rows.length, 1)
  assert.equal((await db.query('SELECT id FROM public.applications WHERE id=$1', [application.application_id])).rows.length, 1)
  assert.deepEqual((await db.query("SELECT name FROM storage.objects WHERE bucket_id='resumes' ORDER BY name")).rows
    .map(row => row.name), [fictionalResume])
  assert.equal((await db.query('SELECT public.list_platform_vacancies(NULL) AS job')).rows.some(row => row.job.id === paired.vacancy), true)
  await db.exec("RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','{}',false)")
  assert.equal((await db.query('SELECT public.list_platform_vacancies(NULL) AS job')).rows.some(row => row.job.id === paired.vacancy), false)
  await db.exec('RESET ROLE')
  await db.query("UPDATE app.dev_synthetic_cases SET status='retired' WHERE id=$1", [caseId])
  assert.equal(await call('dev_synthetic_pair_active', paired.profile.participant_id, paired.vacancy), false)
  assert.equal(await call('is_dev_synthetic_participant', paired.profile.participant_id), true)

  await become(db, paired.user)
  await db.query('SELECT public.withdraw_application($1)', [application.application_id])
  assert.equal((await db.query('SELECT application_status FROM public.applications WHERE id=$1', [application.application_id])).rows[0].application_status, 'withdrawn')
  const history = (await db.query('SELECT public.list_my_applications() AS item')).rows.map(row => row.item)
  assert.equal(history.some(item => item.application_id === application.application_id && item.application_status === 'withdrawn'), true)
  await assert.rejects(() => db.query('SELECT * FROM app.dev_synthetic_cases'), { code: '42501' })
  await assert.rejects(() => db.query("UPDATE app.dev_synthetic_cases SET status='active' WHERE id=$1", [caseId]), { code: '42501' })
  await assert.rejects(() => call('dev_synthetic_pair_active', paired.profile.participant_id, paired.vacancy), { code: '42501' })
  await db.exec('RESET ROLE')
  const audit = (await db.query('SELECT entity_kind,action FROM app.dev_synthetic_audit WHERE case_id=$1 ORDER BY id', [caseId])).rows
  assert.equal(audit.filter(row => row.entity_kind === 'dev_synthetic_cases' && row.action === 'update').length, 2)
  assert.equal(audit.some(row => row.entity_kind === 'dev_synthetic_actors' && row.action === 'insert'), true)
  assert.equal(audit.some(row => row.entity_kind === 'dev_synthetic_vacancies' && row.action === 'insert'), true)
  await assert.rejects(() => db.query('DELETE FROM app.dev_synthetic_cases WHERE id=$1', [caseId]), { code: '42501' })
  await assert.rejects(() => db.query('UPDATE app.dev_synthetic_actors SET participant_id=$1 WHERE auth_user_id=$2', [other.profile.participant_id, paired.user.id]), { code: '42501' })
})
