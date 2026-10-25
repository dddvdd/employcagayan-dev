# DEV Extraction Producer Baseline

Date: October 14, 2026. Status: provider boundary and browser prerequisite verified; the durable producer workflow is not implemented.

## Current evidence and scope

The independently verified DEV catalog is saved in artifacts/extraction-producer-20261014/dev-catalog.json. It records 141 columns across extraction runs, suggestions, jobseeker profiles and vacancy definitions; 10 extraction policies, 4 constraints, current grants and relevant extraction/source-revision routines. No genuine user rows were read for this catalog.

Source inspection shows that the application extraction functions only return validated proposals. No application code creates ai_extraction_runs or inserts ai_extraction_suggestions. The review interface reads existing suggestions and invokes guarded review RPCs. Existing tables, administrative policies and a working provider endpoint do not establish an operational producer.

The existing run table records entity, extraction version, input hash, provider/model, status and token/latency values. It has no captured source text, source snapshot/version, producing actor/session or completion lease. Suggestion run_id has a foreign key; entity IDs themselves are nullable and have no canonical polymorphic FK. Future orchestration must validate those references and provenance explicitly. Existing administrative maintenance privileges are not evidence of a trusted worker path.

The extraction quota and deployed v8 boundary are verified separately in DEV_EXTRACTION_SECURITY_MILESTONE.md: 12 signed-user groups, 175 requests, 7 accounts, complete cleanup, plus one grounded synthetic provider request. Existing review/resolution authorization is recorded in the intelligence, taxonomy and AI review milestones.

## Confirmed browser defect and repair

A real Chromium regression reproduced a module import failure: aiExtractionService imported createHash from Node crypto, which Vite excludes from browser code. This was not detected by the earlier Node-only unit suite because the service was not yet invoked from a product workflow.

The service now uses secure-context Web Crypto SHA-256 with UTF-8 encoding. Its version/entity/extraction-type/text framing and hexadecimal digest remain unchanged. computeInputHash and findExistingExtraction now return promises; the existing unit caller and browser regression await them. Repository search found no other consumers needing conversion.

The browser regression compares Unicode text against Node's independent SHA-256 result, verifies completed-run reuse, rejects failed-run reuse and checks input/type isolation. All Supabase requests in this regression are blocked; it is browser execution evidence, not connected acceptance.

## Verification

- Before repair: one desired Chromium regression failed on the Node-only module import.
- After repair: that same Chromium regression passed.
- Focused extraction service tests: 5 passed.
- Full unit suite: 267 passed, no failures/skips/TODOs.
- Full browser suite: 62 passed.
- Lint/build: passed; existing 15 lint warnings and build chunk/dynamic-import advisories remain.
- No function or database publication was performed for this browser repair. Published DEV v8 server files remain the previously approved package.

Evidence: browser-before-repair.txt, browser-after-repair.txt, unit-focused.txt, unit-final.txt, browser-final.txt, lint.txt and build.txt under artifacts/extraction-producer-20261014/.

## Required durable workflow

The following remain required implementation and acceptance work:

1. A guarded canonical source operation must bind jobseeker_profile IDs to participant identity and vacancy IDs to vacancy_definitions. It must enforce the current active signed session, mandatory PESO MFA and existing municipal/provincial entity authorization before reading source data. Coarse endpoint role checks cannot substitute for entity scope.
2. Source construction must select employment text deliberately, keep historical experience separate from career preferences and omit structured demographics, contact details, program eligibility and document paths. Free-text summaries can still contain sensitive content; an allowlist is not a semantic privacy guarantee.
3. Runs must capture the exact authorized source snapshot/hash and extraction/version information, plus producing actor and controlled lifecycle. The existing embedding revision cannot simply be assumed to cover every proposed source field: its parent trigger watches a selected field list.
4. Source-bound idempotency and bounded retry must avoid duplicate paid requests and duplicate suggestions. Entity authorization must precede cache reuse, and source changes must invalidate old work.
5. Only the trusted server completion path may claim provider/model/provenance and persist validated proposals. A client-submitted JSON object must not be treated as proof that the provider produced it. Completion must recheck session, role, entity access and source freshness.
6. Active dictionary resolution must retain unresolved/ambiguous outcomes. Model-generated canonical IDs and verification authority must remain discarded. Persisted suggestions must remain pending until an authorized human reviews them.
7. Run and suggestions must commit atomically, including the zero-suggestion case. Failed or interrupted work must remain retryable without false completion.
8. The PESO product interface must choose an authorized entity, show the source/processing state, handle errors and let staff reach the resulting review queue. Source exposure, retention and operational audits need explicit treatment.
9. Acceptance must cover legitimate source-to-pending-to-human-review behavior, cross-entity/jurisdiction denial, revoked/inactive/MFA cases, stale source, concurrency, retries, malformed provider output and unchanged canonical data before review.

This document records prerequisites and missing work; it does not claim the end-to-end workflow is complete. The full goal remains active, including official PSOC import, reviewed matching quality, remaining operational/reporting/privacy work and real Google acceptance.

## Source snapshot follow-up

DEV_EXTRACTION_SOURCE_MILESTONE.md records the guarded canonical source operation, typed source fingerprints and text limits. It is applied in verified DEV and passes 9 isolated SQL tests plus 6 signed-user groups/130 requests/8 accounts with complete cleanup. The full unit suite now passes 276 tests. Durable lifecycle, server completion, atomic pending suggestions and the product integration remain outstanding.

## Controlled lifecycle follow-up

DEV_EXTRACTION_LIFECYCLE_MILESTONE.md records source-bound run/lease control, atomic pending proposals and source-fresh review. Verified DEV acceptance passes 8 groups/142 requests/6 accounts with complete cleanup; current local regressions pass 289 unit and 63 browser tests. Worker-plane test payloads are synthetic. Managed provider orchestration and the generation interface still require implementation.
