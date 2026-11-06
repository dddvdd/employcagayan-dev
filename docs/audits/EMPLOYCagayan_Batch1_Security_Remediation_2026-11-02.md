# Batch 1 — qualification read scope

## Verified baseline (recorded before authoring the fix)

Primary checkout: PRIMARY_CHECKOUT, dev at ec2ab9805900b277bae3a582d53771e730deb366. Existing landing/video/navigation changes preserved.

Management get_project independently verified DEV cdmkzzmaswwiryymtycn, Trabaho Caravan Dev, ACTIVE_HEALTHY, db.cdmkzzmaswwiryymtycn.supabase.co. Hosted access was SELECT-only metadata; no applicant records.

Captured effective metadata: tests/fixtures/qualification-scope-dev-20261102.json.

Affected permissive SELECT policies:

- Staff view jobseeker education — app.is_event_staff().
- Staff view jobseeker skills — app.is_event_staff().
- Staff view jobseeker languages — app.is_event_staff().
- Staff view work experiences — staff/supervisor/medical/admin role list.

Authenticated SELECT grants exist. Applicable permissive policies OR together; restrictive policies AND that result. Generic identity/jobseeker-session/MFA checks do not impose geography. Synthetic checks on the first three do not supply ordinary-person municipality scope. Parent participants/jobseeker_profiles have restrictive supervisor scope, but these broad child reads do not consult those parents.

Existing scope is event participation→event.location compared case-insensitively with supervisor.jurisdiction, not residence alone. Provincial supervisors/admin retain existing broader parent access. Staff/medical parent reads are broader under existing policy; this task does not invent municipal staff/medical privileges or alter those roles. Any new staff/medical jurisdiction rule needs separate PESO policy approval.

Before authoring the migration, a local fictional fixture reproduced all four leaks: Municipality A supervisor saw one row in each table for Municipality B, while parent profile returned zero and get_jobseeker_match_profile raised 42501.

Baseline command: node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/qualification-scope-db.test.js

Result: 1 passed, 0 failed. Initial plain node --test attempt failed with V8 WebAssembly compiler OOM before assertions; single-task baseline compilation resolved the runtime issue without dependency changes.

## Corrected policy design

Prepared migration: **20261102090000_qualification_parent_read_scope.sql**

SHA-256: **81EBC78BD672DA5AF7E2CB9D6A68E9C279430338FBB932894B02EAEF1DE88505**

Four new AS RESTRICTIVE FOR SELECT TO authenticated policies require an existing, RLS-visible parent:

| Child | Parent visibility required |
| --- | --- |
| jobseeker_education | jobseeker_profiles.participant_id = child.jobseeker_profile_id |
| jobseeker_skills | jobseeker_profiles.participant_id = child.jobseeker_profile_id |
| jobseeker_languages | jobseeker_profiles.participant_id = child.jobseeker_profile_id |
| work_experiences | participants.id = child.participant_id |

The EXISTS subqueries run with caller visibility, not a new SECURITY DEFINER bypass. Existing permissive policies still determine whether owner/staff/admin access is possible, and all existing restrictive identity/MFA/synthetic conditions still apply. The additional parent gate is ANDed with them. A hidden/missing parent produces no child rows; other existing identity helpers can instead raise 42501.

No function, grant, role, account, data, matching formula, vacancy or UI change. No table/column/index changes. Parent primary keys already support these lookups. Work history keeps its existing participant relationship without requiring a new jobseeker profile.

The migration transaction verifies RLS is enabled on all six affected/parent tables and that the two parents retain restrictive supervisor, identity, jobseeker-session, MFA and synthetic SELECT protections. Missing prerequisites abort before policy creation. It is a one-time migration; an existing policy of the same name intentionally causes transaction failure rather than overwriting an unknown definition.

### Role/jurisdiction effects

| Identity | Effect demonstrated locally |
| --- | --- |
| Google jobseeker owner | Own reads/save/reload retained; other owner hidden |
| Municipal supervisors A/B | Matching event jurisdiction only; unknown location or absent supervisor jurisdiction fails closed |
| Provincial supervisor/admin | Existing authorized broader ordinary-record access retained |
| Staff/medical | Existing parent-authorized direct reads retained, not expanded. Current parent policy is broader than municipal-supervisor scope. A new staff/medical municipal or event-assignment rule requires PESO approval and a separate change. Medical matching RPC remains denied under its independent role rule. |
| Employer | Direct qualifications remain hidden; only existing guarded matching access for its authorized recruitment pool survives |
| Inactive, revoked, missing required AAL2/TOTP | No qualification rows, or existing 42501 denial |
| Anonymous | Existing SELECT grants do not grant RLS rows |
| DEV synthetic owner/personnel | Owner direct access preserved; staff/admin/provincial/medical cannot export classified synthetic qualifications. Work history now inherits the parent synthetic exclusion as well. |

Scope is the existing event-participation rule, not a newly invented residence rule. Parent-authorized staff/medical behavior is preserved; this report does not certify a new business-role policy.

## Files created

The following five files were added in the primary Windows checkout, with identical copies in the Codex worktree:

1. supabase/migrations/20261102090000_qualification_parent_read_scope.sql
2. tests/fixtures/qualification-scope-dev-20261102.json
3. tests/support/qualification-scope-database.js
4. tests/unit/qualification-scope-db.test.js
5. EMPLOYCagayan_Batch1_Security_Remediation_2026-11-02.md

No existing tracked application/test/config/dependency files were edited. The earlier comprehensive audit remains in the Codex worktree. Generated build output, if any, is isolated under the worktree's ignored artifacts/batch1-build-20261102 directory; the primary checkout's existing dist was not targeted.

## Regression evidence

All commands ran against the primary Windows checkout, Node v24.19.0. The in-memory PGlite harness reuses existing schema fixtures, adds already-deployed dependencies, then replaces relevant historical policies/functions with the fresh metadata snapshot. Synthetic rows are fictional and local. No network database client is imported by the test harness.

| Command | Result |
| --- | --- |
| node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/qualification-scope-db.test.js | **13 passed, 0 failed**, about13.6s: baseline reproduction1, corrected-policy tests11, prerequisite/atomic-abort test1 |
| node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/qualification-provenance-db.test.js tests/unit/recruitment-authorization-db.test.js tests/unit/intelligence-authorization-db.test.js tests/unit/matching-source-binding-db.test.js | **45 passed, 0 failed**, about13.4s |
| npm run lint | Exit0; 16 pre-existing warnings in unchanged source, no errors |
| node --check tests/support/qualification-scope-database.js | Exit0 |
| node --check tests/unit/qualification-scope-db.test.js | Exit0 |
| npx --no-install oxlint tests/support/qualification-scope-database.js tests/unit/qualification-scope-db.test.js | Exit0, no diagnostics |
| git diff --check | Exit0; new-file whitespace also inspected |
| npm run build -- --outDir WORKTREE_ROOT/ba65/EMPLOYCagayan/artifacts/batch1-build-20261102 | Environment failure writing Vite temporary config outside sandbox |
| npm run build -- --configLoader runner --outDir WORKTREE_ROOT/ba65/EMPLOYCagayan/artifacts/batch1-build-20261102 | Failed: seven unloadable existing OneDrive dependencies, cloud provider error404; same result outside sandbox |

Final security-test total: **58 passing tests**. Historical regression suites use their existing independently reconstructed migration stages; the new 13-test suite specifically installs the proposed migration over freshly captured effective policies. Do not mistake the historical suites for a full hosted/current-schema-stack replay.

An intermediate new-suite run had three harness/assertion failures: an already-deployed qualification invoker-helper repair missing from the historical fixture stack, MFA returning 42501 rather than an empty set, and a named-argument regprocedure lookup. These were corrected in the new test harness/assertions; no production permissions were relaxed. The final suite passes.

### Four-surface assertions

Every table is covered by owner/foreign-owner, municipal A/B, provincial/admin, staff/medical parent-authorized, employer, anonymous, AAL1, absent verified factor, inactive/revoked session and synthetic-record tests. Tests use SET ROLE authenticated with request.jwt.claims and real SQL RLS, not just helper booleans.

Representative PostgREST-shaped SELECT projections, embedded LEFT JOINs, aggregate counts, JSON/export-shaped projections and profile-to-child subqueries cannot return out-of-scope rows. An extra restrictive parent-deny policy also hides children even from broad admin policies, demonstrating the additional AND gate.

Existing get_jobseeker_match_profile is executed locally for owner, in-scope municipal, provincial, admin and staff; its four qualification arrays remain populated. Cross-owner/municipal/employer-pool denials and medical's independent RPC denial remain. Owner updates round-trip, and foreign deletes remain denied. The test compares captured function definitions after migration to confirm none changed.

Reader trace reviewed: educationService, skillService, languageService and workExperienceService query these tables directly; parent policies now constrain those requests regardless of selected columns. eligibilityService/matchingService use guarded matching RPCs. Supervisor reports/exports use existing scoped services; government Intelligence has independent admin authorization. Security-definer readers still require their own existing guards—the new policies are not claimed to control table owners or BYPASSRLS roles.

### Build limitation

Full build is **not verified**. Existing react/react-dom/use-sync-external-store production modules and other OneDrive-backed dependency files failed to load with “The cloud file provider exited unexpectedly” (OS error404). Retrying with Vite's runner config loader and outside the sandbox did not resolve it. No dependency installation/replacement or source change was attempted. This is an environment blocker, not evidence that the SQL migration broke the UI; nevertheless no green build or full application-regression claim is made.

PGlite validates PostgreSQL policies, grants and role/JWT behavior, but is not a real PostgREST HTTP server or hosted Supabase runtime. Vector transport uses the existing opaque test representation; no matching accuracy, embedding-provider performance or real-user UAT claim.

## DEV installation review — not executed

**Recommendation: GO for a separately authorized DEV-only installation/verification of this exact policy migration, subject to the read-only preflight below. NO-GO for application deployment, Production installation, broader role-policy changes or declaring authenticated matching UAT passed.**

The SQL-only security regression evidence supports the narrow DEV step. The unrelated environment build failure must remain visible and be resolved before any application deployment readiness claim.

Required next authorization is explicitly limited to applying this exact filename/SHA-256 to DEV cdmkzzmaswwiryymtycn and performing a separately defined authenticated synthetic verification/cleanup plan. Neither action has been performed. This report does not request or infer permission for Batch2.

Prerequisites before installation:

1. Independently reverify DEV ID/name/host; never use a production connection.
2. Confirm filename/hash and that it is not already installed.
3. Compare current child/parent policies, helper definitions, RLS flags and grants with the captured metadata; stop for review if they drift.
4. Confirm the existing broader staff/medical parent scope is the policy to preserve in this narrow repair. New jurisdiction rules require separate approved requirements.
5. Confirm parent keys/FKs and expected authenticated parent SELECT remain. No new grant or definer helper is needed.
6. Use a transaction/brief policy DDL lock window; retain prerequisite checks. The four policy statements perform no record backfill.

Impact: out-of-scope municipal reads now return no rows (or existing session denial), including counts/joins/export projections. Parent visibility adds per-query work; keyed lookups exist, but realistic hosted EXPLAIN/latency/pagination still needs verification. Existing owner/provincial/admin access and guarded employer matching remain as tested. Classified synthetic history becomes hidden from ordinary personnel through parent policy.

Rollback:

- Any prerequisite/DDL failure rolls back the transaction without a partial install.
- After a successful installation, prefer a reviewed forward correction. Removing the policies restores the confirmed leak.
- Emergency reversal, only under separate approval accepting that risk, is a transaction dropping qualification_parent_read_scope on the four named tables. Do not remove parent identity/MFA/synthetic/jurisdiction policies or broaden grants.
- A safer incident containment is to pause affected personnel access pending a forward fix, under separately authorized operations; this task does not change accounts or permissions for containment.

Future authenticated DEV verification must repeat owner/2 municipal/provincial/admin/staff/medical/employer/inactive/AAL1 cases through actual Data API GET, count/head, embedded joins and exports using designated fictional fixtures. Verify existing RPC scope and synthetic exclusions, record sanitized outcomes and measured query latency, then perform approved cleanup. No real applicant data is needed.

**Hosted DEV remains unchanged. No account/auth/MFA setting, Production, application UI, score, vacancy, dependency, commit, push or deployment action was performed.**
