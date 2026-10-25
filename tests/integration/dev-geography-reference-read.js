import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const expected = 'https://cdmkzzmaswwiryymtycn.supabase.co'
if (process.env.EMPLOY_VERIFIED_DEV_URL !== expected || process.env.EMPLOY_RUN_DEV_GEOGRAPHY_READ !== '1') {
  throw new Error('Independently verified DEV URL and explicit read-only opt-in are required')
}
const env = parseEnv(await readFile(new URL('../../.env.test', import.meta.url), 'utf8'))
if (env.VITE_SUPABASE_URL !== expected || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Public DEV geography connection mismatch')
}
const guardedFetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.origin !== expected || url.protocol !== 'https:' || (init?.method && init.method !== 'GET')) {
    throw new Error('Non-DEV or non-read geography request refused')
  }
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) })
}
const supabase = createClient(expected, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: guardedFetch },
})
function requireRows({ data, error }, label) {
  if (error || !data) throw new Error(label + ' could not be read anonymously')
  return data
}
const version = requireRows(await supabase.from('geography_reference_versions')
  .select('id,version_code').eq('reference_system', 'PSGC').eq('is_current', true).single(), 'current version')
if (version.version_code !== 'Q2_2026') throw new Error('Unexpected current PSGC version')
const provinces = requireRows(await supabase.from('geography_units')
  .select('official_code,name,parent_code').eq('reference_version_id', version.id)
  .in('structural_kind', ['Prov']).order('name'), 'provinces')
const cagayan = provinces.find(row => row.official_code === '0201500000')
if (!cagayan || provinces.length !== 82) throw new Error('Current province reference is incomplete')
const municipalities = requireRows(await supabase.from('geography_units')
  .select('official_code,name,parent_code').eq('reference_version_id', version.id)
  .in('structural_kind', ['City', 'Mun']).eq('parent_code', cagayan.official_code).order('name'), 'Cagayan LGUs')
const tuguegarao = municipalities.find(row => row.official_code === '0201529000')
if (!tuguegarao || municipalities.length !== 29) throw new Error('Cagayan LGU reference is incomplete')
const barangays = requireRows(await supabase.from('geography_units')
  .select('official_code,name,parent_code').eq('reference_version_id', version.id)
  .in('structural_kind', ['Bgy']).eq('parent_code', tuguegarao.official_code).order('name'), 'Tuguegarao barangays')
if (barangays.length !== 49 || !barangays.some(row => row.official_code === '0201529001')) {
  throw new Error('Tuguegarao barangay reference is incomplete')
}
process.stdout.write(JSON.stringify({ version: version.version_code, provinces: provinces.length, cagayanLgus: municipalities.length, tuguegaraoBarangays: barangays.length }) + '\n')
