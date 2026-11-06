# DEV reporting correction prepared for online applications

Prepared 19 October 2026; DEV-only installation and verification 20 October 2026. Production and Git remotes were untouched. The original preparation below remains the before-install record.

## Confirmed problem

The effective DEV `get_employment_intelligence(text[],date,date,text,text,uuid)` function contains an inner join from `applications.event_vacancy_id` to `event_vacancies` in seven measures labelled as all-application or all-hire measures. A formal online application has no event offering, so it is omitted from global `applications_submitted`, `hires_recorded`, three application/interview/hire conversion measures, `applications_without_final_outcome`, and `application_outcome_coverage`. This is a source-level defect with an isolated reproduction. At the read-only DEV snapshot, all nine existing applications had an event offering; there were zero online-only applications. Thus no current numerical discrepancy was observed in hosted data, and no genuine row was read.

## Local correction

`supabase/migrations/20261019020000_include_online_applications_in_intelligence.sql` recreates the read-only invoker function with a left event-offering join only in those seven global measures. The `p_event_id` predicate still excludes online cases when an event is selected. The event-specific `event_application_count` and `event_hire_count` retain their inner event joins. The metric IDs, version, date bases, active-admin gate, grants, other source branches, and no-sensitive-cells policy remain as in the existing function. A text comparison against its source migration proved that the only differences are the seven joins and explanatory comments. The installed DEV migration writes no case rows and changes no table, RLS or Storage schema.

`tests/unit/intelligence-online-applications.test.js` constructs three isolated formal applications: one online confirmed hire with an interview, one online pending case, and one event case. It first executes the original function and observes only the event application in the global count. It then executes the correction and verifies global count 3, event count 1, online hire count 1, corrected conversion numerators/denominators, unresolved-case count 2, outcome coverage denominator 3, and event-scoped count 1/0 for the respective event. It also creates one classified fictional online application under the DEV guard migration and verifies the ordinary administrator still sees exactly the three unclassified cases. Direct jobseeker access to the aggregate RPC remains denied. The fixtures use fictional people, employers and vacancies in local PGlite only.

Verification before installation: the live DEV function body matched the audited original migration **exactly**; a source diff showed only the seven inner-to-left event-offering joins, two explanatory header lines and function comment. The focused test passed 1/1 with the synthetic application extension; related reporting/authorization/synthetic-stack checks passed 20/20. Some audit tests intentionally reproduce historical vulnerabilities in their baseline phase; their passing result is not a claim that those old states are acceptable. DEV had zero online-only applications before installation, so the change did not rewrite a preexisting numerical result. After independent DEV URL verification, the migration was installed once; the installed function body matches the corrected local body exactly, the migration ledger has one entry, anonymous EXECUTE remains denied, and no application row was created or modified. Actual hosted online-case aggregate behavior cannot yet be observed because DEV still has zero online applications. The approved fictional owner test may provide a future classified case, which must remain excluded.

**Milestone:** Online application aggregate correction prepared.  
**Environment verified:** Actual local workspace; exact DEV URL checked before each read-only database operation.  
**What was implemented:** Versioned local function migration and before/after isolated regression.  
**Files changed:** The migration, test, and this report.  
**Database migrations:** One read-only aggregate function correction installed in verified DEV; no case-row write.  
**Tests executed:** Focused isolated SQL regression, related aggregate/authorization/synthetic regressions, exact live-before/local-after function comparisons and post-install grants/ledger checks.  
**Tests passed/failed:** 20 passed, 0 failed; live source and installed correction bodies matched the respective local files.  
**Security observations:** Admin-only invoker/grants retained; no personal row, employer, provider or Production touched.  
**Outstanding verification:** Hosted administrator acceptance with a future authorized online application, broader reporting/export reconciliation and genuine reviewed ranking remain pending.  
**Next recommended action:** After the guarded owner case is submitted and withdrawn, confirm it remains absent from official aggregates and preserved in owner case history.  
**Git commits/pushes:** None.  
**Production modified:** No.
