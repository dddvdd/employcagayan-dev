import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { totp } from '../support/totp.js'

const expected = 'https://cdmkzzmaswwiryymtycn.supabase.co', ref = 'cdmkzzmaswwiryymtycn'
const phase = process.env.EMPLOY_RECRUITMENT_PROVENANCE_PHASE
if (process.env.EMPLOY_RUN_RECRUITMENT_PROVENANCE_TESTS !== '1' || process.env.EMPLOY_VERIFIED_DEV_URL !== expected || !['baseline', 'verify'].includes(phase)) throw Error('Verified DEV opt-in required')
const env = parseEnv(await readFile(new URL('../../.env.test', import.meta.url), 'utf8'))
if (env.VITE_SUPABASE_URL !== expected) throw Error('DEV configuration mismatch')
const claims = token => { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')) } catch { return null } }
const serviceClaims = claims(env.SUPABASE_SERVICE_ROLE_KEY)
if (serviceClaims && (serviceClaims.role !== 'service_role' || serviceClaims.ref !== ref)) throw Error('Fixture credential mismatch')
const run = randomUUID(), accounts = [], actors = [], companies = [], events = [], cases = [], ids = [], requests = [], checks = [], closureObservations = []
let freeOffering = null, foreignDefinition = null, foreignOffering = null, passed = false, cleanup = false, step = 'configuration'
const ok = (value, label) => { if (!value) throw Error(label) }
const data = (result, label) => { ok(!result.error, label + ' failed (' + (result.error?.code || result.error?.status || 'request') + ')'); return result.data }
const fetchFor = (mode, index) => async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  ok(url.origin === expected && url.protocol === 'https:' && process.env.EMPLOY_VERIFIED_DEV_URL === expected, 'Outbound DEV mismatch')
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
  const jwt = claims(headers.get('authorization')?.replace(/^Bearer /, '') || '')
  if (mode === 'actor' && url.pathname.startsWith('/rest/')) ok(jwt?.role === 'authenticated' && jwt.iss === expected + '/auth/v1' && jwt.sub === accounts[index]?.id && /^[0-9a-f-]{36}$/.test(jwt.session_id), 'Actual signed fixture actor required')
  const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) })
  requests.push({ mode, path: url.pathname, method: init?.method || 'GET', status: response.status })
  return response
}
const client = (mode, index, token = null) => createClient(expected, mode === 'fixture' ? env.SUPABASE_SERVICE_ROLE_KEY : env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: fetchFor(mode, index), ...(token ? { headers: { Authorization: 'Bearer ' + token } } : {}) },
})
const fixture = client('fixture'), anonymous = client('anonymous')
const insert = async (table, record) => {
  const row = data(await fixture.from(table).insert(record).select().single(), 'prepare ' + table)
  if (row.id) ids.push(row.id)
  return row
}
const rejected = async (request, code) => { const result = await request; ok(result.error?.code === code, 'Expected rejection ' + code + ', received ' + (result.error?.code || 'success')) }
const enroll = async index => {
  const actor = client('actor', index); actors.push(actor)
  data(await actor.auth.signInWithPassword({ email: accounts[index].email, password: accounts[index].password }), 'actual password login')
  await rejected(actor.rpc('app_current_user_role_text'), '42501')
  const factor = data(await actor.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Synthetic recruitment history' }), 'TOTP enrollment')
  const challenge = data(await actor.auth.mfa.challenge({ factorId: factor.id }), 'TOTP challenge')
  data(await actor.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: totp(factor.totp.secret) }), 'actual TOTP verification')
  const session = data(await actor.auth.getSession(), 'actual AAL2 session').session
  ok(claims(session.access_token)?.aal === 'aal2', 'Actual AAL2 required')
  return { actor, token: session.access_token }
}
const remaining = async (table, id) => data(await fixture.from(table).select('id').eq('id', id), 'verify ' + table).length
try {
  step = 'prepare isolated actors and companies'
  for (let index = 0; index < 2; index++) {
    const email = 'dev-provenance-' + run + '-' + index + '@example.invalid', password = randomBytes(24).toString('base64url') + '!aA9'
    const user = data(await fixture.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run: run } }), 'fixture Auth account').user
    accounts.push({ id: user.id, email, password }); ids.push(user.id)
    data(await fixture.from('profiles').update({ role: index ? 'admin' : 'employer' }).eq('id', user.id), 'fixture canonical role')
    companies.push(await insert('employers', { company_name: 'Synthetic provenance ' + run + ' ' + index, registered_user_id: index ? null : user.id, registration_status: 'approved', is_active: true }))
  }
  for (let index = 0; index < 3; index++) events.push(await insert('events', { event_name: 'Synthetic provenance ' + run + ' ' + index, event_date: new Date().toISOString().slice(0, 10), location: 'Tuguegarao City', status: 'ongoing' }))
  step = 'prepare exact synthetic recruitment cases'
  for (let index = 0; index < 2; index++) {
    // Add each parent to the cleanup ledger immediately, including partial setup failures.
    const entry = {}; cases.push(entry)
    entry.participant = await insert('participants', {})
    entry.profile = await insert('jobseeker_profiles', { participant_id: entry.participant.id, first_name: 'Synthetic', last_name: run, email: 'case-' + index + '-' + run + '@example.invalid', birthdate: '2000-01-01', data_subject_rights_agreed: true })
    entry.registration = await insert('event_participations', { participant_id: entry.participant.id, event_id: events[0].id, check_in_status: 'checked_in', check_in_time: new Date().toISOString() })
    entry.definition = await insert('vacancy_definitions', { employer_id: companies[0].id, company_name: companies[0].company_name, position: 'Synthetic provenance ' + run + ' ' + index, job_description: 'Synthetic test vacancy for preserving recruitment history.', place_of_assignment: 'Tuguegarao City', is_active: true, platform_status: 'published', published_at: new Date().toISOString() })
    entry.offering = await insert('event_vacancies', { event_id: events[0].id, vacancy_definition_id: entry.definition.id, slots_offered: 3 })
    data(await fixture.from('participation_vacancies').insert({ participation_id: entry.registration.id, event_vacancy_id: entry.offering.id, preference_type: 'local' }), 'fixture vacancy preference')
    entry.application = await insert('applications', { participant_id: entry.participant.id, vacancy_definition_id: entry.definition.id, registrant_id: entry.registration.id, event_vacancy_id: entry.offering.id, application_status: 'applied', source: 'event' })
  }
  freeOffering = await insert('event_vacancies', { event_id: events[1].id, vacancy_definition_id: cases[0].definition.id })
  foreignDefinition = await insert('vacancy_definitions', { employer_id: companies[1].id, company_name: companies[1].company_name, position: 'Synthetic foreign provenance ' + run, is_active: true })
  foreignOffering = await insert('event_vacancies', { event_id: events[0].id, vacancy_definition_id: foreignDefinition.id })
  const owner = await enroll(0), admin = await enroll(1), first = cases[0], second = cases[1]
  checks.push('Real password AAL1 requests are denied; owner/admin acceptance uses signed Auth sessions with verified TOTP AAL2')
  const interview = data(await admin.actor.rpc('record_interview_result', { p_registrant_id: second.registration.id, p_event_id: events[0].id, p_employer_id: companies[0].id, p_vacancy_definition_id: second.definition.id, p_status: 'qualified', p_application_id: second.application.id }), 'actual interview recording')
  second.interview = interview; ids.push(interview.id)
  step = 'offering identity and indirect deletion'
  if (phase === 'baseline') {
    data(await owner.actor.from('event_vacancies').update({ event_id: events[2].id }).eq('id', first.offering.id).select().single(), 'baseline used offering move')
    await rejected(owner.actor.rpc('update_application_status', { p_application_id: first.application.id, p_new_status: 'shortlisted' }), '23514')
    checks.push('Actual owner can move a used offering and strand its otherwise valid application review')
    await rejected(owner.actor.from('applications').delete().eq('id', first.application.id), '42501')
    data(await owner.actor.from('event_vacancies').delete().eq('id', first.offering.id).select().single(), 'baseline indirect offering removal')
    ok(await remaining('applications', first.application.id) === 0, 'Baseline application did not cascade')
    ok(!data(await fixture.from('participation_vacancies').select('participation_id').eq('participation_id', first.registration.id), 'baseline preference cascade').length, 'Baseline preference remains')
    checks.push('Actual owner cannot delete an application directly but can erase it and its preference through offering removal')
    data(await admin.actor.from('event_participations').delete().eq('id', second.registration.id).select().single(), 'baseline registration removal')
    ok(await remaining('applications', second.application.id) === 0 && await remaining('interview_logs', interview.id) === 0, 'Baseline case history did not cascade')
    checks.push('Actual administrator registration removal cascades its application and recorded interview')
  } else {
    await rejected(owner.actor.from('event_vacancies').update({ event_id: events[2].id }).eq('id', first.offering.id), '23503')
    await rejected(owner.actor.from('event_vacancies').delete().eq('id', first.offering.id), '23503')
    await rejected(owner.actor.from('applications').delete().eq('id', first.application.id), '42501')
    await rejected(admin.actor.from('event_participations').delete().eq('id', second.registration.id), '23503')
    await rejected(admin.actor.from('event_participations').update({ event_id: events[1].id }).eq('id', second.registration.id), '23503')
    await rejected(admin.actor.from('event_participations').update({ participant_id: first.participant.id }).eq('id', second.registration.id), '23503')
    await rejected(admin.actor.from('vacancy_definitions').update({ employer_id: companies[1].id }).eq('id', first.definition.id), '23503')
    await rejected(admin.actor.from('vacancy_definitions').delete().eq('id', second.definition.id), '23503')
    ok(await remaining('applications', first.application.id) === 1 && await remaining('applications', second.application.id) === 1 && await remaining('interview_logs', interview.id) === 1, 'Rejected operation changed history')
    checks.push('Signed owner/admin cannot delete or reassign linked offerings, registrations or vacancy ownership; applications/interview remain intact')
    step = 'valid edits and unused offering behavior'
    data(await owner.actor.from('event_vacancies').update({ slots_offered: 5, notes: 'Synthetic harmless edit' }).eq('id', first.offering.id).select().single(), 'ordinary offering edit')
    data(await owner.actor.from('event_vacancies').update({ event_id: events[2].id }).eq('id', freeOffering.id).select().single(), 'unlinked offering move')
    data(await owner.actor.from('event_vacancies').delete().eq('id', freeOffering.id).select().single(), 'unlinked offering removal')
    checks.push('Owner can still edit linked offering metadata and move/remove an unused offering')
    step = 'authorized closure and continuing case review'
    const close = () => owner.actor.rpc('close_event_offering_applications', { p_event_vacancy_id: first.offering.id })
    const closed = data(await close(), 'owner application closure'), repeated = data(await close(), 'repeat application closure')
    closureObservations.push({ deadline: closed.application_deadline, repeated_deadline: repeated.application_deadline, local_observed_at: new Date().toISOString() })
    // The local Windows clock is not authoritative for a database deadline.
    // SQL coverage checks deadline <= statement_timestamp(); native coverage checks the RPC result and idempotence.
    ok(closed.status === 'closed' && Number.isFinite(Date.parse(closed.application_deadline)), 'Closure response must contain a valid server-generated deadline')
    ok(closed.application_deadline === repeated.application_deadline, 'Repeated closure must preserve the original deadline')
    const audit = data(await fixture.from('audit_logs').select('old_data,new_data').eq('record_id', first.offering.id).eq('action', 'event_offering_deadline_changed'), 'closure audit')
    ok(audit.length === 1 && Object.keys(audit[0].new_data).join() === 'application_deadline', 'Closure audit not minimized/idempotent')
    data(await owner.actor.rpc('update_application_status', { p_application_id: first.application.id, p_new_status: 'shortlisted' }), 'review after closure')
    await rejected(admin.actor.rpc('submit_event_application', { p_event_participation_id: second.registration.id, p_event_vacancy_id: first.offering.id }), '22023')
    await rejected(owner.actor.rpc('close_event_offering_applications', { p_event_vacancy_id: foreignOffering.id }), '42501')
    data(await admin.actor.rpc('close_event_offering_applications', { p_event_vacancy_id: foreignOffering.id }), 'administrator closure')
    ok(!!(await anonymous.rpc('close_event_offering_applications', { p_event_vacancy_id: first.offering.id })).error, 'Anonymous closure accepted')
    data(await owner.actor.auth.signOut({ scope: 'global' }), 'revoke actual owner session')
    await rejected(client('actor', 0, owner.token).rpc('close_event_offering_applications', { p_event_vacancy_id: first.offering.id }), '42501')
    checks.push('Closure is scoped, audited and idempotent; existing review succeeds, new applications/foreign-company/anonymous/revoked-session closure are denied')
  }
  passed = true
} catch (error) { console.error('Synthetic recruitment provenance ' + phase + ' failed at ' + step + ': ' + error.message) }
finally {
  try {
    for (const account of accounts) {
      const user = data(await fixture.auth.admin.getUserById(account.id), 'verify cleanup account').user
      ok(user.email === account.email && user.user_metadata.test_run === run, 'Refusing non-fixture account cleanup')
    }
    for (const company of companies) {
      const row = data(await fixture.from('employers').select('company_name').eq('id', company.id).single(), 'verify cleanup company')
      ok(row.company_name === company.company_name && row.company_name.includes(run), 'Refusing non-fixture company cleanup')
    }
    for (const event of events) {
      const row = data(await fixture.from('events').select('event_name').eq('id', event.id).single(), 'verify cleanup event')
      ok(row.event_name === event.event_name && row.event_name.includes(run), 'Refusing non-fixture event cleanup')
    }
    // Verify each participant by its exact created profile before any case cleanup.
    for (const entry of cases) if (entry.profile) {
      const row = data(await fixture.from('jobseeker_profiles').select('last_name,email').eq('participant_id', entry.participant.id).single(), 'verify cleanup participant')
      ok(row.last_name === run && row.email === entry.profile.email, 'Refusing non-fixture participant cleanup')
    }
    for (const actor of actors) data(await actor.auth.signOut({ scope: 'global' }), 'revoke fixture session')
    // Child-first, exact-scope cleanup. Never disable the history guards.
    for (const entry of cases) {
      if (entry.registration) {
        const logs = data(await fixture.from('interview_logs').select('id').eq('registrant_id', entry.registration.id), 'fixture interview scope')
        ids.push(...logs.map(row => row.id))
        if (logs.length) data(await fixture.from('interview_logs').delete().in('id', logs.map(row => row.id)).eq('registrant_id', entry.registration.id), 'cleanup fixture interviews')
      }
      if (entry.participant) {
        const rows = data(await fixture.from('applications').select('id').eq('participant_id', entry.participant.id), 'fixture application scope')
        ids.push(...rows.map(row => row.id))
        if (rows.length) data(await fixture.from('applications').delete().in('id', rows.map(row => row.id)).eq('participant_id', entry.participant.id), 'cleanup fixture applications')
      }
      if (entry.registration) {
        data(await fixture.from('participation_vacancies').delete().eq('participation_id', entry.registration.id), 'cleanup fixture selections')
        data(await fixture.from('event_participations').delete().eq('id', entry.registration.id).eq('participant_id', entry.participant.id), 'cleanup fixture registration')
      }
    }
    for (const offering of [...cases.map(entry => entry.offering), freeOffering, foreignOffering].filter(Boolean)) data(await fixture.from('event_vacancies').delete().eq('id', offering.id).eq('vacancy_definition_id', offering.vacancy_definition_id), 'cleanup fixture offering')
    for (const definition of [...cases.map(entry => entry.definition), foreignDefinition].filter(Boolean)) {
      data(await fixture.from('vacancy_history').delete().eq('vacancy_definition_id', definition.id), 'cleanup fixture vacancy history')
      data(await fixture.from('vacancy_definitions').delete().eq('id', definition.id).eq('employer_id', definition.employer_id), 'cleanup fixture vacancy')
    }
    for (const entry of cases) if (entry.participant) {
      data(await fixture.from('jobseeker_profiles').delete().eq('participant_id', entry.participant.id), 'cleanup fixture jobseeker profile')
      data(await fixture.from('participants').delete().eq('id', entry.participant.id).is('auth_user_id', null), 'cleanup fixture participant')
    }
    for (const company of companies) data(await fixture.from('employers').delete().eq('id', company.id).eq('company_name', company.company_name), 'cleanup fixture company')
    for (const event of events) data(await fixture.from('events').delete().eq('id', event.id).eq('event_name', event.event_name), 'cleanup fixture event')
    for (const account of accounts) data(await fixture.auth.admin.deleteUser(account.id), 'cleanup fixture Auth user')
    if (ids.length) {
      data(await fixture.from('audit_logs').delete().in('record_id', [...new Set(ids)]), 'cleanup exact synthetic audit records')
      ok(!data(await fixture.from('audit_logs').select('id').in('record_id', [...new Set(ids)]), 'verify synthetic audit cleanup').length, 'Synthetic audit remains')
    }
    for (const entry of cases) if (entry.participant) ok(!data(await fixture.from('jobseeker_profiles').select('participant_id').eq('participant_id', entry.participant.id), 'verify jobseeker profile cleanup').length, 'Synthetic profile remains')
    for (const [table, values] of [['profiles', accounts], ['participants', cases.map(entry => entry.participant)], ['events', events], ['employers', companies], ['event_participations', cases.map(entry => entry.registration)], ['event_vacancies', [...cases.map(entry => entry.offering), freeOffering, foreignOffering]], ['applications', cases.map(entry => entry.application)], ['interview_logs', cases.map(entry => entry.interview)]]) {
      const valuesToCheck = values.filter(Boolean).map(row => row.id)
      if (valuesToCheck.length) ok(!data(await fixture.from(table).select('id').in('id', valuesToCheck), 'verify ' + table + ' cleanup').length, 'Synthetic records remain in ' + table)
    }
    cleanup = true
  } catch (error) { passed = false; console.error('Synthetic recruitment cleanup incomplete: ' + error.message) }
  const evidence = { phase, verified_project_ref: ref, observed_at: new Date().toISOString(), run_id: run, passed: passed && cleanup, cleanup_complete: cleanup,
    account_ids: accounts.map(row => row.id), company_ids: companies.map(row => row.id), event_ids: events.map(row => row.id), fixture_ids: [...new Set(ids)], checks, closure_observations: closureObservations, requests,
    limitations: ['No genuine personal records or fabricated hosted Google identity', 'Fixture service access only prepares/verifies/cleans exact isolated records; ordinary acceptance uses actual signed actors', 'Clinical/returning-worker boundary coverage is local presence-only; no native clinical workflow acceptance', 'No concurrency claim from this sequential HTTP test'] }
  await writeFile(new URL('../../artifacts/recruitment-provenance-20261016/native-' + phase + '.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ phase, passed: evidence.passed, checks: checks.length, requests: requests.length, cleanup_complete: cleanup }))
  process.exitCode = evidence.passed ? 0 : 1
}
