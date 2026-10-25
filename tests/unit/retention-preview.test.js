import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, mkdtempSync, writeFileSync, existsSync, unlinkSync, rmdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {previewRetention, requestRetentionAction, addCalendarMonths, renderRetentionPreview, REQUIRED_APPROVALS} from '../../scripts/lib/retention-preview.mjs'
const at = day => day + 'T00:00:00.000Z'
const row = (alias, category, patch = {}) => ({
 alias: 's-' + alias, category, state: 'active', created_at: at('2018-01-01'), linked_records: [], holds: [], ...patch,
})
const data = (records, asOf = at('2026-10-15')) => ({version: 'retention-preview-v1', purpose: 'synthetic_only', as_of: asOf, records})
const result = input => previewRetention(input).records[0]
const find = (report, alias) => report.records.find(item => item.alias === 's-' + alias)
test('synthetic fixture always has inactive policy, missing approvals and no disposal authority', () => {
 const fixture = JSON.parse(readFileSync(new URL('../../governance/retention/synthetic-cases.json', import.meta.url), 'utf8'))
 const report = previewRetention(fixture)
 assert.equal(report.records.length, 18)
 assert.equal(report.policy_status, 'proposed_inactive')
 assert.equal(report.read_only, true)
 assert.equal(report.live_adapter, false)
 for (const record of report.records) {
  assert.equal(record.disposition_authorized, false)
  assert.equal(record.disposal_enabled, false)
  assert.deepEqual(record.missing_approvals, REQUIRED_APPROVALS)
 }
})
test('24 calendar months proposes inactivity at exact boundary without deleting or closing cases', () => {
 const record = row('profile', 'profile', {meaningful_service_at: at('2024-10-15')})
 assert.equal(result(data([record], at('2026-10-14'))).proposed_state, 'active')
 const boundary = result(data([record]))
 assert.equal(boundary.proposed_state, 'inactive')
 assert.equal(boundary.review_due, false)
 assert.equal(boundary.proposed_review_at, at('2029-10-15'))
})
test('explicit owner confirmation is meaningful but generic updated_at is rejected', () => {
 const record = row('profile', 'profile', {meaningful_service_at: at('2019-01-01'), profile_confirmed_at: at('2026-10-01')})
 assert.equal(result(data([record])).proposed_review_at, at('2031-10-01'))
 assert.equal(result(data([record])).proposed_state, 'active')
 assert.throws(() => previewRetention(data([{...record, updated_at: at('2026-10-15')}])), /Invalid synthetic/)
})
test('calendar clocks clamp leap day and month end; exact review boundary counts', () => {
 assert.equal(addCalendarMonths(at('2020-02-29'), 12), at('2021-02-28'))
 assert.equal(addCalendarMonths(at('2024-01-31'), 1), at('2024-02-29'))
 const record = row('closed', 'case', {case_status: 'closed', closed_at: at('2020-10-15')})
 assert.equal(result(data([record], at('2025-10-14'))).review_due, false)
 assert.equal(result(data([record], at('2025-10-15'))).review_due, true)
})
test('missing meaningful activity never falls back to creation or assumed login', () => {
 const record = result(data([row('profile', 'profile')]))
 assert.equal(record.proposed_review_at, null)
 assert.equal(record.review_due, false)
 assert.ok(record.blockers.includes('missing_meaningful_service_trigger'))
})
test('status alone and vacancy closure cannot stand in for final case closure', () => {
 const missing = result(data([row('case', 'case', {case_status: 'closed'})]))
 assert.equal(missing.proposed_review_at, null)
 assert.ok(missing.blockers.includes('missing_final_closure_trigger'))
 const open = result(data([row('case', 'case', {case_status: 'open', closed_at: at('2019-01-01')})]))
 assert.equal(open.proposed_review_at, null)
 assert.ok(open.blockers.includes('case_not_confirmed_closed'))
})
test('latest linked case closure extends profile, resume and derived retention through one-sided links', () => {
 const records = [
  row('profile', 'profile', {meaningful_service_at: at('2018-01-01'), linked_records: ['s-case-a', 's-case-b', 's-resume', 's-vector']}),
  row('case-a', 'case', {case_status: 'closed', closed_at: at('2020-01-01')}),
  row('case-b', 'case', {case_status: 'closed', closed_at: at('2025-10-01')}),
  row('resume', 'resume', {referenced: false, unreferenced_at: at('2020-01-01')}),
  row('vector', 'embedding'),
 ]
 const report = previewRetention(data(records))
 for (const key of ['profile', 'resume', 'vector']) assert.equal(find(report, key).proposed_review_at, at('2030-10-01'))
 assert.ok(!find(report, 'vector').blockers.includes('missing_source_dependency'))
 assert.ok(!find(report, 'vector').blockers.includes('source_retention_clock_unknown'))
})
test('open or unknown linked case blocks appraisal for every connected record', () => {
 const report = previewRetention(data([
  row('profile', 'profile', {meaningful_service_at: at('2019-01-01'), linked_records: ['s-case']}),
  row('case', 'case', {case_status: 'unknown'}),
 ]))
 for (const record of report.records) {
  assert.ok(record.blockers.includes('linked_case_open_or_closure_unknown'))
  assert.equal(record.potentially_ready_for_appraisal, false)
 }
})
test('active holds propagate transitively through dependency cycles without mutating inputs', () => {
 const input = data([
  row('a', 'ai_pending', {linked_records: ['s-b'], holds: [{alias: 's-legal', status: 'active'}]}),
  row('b', 'ai_pending', {linked_records: ['s-c']}),
  row('c', 'ai_pending', {linked_records: ['s-a']}),
 ])
 const before = JSON.stringify(input), report = previewRetention(input)
 assert.equal(JSON.stringify(input), before)
 for (const record of report.records) {
  assert.deepEqual(record.holds, ['s-legal'])
  assert.equal(record.proposed_state, 'legal_hold')
  assert.equal(record.potentially_ready_for_appraisal, false)
 }
})
test('claimed hold release without reference stays held; released reference cannot erase legal_hold state', () => {
 const record = row('a', 'ai_pending', {holds: [{alias: 's-hold', status: 'released'}]})
 assert.ok(result(data([record])).blockers.includes('hold_release_authority_missing'))
 record.holds[0].release_reference = 's-release'
 assert.deepEqual(result(data([record])).holds, [])
 record.state = 'legal_hold'
 assert.equal(result(data([record])).proposed_state, 'legal_hold')
 assert.ok(result(data([record])).blockers.includes('hold_state_requires_authorized_transition'))
})
test('unknown dependencies and orphan derived facts cannot be appraised as complete', () => {
 const unknown = result(data([row('vector', 'embedding', {linked_records: ['s-absent']})]))
 assert.ok(unknown.blockers.includes('dependency_inventory_incomplete'))
 assert.ok(unknown.blockers.includes('source_retention_clock_unknown'))
 const orphan = result(data([row('fact', 'qualification')]))
 assert.ok(orphan.blockers.includes('missing_source_dependency'))
 assert.equal(orphan.potentially_ready_for_appraisal, false)
})
test('current resumes are blocked; genuinely unreferenced copy receives proposed 30-day review date', () => {
 const blocked = result(data([row('resume', 'resume', {referenced: true, unreferenced_at: at('2026-09-01')})]))
 assert.equal(blocked.proposed_review_at, null)
 assert.ok(blocked.blockers.includes('resume_not_confirmed_unreferenced'))
 const unreferenced = result(data([row('resume', 'resume', {referenced: false, unreferenced_at: at('2026-09-15')})]))
 assert.equal(unreferenced.proposed_review_at, at('2026-10-15'))
 assert.equal(unreferenced.review_due, true)
 assert.equal(unreferenced.disposal_enabled, false)
})
test('AI clocks distinguish pending 90-day review, reviewed 30-day review and accepted parent facts', () => {
 const report = previewRetention(data([
  row('pending', 'ai_pending', {created_at: at('2026-07-17')}),
  row('reviewed', 'ai_working', {reviewed_at: at('2026-09-15')}),
  row('accepted', 'ai_accepted', {linked_records: ['s-profile']}),
  row('profile', 'profile', {meaningful_service_at: at('2026-01-01')}),
 ]))
 assert.equal(find(report, 'pending').proposed_review_at, at('2026-10-15'))
 assert.equal(find(report, 'reviewed').proposed_review_at, at('2026-10-15'))
 assert.equal(find(report, 'accepted').proposed_review_at, at('2031-01-01'))
})
test('exports and recoverable backups have no invented automatic expiry', () => {
 for (const category of ['export', 'backup']) {
  const record = result(data([row('copy', category)]))
  assert.equal(record.proposed_review_at, null)
  assert.equal(record.review_due, false)
  assert.equal(record.potentially_ready_for_appraisal, false)
  assert.ok(record.blockers.length)
 }
})
test('restricted records and claimed disposition approvals never gain execution authority', () => {
 const report = previewRetention(data([
  row('restricted', 'profile', {state: 'restricted', meaningful_service_at: at('2019-01-01')}),
  row('claimed', 'ai_pending', {state: 'approved_for_disposition'}),
 ]))
 assert.equal(find(report, 'restricted').proposed_state, 'restricted')
 assert.equal(find(report, 'restricted').potentially_ready_for_appraisal, false)
 assert.equal(find(report, 'claimed').proposed_state, 'under_review')
 assert.ok(find(report, 'claimed').blockers.includes('unverified_disposition_state_claim'))
})
test('all disposal/approval actions fail even with forged admin, policy or written-authority claims', () => {
 for (const action of ['delete', 'dispose', 'approve', 'schedule', 'release_hold', 'execute']) {
  assert.throws(() => requestRetentionAction(action, {role: 'admin', aal: 'aal2', approved: true, authority: 's-authority'}),
   error => error.code === 'RETENTION_DISPOSAL_DISABLED')
 }
 assert.equal(requestRetentionAction('preview', data([])).disposal_enabled, false)
 assert.throws(() => previewRetention({...data([]), policy_approved: true}), /Invalid synthetic/)
})
test('metadata rejects personal text, actual-purpose labels, malformed dates, duplicate and oversized inputs', () => {
 const good = row('a', 'ai_pending')
 for (const field of ['full_name', 'email', 'resume_path', 'source_text', 'notes', 'provider_token', 'raw_data']) {
  assert.throws(() => previewRetention(data([{...good, [field]: 'PRIVATE_SENTINEL'}])), /Invalid synthetic/)
 }
 assert.throws(() => previewRetention({...data([]), purpose: 'real_records'}), /Invalid synthetic/)
 assert.throws(() => previewRetention(data([{...good, created_at: at('2026-02-30')}])), /Invalid synthetic/)
 assert.throws(() => previewRetention(data([{...good, reviewed_at: at('2026-10-16')}])), /Invalid synthetic/)
 assert.throws(() => previewRetention(data([{...good, reviewed_at: at('2017-01-01')}])), /Invalid synthetic/)
 assert.throws(() => previewRetention(data([good, good])), /Invalid synthetic/)
 assert.throws(() => previewRetention(data(Array.from({length: 1001}, (_, i) => row('r-' + i, 'ai_pending')))), /Invalid synthetic/)
 assert.throws(() => previewRetention(data([{...good, alias: '__proto__'}])), /Invalid synthetic/)
})
test('pure preview is deterministic, order-independent and makes no network call', () => {
 const records = [row('b', 'ai_pending'), row('a', 'ai_pending', {linked_records: ['s-b']})]
 const previous = globalThis.fetch
 globalThis.fetch = () => { throw Error('unexpected network') }
 try { assert.deepEqual(previewRetention(data(records)), previewRetention(data([...records].reverse()))) }
 finally { globalThis.fetch = previous }
})
test('HTML is a static escaped table with no script, external assets, forms or disposal control', () => {
 const report = previewRetention(data([row('a', 'ai_pending')]))
 report.records[0].alias = '<script>alert("x")</script>'
 const html = renderRetentionPreview(report)
 assert.ok(html.includes('&lt;script&gt;'))
 assert.ok(html.includes('Proposed policy is inactive'))
 assert.ok(html.includes('scope="col"'))
 assert.ok(html.includes('default-src'))
 assert.doesNotMatch(html, /<script|<button|<form|<iframe|src=|href=/i)
})
test('actual CLI creates only new synthetic reports, refuses overwrites and masks invalid input', () => {
 const directory = mkdtempSync(path.join(tmpdir(), 'employ-retention-synthetic-'))
 const source = path.join(directory, 'input.json'), target = path.join(directory, 'preview.json')
 const htmlFile = path.join(directory, 'preview.html'), invalid = path.join(directory, 'invalid.json')
 const cli = path.resolve('scripts/preview-retention.mjs')
 const run = args => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'})
 try {
  writeFileSync(source, JSON.stringify(data([row('a', 'ai_pending')])))
  let execution = run(['--input', source, '--output', target])
  assert.equal(execution.status, 0, execution.stderr)
  assert.equal(JSON.parse(readFileSync(target, 'utf8')).disposal_enabled, false)
  const saved = readFileSync(target, 'utf8')
  execution = run(['--input', source, '--output', target])
  assert.equal(execution.status, 1)
  assert.equal(readFileSync(target, 'utf8'), saved)
  assert.equal(run(['--input', source, '--output', source]).status, 1)
  assert.equal(run(['--input', source, '--output', htmlFile, '--format', 'html']).status, 0)
  writeFileSync(invalid, '{"source_text":"PRIVATE_SENTINEL"}')
  execution = run(['--input', invalid, '--output', path.join(directory, 'should-not-exist.json')])
  assert.equal(execution.status, 1)
  assert.doesNotMatch(execution.stdout + execution.stderr, /PRIVATE_SENTINEL/)
  assert.equal(existsSync(path.join(directory, 'should-not-exist.json')), false)
  writeFileSync(invalid, ' '.repeat(2 * 1024 * 1024 + 1))
  assert.equal(run(['--input', invalid, '--output', path.join(directory, 'should-not-exist.json')]).status, 1)
  assert.equal(existsSync(path.join(directory, 'should-not-exist.json')), false)
  assert.equal(run(['--dispose', 'all']).status, 1)
  assert.equal(run(['--help']).status, 0)
 } finally {
  for (const file of [source, target, htmlFile, invalid]) if (existsSync(file)) unlinkSync(file)
  rmdirSync(directory)
 }
})

