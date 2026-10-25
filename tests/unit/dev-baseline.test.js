import test from 'node:test'
import assert from 'node:assert/strict'
import { birthdateToIso, isoToBirthdate, ageFromParts } from '../../src/domain/birthdate.js'
import { validateAddressTriple } from '../../src/domain/phAddress.js'
import { evaluateEligibility, ELIGIBILITY_STATUS } from '../../src/domain/eligibility.js'
import { scoreMatch, rankMatches } from '../../src/domain/matching.js'
import { computeHybridScore, SEMANTIC_STATUS } from '../../src/domain/hybridMatching.js'

const evaluationDate = { currentDate: '2026-10-12T00:00:00Z' }

test('birthday round trip preserves the calendar date', () => {
  assert.equal(birthdateToIso('02/29/2000'), '2000-02-29')
  assert.equal(isoToBirthdate('2000-02-29'), '02/29/2000')
})

test('impossible birthday and non-leap-century date are rejected', () => {
  for (const date of ['02/30/2000', '02/29/1900', '13/01/1998', '1998-09-24']) {
    assert.equal(birthdateToIso(date), null)
  }
})

test('age changes on the birthday, including a year boundary', () => {
  assert.equal(ageFromParts(2000, 10, 12, new Date(2026, 9, 11)), 25)
  assert.equal(ageFromParts(2000, 10, 12, new Date(2026, 9, 12)), 26)
  assert.equal(ageFromParts(2000, 12, 31, new Date(2026, 0, 1)), 25)
})

test('birthday rejects tomorrow within this year and accepts the reference day', () => {
  const today = new Date(2026, 9, 12)
  assert.equal(birthdateToIso('10/13/2026',today),null)
  assert.equal(birthdateToIso('12/31/2026',today),null)
  assert.equal(birthdateToIso('10/12/2026',today),'2026-10-12')
  assert.equal(birthdateToIso('12/31/2025',new Date(2026,0,1)),'2025-12-31')
})

const addressLists = {
  provinces: [{ name: 'Cagayan', code: '0201500000' }],
  municipalities: [{ name: 'Tuguegarao City', code: '0201529000', parentCode: '0201500000' }],
  barangays: [{ name: 'Annafunan East', code: '0201529001', parentCode: '0201529000' }],
}
const address = { province: 'Cagayan', municipality_city: 'Tuguegarao City', barangay: 'Annafunan East' }

test('valid address accepts normalized names and the PSGC hierarchy', () => {
  assert.equal(validateAddressTriple({ ...address, municipality_city: ' Tuguegarao City ' }, addressLists).ok, true)
})

test('official Cagayan barangay parent is valid even when the ninth code digit differs', () => {
  const selection = { province: 'Cagayan', municipality_city: 'Abulug', barangay: 'Libertad' }
  const lists = {
    provinces: [{ name: 'Cagayan', code: '0201500000' }],
    municipalities: [{ name: 'Abulug', code: '0201501000', parentCode: '0201500000' }],
    barangays: [{ name: 'Libertad', code: '0201501010', parentCode: '0201501000' }],
  }
  assert.equal(validateAddressTriple(selection, lists).ok, true)
})

test('cross-province address and cross-city barangay are rejected', () => {
  const result = validateAddressTriple(address, {
    ...addressLists,
    municipalities: [{ name: 'Tuguegarao City', code: '0203129000', parentCode: '0203100000' }],
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.municipality_city)
  assert.ok(result.errors.barangay)
})

test('inactive vacancy is a confirmed blocker', () => {
  assert.equal(evaluateEligibility({}, { is_active: false }, evaluationDate).status, ELIGIBILITY_STATUS.INELIGIBLE)
})

test('regression: unknown education must require review instead of exclusion', () => {
  const result = evaluateEligibility({}, { education_requirements: [{ importance: 'required', rank: 80 }] }, evaluationDate)
  assert.equal(result.status, ELIGIBILITY_STATUS.CONDITIONALLY_ELIGIBLE)
  assert.equal(result.blocking_reasons.length, 0)
})

test('a documented proficiency below the mandatory threshold is a blocker', () => {
  const result = evaluateEligibility(
    { skills: [{ skill_id: 'skill-a', proficiency_level: 'beginner' }] },
    { skills: [{ skill_id: 'skill-a', canonical_name: 'Skill A', importance: 'required', minimum_proficiency: 'advanced' }] },
    evaluationDate,
  )
  assert.equal(result.status, ELIGIBILITY_STATUS.INELIGIBLE)
})

test('deterministic match exposes version, evidence and bounded scores', () => {
  const result = scoreMatch({}, {}, null, evaluationDate)
  assert.equal(result.model_version, 'deterministic-v3-canonical')
  assert.equal(result.dimensions.length, 12)
  for (const score of [result.fit_score, result.coverage_score, result.ranking_score]) {
    assert.ok(Number.isFinite(score) && score >= 0 && score <= 100)
  }
  assert.ok(result.dimensions.every(dimension => 'evidence' in dimension))
})

test('semantic matching falls back to deterministic when missing or stale', () => {
  for (const status of [SEMANTIC_STATUS.MISSING, SEMANTIC_STATUS.STALE, SEMANTIC_STATUS.FAILED]) {
    const result = computeHybridScore({ ranking_score: 68.25 }, { status, score: 100 })
    assert.equal(result.score, 68.25)
    assert.equal(result.fallback, true)
  }
})

test('ranking excludes confirmed failures and uses a stable vacancy tie breaker', () => {
  const matches = ['b', 'a'].map(id => ({ vacancy: { id }, ranking_score: 50, eligibility: { status: 'eligible' } }))
  matches.push({ vacancy: { id: 'failed' }, ranking_score: 100, eligibility: { status: 'ineligible' } })
  assert.deepEqual(rankMatches(matches).map(match => match.vacancy.id), ['a', 'b'])
})

// Missing evidence remains visible for review. These are ordinary regressions.
for (const [name, requirements] of [
  ['skills', { skills: [{ skill_id: 'skill-a', canonical_name: 'Skill A', importance: 'required' }] }],
  ['experience', { experience_requirements: [{ importance: 'required', minimum_months: 12 }] }],
  ['certifications', { certification_requirements: [{ certification_id: 'cert-a', importance: 'required' }] }],
  ['languages', { language_requirements: [{ language_id: 'lang-a', importance: 'required' }] }],
]) {
  test(`regression: missing ${name} must require review instead of exclusion`, () => {
    assert.equal(evaluateEligibility({}, requirements, evaluationDate).status, ELIGIBILITY_STATUS.CONDITIONALLY_ELIGIBLE)
  })
}
