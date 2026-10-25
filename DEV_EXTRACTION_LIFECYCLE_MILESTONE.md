# DEV Controlled Extraction Lifecycle Milestone

Date: October 14, 2026.

**Milestone:** Controlled source-bound extraction runs and atomic pending suggestions.
**Environment verified:** Local EMPLOYCagayan and independently verified Supabase DEV cdmkzzmaswwiryymtycn.
**Status:** Database lifecycle and managed review rules implemented and verified. Provider orchestration and the generation interface remain incomplete.

## What was implemented

begin_ai_extraction requires the guarded current canonical source and its confirmed fingerprint. It serializes identical managed work, locks the source, rechecks authorization/source after waiting, and charges the existing per-user quota once for each new attempt. Completed work is reused only after current entity authorization. Active processing prevents a second provider attempt. Expired/failed work retains its run ID and receives a new two-minute lease, bounded by the producing token expiry.

The run records source kind/version/hash, producer version and producing actor. A private RLS table holds the exact typed source snapshot, minimal claims captured from the actual signed producing request and the current lease. It stores no bearer token, email or user_metadata. Neither authenticated nor service callers can directly read/write that table.

complete_ai_extraction and fail_ai_extraction are worker-only. Completion accepts no caller user ID or claims. It uses the previously captured signed-request claims for controlled delegation, then rechecks current session, MFA, confirmation/activity, role, entity scope, source hash and lease. It restores the original worker request context afterward. A lease token protects retry ordering; it does not replace worker authorization.

Completion validates the bounded six-category contract, numeric confidence/provenance, literal source excerpts, terms/durations/importance and active canonical resolution targets. Database canonical labels replace supplied labels. It ignores supplied review and verification authority. All suggestions remain pending. Suggestions and completed status commit atomically, including an empty successful result; a late invalid item rolls back the whole batch.

Failures use a fixed generic classification. Obsolete callbacks cannot overwrite a replacement lease, and failure callbacks cannot downgrade completed work. Current metadata readers never expose private claims or lease state.

Invoker guards deny ordinary direct changes to managed runs/suggestions, including administrator attempts to erase the managed marker. Guarded owner routines retain their established access; legacy administrative records remain supported.

## Human review and interface compatibility

Managed acceptance/editing rechecks current source before consequential work. Authorized reviewers can still reject obsolete proposals. Canonical qualifications retain llm_inferred/unverified provenance after human acceptance.

Source intent is derived from captured typed field segments, not a model field. Managed uncertain occupation/industry intent cannot become a career preference. Explicit career-interest source can produce a preference after authorized review. Legacy unknown-intent behavior is preserved.

list_pending_suggestions_v2 wraps the existing authorized listing and adds controlled producer metadata. The local review service uses this version. The modal explains uncertain current career interest and avoids promising a preference write. Existing queue permissions, manual dictionary choices, confirmations and error recovery remain covered.

## Files changed

- supabase/migrations/20261014071515_controlled_extraction_runs.sql
- tests/support/extraction-lifecycle-database.js
- tests/unit/extraction-lifecycle-db.test.js
- tests/integration/dev-extraction-lifecycle.js
- src/services/aiReviewService.js
- src/domain/aiReviewIntent.js
- src/components/aiReview/ReviewModal.jsx
- tests/browser/intelligence-review.spec.js
- This report, README and extraction source/producer follow-ups.
- Evidence under artifacts/extraction-producer-20261014/.

## Database migration

Applied only to independently verified DEV: 20261014071515_controlled_extraction_runs.sql.

The work table, begin routine and producer columns were confirmed absent before application. Existing DEV acceptance/edit routine bodies matched the inspected local versions before replacement. The migration adds controlled lifecycle metadata/indexes, private work state, direct-write guards and guarded routines. Existing table policies/grants are preserved.

The management ledger assigned the final version; the local filename and helper were aligned. Complete ledger statements match the local source after trimming outer whitespace. SHA-256: f1f76951b139c3dbe56c8e3f09488ca6fe31687ab43345f7fed41fd3e142bc69.

## Tests executed and results

| Check | Result |
| --- | --- |
| Focused isolated lifecycle SQL | 13 passed. Source-bound starts/cache, MFA/empty/stale input, worker-only completion, atomic rollback, revoked/inactive producing sessions, expired/replaced leases, generic failures, metadata forgery denial, active canonical targets, source-fresh review, unverified provenance, intent, legacy compatibility and private grants. |
| Focused browser review | 6 passed, including uncertain managed preference intent. |
| Full unit regression | 289 passed; no failures/skips/TODOs. |
| Full browser regression | 63 passed. These are local/intercepted flows, not real Google acceptance. |
| Lint/build | Passed with existing warnings/advisories. |
| Native DEV lifecycle | 8 groups, 142 requests, 6 accounts, complete cleanup. |
| Native concurrency | 12 simultaneous signed starts create one run and one active attempt. |
| Actual expiry | A live background harness waited for the real two-minute lease to expire, then confirmed completion denial; the clock was not fabricated. |
| Native review/provenance | Actual signed human review is required before qualification persistence and retains llm_inferred/unverified. |
| Independent cleanup | Zero test accounts, private work rows, managed runs/suggestions and quota rows remained. |
| ACL/catalog | Work table RLS enabled; direct anon/authenticated/service CRUD denied; private schema usage remains denied; worker completion/failure granted only to service_role; all paths fixed. |
| Browser bundle | Service fixture credential and protected Production identifiers absent from rebuilt JavaScript. |

Native source/start/read/review acceptance uses actual signed users and real TOTP. Worker completion uses service credentials with synthetic output to test the trusted worker plane. This is fixture testing, not proof that an ordinary user can complete work and not managed provider acceptance. No provider request or genuine personal source was used in this milestone. No signed Google identity/claims were fabricated.

## Security observations

Advisors report five RLS-enabled tables without policies, 17 anonymous and 64 authenticated public-definer notices, and disabled leaked-password protection. The new private work table intentionally has no ordinary policies/grants. The three additional authenticated notices correspond to begin, run status and the authorized listing wrapper; their internal session/entity gates are verified.

References: [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Private source storage and producing claims introduce retention/deletion obligations. No retention policy or complete data-deletion workflow is claimed. Excerpt presence is grounding evidence, not truth or semantic relevance. Worker credentials remain a privileged trust boundary.

## Outstanding work and next recommended action

Implement the local managed Edge orchestration: begin using the caller token, invoke the fixed provider only for a new lease, resolve against active dictionaries, validate/complete through the trusted worker RPC and classify failures. Then add an authorized source picker/preview and generation status in the PESO interface, linked to human review.

The previously published DEV v8 endpoint still returns validated standalone proposals and does not use this lifecycle. No new Edge or Vercel publication was performed. A new concrete publication exception must be resolved only after the managed replacement is complete and reviewable.

Important remaining review work includes editable requirement importance/months, a reviewed provider/relevance dataset and full source-to-provider-to-pending-to-human acceptance. Official PSOC API import and real Google ownership/linking acceptance remain pending. Earlier credential rotation and broader operational/privacy work remain unverified.

**Git commits/pushes:** None.
**Production modified:** No.
**Full goal:** Active and incomplete.

References: [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [function security](https://www.postgresql.org/docs/current/sql-createfunction.html).

## Local managed orchestration follow-up

DEV_MANAGED_EXTRACTION_MILESTONE.md records the local server/provider orchestration, source preview and generation screen, 301-unit/68-browser passing regressions and 3-group/50-request signed DEV orchestration with synthetic output and full cleanup. The seven-file replacement remains unpublished; actual generation is disabled pending a concrete publication exception and hosted verification.
