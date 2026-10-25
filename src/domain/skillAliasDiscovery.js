// Search terms only discover existing canonical IDs. They never establish evidence.
export const SKILL_ALIAS_DISCOVERY_VERSION = 'reviewed-skill-alias-v1'

export function normalizeSkillTerm(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)?.join(' ') || ''
}

function overlap(query, candidate) {
  const q = new Set(query.split(' ')), c = new Set(candidate.split(' '))
  const common = [...q].filter(token => c.has(token)).length
  return common ? {
    jaccard: common / new Set([...q, ...c]).size,
    queryCoverage: common / q.size,
  } : { jaccard: 0, queryCoverage: 0 }
}

function provenance(row) {
  return {
    alias_text: row.alias_text,
    alias_type: row.alias_type,
    source_code: row.source_code,
    source_version: row.source_version,
    external_concept_uri: row.external_concept_uri,
    alias_id: row.alias_id,
  }
}

export function resolveSkillCandidates(query, canonicalRows = [], aliasRows = []) {
  const term = normalizeSkillTerm(query)
  if (term.length < 2) return []
  const exactCanonical = canonicalRows.filter(row => normalizeSkillTerm(row.canonical_name) === term)
  if (exactCanonical.length) return exactCanonical.map(row => ({
    ...row, discovery_kind: 'canonical_exact', selectable: true,
  }))

  const reviewed = aliasRows.filter(row =>
    row.review_status === 'approved' && row.skill_id && row.canonical_name &&
    row.source_version && (row.alias_id || row.evidence_reference) &&
    (!row.alias_type?.startsWith('esco_') ||
      row.source_version === '1.2.1' && /^http:\/\/data\.europa\.eu\/esco\/skill\/[0-9a-f-]{36}$/i.test(row.external_concept_uri || '')))
  const exactAliases = reviewed.filter(row =>
    normalizeSkillTerm(row.alias_normalized_name || row.alias_text) === term)
  if (exactAliases.length) {
    const distinct = new Map(exactAliases.map(row => [row.skill_id, row]))
    const ambiguous = distinct.size > 1
    return [...distinct.values()].map(row => ({
      id: row.skill_id, canonical_name: row.canonical_name, skill_type: row.skill_type,
      discovery_kind: ambiguous ? 'ambiguous_alias' : 'approved_alias',
      selectable: !ambiguous, provenance: provenance(row),
    })).sort((a, b) => a.canonical_name.localeCompare(b.canonical_name) || a.id.localeCompare(b.id))
  }

  const canonicalSuggestions = canonicalRows.map(row => ({
    ...row, discovery_kind: 'canonical_suggestion', selectable: false, expandable: true,
  }))
  const fuzzy = reviewed.flatMap(row => {
    const candidate = normalizeSkillTerm(row.alias_normalized_name || row.alias_text)
    const scores = overlap(term, candidate)
    if (scores.jaccard < 0.5 && scores.queryCoverage < 0.5) return []
    return [{
      id: row.skill_id, canonical_name: row.canonical_name, skill_type: row.skill_type,
      discovery_kind: 'fuzzy_suggestion', selectable: false,
      suggestion_status: 'unapproved', provenance: provenance(row),
      ...scores,
    }]
  }).sort((a, b) => Math.max(b.jaccard, b.queryCoverage) - Math.max(a.jaccard, a.queryCoverage)
    || a.canonical_name.localeCompare(b.canonical_name) || a.id.localeCompare(b.id))
  const seen = new Set(canonicalSuggestions.map(row => row.id))
  return [...canonicalSuggestions, ...fuzzy.filter(row => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })].slice(0, 50)
}
