# Authentication milestone 2A

20 October 2026 local hardening: the Partner route gate now requires the current Auth session to report AAL2 and a verified TOTP factor even when the account bootstrap reports `mfa_satisfied=true`. A bootstrap denial still locks access. This closes a client-side stale/inconsistent-bootstrap gap; backend authorization remains authoritative. The focused unit suite passed 16/16, the existing intercepted-browser auth suite passed 25/25, and the new inconsistent-bootstrap route test passed 1/1. Lint and local build passed (existing warnings). No database operation, deployment, Git publication or Production change occurred. Signed Partner acceptance remains unverified.

19 October 2026 follow-up: `DEV_GOOGLE_JOBSEEKER_SIGNIN_MILESTONE.md` records the corrected DEV OAuth callback, a verified returning Google jobseeker session, explicit account selection and the designated new Google applicant reaching `/register`. Profile submission and existing password-Partner identity linking remain unverified. Historical findings below are retained as originally observed.

Subsequent backend implementation and signed-session evidence are recorded in
`DEV_IDENTITY_MILESTONE.md`. The findings below describe this historical milestone.

12 October 2026 (Asia/Manila). The prior goal turn made verified progress: it established the baseline, found DEV/local schema drift, and reproduced five matching defects. This milestone implements the local authentication flow and restores historical DEV migration files. Goals 2 and 3 remain partially complete pending the backend and live checks below.

## Implemented behavior

- `/login` has native Jobseeker/Partner radio controls. Jobseeker offers Google; Partner offers Google or email/password. Category is local presentation state and is never sent as a role or permission claim.
- OAuth returns to `/auth/callback` on the current origin. The existing Supabase Google callback remains the provider callback; DEV must allow the application's local return URL.
- Session initialization reads `auth_account_bootstrap`, the already-existing self-only pre-MFA RPC, instead of querying the protected profiles table at AAL1. It validates the returned ID and canonical role and reads Auth assurance/factors. Network failure denies access and offers retry rather than treating a failed read as account deactivation.
- Deferred auth processing and revision checks discard stale results on logout, account switch, token refresh and unmount. Missing/unknown/inactive profiles stay denied. Supabase auth events remain synchronous; account requests run outside their callback.
- Employer/staff/supervisor/admin routes require AAL2, even with no enrolled factor. The existing DEV medical policy is retained: a verified factor makes MFA mandatory. Applicant protected routes reject password-only authentication in the frontend.
- `/auth/mfa` supports TOTP enrollment, QR/manual key, challenge verification, code failure/retry, factor selection, cancellation of the caller's unfinished setup and logout. Starting setup replaces only unverified TOTP factors whose friendly name belongs to EMPLOYCagayan; verified factors are never removed by this flow.
- Post-verification routing depends on freshly read AAL/account state. The enrollment secret is held only in component memory. MFA and callback components are keyed by authenticated identity, so another signed-in account cannot inherit the prior secret or redirect decision.
- Role-aware callbacks send Partners through MFA to their canonical role homes. Google applicants are checked for an employer association before participant/profile reads. Existing jobseekers reach their profile; new jobseekers reach onboarding. A validated same-site event intent can be recovered. Participant IDs are resolved through `participants.auth_user_id`, never assumed equal to Auth IDs.
- Employer callbacks preserve the pending accreditation completion destination only when its locally saved email matches the authenticated email. The local hint cannot assign a role. Employer access to jobseeker onboarding was removed from the route map.
- README instructions reflect `/auth/callback`, local HTTPS return destinations and the DEV-only assignment.

## Historical migration recovery

Independent Supabase management API URL verification returned `https://cdmkzzmaswwiryymtycn.supabase.co` immediately before the read of DEV migration history. The SQL call explicitly targeted that project ID. Only schema migration history was read; no connected database mutations occurred.

Recovered the following exact historical bodies locally, with two provenance comment lines prepended:

1. `20261006115723_functional_audit_education_and_profile_saves.sql`
2. `20261006115728_functional_audit_preference_save.sql`
3. `20261006200041_partner_login_mfa.sql`
4. `20261006200423_partner_mfa_anonymous_api_access.sql`
5. `20261006202259_internal_education_helper_access.sql`
6. `20261006203204_employer_mandatory_totp.sql`

`artifacts/auth-milestone-20261012/recovered-ledger.json` records the observed ledger bodies. A unit test verifies normalized local bodies match all six. These are restored history, not newly invented migrations, and were not reapplied. The September local/DEV mismatches in the baseline still require reconciliation before a migration push. Do not blindly push the local migration directory.

The installed CLI's version/help commands failed while attempting a telemetry write outside the workspace. Recovery used the connected, verified DEV ledger instead. No new schema migration was created in this milestone.

## Verification scope

The unit suite has 44 tests: **39 pass, 0 ordinary failures, 5 executing failing TODO requirements**. The five TODOs remain the previously confirmed missing-qualification exclusions; they are not passes. TAP evidence is in `artifacts/auth-milestone-20261012/unit-tests.tap`.

Fifteen auth policy/session tests exercise mandatory-role gating, account validation, deferred callbacks, stale-response rejection, logout races, account switch, assurance refresh/downgrade, failure/retry and unmount. Twelve database tests execute the actual recovered MFA migrations in PGlite against a minimal ownership schema, including AAL1/AAL2, missing assurance, bootstrap path/grants, metadata spoofing, inactive identities, medical behavior, Storage isolation, and the authenticator hook setting. These tests establish isolated SQL behavior; they do not prove a live PostgREST or cryptographically signed Auth request behaves identically.

The final browser suite has **27 passing isolated checks**, exit 0, in 30.8 seconds. Evidence is in `artifacts/auth-milestone-20261012/browser-tests.txt`. Tests intercept every non-local HTTP request and Supabase WebSocket; JWT-shaped fixtures and setup keys are synthetic and never reach a real Supabase project. They cover:

- Google-only Jobseeker UI, Partner password UI, OAuth callback URL without category permissions.
- Direct protected routes for all four mandatory Partner roles at AAL1.
- TOTP enrollment/manual key, invalid-code retry, cancellation, logout, inactive/mismatched bootstrap and network retry.
- Existing/new Google jobseekers and participant relationship resolution; metadata-spoofed role ignored; password applicants denied by the frontend.
- Employer association lookup before jobseeker creation and matching/cross-account pending accreditation hints.
- Session downgrade and identity-switch secret clearing.
- Rechecking factor status before cancellation and preserving another application's unfinished factor.
- Desktop, 390px mobile, 1920px wide dark-theme login and mobile MFA layout/recovery guidance.

Visual inspection of `login-desktop.png`, `login-mobile.png`, `login-wide.png` and `mfa-mobile.png` in `artifacts/auth-milestone-20261012` found readable controls, visible focus and no horizontal overflow. Screenshots show anonymous UI or synthetic fixtures, not real secrets or personal records.

Build and lint pass. Lint retains the baseline 15 warnings; new callback effect dependencies were corrected. The ~2.57 MB main JS and ineffective dynamic import warnings remain. One added browser test initially used the wrong case for the existing Staff layout's `Sign Out` label; correcting the test selector made the session-downgrade check pass. No application behavior was weakened to satisfy it.

Current API usage was checked against the installed Supabase Auth SDK, [TOTP documentation](https://supabase.com/docs/guides/auth/auth-mfa/totp), [MFA enforcement documentation](https://supabase.com/docs/guides/auth/auth-mfa), and the [changelog](https://supabase.com/changelog). The interface and frontend design skills informed the existing-style, native-control layout; the Supabase and Postgres skills informed the auth/RLS checks.

## Remaining requirements and next milestone

1. **Backend identity and provider policy:** Existing DEV signup still accepts employer role from editable signup metadata. Frontend Google-only guards do not prevent direct Auth/API password use. Introduce authoritative, approval-aware server resolution and jobseeker provider/ownership enforcement. Check employer associations on every creation path, including direct onboarding RPCs, rather than relying on the callback.
2. **Employer onboarding:** Completion still calls the admin creation operation and attempts a profile role update. Split pending self-registration from admin-approved creation and preserve accreditation. Resolve pending/approved associations without giving a public signup Partner privileges or creating duplicate privileged identities.
3. **Backend MFA coverage:** Validate real DEV signed sessions through tables, RPCs, views, Storage and Edge Functions. PostgREST's pre-request gate has been restored/tested in isolation; direct SQL/SECURITY DEFINER paths, credential revocation, organization and jurisdiction boundaries require comprehensive tests. Preserve all existing ownership/RLS predicates.
4. **Recovery:** The UI provides safe locked guidance, not a completed recovery workflow. Implement a restricted, audited administrative process for identity verification, session revocation and authenticator re-enrollment, with no public factor-reset bypass. Confirm authorization and failure paths.
5. **Live OAuth/linking:** Verify DEV provider/redirect configuration, real Google round trips, linking to existing password Partner identities, no duplicate account, session refresh, logout and device enrollment with suitable DEV test identities. No saved real sessions or service-role keys have been used for this milestone.
6. **Core workflows and intelligence:** Continue the baseline's persistence, consent, application, approval, reporting and matching milestones. Unknown-evidence matching tests remain unresolved. This auth increment does not mark those features complete.

## Required progress report

**Milestone:** 2A — local unified gateway, session/routing repair, TOTP UI, recovered DEV auth history and isolated authorization tests.

**Environment verified:** Exact DEV API URL through management tools before the sole connected SQL read; explicit DEV project argument. Browser and PGlite tests are local and isolated.

**What was implemented:** The behavior described above. No new tables, permission role from a category, or RLS relaxation.

**Files changed:**

- `src/contexts/AuthContext.jsx`, `src/services/authService.js`, `src/services/participantService.js`.
- `src/domain/authPolicy.js`, `src/domain/authSession.js`.
- `src/pages/Public/LoginPage.jsx`, `src/pages/Public/AuthCallbackPage.jsx`, `src/pages/Public/MfaPage.jsx`.
- `src/components/auth/ProtectedRoute.jsx`, `src/components/auth/AccountAccessState.jsx`, `src/components/RouteDocumentTitle.jsx`, `src/main.jsx`, `src/App.jsx`.
- Six recovered `supabase/migrations/20261006*.sql` files listed above.
- `tests/unit/auth-session.test.js`, `tests/unit/partner-mfa-db.test.js`, `tests/unit/migration-recovery.test.js`, `tests/browser/auth-fixture.js`, `tests/browser/auth-flow.spec.js`, `tests/browser/dev-baseline.spec.js`.
- `README.md`, `DEV_AUTH_MILESTONE.md`, evidence/screenshots/TAP in `artifacts/auth-milestone-20261012/`. Baseline audit gets a follow-up pointer only. Existing unrelated edits remain preserved.

**Database migrations:** Six historical migrations restored locally; zero applied to any connected database. No new migration or database write.

**Tests executed:** Unit/session/isolated Postgres/ledger checks; isolated Chromium browser checks; lint; build; visual screenshot review; whitespace diff checks.

**Tests passed/failed:** Unit 39 pass + 5 unresolved TODO failures; final browser suite 27 pass; final build/lint pass with baseline warnings; whitespace diff checks pass. Live Google/Auth/API tests not run.

**Security observations:** Existing DEV backend MFA retained; pre-MFA bootstrap now used correctly; stale authorization and cross-account enrollment state discarded; only caller-owned unfinished setup is cancellable. Signup roles, provider enforcement and recovery require backend work.

**Outstanding defects:** Backend Google-only/approval authority, employer pending registration, complete recovery, live integration verification, remaining schema drift, consent and core-workflow defects, five matching exclusions.

**Next recommended action:** Implement and test the backend identity/approval/provider contract and correct pending employer writes, then exercise signed DEV MFA bypass and recovery cases.

**Git commits/pushes:** None.

**Production modified:** No.
