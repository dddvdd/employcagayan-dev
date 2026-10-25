# DEV profile and education milestone 3A

**Milestone:** Profile consent, birthday validation and atomic education persistence. This is a verified increment of Goal 4; the overall mission remains unfinished.

**Environment verified:** Existing EMPLOYCagayan workspace retained following the user's instruction. Management API returned the exact DEV URL for project `cdmkzzmaswwiryymtycn` immediately before every connected operation. Live harness independently checked every outgoing origin and signed user session. No Production access.

**What was implemented:** Profile submission requires an actual JSON boolean consent affirmation, before participant/profile creation. Saved consent hydration no longer manufactures agreement. The existing aggregate writer is private; its public wrapper validates consent and ISO birthday, then calls the existing transaction. Consent audit JSON contains only affirmation, source and contract version.

Birthday input rejects future dates, including later days in the current year; the database rejects dates outside 1900–today in Asia/Manila. Impossible calendar dates fail the database date conversion.

Onboarding uses the existing atomic education trigger instead of calling a nonexistent mirror RPC after saving. Current-study choices now match the database constraint, including precise postgraduate choices. Education mapping uses recognized labels; generic or ambiguous descriptions remain unclassified. Incomplete study is not promoted to graduation because an unrelated graduation year exists. Expected graduation remains separate from completed graduation. Managed attainment/current-study slots deduplicate when equivalent, preserve completed attainment, and retain manually edited rows.

Education create/edit requests exclude the nonexistent source column, derive participant ownership, whitelist editable fields, and return joined reference labels immediately. Badges reflect actual registration management.

The reported daily gate was investigated: DEV has zero profile-limit triggers. Four successive offline saves pass. No counters or legitimate rate controls were removed.

**Files changed:**

- `src/domain/birthdate.js`, `src/domain/educationLevels.js`.
- `src/pages/Public/RegisterPage.jsx`, `src/pages/Public/EducationPage.jsx`.
- `src/services/educationService.js`.
- `tests/unit/dev-baseline.test.js`, `tests/unit/profile-persistence-db.test.js`.
- `tests/support/profile-database.js`, `tests/browser/profile-persistence.spec.js`.
- `tests/integration/dev-auth.js`, this report, README and sanitized evidence under `artifacts/profile-milestone-20261012/`.

**Database migrations:** Applied `20261012081407_explicit_profile_consent_and_education.sql` to verified DEV. Its complete SQL body exactly matches the DEV ledger saved in `verified-dev-ledger.json`. Existing reference codes and personal records were preserved. One explicitly unranked reference entry represents unspecified qualifications. No business tables were duplicated.

**Tests executed:** Full Node suite; focused database suite after ledger alignment; complete isolated Playwright suite; live signed DEV authentication/negative profile checks; lint; local build; ledger/ACL/RLS and fixture-cleanup inspections; private-credential and Production-reference build scan.

**Tests passed/failed:** 88 Node tests: 83 pass, zero ordinary failures, five existing executed matching TODO failures. All ten profile database cases pass. All 37 browser cases pass, including four profile cases. Live DEV authentication passes seven groups across 44 guarded requests. Two synthetic accounts and one company were removed; independent SQL confirms zero remaining auth-test accounts. Lint exits zero with 15 existing warnings. Build passes with existing large-bundle/dynamic-import warnings.

The browser cases intercept external traffic and use fixtures; the database cases run against an isolated PGlite model built from inspected DEV definitions. Neither substitutes for a real signed Google onboarding roundtrip. The live negative profile checks use ordinary signed password sessions and anonymous access, never service credentials to satisfy feature acceptance.

Initial browser failures were corrected test assumptions: the successful onboarding page presents a saved confirmation, and two education records can share a school. Assertions now verify the actual confirmation and the current program/qualification.

**Security observations:** All ordinary public tables retain RLS. Anonymous users cannot execute the profile writer; authenticated and service roles cannot execute the private core. Cross-account education reads/writes and password jobseeker access fail regression checks. The new audit payload contains no names, email, birthday or school. Built assets contain neither the private fixture credential nor the protected Production reference.

A diagnostic environment enumeration accidentally exposed a GitHub token in tool output. The value was not copied into source, reports or artifacts. The user was informed to revoke and replace it; no token was used to commit, push or contact GitHub. Future diagnostics use only explicit non-secret names. Rotation remains a user action.

**Outstanding defects:** Real Google OAuth remains blocked by Google's redirect_uri_mismatch for the exact DEV Supabase callback; designated account is `pesocagayanjobfair@gmail.com`. Google account linking and positive live profile persistence remain unverified. Five matching tests still show missing qualifications treated as confirmed failures; the new unclassified education entry must remain unknown in that later fix. Skills, languages, resumes, applications, employer/PESO workflows, broader RPC/jurisdiction review, consent withdrawal/retention/access procedures and remaining recovery-interface/fallback coverage are still open. Historical migration drift is not resolved by this increment.

**Next recommended action:** Continue skills/language persistence and provenance checks. Once the DEV Google client callback is corrected, verify real onboarding, repeated saves, reload and identity linking with designated test accounts. Address missing-data eligibility before claiming recommendations are fair or complete.

**Git commits/pushes:** None.

**Production modified:** No.
