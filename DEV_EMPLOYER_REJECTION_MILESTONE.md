# DEV employer rejection and account-review correction

Completed 2026-10-19. Prepared and first tested on 2026-10-16, then resumed with fresh DEV verification. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn`. The full development mission remains active. No Git commit/push, hosting/Edge publication, Production operation, AI-provider request, genuine record deletion or retention-policy activation.

## Confirmed account boundary defects

The original `admin_reject_employer` disabled every linked profile, regardless of its canonical role. Isolated Google tests showed that rejecting a pending company also disabled the applicant's existing jobseeker access. A synthetic historical staff-company association demonstrated the same collateral staff deactivation. Actual signed DEV password/TOTP accounts reproduced both profile deactivations. Current genuine company-role aggregates contained no linked staff/applicant rows; this is not a claim that genuine staff were previously disabled.

The original function also left the accreditation status pending or approved after the company became rejected. The correction updates the existing accreditation status to rejected, preserving its prior approval timestamp, requirement evidence, company code and other records.

Rejection now disables the linked profile only when its canonical role is `employer`. An applicant or staff identity retains its existing role/activation state. An independently inactive applicant stays inactive. Rejected company status still denies company authority; preserving an applicant profile does not grant employer access or make a password session eligible for Google-only jobseeker operations. Previously disabled genuine accounts are not automatically reactivated: their inactivity could have an independent administrative reason.

Existing active-admin, verified TOTP, live-session and anonymous/role restrictions remain mandatory. The company row is locked before its decision is applied, and company/accreditation/profile changes occur in one transaction. Existing authority audit triggers identify the real administrator and omit private rejection notes. No new permissions, tables, columns, triggers or functions were introduced.

## Employer account-review corrections

The local administrator screen now:

- Uses the existing shared eight-Unicode-character and 72-UTF-8-byte password policy, matching the previously corrected backend. Invalid requests are blocked before submission.
- Masks temporary passwords, offers a keyboard-reachable visibility control, and clears passwords/visibility when review is opened, closed, refreshed or reset succeeds.
- Blocks closing the review during a pending credential operation and retains existing modal dismissal protection. Reset success explains that previous sessions end and authenticator verification remains required.
- Reloads the actual company association after a successful account link instead of reopening the stale unlinked company object. If linking succeeds but refresh fails, the message distinguishes those outcomes.
- Explains the company-versus-identity rejection boundary and prevents duplicate rejection submission or cancellation while it is pending.

The backend credential-reset function is unchanged in this milestone. Its actual Auth/session behavior is documented in DEV_ADMIN_CREDENTIAL_SECURITY_MILESTONE.md; this milestone tests the additional employer-screen entry point. Company-account association through `admin_link_employer_account` is distinct from linking a Google OAuth provider identity.

## Applied DEV package

Migration: `supabase/migrations/20261019001523_employer_rejection_account_boundaries.sql`.

SHA-256: `57603105ffca8483052a4b0eaafa39569cd84fc5744bed30c7a956fc90378fb4`.

The scaffold was created with the CLI on 16 October. On resumption, management reads confirmed no existing ledger entry and the old function still installed. Every function definition, policy, grant, constraint, trigger, tracked count and all sixteen business-table fingerprints matched the tested baseline. The tested SQL was then applied to independently verified DEV and renamed to the returned ledger version only after the full SQL hash matched exactly.

Final catalog comparison: **167 functions remain 167**; exactly one existing body/configuration changed (`admin_reject_employer(uuid,text)`), with a pinned `pg_catalog,public,pg_temp` search path and fully qualified table references. All existing execution ACLs, other function definitions/configurations, policies, table grants, constraints and triggers are unchanged. The migration itself performs no bulk row rewrite or deletion; later authorized calls use the corrected decision behavior.

## Verification and evidence

Evidence directory: `artifacts/employer-rejection-20261016/`.

| Check | Result and practical limit |
|---|---|
| Isolated baseline | Two reproductions passed: pending Google jobseeker deactivation and unrelated historical staff deactivation |
| Focused database suite | Seven passed, including retained baselines; jobseeker/profile continuity, rejected-company submission denial, approved-employer deactivation, preserved evidence, inactive/staff state, canonical admin/MFA/session checks and minimized/idempotent authority audit; reconfirmed 19 October |
| Full unit suite | **553 passed**, zero failures/skips, on 16 October |
| Full intercepted browser suite | **132 passed**, on 16 October |
| Fresh focused browser suite | **Five passed**, on 19 October: password bounds, masking/clearing, pending controls, refreshed company link and eligible Google jobseeker routing after company rejection |
| Current build / focused lint | Build passed after DEV environment validation; lint has zero errors and one pre-existing redundant-catch warning in the unchanged employer-delete handler |
| Signed DEV baseline | Four groups, **77 requests**, four real password/email/TOTP accounts, complete cleanup, on 16 October |
| Signed DEV verification | Five groups, **80 requests**, four real password/email/TOTP accounts, complete cleanup, on 19 October |
| Independent cleanup | Zero remnants in ten checked categories, covering eight synthetic Auth accounts and 110 recorded fixture IDs |
| Preservation | Sixteen business-table fingerprints match before/after; tracked counts restored; existing accreditation Storage-object count unchanged |

Native checks cover a real administrator linking a confirmed existing account to a pending company, a verified employer's denied rejection attempt, applicant/staff activation behavior, approved-employer access loss, accreditation synchronization, preserved approval/requirement evidence, repeat-decision audit, and revoked/anonymous denial. Signed sessions and TOTP are real; service credentials only prepare, inspect and clean exact synthetic records. Approved/historical company assignments are fixture preparation rather than proof of the whole accreditation approval workflow.

Google jobseeker continuity has isolated database and intercepted-browser coverage. No hosted Google identity was fabricated, and genuine Google callback/onboarding/provider-linking acceptance remains unverified. A preserved password-only applicant remains ineligible for Google-only jobseeker access in the native check.

Initial isolated fixtures omitted a current session-helper dependency and a required profile email; initial browser probes omitted required company timestamps and failed before exercising the intended UI assertions. These failed fixture logs are preserved and are not counted as behavioral baseline proof. Fixtures were corrected against actual DEV definitions/required fields. The corrected focused/native runs passed. The interrupted management cell was missing on resumption; fresh ledger/body/catalog reads established that the migration had not been applied, so it was applied once after revalidation.

## Data and governance boundary

Fingerprints cover profiles, participants, jobseeker profiles, employers, employer accreditation, accreditation requirements, events, vacancy definitions, event offerings, event participations, canonical selections, applications, interviews, employment outcomes, follow-ups and application audit records. Existing counts remain Auth users 20, identities 19, profiles 20, participants 38, jobseeker profiles 33, companies 21, events 35, definitions 20, offerings 16, registrations 40, selections 9, applications 9, interviews 5 and application audit records 790. Accreditation rows remain 7, requirements 105 and accreditation Storage objects 11. Outcome/follow-up counts remain 0/0. Managed Auth/platform logs may retain synthetic operation events; those were not purged.

This correction is an account-authority workflow, not a retention state, legal hold, records-series approval or disposal action. All proposed retention periods and disposition decisions remain inactive/pending. Company rejection is not final official case closure. No genuine account was reactivated or genuine case evidence rewritten by this milestone.

Security advisors retain eight internal RLS informational findings, eight anonymous-definer warnings, 65 authenticated-definer warnings and one leaked-password-protection warning. Guidance: [internal RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Official references consulted: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html), and the [Supabase changelog](https://supabase.com/changelog).

Remaining full-mission gates include the rest of the authority/workflow review, genuine Google/linking/onboarding acceptance, human-reviewed matching validation, remaining catalog integration and pending records/provider/backup decisions. This milestone does not establish whole-platform security or Production readiness.
