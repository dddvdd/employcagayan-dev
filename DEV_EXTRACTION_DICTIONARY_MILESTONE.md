# DEV extraction dictionary consistency milestone

Date: 2026-10-14
Full development goal: active and incomplete.

## Environment verified

Actual workspace: EMPLOYCagayan. Every connected management call independently checked the API URL https://cdmkzzmaswwiryymtycn.supabase.co. SQL preflight identified current_user and session_user as postgres. The three existing routine bodies matched the inspected local migrations before replacement. No Production endpoint was contacted.

## Confirmed defects and correction

Three isolated regressions demonstrated that dictionary edits did not change an extraction fingerprint, a worker could finish against changed vocabulary, and completed cache concealed subsequent vocabulary changes.

Migration 20261014083050_extraction_dictionary_consistency.sql adds one private, RLS-enabled singleton revision. Statement triggers on occupations, occupation_aliases, skills, certifications, industries, education_levels and languages advance it for INSERT, UPDATE, DELETE and TRUNCATE.

Canonical source payloads include dictionary_revision in their typed hash. Employment text/field selection and source_version employment-extraction-source-v1 remain unchanged; existing consumers treat source_hash as opaque. Changed vocabulary creates a different managed cache key and makes earlier pending suggestions stale for acceptance/edit.

Begin and complete hold a shared revision-row lock through their short database transactions, before entity/run/work locks. They recheck the fingerprint after locking. Reference writes cannot commit a changed revision during these completion transactions. Provider/network processing holds no database lock. A change between dictionary reads and completion is rejected with 55000 rather than persisting mixed output.

Human review does not acquire this revision lock through the shared entity helper: adding it there could create a lock-order cycle with concurrent dictionary deletion and qualification foreign-key checks. Existing authorization, active canonical validation and source-freshness checks remain in place.

This is conservative global invalidation: even a zero-row or metadata-only statement advances the revision. Reference writes serialize briefly on one row; any dictionary change invalidates extraction cache across both entity types. This trades cache reuse for correctness and needs monitoring if reference maintenance becomes frequent.

## Files and migration

- supabase/migrations/20261014083050_extraction_dictionary_consistency.sql
- tests/support/extraction-dictionary-database.js
- tests/unit/extraction-dictionary-db.test.js
- tests/integration/dev-extraction-dictionary.js
- artifacts/extraction-producer-20261014/dictionary-*.txt and dictionary-*.json
- README.md and milestone follow-up notes

The migration was applied only to verified DEV. Its recorded statements match the local SQL after trim normalization. The CLI-created local scaffold was renamed to the actual DEV ledger timestamp.

## Tests and results

| Check | Result |
| --- | --- |
| Before repair | Three desired isolated regression assertions failed, establishing the defects. |
| Initial repaired fixture | Failed because the older minimal test schema omitted occupation_aliases. Added its inspected DEV column shape to the isolated fixture; no live policy change. |
| Focused repaired SQL | Five passed: fingerprint change, stale completion rejection, cache refresh, all seven statement triggers, private grants. |
| Full unit suite | 313 passed; zero failures, skips or TODOs. |
| Native DEV | Four groups, 50 requests, two actual signed accounts, real Partner TOTP; complete fixture cleanup. |
| Native dictionary processing | A synthetic edit made identical employment text produce a different fingerprint; stale worker output was rejected and left no proposals. |
| Native cache | Unchanged completed work reused its receipt; a later synthetic dictionary edit produced a new run. |
| Native resolver | Changed the owned synthetic skill after an actual caller-authenticated dictionary read. Managed completion returned 409/source_changed, no proposals persisted, and the run recorded source_changed. |
| Security catalog | Seven statement triggers; RLS enabled; no anon/authenticated/service direct table read/write or helper execution. Begin/complete contain revision locks; human entity helper does not. |
| Independent cleanup/event catalog | Zero synthetic accounts, skills and profiles; all seven trigger event masks include INSERT, UPDATE, DELETE and TRUNCATE. |
| Pending function package | All seven local file hashes and archived package file hashes still match the prepared manifest. |

Ordinary source/begin/dictionary reads used actual signed users. Service credentials prepared/inspected/cleaned synthetic records and explicitly exercised the trusted worker completion plane with synthetic output; this is not ordinary-user acceptance or real AI quality evidence. No genuine dictionary entries were modified. Cleanup advances the revision naturally; it never resets or decrements the counter.

No new frontend/provider source changed. The prior requirement milestone's 70-browser, lint and build results remain historical; they were not rerun for this SQL-only correction. A concurrent multi-connection commit schedule was not separately tested; catalog lock placement and changed-during-processing rejection are verified.

## Security observations

Advisors report six RLS-enabled tables without policies, 17 anonymous and 65 authenticated public-definer notices, and disabled leaked-password protection. The new private revision table deliberately has no client policies and no grants. Other notices retain the prior review requirements; the advisory result does not certify that every historical routine is safe.

References: [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html).

## Outstanding and next action

The earlier approved DEV security replacement is published as v8. The separate prepared seven-file managed replacement remains unpublished pending its own human exception; actual generation remains disabled. This migration does not change that package or authorize publication.

Continue reviewed extraction/matching quality validation and operational privacy/retention work. Official PSA API import requires an authorized privately configured token. Real Google onboarding, ownership and identity-linking acceptance and earlier credential rotation remain unverified. Literal excerpt grounding does not establish semantic relevance or factual truth.

Git commits/pushes: none. Vercel/new Edge publication: none. Production modified: no.
