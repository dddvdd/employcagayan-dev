# DEV AI Review Workflow Milestone
Date: October 14, 2026. Status: verified milestone progress; overall development goal remains active.

## Environment

Work continued in the user-authorized EMPLOYCagayan folder. Supabase management operations independently verified https://cdmkzzmaswwiryymtycn.supabase.co before each call; SQL checks identified the authenticated postgres connection. The live harness checked every outbound origin and required actual signed DEV user sessions for ordinary acceptance. Service credentials prepared and cleaned synthetic fixtures and refreshed explicitly synthetic mock vector fixtures. Production, commits, pushes and deployments were not used.

## Confirmed defects and repairs

1. An unresolved suggestion with no candidate matches offered an empty selector and no dictionary search. The browser regression reproduced this dead end. ReviewModal now searches the existing active dictionaries through signed-user reads, presents named targets, retains an explicit selection, debounces requests and ignores late results. Search does not save a qualification. Save & Accept calls the existing guarded edit RPC. Dictionary failures are visible and retryable.
2. Unknown-intent, explicitly extracted past employment created occupation/industry preferences. PostgreSQL treats \\b as a backspace; its word boundary is \\y. The isolated failure and signed DEV baseline reproduced the effect. The migration changes only four boundaries in the two existing historical regexes. It preserves the function body, signature, lock, MFA/role/scope checks and grants. See [PostgreSQL regex documentation](https://www.postgresql.org/docs/current/functions-matching.html).
3. Rejected review actions previously propagated the parent's rethrown error from an async button handler. The modal now shows the failure, stays open and leaves the pending item intact. Browser regression verifies no unhandled error or false success.

The UI preference notice now follows the existing server predicate: explicit preference intent, or unknown intent with explicit non-null nonhistorical evidence. Explicit preference still overrides historical text under the existing business policy. Unknown inferred evidence does not create a preference. Accepting AI information does not verify qualifications. Canonical skill acceptance remains llm_inferred/unverified.

## Local files and migration

- src/components/aiReview/ReviewModal.jsx
- src/domain/aiReviewIntent.js
- src/services/referenceService.js
- tests/browser/intelligence-review.spec.js
- tests/unit/ai-review-workflow-db.test.js
- tests/support/review-database.js
- tests/integration/dev-ai-review.js
- supabase/migrations/20261014010705_ai_review_historical_intent.sql

DEV ledger statements match the complete local SQL after trimming outer whitespace. The local file SHA-256 is 8ac8980ac47bcd097377d23e09e3c3e6ceee7edc2c18cf4e47733b7d697dc6c8. Independent comparison confirmed the function differs from the preceding DEV definition only in the four regex boundaries. Anonymous execute remains denied, authenticated execute remains guarded, and authenticated app-schema usage remains denied.

The new isolated review fixture loads the two genuine baseline unique preference indexes omitted by the older minimal fixture. No production database index/schema correction was needed. DEV already had both indexes.

## Verification

| Check | Result |
| --- | --- |
| Initial desired database/browser regressions | Failed before repair, as expected. Logs preserved. |
| Historical intent policy matrix | Both occupation and industry: 22 historical phrases plus historical/explicit preference/unknown/inferred/null/substring cases pass. Historical acceptance preserves the source revision and current test vector. |
| Final unit suite | 235 passed; no failures, skips or TODOs. |
| Final browser suite | 59 passed. Five AI review cases cover explicit acceptance, unresolved search, dictionary denial/retry, denied confirmation and queue permission errors. |
| Lint/build | Pass; 15 existing warnings and existing build advisories remain. |
| Signed DEV baseline | 2 groups, 163 requests, 9 synthetic accounts, complete cleanup. Past occupation/industry created preferences and advanced revisions before the fix. |
| Signed DEV final acceptance | 11 groups, 232 requests, 9 synthetic accounts, complete cleanup. |
| Independent final cleanup | Zero review accounts/dictionaries, embedding rows or revision controls remain. |
| Original catalog preservation | Existing occupations, skills, aliases, occupation-skill relationships and taxonomy mappings with joined source/version fields exactly match the earlier normalized snapshot. |
| Browser asset check | Fixture service credential and protected Production identifiers/URL absent from rebuilt JavaScript. |

Signed acceptance verifies AAL1 denial; actual TOTP AAL2 review; historical no-write; explicit preference writes with AI provenance; duplicate no-op; municipal jurisdiction; owned approved active employer scope; foreign reviewer confidentiality; provincial/PESO oversight; worker-only denial; minimal private audit; anonymous rejection; and revoked signed-session rejection.

The first combined live verification failed because this new preference test deliberately made the candidate vector stale before an older search assertion expected it to be current. The failure and cleanup evidence are preserved in live-verify-fixture-stale-failure.json. The corrected harness first proves stale-vector exclusion, refreshes only its synthetic mock fixture with the current revision, then proves scoped retrieval. No authorization, freshness predicate or product code was weakened.

Evidence: artifacts/ai-review-workflow-20261014/.

## PSA API source selected by the user

The user replaced the pending local-file choice with the official [PSA PSOC API](https://psa.gov.ph/classifications-api/psoc). Its documentation requires a token for https://classification.psa.gov.ph/psoc/2012/{group}. The [access guide](https://psa.gov.ph/classifications-api/access-guide) describes requesting a token and receiving it by email; the [official request page](https://psa.gov.ph/classifications-api/request-access-form) provides the form. No request form was submitted or email sent.

Prepared local tooling:
- scripts/fetch-psoc-reference.mjs
- scripts/lib/psoc-reference.mjs
- .env.psa.example
- tests/unit/psoc-reference.test.js

Configure PSA_PSOC_API_TOKEN privately in the environment or ignored .env.psa.local, then run node scripts/fetch-psoc-reference.mjs. The token stays outside VITE variables and browser code. Requests use the documented HTTPS host, refuse redirects and withhold credential-bearing error URLs. Credential echoes are rejected. The tool requests each documented group with page_size=1000, validates all documented counts (10/43/130/456), version, unique string codes and parent hierarchy, and archives raw public records with source hashes. It rejects unknown response shapes or count discrepancies for inspection rather than treating a partial response as a full import. API-specific arrays follow the published PSOC example; live response compatibility remains unverified.

Three focused tooling tests pass for leading zeroes, completeness/version/shape rejection, credential redaction and redirect refusal. An authorized token location remains pending. No actual catalog download or database import occurred. PSOC codes, occupational mappings, source receipts and reviewed coverage remain incomplete.

## Limits and remaining goal work

Real signed Google owner onboarding/linking/profile/resume/application/semantic acceptance still needs the dedicated DEV callback correction for pesocagayanjobfair@gmail.com. Browser interception and isolated database Google identities are test models, not real Google acceptance. No live Google claims were fabricated.

The complete producer-to-resolution-to-durable-review workflow and actual provider-backed embedding adapter remain unverified. This milestone repairs the existing queue, not the absent end-to-end extraction orchestration. Paid AI/provider configuration, reviewed relevance/eligibility datasets, knowledge enrichment, operational/reporting/export workflows and privacy/retention review remain within the full goal. No new retention policy was invented. Earlier disclosed credential rotation remains unverified.

Advisors are unchanged: three informational RLS tables without policies, 18 anonymous public-definer notices, 59 authenticated public-definer notices and disabled leaked-password protection. Existing functions need individual authorization review; a definer notice alone does not prove a bypass. See [anonymous definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Next: retrieve and validate the official API catalog once its authorized token location is supplied, then continue canonical provenance/mapping and extraction orchestration work alongside remaining operational security checks.


## October 14 extraction boundary follow-up

DEV_EXTRACTION_SECURITY_MILESTONE.md records the missing DEV quota repair and prepared strict provider/handler replacement. Migration 20261014012658_guarded_extraction_quota.sql is applied only to verified DEV. The deployed function remains v7 and still lacks the PESO-only role/quota check; a signed approved-employer empty-text probe confirms the role gap without provider spend. Local tests pass (254 unit/59 browser); signed quota checks pass with complete cleanup. Publication requires an explicit DEV-only exception to the mission's no-deployment instruction. End-to-end extraction persistence, real provider acceptance and the full development goal remain incomplete.
