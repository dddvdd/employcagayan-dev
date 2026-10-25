import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { totp } from '../support/totp.js'

const expected = 'https://cdmkzzmaswwiryymtycn.supabase.co'
const ref = 'cdmkzzmaswwiryymtycn'
if (process.env.EMPLOY_RUN_DEV_AUTH_TESTS !== '1' || process.env.EMPLOY_VERIFIED_DEV_URL !== expected) {
  throw new Error('Explicit DEV-only opt-in and independently verified API URL required')
}
const config = parseEnv(await readFile(new URL('../../.env.test', import.meta.url), 'utf8'))
if (config.VITE_SUPABASE_URL !== expected) throw new Error('Test connection does not match verified DEV')
if (!config.SUPABASE_SERVICE_ROLE_KEY || !config.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('DEV fixture credentials unavailable')
const decode = token => {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')) } catch { return null }
}
const serviceClaims = decode(config.SUPABASE_SERVICE_ROLE_KEY)
if (serviceClaims && (serviceClaims.ref !== ref || serviceClaims.role !== 'service_role')) throw new Error('Fixture credential project mismatch')
const runId = randomUUID()
const created = []
const checks = []
const requests = []
let companyId
let companyOwner
let currentStep = 'configuration'
let failed = false

function verify(condition, message) {
  if (!condition) throw new Error(message)
}
function step(name) { currentStep = name }
function checkedFetch(mode) {
  return async (input, init) => {
    // Independently inspect the ACTUAL outgoing connection before every request,
    // rather than trusting a filename, project nickname or client configuration.
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    verify(url.origin === expected && url.protocol === 'https:', 'Outbound target is not verified DEV')
    verify(config.VITE_SUPABASE_URL === process.env.EMPLOY_VERIFIED_DEV_URL, 'Verified connection changed')
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const authorization = headers.get('authorization')?.replace(/^Bearer /, '')
    const claims = authorization ? decode(authorization) : null
    if (mode === 'normal' && url.pathname.startsWith('/rest/')) {
      verify(claims?.role === 'authenticated' && claims.iss === `${expected}/auth/v1` && /^[0-9a-f-]{36}$/.test(claims.session_id), 'Acceptance request requires actual signed DEV user session')
    }
    if (mode !== 'fixture') verify(claims?.role !== 'service_role', 'Service credentials cannot satisfy acceptance checks')
    const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) })
    requests.push({ mode, method: init?.method ?? 'GET', path: url.pathname, status: response.status })
    return response
  }
}
const makeClient = mode => createClient(expected, mode === 'fixture' ? config.SUPABASE_SERVICE_ROLE_KEY : config.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: checkedFetch(mode) },
})
const fixture = makeClient('fixture')
const anonymous = makeClient('anonymous')
const unwrap = (result, name) => {
  // Never log SDK responses: these can contain passwords, JWTs or MFA secrets.
  verify(!result.error, `${name} failed (${result.error?.code ?? result.error?.status ?? 'request'})`)
  return result.data
}
const expectDenied = (result, name) => verify(Boolean(result.error) || (Array.isArray(result.data) && result.data.length === 0), `${name}: access unexpectedly allowed`)
const bootstrap = async client => unwrap(await client.rpc('auth_account_bootstrap'), 'self bootstrap')
async function newAccount(role) {
  const email = `dev-auth-${runId}-${created.length}@example.invalid`
  const password = `${randomBytes(24).toString('base64url')}!aA9`
  const user = unwrap(await fixture.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { test_run: runId, role: 'admin', full_name: 'Synthetic DEV auth fixture' },
  }), 'create synthetic account').user
  verify(user?.id && user.email === email, 'Synthetic account identity mismatch')
  created.push({ id: user.id, email })
  const profile = unwrap(await fixture.from('profiles').select('id,role').eq('id', user.id).single(), 'fixture signup profile')
  verify(profile.role === 'applicant', 'Signup metadata assigned privileged role')
  if (role !== 'applicant') unwrap(await fixture.from('profiles').update({ role }).eq('id', user.id), 'set synthetic fixture role')
  const client = makeClient('normal')
  unwrap(await client.auth.signInWithPassword({ email, password }), 'signed password login')
  return { client, id: user.id }
}
async function enrollAndVerify(client) {
  const factor = unwrap(await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `DEV integration ${runId}` }), 'TOTP enrollment')
  verify(factor.type === 'totp' && factor.totp?.secret, 'TOTP enrollment response missing')
  const challenge = unwrap(await client.auth.mfa.challenge({ factorId: factor.id }), 'TOTP challenge')
  const verified = unwrap(await client.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: totp(factor.totp.secret) }), 'TOTP verification')
  verify(decode(verified.access_token)?.aal === 'aal2', 'Auth did not issue signed AAL2')
  return factor.id
}
try {
  step('anonymous authority APIs')
  expectDenied(await anonymous.rpc('auth_account_bootstrap'), 'anonymous bootstrap')
  expectDenied(await anonymous.rpc('save_jobseeker_profile', { p_profile: { data_subject_rights_agreed: true } }), 'anonymous profile save')
  expectDenied(await anonymous.rpc('register_employer_application', { p_application: {} }), 'anonymous registration')
  checks.push('Anonymous bootstrap and company registration denied')

  step('staff AAL1')
  const staff = await newAccount('staff')
  const a1 = await bootstrap(staff.client)
  verify(a1.role === 'staff' && a1.mfa_required && !a1.mfa_satisfied && a1.is_active, 'Staff AAL1 authority state incorrect')
  expectDenied(await staff.client.from('profiles').select('id').eq('id', staff.id), 'staff AAL1 table')
  expectDenied(await staff.client.rpc('admin_reject_employer', { p_employer_id: randomUUID(), p_reason: 'synthetic' }), 'staff AAL1 admin API')
  checks.push('Actual password staff session receives bootstrap but protected API denies AAL1')

  step('staff verified TOTP')
  const factorId = await enrollAndVerify(staff.client)
  const a2 = await bootstrap(staff.client)
  verify(a2.mfa_satisfied && a2.role === 'staff', 'Verified staff TOTP rejected')
  const own = unwrap(await staff.client.from('profiles').select('id,role').eq('id', staff.id), 'staff AAL2 self table')
  verify(own.length === 1 && own[0].id === staff.id, 'Staff AAL2 self table inaccessible')
  expectDenied(await staff.client.from('profiles').update({ role: 'admin' }).eq('id', staff.id).select('id'), 'staff self promotion')
  expectDenied(await staff.client.rpc('admin_reject_employer', { p_employer_id: randomUUID(), p_reason: 'synthetic' }), 'staff AAL2 admin API')
  checks.push('Real TOTP challenge yields AAL2 and own-profile access; self promotion/admin API denied')

  step('password applicant company scope')
  const applicant = await newAccount('applicant')
  verify(!(await bootstrap(applicant.client)).jobseeker_authorized, 'Password-only applicant treated as Google')
  expectDenied(await applicant.client.rpc('get_or_create_participant'), 'password candidate creation')
  companyId = unwrap(await applicant.client.rpc('register_employer_application', { p_application: {
    company_name: `Synthetic DEV ${runId}`, employer_type: 'local_direct', contact_person: 'Synthetic Fixture', contact_number: '09123456789',
    business_structure: 'corporation', osh_classification: 'low_risk', registration_status: 'approved', role: 'admin', registered_user_id: staff.id,
  } }), 'owned pending company registration')
  companyOwner = applicant.id
  const pending = await bootstrap(applicant.client)
  verify(pending.role === 'applicant' && !pending.mfa_required && !pending.employer_mfa_satisfied && !pending.partner_authorized && pending.employer_application?.id === companyId && pending.employer_application.registration_status === 'pending', 'Pending company authority state incorrect')
  expectDenied(await applicant.client.from('employer_accreditation').select('id').eq('employer_id', companyId), 'pending company AAL1 documents')
  await enrollAndVerify(applicant.client)
  const corporate = await bootstrap(applicant.client)
  verify(corporate.employer_mfa_satisfied && corporate.role === 'applicant' && !corporate.partner_authorized, 'Pending company TOTP granted recruitment privileges')
  const accreditation = unwrap(await applicant.client.from('employer_accreditation').select('id').eq('employer_id', companyId), 'own company accreditation')
  verify(accreditation.length === 1, 'Own pending accreditation inaccessible')
  expectDenied(await applicant.client.from('employer_accreditation').select('id').neq('employer_id', companyId), 'other company accreditation')
  expectDenied(await applicant.client.from('participants').select('id'), 'password applicant candidate data')
  expectDenied(await applicant.client.rpc('save_jobseeker_profile', { p_profile: { data_subject_rights_agreed: true } }), 'password profile save after TOTP')
  expectDenied(await applicant.client.from('employers').update({ registration_status: 'approved' }).eq('id', companyId).select('id'), 'pending self approval')
  checks.push('Password company registration stays applicant/pending; TOTP unlocks only own accreditation; Google-only candidate and other-company access denied')

  step('removed factor stale signed JWT')
  const oldToken = unwrap(await staff.client.auth.getSession(), 'capture signed session').session.access_token
  unwrap(await fixture.auth.admin.mfa.deleteFactor({ userId: staff.id, id: factorId }), 'delete synthetic verified factor')
  const staleResponse = await checkedFetch('normal')(`${expected}/rest/v1/profiles?select=id&id=eq.${staff.id}`, {
    headers: { apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${oldToken}` },
  })
  verify(staleResponse.status === 401 || staleResponse.status === 403, 'Removed factor stale AAL2 JWT retained protected access')
  checks.push('Removing verified factor invalidates protected access even with previously signed AAL2 token')

  step('revoked session stale signed JWT')
  const token = unwrap(await applicant.client.auth.getSession(), 'capture corporate session').session.access_token
  unwrap(await applicant.client.auth.signOut({ scope: 'global' }), 'revoke synthetic sessions')
  const revoked = await checkedFetch('normal')(`${expected}/rest/v1/employer_accreditation?select=id&employer_id=eq.${companyId}`, {
    headers: { apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  })
  verify(revoked.status === 401 || revoked.status === 403, 'Revoked signed session retained corporate access')
  checks.push('Global logout invalidates protected data access with previously signed corporate token')
} catch (error) {
  failed = true
  // All generated errors above are labels; raw SDK messages are never surfaced.
  console.error(`DEV auth integration failed at ${currentStep}: ${error.message}`)
} finally {
  step('synthetic fixture cleanup')
  try {
    if (companyId) {
      verify(created.some(account => account.id === companyOwner), 'Cleanup owner was not created in this run')
      const row = unwrap(await fixture.from('employers').select('id,registered_user_id,company_name').eq('id', companyId).single(), 'verify synthetic company cleanup')
      verify(row.registered_user_id === companyOwner && row.company_name === `Synthetic DEV ${runId}`, 'Refusing cleanup of non-fixture company')
      unwrap(await fixture.from('employers').delete().eq('id', companyId).eq('registered_user_id', companyOwner), 'delete synthetic company')
    }
    for (const account of created) {
      const user = unwrap(await fixture.auth.admin.getUserById(account.id), 'verify synthetic user cleanup').user
      verify(user?.user_metadata?.test_run === runId && user.email === account.email, 'Refusing cleanup of non-fixture account')
      unwrap(await fixture.auth.admin.deleteUser(account.id), 'delete synthetic user')
    }
    checks.push(`Cleaned up ${created.length} synthetic accounts and ${companyId ? 1 : 0} synthetic company; private authorization audit retained`)
  } catch {
    failed = true
    console.error('Synthetic fixture cleanup incomplete; inspect this run before another live test')
  }
  await writeFile(new URL('../../artifacts/identity-milestone-20261012/live-auth-results.json', import.meta.url), JSON.stringify({
    verified_project_ref: ref, observed_at: new Date().toISOString(), run_id: runId, passed: !failed, checks,
    requests, limitations: ['No real Google OAuth roundtrip or identity linking exercised', 'No real-user data or accounts used', 'No accreditation PDF uploaded'],
  }, null, 2))
  console.log(JSON.stringify({ passed: !failed, checks: checks.length, requests: requests.length, synthetic_accounts: created.length }))
  process.exitCode = failed ? 1 : 0
}
