import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { totp } from '../support/totp.js'

const expected = 'https://cdmkzzmaswwiryymtycn.supabase.co'
const phase = process.env.EMPLOY_ACTIVATION_PHASE
if (process.env.EMPLOY_RUN_ACTIVATION_TESTS !== '1' || process.env.EMPLOY_VERIFIED_DEV_URL !== expected || !['baseline', 'verify', 'reviewed'].includes(phase)) throw Error('Verified DEV-only opt-in required')
const env = parseEnv(await readFile(new URL('../../.env.test', import.meta.url), 'utf8'))
if (env.VITE_SUPABASE_URL !== expected) throw Error('DEV URL mismatch')
const claims = token => { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')) } catch { return null } }
const serviceClaims = claims(env.SUPABASE_SERVICE_ROLE_KEY)
if (serviceClaims && (serviceClaims.ref !== 'cdmkzzmaswwiryymtycn' || serviceClaims.role !== 'service_role')) throw Error('Fixture credential mismatch')

const run = randomUUID(), accounts = [], companies = [], files = [], ids = [], requests = [], checks = []
let passed = false, cleanup = false, step = 'configuration', adminClient
const ok = (condition, message) => { if (!condition) throw Error(message) }
const data = (result, message) => { ok(!result.error, `${message} (${result.error?.code ?? result.error?.status ?? 'request'})`); return result.data }
const client = (kind, actorId = null) => createClient(expected, kind === 'fixture' ? env.SUPABASE_SERVICE_ROLE_KEY : env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    ok(url.origin === expected && url.protocol === 'https:' && process.env.EMPLOY_VERIFIED_DEV_URL === expected, 'Outbound request left verified DEV')
    if (kind === 'actor' && (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/storage/'))) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      const jwt = claims(headers.get('authorization')?.replace(/^Bearer /, '') || '')
      ok(jwt?.role === 'authenticated' && jwt.iss === expected + '/auth/v1' && jwt.sub === actorId && jwt.session_id, 'Real signed fixture actor required')
    }
    const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) })
    requests.push({ kind, path: url.pathname, status: response.status })
    return response
  } },
})
const fixture = client('fixture')
const denied = async (promise, label) => ok((await promise).error?.code === '42501', `${label}: expected 42501`)
const profile = async id => data(await fixture.from('profiles').select('id,role,is_active').eq('id', id).single(), 'read fixture profile')
const company = async id => data(await fixture.from('employers').select('id,registered_user_id,registration_status,employer_code').eq('id', id).single(), 'read fixture company')

const pdf = () => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream']
  let content = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(content)
  content += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(content)
}

try {
  step = 'prepare exact synthetic accounts'
  for (const role of ['admin', 'link_owner', 'approval_owner']) {
    const email = `dev-activation-${run}-${role}@example.invalid`
    const password = randomBytes(24).toString('base64url') + '!aA9'
    const user = data(await fixture.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run: run } }), 'create fixture Auth user').user
    accounts.push({ id: user.id, email, password, role }); ids.push(user.id)
    if (role === 'admin') data(await fixture.from('profiles').update({ role: 'admin' }).eq('id', user.id), 'set fixture admin role')
    else data(await fixture.from('profiles').update({ is_active: false }).eq('id', user.id), 'disable fixture account')
  }
  for (const [index, owner] of [[0, null], [1, accounts[2]]]) {
    const row = data(await fixture.from('employers').insert({
      company_name: `Synthetic account activation ${run} ${index}`, registered_user_id: owner?.id ?? null,
      registration_status: 'pending', registration_source: 'admin', is_active: true,
      employer_type: 'local_direct', business_structure: 'corporation', osh_classification: 'low_risk',
    }).select('id,company_name').single(), 'create fixture company')
    companies.push(row); ids.push(row.id)
  }
  data(await fixture.from('employers').update({ registration_status: 'approved' }).eq('id', companies[0].id), 'mark synthetic company approved')
  const accreditation = data(await fixture.from('employer_accreditation').select('id,employer_accreditation_requirements(id)').eq('employer_id', companies[1].id).single(), 'read fixture accreditation')
  ids.push(accreditation.id, ...accreditation.employer_accreditation_requirements.map(r => r.id))

  step = 'authenticate real admin and prepare synthetic requirement evidence'
  adminClient = client('actor', accounts[0].id)
  data(await adminClient.auth.signInWithPassword({ email: accounts[0].email, password: accounts[0].password }), 'real admin password login')
  await denied(adminClient.rpc('admin_link_employer_account', { p_employer_id: companies[0].id, p_email: accounts[1].email }), 'AAL1 link')
  await denied(adminClient.rpc('admin_approve_employer', { p_employer_id: companies[1].id }), 'AAL1 approval')
  if (phase === 'reviewed') await denied(adminClient.rpc('admin_reactivate_employer_account', { p_employer_id: companies[0].id, p_email: accounts[1].email, p_reason_code: 'identity_and_access_reviewed' }), 'AAL1 reactivation')
  const factor = data(await adminClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Synthetic approval decision' }), 'enroll real TOTP')
  const challenge = data(await adminClient.auth.mfa.challenge({ factorId: factor.id }), 'challenge real TOTP')
  data(await adminClient.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: totp(factor.totp.secret) }), 'verify real TOTP')
  const token = data(await adminClient.auth.getSession(), 'read verified session').session.access_token
  ok(claims(token)?.aal === 'aal2', 'Actual AAL2 session missing')
  checks.push('Actual signed admin password/TOTP session denies AAL1 company decisions')
  for (const requirement of accreditation.employer_accreditation_requirements) {
    const path = `${companies[1].id}/${requirement.id}.pdf`
    data(await fixture.storage.from('accreditation-documents').upload(path, pdf(), { contentType: 'application/pdf', upsert: false }), 'upload exact fixture PDF')
    files.push(path)
    data(await fixture.from('employer_accreditation_requirements').update({ document_path: path, status: 'submitted' }).eq('id', requirement.id), 'stage fixture requirement')
    data(await adminClient.rpc('review_accreditation_requirement', { p_requirement_id: requirement.id, p_status: 'approved', p_notes: null }), 'real admin approves fixture requirement')
  }
  checks.push('All required synthetic documents exist and were reviewed by the signed administrator')

  step = 'exercise account activation boundary'
  const link = await adminClient.rpc('admin_link_employer_account', { p_employer_id: companies[0].id, p_email: accounts[1].email })
  const approval = await adminClient.rpc('admin_approve_employer', { p_employer_id: companies[1].id })
  if (phase === 'baseline') {
    data(link, 'baseline link'); data(approval, 'baseline approval')
    ok((await profile(accounts[1].id)).is_active && (await profile(accounts[2].id)).is_active, 'Baseline implicit account reactivation not reproduced')
    ok((await company(companies[1].id)).registration_status === 'approved', 'Baseline company approval not reproduced')
    checks.push('Both actual signed DEV company decisions silently reactivated disabled fixture accounts')
  } else {
    ok(link.error?.code === '42501' && approval.error?.code === '42501', 'Disabled-account decisions were not denied')
    ok(!(await profile(accounts[1].id)).is_active && !(await profile(accounts[2].id)).is_active, 'Disabled fixture account changed')
    ok((await company(companies[0].id)).registered_user_id === null, 'Denied link changed company ownership')
    ok((await company(companies[1].id)).registration_status === 'pending', 'Denied approval changed company status')
    ok(data(await fixture.from('employer_accreditation').select('status').eq('id', accreditation.id).single(), 'read denied accreditation').status === 'pending', 'Denied approval changed accreditation')
    checks.push('Both signed DEV decisions deny disabled accounts atomically and preserve company/accreditation state')
    if (phase === 'reviewed') {
      data(await adminClient.rpc('admin_reactivate_employer_account', { p_employer_id: companies[0].id, p_email: accounts[1].email, p_reason_code: 'identity_and_access_reviewed' }), 'reviewed unlinked account activation')
      data(await adminClient.rpc('admin_reactivate_employer_account', { p_employer_id: companies[1].id, p_email: null, p_reason_code: 'prior_deactivation_corrected' }), 'reviewed linked account activation')
      const audit = data(await fixture.from('audit_logs').select('user_id,record_id,new_data').eq('action', 'employer_account_reactivated').in('record_id', accounts.slice(1).map(a => a.id)), 'review activation audit')
      ok(audit.length === 2 && audit.every(row => row.user_id === accounts[0].id && row.new_data.employer_id && ['identity_and_access_reviewed', 'prior_deactivation_corrected'].includes(row.new_data.reason_code)), 'Reviewed activation audit missing')
      ok(!JSON.stringify(audit).includes(accounts[1].email) && !JSON.stringify(audit).includes(accounts[2].email), 'Activation audit includes account contact')
      ok((await company(companies[0].id)).registered_user_id === null && (await company(companies[1].id)).registration_status === 'pending', 'Activation silently linked or approved a company')
      checks.push('New reviewed activation RPC requires actual AAL2 admin, records only reason categories, and neither links nor approves a company')
    } else {
      for (const account of accounts.slice(1)) {
        const row = data(await adminClient.from('profiles').update({ is_active: true }).eq('id', account.id).select('id,is_active').single(), 'explicit signed admin account activation')
        ok(row.id === account.id && row.is_active, 'Explicit activation not persisted')
      }
    }
    data(await adminClient.rpc('admin_link_employer_account', { p_employer_id: companies[0].id, p_email: accounts[1].email }), 'link after explicit activation')
    data(await adminClient.rpc('admin_approve_employer', { p_employer_id: companies[1].id }), 'approve after explicit activation')
    ok((await profile(accounts[1].id)).role === 'employer' && (await profile(accounts[2].id)).role === 'employer', 'Employer roles missing after explicit activation')
    ok((await company(companies[1].id)).registration_status === 'approved', 'Approval after activation missing')
    checks.push('Separate signed admin activation enables ordinary link and approval; company decisions assign employer role without changing activation')
  }
  passed = true
} catch (error) { console.error(`Synthetic activation ${phase} failed at ${step}: ${error.message}`) }
finally {
  try {
    for (const account of accounts) {
      const user = data(await fixture.auth.admin.getUserById(account.id), 'verify exact cleanup user').user
      ok(user.email === account.email && user.user_metadata.test_run === run, 'Refusing non-fixture account cleanup')
    }
    for (const item of companies) {
      const row = data(await fixture.from('employers').select('company_name').eq('id', item.id).single(), 'verify exact cleanup company')
      ok(row.company_name === item.company_name && row.company_name.includes(run), 'Refusing non-fixture company cleanup')
    }
    if (adminClient) data(await adminClient.auth.signOut({ scope: 'global' }), 'revoke fixture admin session')
    if (files.length) data(await fixture.storage.from('accreditation-documents').remove(files), 'remove exact synthetic PDF objects')
    for (const item of companies) {
      const acc = data(await fixture.from('employer_accreditation').select('id,employer_accreditation_requirements(id)').eq('employer_id', item.id), 'capture exact fixture rows')
      for (const row of acc) ids.push(row.id, ...row.employer_accreditation_requirements.map(r => r.id))
      data(await fixture.from('employers').delete().eq('id', item.id).eq('company_name', item.company_name), 'delete exact fixture company')
    }
    for (const account of accounts) data(await fixture.auth.admin.deleteUser(account.id), 'delete exact fixture Auth user')
    if (ids.length) data(await fixture.from('audit_logs').delete().in('record_id', [...new Set(ids)]), 'delete exact fixture audit rows')
    for (const [table, values] of [['profiles', accounts.map(a => a.id)], ['employers', companies.map(c => c.id)]]) {
      if (values.length) ok(!data(await fixture.from(table).select('id').in('id', values), `verify ${table} cleanup`).length, `Synthetic ${table} remains`)
    }
    for (const item of companies) ok(!data(await fixture.from('employer_accreditation').select('id').eq('employer_id', item.id), 'verify accreditation cleanup').length, 'Synthetic accreditation remains')
    for (const item of companies) ok(!data(await fixture.storage.from('accreditation-documents').list(item.id, { limit: 100 }), 'verify storage cleanup').length, 'Synthetic PDF remains')
    cleanup = true
  } catch (error) { passed = false; console.error(`Synthetic activation cleanup incomplete: ${error.message}`) }
  const receipt = { observed_at: new Date().toISOString(), verified_project_ref: 'cdmkzzmaswwiryymtycn', phase, run_id: run,
    passed: passed && cleanup, cleanup_complete: cleanup, account_ids: accounts.map(a => a.id), fixture_ids: [...new Set(ids)],
    storage_paths: files, checks, requests, limitations: ['Hosted accounts use real password/email identities and signed admin TOTP; no Google identity fabricated', 'Service access only prepares, inspects and cleans exact synthetic fixtures', 'No genuine account or personal record changed'] }
  const folder = new URL(phase === 'reviewed' ? '../../artifacts/employer-activation-review-20261019/' : '../../artifacts/employer-activation-20261019/', import.meta.url)
  await mkdir(folder, { recursive: true })
  await writeFile(new URL(`native-${phase}.json`, folder), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify({ phase, passed: receipt.passed, checks: checks.length, requests: requests.length, cleanup_complete: cleanup }))
  process.exitCode = receipt.passed ? 0 : 1
}
