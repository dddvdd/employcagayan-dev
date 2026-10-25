# DEV employer approval and account activation boundary

Completed 19 October 2026. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. The full development mission remains active.

## Confirmed defect and correction

Both existing administrator functions implicitly changed a disabled profile back to active. `admin_link_employer_account` did so when linking an inactive applicant to an already approved active company. `admin_approve_employer` did so when approving a pending company already linked to an inactive applicant. Isolated database tests and actual signed DEV administrator requests reproduced both paths. A company decision therefore overrode a separate account-deactivation decision.

Linking now rejects an inactive target before writing the company association. Approval locks and checks any linked profile before changing company or accreditation status, and rejects an inactive target. Once a verified administrator separately activates the account, both ordinary operations work. They assign the canonical employer role without writing `is_active=true`. A company without a linked account can still be approved under the existing accreditation rules. Existing staff-role exclusion, requirement evidence checks, code issuance, Auth/session/TOTP requirements, and company approval behavior were retained. The two functions take the company lock before the profile lock and pin `pg_catalog,public,pg_temp` with qualified table references.

The administrator screen's success message now says employer access was enabled after a linked account is approved, matching the active-account precondition. Backend errors tell the reviewer when explicit account activation is needed.

## Files and DEV migration

- `supabase/migrations/20261019003350_employer_approval_account_activation_guard.sql`
- `src/pages/Admin/EmployerManagement.jsx`
- `tests/unit/employer-activation-boundary-db.test.js`
- `tests/integration/dev-employer-activation.js`
- `DEV_DATA_LIFECYCLE_AUDIT.md` and this report
- Evidence: `artifacts/employer-activation-20261019/native-baseline.json` and `native-verify.json`

The migration was scaffolded locally, tested in isolated PostgreSQL, then applied once to independently verified DEV. The local filename was aligned with the returned ledger version `20261019003350` only after the complete ledger statement matched the local SQL after line-ending and outer-whitespace normalization. Exact local file SHA-256: `39227d82db787fb80b58c9aec33c9af148f1dca6ea746ab84a31dd7ef6e66853`. No new table, RPC, policy, grant, trigger, constraint, bulk data update or personal-record deletion was introduced. `CREATE OR REPLACE` retained each existing execution ACL.

## Tests and preservation evidence

| Check | Result |
| --- | --- |
| Isolated database | Five passed: both old reactivation reproductions, denied/atomic disabled-account decisions, separate activation and normal success, unlinked approval, and active administrator AAL2 boundary. |
| Full unit suite | 558 passed; zero failures/skips. |
| Full intercepted browser suite | 132 passed. These use synthetic responses and do not prove real Google OAuth. |
| Application build and lint | Build passed. Lint exited successfully with 16 existing warnings, including an unchanged redundant catch in the employer screen. |
| Signed DEV baseline | Three groups, 87 guarded HTTPS requests. Real password login and TOTP AAL2 administrator reproduced both inactive-account reactivations. Exact synthetic cleanup restored all tracked counts and 16 business-record fingerprints before migration. |
| Signed DEV verification | Four groups, 96 guarded HTTPS requests. AAL1 company decisions failed; AAL2 attempts against inactive accounts returned 42501 without changing company/accreditation/profile state. Separate signed administrator profile activation then allowed linking and approval, with all synthetic requirement PDFs reviewed by that administrator. |
| Independent cleanup | Zero remnants across ten categories for 74 recorded fixture IDs and 30 uploaded Storage paths: Auth users, identities, sessions, factors, profiles, companies, accreditation, requirements, application audit and Storage objects. |

The native acceptance accounts were real DEV password/email Auth users with a real TOTP challenge. Service credentials only prepared, inspected and cleaned exact synthetic fixtures. No Google identity was fabricated. The approved company and requirement documents were synthetic test setup, not evidence of a full genuine employer accreditation review.

After DEV verification, 167 public/app functions remained 167. Only `admin_approve_employer(uuid)` and `admin_link_employer_account(uuid,text)` changed body and pinned search path; both kept their prior ACL and definer status. Every other function definition/configuration, policy expression, table grant, constraint and trigger matched the pre-migration catalog. Tracked counts, cross-event integrity checks, accreditation/Storage counts and all 16 business-table content fingerprints matched before/after. Current genuine data had zero inactive profiles linked to pending or approved companies; no genuine row needed repair.

The security advisor still reports eight internal RLS-without-policy informational notices, eight anonymous-definer notices, 65 authenticated-definer notices and one leaked-password-protection warning. A notice is a review surface, not proof of exposure. [RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Outstanding work and next action

The existing User Management screen lists staff roles, so it does not yet give an administrator an in-screen way to find and activate a disabled applicant before linking that account to a company. The signed DEV API proved the separately authorized activation works, but the complete human-facing path needs a scoped, audited control and usability check. No historical inactive genuine account was automatically reactivated. The genuine Google callback/provider-linking path, reviewed matching-quality data, remaining classification integration and privacy/records decisions remain open. No retention period was activated and no disposal executor was added.

**Milestone:** employer approval/linking account-activation boundary.  
**Environment verified:** Supabase DEV `cdmkzzmaswwiryymtycn` URL checked independently before each management operation and native run.  
**What was implemented:** Two corrected existing database functions and accurate administrator success copy.  
**Files changed:** listed above.  
**Database migrations:** one DEV-only migration, version `20261019003350`; no Production migration.  
**Tests executed:** isolated SQL, full unit, full browser, build, lint, real signed DEV baseline/verification and independent cleanup/preservation reads.  
**Tests passed/failed:** 558 unit, 132 browser and five focused SQL passed; no final failures.  
**Security observations:** inactive-account decisions are independent; administrator/TOTP boundary and previous grants remain.  
**Outstanding defects:** human-facing disabled applicant activation path and wider mission gates above.  
**Next recommended action:** provide an explicit audited administrator recovery/activation path in company review, then continue the remaining authority and genuine Google acceptance work.  
**Git commits/pushes:** None.  
**Deployment:** None.  
**Production modified:** No.
