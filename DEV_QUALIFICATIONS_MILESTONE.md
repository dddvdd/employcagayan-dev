# DEV skills, languages and provenance milestone 3B

**Milestone:** Repair qualification catalog loading and verify skill/language persistence with direct-write provenance safeguards. This follows the profile increment documented in DEV_PROFILE_MILESTONE.md. The overall mission is still unfinished.

**Environment verified:** Work continued in the existing EMPLOYCagayan workspace, as requested. Independently checked management project URL immediately before each connected operation: DEV `cdmkzzmaswwiryymtycn`. Guarded live requests also checked their actual origin and signed user session. No Production operations.

**What was implemented:** Four reference-service methods were missing await before unwrap. They returned undefined without executing Supabase queries, so skills/languages appeared empty and occupations/certifications shared the same defect. All four now await their requests.

Skill add/edit/reload preserves joined canonical labels and zero years. Non-integer, negative and out-of-storage-range experience is rejected before a request. Language payloads whitelist editable fields and derive participant ownership; updates cannot forward row IDs, owner fields or arbitrary source claims. Language options now respond to keyboard activation as well as clicks. The skill edit save control has an unambiguous accessible name.

Database guards prevent ordinary direct clients from inserting externally sourced or verified skills, or impersonating external language provenance. Verified administrators retain existing RLS-controlled authority and mandatory MFA. Material owner edits reset previous skill verification to self-reported/unverified; no-op edits preserve it. Language material edits reset provenance. Existing trusted SECURITY DEFINER writers retain their separate authorization contracts. The inspected live skill definer writer is accept_ai_suggestion.

Four skill checks constrain source, verification, proficiency and non-negative experience. Existing values passed the pre-change compatibility inspection. Private audit triggers record provenance/verification transitions and actor/record IDs without personal or qualification text.

**Files changed:**

- src/services/referenceService.js, skillService.js, languageService.js.
- src/pages/Public/SkillSetPage.jsx, LanguagesPage.jsx.
- tests/support/profile-database.js.
- tests/unit/qualification-provenance-db.test.js.
- tests/browser/qualification-persistence.spec.js.
- The migration below, this report, README and artifacts/qualifications-milestone-20261012/.

**Database migrations:** Applied `20261012084343_qualification_provenance_guards.sql` only to verified DEV. Full body matches the independently retrieved DEV ledger exactly. Existing RLS policies and business tables were preserved; no personal records were mass-rewritten. The two provenance guards deliberately use SECURITY INVOKER so current_user distinguishes ordinary requests from trusted definer writes. Changing them to SECURITY DEFINER would invalidate that distinction. The audit function uses a fixed search path and has no client execution grant.

**Tests executed:** Full Node suite, focused database rerun after ledger alignment, complete isolated Playwright suite, guarded live DEV authentication regression, lint, local build, ledger/trigger/ACL/RLS checks and synthetic-account cleanup verification.

**Tests passed/failed:** 95 Node cases: 90 pass, zero ordinary failures, five executed existing matching TODO failures. Seven qualification database cases pass. All 40 browser cases pass, including three new qualification workflows. Live auth regression passes seven groups and 44 guarded requests; two accounts and one company removed. Lint exits zero with 15 existing warnings. Build passes with existing large-chunk/dynamic-import warnings.

The baseline database case reproduces owner verification/source spoofing before the guard. Repaired cases cover add/edit/reload, zero years, invalid values, source/verification spoofing, authorized administrator updates, material-edit invalidation, cross-account denial, password-session denial, trusted definer execution and private audit payloads.

Initial browser tests exposed the missing-await defect. After fixing it, skill/language writes executed and reloaded correctly. The last browser assertion was corrected to match the actual displayed label, Speaking: Fluent, and waits for saved state before reloading.

**Security observations:** Every ordinary public table still has RLS. Private trigger functions have no authenticated execution grant. Ordinary callers cannot upgrade qualification provenance by modifying their own row. The qualification audit payload contains only source and verification_status. Cross-account and password applicant access remain denied in regressions. No service credential satisfies feature acceptance calls.

**Outstanding defects:** Positive real signed Google onboarding and owner qualification requests remain unverified because the configured Google client lacks the DEV Supabase callback. Designated account: pesocagayanjobfair@gmail.com. Browser traffic is intercepted; PGlite identities are isolated fixtures. The trusted-writer fixture validates PostgreSQL execution context, not the complete live AI extraction/review workflow. Broader SECURITY DEFINER/RPC review remains required.

Five matching defects still wrongly exclude missing education, skills, experience, credentials or languages. Resume/application, employer/PESO workflows, jurisdiction/privacy/retention, remaining recovery interfaces and reviewed matching validation remain open. A GitHub token was accidentally exposed by an earlier diagnostic during milestone 3A; it was not copied into these artifacts or used. User revocation/replacement is still required.

**Next recommended action:** Continue resume/application and organizational authorization regression coverage. Resolve the DEV-only Google callback and exercise actual onboarding, owner qualification persistence and identity linking. Then repair unknown-evidence eligibility and complete the intelligence/provenance foundation with a reviewed validation dataset.

**Git commits/pushes:** None.

**Production modified:** No.

## October 14 follow-up

DEV_EMBEDDING_FRESHNESS_MILESTONE.md records a newly evidenced private-schema defect in the invoker qualification guards and its focused correction. Ordinary app-schema usage remains denied; no provenance bypass or private schema grant was introduced. The final unit suite passes 197 tests and the browser suite passes 54. Signed recruitment regression passes 10 groups/177 requests; signed intelligence regression passes 8 groups/197 requests, with all synthetic accounts cleaned. Real Google owner acceptance remains unverified.
