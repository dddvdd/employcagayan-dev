# EMPLOYCagayan — Event writer authorization milestone

Prepared 2026-10-16. Milestone: review remaining authenticated privileged RPCs and correct confirmed event-boundary defects.
Environment verified: actual local EMPLOYCagayan and Supabase DEV `cdmkzzmaswwiryymtycn`; management database/current user/session user were postgres. Exact DEV URL was independently verified before every management operation and supplied to the native harness; every HTTPS request enforces that origin.
Status: three event-writer corrections applied and verified. Full mission remains active.

Subsequent credential-writer review and repair are documented in DEV_ADMIN_CREDENTIAL_SECURITY_MILESTONE.md. The remaining-work descriptions below record this event milestone's original checkpoint.

## Confirmed defects and final behavior

1. **Foreign-event jobseeker selections.** `register_for_event` inserted supplied offering IDs without checking that they belonged to the selected event. The exact pre-change definition reproduced a registration for one event linked to another event's offering in an isolated actual-schema fixture, even after invoking the configured pre-request guard. The RPC now uses the same selection guard already established for staff registration: at most 100 distinct non-null offerings, each from the selected event, an active vacancy and an active approved company. Validation precedes insertion. Valid choices, optional empty selection, ownership, duplicate protection and the profile's overseas preference remain intact.

2. **Supervisor employer check-in outside jurisdiction.** `check_in_employer` checked event-staff role but not the supervisor event-scope helper. Both the isolated fixture and actual guarded DEV endpoint let a real signed synthetic AAL2 supervisor assigned to Solana check in a company at a Tuguegarao City event. The function now requires the canonical recruitment session and enforces the existing supervisor jurisdiction helper before retrieving company details or changing attendance. Local authorized supervisors and provincial supervisors retain their established access. Existing staff/admin/medical authorization is retained, including the current conditional medical MFA policy.

3. **Inactive company event registration and check-in.** `participate_in_event` required approved accreditation but ignored the company's active state. Both the fixture and real signed synthetic AAL2 employer reproduced registration after the company was made inactive. It now invokes the existing canonical recruitment Partner guard and selects only an active approved company owned by the caller. Employer check-in also rejects an inactive company. Active company registration and repeated registration remain idempotent.

These business-scope gaps were reachable despite the actual mandatory MFA pre-request guard. No MFA weakening, new privileged role, public grant, RLS replacement or parallel table was introduced. The current event-open/cancelled checks remain in force. The three function search paths now put pg_catalog first and pg_temp last. Their existing postgres/authenticated/service-role ACLs are preserved; the function-body guards remain authoritative.

## Migration and preservation

Local migration aligned with actual DEV ledger after exact SQL hash agreement:

`supabase/migrations/20261016020613_event_registration_scope_guards.sql`

Applied SQL SHA256: `a49ebf330b65ae15e66f97285a7a8c6fb36904e8021fa4ae62110e03d8cdd75a`.

The CLI initially scaffolded version 20261016014556. The actual DEV ledger version is 20261016020613. No applied SQL was edited during alignment.

Independent before/after reads cover all 161 existing public/app functions. Exactly three definitions/configurations changed: register_for_event(uuid,uuid[]), check_in_employer(text,uuid) and participate_in_event(uuid). Every other function definition and all existing function ACLs match baseline. Complete public/app policy and table-grant metadata also match exactly. No table/column/schema change was needed.

## Tests executed

| Scope | Actual result |
|---|---|
| Original-definition synthetic SQL reproductions | Three confirmed defects |
| Focused event-boundary SQL suite | Eight passed, zero failed/skipped |
| Full local unit suite before DEV application | 515 passed, zero failed/skipped |
| Focused lint for new support/tests/native harness | Exit 0, zero warnings |
| Actual guarded DEV before correction | Four check groups, 44 HTTPS requests, passed, scoped fixture cleanup complete |
| Actual guarded DEV after correction | Six check groups, 60 HTTPS requests, passed, scoped fixture cleanup complete |
| SQL ledger/body/config/ACL readback | Passed |
| Independent final record, function, policy and grant checks | Passed |

The fixture reproductions use the exact current DEV definitions and current canonical session/MFA helpers, not a simplified guessed authorization path. An initial fixture query expanded a mutating composite-returning function more than once and produced a duplicate-registration error; it was corrected to call the function once using FROM. The confirmed foreign-event behavior was then reproduced and preserved in the baseline test.

The corrected SQL suite tests foreign/duplicate/null/excessive selections, inactive vacancies, inactive/unapproved companies, no partial registration on rejected selections, valid/empty choices, overseas preference, distinct participant/Auth UUIDs, MFA AAL1 denial, actual fixture-session removal, supervisor locality/provincial oversight, idempotence, cancelled events/attendance and preserved medical access.

Native acceptance uses real synthetic password accounts, actual TOTP enrollment/verification and signed AAL2 JWTs. The service credential is limited to fixture preparation, independent state inspection and exact cleanup. Ordinary positive and negative acceptance uses signed supervisor/employer actors or anonymous requests. It verifies out-of-scope denial without changing attendance, inactive-company denial without creating attendance, authorized local/provincial check-in, active company registration, idempotence, cancelled-event rejection and an actually revoked previously valid JWT. Anonymous writers and a Partner attempting Google-jobseeker registration are denied.

**Native positive Google-jobseeker registration remains unverified.** No Google identity was fabricated. The changed selection writer's positive/negative logic is covered in isolated SQL; actual hosted Google owner/onboarding acceptance remains a separate full-mission gap.

Build and browser suites were not repeated because no frontend/runtime source changed; their preceding milestone results remain historical. These backend changes were exercised directly through the actual guarded DEV API.

## Cleanup and privacy

Both native runs restrict fixture cleanup using exact recorded UUIDs plus the test-run metadata, account email and company/event names. Sessions are signed out before account deletion. No genuine profile, application, resume or other personal record was created, collected or deleted.

Independent final DEV reads confirm zero test Auth users, profiles, sessions, TOTP factors, companies, accreditation parents, events, employer attendance, event registrations and associated application audit rows for both runs' exact identifiers.

All baseline aggregate counts returned unchanged: 20 Auth users/profiles, 38 participants, 33 jobseeker profiles, 21 employers, 35 events, 20 vacancies, 40 event registrations, one employer-attendance row, 16 event offerings, nine selected offerings and 789 application audit rows. This is scoped synthetic application-fixture cleanup. Supabase-operated Auth/security telemetry and recoverable backups may retain synthetic test events.

All retention proposals remain inactive; no disposal executor, destructive schedule or provider call was introduced.

## Review inventory and remaining work

The current schema inventory identifies 65 authenticated-executable public SECURITY DEFINER functions. The machine-readable review-register.json records direct guard references as a navigation aid. This milestone corrects and verifies three. It inspects the legacy admin credential writers sufficiently to identify a follow-up, but does not claim a complete individual review of the other 62 functions.

In particular, admin_reset_password still uses a nullable local-role comparison rather than the canonical administrator guard, and admin_create_user needs focused session/MFA, target-role and Auth compatibility review. The current HTTP pre-request guard is an additional defense; no public password-reset exploit is claimed here. Those credential writers require isolated failure reproduction and real synthetic account acceptance before any correction.

Security advisors still report eight internal RLS-without-policy informational findings, eight intentional anonymous-definer findings, 65 authenticated-definer findings and one leaked-password-protection configuration warning. Counts are unchanged; correct role-scoped definers can retain advisor warnings. These counts are not a security certification. No broad revocation or meaningless internal-table policies were added to silence notices.

Official guidance consulted: [database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL function security/search paths](https://www.postgresql.org/docs/current/sql-createfunction.html), [authenticated definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The changelog markdown endpoint was unsupported by the browser tool; the [HTML changelog](https://supabase.com/changelog) was reviewed instead.

## Files and evidence

- The three-function migration above.
- tests/support/event-boundary-database.js — current-definition/guard and actual-schema fixture.
- tests/unit/event-boundary-guards.test.js — reproductions and corrected workflow/authorization tests.
- tests/integration/dev-event-boundaries.js — real MFA actor baseline/verification with exact synthetic cleanup.
- This report.
- artifacts/authenticated-rpc-review-20261016/ — original schema/function catalog, boundary baseline, before-apply read, exact applied ledger/definitions, baseline/final native receipts, tests/lint, final preservation/remnant evidence, advisor findings, review register and verification receipt.

Automatic approval review temporarily rejected the post-change harness because its review service reported an account usage limit; that command did not run. After the stated reset time passed and an account read confirmed ordinary usage was available, the same command succeeded through the normal approval path. No alternate execution route or approval bypass was used.

Outstanding full-mission work includes admin credential-writer review, the remaining individual privileged-function review, real Google owner/linking acceptance, genuinely reviewed relevance/thresholds, approved positive embedding/provider transport and provider/privacy/records decisions.

Next action: reproduce and correct any confirmed admin credential-writer failure while preserving current identity, mandatory MFA, role and Auth behavior.
Git commits/pushes: None.
Deployment/Production operations: None.
Wider mission: Active.
