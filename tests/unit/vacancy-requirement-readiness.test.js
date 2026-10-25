import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewVacancyRequirements } from '../../src/domain/vacancyRequirementReadiness.js'
import { evaluateEligibility } from '../../src/domain/eligibility.js'
import { scoreMatch } from '../../src/domain/matching.js'
import { buildMatchExplanation } from '../../src/domain/matchExplanation.js'

const date = { currentDate: '2026-10-21T00:00:00Z' }
const welding = { skill_id: 'skill-welding', canonical_name: 'Welding', importance: 'required' }
const nc2 = { certification_id: 'cert-mmaw', canonical_name: 'MMAW NC II', importance: 'required' }
const warning = (vacancy) => reviewVacancyRequirements(vacancy)

test('mandatory welding text stays unresolved without the exact required structured skill', () => {
  const vacancy = { qualifications: 'Welding required.' }
  assert.equal(warning(vacancy).length, 1)
  const eligibility = evaluateEligibility({}, vacancy, date)
  assert.equal(eligibility.status, 'conditionally_eligible')
  assert.equal(eligibility.unknown_checks.at(-1).code, 'VACANCY_TEXT_REQUIREMENT_UNRESOLVED')
  const score = scoreMatch({}, vacancy, eligibility, date)
  const skills = score.dimensions.find(d => d.dimension === 'skills')
  assert.equal(skills.evaluable, false)
  assert.equal(skills.weighted_score, 0)
  const explanation = buildMatchExplanation({
    direction: 'jobseeker_to_vacancy', jobseeker: {}, vacancy, eligibility, deterministic: score,
  })
  assert.equal(explanation.recommendation_status, 'needs_review')
  assert.match(explanation.gaps.find(g => g.code === 'VACANCY_TEXT_REQUIREMENT_UNRESOLVED').message, /Welding required/)
})

test('an exact required skill reconciles the text; a preferred or unrelated skill does not', () => {
  const text = { qualifications: 'Welding required.' }
  assert.equal(warning({ ...text, skills: [welding] }).length, 0)
  assert.equal(warning({ ...text, skills: [{ ...welding, importance: 'preferred' }] }).length, 1)
  assert.equal(warning({ ...text, skills: [{ ...welding, canonical_name: 'Driving' }] }).length, 1)
  assert.equal(evaluateEligibility({ skills: [{ skill_id: 'skill-welding', verification_status: 'verified' }] },
    { ...text, skills: [welding] }, date).status, 'eligible')
})

test('mandatory NC II text needs a required certification row, never a skill row', () => {
  const vacancy = { qualifications: 'MMAW NC II required.' }
  assert.equal(warning(vacancy)[0].kind, 'certificate')
  assert.equal(warning({ ...vacancy, skills: [welding] }).length, 1)
  assert.equal(warning({ ...vacancy, certification_requirements: [nc2] }).length, 0)
  const score = scoreMatch({}, vacancy, evaluateEligibility({}, vacancy, date), date)
  assert.equal(score.dimensions.find(d => d.dimension === 'certifications').weighted_score, 0)
  assert.equal(score.dimensions.find(d => d.dimension === 'skills').weighted_score, 0)
  assert.equal(warning({ qualifications: 'Must hold SMAW NC II.' })[0].kind, 'certificate')
})

test('preferred, negated and empty requirements do not trigger review', () => {
  for (const qualifications of ['Welding preferred.', 'No welding experience required.', 'MMAW NC II not required.', '']) {
    assert.equal(warning({ qualifications }).length, 0, qualifications)
  }
})

test('edits and contradictions are checked from current text, with no stale approval state', () => {
  const original = { qualifications: 'Welding preferred.', skills: [welding] }
  assert.equal(warning(original).length, 0)
  assert.equal(warning({ ...original, qualifications: 'MMAW NC II required.' }).length, 1)
  assert.equal(warning({ qualifications: 'Welding required. Welding not required.' }).length, 1)
  assert.equal(warning({ qualifications: 'Welding and driving required.', skills: [welding] }).length, 1)
  assert.equal(warning({ qualifications: 'Welding required, driving preferred.' }).length, 1)
  assert.equal(warning({ qualifications: 'Welding preferred, NC II required.' }).length, 1)
  assert.equal(warning({ qualifications: 'Must have 2 years welding experience.', skills: [welding] }).length, 1)
  assert.equal(warning({ qualifications: 'Bachelor degree in Welding required.', skills: [welding] })[0].kind, 'education_or_qualification')
})

test('matching payloads fail safely when text fields are absent or malformed', () => {
  const absent = { match_source_version: 'matching-source-v1', qualifications: null }
  assert.equal(warning(absent).length, 2)
  assert.equal(evaluateEligibility({}, absent, date).status, 'conditionally_eligible')
  assert.equal(scoreMatch({}, absent, null, date).dimensions.find(d => d.dimension === 'skills').weighted_score, 0)
  assert.equal(warning({ ...absent, job_description: [], requirements_summary: null }).length, 1)
})
