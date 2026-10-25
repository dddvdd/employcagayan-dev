# EMPLOYCagayan — Administrator credential workflow milestone

Prepared 2026-10-16. Environment: actual local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn`. Full mission remains active.

## Confirmed problems

The actual administrator workflow had two verified operational defects:

- A signed synthetic AAL2 administrator could create a staff account successfully through admin_create_user, but the new account's password sign-in returned HTTP 500. Its Auth row contained NULL token/change strings and no email identity. This also prevented normal Auth API deletion during baseline fixture cleanup.
- A successful administrator password reset left the target's previously signed AAL2 protected session usable. The replacement password itself worked.

Isolated actual-definition SQL tests also reproduced the reset function's nullable local-role check: direct execution under an inactive administrator or AAL1 administrator reached the credential write. The current HTTP pre-request guard rejected those actors. This is a confirmed missing function-body boundary, not a claimed anonymous or public HTTP exploit.

Account creation already had an additional defense: its profile-authority trigger rejected direct AAL1 role assignment and rolled back the attempted creation. That protection was preserved; the initial test was corrected to reflect it rather than claiming an account-creation bypass.

Aggregate-only DEV inspection found six existing password accounts with the same NULL Auth-field format and no identities. Five were existing Partner/company accounts; one was an unassociated applicant. No genuine passwords, hashes, names or emails were retrieved.

## Implemented behavior

The existing public signatures remain unchanged:

- admin_create_user(text,text,text,text,text,boolean)
- admin_reset_password(uuid,text)
- hash_password(text)

Both account operations now invoke app.require_identity_admin before sensitive reads, hashing or writes. The canonical guard checks the active administrator, confirmed/unbanned Auth identity, actual live session, AAL2 and established TOTP rules. Role choices remain restricted to staff, supervisor, medical and admin. NULL/unsupported roles, invalid email/details and duplicate case variants fail with fixed errors. Existing identity management must be used for a duplicate account.

Creation writes the required empty Auth token/change strings, the corresponding email identity on the same Auth UUID and the canonical profile role in one transaction. It fails if the profile trigger did not produce a profile. It retains the existing administrator-confirmed email behavior and sends no invitation or other message.

Password reset requires an existing Partner/company account that already has password and email sign-in identity. It cannot add a password/provider to a Google-only jobseeker or Google-only Partner, change a role, activate an account, unban a user or remove an authenticator. Existing disabled staff and password-based pending company applicants remain manageable without activation or escalation.

A reset expires existing sessions using their intended not_after field and marks refresh tokens revoked. It does not delete those records. Fresh password sign-in requires MFA again; the existing authenticator remains available. Administrator self-reset also ends the previous protected session.

Password hashing now resolves the actual pgcrypto extension namespace rather than the first function named gen_salt, uses bcrypt cost 10, and rejects fewer than eight Unicode characters or more than 72 UTF-8 bytes. The helper's original owner/service execution grants are preserved. All three search paths put pg_catalog first and pg_temp last.

New operation audits record actor, target, operation, assigned role or restricted-session count. They contain no plaintext password, password hash or contact value.

## Non-destructive existing-account compatibility repair

The same tested migration normalized four NULL token/change fields on the six affected DEV password accounts to the empty strings expected by Auth. Existing non-null values, password hashes, emails, role/approval/activation state and Auth provider links were retained.

It inserted a missing email identity only for confirmed, unambiguous, pure-email Partner/company accounts with no existing identity. Five qualified. Existing Google/provider identities, ambiguous addresses, unconfirmed accounts and the unassociated applicant were excluded from identity creation. No new Auth user or profile was created for the repair.

The repair is idempotent. It retained one aggregate audit entry: six accounts normalized and five email identities added, with no user identifiers, emails or credential values in that aggregate entry.

Independent database-side aggregate signatures confirm the existing password-hash values and profile authority fields are unchanged. Original hashes and personal rows were not exported. These existing-account checks establish formatting/identity consistency and preservation; genuine owners' sign-in was not attempted because their credentials are not available or requested.

The existing RPC architecture writes the Auth managed schema. Official troubleshooting documents this NULL-format failure and its empty-string remedy; the deployed DEV schema was inspected before repair and real Auth acceptance was required. Managed-schema coupling remains a maintenance constraint. A future server-side Auth-admin API migration would require a separately reviewed architecture/deployment decision; no new Edge function or hosting deployment was introduced here.

## Frontend changes

UsersManagement now reflects the eight-character boundary and checks Unicode/UTF-8 limits before sending a request. Closing either credential dialog clears its password; dialogs remain open while a write is pending. The visibility button is keyboard reachable.

Successful resets explain that prior sessions ended and authenticator verification remains required. Resetting the current administrator clears the local protected account and signs out. Missing-service messages no longer instruct an end user to run an obsolete SQL script. The account-creation text points to Partner login and authenticator verification.

## DEV migration and preserved boundaries

Migration: `supabase/migrations/20261016052508_admin_credential_workflow_guards.sql`.

Exact applied SQL SHA256: `c00a1f417db49d088373f83b63c4dcc23d2756ab8f32ce6b8b8ba502798a1be2`.

The CLI scaffold was initially 20261016050424. The local filename was aligned with the actual DEV ledger only after exact SQL digest agreement. No applied SQL was edited.

Independent comparison covers all 161 public/app functions. Exactly the three functions above changed. Existing function ACLs are unchanged. Complete public/app/auth RLS-policy and table-grant metadata, Auth trigger definitions, profile authority and existing password-integrity signatures match before/after.

There were no table/column additions, broad grants, RLS changes, Auth configuration changes, role assignments to existing genuine users, or authenticator removals. Each management operation independently verified the exact DEV project URL; native HTTPS requests also enforce that origin and real actor JWT issuer, subject and session ID.

## Tests and actual evidence

| Scope | Result |
|---|---|
| Final focused isolated SQL suite | 12 passed, zero failed/skipped |
| Full local unit suite | 527 passed, zero failed/skipped |
| Four new administrator browser checks | Four passed |
| Full intercepted browser suite | 119 passed |
| Focused lint | Exit 0, zero warnings |
| Local DEV frontend build | Passed; existing bundle/plugin timing warnings |
| Pre-change signed DEV observations | Six observations over 30 HTTPS requests; original process cleanup failed for the malformed created account, then separately recovered |
| Post-change signed DEV acceptance | Five groups, 48 HTTPS requests, passed; all fixture cleanup complete |
| Exact ledger/function and final preservation/remnant reads | Passed |

The SQL fixture uses the actual credential definitions, identity guards and profile-authority trigger. A controlled hashing marker is explicitly substituted because that local fixture has no pgcrypto. It does not simulate bcrypt or prove GoTrue compatibility. Actual hashing, Auth user lookup, password sign-in, MFA enrollment/challenge, refresh denial and session behavior are exercised by signed hosted DEV acceptance.

Focused SQL tests cover independent MFA/active-role/session checks; required Auth strings and same-UUID email identity; all four staff roles; invalid/NULL roles and email; password character/byte boundaries; duplicate identities; non-destructive session/refresh revocation; preserved MFA; unknown/Google-only targets; disabled staff and pending companies; minimized audits; provider/ambiguous/unconfirmed/applicant exclusions; and repair idempotence.

The browser tests use intercepted synthetic responses. They verify rejected short/multibyte-overlong passwords, valid creation transport, password clearing on close, keyboard visibility control, in-flight dialog behavior, reset messaging and self-reset sign-out. They do not stand in for database authorization.

Actual signed DEV acceptance provisions a new account using the repaired RPC, reads it through the Auth API, signs it in, completes real TOTP MFA and accesses the correct canonical role. It rejects duplicate identity creation. It resets another synthetic staff account, rejects the old protected JWT and refresh token, signs in with the replacement password, verifies that MFA remains required and that the same authenticator still works, checks minimized audit metadata, rejects an unknown target and verifies administrator self-reset revocation.

## Baseline cleanup recovery and final state

The original baseline receipt is preserved with passed=false and cleanup_complete=false. Observations completed, but the malformed newly created synthetic account could not be deleted through Auth. Its exact UUID, synthetic email, run label, missing identity and absence of sessions were independently verified. Only that synthetic row's four NULL Auth strings were normalized; normal Auth-admin deletion then succeeded. The separate baseline-cleanup-recovery.json records this recovery. No genuine account was selected for cleanup.

Final independent reads cover both baseline and post-change fixture UUIDs. They found zero test Auth users, profiles, identities, sessions, factors, refresh tokens or associated application-audit rows.

Existing business-record counts remain unchanged: 20 Auth users/profiles, 38 participants, 21 employers, 35 events and 20 vacancies. Auth identities increased intentionally from 14 to 19 for the five repaired existing accounts. Application audit rows increased intentionally from 789 to 790 for the aggregate compatibility repair; synthetic account-operation audits were removed with exact fixture cleanup.

Supabase-operated Auth/security telemetry and backups may retain synthetic test events. No genuine personal record was deleted. All proposed retention schedules remain inactive, and no disposal executor or destructive schedule was enabled. Session expiration/revocation is an existing security control, not records disposition.

## Security observations and remaining mission work

Advisors remain at eight internal RLS-without-policy informational findings, eight intentional anonymous-definer findings, 65 authenticated-definer findings and one leaked-password-protection configuration warning. No blanket permission changes were made to silence findings. Advisor counts are not a security certification.

Current official references: [NULL confirmation-token error](https://supabase.com/docs/guides/troubleshooting/scan-error-on-column-confirmation_token-converting-null-to-string-is-unsupported-during-auth-login-a0c686), [Auth schema query error](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44), [managed-schema insert failure](https://supabase.com/docs/guides/troubleshooting/database-error-saving-new-user-RU_EwB), [password security](https://supabase.com/docs/guides/auth/password-security), [server-only Auth administrator API](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

This local/DEV milestone establishes the repaired workflow with synthetic signed actors. It does not verify genuine-owner Google sign-in/linking, approved representative ranking relevance, positive provider/vector transport, provider privacy settings or records-retention authority. Remaining privileged functions still need individual guard review. The full mission remains active.

Files changed: the migration above; src/domain/credentialPolicy.js; src/pages/Admin/UsersManagement.jsx; tests/support/credential-database.js; tests/unit/admin-credential-guards.test.js; tests/browser/admin-credentials.spec.js; the baseline and verification native credential harnesses; this report; the lifecycle audit's operational note; and artifacts/admin-credential-security-20261016/ evidence and verifier.

Git commits/pushes: None.
Hosting/Edge deployment: None.
Production operations: None.
Next action: continue the remaining privileged-function/workflow audit and resolve genuine Google owner acceptance through its approved owner-controlled process.
