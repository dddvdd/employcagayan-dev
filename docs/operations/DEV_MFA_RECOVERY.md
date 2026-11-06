# DEV administrative MFA recovery

This procedure operates only on independently verified Supabase DEV
`cdmkzzmaswwiryymtycn`. It does not deploy code or modify Production.

## Operator procedure

1. An authorized PESO administrator verifies the person's identity through an
   in-person check or the established verified service-desk process. Confirm the
   existing account and organization; an email address or a claimed role alone
   is insufficient. Record the evidence in the restricted case system. Use its
   uppercase case reference here, never a name, email, government ID, document,
   password, token or authenticator secret.
2. Independently verify the DEV API URL using Supabase management. Stop if the
   URL differs from `https://cdmkzzmaswwiryymtycn.supabase.co`.
3. On a trusted operator workstation, provide private DEV fixture/operator
   credentials in `.env.test`. The service key is used only by the operator's
   Auth Admin client; it never enters browser code. The administrator signs in
   with a normal public client and verifies an existing TOTP factor.
4. Run the command below in an interactive terminal, substituting the verified
   account UUID and case reference. Password and TOTP prompts are masked. They
   are not command arguments and are not written to evidence files.

```powershell
$env:EMPLOY_VERIFIED_DEV_URL='https://cdmkzzmaswwiryymtycn.supabase.co'
node scripts/dev-mfa-recovery.js --target <verified-account-uuid> --case <CASE-REFERENCE> --method in_person --identity-verified
```

The signed administrator must have an active confirmed account, a live AAL2
session and TOTP verification within five minutes. Self-reset is refused.
Preparation records a private audit case and locks the target immediately.
Ordinary profile editing cannot remove the hold or change the target's role.

The operator applies a temporary Auth ban tagged with that exact case and
removes factors through Supabase's Auth Admin API. Completion independently
checks the held account, unchanged role, matching ban and absence of every
factor. It then removes only that target's Auth sessions and refresh tokens,
including legacy tokens without a session, and verifies zero remaining rows.
Those removals and completion are audited without token values. The transaction
restores the existing active flag; the operator lifts only the matching recovery
ban after a fresh administrator status check. The target must sign in again and
enroll/verify a new authenticator before any protected Partner access.

The terminal tool currently uses an administrator's password login. An
administrator using Google alone can authenticate through the normal application
and the guarded APIs, but no browser recovery operator interface is implemented.
Provider administration still belongs on the trusted operator workstation.

## Interrupted recovery

The tool prints the approved recovery request UUID, which is a case identifier,
not an access token. Keep the account locked when a provider call or database
completion fails. Investigate with the authorized case record, then resume the
same request with another fresh administrator TOTP verification:

```powershell
node scripts/dev-mfa-recovery.js --target <verified-account-uuid> --request <approved-request-uuid>
```

An unrelated existing ban or a competing recovery marker is refused. A completed
request can release a still-matching ban only within fifteen minutes; older
requests require an authorized operator review. No verified factor means normal
first-time enrollment is needed, rather than a reset. Existing inactive, banned
or pure jobseeker accounts cannot be activated through this procedure.

If every administrator has lost access, use the authenticated Supabase project
owner's restricted administrative process with independent identity verification
and a private case record. Revoke sessions/refresh tokens and remove factors
before restoring the existing account; preserve its role and mandatory MFA.
There is no application-level AAL1 administrator exception. This project-owner
fallback remains a manual operational procedure and has not been exercised in
the live tests; do not treat it as a verified automated recovery path.

## Verified behavior and platform dependency

Actual DEV testing found that Auth Admin factor deletion leaves sessions and
refresh tokens present. The current [Auth server implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go)
downgrades the affected sessions to AAL1. This differs from the current
[JavaScript deleteFactor documentation](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor),
which describes logging the user out. Recovery therefore explicitly revokes
session/token rows in its guarded transaction, and Partner authorization checks
the stored session assurance level as well as signed JWT assurance and factors.
The [session documentation](https://supabase.com/docs/guides/auth/sessions)
describes correlating JWT `session_id` with `auth.sessions` for strict revocation.

This administrative operation depends on the verified Auth schema: session
ownership, assurance, factors, refresh-token ownership and the session-to-token
cascade. It does not alter that managed schema. Recheck these contracts and run
the synthetic live test after an Auth upgrade. Session/token deletion is confined
to the approved case target; it grants no new permissions and exposes no token.

## Milestone report

**Milestone:** 2C — audited administrative MFA recovery and current session assurance.

**Environment verified:** Management API URL verified before every DB operation
and every live test command; each actual API request checks the DEV origin.
Acceptance requests use signed ordinary-user sessions, never the operator key.

**What was implemented:** Recent verified administrator authorization, restricted
identity-verification case, target hold, authority immutability during recovery,
operator ban/factor removal, explicit session/token revocation, idempotent
completion/resumption, audit history and mandatory re-enrollment. Google
jobseeker access retains its no-extra-MFA policy after optional factor removal.

**Files changed:** Two versioned migrations, `scripts/dev-mfa-recovery.js`,
`scripts/lib/devClients.js`, `scripts/lib/mfaRecovery.js`, the PGlite fixture,
recovery unit/integration tests, this guide and README. Earlier applied migration
bodies and unrelated working-tree changes remain unchanged.

**Database migrations:** `20261012041121_audited_admin_mfa_recovery.sql` and
`20261012044405_recovery_explicit_session_revocation.sql`, applied only to DEV.
No new business tables. Recovery uses existing private audit history and Auth
state. The latter migration corrects behavior discovered in the real API test;
it preserves the earlier ledger entry and the completion safeguards.

**Tests executed:** Eight PGlite recovery/assurance checks, four operator protocol
checks and a live signed-session integration. Final full-suite results and
identity regression evidence are saved under `artifacts/recovery-milestone-20261012/`.

**Tests passed/failed:** The eight database and four protocol checks pass.
The full Node suite has 78 tests: 73 pass, zero ordinary failures, and five
executing failing matching TODOs. The signed identity/accreditation regression
also passes seven reported groups with 42 guarded requests after the assurance
change. Independent SQL confirms no remaining synthetic auth, recovery or
callback-probe accounts. All four new local migration bodies match the DEV
ledger. The existing frontend's 33 isolated browser checks, build and lint passed
in milestone 2B; no frontend code changed in this recovery milestone.
`git diff --check` exits 0 with line-ending notices. The built browser assets
contain neither the private service credential nor the protected Production ref.
The final live test passes five reported groups with 46 guarded requests and
cleans up two synthetic accounts. Initial live completion failed safely because
Auth factor deletion left sessions/tokens; a short aggregate-state diagnostic
identified the issue, and the corrective migration was tested before retrying.
All failed-run synthetic accounts were also removed. The live test proves actual
TOTP, authorization denials, target hold, premature-completion refusal, explicit
revocation, metadata/role preservation, stale-token denial and fresh mandatory
re-enrollment. It does not prove the interactive terminal masking UX or manual
project-owner fallback.
The original signed access token and original refresh token also remain unusable
after the recovered account verifies its new authenticator.

**Security observations:** Recovery requires both a verified signed administrator
and trusted provider administration. Account/category metadata cannot approve
it. Holds survive failures. Revocation touches only the case target; unrelated
sessions and refresh tokens are preserved in regression checks. Primary
credentials are not changed. No public reset secret, unrestricted recovery
exception, service key in the client, or personal evidence in audit JSON.
Post-change advisors retain existing findings: 24 anonymous SECURITY DEFINER
surfaces, three mutable function search paths, two internal RLS tables without
policies and disabled leaked-password protection. The 55 authenticated
SECURITY DEFINER surfaces include three intentionally guarded recovery APIs;
their active administrator/recent-TOTP checks and anonymous grant denials were
tested. Broader existing RPC review remains necessary; recorded advisor findings
include their remediation links.

**Outstanding defects:** Google OAuth is blocked by the configured Google client's
missing DEV callback; actual linking is unverified. Interactive terminal UX,
Google-only administrator recovery UI and the manual owner fallback remain
untested/incomplete. Core persistence, consent, PESO/employer regression, broader
RPC/jurisdiction review, schema drift and five matching exclusions remain open.

**Next recommended action:** Resolve the DEV-only Google callback configuration,
verify real OAuth/linking and finish administrative recovery interface/fallback
coverage while continuing core workflow and privacy tests.

**Git commits/pushes:** None.

**Production modified:** No.
