import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fetchPsaLevel, recordsHash, PSA_MAX_PAGE_BYTES, PSA_CATALOGS} from '../../scripts/lib/psa-transport.mjs'
import {reviewPsaLevels} from '../../scripts/lib/psa-reference-review.mjs'
const token = 'synthetic-private-credential'
const request = patch => ({catalog: 'psoc', version: '2012', level: 'major', token, ...patch})
const response = value => ({ok: true, text: async () => JSON.stringify(value)})
const wrapped = (rows, count = rows.length, next = null) => ({count, next, previous: null, results: rows})
const link = page => 'https://classification.psa.gov.ph/psoc/2012/major?page=' + page + '&page_size=1000&token=' + token
const item = id => ({id, majorcode: id, title: 'Synthetic public reference', description: '', version: '2012'})
const level = (name, records) => ({level: name, records, download_complete: true})
test('PSA paginated records are complete and credential-bearing envelope URLs are never saved or followed', async () => {
 const urls = [], rows = [item(1), item(2), item(3)]
 const output = await fetchPsaLevel(request({fetchImpl: async (url, options) => {
  urls.push(new URL(url))
  assert.equal(url.origin, 'https://classification.psa.gov.ph')
  assert.equal(url.pathname, '/psoc/2012/major')
  assert.equal(url.searchParams.get('token'), token)
  assert.equal(options.redirect, 'error')
  assert.equal(options.headers.accept, 'application/json')
  assert.ok(options.signal instanceof AbortSignal)
  return response(urls.length === 1 ? wrapped(rows.slice(0, 2), 3, link(2)) :
   {...wrapped(rows.slice(2), 3), previous: link(1)})
 }}))
 assert.equal(urls.length, 2)
 assert.equal(urls[1].searchParams.get('page'), '2')
 assert.deepEqual(output.records, rows)
 assert.equal(output.download_complete, true)
 assert.equal(output.declared_count, 3)
 assert.equal(output.records_sha256, recordsHash(rows))
 assert.equal(output.pages.length, 2)
 assert.doesNotMatch(JSON.stringify(output), /synthetic-private-credential|token=|https:/)
})
test('foreign hosts, HTTP, paths, page jumps and changed token pagination never trigger another request', async () => {
 for (const next of ['https://example.invalid/?page=2', link(2).replace('https:', 'http:'), link(2).replace('/major', '/unit'),
  link(3), link(2).replace(token, 'other-credential'), link(2).replace('page_size=1000', 'page_size=5')]) {
  let calls = 0
  await assert.rejects(() => fetchPsaLevel(request({fetchImpl: async () => {calls++; return response(wrapped([item(1)], 2, next))}})), /pagination/)
  assert.equal(calls, 1)
 }
})
test('count changes, truncation, repeated pages and empty-progress pages are refused', async () => {
 const sequences = [
  [wrapped([item(1)], 2)],
  [wrapped([item(1)], 2, link(2)), wrapped([item(2)], 3)],
  [wrapped([item(1)], 3, link(2)), wrapped([item(1)], 3, link(3))],
  [wrapped([], 2, link(2))],
  [wrapped([item(1)], 1, link(2))],
 ]
 for (const sequence of sequences) {
  let call = 0
  await assert.rejects(() => fetchPsaLevel(request({fetchImpl: async () => response(sequence[call++])})),
   /truncated|count|Repeated|progress/)
 }
})
test('bare documented arrays are preserved but are not asserted pagination-complete', async () => {
 const output = await fetchPsaLevel(request({fetchImpl: async () => response([item(1)])}))
 assert.equal(output.download_complete, false)
 assert.equal(output.pagination, 'array_without_pagination_proof')
 assert.deepEqual(output.records, [item(1)])
})
test('malformed envelopes, excessive counts, invalid rows and invalid JSON are rejected safely', async () => {
 for (const payload of [{results: [], count: -1, next: null}, {results: [], count: 200001, next: null},
  {results: [], count: 0}, {data: []}, wrapped([null]), wrapped(['text']), wrapped([[item(1)]])])
  await assert.rejects(() => fetchPsaLevel(request({fetchImpl: async () => response(payload)})))
 await assert.rejects(() => fetchPsaLevel(request({fetchImpl: async () => ({ok: true, text: async () => '<html>failure</html>'})})), /not valid JSON/)
})
test('echoed credentials in nested reference rows are refused even when pagination itself is valid', async () => {
 for (const value of [token, encodeURIComponent(token), {nested: token}])
  await assert.rejects(() => fetchPsaLevel(request({fetchImpl: async () => response(wrapped([{...item(1), extra: value}]))})), /credential material/)
 await assert.rejects(() => fetchPsaLevel(request({fetchImpl: async () => response({token})})), /credential material/)
})
test('transport and response-read diagnostics cannot expose credential URLs or server text', async () => {
 for (const fetchImpl of [
  async () => { throw Error('private ' + link(2)) },
  async () => ({ok: true, text: async () => { throw Error(token) }}),
  async () => ({ok: false, status: 403, text: async () => token}),
 ]) await assert.rejects(() => fetchPsaLevel(request({fetchImpl})), error => !error.message.includes(token) && !error.message.includes('token='))
})
test('both streaming and fallback responses enforce the page byte limit', async () => {
 const oversized = 'x'.repeat(PSA_MAX_PAGE_BYTES + 1)
 for (const fetchImpl of [
  async () => ({ok: true, text: async () => oversized}),
  async () => new Response(oversized),
 ]) await assert.rejects(() => fetchPsaLevel(request({fetchImpl})), /size limit/)
})
test('unsupported catalog/version/level and absent/malformed token cause zero requests', async () => {
 for (const patch of [{catalog: '__proto__'}, {catalog: 'https://example.invalid'}, {version: 'latest'},
  {level: '../other'}, {token: ''}, {token: undefined}, {token: 'line\nbreak'}]) {
  let calls = 0
  await assert.rejects(() => fetchPsaLevel(request({...patch, fetchImpl: () => {calls++; throw Error('unexpected')}})))
  assert.equal(calls, 0)
 }
 assert.equal(Object.isFrozen(PSA_CATALOGS.psgc.levels), true)
})
test('all requested official catalogs and levels use the allowlisted host and version', async () => {
 let count = 0
 for (const [catalog, config] of Object.entries(PSA_CATALOGS)) for (const name of config.levels) {
  await fetchPsaLevel({catalog, version: config.version, level: name, token, fetchImpl: async url => {
   count++
   assert.equal(url.origin, 'https://classification.psa.gov.ph')
   assert.equal(url.pathname, '/' + catalog + '/' + config.version + '/' + name)
   return response(wrapped([]))
  }})
 }
 assert.equal(count, 21)
})
test('PSOC quality preserves military leading zeroes and flags documentation count differences', () => {
 const levels = [
  level('major', [{...item(0), majorcode: 0}]),
  level('sub-major', [{...item(1), submajorcode: 1}]),
  level('minor', [{...item(1), minorcode: 11}]),
  level('unit', [{...item(1), unitcode: 110}]),
 ]
 const result = reviewPsaLevels('psoc', '2012', levels)
 assert.equal(result.import_ready, false)
 assert.ok(result.issues.some(issue => issue.type === 'documented_count_mismatch' && issue.level === 'unit' && issue.expected === 456))
 assert.ok(!result.issues.some(issue => issue.type === 'missing_hierarchy_parent'))
 assert.equal(result.automatic_import_authorized, false)
})
test('PSGC preserves ten-digit/correspondence codes and geography types instead of assuming all province endpoint rows are provinces', () => {
 const rows = [
  level('regions', [{code: '0100000000', correspondence_code: '010000000', reg: 1, area_name: 'Synthetic region', geographic_level: 'Reg', version: 'Q2_2024'}]),
  level('provinces', [{code: '0102800000', correspondence_code: '012800000', reg: 1, area_name: 'Synthetic district', geographic_level: 'Dist', version: 'Q2_2024'}]),
  level('municipalities', [{code: '0102801000', reg: 1, prv: 28, mun: 1, area_name: 'Synthetic city', geographic_level: 'City', version: 'Q2_2024'}]),
  level('barangays', [{code: '0102801001', reg: 1, prv: 28, mun: 1, area_name: 'Synthetic barangay', geographic_level: 'Bgy', version: 'Q2_2024'}]),
 ]
 const original = JSON.stringify(rows), result = reviewPsaLevels('psgc', 'Q2_2024', rows)
 assert.deepEqual(result.summaries.find(item => item.level === 'provinces').geographic_level_distribution, {Dist: 1})
 assert.ok(!result.issues.some(issue => /component/.test(issue.type)))
 assert.equal(JSON.stringify(rows), original)
 rows[1].records.push({code: '0130100000', reg: 1, prv: 301, mun: 0, area_name: 'Synthetic HUC', geographic_level: 'City', version: 'Q2_2024'})
 rows[3].records.push({code: '0130100001', reg: 1, prv: 301, mun: 0, area_name: 'Synthetic HUC barangay', geographic_level: 'Bgy', version: 'Q2_2024'})
 assert.ok(!reviewPsaLevels('psgc', 'Q2_2024', rows).issues.some(issue => issue.type === 'missing_municipality_component'))
})
test('PSCED uses explicit composite ancestry and preserves variable-length course codes', () => {
 const version = '2008', fields = {level: '0', broadgroup: '', field: '001', program: '00100'}
 const levels = [
  level('levels', [{level: '0', level_title: 'Synthetic level', version}]),
  level('broadgroup', []),
  level('field', [{...fields, field_title: 'Synthetic field', version}]),
  level('program', [{...fields, program_title: 'Synthetic program', version}]),
  level('course', [{...fields, course: '10000', course_title: 'Synthetic course', version}]),
 ]
 const before = JSON.stringify(levels), result = reviewPsaLevels('psced', version, levels)
 assert.ok(!result.issues.some(issue => /missing_education/.test(issue.type)))
 assert.equal(JSON.stringify(levels), before)
 levels[4].records[0].program = '99999'
 assert.ok(reviewPsaLevels('psced', version, levels).issues.some(issue => issue.type === 'missing_education_hierarchy_parent'))
})
test('PSIC diagnostics detect missing parents, duplicate codes and mismatched versions without authorizing import', () => {
 const version = '2019'
 const levels = [
  level('sections', [{section: 'A', title: 'Synthetic section', version}]),
  level('divisions', [{section: 'A', division: '01', title: 'Synthetic division', version}]),
  level('groups', [{division: '01', groupcode: '011', title: 'Synthetic group', version}]),
  level('classes', [{groupcode: '999', class_code: '0111', title: 'Synthetic class', version}]),
  level('sub-classes', [{class_code: '0111', subclass: '01111', title: 'Synthetic subclass', version: '2009'}]),
 ]
 levels[1].records.push({...levels[1].records[0]})
 const result = reviewPsaLevels('psic', version, levels)
 for (const type of ['missing_hierarchy_parent', 'duplicate_reference_identity', 'unexpected_reference_version'])
  assert.ok(result.issues.some(issue => issue.type === type), type)
 assert.equal(result.quality_status, 'requires_review')
 assert.equal(result.import_ready, false)
})
test('missing or empty reference levels require review even with a zero-count server response', () => {
 const output = reviewPsaLevels('psced', '2008', [level('levels', [])])
 assert.ok(output.issues.some(issue => issue.type === 'missing_reference_level'))
 assert.ok(output.issues.some(issue => issue.type === 'empty_reference_level'))
 assert.throws(() => reviewPsaLevels('psic', '2009', []), /Unsupported/)
})
test('CLI help and invalid/missing configuration paths never disclose credentials or start downloads', () => {
 const env = {...process.env, PSA_API_TOKEN: '', PSA_PSOC_API_TOKEN: ''}
 const cli = 'scripts/fetch-psa-references.mjs'
 const run = args => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8', env})
 assert.equal(run(['--help']).status, 0)
 for (const args of [['--catalog', 'bad'], ['--catalog', 'psoc', '--catalog', 'psic'],
  ['--config', 'missing-synthetic-private-config-does-not-exist.env']]) {
  const output = run(args)
  assert.equal(output.status, 1)
  assert.doesNotMatch(output.stdout + output.stderr, /token=|missing-synthetic-private-config/)
 }
})

