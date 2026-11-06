# EMPLOYCagayan Batch 2.1 — Preflight Remediation

**Decision: GO FOR RE-PREFLIGHT.** Both confirmed blockers are corrected locally and focused tests pass. This is not permission to install or release.

Revised artifact: `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`.

**SHA-256: 112F35492B46E4D7C38A030BAA54245D82234E8134EB5275A59668135BB4B4DD**

Obsolete hash: `C38BACEAC30E4F897544E2F7A1C3C8A96935824C593FEC2115CB01E48F334DE0`. The earlier Batch 2 report describes the prior artifact; this report supersedes its validation and installation assessment.

## Environment and safeguards

Primary checkout: `PRIMARY_CHECKOUT`; branch `dev`, revision `ec2ab9805900b277bae3a582d53771e730deb366`. The supplied `jobfair-web` path is absent. Existing Batch 2 frontend edits and landing-page/video/navigation work were preserved. No applicable checkout AGENTS.md found.

Before any database inspection, independently verified DEV `cdmkzzmaswwiryymtycn`, **Trabaho Caravan Dev**, **ACTIVE_HEALTHY**, host `db.cdmkzzmaswwiryymtycn.supabase.co`, PostgreSQL 17. Inspection read function definitions, constraints and policies only. No employer, vacancy, applicant or account rows were retrieved.

No hosted SQL writes/migrations/history repair, hosted authenticated UAT, account changes, Production access, commits, pushes or deployment. Batch 1 is unchanged; no Batch 3 work.

## Before / after

| Area | Before | Revised behavior |
| --- | --- | --- |
| Publication integrity | Most rules ran only when entering published status | One `app.assert_vacancy_publishable` function supplies final-state validation for publication and relevant edits to active published vacancies, including direct table writes |
| Complete validation | Mandatory-evidence guard missed description, workplace, slots, compensation and minima | Retains the complete current publication rules; validates nonnegative skill/experience minima and supported skill importance/proficiency; preserves other families' existing NOT NULL, FK and CHECK contracts |
| Transaction timing | Separate or intermediate validation could reject valid combined edits | Deferred constraint triggers read final parent/child state; the save RPC forces checks before readback; exceptions roll back all changes |
| Legacy maintenance | Blanket checks could block unrelated maintenance | Changes only to non-publication metadata and version/timestamp bookkeeping skip full revalidation; no-op requests stay unchanged |
| Closing / archiving | Must remain available for invalid legacy rows | Existing controlled closing remains unchanged; deactivation is allowed; reactivation or relevant edits to an active published vacancy require a fully valid final state |
| Skill canonical replacement | Insert/update occurred before omitted rows were deleted | Validate all submitted canonical IDs and owned row IDs, plan the final set, delete omitted/canonically changed rows, then update or reinsert |
| Skill identity | Replacement/swap could hit immediate uniqueness | Existing immediate unique constraint is unchanged; swaps retain each row ID and creation timestamp; delete/re-add of the same canonical skill reuses its existing ID |
| Duplicate submissions | Could fail late with a uniqueness collision | Duplicate canonical IDs or duplicate row identities fail explicitly before skill mutation |
| Unchanged saves | Rewrote rows and advanced versions/freshness | Compare stored values before UPDATE; unchanged full-state RPC calls make no row mutations and retain version/fingerprint/cache state |
| Version bookkeeping | Parent version-only updates invalidated embeddings | Freshness invalidator ignores `edit_version`, alongside its existing ignored bookkeeping fields; real child changes still advance freshness and mark embeddings stale |

The authoritative validation body is extracted from the complete freshly inspected DEV `validate_vacancy_publication()` contract. Its existing transition authorization and timestamp behavior stay in the immediate trigger; the shared validity checks move to final-state constraint validation. The controlled `publish_vacancy` and `close_vacancy` RPC definitions remain unchanged, including session, ownership, approval and status-transition rules.

Legacy behavior is explicit: an unchanged request or unrelated maintenance does not repair or newly certify invalid old data. A relevant edit to an active published vacancy must fix the complete final state. Closing and deactivation provide containment. Active expired vacancies must have their deadline addressed through the existing authorized deadline workflow, or be closed/deactivated, before relevant published edits can pass. Deactivated/closed rows remain excluded from ordinary open-vacancy workflows; their existing FK/CHECK constraints still apply.

## Security and data integrity

- Save and snapshot RPCs remain SECURITY INVOKER; the parent is locked and ownership, active employer, approved registration and expected version are checked before reconciliation or no-op handling.
- Existing identity/MFA RLS remains in force. AAL1, unapproved/foreign employers, foreign child IDs, stale versions, missing vacancies and denied base/child updates are tested failures.
- The new authoritative validator and final-validation trigger are private SECURITY DEFINER functions with fixed search paths, qualified objects and no dynamic SQL or user-controlled bypass flag. Direct execution is revoked from PUBLIC/anon/authenticated/service_role as applicable; local ACL tests confirm both validators are inaccessible to the three API roles. No private-schema usage grant was added.
- Base updates remain allowlisted. Skill planning ignores caller ownership/timestamps and obtains persisted identity/creation time from the owned row. Skill swaps reinsert only canonically changed rows with the same IDs and creation timestamps. Required/preferred importance and thresholds are retained.
- DEV has no inbound foreign keys to `vacancy_skills`. The revised migration aborts if such references appear or its expected immediate canonical uniqueness constraint is missing/changed. It does not drop, defer or weaken uniqueness. Future child-reference additions require a reconciliation-strategy review.
- All five requirement families retain add/edit/remove functionality. Existing canonical application, outcome and offering links remain unchanged. Matching scores, weights, eligibility calculations, semantic ranking and catalogs are untouched.
- A real skill-threshold change advances the version, changes the matching fingerprint, marks the existing embedding stale and increments source revision once. Its parent version-only update adds no extra freshness increment. An unchanged five-family save leaves parent/child CTIDs and xmin values, timestamps, edit_version, source revision, fingerprint and the current embedding record unchanged. Stale no-op requests still fail their version check.

## Files changed in this batch

Revised:
- `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`
- `tests/unit/vacancy-edit-integrity-db.test.js`
- `tests/browser/vacancy-edit-integrity.spec.js`

Created:
- `tests/fixtures/vacancy-edit-policies-dev-20261103.json` — metadata only; 42 fresh DEV policies across all six vacancy tables, with PostgreSQL role arrays normalized to JSON arrays.
- `EMPLOYCagayan_Batch2_1_Preflight_Remediation_Report.md`

No application frontend/service code or dependencies changed in Batch 2.1. The existing Batch 2 frontend and all unrelated local work remain present. Build output is isolated in ignored `artifacts/batch2-1-build`; existing `dist` was not targeted.

## Test evidence

| Check | Final result |
| --- | --- |
| Focused vacancy-edit SQL/RLS suite | **35 passed, 0 failed**, including subtests |
| Existing requirement/readiness, recruitment authorization, matching-source and embedding freshness suites | **59 passed, 0 failed** |
| Intercepted local browser regressions | **3 passed, 0 failed** |
| Application lint | Exit 0; 16 existing warnings in unchanged files |
| Focused test lint | Exit 0; no diagnostics |
| Service and test JavaScript syntax | Passed |
| Isolated application build | Passed, Vite 8.2.1; 1,336 modules |
| Whitespace review | Passed; existing LF/CRLF notices remain |

Commands, from the primary checkout:

```text
node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/vacancy-edit-integrity-db.test.js
node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/vacancy-requirement-enforcement-db.test.js tests/unit/vacancy-requirement-readiness.test.js tests/unit/recruitment-authorization-db.test.js tests/unit/matching-source-binding-db.test.js tests/unit/embedding-freshness-db.test.js
$env:EMPLOY_PLAYWRIGHT_PORT='5186'; npx --no-install playwright test tests/browser/vacancy-edit-integrity.spec.js --workers=1
npm run lint
npx --no-install oxlint tests/unit/vacancy-edit-integrity-db.test.js tests/browser/vacancy-edit-integrity.spec.js
node --check src/services/vacancyService.js
node --check tests/unit/vacancy-edit-integrity-db.test.js
node --check tests/browser/vacancy-edit-integrity.spec.js
npm run build -- --configLoader runner --outDir artifacts/batch2-1-build
git --work-tree=<primary checkout> diff --check
Get-FileHash supabase/migrations/20261103105526_vacancy_edit_integrity.sql -Algorithm SHA256
```

P1 covers valid publication/edit; empty/short descriptions; missing workplace; zero/negative slots; negative/inverted/incomplete pay; missing position; past deadline/currency problems through direct writers; negative experience/skill minima; malformed family values; valid and invalid combined text/evidence changes; direct transaction final-state checks; legacy correction/maintenance/close/deactivation and denied invalid reactivation.

P2 covers same-skill re-add; A-to-B replacement; two-row canonical swaps; threshold/importance editing; remove-one/retain-one; duplicate canonical IDs; foreign row IDs; late failure rollback and retry; exact IDs, creation times, canonical values and immediate uniqueness.

P3 covers five-family CRUD/readback; physical no-op invariance with a real local freshness revision/current embedding; stale conflicts; ownership/approval/MFA and zero-row denial; application/outcome preservation; and private validator permissions. Browser tests confirm delayed A cannot overwrite B, failed saves never show Updated!, edited values remain present and a successful retry sends the identical definition.

An additional denied-child-update test exposed incomplete historical fixture RLS: some requirement tables had policies but RLS was not enabled. The final fixture explicitly enables all six tables and restores the fresh 42-policy snapshot; the denial and all prior cases then pass. Other intermediate failures were test setup assumptions about draft validation/role-array serialization and an overbroad legacy-fixture edit, all corrected. No hosted permission was changed or local guard relaxed to force a passing result.

Local PGlite uses fictional identities/records and actual SQL/RLS/constraint behavior. The focused suite now includes the deployed freshness migration plus revised invalidation function; vectors are opaque text, not semantic/vector acceptance. Browser traffic outside localhost is intercepted. The 59 existing regression tests use their own historical migration stacks; they are supporting evidence, not a full current DEV replay. Fresh policies and publication/freshness contracts do not replace hosted integration verification of every dependency.

The build succeeded; prior OneDrive dependency failure did not recur. Existing large-chunk and ineffective dynamic-import warnings remain.

## Updated DEV installation and rollback plan

1. Perform a separate read-only re-preflight against this **new hash**. Reconfirm DEV identity, noninstallation, current policy/grant/trigger/function parity, exact immediate uniqueness and no inbound skill-row FKs. Inspect new helper/private ACLs and publication/invalidation changes. Do not install under this task's authorization.
2. Keep Batch 1's installed-but-unrecorded state separate. **No bulk migration push, reset, replay, automatic repair or ledger reconciliation.** Prepare only the single reviewed Batch 2 artifact for a separately authorized installation with its own correct history registration.
3. Before any approved installation, preserve the exact current publication/invalidation function definitions and three original requirement-trigger definitions, schema/ACL metadata and a recoverable backup. Schedule for the brief ALTER TABLE/trigger locks; abort on drift rather than guessing.
4. Install only the reviewed revised Batch 2 artifact on DEV after explicit authorization. Verify atomic migration completion, its exact ledger entry, edit_version, both invoker RPCs, internal validators, all six constraint triggers and five version triggers. Confirm all existing RLS/grants and immediate uniqueness remain intact.
5. Run separately authorized fictional hosted tests for P1–P3, including direct writes, true concurrent connections, deadlock/conflict behavior, readback, existing creation/publication/deadline/closing, history/outcomes and actual source/embedding invalidation. No new accounts or hosted fixtures without separate approval. Do not claim deployed correctness before this passes.
6. Database support must exist before releasing the matching frontend. Release only after required DEV acceptance, under separate deployment authorization. Preserve the editor's fail-closed behavior when the RPC is absent.
7. If verification fails, contain access to the new edit path and prefer a reviewed forward fix. A schema rollback must restore the original `validate_vacancy_publication` and `app.invalidate_embedding_source` bodies as well as the three original immediate requirement triggers; remove the new constraint/version triggers, RPCs and validators in dependency order. Remove edit_version only after consumers are retired. Preserve all vacancy/application/outcome rows and restore exact ACLs. Reverting only the frontend restores the original non-atomic edit defect and is not sufficient containment.

## Remaining risks and stop boundary

- Fresh DEV re-preflight and separately authorized installation/hosted verification remain required. This local artifact is not installed.
- True multi-connection concurrency, realistic latency/trigger amplification and full current hosted-schema parity remain unverified; single-connection stale-version tests pass.
- The existing conservative mandatory-text detector remains unchanged. Human review of ambiguous/non-English requirements and the existing approved-registration accreditation contract remain separate policy concerns.
- New-vacancy creation retains the pre-existing multi-request flow; this correction targets editing existing vacancies. No unrelated workflow redesign was attempted.
- Batch 1 closure remains **PENDING**. Job-matching acceptance remains **PENDING / NOT TESTED**. No Batch 3 work.

Stop after local implementation/testing observed. No installation, ledger write, account change, authenticated hosted UAT, commit, push or deployment performed.
