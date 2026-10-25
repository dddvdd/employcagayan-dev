# EMPLOYCagayan DEV baseline audit

Observed: 12 October 2026 (Asia/Manila). Milestone 1 of the supplied development goal.

Subsequent implementation and test evidence is tracked in [DEV_AUTH_MILESTONE.md](DEV_AUTH_MILESTONE.md). The original baseline findings below remain a record of the audited starting state.

This is a baseline of the actual working tree and connected DEV schema. Existing changes were preserved. A module's presence, a successful build, and old test logs are not evidence that its workflow works end to end. No production project or website was queried or modified.

## Environment and evidence

- Authorized DEV: `cdmkzzmaswwiryymtycn`. Supabase management `get_project` returned that exact ID/ref, an active healthy project, and database host `db.cdmkzzmaswwiryymtycn.supabase.co`. `get_project_url` returned `https://cdmkzzmaswwiryymtycn.supabase.co` before every SQL operation.
- Every SQL call explicitly supplied that verified project ID and consisted of catalog reads. No database writes, migrations, account creation, destructive tests, or deployments occurred.
- `.env.local` and `.env.test` URLs and the CLI link file agree with DEV. Those local files are supporting evidence, not independent connection verification. Values of keys, credentials, and saved browser sessions were not printed. `.env.test` contains a service-role variable; it was not used.
- Protected production: `aneuboyuelkblxenjkrh`. The `supabase-production/` directory was not used as a DEV schema source.
- Runtime: Node `v24.13.0`; React/Vite; npm scripts invoked via `npm.cmd` because PowerShell blocks `npm.ps1`.
- No applicable ancestor/root `AGENTS.md` was found. `strix/` has its own instructions but is outside this application audit. No agents were delegated.
- Schema evidence, including function definitions, settings, grants, catalog counts and migration history, is saved in `artifacts/dev-baseline-20261012/dev-catalog.json`. It contains schema metadata, not personal records or secrets.

## Architecture and authoritative identities

`src/main.jsx` defines the routes and installs `AuthProvider`, the storage adapter, error boundary and toast provider. `src/App.jsx` routes signed-in users to role homes. `src/components/auth/ProtectedRoute.jsx` checks account activation and allowed roles in React.

`src/contexts/AuthContext.jsx` restores Supabase sessions, reads `profiles`, subscribes to auth events, and exposes OAuth/password/logout. `src/services/authService.js` wraps Supabase Auth. `profileService.js` reads the canonical `profiles` table; user-editable metadata must not become a permission source.

The actual role vocabulary is `applicant`, `employer`, `staff`, `supervisor`, `medical`, `admin` (`src/domain/roles.js`). The first five requested user categories map to these canonical values; `medical` also exists and needs an explicit policy rather than being discarded.

The identity chain is `auth.users.id -> profiles.id`, and separately `auth.users.id -> participants.auth_user_id -> participants.id -> jobseeker_profiles.participant_id`. Child education, skills, languages, and preference rows use the participant/profile identifier. `participant_id` is not `auth.uid()`. `participantService` resolves it through `get_or_create_participant`; the DEV function derives ownership from `auth.uid()` but currently creates a participant for any authenticated role without checking jobseeker eligibility.

Pages mostly call services in `src/services`, composed by hooks in `src/hooks`; pure validation/matching logic resides in `src/domain`. No separate repository layer needs to be invented. Direct client queries still exist in onboarding and several pages. The backend consists of Supabase Postgres, Auth, private Storage buckets, RLS, RPCs, and the `extract-employment` Edge Function. The canonical recruitment model uses `vacancy_definitions`, `event_vacancies`, `applications`, `participants`, and `event_participations`; legacy tables/views coexist for compatibility.

## Feature inventory

Statuses apply to the scope stated in the evidence column. WORKING means exercised behavior, not a whole portal implied by one unit test.

| Feature | Status | Evidence / limit |
| --- | --- | --- |
| Local compilation | WORKING | `npm.cmd run build` exits 0; bundle and import warnings remain. |
| Source lint | WORKING | `npm.cmd run lint` exits 0 with 15 warnings. |
| Anonymous login rendering and mobile width | WORKING | Isolated Chromium checks of controls and 390px viewport pass. |
| Anonymous admin route guard | WORKING | Isolated browser direct `/admin/dashboard` redirects to `/login`. Does not prove database authorization. |
| Unified Jobseeker/Partner gateway | NOT IMPLEMENTED | Current login always displays password controls; no category selector. Google returns to `/register` for all roles. |
| Jobseeker Google-only authentication | PARTIALLY WORKING | OAuth wrapper exists, but password sign-in is not restricted by resolved account role and auth provider configuration was not checked. No real OAuth round trip run. |
| Returning-user / first-time onboarding routing | BROKEN | `/register` permits applicant/employer only, so staff/admin Google callback cannot reach its role home through that route. Registration calls participant creation before checking a jobseeker identity. |
| Partner session restoration | BROKEN | Local restore reads MFA-protected `profiles`; DEV pre-request rejects a Partner at AAL1. Catch treats failure as inactive and signs out. Existing safe bootstrap RPC is unused. No real account login run. |
| TOTP enrollment/challenge/recovery UI | NOT IMPLEMENTED | No MFA calls, TOTP UI, or MFA route in `src`. |
| Partner backend MFA | PARTIALLY WORKING | DEV has restrictive policies on 71 public tables plus Storage and a PostgREST pre-request hook. Bypass matrix, factor lifecycle and recovery not yet tested. Missing locally. |
| Partner identity linking | NOT VERIFIED | No real password-account/Google-linking scenario exercised; do not create a second identity to work around this. |
| Jobseeker birthday conversion | WORKING | Calendar round trip, leap-day rejection and age boundaries tested. Future dates within the current year require follow-up validation review. |
| Province/city/barangay hierarchy validator | WORKING | Valid PSGC hierarchy and cross-province/city rejection tested. Live mirror availability and async cascade persistence unverified. |
| Onboarding education mapping | WORKING | Canonical code and current-school mapping tested in isolation. This does not verify database persistence. |
| Education persistence | PARTIALLY WORKING | Local service and registration sync migration exist; DEV has different trigger-based sync and missing local migration history. No save/reload account test. |
| Skills add/edit/save/reload | NOT VERIFIED | `skillService` resolves participant, uses `self_reported` and unverified source, then returns joined skill data. RLS and browser round trip untested. |
| Language persistence | NOT VERIFIED | Service resolves participant and returns joined language metadata on writes. No account round trip. |
| Profile daily-save restriction | PARTIALLY WORKING | DEV enforcement trigger absent; old function and counter table remain. Local removal migration is not in the DEV ledger. Do not blindly reapply it. |
| Resume/accreditation storage | PARTIALLY WORKING | Both buckets are private PDFs capped at 5 MiB; ownership policies and signed URLs exist. Cross-organization document access, content validation and upload/reload not tested. |
| Job browsing/applications/history | NOT VERIFIED | Public routes and application/recruitment services exist with canonical migrations. No real application or reload/status test. |
| Employer registration | BROKEN | Completion calls admin `employerService.create`, which overwrites pending/self-registration with approved/admin values; pending-only self-insert policy rejects it. Source-level defect, no successful privilege bypass claimed. |
| Employer accreditation/approval | NOT VERIFIED | Existing admin approval RPC and accreditation services/dashboard exist. Workflow must be preserved; no approval test run. |
| Employer company/vacancy/applicant management | NOT VERIFIED | Dashboard/services and organization-scoped recruitment RPC definitions exist; role, approval and cross-organization cases untested. |
| Staff/supervisor/admin/medical dashboards | NOT VERIFIED | Routes/pages/services exist. Authenticated rendering, jurisdiction and data visibility not tested. |
| Event/check-in/recruitment coordination | NOT VERIFIED | Scanner, manual search, walk-in, interview pages and RPCs exist. Existing event check-in application gate migration retained. |
| Outcomes/follow-ups/program reporting/export | NOT VERIFIED | Existing operational services, program tables, analytics and report pages. No export or representative-data reconciliation run. |
| PSOC / skills / provenance foundation | PARTIALLY WORKING | DEV taxonomy tables exist: 10 occupations, 16 skills, 4 occupation-skill links, 5 sources, 22 mappings. Canonical coverage and source verification not established. |
| Deterministic eligibility | BROKEN | Missing mandatory education/skills/experience/certification/language records cause ineligibility. Five executed TODO assertions document the goal violation. |
| Deterministic scoring / explanations | PARTIALLY WORKING | Version, twelve components, evidence, bounds and vacancy tie breaker tested. Other boundary cases and education vocabulary/ranks unverified. |
| Hybrid / pgvector matching | PARTIALLY WORKING | DEV vector extension and embedding model exist; missing/stale/failed semantic fallback tested. Embedding generation, retrieval authorization and ranking quality untested. |
| LLM extraction / confirmation | PARTIALLY WORKING | Edge handler injects dependencies, checks verified identity/active canonical role and quota; AI review services exist. Provider execution, deployment parity, MFA denial and confirmed canonical writes untested. |

## Confirmed defects and security observations

1. **DEV/local schema drift blocks reproducibility.** DEV has six October 6 migrations absent locally: `20261006115723` education/profile saves, `20261006115728` preferences, `20261006200041` Partner login MFA, `20261006200423` anonymous API compatibility, `20261006202259` education helper access, and `20261006203204` employer TOTP. Local September 23 files for daily saves/reference catalogs/registration education and the September 27 AI rate limit are absent from the DEV migration ledger. The two local admin hardening migrations have duplicated bodies; only `20260923070632` is in the DEV ledger. A local baseline dump does not appear as a DEV ledger entry, which may be deliberate reconstruction rather than proof of missing schema. Reconcile definitions and history before any migration push.

2. **Local frontend cannot complete the existing DEV MFA flow.** `app.partner_mfa_satisfied()` requires AAL2 for employer/staff/supervisor/admin regardless of login provider. For medical it requires AAL2 only if a verified factor exists. `authenticator` has `pgrst.db_pre_request=public.quest_enforce_partner_mfa`; the sole path exemption is `/rpc/auth_account_bootstrap`. The bootstrap reads only the caller's own canonical profile and is granted to authenticated/service-role, not anonymous. Local auth still queries `profiles` before MFA and has no enrollment/challenge route. Do not remove those restrictions to make login work.

3. **Employer registration uses the wrong write operation.** `CompleteEmployerRegistration.jsx` submits `pending`, but `employerService.create()` replaces it with `approved` and replaces source with `admin`. The caller's self-service insert policy requires `pending` and local employer type. Split the existing service's admin creation from pending self-registration; do not add parallel employer tables.

4. **User-controlled signup metadata currently sets employer role.** DEV `app.create_profile_for_new_user()` accepts applicant/employer from `raw_user_meta_data.role`, marks the profile active, and downgrades other requested roles to applicant. This is confirmed role creation, but employer approval predicates may still prevent individual privileged operations; a full escalation matrix is needed. `CompleteEmployerRegistration` also attempts a role update. Account roles/approved associations must be resolved server-side, never by a login category or user-editable metadata. The self-update profile policy only permits an existing employer to remain employer, so the attempted applicant role update is not a demonstrated escalation.

5. **Missing qualifications cause unjustified exclusion.** Five pure-domain reproductions evaluate an empty candidate against one mandatory requirement each and return `ineligible`, where the mission requires review/unknown. `rankMatches` excludes ineligible by default, so incomplete candidates lose recommendations. Record missing/unverified evidence separately from a confirmed failure; keep unrestricted job browsing/application access available.

6. **Consent is overwritten by the save RPC.** The observed DEV `save_jobseeker_profile` writes `data_subject_rights_agreed=true` on both insert and update, regardless of submitted consent. Verify consent semantics and preserve an actual recorded decision rather than automatically manufacturing one.

7. **RLS/storage positives have limited scope.** All 71 observed public ordinary tables have RLS enabled. Both compatibility views use `security_invoker=true`; both document buckets are private. Restrictive MFA policies preserve existing permissive ownership rules. These catalog facts do not prove policy correctness, prevent every SECURITY DEFINER bypass, or establish proper organization/jurisdiction boundaries.

8. **Further risks requiring tests.** Logout updates the session but does not explicitly clear the cached profile; async profile fetches are not generation-guarded. Auth callbacks issue profile requests synchronously, so examine the documented auth-callback locking constraints. Deterministic experience calculations use wall-clock time even when a date is supplied elsewhere. Local education ranks/codes differ from the eligibility fallback vocabulary. Candidate ranking's tie breaker needs a candidate-shaped fixture. Recovery has no verified process. These are review findings, not claimed successful exploits.

## Reproducible baseline

Before this milestone, `package.json` had no test scripts and `tests/` contained empty helper/support directories; Playwright config/test sources were absent. Existing logs/screenshots and saved auth files were not reused as proof or credentials.

Added `npm.cmd test` using Node's test runner and `npm.cmd run test:browser` using installed Playwright/Chromium. Browser tests intercept all non-local requests and return synthetic empty responses: no real Supabase/Auth/provider traffic occurs. The test server binds loopback and uses the existing Vite HTTPS setup. Browser outcomes prove only rendering and anonymous route behavior.

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | PASS, exit 0; 15 warnings (unused code, effect dependencies, unnecessary catches and Fast Refresh). |
| `npm.cmd run build` | PASS, exit 0; ~2.56 MB main JS / ~646 kB gzip, large chunk and ineffective dynamic-import warnings. No deployment. |
| `npm.cmd test` | 16 executed: 11 pass, 5 expected failing TODO requirements, 0 ordinary failures. TODOs are unresolved defects, not passes. |
| Chromium isolated baseline | PASS, exit 0; 3 tests: accessible controls, 390px mobile width, anonymous admin redirect. Initial shell-server teardown stalled and required stopping the two server processes launched by that run. Vite lifecycle moved into the runner to avoid shell-tree cleanup. |
| Connected DEV catalog reads | Successful after independent project verification each time. No live authenticated authorization or data mutation tests performed. |
| OAuth/TOTP/database integration | NOT RUN; no suitable explicitly designated test accounts used. |

The first unit run exposed education's missing-data defect as an ordinary failure (11 pass, 1 fail, 4 TODO). It was moved into the same explicit TODO classification as the other four after source review, without changing application behavior. Do not describe the suite as full functional acceptance.

## Smallest safe implementation path

1. **Capture/reconcile existing DEV auth definitions locally.** Compare the missing migrations and effective grants/policies; retain restrictive MFA and the pre-request hook. Preserve the authenticated self-only bootstrap exception. Obtain narrowly scoped bootstrap state (role, activation and employer approval/association) without allowing arbitrary IDs or writes.
2. **Repair session state and identity routing.** Use the existing bootstrap for pre-MFA role resolution; add cancellable/deferred auth event handling, explicit logout cleanup, fail-closed error/retry states, and authoritative AAL/factor refresh. Return OAuth to a role-aware callback. Resolve existing roles and approved employer associations before creating a jobseeker participant; use the actual identity chain.
3. **Implement the unified gateway and TOTP route together.** Jobseeker is Google-only; Partner offers Google/password. Category is UI state. Existing approved identities retain canonical roles. Mandatory roles enroll a TOTP or challenge a verified factor before accessing any protected Partner route. Refresh authoritative AAL after verification and token changes. Preserve medical and pending accreditation behavior through an explicit policy decision.
4. **Verify backend access and recovery.** Test AAL1/AAL2, direct tables, RPCs, Storage, cross-organization/jurisdiction, inactive identities, unknown identities, spoofed metadata and callback bypass with designated DEV fixtures and cleanup. Check PostgREST pre-request coverage and SECURITY DEFINER direct-call surfaces. Recovery must use an authorized, audited identity-verification procedure with session revocation and re-enrollment; no public factor-reset bypass.
5. **Stabilize core persistence.** Repair pending employer registration first, then verify onboarding/profile/education/skills/languages/date/address/resume and application round trips. Reconcile actual daily-limit removal without dropping unrelated throttles. Verify approval, organization-scoped applicants, events, reporting and outcomes.
6. **Extend the existing intelligence engine.** Fix all five missing-evidence exclusions and deterministic date/rank handling. Review source-backed PSOC/taxonomy provenance and versions, transfer relationships and skill mappings before expanding catalogs. Preserve dominant structured scoring, explicit confidence and deterministic eligibility; semantic and LLM output stay supporting signals. Establish a reviewed validation dataset before claiming ranking quality or employment probability.

## Milestone report

- **Milestone:** Goal 1 baseline audit and reproducible local verification.
- **Environment verified:** Independent management ID/ref/database host/API URL check; repeated API URL verification before each catalog-only SQL call; DEV only.
- **Implemented:** This evidence-based audit, sanitized schema evidence, local unit regression baseline and isolated browser checks.
- **Files changed:** `DEV_BASELINE_AUDIT.md`, `package.json`, `playwright.config.js`, `tests/unit/dev-baseline.test.js`, `tests/browser/dev-baseline.spec.js`, `tests/browser/local-server.js`, `artifacts/dev-baseline-20261012/dev-catalog.json`. Generated build/test artifacts are ignored. Pre-existing edits retained.
- **Database migrations:** None applied or created in this milestone; existing drift explicitly recorded.
- **Tests executed:** Lint, build, 16 unit assertions, 3 isolated browser checks, DEV catalog inspection.
- **Passed/failed:** Lint/build pass; unit 11 pass + 5 unresolved TODO failures; browser 3 pass, exit 0. After moving Vite into the runner, the browser suite completed in 9.1 seconds with normal teardown. `git diff --check -- package.json` also passes.
- **Security observations:** Existing DEV restrictive MFA protection, RLS and private buckets preserved; metadata-derived employer role, consent overwrite and source/schema mismatch require remediation/testing.
- **Outstanding defects:** Unified gateway, frontend TOTP/recovery, Partner bootstrap/session restore, employer self-registration, unknown-evidence matching and complete authorization/workflow verification.
- **Next action:** Reconcile the existing DEV auth contract and implement tested session/bootstrap/routing support, followed by unified login and MFA without weakening backend enforcement.
- **Git commits/pushes:** None.
- **Production modified:** No.
