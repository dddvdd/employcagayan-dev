# DEV report export security milestone

Date: 2026-10-15. Environment: local DEV only. No database mutation, migration, deployment, Git publication or Production operation.

## Changes

Eleven CSV export sites use `src/lib/csvExport.js`, which enables Papa Parse formula escaping with a regex covering leading whitespace/control/format characters, ASCII operators and fullwidth variants. Text receives an apostrophe marker; ordinary CSV quoting, multiline values and typed numbers are preserved. `VacanciesManagement` retains its Papa.parse import and original three-row template.

`AdminReports.jsx` also now imports the eventVacancyService it already called; the missing import prevented report loading. No service query or permission changed.

Updated: AdminReports, EmployerManagement, ApplicationTracking, EmploymentOutcomes, FollowUpTracking, InterviewLogsManagement, RegistrantsManagement, VacanciesManagement; SupervisorDashboard, Supervisor ReportsPage; MedicalDashboard. New: shared serializer and focused unit/browser tests.

## Verification

Evidence: `artifacts/csv-export-security-20261015/`.

- Baseline: two intercepted-browser downloads reproduced unescaped arithmetic formula prefixes; no spreadsheet executed them.
- Focused tests: 7 unit tests and 8 browser cases passed.
- Full suites: 398 unit tests and 102 browser tests passed, zero failed/skipped.
- Lint and DEV build passed with existing warnings.
- Seven actual CSV downloads across five JSX sites checked protected cells, multiline notes, original counts, filtered selection and template layout. The other six sites share the helper and were source-audited/build-checked; they were not individually downloaded.
- AAL1 route cases redirected to MFA without export queries. Intercepted synthetic identities are UI evidence, not native authentication/RLS proof.
- The expanded run found the missing service import and an incomplete synthetic event-date fixture; both were corrected before the passing run.
- Bundle scan found DEV ref, no protected Production ref or service-role JWT/sb_secret literal matching its patterns. This is not a general secret audit.
- All seven previously approved Edge source files still match their prepared manifest hashes.

## Security limits and next work

No personal records, provider calls, live fixtures, RLS/grants or schema changed. Native Excel/LibreOffice acceptance was not performed; spreadsheet re-saving can alter escaping. [Papa Parse documentation](https://www.papaparse.com/docs) supports a custom escapeFormulae regex; [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection) describes formula prefixes and re-save limitations.

Report aggregation/event-scope behavior needs separate evaluation. The full development mission remains active. Thirty private synthetic skill graph history rows remain pending scoped cleanup from the earlier milestone; the fresh read-only DEV metadata audit confirmed that count. No cleanup was attempted here. Next: user-requested privacy and retention governance foundation, with all unapproved policy inactive.
