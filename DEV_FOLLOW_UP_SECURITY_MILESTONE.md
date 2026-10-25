# DEV canonical follow-up workflow correction

Completed 2026-10-16 in local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn`. The broader development mission remains active. No Git commit/push, hosting or Edge Function publication, Production change, AI-provider request, genuine personal-record deletion, automatic scheduling or retention-policy activation.

## Confirmed defects and corrected behavior

The actual-schema fixture and actual signed DEV accounts reproduced these problems:

1. Staff could read a canonical employment outcome but could not read or create its follow-up. The follow-up policies still joined `registrants_legacy`; the outcome policies had already moved to canonical event participations.
2. An administrator could move an existing follow-up to another employment case. Record identity and creation metadata were also directly updateable.
3. The edit screen sent an empty completion date as `''`, which the actual PostgreSQL date column rejects. It also treated an HTTP success representing zero saved rows as a completed save and merged its submitted form instead of the actual database result.

Staff follow-up access now uses the same canonical outcome scope as the existing outcome workflow. Municipal restrictions, provincial oversight, existing medical scope, active identity/session checks and mandatory Partner MFA remain in force. The existing administrator policy remains unchanged. This is a canonical-reference correction, not a newly discovered MFA bypass.

The follow-up's existing case link, record ID and creation field cannot be reassigned through an UPDATE, including by an administrator. Ordinary status, date, answer and remarks edits remain available. The screen now saves a missing date as `null`, preserves unknown answers separately from explicit `false`, requires one represented saved row and merges the returned fields. It stays open after a failed/zero-row save. Existing pending-dialog protection is retained and tested.

## Database package and limited policy change

Applied migration: `supabase/migrations/20261016075443_follow_up_canonical_case_guards.sql`.

SHA-256: `15c42442e62e619e286f870a00b84a259f90551bc959b91364539c51d2c58140`.

The scaffold was created by the CLI, tested locally, applied only after independent DEV URL verification, and renamed to the management ledger version after its SQL hash matched exactly.

Only **two existing policies** change: `Staff manage follow-ups` and `Staff view follow-ups`. They join the referenced outcome and use the existing `app.outcome_application_scope_satisfied(application_id)` helper. The manage policy explicitly checks both existing and proposed row scope. Its existing ALL-operation semantics remain; this milestone does not install a business disposal action or authorize genuine records disposition.

All other policies, table grants, constraints, existing triggers and existing function bodies/configuration/ACLs are unchanged. RLS and the existing identity/MFA restrictive policies remain installed. No table, column, public RPC or ordinary execution grant was added.

Two private, owner-only trigger functions and two triggers were added:

- `app.guard_follow_up_case_identity()` runs as security invoker and rejects changes to the case link, ID or creation field. It needs no elevated lookup privilege.
- `app.audit_follow_up_change()` runs as security definer with a fixed search path and no public/authenticated/service direct execution. Signed business inserts, material updates and deletes add actor/record identifiers and old/new `status` and `follow_up_type` only. No remarks, salary, position, contact text or confirmation answers are copied. No-op updates do not duplicate audit events; trusted fixture/maintenance operations do not impersonate business actors.

The function catalog changes from **165 to 167**, with no existing function body changes. These controls preserve the existing record's references; they do not attest every historical field, create an immutable case archive, or prevent every existing authorized child-row edit/removal elsewhere in the system.

## Verification

Evidence: `artifacts/follow-up-security-20261016/`.

| Check | Result / scope |
|---|---|
| Isolated baseline | Three reproductions passed: canonical access gap, cross-case reassignment, empty date rejection |
| Isolated corrected database suite | Eight tests passed, including retained baseline reproductions; canonical staff writes, municipal/provincial/medical scope, case identity, minimal audit, no-op behavior, inactive/AAL1/revoked sessions, employer/jobseeker denial and private execution boundaries |
| Browser baseline | Three desired checks failed on the original save flow; logs retained |
| Full unit suite | **546 passed**, no failures/skips |
| Full intercepted browser suite | **127 passed**, including four follow-up checks: zero-row save, unknown date/server result, pending controls and editable-field allowlist |
| Build / changed-source lint | Passed; existing build size/plugin-timing notices remain |
| Signed DEV baseline | Two groups, **89 requests**, three actual password/TOTP accounts, complete cleanup |
| Signed DEV verification | Four groups, **101 requests**, three actual password/TOTP accounts, complete cleanup |
| Independent final verification | Zero synthetic remnants across 17 categories; six test accounts and 39 recorded fixture IDs covered |
| Preservation | All fourteen audited business-table fingerprints match before/after; tracked business/Auth counts restored; existing policies/grants/constraints/functions unchanged except the exact additions/two-policy correction above |

Native acceptance verifies canonical outcome/follow-up access, staff creation and edits, missing dates and negative answers, administrator reparent/ID/time-change rejection, foreign municipal read/update/insert denial, matching municipal/provincial success, audit attribution/minimization, and revoked-session/anonymous denial. It uses real signed Auth sessions with verified TOTP. Service credentials only prepare, inspect and clean exact synthetic fixtures. No hosted Google identity was fabricated. Medical/employer/jobseeker boundaries have isolated SQL coverage rather than a native acceptance claim.

The fourteen fingerprinted tables are profiles, participants, jobseeker profiles, employers, events, vacancy definitions, event offerings, event participations, canonical selections, applications, interviews, employment outcomes, follow-ups and application audit records. Existing DEV outcome/follow-up counts were **0/0** and remain **0/0**. Other tracked counts remain Auth users 20, identities 19, profiles 20, participants 38, jobseeker profiles 33, companies 21, events 35, definitions 20, offerings 16, registrations 40, selections 9, applications 9, interviews 5 and application audit records 790. Managed Auth/platform logs may retain synthetic test-operation events; those were not purged.

## Remaining governance and mission boundaries

This milestone adds no automatic follow-up generation, scheduler, disposal executor, retention clock, legal-hold release or approved retention period. A follow-up labelled `completed`, an entered completion date or a vacancy closing is not automatically final official case closure. The existing manual management/deletion permissions are not a records-disposition approval. Records Officer/DPO decisions, resume/version appraisal, provider privacy settings, exported copies and backups remain governed by the pending decision register.

The security advisor categories remain the prior eight internal RLS informational findings, eight anonymous-definer warnings, 65 authenticated-definer warnings and one leaked-password-protection warning. Relevant guidance: [internal RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Official references checked: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase represented updates](https://supabase.com/docs/reference/javascript/update), and [PostgreSQL ALTER POLICY](https://www.postgresql.org/docs/17/sql-alterpolicy.html).

Remaining full-mission gates include the rest of the authority/workflow review, genuine Google/linking/onboarding acceptance, human-reviewed ranking validation, remaining catalog integration and the pending records/provider/backup decisions. These results do not establish full-platform security or Production readiness.
