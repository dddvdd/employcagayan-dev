# DEV Interview and Outcome Security Milestone

Date: October 14, 2026. Status: implemented locally and applied to independently verified Supabase DEV; scoped acceptance passed. The full development goal remains incomplete.

## Verified scope

Work remains in the user-authorized EMPLOYCagayan folder. Management operations independently verified DEV cdmkzzmaswwiryymtycn. Native acceptance used actual signed synthetic users and verified TOTP; service credentials prepared and cleaned fixtures. No Production or Vercel operations, Git commits or Git pushes were performed. The separately approved extract-employment publication is recorded in DEV_EXTRACTION_SECURITY_MILESTONE.md.

## Confirmed defects and resulting behavior

Four defects were reproduced before repair in isolated SQL and signed DEV acceptance:

1. record_interview_result accepted an application for another company/position at the same event. It now binds application, canonical participant, event participation, event offering and selected vacancy consistently.
2. Ordinary staff direct inserts could submit contradictory interview event/participation references and fabricated company/position labels. Ordinary inserts and changed references now receive the same checks; labels derive from the selected vacancy.
3. Employment outcome staff policies joined registrants_legacy instead of canonical event_participations. Valid canonical applications now retain the established event/jurisdiction policy without requiring a legacy row.
4. Material outcome updates honored a client-selected verified_by. The database now stamps the actual authenticated reviewer and server time. A no-op preserves existing attribution; returning an outcome to pending clears verification.

The existing signed AAL1 interview denial already passed before repair and remains preserved. This milestone does not claim a newly discovered MFA bypass.

## Database changes

Applied migrations:
- 20261014015649_canonical_interview_outcome_authorization.sql
- 20261014020557_employment_record_cascade_compatibility.sql

The interview routine explicitly requires an active canonical recruitment session and staff/admin role, preserves check-in, active-position, offering and duplicate checks, and denies anonymous/service execution. Existing supervisor interview write restrictions remain intact.

Private fixed-search-path guards validate ordinary interview/outcome writes. app.outcome_application_scope_satisfied exposes only the boolean required by existing policies; authenticated app-schema usage remains denied. Existing admin scope, municipal event jurisdiction, provincial oversight and medical outcome access remain governed by the established policies. No new online-outcome permissions or ordinary table grants were added.

Outcome application/company references must agree. New audit triggers store actor, record ID, operation and interview_status/outcome only; notes, salaries and names are excluded. Existing audit privacy remains enforced.

Historical interviews retain their company/position snapshots when only notes change after the vacancy becomes inactive. Existing records were not bulk rewritten.

## Nullable-reference compatibility and privilege boundary

The first guard implementation incorrectly rejected an existing ON DELETE SET NULL action clearing an inactive historical interview's application link. The desired isolated regression failed and is preserved in cascade-before-repair.txt.

The follow-up migration narrowly permits nested database-trigger clearing of existing nullable foreign keys when all other fields remain unchanged. Ordinary direct reference changes still validate. Removing a verifier profile clears its nullable identity without fabricating a new reviewer or timestamp.

Actual DEV denies authenticated DELETE on applications, including an administrator. The first native cascade attempt confirmed SQLSTATE 42501; that evidence is preserved in live-cascade-authenticated-delete-denial.json. This privilege was not broadened. The final native harness verifies that denial, then performs maintenance only on its synthetic fixture application to observe the existing FK clearing/snapshot behavior. This maintenance result is not evidence that an ordinary user can delete an application. Ordinary guard behavior is independently covered by the isolated regression tests.

## Local interface/service changes

Application projections include canonical participant, event participation and vacancy IDs. The interview screen offers only applications matching the selected event, participation and position; changing company/position clears the prior application choice.

The outcome service accepts seven material update fields, ignores client verification metadata, rejects empty updates and requires a represented single-row result. The admin screen merges that actual server result. A successful HTTP response that represents zero updated rows no longer closes the dialog or claims success.

## Verification

| Check | Result |
| --- | --- |
| Isolated baseline | Four desired defects reproduced; existing MFA denial passed. |
| Focused isolated database suite | 13 passed, including canonical references, historical notes, jurisdiction, reviewer/no-op/pending semantics, private audit, revoked sessions and two nullable-reference cases. |
| Focused browser regressions | Both failed before repair and passed after: foreign-position application choices and false success after a zero-row update. |
| Full local unit suite | 267 passed; no failures/skips/TODOs. |
| Full local browser suite | 61 passed. Intercepted/local flows do not establish real Google acceptance. |
| Lint/build | Passed, with 15 existing lint warnings and existing chunk/dynamic-import advisories. |
| Signed DEV baseline | 5 groups, 136 requests, 9 synthetic accounts, complete cleanup. |
| Signed DEV final | 7 groups, 158 requests, 9 synthetic accounts, complete cleanup. |
| Signed recruitment regression | 10 groups, 177 requests, 9 accounts, complete cleanup. |
| Signed authentication regression | 7 groups, 44 requests, 2 accounts, complete cleanup. |

Evidence is under artifacts/outcome-security-20261014/. Native final checks cover valid linked/unlinked interviews, wrong company/event and duplicate denial, canonical outcome access and attribution, municipal/provincial scope, private status-only audits, existing DELETE denial, fixture FK compatibility and revoked signed sessions.

Final independent catalog checks confirmed both migrations plus the extraction quota migration in the DEV ledger; RLS remains enabled on interview_logs, employment_outcomes and ai_extraction_rate_limit. All four outcome guard/audit triggers are enabled. Private trigger helpers deny anonymous, authenticated and service execution; only the policy boolean retains authenticated execution. Authenticated app-schema usage and application DELETE remain denied. No synthetic outcome/recruitment/auth/extraction accounts or quota rows remained.

## Remaining full-goal work

Real Google ownership/onboarding/resume/application acceptance and Partner identity linking remain unverified pending the dedicated DEV callback correction. Official PSA PSOC API import awaits a privately configured authorized token. This milestone does not establish reviewed employment-intelligence quality, a durable extraction producer, online-outcome workflows, complete reporting/export, privacy notices or retention/deletion processes.

Earlier credential rotation remains unverified. Existing database advisor notices and disabled leaked-password protection require separate review. The full goal remains active; this scoped milestone does not imply completion.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Local migration SHA-256:
- 20261014015649_canonical_interview_outcome_authorization.sql: e1bb5ca7d35fd04e02af682f98f8c4ba32c55994a9c7876eee5ea5e5ca467a6a
- 20261014020557_employment_record_cascade_compatibility.sql: 2a25cc4e3480ac964775f3fb821f74a41e711e304d8cb50f72c2f81d33873de3
