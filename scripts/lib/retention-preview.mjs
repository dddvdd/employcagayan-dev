// Offline synthetic governance preview. No database, Storage, provider or deletion adapter.
export const RETENTION_PREVIEW_VERSION = 'retention-preview-v1'
export const RETENTION_POLICY_STATUS = 'proposed_inactive'
export const REQUIRED_APPROVALS = Object.freeze([
 'records_series_mapping', 'approved_trigger_and_period', 'dpo_review',
 'records_officer_appraisal', 'provincial_authority', 'disposition_procedure',
 'scoped_records_disposition_authority', 'propagation_and_restore_plan',
])
export const RETENTION_STATES = Object.freeze([
 'active', 'inactive', 'restricted', 'under_review', 'legal_hold', 'approved_for_disposition',
])
const kinds = [
 'profile', 'case', 'qualification', 'resume', 'ai_working', 'ai_pending', 'ai_accepted',
 'embedding', 'audit', 'operational_log', 'security_log', 'export', 'backup', 'evaluation',
]
const inheritedKinds = new Set(['qualification', 'ai_accepted', 'embedding'])
const dates = [
 'created_at', 'meaningful_service_at', 'profile_confirmed_at', 'closed_at',
 'reviewed_at', 'unreferenced_at', 'purpose_ended_at',
]
const fields = new Set([
 'alias', 'category', 'state', 'case_status', 'referenced', 'linked_records', 'holds', ...dates,
])
const aliasPattern = /^s-[a-z0-9][a-z0-9-]{0,48}$/
const invalid = () => { throw new Error('Invalid synthetic retention metadata') }
function object(value, allowed) {
 if (!value || typeof value !== 'object' || Array.isArray(value) ||
  Object.keys(value).some(key => !allowed.has(key))) invalid()
}
function instant(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid()
 const date = new Date(value)
 if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalid()
 return date.getTime()
}
const maxDate = values => values.filter(Boolean).sort().at(-1) ?? null
// Calendar months/years in UTC; clamp Feb 29 and month-end to the target month's last day.
export function addCalendarMonths(value, months) {
 instant(value)
 if (!Number.isInteger(months) || months < 0 || months > 1200) invalid()
 const date = new Date(value), day = date.getUTCDate()
 date.setUTCDate(1)
 date.setUTCMonth(date.getUTCMonth() + months)
 const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
 date.setUTCDate(Math.min(day, last))
 return date.toISOString()
}
const addDays = (value, days) => new Date(instant(value) + days * 86400000).toISOString()
function validate(input) {
 object(input, new Set(['version', 'purpose', 'as_of', 'records']))
 if (input.version !== RETENTION_PREVIEW_VERSION || input.purpose !== 'synthetic_only') invalid()
 const asOf = instant(input.as_of)
 if (!Array.isArray(input.records) || input.records.length > 1000) invalid()
 const seen = new Set()
 for (const row of input.records) {
  object(row, fields)
  if (!aliasPattern.test(row.alias) || seen.has(row.alias) || !kinds.includes(row.category) ||
   !RETENTION_STATES.includes(row.state)) invalid()
  seen.add(row.alias)
  if (!row.created_at) invalid()
  for (const field of dates) if (row[field] != null) {
   const value = instant(row[field])
   if (value > asOf || value < instant(row.created_at)) invalid()
  }
  if (row.case_status != null && !['open', 'closed', 'unknown'].includes(row.case_status)) invalid()
  if (row.referenced != null && typeof row.referenced !== 'boolean') invalid()
  if (!Array.isArray(row.linked_records) || row.linked_records.length > 100 ||
   row.linked_records.some(link => !aliasPattern.test(link) || link === row.alias) ||
   new Set(row.linked_records).size !== row.linked_records.length) invalid()
  if (!Array.isArray(row.holds) || row.holds.length > 20) invalid()
  for (const hold of row.holds) {
   object(hold, new Set(['alias', 'status', 'release_reference']))
   if (!aliasPattern.test(hold.alias) || !['active', 'released'].includes(hold.status) ||
    hold.release_reference != null && !aliasPattern.test(hold.release_reference)) invalid()
  }
 }
}
function ownClock(row) {
 const blockers = []
 let trigger = null, reviewAt = null, rule = null, inactiveAt = null
 if (row.category === 'profile') {
  trigger = maxDate([row.meaningful_service_at, row.profile_confirmed_at])
  rule = 'last_meaningful_service_or_confirmation_plus_5_calendar_years'
  if (trigger) {
   reviewAt = addCalendarMonths(trigger, 60)
   inactiveAt = addCalendarMonths(trigger, 24)
  } else blockers.push('missing_meaningful_service_trigger')
 } else if (row.category === 'case' || row.category === 'audit') {
  trigger = row.closed_at ?? null
  rule = 'verified_final_case_or_activity_closure_plus_5_calendar_years'
  if (row.case_status !== 'closed') blockers.push('case_not_confirmed_closed')
  if (!trigger) blockers.push('missing_final_closure_trigger')
  if (!blockers.length) reviewAt = addCalendarMonths(trigger, 60)
 } else if (row.category === 'resume') {
  trigger = row.unreferenced_at ?? null
  rule = 'confirmed_unreferenced_plus_30_days_subject_to_case_series'
  if (row.referenced !== false) blockers.push('resume_not_confirmed_unreferenced')
  if (!trigger) blockers.push('missing_unreferenced_trigger')
  if (!blockers.length) reviewAt = addDays(trigger, 30)
 } else if (row.category === 'ai_working') {
  trigger = row.reviewed_at ?? null
  rule = 'final_human_review_plus_30_days_subject_to_case_appraisal'
  if (trigger) reviewAt = addDays(trigger, 30)
  else blockers.push('missing_final_review_trigger')
 } else if (row.category === 'ai_pending') {
  trigger = row.created_at
  rule = 'abandoned_pending_creation_plus_90_days_for_review_only'
  reviewAt = addDays(trigger, 90)
 } else if (row.category === 'operational_log' || row.category === 'security_log') {
  trigger = row.created_at
  rule = row.category === 'operational_log' ? 'log_creation_plus_90_days' : 'security_event_plus_1_calendar_year'
  reviewAt = row.category === 'operational_log' ? addDays(trigger, 90) : addCalendarMonths(trigger, 12)
 } else if (row.category === 'evaluation') {
  trigger = row.purpose_ended_at ?? null
  rule = 'approved_study_end_plus_12_calendar_months_for_review'
  if (trigger) reviewAt = addCalendarMonths(trigger, 12)
  else blockers.push('missing_purpose_end_trigger')
 } else if (inheritedKinds.has(row.category)) {
  rule = 'follows_linked_source_or_case_series'
 } else {
  rule = row.category === 'backup' ? 'actual_provider_rotation_not_verified' : 'export_copy_requires_custodian_and_series_appraisal'
  blockers.push(row.category === 'backup' ? 'unverified_backup_rotation' : 'export_custody_and_series_unknown')
 }
 return {trigger, reviewAt, inactiveAt, rule, blockers}
}
export function previewRetention(input) {
 validate(input)
 const rows = new Map(input.records.map(row => [row.alias, row]))
 const adjacent = new Map(input.records.map(row => [row.alias, new Set()]))
 for (const row of rows.values()) for (const link of row.linked_records) {
  adjacent.get(row.alias).add(link)
  if (rows.has(link)) adjacent.get(link).add(row.alias)
 }
 const clocks = new Map([...rows].map(([key, row]) => [key, ownClock(row)]))
 const results = [...rows.values()].map(row => {
  // Treat dependency links conservatively as an undirected connected component.
  // This over-restricts a prototype; a future scoped manifest must appraise each record.
  const visited = new Set(), queue = [row.alias], missing = new Set()
  while (queue.length) {
   const key = queue.pop()
   if (visited.has(key)) continue
   visited.add(key)
   if (!rows.has(key)) { missing.add(key); continue }
   for (const link of adjacent.get(key)) if (!visited.has(link)) queue.push(link)
  }
  const component = [...visited].filter(key => rows.has(key)).map(key => rows.get(key))
  const clock = clocks.get(row.alias), blockers = new Set(clock.blockers), holds = new Set()
  for (const item of component) {
   if (item.state === 'legal_hold') {
    holds.add(item.alias)
    blockers.add('hold_state_requires_authorized_transition')
    if (!item.holds.length) blockers.add('hold_register_information_missing')
   }
   for (const hold of item.holds) {
    if (hold.status === 'active' || !hold.release_reference) {
     holds.add(hold.alias)
     if (hold.status === 'released' && !hold.release_reference) blockers.add('hold_release_authority_missing')
    }
   }
   if (item.category === 'case' && (item.case_status !== 'closed' || !item.closed_at))
    blockers.add('linked_case_open_or_closure_unknown')
   if (item.state === 'restricted') blockers.add('linked_record_restricted')
  }
  if (missing.size) blockers.add('dependency_inventory_incomplete')
  if (holds.size) blockers.add('legal_hold')
  const linkedCaseDate = maxDate(component.filter(item => item.category === 'case')
   .map(item => clocks.get(item.alias).reviewAt))
  let reviewAt = clock.reviewAt
  // Sources, derived records, AI evidence and resumes cannot be reviewed earlier than their retained cases.
  if (linkedCaseDate) reviewAt = maxDate([reviewAt, linkedCaseDate])
  if (inheritedKinds.has(row.category)) {
   const sourceClocks = component.filter(item => item.alias !== row.alias &&
    ['profile', 'case'].includes(item.category)).map(item => clocks.get(item.alias))
   if (!sourceClocks.length) blockers.add('missing_source_dependency')
   if (!sourceClocks.length || sourceClocks.some(value => !value.reviewAt)) blockers.add('source_retention_clock_unknown')
   reviewAt = maxDate([reviewAt, ...sourceClocks.map(value => value.reviewAt)])
  }
  if (row.state === 'approved_for_disposition') blockers.add('unverified_disposition_state_claim')
  const due = reviewAt != null && reviewAt <= input.as_of
  const inactive = clock.inactiveAt != null && clock.inactiveAt <= input.as_of
  let state = row.state
  if (state === 'approved_for_disposition') state = 'under_review'
  if (due) state = 'under_review'
  else if (inactive && state === 'active') state = 'inactive'
  if (row.state === 'restricted') state = 'restricted'
  if (holds.size) state = 'legal_hold'
  return {
   alias: row.alias, category: row.category, observed_state: row.state,
   proposed_state: state, proposed_trigger: clock.rule, trigger_at: clock.trigger,
   proposed_review_at: reviewAt, proposed_inactive_at: clock.inactiveAt,
   review_due: due, potentially_ready_for_appraisal: due && !blockers.size,
   holds: [...holds].sort(), linked_records: [...visited].filter(key => key !== row.alias).sort(),
   blockers: [...blockers].sort(), missing_approvals: [...REQUIRED_APPROVALS],
   disposition_authorized: false, disposal_enabled: false,
  }
 }).sort((a, b) => a.alias.localeCompare(b.alias, 'en'))
 return {
  version: RETENTION_PREVIEW_VERSION, purpose: 'synthetic_only', as_of: input.as_of,
  policy_status: RETENTION_POLICY_STATUS, read_only: true, live_adapter: false,
  disposition_authorized: false, disposal_enabled: false,
  counts: {records: results.length, review_due: results.filter(row => row.review_due).length,
   held: results.filter(row => row.holds.length).length,
   appraisal_candidates: results.filter(row => row.potentially_ready_for_appraisal).length},
  records: results,
 }
}
// Deliberately no executor or injectable mutation capability, even for claimed approvals/admins.
export function requestRetentionAction(action, input) {
 if (action !== 'preview') throw Object.assign(new Error('Disposal is disabled; separate approved policy and procedure required'), {code: 'RETENTION_DISPOSAL_DISABLED'})
 return previewRetention(input)
}
const html = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const label = value => html(String(value).replace(/_/g, ' '))
export function renderRetentionPreview(report) {
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
 '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
 '<title>EMPLOYCagayan retention review — synthetic preview</title><style>body{font:16px system-ui;max-width:1300px;margin:2rem auto;padding:0 1rem;color:#172033}h1{font-size:1.7rem}.notice{padding:1rem;background:#fff3cf;border:2px solid #916100}table{border-collapse:collapse;width:100%;min-width:1000px;font-size:.88rem}th,td{padding:.65rem;text-align:left;vertical-align:top;border:1px solid #b3bbc7}th{background:#e8eef5}caption{text-align:left;margin:1rem 0;font-weight:700}.scroll{overflow:auto}li{margin:.3rem 0}</style>' +
 '<h1>Retention review preview</h1><p class="notice"><strong>Synthetic examples. Proposed policy is inactive.</strong> Dates identify records for appraisal only. No records can be deleted or changed from this preview.</p>' +
 '<p>As of ' + html(report.as_of) + '. Records: ' + report.counts.records + '; review dates reached: ' + report.counts.review_due + '; held: ' + report.counts.held + '.</p>' +
 '<p>On a smaller screen, scroll the table sideways to see every column.</p><div class="scroll" role="region" aria-label="Retention record table" tabindex="0"><table><caption>Proposed review dates and reasons preventing disposition</caption><thead><tr><th scope="col">Synthetic record</th><th scope="col">Proposed state</th><th scope="col">Trigger / review date</th><th scope="col">Holds / dependencies</th><th scope="col">Blockers / missing approvals</th></tr></thead><tbody>' +
 report.records.map(row => '<tr><th scope="row">' + html(row.alias) + '<br>' + label(row.category) + '</th><td>' + label(row.proposed_state) + '</td><td>' +
 label(row.proposed_trigger) + '<br>' + html(row.proposed_review_at ?? 'Unknown — requires decision') + '</td><td>' +
 html(row.holds.join(', ') || 'No hold declared in synthetic input') + '<br>' + html(row.linked_records.join(', ') || 'No links declared') +
 '</td><td>' + label(row.blockers.join(', ') || 'No metadata blocker detected') + '<br>Missing: ' + label(row.missing_approvals.join(', ')) + '</td></tr>').join('') +
 '</tbody></table></div><p>Approved for disposition is a future governance state requiring verified, scoped authority. It never enables disposal in this prototype. An empty hold list does not prove absence of holds in the real system.</p></html>'
}

