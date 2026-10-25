// Local PSA download tooling. Never import into the browser or send tokens to other hosts.
import {createHash} from 'node:crypto'
const origin = 'https://classification.psa.gov.ph'
export const PSA_PAGE_SIZE = 1000
export const PSA_MAX_PAGE_BYTES = 4 * 1024 * 1024
export const PSA_MAX_PAGES = 512
export const PSA_MAX_ROWS = 200000
const configs = {
 psoc: {version: '2012', levels: ['major', 'sub-major', 'minor', 'unit']},
 psgc: {version: 'Q2_2024', levels: ['regions', 'provinces', 'municipalities', 'barangays', 'income_classification', 'urban_rural', 'city_class']},
 psced: {version: '2008', levels: ['levels', 'broadgroup', 'field', 'program', 'course']},
 psic: {version: '2019', levels: ['sections', 'divisions', 'groups', 'classes', 'sub-classes']},
}
export const PSA_CATALOGS = Object.freeze(Object.fromEntries(Object.entries(configs).map(([key, value]) =>
 [key, Object.freeze({...value, levels: Object.freeze(value.levels), documentation: 'https://psa.gov.ph/classifications-api/' + key})])))
// Preserve the original default snapshots. Newer releases require explicit selection.
const newerReleases = Object.freeze({
 psoc: Object.freeze({'2022': Object.freeze({version: '2022', levels: PSA_CATALOGS.psoc.levels,
  documentation: PSA_CATALOGS.psoc.documentation})}),
 psced: Object.freeze({'2017': Object.freeze({version: '2017',
  levels: Object.freeze(['levels', 'broadfield', 'narrowfield', 'detailedfield']),
  documentation: PSA_CATALOGS.psced.documentation})}),
})
export function getPsaCatalogConfig(catalog, version = null) {
 if (!Object.hasOwn(PSA_CATALOGS, catalog)) throw Error('Unsupported PSA catalog, version or level')
 const base = PSA_CATALOGS[catalog]
 if (version === null || version === base.version) return base
 if (Object.hasOwn(newerReleases, catalog) && Object.hasOwn(newerReleases[catalog], version)) return newerReleases[catalog][version]
 throw Error('Unsupported PSA catalog, version or level')
}
export const recordsHash = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
function credentialPresent(text, token) {
 return [token, encodeURIComponent(token), new URLSearchParams({token}).toString().slice(6)]
  .some(value => value && text.includes(value))
}
async function readBounded(response) {
 try {
  if (!response.body?.getReader) {
   const text = await response.text()
   if (Buffer.byteLength(text, 'utf8') > PSA_MAX_PAGE_BYTES) throw Error('size')
   return text
  }
  const reader = response.body.getReader(), chunks = []
  let size = 0
  for (;;) {
   const {value, done} = await reader.read()
   if (done) break
   size += value.byteLength
   if (size > PSA_MAX_PAGE_BYTES) { await reader.cancel(); throw Error('size') }
   chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
 } catch { throw Error('PSA response unreadable or exceeds the page size limit') }
}
function nextPage(next, url, page, token) {
 if (next === null) return false
 if (typeof next !== 'string' || !next || next.length > 4096) throw Error('Invalid PSA pagination metadata')
 let parsed
 try { parsed = new URL(next) } catch { throw Error('Invalid PSA pagination metadata') }
 if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash ||
  parsed.pathname.replace(/\/$/, '') !== url.pathname ||
  parsed.searchParams.getAll('page').length !== 1 ||
  parsed.searchParams.get('page') !== String(page + 1) ||
  (parsed.searchParams.has('page_size') && parsed.searchParams.get('page_size') !== String(PSA_PAGE_SIZE)) ||
  (parsed.searchParams.has('token') && parsed.searchParams.get('token') !== token))
  throw Error('Invalid PSA pagination metadata')
 return true
}
export async function fetchPsaLevel({catalog, version, level, token, fetchImpl = fetch} = {}) {
 if (typeof version !== 'string') throw Error('Unsupported PSA catalog, version or level')
 const config = getPsaCatalogConfig(catalog, version)
 if (!config.levels.includes(level)) throw Error('Unsupported PSA catalog, version or level')
 if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[\r\n]/.test(token))
  throw Error('Configure a local PSA API token before downloading')
 const records = [], pages = [], seenPages = new Set()
 let total = null, envelopeMode = null
 for (let page = 1; page <= PSA_MAX_PAGES; page++) {
  // Only use local configuration to construct requests. Never fetch a server-supplied URL.
  const url = new URL('/' + catalog + '/' + version + '/' + level, origin)
  url.searchParams.set('token', token)
  url.searchParams.set('page_size', String(PSA_PAGE_SIZE))
  url.searchParams.set('page', String(page))
  let response
  try { response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(30000), headers: {accept: 'application/json'}}) }
  catch { throw Error('PSA request failed; credential URLs and diagnostics withheld') }
  if (!response.ok) throw Error('PSA request failed with HTTP ' + (Number.isInteger(response.status) ? response.status : 'error'))
  const raw = await readBounded(response)
  let payload
  try { payload = JSON.parse(raw) } catch { throw Error('PSA response was not valid JSON') }
  const wrapped = !Array.isArray(payload)
  let rows, more
  if (wrapped) {
   if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results) ||
    !Number.isSafeInteger(payload.count) || payload.count < 0 || payload.count > PSA_MAX_ROWS ||
    !Object.hasOwn(payload, 'next')) {
    if (credentialPresent(raw, token)) throw Error('PSA response contains credential material; catalog not saved')
    throw Error('Unexpected PSA response shape; catalog not accepted')
   }
   rows = payload.results
   if (total !== null && total !== payload.count) throw Error('PSA total count changed during pagination')
   total = payload.count
   more = nextPage(payload.next, url, page, token)
  } else {
   rows = payload
   total = rows.length
   more = false
  }
  if (envelopeMode !== null && envelopeMode !== wrapped) throw Error('PSA response shape changed during pagination')
  envelopeMode = wrapped
  // Discard the entire pagination envelope. It may legitimately contain credential-bearing links.
  // Only record arrays, count/page integers and hashes of those arrays leave this function.
  if (credentialPresent(JSON.stringify(rows), token)) throw Error('PSA records contain credential material; catalog not saved')
  if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw Error('Malformed PSA reference row')
  if ((wrapped && rows.length > PSA_PAGE_SIZE) || rows.length > PSA_MAX_ROWS) throw Error('PSA page exceeds row limit')
  const hash = recordsHash(rows)
  if (seenPages.has(hash)) throw Error('Repeated PSA page; catalog not accepted')
  seenPages.add(hash)
  for (const row of rows) records.push(row)
  pages.push({page, count: rows.length, records_sha256: hash})
  if (records.length > total || records.length > PSA_MAX_ROWS) throw Error('PSA count mismatch or row limit exceeded')
  if (more && (!rows.length || records.length >= total)) throw Error('Invalid PSA pagination progress')
  if (!more) {
   if (records.length !== total) throw Error('PSA result was truncated; catalog not accepted')
   return {level, declared_count: total, pagination: wrapped ? 'count_results' : 'array_without_pagination_proof',
    download_complete: wrapped, pages, records_sha256: recordsHash(records), records}
  }
 }
 throw Error('PSA pagination exceeds the maximum page count')
}

