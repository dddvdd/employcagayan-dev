// Conservative text check. A warning is a request for human review, never a new qualification.
const mandatory = /\b(?:must\s+(?:have|hold|possess|be\s+(?:skilled\s+in|certified|licensed|proficient\s+in|trained\s+in))|required?|requires?|mandatory|need(?:s|ed)?|minimum\s+qualification)\b/i
const optional = /\b(?:preferred|optional|nice\s+to\s+have|an?\s+advantage|desirable)\b/i
const negated = /\b(?:not\s+required|no\s+.{0,70}?\s+required|not\s+mandatory|without\s+.{0,50}?\s+requirement)\b/i
const certificate = /\b(?:NC\s*[IVX]+|national\s+certificate|certificat(?:e|ion)|licen[sc]e)\b/i
const education = /\b(?:bachelor(?:'s)?|degree|diploma|college\s+graduate|education\s+level)\b/i
const genericOnly = /^(?:must\s+have|requires?|required|need(?:s|ed)?|mandatory|minimum\s+qualification)[\s:,-]*(?:experience|qualification|skills?|applicants?|candidates?)?\s*$/i
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function coveredByStructure(source, kind, vacancy) {
  if (kind === 'education_or_qualification' || /\b\d+\s*(?:years?|months?|yrs?)\b/i.test(source)) return false
  const rows = kind === 'certificate' ? vacancy.certification_requirements : vacancy.skills
  if (!Array.isArray(rows)) return false
  const text = normalize(source)
  return rows.some((row) => {
    const name = normalize(row.canonical_name || row.skills?.canonical_name || row.certifications?.canonical_name)
    // A conjunction can express more than one requirement. Do not clear the whole clause from one row.
    return row.importance === 'required' && name.length >= 3 && !/\b(and|or|plus)\b/.test(text) &&
      ` ${text} `.includes(` ${name} `)
  })
}

export function reviewVacancyRequirements(vacancy = {}) {
  const warnings = []
  for (const field of ['qualifications', 'job_description', 'requirements_summary']) {
    if (vacancy.match_source_version &&
      (!Object.hasOwn(vacancy, field) || (vacancy[field] !== null && typeof vacancy[field] !== 'string'))) {
      warnings.push({ field, source: 'Vacancy requirement text unavailable', kind: 'skill_or_qualification' })
      continue
    }
    for (const part of String(vacancy[field] || '').split(/[\n.;]+|,(?=\s*[a-z])|\b(?:but|however)\b/i)) {
      const source = part.trim()
      if (!source || !mandatory.test(source) || genericOnly.test(source)) continue
      if (negated.test(source) && !/\b(?:but|however)\b/i.test(source)) continue
      if (optional.test(source) && !/\b(?:and|or)\b/i.test(source)) continue
      const kind = certificate.test(source) ? 'certificate' : education.test(source) ? 'education_or_qualification' : 'skill_or_qualification'
      if (coveredByStructure(source, kind, vacancy)) continue
      warnings.push({ field, source: source.slice(0, 240), kind })
    }
  }
  return warnings
}
