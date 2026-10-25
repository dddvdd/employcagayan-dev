import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { intelligenceDatabase, INTELLIGENCE_MIGRATION } from '../support/intelligence-database.js'
import { createRecruitmentFixture } from '../support/recruitment-fixture.js'
import { become, seedAccount } from '../support/identity-database.js'
import { reviewVacancyRequirements } from '../../src/domain/vacancyRequirementReadiness.js'
import { evaluateEligibility } from '../../src/domain/eligibility.js'

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
  await db.exec(await sql('20261021071025_vacancy_requirement_enforcement.sql'))
})
after(async () => await db?.close())

const rpc = async (name, ...args) =>
  (await db.query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args)).rows[0].result
async function draft(f, qualifications = null) {
  await db.exec('RESET ROLE')
  return (await db.query(`INSERT INTO public.vacancy_definitions
    (employer_id,company_name,position,job_description,place_of_assignment,is_active,qualifications)
    VALUES($1,'Fixture employer',$3,
      'Synthetic description of a fictional position with enough detail.','Tuguegarao City',true,$2)
    RETURNING id`, [f.company, qualifications, 'Synthetic review ' + randomUUID()])).rows[0].id
}

test('SQL and local detector agree on clear, optional, negated and compound wording', async () => {
  await db.exec('RESET ROLE')
  const id = '00000000-0000-0000-0000-000000000001'
  for (const [text, expected] of [
    ['Must have welding.', true],
    ['MMAW NC II required.', true],
    ['Welding required, driving preferred.', true],
    ['Welding preferred.', false],
    ['No welding experience required.', false],
    ['MMAW NC II not required.', false],
  ]) {
    const sqlWarning = (await db.query(
      'SELECT app.has_unresolved_vacancy_requirements($1,$2,NULL,NULL) AS warning', [id, text]
    )).rows[0].warning
    assert.equal(sqlWarning, expected, text)
    assert.equal(reviewVacancyRequirements({ qualifications: text }).length > 0, expected, text)
  }
  assert.equal((await db.query(
    "SELECT has_function_privilege('authenticated','app.has_unresolved_vacancy_requirements(uuid,text,text,text)','EXECUTE') AS allowed"
  )).rows[0].allowed, false)
})

test('direct RPC cannot publish unresolved welding; exact required skill resolves it', async () => {
  const f = await createRecruitmentFixture(db)
  const id = await draft(f, 'Welding required.')
  await become(db, f.owner, { aal: 'aal2' })
  await assert.rejects(() => rpc('publish_vacancy', id), { code: '23514' })
  const unresolved = await rpc('get_vacancy_match_profile', id, null)
  assert.equal(unresolved.job_description, 'Synthetic description of a fictional position with enough detail.')
  assert.equal(evaluateEligibility({}, unresolved).status, 'conditionally_eligible')
  assert.equal((await db.query('SELECT platform_status FROM public.vacancy_definitions WHERE id=$1', [id])).rows[0].platform_status, 'draft')
  await db.exec('RESET ROLE')
  const skill = (await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Welding','welding') RETURNING id")).rows[0].id
  await db.query("INSERT INTO public.vacancy_skills(vacancy_definition_id,skill_id,importance) VALUES($1,$2,'required')", [id, skill])
  await become(db, f.owner, { aal: 'aal2' })
  assert.equal((await rpc('publish_vacancy', id)).status, 'published')
  await db.exec('RESET ROLE')
  await assert.rejects(() => db.query('DELETE FROM public.vacancy_skills WHERE vacancy_definition_id=$1', [id]), { code: '23514' })
  await assert.rejects(() => db.query("UPDATE public.vacancy_skills SET importance='preferred' WHERE vacancy_definition_id=$1", [id]), { code: '23514' })
  await become(db, f.owner, { aal: 'aal2' })
  const matched = await rpc('get_vacancy_match_profile', id, null)
  assert.equal(matched.qualifications, 'Welding required.')
  assert.ok(Object.hasOwn(matched, 'job_description'))
  assert.ok(Object.hasOwn(matched, 'requirements_summary'))
  assert.equal(reviewVacancyRequirements(matched).length, 0)
  await db.exec('RESET ROLE')
  await db.query("UPDATE public.vacancy_definitions SET job_description='Synthetic revised job description with enough detail for publication.' WHERE id=$1", [id])
  await become(db, f.owner, { aal: 'aal2' })
  assert.notEqual((await rpc('get_vacancy_match_profile', id, null)).match_source_hash, matched.match_source_hash)
})

test('mandatory certificate requires a matching required certificate, not a skill', async () => {
  const f = await createRecruitmentFixture(db)
  const id = await draft(f, 'MMAW NC II required.')
  await become(db, f.owner, { aal: 'aal2' })
  await assert.rejects(() => rpc('publish_vacancy', id), { code: '23514' })
  await db.exec('RESET ROLE')
  const cert = (await db.query("INSERT INTO public.certifications(canonical_name,normalized_name) VALUES('MMAW NC II','mmaw nc ii') RETURNING id")).rows[0].id
  await db.query("INSERT INTO public.vacancy_certification_requirements(vacancy_definition_id,certification_id,importance) VALUES($1,$2,'required')", [id, cert])
  await become(db, f.owner, { aal: 'aal2' })
  assert.equal((await rpc('publish_vacancy', id)).status, 'published')
  await db.exec('RESET ROLE')
  await assert.rejects(() => db.query('DELETE FROM public.vacancy_certification_requirements WHERE vacancy_definition_id=$1', [id]), { code: '23514' })
})

test('preferred and negated requirements publish; later mandatory edits are rejected', async () => {
  const f = await createRecruitmentFixture(db)
  for (const qualifications of ['Welding preferred.', 'No welding experience required.', '']) {
    const id = await draft(f, qualifications)
    await become(db, f.owner, { aal: 'aal2' })
    assert.equal((await rpc('publish_vacancy', id)).status, 'published')
  }
  const id = await draft(f)
  await become(db, f.owner, { aal: 'aal2' })
  assert.equal((await rpc('publish_vacancy', id)).status, 'published')
  await assert.rejects(() => db.query("UPDATE public.vacancy_definitions SET job_description='Synthetic description with enough detail. Must have welding.' WHERE id=$1", [id]), { code: '23514' })
  const edit = await draft(f)
  await become(db, f.owner, { aal: 'aal2' })
  await db.query("UPDATE public.vacancy_definitions SET qualifications='Must hold SMAW NC II.' WHERE id=$1", [edit])
  await assert.rejects(() => rpc('publish_vacancy', edit), { code: '23514' })
})

test('ownership, session checks and matching visibility remain in force', async () => {
  const f = await createRecruitmentFixture(db)
  const id = await draft(f)
  const other = await seedAccount(db, { role: 'employer', factor: true })
  await become(db, other, { aal: 'aal2' })
  await assert.rejects(() => rpc('publish_vacancy', id), { code: '42501' })
  await assert.rejects(() => rpc('get_vacancy_match_profile', id, null), { code: '42501' })
  await become(db, f.owner, { aal: 'aal1' })
  await assert.rejects(() => rpc('publish_vacancy', id), { code: '42501' })
  await become(db, f.owner, { aal: 'aal2' })
  assert.equal((await rpc('publish_vacancy', id)).status, 'published')
  const admin = await seedAccount(db, { role: 'admin', factor: true })
  await become(db, admin, { aal: 'aal2' })
  const blocked = await draft(f, 'Welding required.')
  await become(db, admin, { aal: 'aal2' })
  await assert.rejects(() => db.query("UPDATE public.vacancy_definitions SET platform_status='published' WHERE id=$1", [blocked]), { code: '23514' })
  const result = await rpc('get_vacancy_match_profile', id, null)
  assert.equal(result.job_description, 'Synthetic description of a fictional position with enough detail.')
  assert.equal(result.requirements_summary, null)
  assert.equal(evaluateEligibility({}, result).status, 'eligible')
})
