# DEV direct jobseeker-record deletion guard

Completed 19 October 2026. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. The wider development goal remains active.

## Result

The existing authenticated DELETE grants and administrator policies allowed an AAL2 administrator to delete a `participants` row and cascade its `jobseeker_profiles` row when no restrictive child record blocked it. The isolated PostgreSQL test reproduced this with synthetic records. Both tables anchor employment-service records, so direct deletion was an unreviewed disposition path.

A private BEFORE DELETE trigger now rejects direct authenticated deletion on both `participants` and `jobseeker_profiles` with SQLSTATE `42501`. It does not alter ordinary edits, RLS policies or existing table grants. Trusted internal/Auth/service maintenance remains available for exact fixture cleanup. This safeguard is not a retention schedule, legal hold, case-closure decision, or disposal approval workflow; a service role still has technical deletion capability and must remain operationally controlled.

## Files and DEV migration

- `supabase/migrations/20261019011702_guard_direct_jobseeker_record_deletion.sql` — applied DEV ledger version `20261019011702`; SHA-256 `a38883079ebd227c341d270291d03b623383616330e7eb02b92b275d76b5ad88`.
- `tests/unit/jobseeker-record-delete-guard-db.test.js` — pre-guard cascade reproduction; post-guard parent/child denial; normal edits, policy/grant metadata and trusted cleanup.
- `tests/integration/dev-profile-delete-guard.js` — signed synthetic AAL2 administrator check with a jobseeker scope and exact cleanup.
- Evidence: `artifacts/profile-delete-guard-20261019/native-jobseeker.json`. The first setup attempt failed the existing `profile_consent` check before guard testing; its exact fixture cleanup completed and its receipt is retained as `native-jobseeker-setup-failed.json`. The fixture now explicitly supplies synthetic consent; the database constraint was not weakened.
- `DEV_DATA_LIFECYCLE_AUDIT.md` — operational update; all proposed retention periods remain inactive.

## Verification

| Check | Result |
| --- | --- |
| Isolated PostgreSQL | Three focused tests passed. A baseline AAL2 administrator deletion cascaded a synthetic child row; after migration, both direct deletes failed and ordinary updates/trusted cleanup worked. |
| Full local suite and lint | 568 unit tests passed; zero failures or skips. Lint passed for the changed verification scripts. No frontend runtime source changed in this milestone. |
| Signed DEV | Synthetic password-based administrator verified TOTP to AAL2. Both direct DELETE requests returned HTTP 403 / SQLSTATE `42501`; parent and child remained. Exact synthetic records were then removed through trusted cleanup. Three checks, 31 guarded requests, and cleanup passed. |
| Independent DEV preservation | After both fixture runs and cleanup: 38 participants, 33 jobseeker profiles, 40 event participations, 9 applications and 790 audit entries, matching pre-migration counts. Zero fixture Auth users, participants, jobseeker profiles, sessions, MFA factors or audits remain. No genuine record was targeted or changed. |
| Permissions and trigger surface | Participant/profile policy counts remain 8/7; authenticated table DELETE grants remain as before. The two new triggers raise their counts to 2/6. Anonymous/authenticated direct function EXECUTE is false. |

The management URL was verified immediately before every DEV database operation and before signed native acceptance. The applied migration ledger contains one row for the returned version. No Production operation, Git commit/push, Vercel operation or Edge Function deployment occurred.

## Related Google sign-in check

After the dedicated DEV Google OAuth configuration was reported fixed, a public authorization redirect probe returned Google HTTP 200 with `redirect_uri_mismatch: false` at `2026-10-19T06:32:12Z`. Evidence: `artifacts/oauth-current-20261019/public-redirect-observation.json`; the earlier mismatch observation is preserved as `public-redirect-before-fix.json`. A user then reported reaching `/profile`. Read-only DEV Auth metadata confirmed a recent Google applicant session linked to an existing participant and jobseeker profile, but its email did not match the designated new-account address. The designated address still had no DEV Auth user or Google identity at that observation. No account email or profile content was retrieved for the existing user.

`src/services/authService.js` now sends Google's `prompt=select_account` in the OAuth request to make the next account choice explicit. Credential-free isolated browser checks on both `https://127.0.0.1:5173` and `https://localhost:5173` observed `provider=google`, `prompt=select_account` and the matching DEV local callback in the actual authorization navigation. The designated Google-only applicant then reached `/register`; DEV metadata confirmed its new identity and participant link, with no completed jobseeker profile or Partner role. `DEV_GOOGLE_JOBSEEKER_SIGNIN_MILESTONE.md` records the exact acceptance boundary. Lint and build passed; existing lint and bundle-size warnings remain. Profile-save and existing Partner identity-linking acceptance remain pending.

## Remaining decisions

The Provincial Records Officer, DPO and authorized Provincial Government authorities still need to classify case records, approve retention triggers/periods, holds, disposition authority and provider handling. Other personal-data tables, Storage objects, derived AI/embedding copies, exports and backups require their own dependency controls. Do not implement live disposal until an approved policy and procedure exist. The wider mission still needs genuine DEV Google acceptance and representative matching evaluation.

**Milestone:** direct jobseeker-record deletion guard.  
**Environment:** local and Supabase DEV `cdmkzzmaswwiryymtycn`.  
**Database migration:** one non-destructive DEV-only trigger migration.  
**Tests:** 568 local unit tests, three focused SQL tests and signed DEV synthetic acceptance passed; an initial fixture setup failure was corrected and retained as evidence.  
**Security:** AAL2 administrator direct parent/child deletes denied; trusted exact cleanup preserved.  
**Git commits/pushes:** None.  
**Deployment:** None.  
**Production modified:** No.
