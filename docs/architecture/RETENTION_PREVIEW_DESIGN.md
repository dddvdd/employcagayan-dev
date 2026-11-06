# Read-only retention preview design and test contract

Version: retention-preview-v1. Prepared 2026-10-15. Status: offline synthetic prototype; proposed policy inactive.

## Delivered behavior

Run from the EMPLOYCagayan project:

```powershell
node scripts/preview-retention.mjs --input governance/retention/synthetic-cases.json --output artifacts/retention-governance-20261015/another-preview.json
node scripts/preview-retention.mjs --input governance/retention/synthetic-cases.json --output artifacts/retention-governance-20261015/another-preview.html --format html
```

Output must be a new file; existing files and the input are never overwritten. The supplied generated reports are synthetic-preview.json and synthetic-preview.html in that evidence directory. The static HTML has an inactive-policy notice, an accessible record table and no script, external asset, form, approval or disposal control. It displays record alias/category, proposed state, trigger/review date, linked records/holds, blockers and missing approval information. Dates reached mean review, never authorized destruction.

Implementation: scripts/lib/retention-preview.mjs (pure calculation, state presentation, disabled action gate and HTML renderer), scripts/preview-retention.mjs (bounded local file adapter), governance/retention/synthetic-cases.json (18 fictional scenarios), tests/unit/retention-preview.test.js (20 tests). No runtime frontend route, browser Auth client, database adapter, mutation API, environment secret or provider call is imported.

Inputs accept only allowlisted metadata: version, synthetic_only purpose, strict UTC ISO timestamp, up to 1,000 records with s- aliases, category, observed state, named trigger dates, case status, resume reference flag, declared links and hold metadata. Each record has at most 100 links and 20 holds; CLI input is capped at 2 MiB. Unknown fields, duplicate aliases/links, invalid/future dates, dates before creation, personal-content fields and forged policy approval fields are rejected with fixed non-sensitive errors. Aliases and the synthetic_only label do not independently prove a caller used fictional data; the prototype is explicitly limited to manually prepared synthetic metadata.

All results include policy_status=proposed_inactive, read_only=true, live_adapter=false, disposal_enabled=false and disposition_authorized=false. Every row retains the missing-approval checklist. No caller option can switch these on. requestRetentionAction accepts only preview; every other action fails with RETENTION_DISPOSAL_DISABLED. This fail-closed local gate has no executor behind it and does not claim to change existing database privileges.

## Proposed state model — not persisted

| State | Proposed meaning and controls for future approval |
|---|---|
| active | Ongoing lawful service purpose and applicable ordinary access. Do not reset the retention clock merely because an admin views a record. |
| inactive | No recent meaningful service under the approved definition; stop ordinary matching/discovery after an approved access design. Preserve case evidence and permit controlled reactivation. |
| restricted | Limit processing to specific lawful preservation/rights/security purposes. Ordinary matching, exports and AI must honor restriction; justified case access may remain. |
| under_review | Appraisal/rights/closure/hold/authority information is being resolved. Read-only review does not authorize disposal. |
| legal_hold | Preserve scoped records/copies and derivatives for the specified matter. Only authorized release/transition can remove it; periodic review required. |
| approved_for_disposition | Future state requiring verified scope, approved schedule/procedure and required written records authority. No execution implied; this prototype always demotes an input claim to under_review and flags it unverified. |

Holds are also orthogonal overlays: an underlying active/restricted/under-review lifecycle cannot erase an applicable hold. Future persistence should retain the prior lifecycle state and multiple scoped hold records so releasing one hold does not clear another. The prototype presents the most restrictive effective display state and reports all declared active holds. A legal_hold input state remains blocking until a separate authorized state transition; a claimed released hold without a release reference stays held. A reference in synthetic metadata is a scenario assumption, not verification of a real official's authority.

Future server-held state must be separate from profiles.is_active, vacancy availability, qualification verification and MFA recovery. Preview access should be restricted to formally authorized reviewers with existing identity/session/MFA and jurisdiction checks. Display aliases/minimum metadata by default; reveal a real record only through its already-authorized detail view. Do not add PUBLIC/anon access, use a service key in the UI, broadly alter RLS or create new roles without a reviewed implementation. No such integration occurs here.

## Proposed clock and dependency calculations

- Profile: latest explicitly meaningful service or owner confirmation; proposed inactive date +24 calendar months, review date +60 calendar months. No fallback to created_at, login or updated_at.
- Closed case/audit activity: explicit closed status and final closed_at; proposed review +60 calendar months. A status alone cannot establish closure.
- Resume: confirmed referenced=false and unreferenced_at; proposed review +30 days. Active pointers or unknown reference status block short-copy appraisal.
- AI reviewed working copy: reviewed_at +30 days. A live adapter must establish FINAL review for the appropriate unit before populating it. Pending abandoned work: created_at +90 days for review only.
- Accepted AI facts, qualifications and embeddings: inherit linked profile/case review clocks; missing source or source clock blocks appraisal.
- Routine logs: creation +90 days; minimized security metadata +12 calendar months. Evaluation: authorized purpose end +12 calendar months. Exports and backups have no invented expiry.
- For supporting source/derived records, the latest linked closed case can extend a shorter proposed target. Open/unknown-closure linked cases, unknown dependencies, declared restrictions and active holds block appraisal. Existing record series may require longer/permanent preservation; the inactive prototype does not calculate an authoritative series deadline.
- Links are treated bidirectionally across the connected component, even if declared from only one side. Cycles terminate. This intentionally conservative prototype can over-restrict unrelated branches of a real case graph; a future appraised scoped manifest must improve precision without missing holds.
- Calendar arithmetic uses UTC month/year addition and clamps leap day/month end; proposed days use 24-hour UTC intervals. Exact target instant is review-due. Local civil-date semantics require approval.

review_due simply means the proposed date was reached. potentially_ready_for_appraisal means a reached date and no detected synthetic metadata blocker; missing approvals still remain and disposal is disabled. An incomplete real inventory cannot be treated as an empty hold list. No live data is read or written by these functions; no existing record is automatically deactivated or restricted.

## Verification and limits

The 20 tests cover exact inactivity/closure boundaries, annual confirmation, leap day/month-end, missing triggers, longer linked cases, one-sided links, cycles, open cases, active/claimed-released holds, missing sources, current/unreferenced resumes, AI states, exports/backups without deadlines, restricted/unverified-approved states, forged action/approval claims, privacy/size/date validation, deterministic no-network calculations, input immutability, static escaped HTML and actual CLI overwrite/error handling.

The full project unit run passed 418 tests, zero failed/skipped. Focused lint passed. The static generated preview is separately checked in a local browser; details in verification.json. Existing 102 application browser tests passed in the preceding CSV milestone; they are historical evidence, not a fresh live-retention UI test. No live-retention UI exists. No schema was necessary, so no migration, RLS/grant change, deployment or hosted disposal acceptance is claimed.

Future acceptance after policy approval must add signed-in unauthorized/authorized preview cases, scoped holds/authority revocation, manifest/clock drift, reopening and concurrency, exact Storage/case-reference protection, in-flight derivative regeneration, provider failure, recipient-copy handling, isolated restore replay and independent disposition verification. None may run a live disposal before the separately approved policy and procedure exist.

