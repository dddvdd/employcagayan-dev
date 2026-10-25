# EMPLOYCagayan — Evidence-aware eligibility milestone

October 13, 2026. Goal 5, deterministic eligibility and explainable scoring corrections.

**Milestone:** Implemented and locally verified evidence-aware eligibility. This is progress toward the full development mission, not completion of all intelligence, workflow or security requirements.

**Environment verified:** Existing EMPLOYCagayan workspace, as authorized. Sanitized checks confirm both local and fixture configuration use https://cdmkzzmaswwiryymtycn.supabase.co and the client key is public. This milestone performed zero remote database operations. Isolated database tests use captured DEV definitions; browser tests intercept external traffic. No Production connection or deployment occurred.

**What was implemented:**

Missing mandatory education, skills, experience, credentials or language evidence now produces conditionally_eligible with review reasons instead of automatic exclusion. The five original baseline TODOs are ordinary passing regressions. Preferred/nice-to-have gaps remain nonblocking. Missing importance retains the existing required default in eligibility.

The baseline also reproduced unsafe education substring inference, unfinished-degree acceptance, dependence on the wall clock instead of the supplied date, duplicate counting of overlapping jobs, invalid credential-expiry acceptance, malformed language proficiency treated as a low score, and incomplete/unclassified experience treated as measured evidence. The focused before-repair log records 17 assertions, four passes and 13 failures; these include newly required version/confidence fields rather than 13 distinct security vulnerabilities. A separate before-fix test reproduces unknown proficiency hiding a recorded skill-experience shortfall.

Shared qualificationEvidence.js now distinguishes missing/invalid values from explicit zero, uses exact conservative legacy education labels, respects incomplete education status, and supplies the same interpreted evidence to eligibility and scoring. Explicit unverified/pending qualification metadata requires review for mandatory evidence rather than claiming a confirmed result. Absent verification metadata is treated as recorded evidence, not proof of external verification. Existing canonical provenance guards remain the authority for stored provenance; this pure evaluator does not establish or grant verification.

Experience uses the supplied evaluation snapshot, inclusive UTC calendar months and the union of overlapping recorded intervals. Future months are not credited. Missing dates or required occupation/industry classifications stay uncertain. A legacy total is used only when provided, valid and unscoped; it cannot prove experience in an unspecified required occupation. Calendar-month counting is the documented prototype convention, not a legal service-duration calculation.

Documented below-threshold education/proficiency/experience and recorded expired credentials still produce mandatory failures. A date-only credential remains valid through its expiration calendar day in the evaluation's UTC date convention. Invalid or absent validity evidence requires review when validity is mandatory. Vacancy inactivity and elapsed deadlines remain hard blockers. A known skill-experience shortfall now takes precedence over unknown proficiency.

The matching model keeps the existing 12 dimensions, weights and score formula. A qualification dimension with review evidence receives null raw_score, evaluable=false and zero contribution; the evaluator does not pretend that absence is a measured mismatch. This is conservative at the dimension level: partially known requirements can withhold that entire dimension. Unsupported positive strengths are removed. Confirmed failed dimensions cannot receive a full-match claim just because a matching record exists.

Rules version is eligibility-v2-evidence; matching model version is deterministic-v2-evidence. Eligibility exposes evaluated_at, check-level reasons and recorded required-check coverage counts. Explanations preserve that version/date/confidence information. Coverage counts describe emitted required checks, not independent qualification verification, a statistical hiring probability or ranking quality. No protected personal attributes were added as matching/exclusion criteria.

**Files changed:**

- src/domain/qualificationEvidence.js, eligibility.js, matching.js, matchExplanation.js.
- src/services/matchExplanationService.js: forward the supplied evaluation date through scoring.
- tests/unit/eligibility-evidence.test.js and dev-baseline.test.js.
- tests/browser/eligibility-recommendations.spec.js.
- DEV_ELIGIBILITY_MILESTONE.md, README.md and artifacts/eligibility-milestone-20261013/.

**Database migrations:** None created or applied. No RLS, role, Storage or schema changes. Milestone 3C's existing versioned migration remains intact.

**Tests executed:** Original baseline regressions, before/after focused rule cases, complete Node suite, complete isolated Chromium suite, lint, local build and sanitized rebuilt-client configuration/credential checks.

**Tests passed/failed:**

| Check | Final result |
| --- | --- |
| Complete Node suite | 139 passed; zero failures, skips or TODOs. |
| New focused evidence suite | 21 passed, including the combined-threshold ordering regression. |
| Complete Chromium suite | 47 passed. |
| New recommendation browser cases | Missing mandatory evidence retains all five example vacancies with Needs review; unverified evidence remains visible and a verified recorded shortfall stays excluded. Dialog explains additional evidence is needed; public Quest Board access remains available. |
| Existing profile/qualification/recruitment/MFA regressions | Pass within the full local suite. Existing 3A/3B/3C composed database and intercepted browser checks remain included. |
| Lint | Exit zero, 15 existing warnings. |
| Local build | Passed, main bundle approximately 2.59 MB; existing large-chunk and ineffective-dynamic-import warnings. |
| Rebuilt client | Fixture service credential and protected Production ref/URL absent. |

Test evidence is in artifacts/eligibility-milestone-20261013/. before-repair.txt and before-combined-threshold-fix.txt are preserved historical failures. unit-tests.txt, evidence-tests.txt, browser-tests.txt, lint.txt, build.txt and environment-check.json describe the final state.

The rules tests cover missing vs zero, mandatory/preferred/nice-to-have behavior, unfinished education, unverified records, lower documented thresholds, expiry, invalid fields, fixed evaluation dates, overlapping jobs, scoped/incomplete work evidence, protected-attribute invariance, reason/version/confidence propagation and semantic similarity unable to restore an ineligible recommendation. These synthetic scenarios are reviewed code regressions, not a human-reviewed ranking validation dataset.

**Security observations:** Authorization continues through existing services/RPCs and RLS; these changes do not authorize access, change profile ownership or upgrade stored qualifications. The matching engine remains advisory and does not supply application permissions. Actual application authorization and open-vacancy checks remain server enforced. No service credential satisfies the new browser or domain acceptance tests. Full 3C signed live evidence remains in its prior report; live Auth/Storage checks were not rerun here because no backend contract changed.

**Outstanding defects and unverified requirements:**

Real signed Google onboarding, owner persistence/resume/application acceptance and password Partner identity linking remain unverified while the dedicated DEV Google callback returns redirect_uri_mismatch. The designated account remains pesocagayanjobfair@gmail.com.

The remaining privileged/AI/matching RPC authorization and complete certification/provenance contracts still require audit. Interpretation of verification labels here does not prove those backend contracts are complete. PSOC and platform taxonomy source/version history, transferable relationships, controlled AI proposals and semantic retrieval still need authoritative source validation and full workflow evidence. A human-reviewed dataset, relevance metrics, eligibility-error measures and unintended-exclusion evaluation are still required before deployment claims.

Core employer/PESO event, outcome, reporting/export, privacy/retention and recovery fallback requirements remain part of the full mission. The original 3C withdrawal inconsistency remains disclosed in that report despite stronger repeat checks passing. Existing advisor notices and earlier credential rotation remain unresolved as documented there.

Other compatibility dimensions and configurable scoring weights are preserved, not newly validated for all business cases. The UTC calendar-day/month conventions and conservative withholding of partially uncertain dimensions require review with the intended employment policy and validation dataset before adopting them as a final production methodology.

**Next recommended action:** Audit the remaining matching/AI RPCs against current verified DEV authorization and provenance before extending canonical knowledge or semantic ranking. Resolve the dedicated DEV Google callback and exercise real signed owner workflows. Then validate PSOC/taxonomy provenance, repair evidenced remaining workflow issues and establish the reviewed matching-quality dataset.

**Git commits/pushes:** None.

**Production modified:** No.

## Canonical identity follow-up

DEV_CANONICAL_MATCHING_MILESTONE.md records eligibility-v3-canonical/deterministic-v3-canonical. Conflicting IDs and unresolved mixed ID/text evidence require review; exact IDs survive label renames and no longer lose to an earlier expired homonym. All 328 unit and 71 browser tests pass. This updates earlier v2 references without claiming reviewed employment ranking quality.
