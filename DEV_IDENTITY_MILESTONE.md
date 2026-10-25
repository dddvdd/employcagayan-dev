# DEV identity, approval and accreditation milestone

Observed 12 October 2026. Overall development goal remains active.

**Milestone:** 2B — authoritative identity resolution and pending employer onboarding, implemented and verified within the scope below.

**Environment verified:** Supabase management returned `https://cdmkzzmaswwiryymtycn.supabase.co` before every connected database operation, whose project ID was explicit. Live tests checked each actual outgoing HTTPS origin against that independently obtained URL; acceptance Data API requests required real signed DEV user sessions with the correct issuer. Production was never contacted or changed.

**What was implemented:** Public signup always creates the applicant role; metadata and the login category cannot assign authority. Google jobseeker authorization requires a server-managed Google identity, confirmed active account, live Auth session, OAuth authentication and no active approved employer association. Participant creation and profile saving derive ownership from `participants.auth_user_id`. Mandatory Partner roles require live sessions, AAL2 and a verified TOTP factor authenticated after its creation. Factor removal/replacement and session revocation invalidate stale protected access.

Company registration uses an idempotent owner RPC that writes a pending application, retains existing accreditation seed triggers and assigns no employer role. Pending Google applicants keep jobseeker access without extra MFA. Company accreditation has a separate TOTP requirement and grants no recruitment privileges before approval. Approval requires all applicable requirement rows and their canonical Storage objects. Self-service authority fields and approved documents are immutable. Review, link and rejection calls require active verified administrators. The existing private audit store records authorization fields without names, emails, document filenames or secrets.

The frontend consumes bootstrap authority flags, preserves category as routing state only, completes registration through the owner RPC and provides `/partner/accreditation` without administrator navigation. The shared requirement list preserves approved-document behavior. Company and branch address cascades are independent; saved child selections survive asynchronous option hydration. Mobile accreditation screenshots were visually inspected after repairs.

**Files changed:** Auth policy/context/intent, route guards and routing, callback/login/MFA pages, employer signup/completion/service, new pending accreditation page and shared requirement list, independent employer address hook, tests, README and this report. The detailed paths are reflected in the local diff; pre-existing unrelated changes were preserved.

**Database migrations:** Applied only to verified DEV:

- `20261012034128_authoritative_identity_and_employer_registration.sql`
- `20261012034841_identity_profile_rpc_grants.sql`

Both were created with the installed Supabase CLI; filenames were reconciled to DEV ledger timestamps after application. The first connector request expired; an immediate ledger/function/policy read proved it had applied nothing before retrying. Changes add one partial uniqueness index and scoped functions/policies/triggers, with no new business tables or personal-data mass updates. The second removes the inherited anonymous/PUBLIC profile-writer grant. All 71 public ordinary tables retain RLS, with 72 identity policies including Storage and 15 additional jobseeker policies. Remaining September history drift prevents a blind migration-directory push.

**Tests executed:** Full Node suite, isolated Playwright suite, local build, lint, PGlite authorization tests using DEV-derived functions/policies, and opt-in live signed-session tests. Historical MFA SQL tests exercise recovered historical policies; the new identity tests exercise current changes. Browser/PGlite fixtures cannot prove actual OAuth behavior. Live service credentials are used only for synthetic fixture preparation/cleanup; acceptance requests use the public client and signed ordinary-user sessions.

**Tests passed/failed:** 66 Node tests: 61 pass, zero ordinary failures, five executing failing matching TODOs. All 33 isolated browser tests pass. Lint and build exit 0; existing lint and bundle-size/dynamic-import warnings remain. Initial browser infrastructure failures selected an empty browser cache and denied loopback; the final authorized run used installed Chromium and local loopback. Selector and address-hydration failures were repaired and successfully rerun. Live integration exits 0, with seven reported groups and 42 guarded requests: password login, TOTP enrollment/challenge/verification, AAL1 denial, AAL2 self-profile access, metadata clamping, self-promotion denial, pending-only registration, accreditation ownership, password jobseeker denial, factor removal and global logout. Two synthetic Auth accounts and one company were deleted; an independent SQL read confirmed zero remaining fixtures. Private authorization audit records remain intentionally. Evidence: `artifacts/identity-milestone-20261012/`.

**Security observations:** Existing ownership and jurisdiction policies remain necessary and are intersected with restrictive identity/MFA policies. User features do not bypass RLS. Helpers have scoped search paths and execution grants. Post-migration advisors report existing anonymous/authenticated SECURITY DEFINER surfaces, three mutable search paths, two internal RLS tables without policies and disabled leaked-password protection. The changed writer's anonymous grant was corrected; broader RPC review remains required. Recorded advisor findings include remediation links. An executable SECURITY DEFINER grant is a review surface, not alone proof of data exposure.

**Outstanding defects:** Real Google OAuth/linking is untested. The designated `pesocagayanjobfair@gmail.com` has no existing DEV Auth account, so it cannot currently establish an existing password Partner linking test. Lost-device UI remains locked guidance; audited administrative recovery is still required. Employer/PESO regression, consent, persistence and jurisdiction/API tests remain open. Five missing-qualification matching exclusions remain failing TODOs. History drift, existing security findings and performance warnings remain documented work.

**Next recommended action:** Exercise the designated Google identity through the local DEV callback, implement audited administrative recovery, then continue core workflow/privacy verification before matching improvements.

**Git commits/pushes:** None.

Subsequent OAuth check: Google is enabled in DEV. A disposable, immediately
removed probe account confirmed both loopback callback URLs are allowed;
`http://localhost:5173/auth/callback` is not currently allowed. Generated links
were never sent, used or persisted. The real local Google login reached Google's
`Error 400: redirect_uri_mismatch` before any account login. Its error details
identify the missing URI as
`https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1/callback`. The Google client
configuration needs this DEV callback; no provider configuration was changed.
Real OAuth and linking remain unverified. See `oauth-config.json` and
`google-oauth-observation.json` in the milestone evidence folder.

**Production modified:** No.
