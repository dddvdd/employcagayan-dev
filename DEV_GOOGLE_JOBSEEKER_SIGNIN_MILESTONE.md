# DEV Google jobseeker sign-in acceptance

20 October local onboarding follow-up: new Google applicants whose metadata has a display name but no separate given/family names now receive editable first/last name hints. The previous branch made that fallback unreachable; it also omitted the email hint in that case. A single-word display name fills only first name, leaving last name for the person to enter. The fictional OAuth browser regression checks first name, last name and email; the auth/profile browser files pass 32/32. Lint and local build pass with existing warnings. No database write, deployment, Git publication or Production change occurred. Hosted owner acceptance remains pending.

19 October 2026. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. The wider development mission remains active.

## Confirmed behavior

After the dedicated DEV Google OAuth callback was corrected, a credential-free public probe reached Google without `redirect_uri_mismatch`. An existing Google jobseeker then reached `/profile`; read-only DEV metadata confirmed a newly created Google session for an existing applicant with a linked participant and completed profile. This proved an end-to-end returning-user Google sign-in, but the session belonged to a different email than the designated test account.

The local Google sign-in call now sends `prompt=select_account` so a person can explicitly select their intended Google account. Isolated browser navigation from both `https://127.0.0.1:5173/login` and `https://localhost:5173/login` confirmed `provider=google`, `prompt=select_account` and the matching local `/auth/callback` return destination in the authorization request. The browser test intercepted the request before account credentials.

The user then selected the designated DEV test account and reported return to `/register`. A separately verified DEV read-only query confirmed exactly one Auth account with one Google identity, no email/password identity, one `applicant` profile, zero Partner roles, one linked participant, one Auth session row and zero completed `jobseeker_profiles` rows for that account. The Auth row was created at `2026-10-19T06:52:14Z`. This independently supports first-time Google sign-in and onboarding routing. It does not prove profile submission, persisted qualifications, resume access, application submission or a returning session after onboarding.

The user subsequently submitted the onboarding form and reported the “Profile Saved!” page with links to the Quest Board and participant pass. A fresh read-only query, after independent DEV URL verification, found exactly one Google identity, one applicant role, zero other roles, one linked participant and one saved jobseeker profile for the designated account. The saved profile has one education row and zero normalized skill rows; the required agreement flag is set. This verifies persistence and the intended account link without viewing any entered values. It does not yet verify a returning login, profile reload, resume access or an application.

The user later clarified that the submitted details were fictional test details. My earlier request to use fictional details was mistaken: the genuine-account form certifies that information is true, complete and accurate. Treat this record as a DEV-only synthetic test record of uncertain disposition status. Do not include it in real service cases, reports, matching evaluations, exports or third-party AI processing. No content was read, no record was edited or deleted, and no retention/disposition authority is inferred. There is no verified test-record marker in the registration flow; this documentation is an operational warning, not a database-level exclusion control. The DPO/Records Officer and service owner must decide how to classify, restrict and eventually correct or dispose of this record under an approved procedure.

The user then confirmed that a later real Google sign-in reached `/profile` and requested the main hero page for returnees with finished profiles. `DEV_RETURNING_JOBSEEKER_HERO_MILESTONE.md` documents the local callback change to `/`, 25 passing mocked auth browser checks, and the user's real DEV sign-in confirmation of the new hero landing.

## Change and verification

- `src/services/authService.js`: request the Google account chooser on sign-in.
- Evidence: `artifacts/oauth-current-20261019/public-redirect-observation.json`; the earlier mismatch observation is retained as `public-redirect-before-fix.json`.
- Local isolated browser checks: exact DEV project, Google provider, account chooser and local callback verified for both loopback hostnames; no credentials handled.
- `npm run build`: passed. `npm run lint`: exit zero with previously existing warnings. The previous milestone's full 568-test local unit suite passed before this one-line OAuth option change; no claim of a new full-suite run is made here.
- DEV queries: exact project URL independently verified before each query; only identity counts, role categories, link existence and timestamps were inspected. No profile content, password, token, Google credential or personal record was retrieved.

## Remaining acceptance

The designated account has saved one profile; returning-profile reload and owner-positive resume/application/review/withdrawal remain unverified. The synthetic record needs a formal test-data handling decision before use in service or evaluation workflows. Linking an existing password-based Partner to Google also remains unverified; the designated new jobseeker account is not a substitute for that scenario. `DEV_PARTNER_GOOGLE_LINKING_MILESTONE.md` documents the observed DEV manual-linking-disabled boundary and same-email guidance. Privacy/records approval and reviewed matching relevance remain separate wider-goal work.

**Milestone:** Google sign-in and first-time/returning routing.  
**Environment verified:** Local HTTPS app and exact Supabase DEV URL.  
**What was implemented:** Explicit Google account selection.  
**Files changed:** `src/services/authService.js`, this report, and the earlier jobseeker guard report.  
**Database migrations:** None for this OAuth change.  
**Tests executed:** Credential-free browser authorization checks, local build/lint, DEV read-only identity and profile-link counts, user-observed save confirmation.  
**Tests passed/failed:** Both browser checks and build passed; lint exited zero with existing warnings; profile persistence passed; a first read-only child-table count failed on an incorrect column name, was corrected and rerun without mutation.  
**Security observations:** Google-only applicant identity, no Partner privilege and no password identity for designated account. Submitted data is fictional despite the form's accuracy certification; operational DEV-only handling is required.  
**Outstanding defects:** Returning-profile reload and Partner identity-linking acceptance remain unverified. No verified technical exclusion marker for this synthetic account was found.  
**Next recommended action:** Keep this account out of real service, evaluation, export and AI flows; obtain a test-data classification/disposition decision, and verify returning Google routing with account-link metadata only.  
**Git commits/pushes:** None.  
**Production modified:** No.
