# DEV recruitment history and provenance protection

Completed 2026-10-16 in local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn`. This is a security/workflow milestone within the active development mission. No Git commit/push, hosting or Edge Function publication, Production operation, AI-provider request, genuine case deletion, retention schedule or disposal executor.

## Problem and resulting behavior

The actual-schema SQL fixture and actual signed DEV accounts reproduced three defects:

1. An approved employer could move an offering already referenced by a formal application to another event. The application's registration then belonged to a different event, and an otherwise valid application-status update failed.
2. The employer's direct application DELETE was correctly denied, but removing its event offering cascaded the same application and interest selection.
3. An administrator could remove an event registration and cascade its formal application and recorded interview.

The independently inspected existing DEV records had **zero cross-event selections and zero inconsistent event applications**. No genuine rows needed repair. The correction prevents future linked-parent removal/reassignment and retains normal metadata edits, case review and unused-offering moves/removal.

Employer and administrator offering dialogs now provide **Close applications**, explain that existing records are retained, lock competing actions during submission, and show the closed state after reload. A rejected removal keeps the dialog and offering visible. Existing vacancy deactivation remains available. Closing an offering changes its existing application deadline; it is not final service-case closure or a retention trigger.

## Applied package and authority boundary

Migration: `supabase/migrations/20261016062910_recruitment_case_provenance_guards.sql`.

SHA-256: `73b1a64249fa07f0909f5361be7f5977ddf2356d3bb2f7530adb55388b313dfa`.

The CLI-created scaffold was tested locally, applied through the verified DEV management connection, and renamed to the returned ledger version only after the ledger's full SQL hash matched the local file. The migration contains no row deletion or bulk record rewrite.

- Three owner-only private trigger functions protect linked parent identity/removal, pin referenced parents before validation, and audit deadline changes. Direct execution is not granted to public, anonymous, authenticated or service roles.
- Eleven triggers bind those functions to the three parents, seven child categories and deadline audit. Parent checks include canonical/legacy interest selections, formal applications, manual interviews, and medical/returning-worker links where applicable.
- Parent locks follow definition `FOR SHARE`, offering `FOR KEY SHARE`, then registration `FOR KEY SHARE`. The stronger definition lock also conflicts with a non-key employer-ownership update. Canonical selections verify the locked registration and offering belong to the same event.
- `close_event_offering_applications(uuid)` is a public **security-invoker** operation, authenticated-only, requiring the active canonical employer/admin role and existing session/MFA controls. Existing table permissions and RLS determine row ownership. Closure uses database statement time, preserves an earlier deadline, and is idempotent. Its audit contains actor/target identifiers and old/new deadlines, without employment free text.
- `get_employer_applicants(uuid)` retains its existing recruitment/owner/approved-company gates and excludes any historical selection whose registration event differs from the offering event. A local regression seeds such a pre-existing mismatch before applying the fix, confirms it is excluded without rewriting/deleting it, and checks valid and foreign-company cases.

Final catalog verification: **161 → 165** public/app functions; exactly **one existing function body** changed (`get_employer_applicants`), four functions added, eleven triggers added. Existing function execution ACLs, existing triggers, table grants, policies and constraints are unchanged. No table or retention-state column was added. The existing application canonical-identity validator was not replaced.

## Verification and retained evidence

Evidence directory: `artifacts/recruitment-provenance-20261016/`.

| Check | Result and scope |
|---|---|
| Full unit suite | **538 passed**, zero failed/skipped; includes eleven provenance SQL regressions |
| Full intercepted browser suite | **123 passed**; four new employer/admin close/removal/pending/reload checks |
| Build and changed-source lint | Passed; build retains its existing chunk-size/plugin-timing notices |
| Native baseline | Four groups, 98 requests, real signed owner/admin TOTP sessions; all three defects reproduced; cleanup complete |
| Native verification | Four groups, 115 requests, real signed owner/admin TOTP sessions; linked-parent changes/deletion denied, harmless edits and unused moves/removal allowed, closure scoped/audited/idempotent, existing review allowed, new closed-offering application and foreign-company/anonymous/revoked-session requests denied |
| Native concurrent checks | Four independently timed signed-admin HTTP operations against synthetic management transactions; three parent changes wait then fail `23503`, reverse-order stale selection waits then fails `23514` |
| Independent cleanup | All 17 inspected synthetic-remnant categories are zero, covering 13 synthetic Auth accounts and 104 recorded fixture IDs across attempts and successful runs |
| Existing business records | Pre/post content fingerprints match across twelve audited business tables; tracked counts match; both canonical inconsistency counts remain zero |
| Schema/security comparison | Existing ACLs, policies, table grants, constraints and trigger definitions match; only the stated additions/body change |

The four concurrency cases cover the canonical selection link and offering event, registration event and vacancy employer identity. The management transactions held real locks for 45/50 seconds; the independently running, actually signed TOTP administrator issued its request after 45 seconds. The registration, ownership and reverse-order requests spent approximately 6.5 seconds waiting before rejection. The offering case waited approximately 1.7 seconds. These are bounded concurrency checks, not a proof of every possible workflow, isolation level or deadlock pattern. The management side tests database mechanics; it is not counted as ordinary-user acceptance.

Earlier management-only probes could not establish overlap because connector requests were serialized. Their inconclusive results remain in `concurrency-checks.json`. A first short-delay native probe completed the parent move before insertion and therefore did not establish an overlap; it is preserved separately. Two management SQL cleanup calls returned `Invalid or expired requestState`; the existing guarded fixture API performed exact synthetic cleanup, and subsequent independent management reads verified zero remnants.

The first native setup attempt omitted workplace information required for publication and used an incorrect profile cleanup-verification column; actual fixture deletion calls had completed. A second setup attempt collided with an intentionally unused offering at the move destination. Both failed receipts are retained. The corrected baseline passed. An initial post-change assertion compared database time with the workstation clock; its failed receipt is retained. Native closure now checks the returned deadline and idempotence; isolated SQL explicitly checks the deadline against database statement time. The final independent check covers all attempts and finds zero remaining fixture accounts/business records. Managed Auth/security platform logs may still record synthetic test operations; they were not purged.

## Preservation and outstanding decisions

The pre/post tracked counts are: Auth users 20, identities 19, profiles 20, participants 38, jobseeker profiles 33, companies 21, events 35, definitions 20, offerings 16, registrations 40, selections 9, applications 9, interviews 5 and application audit records 790. The twelve table fingerprints cover profiles, participants, jobseeker profiles, companies, events, definitions, offerings, registrations, selections, applications, interviews and application audit records. Fingerprints do not certify unrelated stores or third-party copies.

These guards protect operational recruitment dependencies. They are not legal holds, an immutable case archive, an approved records schedule or authority to dispose. Historical profile/qualification/resume versions, vacancy-history-only records, other child-edit paths, exports, AI working copies, Storage, platform logs and backups still require the existing appraisal and governance decisions. A future approved disposition procedure must explicitly reconcile these protections and all linked records; no bypass or executor is installed here. Medical/returning-worker SQL tests use presence-only boundary fixtures, not native clinical workflow acceptance.

Security advisors retain the prior eight internal RLS informational findings, eight anonymous-definer warnings, 65 authenticated-definer warnings and one leaked-password-protection warning. The new private functions do not expand the public definer surface. Guidance: [anonymous definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [internal RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Official references checked: [Supabase triggers](https://supabase.com/docs/guides/database/postgres/triggers), [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html), [trigger data visibility](https://www.postgresql.org/docs/17/trigger-datachanges.html), and the [Supabase changelog](https://supabase.com/changelog). Its current [TLS deprecation notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) does not change the database trigger design; no TLS setting was changed.

The broader mission remains active. Remaining gates include the rest of the authenticated-function authority review, genuine Google owner/linking/onboarding acceptance, human-reviewed ranking validation, remaining classification integration, approved privacy/provider/records decisions and backup evidence. No production-readiness claim is made.
