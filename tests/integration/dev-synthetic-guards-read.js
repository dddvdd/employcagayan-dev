import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const devUrl = 'https://cdmkzzmaswwiryymtycn.supabase.co'
if (process.env.EMPLOY_VERIFIED_DEV_URL !== devUrl || process.env.EMPLOY_RUN_SYNTHETIC_GUARD_READ !== '1')
  throw Error('Independently verified DEV URL and read-only opt-in required')
const env = parseEnv(await readFile(new URL('../../.env.test', import.meta.url), 'utf8'))
if (env.VITE_SUPABASE_URL !== devUrl || !env.VITE_SUPABASE_PUBLISHABLE_KEY)
  throw Error('Public DEV configuration mismatch')
const guardedFetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  const method = init?.method ?? 'GET'
  if (url.origin !== devUrl || url.protocol !== 'https:' ||
    !(['GET', 'HEAD'].includes(method) && url.pathname === '/rest/v1/vacancy_definitions') &&
    !(method === 'POST' && ['/rest/v1/rpc/list_platform_vacancies', '/rest/v1/rpc/get_platform_vacancy'].includes(url.pathname)))
    throw Error('Request is outside the read-only DEV vacancy checks')
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) }).then(response => {
    if (method === 'HEAD') directHeadStatus = response.status
    return response
  })
}
let directHeadStatus = null
const client = createClient(devUrl, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: guardedFetch },
})
const listing = await client.rpc('list_platform_vacancies', { p_search: null })
if (listing.error || !Array.isArray(listing.data))
  throw Error('Anonymous public job listing failed after the guard migration (' +
    JSON.stringify({ code: listing.error?.code, status: listing.error?.status, message: listing.error?.message,
      dataType: typeof listing.data, dataKeys: listing.data && Object.keys(listing.data).slice(0, 8) }) + ')')
const direct = await client.from('vacancy_definitions').select('id', { count: 'exact', head: true })
if (directHeadStatus !== 401 && (direct.error || direct.count < listing.data.length))
  throw Error('Anonymous direct vacancy scope is inconsistent with the public listing')
let detailConfirmed = false
if (listing.data.length) {
  const one = await client.rpc('get_platform_vacancy', { p_vacancy_definition_id: listing.data[0].id })
  if (one.error || one.data?.id !== listing.data[0].id)
    throw Error('Anonymous vacancy detail failed after the guard migration')
  detailConfirmed = true
}
let classifiedVacancyHidden = null
const testVacancyId = process.env.EMPLOY_SYNTHETIC_VACANCY_ID
if (testVacancyId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testVacancyId))
    throw Error('Invalid fictional vacancy ID')
  const named = await client.rpc('list_platform_vacancies', { p_search: 'PESO DEV TEST' })
  const item = await client.rpc('get_platform_vacancy', { p_vacancy_definition_id: testVacancyId })
  if (named.error || !Array.isArray(named.data) || named.data.some(job => job.id === testVacancyId) ||
    item.error || item.data !== null || listing.data.some(job => job.id === testVacancyId))
    throw Error('Classified vacancy leaked to anonymous public job readers')
  classifiedVacancyHidden = true
}
process.stdout.write(JSON.stringify({ publicJobs: listing.data.length,
  directVacancyHeadStatus: directHeadStatus, detailConfirmed, classifiedVacancyHidden }) + '\n')
