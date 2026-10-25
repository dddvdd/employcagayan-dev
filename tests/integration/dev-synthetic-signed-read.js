// DEV-only signed-reader acceptance for the already classified fictional pair.
// Creates one disposable fictional Partner identity; never touches the case actor.
import { randomBytes, randomUUID } from 'node:crypto'
import { devClients, DEV_URL } from '../../scripts/lib/devClients.js'
import { totp } from '../support/totp.js'

const vacancyId = '59c5fd81-7f65-48a0-8329-eff9e5419b58'
const participantId = '4af4253a-a571-494d-9641-eb66dcac834f'
const employerId = '3b86f95d-54de-4e2b-9779-fb75af4154ac'
const role = process.env.EMPLOY_SYNTHETIC_READER_ROLE || 'staff'
if (!['staff', 'admin'].includes(role)) throw Error('Unsupported fictional reader role')
if (process.env.EMPLOY_RUN_SYNTHETIC_SIGNED_READ !== '1' ||
    process.env.EMPLOY_VERIFIED_DEV_URL !== DEV_URL) {
  throw Error('Independently verified DEV-only opt-in required')
}
const { operator, normal, requests } = await devClients()
const run = randomUUID()
const email = `dev-synthetic-reader-${run}@example.invalid`
const password = `${randomBytes(24).toString('base64url')}!aA9`
const actor = normal()
let userId = null
let result = null
let failure = null
let cleanupFailure = null
const data = (response, label) => {
  if (response.error) throw Error(`${label} failed (${response.error.code || response.error.status || 'request'})`)
  return response.data
}
const hidden = (response, label) => {
  if (response.error || !Array.isArray(response.data) || response.data.length !== 0) {
    throw Error(`${label} exposed the classified fixture`)
  }
}
const denied = (response, label) => {
  if (response.error?.code !== '42501') throw Error(`${label} was not denied by authorization`)
}
const claims = token => {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')) }
  catch { return null }
}

try {
  const created = data(await operator.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { test_run: run, full_name: 'Fictional DEV signed reader' },
  }), 'fixture identity creation').user
  userId = created.id
  const initial = data(await operator.from('profiles').select('role').eq('id', userId).single(), 'initial role')
  if (initial.role !== 'applicant') throw Error('Signup metadata granted authority')
  data(await operator.from('profiles').update({ role }).eq('id', userId), 'fixture Partner assignment')
  data(await actor.auth.signInWithPassword({ email, password }), 'signed fixture login')
  const factor = data(await actor.auth.mfa.enroll({
    factorType: 'totp', friendlyName: `DEV synthetic signed reader ${run}`,
  }), 'fixture TOTP enrollment')
  const challenge = data(await actor.auth.mfa.challenge({ factorId: factor.id }), 'fixture TOTP challenge')
  data(await actor.auth.mfa.verify({
    factorId: factor.id, challengeId: challenge.id, code: totp(factor.totp.secret),
  }), 'fixture TOTP verification')
  const session = data(await actor.auth.getSession(), 'signed fixture session').session
  if (claims(session?.access_token)?.aal !== 'aal2') throw Error('Signed AAL2 missing')
  const account = data(await actor.rpc('auth_account_bootstrap'), 'Partner bootstrap')
  if (account?.role !== role || account?.mfa_satisfied !== true) throw Error('Partner authority not verified')

  const listing = data(await actor.rpc('list_platform_vacancies', { p_search: 'PESO DEV TEST' }), 'signed vacancy list')
  if (!Array.isArray(listing) || listing.some(row => row.id === vacancyId)) throw Error('Classified vacancy appeared in signed listing')
  const detail = await actor.rpc('get_platform_vacancy', { p_vacancy_definition_id: vacancyId })
  if (detail.error || detail.data !== null) throw Error('Signed vacancy detail exposed the classified fixture')
  hidden(await actor.from('vacancy_definitions').select('id').eq('id', vacancyId), 'direct vacancy read')
  hidden(await actor.from('jobseeker_profiles').select('participant_id').eq('participant_id', participantId), 'direct profile read')
  hidden(await actor.from('employers').select('id').eq('id', employerId), 'direct employer read')
  denied(await actor.rpc('get_jobseeker_match_profile', {
    p_jobseeker_profile_id: participantId,
  }), 'jobseeker match snapshot')
  denied(await actor.rpc('get_vacancy_match_profile', {
    p_vacancy_definition_id: vacancyId,
  }), 'vacancy match snapshot')
  const vacancies = data(await actor.rpc('get_vacancies_match_profiles'), 'bulk vacancy match snapshots')
  if (!Array.isArray(vacancies) || vacancies.some(row => row.id === vacancyId)) {
    throw Error('Bulk matching exposed the classified vacancy')
  }
  const pool = await actor.rpc('get_vacancy_candidate_match_profiles', {
    p_vacancy_definition_id: vacancyId,
  })
  if (role === 'staff') denied(pool, 'staff candidate pool without event scope')
  else hidden(pool, 'admin candidate pool for fictional vacancy')
  const pairInput = [{ jobseeker_profile_id: participantId, vacancy_id: vacancyId }]
  denied(await actor.rpc('get_match_keyword_signals', { p_pairs: pairInput }), 'keyword signals')
  denied(await actor.rpc('get_bound_match_signals', { p_pairs: [{
    ...pairInput[0], jobseeker_source_hash: '0'.repeat(64), vacancy_source_hash: '0'.repeat(64),
    jobseeker_embedding_version: 'jobseeker-semantic-v2',
    vacancy_embedding_version: 'vacancy-semantic-v2',
  }] }), 'source-bound signals')
  const pair = await actor.rpc('get_pair_semantic_similarity', {
    p_jobseeker_profile_id: participantId, p_vacancy_definition_id: vacancyId,
  })
  denied(pair, 'semantic pair')
  denied(await actor.rpc('get_semantic_similarities', { p_pairs: pairInput }), 'semantic batch')
  let officialReportCountsExcluded = null
  if (role === 'admin') {
    const sourceCounts = [
      ['unique_participants', 'participants', 'id', participantId, {}],
      ['unique_jobseekers', 'jobseeker_profiles', 'participant_id', participantId, {}],
      ['unique_vacancy_definitions', 'vacancy_definitions', 'id', vacancyId, {}],
      ['active_approved_employers', 'employers', 'id', employerId,
        { is_active: true, registration_status: 'approved' }],
    ]
    const expected = new Map()
    for (const [metric, table, key, id, filters] of sourceCounts) {
      let all = operator.from(table).select(key, { head: true, count: 'exact' })
      let fixture = operator.from(table).select(key, { head: true, count: 'exact' }).eq(key, id)
      for (const [column, value] of Object.entries(filters)) {
        all = all.eq(column, value)
        fixture = fixture.eq(column, value)
      }
      const [allRows, fixtureRows] = await Promise.all([all, fixture])
      if (allRows.error || fixtureRows.error || fixtureRows.count !== 1) {
        throw Error(`Could not establish ${metric} source count`)
      }
      expected.set(metric, allRows.count - 1)
    }
    const report = data(await actor.rpc('get_employment_intelligence', {
      p_metric_ids: [...expected.keys()],
    }), 'signed official aggregate')
    for (const [metric, count] of expected) {
      const cells = report?.cells?.filter(cell => cell.metric_id === metric)
      if (cells?.length !== 1 || cells[0].status !== 'available' || cells[0].value !== count) {
        throw Error(`${metric} includes the classified fixture or differs from its source count`)
      }
    }
    officialReportCountsExcluded = true
  }
  result = { role, signedAal2: true, classifiedVacancyHidden: true,
    classifiedProfileHidden: true, classifiedEmployerHidden: true,
    matchingSnapshotsHidden: true, keywordAndBoundDenied: true,
    semanticPairAndBatchDenied: true, officialReportCountsExcluded,
    guardedRequests: requests.length }
} catch (error) {
  failure = error
} finally {
  await actor.auth.signOut().catch(() => {})
  if (userId) {
    const check = await operator.auth.admin.getUserById(userId)
    if (check.error || check.data?.user?.email !== email ||
        check.data.user.user_metadata?.test_run !== run) {
      cleanupFailure = Error('Fixture cleanup refused: exact identity did not match')
    } else {
      const removed = await operator.auth.admin.deleteUser(userId)
      if (removed.error) cleanupFailure = Error(`Fixture cleanup failed (${removed.error.code || removed.error.status || 'request'})`)
    }
  }
}
if (cleanupFailure) throw cleanupFailure
if (failure) throw failure
process.stdout.write(JSON.stringify(result) + '\n')
