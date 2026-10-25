import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {PSA_CATALOGS, getPsaCatalogConfig, fetchPsaLevel} from '../../scripts/lib/psa-transport.mjs'
import {validatePsocGroup} from '../../scripts/lib/psoc-reference.mjs'
import {reviewPsaLevels} from '../../scripts/lib/psa-reference-review.mjs'
test('newer API releases require explicit selection and keep historical defaults immutable', () => {
 assert.equal(PSA_CATALOGS.psoc.version, '2012')
 assert.equal(PSA_CATALOGS.psced.version, '2008')
 assert.equal(getPsaCatalogConfig('psoc').version, '2012')
 assert.equal(getPsaCatalogConfig('psoc', '2022').version, '2022')
 assert.deepEqual(getPsaCatalogConfig('psced', '2017').levels, ['levels', 'broadfield', 'narrowfield', 'detailedfield'])
 assert.equal(Object.isFrozen(getPsaCatalogConfig('psced', '2017').levels), true)
})
test('explicit newer releases rebuild all eight official endpoints without returning private pagination links', async () => {
 const token = 'synthetic-release-credential'
 let calls = 0
 for (const [catalog, version] of [['psoc', '2022'], ['psced', '2017']])
  for (const level of getPsaCatalogConfig(catalog, version).levels) {
   const result = await fetchPsaLevel({catalog, version, level, token, fetchImpl: async (url, options) => {
    calls++
    assert.equal(url.origin, 'https://classification.psa.gov.ph')
    assert.equal(url.pathname, '/' + catalog + '/' + version + '/' + level)
    assert.equal(options.redirect, 'error')
    return {ok: true, text: async () => JSON.stringify({count: 0, results: [], next: null,
     previous: 'https://classification.psa.gov.ph/?token=' + token})}
   }})
   assert.equal(result.download_complete, true)
   assert.ok(!JSON.stringify(result).includes(token))
  }
 assert.equal(calls, 8)
})
test('unsupported releases, old PSCED levels in 2017 and absent fetch versions never make requests', async () => {
 for (const patch of [{catalog: 'psoc', version: '2023', level: 'unit'}, {catalog: 'psced', version: '2017', level: 'course'},
  {catalog: 'psced', version: '2008', level: 'detailedfield'}, {catalog: 'psoc', level: 'unit'}]) {
  let calls = 0
  await assert.rejects(() => fetchPsaLevel({...patch, token: 'synthetic', fetchImpl: () => {calls++; throw Error('unexpected')}}))
  assert.equal(calls, 0)
 }
 assert.throws(() => getPsaCatalogConfig('psic', '2026'), /Unsupported/)
})
test('PSOC row validation binds the explicit release and preserves leading military zeroes', () => {
 const group = {endpoint: 'unit', field: 'unitcode', width: 4, expected: 1}
 const row = {id: 1, unitcode: 110, title: 'Synthetic armed forces', description: '', version: '2022'}
 assert.equal(validatePsocGroup([row], group, '2022')[0].code, '0110')
 assert.equal(validatePsocGroup([row], group, '2022')[0].version, '2022')
 assert.throws(() => validatePsocGroup([row], group), /version/)
 assert.throws(() => validatePsocGroup([row], group, 'latest'), /Unsupported/)
})
test('PSCED 2017 uses its own explicit hierarchy and detects orphan or duplicate detailed fields', () => {
 const version = '2017', common = {level: '6', broadfield: '05', narrowfield: '054'}
 const levels = [
  {level: 'levels', download_complete: true, records: [{level: '6', level_title: 'Synthetic level', version}]},
  {level: 'broadfield', download_complete: true, records: [{...common, broadfield_title: 'Synthetic broad', version}]},
  {level: 'narrowfield', download_complete: true, records: [{...common, narrowfield_title: 'Synthetic narrow', version}]},
  {level: 'detailedfield', download_complete: true, records: [{...common, detailedfield: '60542', detailedfield_title: 'Synthetic detail', version}]},
 ]
 const before = JSON.stringify(levels)
 assert.equal(reviewPsaLevels('psced', version, levels).quality_status, 'api_snapshot_checks_passed')
 assert.equal(JSON.stringify(levels), before)
 levels[3].records.push({...levels[3].records[0]})
 assert.ok(reviewPsaLevels('psced', version, levels).issues.some(issue => issue.type === 'duplicate_reference_identity'))
 levels[3].records[0].narrowfield = '999'
 assert.ok(reviewPsaLevels('psced', version, levels).issues.some(issue => issue.type === 'missing_education_hierarchy_parent'))
})
test('CLI refuses ambiguous all-version requests and unsupported releases before private config/network access', () => {
 const env = {...process.env, PSA_API_TOKEN: '', PSA_PSOC_API_TOKEN: ''}
 for (const args of [['--catalog', 'all', '--version', '2022'], ['--catalog', 'psoc', '--version', 'latest'],
  ['--catalog', 'psced', '--version', '2017', '--config', 'missing-synthetic-config.env']]) {
  const result = spawnSync(process.execPath, ['scripts/fetch-psa-references.mjs', ...args], {encoding: 'utf8', env})
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout + result.stderr, /token=|missing-synthetic-config/)
 }
})

