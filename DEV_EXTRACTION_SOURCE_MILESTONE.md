# DEV Extraction Source Snapshot Milestone

Date: October 14, 2026.

**Milestone:** Authorized canonical employment source snapshots.
**Environment verified:** Local EMPLOYCagayan and independently verified Supabase DEV cdmkzzmaswwiryymtycn.
**Status:** Implemented and verified at the database boundary. Durable run processing remains incomplete.

## What was implemented

get_ai_extraction_source(text,uuid) returns a bounded employment-text snapshot for the selected canonical jobseeker participant or vacancy. It requires an active, confirmed signed PESO session with mandatory Partner MFA, then checks existing entity/jurisdiction authorization. Password applicants, approved employers and medical identities cannot use this PESO producer-source operation. Existing review permissions are unchanged.

Jobseeker IDs refer to jobseeker_profiles.participant_id, not the authentication UID. Vacancies refer to vacancy_definitions.id. Missing entities and unsupported/null arguments are denied without returning source data.

The source selector includes nine jobseeker employment fields and four vacancy fields. It separates career preferences from historical occupation/industry and retains unknown intent where appropriate. It excludes structured names, contact details, demographics, accommodation notes, program eligibility and document paths. A free-text summary may itself contain sensitive content; structured omission does not establish semantic redaction or a complete privacy policy.

The source includes a fixed version, kind, typed field/intent segments and SHA-256 fingerprint. Identity, typed segments and display text all participate in the fingerprint, so identical display text with different field/intent boundaries cannot share a source hash. Selected historical changes are captured even where the embedding invalidation trigger does not watch that field. Unrelated name changes do not invalidate the selected employment source.

Sources exceeding 20,000 browser UTF-16 code units fail without truncation. Supplementary Unicode characters count as two units, matching the existing provider input limit. Empty employment sources remain explicit instead of producing fabricated text.

The private snapshot builder is stable/read-only, has a fixed pg_catalog search path and denies ordinary/service execution. Only the guarded authenticated public operation can reach it. It creates no extraction runs, proposals, qualifications or quota consumption.

## Files changed

- supabase/migrations/20261014060507_canonical_extraction_source_snapshot.sql
- tests/support/extraction-source-database.js
- tests/unit/extraction-source-db.test.js
- tests/integration/dev-source-extraction.js
- This report, DEV_EXTRACTION_PRODUCER_BASELINE.md and README.
- Evidence under artifacts/extraction-producer-20261014/.

## Database migration

Applied only to independently verified DEV: 20261014060507_canonical_extraction_source_snapshot.sql.

Actual DEV lacked the source routine before implementation. Isolated tests passed before application. The DEV ledger version was assigned by the management operation; the local file and helper were aligned to that version. Complete ledger statements match the local migration after trimming outer whitespace.

No existing table policies or table grants were broadened. Authenticated private-schema usage remains denied. Anonymous/service public execution and all ordinary private-builder execution remain denied.

## Tests executed and results

| Check | Result |
| --- | --- |
| Focused isolated SQL | 9 passed. Canonical IDs, protected-field omission, MFA/confirmation/activity/session checks, role restrictions, municipal/provincial scope, source fingerprints, field-boundary ambiguity, Unicode bounds, empty/invalid inputs and private grants. |
| Initial focused run | 8 passed / 1 fixture failure: a second synthetic vacancy omitted mandatory company/assignment fields. The fixture was corrected; production constraints were retained. |
| Full unit regression | 276 passed; no failures, skips or TODOs. |
| Native signed DEV source acceptance | 6 groups, 130 requests, 8 accounts, complete cleanup. Source acceptance uses actual signed actors and real TOTP; service credentials only prepare, mutate and clean synthetic fixtures. |
| Independent cleanup/ACL | Zero source test accounts and quota rows; fixed paths/stability verified; private-schema usage remains denied. |
| Previous local browser/build checks | 62 browser tests and lint/build passed in the preceding browser-hashing milestone. This source milestone changes SQL and test files; no new product interface is claimed. |

Native checks cover legitimate staff/admin/provincial snapshots, municipal positive/negative scope, canonical PID rather than UID, structured personal/document omissions, invalid entity/type rejection, changed history versus unchanged private name, oversize supplementary Unicode, empty sources, no generated work, inactive accounts and revoked signed sessions.

No provider request or genuine personal source was submitted in this source milestone. No real signed Google-owner acceptance is inferred from service-prepared fixture profiles.

## Security observations

Advisors report four RLS-enabled tables without policies, 17 anonymous public-definer notices, 61 authenticated public-definer notices and disabled leaked-password protection. The one additional authenticated notice corresponds to the new deliberately exposed, internally guarded source routine. Its actual ACL and role/session/entity checks are verified; notices require individual review.

Remediation references: [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The current Supabase changelog and function documentation were reviewed. The markdown changelog endpoint was unsupported, so the public changelog was used. No library/framework migration was required for this SQL implementation.

## Outstanding defects and next recommended action

The full producer still needs controlled run/lease creation, source-bound idempotency and retry, trusted server completion with fresh session/entity/source checks, active dictionary resolution, atomic pending-suggestion persistence and a product interface connected to human review. A client-provided result must not be treated as proof of provider origin. New managed work must use the server source fingerprint instead of reusing the legacy text-only cache across entities.

The source selector currently uses selected canonical free-text columns; it does not parse resume PDFs or certify employment facts. Run/source retention, reviewed extraction quality, real Google acceptance and official PSOC import remain outstanding.

A check of known local PSA configuration files and the process variable found no configured PSA_PSOC_API_TOKEN. The existing token-location request remains pending. No credentials were printed and no unauthorized API request was attempted. Real Google owner/linking acceptance remains unverified.

The next coherent milestone is the controlled extraction lifecycle and atomic pending-suggestion writer. Any further Edge publication requires authorization appropriate to the concrete prepared change; the existing exception covered the prior DEV security replacement.

**Git commits/pushes:** None.
**Production modified:** No.
**New Edge/Vercel publication in this milestone:** None. Prior approved DEV v8 publication remains separately documented.
**Full goal:** Active and incomplete.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL binary-string/SHA-256 functions](https://www.postgresql.org/docs/current/functions-binarystring.html).

Local migration SHA-256: c332e9f5d768fdc886897eae3d521bc026b03f6f95e2ff34d876432c4286cb8b

## Controlled lifecycle follow-up

DEV_EXTRACTION_LIFECYCLE_MILESTONE.md records source-bound run/lease control, atomic pending proposals and source-fresh review. Verified DEV acceptance passes 8 groups/142 requests/6 accounts with complete cleanup; current local regressions pass 289 unit and 63 browser tests. Worker-plane test payloads are synthetic. Managed provider orchestration and the generation interface still require implementation.
