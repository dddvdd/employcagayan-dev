# EMPLOYCagayan — Milestone 3C

October 13, 2026. Resume, application and organizational authorization hardening.

Confirmed fixes are implemented locally and applied to verified DEV. Database/browser regressions and signed Partner/PESO API/Storage checks pass within the scope below. Real Google jobseeker acceptance and identity linking remain unverified; this is not an unconditional declaration that every acceptance criterion or the overall development goal is complete.

## 1. Actual environment

Work remained in the existing EMPLOYCagayan directory, as instructed. The configured jobfair-web sibling does not exist; no project was moved. Both .env.local and .env.test resolve to https://cdmkzzmaswwiryymtycn.supabase.co with public client keys. Each connected operation was preceded by independent management URL verification. SQL inspection confirmed database/current_user/session_user = postgres. Live harnesses additionally restrict every outbound request to that exact DEV HTTPS origin and require actual Auth-issued authenticated sessions for ordinary acceptance.

Only DEV project cdmkzzmaswwiryymtycn was contacted. Protected Production aneuboyuelkblxenjkrh and https://employ-cagayan.vercel.app/ were not contacted or modified. No commits, pushes or deployments were performed. Build output contains neither the fixture service credential nor the protected Production ref/URL. Service credentials prepared and removed synthetic fixtures; they did not satisfy ordinary acceptance calls.

## 2. Confirmed defects and corrections

| Reproduction | Root cause and correction |
| --- | --- |
| Pending employer with real signed TOTP session retrieved synthetic candidate contacts through get_employer_applicants. | Legacy definer RPC checked ownership without approval/session assurance. It now requires an active approved owned employer and mandatory TOTP; anonymous execution is revoked. |
| Password candidate with pending-company TOTP submitted a real synthetic application despite the Google-only jobseeker policy. | General Partner identity checks did not enforce the jobseeker channel. Jobseeker submission, history, withdrawal and registration RPCs now require the established Google identity gate; application RLS adds the corresponding purpose restriction. |
| Municipal supervisor downloaded an out-of-jurisdiction synthetic PDF with a real signed session. | Global staff resume read included municipal supervisors. Participants, profiles and resume reads now follow the existing supervisor event/jurisdiction predicate, retaining established provincial, staff, administrator and medical oversight. |
| Isolated baseline profile writer accepted another account's resume path. | Resume references had no parent-owner/object validation. A trigger now verifies canonical participant.auth_user_id, namespace, real object metadata, PDF MIME and the existing 5 MiB limit. |
| Isolated Google candidate without onboarding created an application that the employer inbox omitted. | Submission allowed absent profile while the inbox required that profile. Submission now requires an existing profile and explicit consent. |
| Isolated disabled company owner could call the publication definer. | Definer lacked an independent active-session check. Publish/close now require it. Existing REST middleware already rejected inactive accounts; no live HTTP bypass was established for this case. |
| Browser Admin application update announced success without a PATCH. | A PostgREST promise was not awaited. The service now awaits the write and permits only status/notes payload fields. |
| Browser Supervisor detail requests never executed. | Three queries passed unawaited promises to unwrap. They now execute; detail cards remain disabled while overview scope loads. |

The audit also established that the private resume bucket had no employer document-read policy, so the newly exposed legitimate inbox download needed a narrowly scoped policy. Approved employers receive only the current canonical resume associated with an active applied/shortlisted formal application to their owned approved company. Legacy event-interest contacts remain an existing approved-company workflow; interest alone does not grant resume access.

The owner resume interface now uploads a random path in the signed user's namespace, links it through a self-only RPC with a previous-path concurrency check, downloads authenticated bytes, and unlinks before deletion. Replacement rolls back the new upload if linking fails and reports cleanup failures for retry. Profile saves that omit resume_path preserve the existing reference. Bucket privacy and the established application status/duplicate rules remain intact. No genuine resume references were mass-rewritten.

## 3. Files changed

Source: src/services/resumeStorage.js, participantService.js, applicationService.js, supervisorService.js; src/storage/storageService.js, supabaseStorage.js; src/components/jobseeker/ResumeManager.jsx; src/pages/Public/ProfilePage.jsx; src/pages/Employer/EmployerInboxPage.jsx; src/pages/Admin/ApplicationTracking.jsx; src/pages/Supervisor/SupervisorDashboard.jsx.

Tests: tests/support/recruitment-database.js, recruitment-fixture.js; tests/unit/recruitment-audit-db.test.js, recruitment-authorization-db.test.js, profile-persistence-db.test.js, qualification-provenance-db.test.js; tests/browser/auth-fixture.js, recruitment-workflow.spec.js; tests/integration/dev-recruitment.js, dev-oauth-observation.js.

Documentation/evidence: this report, README.md, the versioned migration, and artifacts/recruitment-milestone-20261013/. Evidence includes sanitized catalog snapshots, live baseline/final/diagnostic results, unit/browser/lint/build logs, environment checks, advisor summaries and final DEV assertions. No passwords, JWTs, TOTP secrets or signed URL tokens are written to these artifacts.

## 4. Applied migration

20261013042419_recruitment_resume_authorization.sql was applied only to verified DEV. Its entire 33,265-byte body exactly matches the independently retrieved DEV migration ledger; local filename and test helper were aligned with that ledger timestamp. SHA-256: a03c9d2f84424b201fe5c142cad1a7bf2cda33f1e8a5aa6f16d3677a2eab7f68.

The migration adds private authorization/reference/audit helpers, narrowly scoped restrictive policies, the self-only resume RPC, and authorization guards to the existing recruitment RPCs. Existing canonical tables, identity bindings, duplicates, status transitions, jurisdiction rules and qualification provenance guards were preserved.

Two connector writes returned Invalid or expired requestState without applying anything. Ledger inspection confirmed no change. Separating verification from the write call succeeded; reconnection is no longer required. No approval rejection or Production fallback occurred.

## 5. Tests passed and failed

| Check | Result |
| --- | --- |
| Full Node suite | 118 cases: 113 passed, zero ordinary failures, five executed pre-existing matching TODO failures. |
| Composed profile/qualification/recruitment database rerun after ledger alignment | 34 passed: profile 10, qualification 7, recruitment authorization 17. |
| Pre-fix isolated database reproductions | Six baseline cases reproduce the defects. These are intentional assertions of historical behavior. |
| Complete isolated Playwright suite | All 45 passed, including five new recruitment/resume workflows. External traffic is intercepted. |
| Signed live DEV baseline | Three defect groups reproduced, 125 guarded requests, nine synthetic accounts; cleanup complete. |
| Signed live DEV final verification | Ten recorded checks, 177 guarded requests, nine synthetic accounts; all assertions passed and cleanup complete. Two checks contain scoped cache diagnostics. |
| Existing signed Auth regression after migration | Seven groups, 44 guarded requests, two synthetic accounts; passed and cleaned up. |
| Existing signed MFA recovery regression after migration | Five groups, 46 guarded requests, two synthetic accounts; passed and cleaned up. |
| Lint | Exit zero; 15 existing warnings. |
| Local build | Passed; existing dynamic-import/large-chunk warnings, main bundle approximately 2.59 MB. |
| Final DEV inspection | Resume bucket private/PDF-only/5 MiB; relevant tables and Storage RLS enabled; 3B guard/audit triggers intact; new private mutation/trigger helpers not executable by anon/authenticated; legacy contact RPC not executable by anon. |
| Independent fixture cleanup | Zero synthetic recruitment Auth accounts, companies, vacancies and events remain. Harness also removed its applications, profiles, participants, interests, participations, offerings and Storage objects; private audit evidence remains. |

The first post-migration live run passed five groups, then returned resume bytes immediately after an unchecked withdrawal PATCH. It cleaned up all fixtures. This result is preserved in live-verify-withdrawal-failure.json. Diagnostics were strengthened to require both actual rows to be returned as withdrawn before testing bytes. Two subsequent runs passed; the final run also asserts denial immediately after those persisted rows, before additional inbox/probe requests. Direct ordinary and unique-query probes returned HTTP 400 with CDN BYPASS, signing was denied, and a logged-out staff token was denied. The original inconsistency's precise cause was not established; no arbitrary policy change was made to conceal it, and instantaneous global revocation is not claimed.

Five matching TODOs still incorrectly classify absent education, skills, experience, certifications or languages as ineligible instead of requiring review. They actually execute and fail; the runner's zero ordinary failures does not mean these defects are fixed.

## 6. Verified security guarantees

Isolated SQL tests verify Google owner upload/link/replace/unlink, own history/submission/withdrawal, canonical participant identity rather than UID=PID, foreign participant/application denial, legitimate open vacancies, duplicate behavior, controlled status transitions, private status/reference audit payloads, invalid document references, stale previous-path protection and preservation during unrelated profile saves.

Real signed AAL2 Partner/PESO requests verify owned employer review and correct PDF bytes, Employer A/B isolation, foreign vacancy writes and organization reassignment denial, role impersonation and privileged RPC denial, pending self-approval/contact/document denial, foreign file upload/replace/delete denial, anonymous/public endpoint denial, municipal geographic scope and retained provincial/staff/admin oversight. AAL1 access is denied for mandatory Partner roles. Password candidates cannot use the Google-only application channel. No active application after confirmed withdrawal denies fresh document reads/signing in the successful live runs. A previously signed staff token is denied after global logout.

Owner paths are derived from canonical account linkage; the resume setter accepts no caller participant ID. Resume content is not recorded in audits. Upload MIME/size restrictions are enforced by the bucket; the interface also checks a PDF signature, which is not a substitute for server malware/content inspection.

## 7. Incomplete tests and limitations

Real Google OAuth still returns redirect_uri_mismatch for the designated DEV account pesocagayanjobfair@gmail.com. The observed redirect uses the exact DEV callback https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1/callback. A dedicated DEV Google client needs that callback; a shared Production client must not be changed. No credentials, Google identity rows or signed provider claims were fabricated to bypass this blocker.

Positive signed Google onboarding, owner Storage operations, the complete real jobseeker-to-review sequence and password Partner identity linking therefore remain unverified. Owner-positive evidence is isolated PGlite and intercepted browser coverage. Live password-only synthetic candidates test denial; service-prepared applications/resumes are fixtures, not proof of a successful Google-owner submission.

A two-second signed capability was tested only on a synthetic cacheControl=0 object. The application itself downloads authenticated bytes instead of creating remote signed resume URLs. Already authorized downloaded copies and cached signed capabilities are not instantly revoked by later database state. Supabase documents CDN token caching separately from expiration: https://supabase.com/docs/guides/storage/cdn/smart-cdn.

Upload plus reference mutation spans Storage and Postgres. Concurrency checks and compensating cleanup reduce failures; they do not make both services physically atomic. Failed cleanup can leave an unreferenced private object. Established global staff/admin/medical access was retained; new municipal staff restrictions were not invented.

## 8. Remaining risks

Advisors still report three mutable search paths in existing AI functions, 22 anonymous and 56 authenticated public definer-function execution notices, two RLS-enabled tables without policies, and disabled leaked-password protection. Notices require per-function policy review rather than blanket revocation. See https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable. Existing performance notices include unindexed FKs, initplan suggestions, multiple permissive policies and a duplicate index; no unrelated schema cleanup was bundled here.

Broader RPC/AI authorization, privacy notice versus legacy event-interest contact sharing, retention/deletion processes, remaining recovery interfaces and all-admin fallback still require work. Earlier milestone 3A exposed a GitHub token in diagnostic output; it was not reused or copied into these artifacts, and user revocation/replacement remains unverified. The original withdrawal inconsistency remains a disclosed observation despite the stronger successful repetitions.

## 9. Recommended next milestone

Resolve the dedicated DEV Google callback and execute signed owner onboarding, resume/application/review/withdrawal and identity-linking acceptance. Then address the five evidenced unknown-evidence matching defects and review the remaining AI/privileged RPC contracts, recovery fallback and privacy/retention workflows against the established organizational policy. Preserve the passing 3A/3B/3C regression suite.

## October 14 follow-up

DEV_EMBEDDING_FRESHNESS_MILESTONE.md records a newly evidenced private-schema defect in the invoker qualification guards and its focused correction. Ordinary app-schema usage remains denied; no provenance bypass or private schema grant was introduced. The final unit suite passes 197 tests and the browser suite passes 54. Signed recruitment regression passes 10 groups/177 requests; signed intelligence regression passes 8 groups/197 requests, with all synthetic accounts cleaned. Real Google owner acceptance remains unverified.

## October 19 follow-up

`DEV_APPLICATION_STATUS_CONFIRMATION_MILESTONE.md` documents an additional Admin status-save defect: an empty PostgREST update previously produced a success message. The local client now requires one returned row. The pre-fix browser regression reproduced the false success; the final six-case recruitment browser file, 23 focused database tests, build and lint passed. There was no connected DEV database write or schema change. The designated Google account has since completed onboarding with fictional test details and must not be used for real cases; signed owner resume/application acceptance remains separate and unverified.
