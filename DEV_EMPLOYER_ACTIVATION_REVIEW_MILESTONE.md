# DEV company account reactivation review

Completed 19 October 2026. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. The full development mission remains active.

## Result

The previous DEV correction made employer linking and approval reject an independently inactive account. The company review screen had no way to make the required separate activation decision for an applicant or employer identity; User Management lists staff roles only. This milestone adds that deliberate administrator path while keeping activation, company association and accreditation approval as distinct operations.

`admin_reactivate_employer_account(uuid,text,text)` requires the existing active canonical administrator, live Auth session and verified TOTP guard. It locks the active pending/approved company and target identity, selects a confirmed applicant/employer account by its exact Auth email when the company is unlinked, or by the existing company association when linked, and refuses banned, already active, staff, other-company or mismatched identities. It accepts only two reason codes. It updates the existing profile activity flag and writes an actor/target/company/reason-code audit without email, free text or document data. The existing profile-authority trigger also records the state transition. The function neither assigns a role nor links or approves a company, and it does not remove or bypass an MFA factor.

The company review screen displays the linked account's current status. An inactive unlinked account becomes eligible for a separate activation panel only after the existing link operation returns its specific inactive-account error. An inactive linked account displays the panel during review, including when approval opens the review after denial. The reviewer selects a reason and acknowledges the decision; a pending operation blocks dismissal. Activation leaves linking or approval as an explicit next click. A failed status read does not offer the action.

The checkbox records a human assertion; the application cannot independently prove identity verification or the sufficiency of a Provincial Government review procedure. The existing broader administrator profile UPDATE permission was not removed or narrowed by this milestone. This function provides a constrained, auditable company workflow, not exclusive account-activation authority or a replacement for the separate MFA lost-device recovery process.

## Files and DEV migration

- `supabase/migrations/20261019004914_employer_account_reactivation_review.sql`
- `src/pages/Admin/EmployerManagement.jsx`, `src/services/employerService.js`
- `tests/unit/employer-activation-review-db.test.js`, `tests/browser/employer-account-review.spec.js`
- `tests/integration/dev-employer-activation.js`, `DEV_DATA_LIFECYCLE_AUDIT.md`, and this report
- Evidence: `artifacts/employer-activation-review-20261019/` (`unit-tests.txt`, `browser-tests.txt`, `native-reviewed.json`)

The local migration was scaffolded, isolated-test verified and applied once only to the independently verified DEV project. The complete DEV ledger statement matched the local SQL after outer-whitespace and line-ending normalization. The local filename was aligned to the returned ledger version `20261019004914` afterward. Exact migration file SHA-256: `2be897a030babd2b59e821b874d829dcc6569a252842b84187a1d39c6c8ab318`.

No table, column, policy, broad grant, existing function, trigger or constraint changed. The one new definer grants EXECUTE to authenticated only; anonymous and service-role direct execution are denied, and the fixed search path is `pg_catalog,public,pg_temp`.

## Verification

| Check | Result and scope |
| --- | --- |
| Focused isolated PostgreSQL | Four passed: separate activation/audit, linked pending company unchanged, invalid target/reason/banned/other-company denial, AAL1/wrong-role/revoked/public denial and scoped ACLs. |
| Focused browser | Seven passed after fixing an initial null-review render error; cases include inactive unlinked and linked review, reason/acknowledgment requirements, no automatic link/approval and pending-dialog protection. |
| Full local unit suite | 562 passed, zero failures/skips. |
| Full intercepted Chromium suite | 134 passed. Intercepted identities do not establish genuine Google acceptance. |
| Build and lint | Build passed. Lint exited zero with existing warnings, including an unrelated redundant catch in the employer screen. |
| Signed DEV | Five check groups, 100 guarded HTTPS requests. A real synthetic admin password login was denied at AAL1. After real TOTP verification, two scoped reactivations succeeded, reason-only audit entries identified that admin, company association/approval stayed unchanged, and explicit later link/approval succeeded. All uploaded requirement PDFs were synthetic and reviewed through the signed admin RPC. |
| Independent fixture cleanup | Zero remnants in ten checked categories covering 37 recorded fixture IDs and 15 Storage paths: Auth users/identities/sessions/factors, profiles, companies, accreditation/requirements, application audit and documents. |

The first focused browser run encountered a real null render when no review was open. That render guard was fixed; the final focused and full browser runs passed. No failed run is counted as acceptance. Service credentials prepared, inspected and cleaned exact fixtures; ordinary signed admin requests performed the accepted decisions. No genuine Google identity, personal record or AI provider was used.

The post-verification catalog contains 168 public/app functions, up from 167: exactly the new scoped routine. Existing function definitions/configurations, full policy expressions, table grants, constraints and triggers match the saved pre-migration state. All tracked counts, cross-event integrity checks, accreditation/Storage counts and sixteen business-table content fingerprints match before/after. No genuine person or case row was rewritten or deleted. No synthetic reactivation audit remained after exact cleanup.

The security advisor now reports eight internal RLS informational notices, eight anonymous-definer notices, 66 authenticated-definer notices and the existing leaked-password-protection warning. The one added authenticated-definer notice corresponds to this guarded routine; its execution ACL and signed actor behavior were verified individually. [Definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Outstanding mission work

Genuine Google OAuth/provider linking and jobseeker owner acceptance remain unverified after the earlier DEV Google callback mismatch. The broader administrator profile UPDATE surface and remaining privileged functions still need individual review. Provincial identity-review evidence and record-series/retention decisions remain unapproved. Matching quality needs a genuinely human-reviewed validation dataset, and remaining classification integrations remain open. This account action does not activate a retention period, run disposal or change MFA recovery.

**Milestone:** explicit company-scoped account reactivation review.  
**Environment verified:** independent Supabase DEV URL confirmation before every management operation and the signed native run.  
**What was implemented:** guarded audited reactivation RPC, administrator review control and service call.  
**Files changed:** listed above.  
**Database migrations:** one DEV-only migration, version `20261019004914`.  
**Tests executed:** isolated SQL, focused/full browser, full unit, build, lint, signed DEV acceptance, independent cleanup and preservation reads.  
**Tests passed/failed:** final 562 unit, 134 browser and four focused SQL passed; zero final failures.  
**Security observations:** existing RLS/grants preserved; new routine requires active admin/TOTP/session and exposes no public or service EXECUTE.  
**Outstanding defects:** genuine Google acceptance, wider authority review, human-reviewed quality and governance decisions.  
**Next recommended action:** audit the remaining direct administrator profile-authority path and complete genuine DEV Google configuration/owner acceptance when the dedicated client callback is available.  
**Git commits/pushes:** None.  
**Deployment:** None.  
**Production modified:** No.
