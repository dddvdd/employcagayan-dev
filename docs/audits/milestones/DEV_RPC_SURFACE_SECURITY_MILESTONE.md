# DEV public RPC surface security and registration repair

**Milestone:** Review all 17 anonymous-callable public SECURITY DEFINER functions, close confirmed privacy exposure and repair affected event registration.
**Date:** 2026-10-16 Asia/Manila.
**Environment verified:** Local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. Exact URL and management identity were checked before database operations. No Production operation occurred.

## Confirmed findings and resulting behavior

1. **Anonymous name-to-email lookup:** `resolve_login_email` queried active Partner profiles and returned their email addresses without authentication. An actual anonymous DEV REST call reproduced this using only a newly created synthetic Partner name. No genuine person's name was queried. The unified login already uses email/password directly and has no caller of the old resolver. All runtime EXECUTE grants on the obsolete resolver are now revoked; its unused frontend wrapper was removed. The stored function is retained for evidence, callable only by its database owner.
2. **Public event-employer directory:** The old function included pending and inactive employers and counted inactive offered vacancies. Actual anonymous synthetic DEV results included all three test companies before correction. It now returns only active, approved companies associated with a non-cancelled event and counts active offered vacancies. Public event and platform vacancy browsing retain their existing projection and authorization behavior.
3. **Walk-in registration was broken:** The deployed function accepted return dates as text but inserted them into date columns without casts. The original definition failed in the actual-schema fixture with SQL 42804, including otherwise valid registration. DEV independently confirmed those column types and PostgreSQL 17 date-validation support. Return dates now require valid ISO calendar dates, are explicitly cast, and survive save/reload.
4. **Agreement input was ignored:** The old function unconditionally wrote true instead of using its `p_data_subject_rights_agreed` argument. It now requires true before creating any records and stores the supplied agreement. This was a confirmed source-level defect; because the earlier date mismatch blocked registration, this report does not claim a genuine false agreement had been stored. The change enforces the existing form acknowledgment; it does not establish legal consent or an approved privacy/retention policy.
5. **Registration/check-in integrity:** Walk-ins require an open event. Both registration functions validate up to 100 distinct active offered vacancies belonging to the chosen event and an active, approved employer. Null, duplicate, foreign-event and excessive selections are rejected before creating records. Check-in requires an upcoming or ongoing event. Existing signed roles and supervisor event jurisdiction are preserved.
6. **Optional walk-in email:** The form permits no contact email, but the existing profile column is NOT NULL. Walk-ins now represent that missing optional contact as an empty string, without inventing an email address or Auth identity. No schema nullability, genuine record or Google account was changed.

## Targeted grants and retained public interfaces

Nine existing function ACLs were tightened. No table grant or RLS policy changed. Five trigger/event-trigger functions no longer have direct EXECUTE grants for PUBLIC, anon, authenticated or service_role. Existing trigger bindings continue to execute correctly. Four legacy trigger search paths put pg_catalog first and pg_temp last; the dormant twice-per-day profile-limit trigger was not reattached.

Three signed operational writers retain their existing authenticated/backend EXECUTE grants and actor guards while losing PUBLIC/anon grants. All runtime grants on the obsolete email resolver were removed. The public directory retains its ACL and gets the necessary row filters.

| Function(s) | Final purpose and decision |
|---|---|
| resolve_login_email | Obsolete private account directory; owner-only execution |
| create_pending_accreditation; seed_accreditation_requirements; record_vacancy_history; enforce_jobseeker_profile_daily_limit; rls_auto_enable | Existing trigger/event-trigger execution retained; direct runtime execution revoked |
| check_in_registrant; staff_register_participant; create_walkin_registrant | Existing signed operational roles; anonymous execution revoked; integrity checks added |
| get_event_participating_employers | Public approved/active business projection with corrected filters |
| get_platform_vacancy; list_platform_vacancies; list_event_vacancies | Existing public vacancy projections, unchanged |
| employer_signup_allowed | Existing pre-signup coarse capacity boolean, unchanged |
| quest_enforce_partner_mfa | Existing mandatory PostgREST pre-request guard, unchanged |
| supervisor_can_view_event; supervisor_municipalities | Existing scope helpers, unchanged; scope is not standalone identity authorization |

Actual role configuration is `pgrst.db_pre_request=public.quest_enforce_partner_mfa`. Revoking its anonymous EXECUTE would break public API requests, so it was explicitly retained. Anonymous job browsing was verified through the actual configured guard after migration.

The remaining eight anonymous-definer warnings represent the intentionally retained public readers, capacity/guard and scope helpers above. A warning count is not a vulnerability count or a security certification. Review of the remaining 65 authenticated-definer warnings continues under the full mission.

## Database migration and independent preservation

Migration: `supabase/migrations/20261016001934_rpc_public_surface_hardening.sql`.
Exact applied SQL SHA256: `b15a3e1d43e45e593a7b57f3be20bf5ca1acc48185b2aab84ef255fdf0c9d05b`.

The migration was scaffolded through the CLI. The filename was aligned with the actual DEV ledger version only after exact SQL hashes matched. No table, row, new RPC, event-trigger binding or broad schema grant was added or removed.

Before/after evidence covers all 159 existing public/app functions. Exactly ten changed in the intended way: nine ACL changes and eight body/search-path changes, with overlap. Every other function definition hash and ACL is unchanged. The policy fingerprint and table-grant fingerprint also match exactly. See `dev-before-migration.json`, `dev-applied.json`, `dev-final-verification.json` and `function-change-verification.json`.

## Files changed

- New local migration above.
- `src/services/adminService.js`: remove the unused resolver export and misleading auth-flow comment.
- `tests/unit/rpc-surface-security.test.js`: old-definition reproductions and new authorization, integrity, date and trigger regression tests.
- `tests/integration/dev-rpc-surface-security.js`: real anonymous baseline and signed staff/MFA verification with exact synthetic cleanup.
- This report and `artifacts/rpc-surface-security-20261016/`.

No dependency, approved Edge Function, Auth configuration, hosting setting, retention schedule or disposal executor changed.

## Tests executed and actual results

| Scope | Result |
|---|---|
| Full local unit suite | **479 passed**, zero failed/skipped |
| Focused new SQL fixture cases | **12 passed** |
| Full Chromium browser regressions | **111 passed** |
| Actual anonymous DEV baseline | **2 groups / 41 HTTPS requests**, defects reproduced using only synthetic records |
| Actual signed/anonymous DEV verification | **6 groups / 68 HTTPS requests**, passed |
| Application/focused lint and build | Passed; existing lint and bundle-size/dynamic-import warnings remain |

The local SQL fixture reproduces the email disclosure, public pending/inactive company publication and original text/date failure. It verifies owner-only trigger/resolver grants, publication filters, explicit agreement, valid and invalid calendar dates, optional email, foreign/duplicate/excessive selections, closed events, staff MFA, supervisor event scope, accreditation/history trigger execution and RLS event-trigger operation.

The fixture initially loaded a browsing dependency in the wrong order and omitted form boolean/array defaults; those setup defects were corrected. The real date-type failure was retained and repaired in production-equivalent SQL rather than hidden by changing the fixture column type.

Actual verification used a real synthetic staff password login and TOTP AAL2. AAL1 staff was denied. Signed staff successfully created a walk-in, saved and reloaded both date fields and the agreement, registered that participant for another open event and checked it in. False agreement, invalid date, foreign-event offering, cancelled-event operations and anonymous writes were rejected. Existing accreditation requirement seeding, vacancy history and anonymous event vacancy browsing worked after privilege changes.

No genuine account, personal record, Google identity, AI provider or Production target was used. The native harness validates exact DEV HTTPS origin on each request, actual staff JWT issuer/sub/session ID for actor REST calls, and fixture identity metadata before cleanup.

## Cleanup and privacy evidence

Independent final DEV queries found zero remnants of the new Auth account, profile, participants, jobseeker profiles, events, employers, vacancies, event participations, employer attendance, offers, vacancy history, accreditation, app audit rows and embedding-source revisions.

All baseline counts were restored: Auth users/profiles 20/20; participants 38; jobseeker profiles 33; employers 21; events 35; vacancies 20; participant event registrations 40; employer attendance 1; event offers 16; selected offers 9; app audit logs 789. Cleanup targeted only newly recorded UUIDs and test-run identity/name/email, never genuine records.

Supabase-operated Auth/security telemetry or recoverable backups were not deleted and may retain synthetic test events. This is scoped application-fixture cleanup, not automatic records disposition. All proposed retention policies remain inactive.

## Security advisor observations and outstanding work

Anonymous-definer warnings decreased from **17 to 8**, authenticated-definer warnings from **71 to 65**. The eight internal RLS-with-no-policy informational findings and existing leaked-password protection warning remain. No policies were added to internal tables just to silence those notices.

Relevant guidance: [anonymous definer remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [internal-table RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Official function/privilege guidance consulted: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html).

Outstanding mission work includes the remaining authenticated-definer guard review, real Google owner/linking acceptance, keyword source binding and evaluation replay, human-reviewed ranking validation, remaining catalog integration and provider privacy/configuration evidence. These results do not establish platform-wide security or production readiness.

**Next recommended action:** Continue source-bound matching evaluation and the remaining role-guard audit, preserving these registration regressions.
**Git commits/pushes:** None.
**Deployment:** None.
**Production modified:** No.
**Genuine personal records deleted:** No.
**Wider mission:** Active.

