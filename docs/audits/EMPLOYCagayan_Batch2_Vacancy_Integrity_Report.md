# EMPLOYCagayan Batch 2 — Vacancy Integrity

Status: **LOCAL IMPLEMENTATION COMPLETE — HOSTED VERIFICATION PENDING.**
Local completion checks: PASS. Job-matching acceptance: **NOT TESTED**.
Batch 1 remains open and unchanged. No Batch 3 work.

## Baseline and safeguards

Primary checkout: PRIMARY_CHECKOUT_PARENT/EMPLOYCagayan.
The supplied jobfair-web directory is absent. Branch dev, revision ec2ab9805900b277bae3a582d53771e730deb366. Explicit Git work-tree selection was necessary under the restricted process; no Git configuration was changed.

Preserved baseline: modified src/pages/Public/LandingPage.jsx; untracked Batch 1 report/migration/fixtures/tests; playwright.hero.config.js; animated magnifying-glass media; public/videos; scratch_blend_colors.mjs; HeroScanningVideo and LandingNavigation files; resume-scanner browser test. No applicable AGENTS.md found in the checkout or searched parent path.

Before hosted inspection, independently confirmed project cdmkzzmaswwiryymtycn, Trabaho Caravan Dev, ACTIVE_HEALTHY, db.cdmkzzmaswwiryymtycn.supabase.co. Only policy metadata was queried. No real vacancy or applicant rows were read. No hosted authentication, SQL writes, migrations, account changes, production access, commits, pushes or deployments.

## Confirmed root causes

1. Education, experience and language Remove buttons discarded rows from state instead of retaining deletion markers. The persistence loop consequently had no record of what to delete.
2. The persistence loop implemented create/delete only. Existing rows never received UPDATEs. Existing row summaries had no edit controls.
3. Requirement errors were accumulated and shown with toast.error, but never thrown. The caller still showed Updated! and cleared the editor.
4. Base details were committed before independent qualification requests. A later child failure could leave a partially changed vacancy.
5. Publication checked proposed text against previously persisted children. Immediate child guards also prevented valid multi-step replacements where intermediate state lacked evidence.
6. Requirement loading had no request-generation guard or loading save lock. A late response could overwrite another editor. The form and requirements were not loaded from one snapshot. No conflict token protected edits from another session.
7. Numeric conversion used || null for persisted requirement minima, collapsing zero into null in the legacy helper.

## Changes

Modified:
- src/pages/Employer/EmployerDashboard.jsx
- src/services/vacancyService.js

Created:
- supabase/migrations/20261103105526_vacancy_edit_integrity.sql
- tests/unit/vacancy-edit-integrity-db.test.js
- tests/browser/vacancy-edit-integrity.spec.js
- EMPLOYCagayan_Batch2_Vacancy_Integrity_Report.md

Generated ignored build output: artifacts/batch2-build. Existing dist was not targeted. No dependencies changed.

| Family | Before | After |
| --- | --- | --- |
| Skills | Create/delete only; existing values not saved | Canonical selection, importance and minima editable; persisted IDs retained; add/update/remove in transaction |
| Education | Removal disappeared only on screen | Canonical level, field, notes and importance editable; omission from complete list deletes persisted row |
| Experience | Removal disappeared only on screen | Occupation/industry, months, description and importance editable; zero retained; add/update/remove persist |
| Certifications/licenses | Create/delete only | Canonical selection, validity, notes and importance editable; add/update/remove persist |
| Languages | Removal disappeared only on screen | Canonical language, three proficiency minima and importance editable; add/update/remove persist |

Complete snapshot loading returns persisted IDs and all five lists in one SQL statement. The form uses the same snapshot as its version. Loading disables editing/save; close/switch invalidates outstanding responses. Failed saves preserve editor state. The edit path sends one complete RPC request and requires a non-null readback with the correct vacancy ID before success. No fallback to separate writes exists when the RPC is unavailable.

Legacy requirement save now throws accumulated errors instead of falsely succeeding, and preserves zero minima. New-vacancy creation retains its pre-existing separate base/child flow; atomic creation and deduplication after a partially failed creation are outside this Edit Vacancy change and remain a separate risk. The Edit Vacancy path does not use that flow.

## Transaction, authorization and publication

get_vacancy_edit_snapshot and save_vacancy_definition are SECURITY INVOKER with fixed search paths, authenticated execution only, and no grant/RLS expansion. Save explicitly requires the current authenticated owner of an active, approved employer. Existing identity-session and MFA RLS still govern every read/write. Foreign-owned child IDs fail scoped updates. Zero-row base/child updates raise errors. Database types, canonical foreign keys and existing constraints remain authoritative; required position is additionally checked explicitly.

Save locks the existing canonical vacancy, compares edit_version, applies all five complete requirement lists, updates only an allowlist of base fields, runs final validation and returns the committed proposed snapshot. Any exception aborts the entire call. Existing child IDs are updated, omitted IDs deleted, new rows inserted. Stale retries fail with 40001 rather than duplicating requirements. A new snapshot is required to resolve conflicts; no automatic overwriting retry.

Base and child triggers advance the parent's edit_version, including writes from other application paths. Moving child rows between vacancies is rejected. Parent deletion cascades are allowed when the parent no longer exists. Parent-row locking serializes competing writes; database deadlock/serialization errors surface as save failures.

The previous immediate requirement-publication triggers are replaced with deferred constraint triggers on the parent and all five child tables. They re-read final state and reuse app.has_unresolved_vacancy_requirements. The save RPC forces these named constraints before readback, then restores their deferred mode. This permits a valid combined text/evidence edit without committing intermediate published state. Direct SQL/API child edits are also checked at transaction completion. There is no caller-controlled validation bypass. The internal final-validation trigger uses narrowly scoped SECURITY DEFINER, consistent with existing publication guards; direct execution is revoked. It only locks/reads the affected vacancy and raises on unresolved evidence. Save itself has no definer privilege.

Existing publication/deadline validation, publication RPCs, employer ownership policies, application IDs, event offerings, outcomes, matching algorithms, weights and skill catalogs are unchanged. Qualification arrays already feed the matching source fingerprint; committed changes naturally change that fingerprint, and failed transactions leave it unchanged. Existing source-bound readers suppress stale signals. No cache-flush bypass or matching formula change was introduced.

## Validation

All database tests use fictional local PGlite fixtures and SET ROLE authenticated with session/MFA claims. Browser tests intercept every non-local request with fictional responses; unsigned fixture tokens never reach Supabase.

Commands (from primary checkout):

```text
node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/vacancy-edit-integrity-db.test.js
node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/vacancy-requirement-enforcement-db.test.js tests/unit/vacancy-requirement-readiness.test.js tests/unit/recruitment-authorization-db.test.js tests/unit/matching-source-binding-db.test.js
$env:EMPLOY_PLAYWRIGHT_PORT='5185'; npx --no-install playwright test tests/browser/vacancy-edit-integrity.spec.js --workers=1
npm run lint
node --check src/services/vacancyService.js
npm run build -- --configLoader runner --outDir artifacts/batch2-build
git --work-tree=<primary checkout> diff --check
```

- New database suite: 10 passed, 0 failed (five existing publication cases replayed with the new migration plus five focused integrity/security cases).
- Existing requirement/readiness/recruitment/source suites: 37 passed, 0 failed across their historical fixture stacks. They are not a full replay of current hosted schema.
- Browser: 2 passed, 0 failed. Delayed A is ignored after opening B; save submits B and all five lists. Failed transaction leaves Save available and never shows Updated!.
- CRUD/readback tests cover all five nonempty families, stable persisted IDs, required/preferred edits, zero minima, remove, stale-version rejection, child/base rollback and canonical linkage.
- Published edit: adding mandatory text and evidence succeeds atomically; removing required evidence fails with unchanged fingerprint; removing text and evidence together succeeds.
- Authorization: foreign owner, unapproved employer, AAL1, missing vacancy and restrictive zero-row update deny save.
- Canonical application and employment-outcome rows remain byte-for-value unchanged after a complete edit. Event offering keeps its canonical vacancy ID.
- Lint: exit 0, 16 pre-existing warnings in unchanged files. Syntax check passes. Build passes (Vite 8.2.1, 1,336 modules); existing large-chunk and ineffective dynamic-import warnings. Earlier OneDrive dependency failure did not recur. No unrelated dependency work.
- Whitespace check passes; Git notes existing LandingPage LF/CRLF conversion warning.

Intermediate failures were fixture/setup issues: missing historical employer policies, missing outcome table, required certification normalized_name, a shallow expected-value clone, an incorrect history-table assumption, a browser fixture import and a wrong dashboard URL. These were corrected locally. The required-position test also exposed a nullable historical fixture column; explicit RPC validation now enforces the real required field. No hosted permissions were weakened to make tests pass.

The local harness restores baseline employer qualification policies confirmed unchanged by fresh DEV metadata. It adds the baseline outcome table and canonical FK for preservation checks. It does not claim full current-stack or hosted integration equivalence.

## Migration artifact

File: supabase/migrations/20261103105526_vacancy_edit_integrity.sql
SHA-256: C38BACEAC30E4F897544E2F7A1C3C8A96935824C593FEC2115CB01E48F334DE0
Created with the installed Supabase migration-new command. Local file only; not installed or entered into any hosted ledger.

## Proposed DEV sequence and rollback

1. Obtain separate authorization for DEV migration and fictional hosted acceptance. Reconfirm target and inspect current tables/triggers/RLS/grants for drift; validate all prerequisites against this local artifact. Preserve a schema/trigger snapshot and backup before any approved installation. Do not use a bulk migration push that might replay Batch 1's already-installed, unrecorded policies.
2. Review/install only this migration on DEV under its own approved process. Check effective functions, grants, version triggers and final-state guards. Existing callers should keep working; verify create, publication and deadline behavior as well as edit.
3. Release the matching frontend only after the RPC exists. Run separately approved hosted fictional UAT covering V01–V05, real API readback, AAL/MFA, accreditation, authorization, concurrent connections, recruitment history and source invalidation. Keep job-matching acceptance NOT TESTED until separately established.
4. On failure, disable access to the new edit UI and investigate/forward-fix. Reverting only the frontend would restore the old non-atomic defect and is not a safe integrity rollback. A reviewed schema rollback must restore the prior three publication triggers exactly, remove the new constraint/version triggers and RPCs, then remove edit_version only after consumers are retired. Preserve all vacancy/application/outcome rows; never reset or reinsert vacancies. No rollback executed or authorized here.

## Remaining risks and verification gaps

- Hosted migration/integration acceptance pending; deployed editor behavior is not certified.
- Two-snapshot stale-version protection is tested locally. True simultaneous multi-connection contention/deadlock behavior and realistic latency remain pending.
- Historical local fixtures cover relevant constraints and RLS, not every current hosted dependency/trigger. Fresh metadata parity review is required before installation.
- Publication's existing conservative English/exact-canonical-name requirement detector is reused unchanged. Implicit, ambiguous and non-English requirements still need human review; no new interpretation policy was invented.
- New-vacancy creation remains multi-operation as noted above. Scope here is existing vacancy editing.
- Broader audit/history retention and unrelated known résumé-history gaps were not changed.

Stop boundary observed: no hosted migration, Batch 1 ledger reconciliation, real account/vacancy modification, Batch 3, commit, push or deployment. Next authorization needed is DEV installation and approved fictional hosted verification, as a separate task.
