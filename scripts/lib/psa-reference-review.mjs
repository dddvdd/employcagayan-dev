// Catalog-specific diagnostics for a staged public API snapshot. These do not authorize import.
import {PSOC_GROUPS, validatePsocGroup} from './psoc-reference.mjs'
import {getPsaCatalogConfig} from './psa-transport.mjs'
const code = value => typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const digit = (value, width) => /^\d+$/.test(code(value)) && code(value).length <= width ? code(value).padStart(width, '0') : null
export function reviewPsaLevels(catalog, version, levels) {
 let config
 try { config = getPsaCatalogConfig(catalog, version) } catch { throw Error('Unsupported PSA review configuration') }
 const issues = [], summaries = [], add = (type, level, values) => {
  if (values.length) issues.push({type, level, count: values.length, sample_codes: values.slice(0, 10)})
 }
 for (const required of config.levels)
  if (!levels.some(level => level.level === required)) issues.push({type: 'missing_reference_level', level: required})
 for (const level of levels) {
  if (!level.records.length) issues.push({type: 'empty_reference_level', level: level.level})
  const seen = new Set(), duplicates = [], invalid = [], versions = []
  const distribution = new Map()
  for (const row of level.records) {
   if (code(row.version) !== version) versions.push(code(row.id ?? row.code))
   let identity, title
   if (catalog === 'psoc') {
    const spec = PSOC_GROUPS.find(item => item.endpoint === level.level)
    identity = digit(row[spec.field], spec.width); title = row.title
   } else if (catalog === 'psgc') {
    identity = typeof row.code === 'string' && /^\d{10}$/.test(row.code) ? row.code : null
    title = row.area_name
    const geo = code(row.geographic_level)
    distribution.set(geo, (distribution.get(geo) ?? 0) + 1)
   } else if (catalog === 'psic') {
    const spec = {sections: ['section', 1], divisions: ['division', 2], groups: ['groupcode', 3], classes: ['class_code', 4], 'sub-classes': ['subclass', 5]}[level.level]
    identity = level.level === 'sections' ? /^[A-U]$/.test(code(row.section)) ? code(row.section) : null : digit(row[spec[0]], spec[1])
    title = row.title
   } else {
    const field = {levels: 'level', broadgroup: 'broadgroup', field: 'field', program: 'program', course: 'course',
     broadfield: 'broadfield', narrowfield: 'narrowfield', detailedfield: 'detailedfield'}[level.level]
    const hierarchy = version === '2017' ? ['level', 'broadfield', 'narrowfield', 'detailedfield'] : ['level', 'broadgroup', 'field', 'program', 'course']
    const parts = hierarchy.slice(0, hierarchy.indexOf(field) + 1)
    identity = /^\d+$/.test(code(row[field])) ? JSON.stringify(parts.map(key => code(row[key]))) : null
    title = row[field + '_title']
   }
   if (!identity || typeof title !== 'string' || !title.trim()) invalid.push(code(row.id ?? row.code))
   if (identity && seen.has(identity)) duplicates.push(identity)
   if (identity) seen.add(identity)
  }
  add('invalid_code_or_title', level.level, invalid)
  add('duplicate_reference_identity', level.level, duplicates)
  add('unexpected_reference_version', level.level, versions)
  if (catalog === 'psgc') add('unrecognized_geographic_level', level.level,
   level.records.filter(row => !['Reg', 'Prov', 'City', 'Mun', 'SubMun', 'Bgy'].includes(row.geographic_level)).map(row => row.code))
  if (!level.download_complete) issues.push({type: 'pagination_completeness_unproven', level: level.level, count: level.records.length, sample_codes: []})
  summaries.push({level: level.level, count: level.records.length, unique_identities: seen.size,
   ...(catalog === 'psgc' ? {geographic_level_distribution: Object.fromEntries(distribution)} : {})})
 }
 const byLevel = new Map(levels.map(level => [level.level, level.records]))
 if (catalog === 'psoc') {
  const normalized = new Map()
  for (const spec of PSOC_GROUPS) {
   const rows = byLevel.get(spec.endpoint) ?? []
   if (rows.length !== spec.expected) issues.push({type: 'documented_count_mismatch', level: spec.endpoint, expected: spec.expected, actual: rows.length})
   try { normalized.set(spec.endpoint, validatePsocGroup(rows, {...spec, expected: rows.length}, version)) }
   catch { issues.push({type: 'psoc_schema_validation_failed', level: spec.endpoint}) }
  }
  for (let i = 1; i < PSOC_GROUPS.length; i++) {
   const parent = new Set((normalized.get(PSOC_GROUPS[i - 1].endpoint) ?? []).map(row => row.code))
   add('missing_hierarchy_parent', PSOC_GROUPS[i].endpoint,
    (normalized.get(PSOC_GROUPS[i].endpoint) ?? []).filter(row => !parent.has(row.parent_code)).map(row => row.code))
  }
 } else if (catalog === 'psic') {
  const specs = [['sections', 'section', null], ['divisions', 'division', 'section'], ['groups', 'groupcode', 'division'],
   ['classes', 'class_code', 'groupcode'], ['sub-classes', 'subclass', 'class_code']]
  for (let i = 1; i < specs.length; i++) {
   const [level, field, parentField] = specs[i], parentSpec = specs[i - 1]
   const parent = new Set((byLevel.get(parentSpec[0]) ?? []).map(row => code(row[parentSpec[1]])))
   add('missing_hierarchy_parent', level, (byLevel.get(level) ?? []).filter(row => !parent.has(code(row[parentField]))).map(row => code(row[field])))
   if (i > 1) add('inconsistent_numeric_parent_prefix', level, (byLevel.get(level) ?? []).filter(row => !code(row[field]).startsWith(code(row[parentField]))).map(row => code(row[field])))
  }
 } else if (catalog === 'psced') {
  const levelCodes = new Set((byLevel.get('levels') ?? []).map(row => code(row.level)))
  for (const level of levels.filter(item => item.level !== 'levels'))
   add('missing_education_level_parent', level.level, level.records.filter(row => !levelCodes.has(code(row.level))).map(row => code(row.id)))
  const hierarchy = version === '2017' ? [
   ['narrowfield', 'broadfield', ['level', 'broadfield']],
   ['detailedfield', 'narrowfield', ['level', 'broadfield', 'narrowfield']],
  ] : [
   ['field', 'broadgroup', ['level', 'broadgroup']],
   ['program', 'field', ['level', 'broadgroup', 'field']],
   ['course', 'program', ['level', 'broadgroup', 'field', 'program']],
  ]
  for (const [child, parent, keyFields] of hierarchy) {
   const key = row => JSON.stringify(keyFields.map(field => code(row[field])))
   const parents = new Set((byLevel.get(parent) ?? []).map(key))
   add('missing_education_hierarchy_parent', child, (byLevel.get(child) ?? []).filter(row =>
    // Some field rows intentionally have no broad-group component.
    !(parent === 'broadgroup' && code(row.broadgroup) === '') && !parents.has(key(row))).map(row => code(row.id)))
  }
 } else if (catalog === 'psgc') {
  const reg = new Set((byLevel.get('regions') ?? []).map(row => code(row.reg)))
  for (const level of levels.filter(item => item.level !== 'regions'))
   add('missing_region_component', level.level, level.records.filter(row => !reg.has(code(row.reg))).map(row => row.code))
  const keys = fields => row => JSON.stringify(fields.map(field => code(row[field])))
  const cityKey = keys(['reg', 'prv', 'mun'])
  // Highly urbanized cities can be returned at province level. Auxiliary views can
  // also carry typed city nodes. Use explicit types/components, never the endpoint name alone.
  const municipalities = new Set(levels.flatMap(level => level.records)
   .filter(row => ['City', 'Mun', 'SubMun'].includes(row.geographic_level)).map(cityKey))
  add('missing_municipality_component', 'barangays', (byLevel.get('barangays') ?? []).filter(row => !municipalities.has(cityKey(row))).map(row => row.code))
  // Preserve explicit geography types and correspondence codes; never invent province parents by slicing.
 }
 return {quality_status: issues.length ? 'requires_review' : 'api_snapshot_checks_passed',
  import_ready: false, automatic_import_authorized: false, summaries, issues}
}

