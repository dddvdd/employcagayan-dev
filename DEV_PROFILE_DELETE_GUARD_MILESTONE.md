# DEV direct profile deletion guard

Completed 19 October 2026. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. The full development mission remains active.

## Result

The existing `Admins manage profiles` policy and authenticated DELETE grant permitted an active AAL2 administrator to delete a profile directly. DEV had no BEFORE DELETE trigger on `profiles`. An isolated synthetic PostgreSQL fixture reproduced that result. Profile deletion can sever or cascade linked identity and case relationships, so ordinary administrator account management must not function as an unreviewed records-disposition operation.

A private trigger now rejects direct authenticated `profiles` deletion with SQLSTATE `42501`. It leaves all existing RLS policies, grants, profile edits, staff activation, and Auth user deletion behavior unchanged. This is a non-destructive guard, not a retention period, legal hold, disposal authority, or live deletion procedure. Other personal-data tables and Storage still require record-series decisions and separate guard review.

The first DEV migration omitted the internal `supabase_auth_admin` role from its trusted maintenance list. DEV metadata then showed that `profiles_id_fkey` uses `ON DELETE CASCADE` from `auth.users`, so normal Auth cleanup might have been blocked. A second additive migration immediately included that internal Auth role. The isolated cascade test and actual synthetic Auth cleanup both passed after correction. We did not attempt a genuine Auth deletion during the gap. The historical two-migration sequence is retained and disclosed; the first file was not edited after application.

## Files and DEV migrations

- `supabase/migrations/20261019010331_guard_direct_profile_deletion.sql` — SHA-256 `7bbc7efcf30b773d388aa003932a4073ad80e19d5607bcca8c2db11e50525cbc`.
- `supabase/migrations/20261019010556_guard_profile_delete_auth_maintenance.sql` — SHA-256 `7d9303fd6b1714c08843a6e7b773bd286fc88815c4cb6682c643f445a7bc5308`.
- `tests/unit/profile-direct-delete-guard-db.test.js` — direct administrator behavior, unchanged profile edits/policies/grants, private function ACLs, and internal Auth cascade.
- `tests/integration/dev-profile-delete-guard.js` — genuine signed synthetic admin AAL2 and exact Auth cleanup.
- `tests/integration/cleanup-dev-profile-delete-audit.js` — one-time exact synthetic audit cleanup after the first native run.
- `DEV_DATA_LIFECYCLE_AUDIT.md` and this report.
- Evidence: `artifacts/profile-delete-guard-20261019/native.json` and `audit-cleanup.json`.

Both DEV migration ledger entries contain one SQL statement each and match their local files after whitespace and line-ending normalization. Management connection URL was checked immediately before every DEV database operation. The local filenames were aligned to the returned ledger versions after application.

## Verification

| Check | Result |
| --- | --- |
| Isolated PostgreSQL | Three focused tests passed, including the baseline direct-delete reproduction, protected update path, unchanged policy/grant metadata, denied function execution, and internal Auth cascade. |
| Full local unit suite | 565 passed, zero failed/skipped. No browser suite was rerun because this milestone changed no frontend runtime source. |
| Signed DEV | One real synthetic password-based administrator enrolled and verified TOTP to AAL2. Its direct profile DELETE returned `42501`; the target remained. Supabase Auth then removed both exact synthetic users and profiles through its normal internal path. Three checks and 19 guarded HTTPS requests passed. |
| Independent DEV preservation | Profiles 20, Auth users 20, audit logs 790 and profile fingerprint `b5ff543a37978e3c0a7cc4a8ee9d29d0` matched the pre-migration baseline. Five profile policies remain; the trigger count rose from four to five, as expected. There are zero fixture Auth users, profiles, sessions, MFA factors or audit entries. |
| Function surface | Anonymous and authenticated direct EXECUTE on the private trigger function are false. No existing policy or table grant changed. |

The synthetic role setup created one minimized audit entry. After its exact ID, record target, role transition and time were independently verified, it was removed through the scoped fixture cleanup script. The native script now includes this cleanup for future runs. No genuine personal record was deleted or changed.

## Remaining work

The reviewed employer reactivation action remains non-exclusive because verified administrators can directly update profile activity. Ordinary inactive jobseeker recovery and MFA recovery also change activity, so a blanket activation restriction would be unsafe without a defined authority policy and tested alternate paths. Other directly deletable personal-data tables and Storage copies need their own dependency and disposition review. The Provincial Records Officer and DPO must still approve record classifications, retention triggers, holds, disposal authority and provider handling before any live disposition workflow exists. Genuine Google sign-in remains blocked by the dedicated DEV OAuth redirect mismatch.

**Milestone:** direct profile deletion guard.  
**Environment verified:** local checkout and exact Supabase DEV URL before each management/native operation.  
**What was implemented:** private guard plus internal Auth maintenance correction.  
**Database migrations:** two DEV-only, versions `20261019010331` and `20261019010556`.  
**Tests passed/failed:** 565 local unit, three focused SQL and signed DEV acceptance passed; zero final failures.  
**Security observations:** direct AAL2 administrator profile deletion denied; trusted Auth cleanup preserved.  
**Outstanding defects:** remaining direct disposal surfaces, employer reactivation reason path, Google owner acceptance and wider mission items.  
**Next recommended action:** inspect other personal-data DELETE surfaces and complete dedicated DEV Google configuration.  
**Git commits/pushes:** None.  
**Deployment:** None.  
**Production modified:** No.
