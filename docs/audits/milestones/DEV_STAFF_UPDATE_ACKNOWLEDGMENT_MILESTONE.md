# DEV staff-update acknowledgment check

Date: 2026-10-19 Asia/Manila. Scope: local EMPLOYCagayan and read-only Supabase DEV `cdmkzzmaswwiryymtycn` inspection.

## Result

The staff-management page now requires an actual returned profile row before it reports that an edit, activation, or deactivation succeeded. The update is scoped to the selected staff ID, its previously observed staff role, and its previously observed active flag. A row that was changed concurrently, removed, or hidden by authorization produces a reload instruction instead of a false success. A successful status action displays the state returned by the database.

`profileService.updateSelf` had issued an update without requesting the changed row. PostgREST can acknowledge an update that matched zero rows without an error, and the old page optimistically flipped the displayed status. The new `updateStaff` checks the selected and replacement roles, requests a returned row, and treats an empty result as a conflict. Only the staff-management page called the old helper.

## Verification

- The refreshed Supabase connection returned the exact authorized DEV URL before each management read. The DEV ledger already includes `psoc_hierarchy_name_uniqueness` and `psoc_2022_api_catalog_foundation`; their earlier import and index changes were not replayed.
- Live DEV metadata confirms the `profiles` administrator policy, mandatory identity/MFA session policies, permission-change trigger, and audit trigger. The live permission trigger requires a verified administrator for client-side authority-field changes; the admin predicate checks active status, confirmed identity, live Partner MFA, and AAL2.
- Six focused Chromium tests pass. New cases cover a zero-row update, which must leave the account visibly active and show an error, and a successful update, which uses the returned inactive state.
- Application build and lint pass. Lint retains pre-existing warnings outside this change; the build retains existing bundle warnings.

No database writes, genuine personal-record changes, Production operations, Git commits/pushes, hosting deployments, or Edge Function publications occurred in this milestone.

## Remaining authority decision

An active AAL2 administrator can still directly change `profiles.is_active` through the existing broad administrator update policy. The reviewed employer reactivation RPC records a reason but is not the exclusive path for a direct administrator update. A separate backend authority design and regression are needed if the Provincial Government requires every employer-account reactivation to carry a reviewed reason. This UI acknowledgment fix does not claim to enforce that policy.
