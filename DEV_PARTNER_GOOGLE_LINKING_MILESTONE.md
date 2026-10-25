# DEV Partner Google linking boundary

19 October 2026. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. This milestone characterizes the available linking path and improves Partner sign-in guidance; it does not claim a completed Partner Google link.

## Result

Supabase documents two linking strategies: automatic linking for a verified OAuth email that matches an existing user's email, and optional manual linking initiated by a signed-in user. Manual linking must be enabled in the project's Auth settings. Sources: [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [JavaScript linkIdentity](https://supabase.com/docs/reference/javascript/auth-linkidentity).

DEV's public Auth settings did not expose a manual-linking flag. A native signed synthetic account called `linkIdentity({ provider: 'google', skipBrowserRedirect: true })` and received HTTP 404 with code `manual_linking_disabled`. No Google consent page was followed and no Google identity was created. This proves manual linking is unavailable in current DEV configuration. It does not test automatic same-email linking, which still needs an authorized existing password-based Partner and matching Google account.

The Partner login page now tells existing account holders to choose a Google account with the same email as their approved Partner account, and to use existing email sign-in and contact PESO when the addresses differ. The selected login category remains routing/presentation state; the authoritative database role still decides access. A new Google applicant who chose Partner still reaches its authorized jobseeker onboarding without acquiring Partner privileges. An earlier local callback restriction was reverted after reviewing this invariant.

Read-only DEV metadata found existing Google-linked admin and supervisor identities, but no existing Partner identity with both Google and email providers. The admin identity has a verified TOTP factor; the supervisor Google identity does not. These are aggregate counts only, not a signed Partner login or linking acceptance. The mandatory Partner MFA gate remains responsible for challenging an unenrolled Partner; no genuine Partner account was used in the probe.

## Files and checks

- `src/pages/Public/LoginPage.jsx`: same-email Partner Google guidance. No role or authorization writer changed.
- `tests/browser/auth-flow.spec.js`: preserves jobseeker routing when Partner was selected, checks that the selected category does not grant authority, and checks the new guidance.
- `tests/integration/dev-linking-capability.js`: guarded, synthetic, non-consenting DEV Auth capability probe with exact account cleanup.
- Evidence: `artifacts/identity-linking-20261019/capability.json`. It contains only a synthetic run/user ID, request paths/statuses and capability classification; no password, token, Google URL or identity data.
- The full authentication browser file passed: 24 tests, zero failures. Local build passed. Source and focused-test lint exited zero with existing source warnings.
- Independent DEV cleanup query: zero temporary Auth users, profiles, identities, sessions and audit rows; total Auth users/profiles were 21/21, including the newly signed-in designated jobseeker account.

The exact DEV URL was independently verified before each management query and immediately before the signed synthetic probe. The probe restricted every outbound request to that HTTPS origin and required a genuine Auth-issued synthetic session. It deleted only the account whose email and test-run metadata matched its generated fixture. No database migration, Auth setting, RLS policy, grant, Production resource, Git commit/push, hosting deployment or real personal record was changed.

## Remaining acceptance and decision

An authorized owner must test an existing DEV password-based Partner with a Google account using the same verified email, then verify the Auth user ID remains the same, the existing role/approval is retained, no second privileged identity appears, and AAL2 TOTP still gates Partner access. Do not ask for or handle that person's password or Google code. If cross-email linking is an actual requirement, the Provincial account authority must approve the policy and DEV Auth setting before a manual-link interface is offered; the currently disabled endpoint should not be treated as a working feature.

**Milestone:** Partner Google linking boundary and guidance.  
**Environment verified:** Local app and Supabase DEV `cdmkzzmaswwiryymtycn`.  
**What was implemented:** Same-email sign-in guidance and a guarded capability probe.  
**Database migrations:** None.  
**Tests passed/failed:** 24 auth browser tests, build, lint and exact synthetic cleanup passed; manual linking returned its configured-disabled result.  
**Security observations:** Category selection grants no role; manual linking is disabled; no real or synthetic Google identity was linked.  
**Outstanding defect:** Existing password-Partner same-email Google linking and signed MFA acceptance remain unverified.  
**Next recommended action:** Arrange an authorized same-email DEV Partner test, or decide whether cross-email linking is needed before any configuration change.  
**Git commits/pushes:** None.  
**Production modified:** No.
