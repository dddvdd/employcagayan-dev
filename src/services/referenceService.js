import {referenceTextFilter} from '../domain/referenceSearch.js'
import {normalizeSkillTerm, resolveSkillCandidates} from '../domain/skillAliasDiscovery.js'
import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

const occupationFields = 'id, canonical_name, normalized_name, occupation_level'
const selectableOccupationLevels = 'occupation_level.is.null,occupation_level.in.(0,4)'
const selectableOccupation = row => row && (row.occupation_level == null || row.occupation_level === 0 || row.occupation_level === 4)

export async function listOccupations(search = '') {
  let q = supabase.from('occupations').select(occupationFields).eq('is_active', true).order('canonical_name')
  if (search) q = q.or(referenceTextFilter(['canonical_name','normalized_name'],search))
  return (unwrap(await q.or(selectableOccupationLevels).limit(50), 'Could not load occupations') || []).filter(selectableOccupation)
}

export async function listOccupationAliases(occupationId) {
  return unwrap(
    await supabase
      .from('occupation_aliases')
      .select('alias, normalized_alias, alias_type')
      .eq('occupation_id', occupationId).eq('is_active',true),
    'Could not load occupation aliases'
  )
}

export async function searchOccupations(search) {
  const term=typeof search==='string'?search.normalize('NFKC').trim():''
  if(term.length<2)return []
  const [direct,aliases]=await Promise.all([
    listOccupations(term),
    supabase.from('occupation_aliases').select('occupation_id, alias')
      .eq('is_active',true).ilike('normalized_alias', '%'+term.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%').limit(20)
      .then(result=>unwrap(result,'Could not search occupations')),
  ])
  const ids=[...new Set((aliases||[]).map(alias=>alias.occupation_id))]
  const related=ids.length?unwrap(await supabase.from('occupations')
    .select(occupationFields).eq('is_active',true).in('id',ids).or(selectableOccupationLevels).limit(20),'Could not load matching occupations'):[]
  return [...new Map([...(direct||[]),...(related||[])].filter(selectableOccupation).map(row=>[row.id,row])).values()]
    .sort((a,b)=>a.canonical_name.localeCompare(b.canonical_name,'en')||a.id.localeCompare(b.id))
    .slice(0,50)
}

export async function listSkills(search = '') {
  let q = supabase.from('skills').select('id, canonical_name, normalized_name, skill_type').eq('is_active', true).order('canonical_name')
  if (search) q = q.or(referenceTextFilter(['canonical_name','normalized_name'],search))
  return unwrap(await q.limit(50), 'Could not load skills')
}

// The flag is intentionally off until the migration, source receipts and human reviews exist.
export async function searchSkills(search, options = {}) {
  const enabled = options.aliasesEnabled ??
    import.meta.env?.VITE_SKILL_ALIAS_DISCOVERY_ENABLED === 'true'
  const term = normalizeSkillTerm(search)
  const canonical = await listSkills(search)
  if (!enabled) return canonical
  if (term.length < 2) return canonical
  const exact = unwrap(await supabase.from('skills')
    .select('id, canonical_name, normalized_name, skill_type')
    .eq('is_active',true).eq('normalized_name',term).limit(1),
  'Could not load exact skill')
  const canonicalRows = [...new Map([...(exact || []),...canonical].map(row=>[row.id,row])).values()]
  if (canonicalRows.some(row => normalizeSkillTerm(row.canonical_name) === term)) {
    return resolveSkillCandidates(term,canonicalRows)
  }
  const aliases = unwrap(await supabase.rpc('search_approved_skill_aliases', {p_query: term}),
    'Could not search reviewed skill aliases')
  return resolveSkillCandidates(term,canonicalRows,aliases || [])
}

export async function listCertifications(search = '') {
  let q = supabase.from('certifications').select('id, canonical_name, normalized_name, issuing_organization, certification_type').eq('is_active', true).order('canonical_name')
  if (search) q = q.or(referenceTextFilter(['canonical_name','normalized_name'],search))
  return unwrap(await q.limit(50), 'Could not load certifications')
}

export async function listLanguages(search = '') {
  let q = supabase.from('languages').select('id, code, name, code_standard').eq('is_active', true).order('name')
  if (search) q = q.or(referenceTextFilter(['name','code'],search))
  return unwrap(await q.limit(50), 'Could not load languages')
}

export async function listIndustries() {
  return unwrap(
    await supabase
      .from('industries')
      .select('id, canonical_name, normalized_name')
      .eq('is_active', true)
      .order('canonical_name'),
    'Could not load industries'
  )
}

export async function listEducationLevels() {
  return unwrap(
    await supabase
      .from('education_levels')
      .select('id, code, name, rank')
      .order('rank'),
    'Could not load education levels'
  )
}

export async function listEmploymentTypes() {
  return unwrap(
    await supabase
      .from('employment_types')
      .select('id, code, name')
      .order('name'),
    'Could not load employment types'
  )
}

export async function listWorkArrangements() {
  return unwrap(
    await supabase
      .from('work_arrangements')
      .select('id, code, name')
      .order('name'),
    'Could not load work arrangements'
  )
}

export const referenceService = {
  listOccupations, listOccupationAliases, searchOccupations,
  listSkills, searchSkills, listCertifications, listLanguages,
  listIndustries, listEducationLevels, listEmploymentTypes, listWorkArrangements,
}

 // Dictionary reads use the signed user's existing access; selection never writes canonical data.
export async function searchReviewCanonicalTargets(type, search) {
  const term = typeof search === 'string' ? search.normalize('NFKC').trim() : ''
  if (term.length < 2) return []
  let rows
  switch (type) {
    case 'skill': rows = await listSkills(term); break
    case 'certification': rows = await listCertifications(term); break
    case 'occupation':
    case 'experience_requirement': rows = await searchOccupations(term); break
    case 'language': rows = await listLanguages(term); break
    case 'industry':
      rows = (await listIndustries()).filter(row =>
        [row.canonical_name, row.normalized_name].some(value => value?.toLowerCase().includes(term.toLowerCase())))
      break
    case 'education_requirement':
      rows = unwrap(await supabase.from('education_levels').select('id, name, code')
        .eq('is_active', true).or(referenceTextFilter(['name', 'code'], term)).order('name').limit(50),
      'Could not load education levels')
      break
    default: throw new Error('This suggestion type has no supported dictionary')
  }
  return (rows || []).slice(0, 50).map(row => ({id: row.id, name: row.canonical_name || row.name}))
}
