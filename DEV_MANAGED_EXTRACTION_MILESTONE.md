# DEV Managed Extraction and Generation Milestone

Date: October 14, 2026.

**Milestone:** Local managed provider orchestration and PESO generation interface.
**Environment verified:** Local EMPLOYCagayan and independently verified Supabase DEV cdmkzzmaswwiryymtycn.
**Status:** Subsequently published as approved DEV v9, hosted-tested with a synthetic real-provider request, and activated for local development. See DEV_MANAGED_EXTRACTION_PUBLICATION.md; earlier preparation sections below are historical.

## What was implemented

The local extract-employment replacement accepts a managed request containing canonical entity type, ID and confirmed source fingerprint. Real JWT verification and canonical active PESO role checks precede dispatch. Guarded database begin supplies the exact source and charges the existing quota once; the standalone path retains its previous quota behavior.

Completed and processing caches return receipts without another provider call. A new lease must match canonical identity, fingerprint/version, text bounds and sufficient lifetime. The server sends only the captured employment text to its fixed provider. Strict shared validation strips model IDs/verification/review authority and rejects invented excerpts.

Active dictionary resolution follows the existing shared Unicode/punctuation/ambiguity rules. The caller token governs dictionary reads. Dictionaries are paginated in a stable ID order and fail closed above explicit bounds instead of silently truncating. Ambiguous candidate display is bounded while the ambiguous status is retained. Skills use actual canonical/normalized names; occupation aliases use the existing occupation_aliases table. External taxonomy mappings are not assumed to be approved textual aliases.

Trusted completion records pending suggestions and generic failures through the verified lifecycle RPCs. Receipts omit source snapshots, claims and lease tokens. Source/session errors cannot report successful generation. Server worker credentials are used only in the Edge entrypoint and never enter browser code.

The PESO review screen now offers record search, authorized source preview, explicit confirmation, empty/denied-source handling, processing-status checks, source reload and handoff to the selected review queue. Client requests send identity/fingerprint only; server settings remain authoritative. Changing the record clears confirmation. Source/queue selection is bound to the current identity.

VITE_ENABLE_MANAGED_EXTRACTION defaults to false. Source preparation is available, but actual generation remains disabled until the managed backend is published and verified. Browser tests enable the flag only in their intercepted test server.

## Files changed

- supabase/functions/extract-employment/index.ts, handler.ts, managed.js, resolver.js
- supabase/functions/_shared/canonical-resolver.js
- src/domain/canonicalResolver.js (shared re-export)
- src/services/extractionWorkflow.js
- src/components/aiReview/GenerationPanel.jsx and ReviewDashboard.jsx
- tests/unit/managed-extraction.test.js and extraction-workflow.test.js
- tests/browser/extraction-generation.spec.js
- tests/integration/dev-managed-extraction.js
- .env.example, this report and progress links.
- Prepared seven-file function package and evidence under artifacts/extraction-producer-20261014/.

## Database migrations

No new database migration in this milestone. The existing verified source and controlled lifecycle migrations are reused:
20261014060507_canonical_extraction_source_snapshot.sql and 20261014071515_controlled_extraction_runs.sql.

## Tests executed and results

| Check | Result |
| --- | --- |
| Managed orchestration focused unit | 8 passed: canonical source, stripped model authority, private receipts, cache reuse, source/MFA/quota denial, malformed leases, grounded failures, stale completion, handler ordering and active resolution. |
| Browser service focused unit | 4 passed: identity/fingerprint-only requests, confirmed receipts, safe changed-source errors, canonical response identity and quoted search values. |
| Generation browser workflow | 5 passed: source preview/confirmation, review handoff, denied/empty sources, processing checks and record-change invalidation. |
| Full unit regression | 301 passed; no failures/skips/TODOs. |
| Full browser regression | 68 passed. These use intercepted identities/provider responses. |
| Lint/build | Passed with existing warnings/advisories. |
| Native managed orchestration | 3 groups, 50 requests, 3 accounts, complete cleanup. Actual signed begin and caller-bound active dictionaries connect to trusted synthetic completion and signed human acceptance. |
| Native cache/provenance | One synthetic provider invocation, one pending result; repeat reuses the run; canonical qualification appears only after actual signed human review and remains llm_inferred/unverified. |
| Independent cleanup | Zero managed test accounts, work rows, managed runs/suggestions and quota rows. |
| Source/package | Seven local dependency files hashed; JWT verification remains enabled in the manifest; Node parses entrypoint/handler syntax. |
| Browser secrecy | Service fixture credential and protected Production identifiers absent from rebuilt JavaScript. |

Two setup/schema mistakes were corrected from evidence: the first browser attempt used /admin/ai-review instead of the actual /admin/review route; the first native resolver attempted an absent skill_aliases table and failed closed with complete cleanup. The actual DEV schema was inspected and the resolver corrected. No nonexistent table is silently treated as an empty vocabulary.

Native worker/provider output is deliberately synthetic. It proves server-to-database wiring with signed access, not hosted Deno execution or real managed provider acceptance. No genuine personal source or paid provider request was used in this milestone.

## Prepared publication

The seven-file package is at artifacts/extraction-producer-20261014/prepared-managed-function/manifest.json. It targets only cdmkzzmaswwiryymtycn with verify_jwt=true and entrypoint extract-employment/index.ts. Required runtime configuration is named in the manifest without secret values.

Independently retrieved DEV still runs ACTIVE v8, bundle SHA-256 9c0c38467bcec64093b1e842beb1e65ea70a898a9b9d4d22810ab20fff089c3e. That previously approved security replacement does not implement managed orchestration. The current seven-file source differs and is prepared only.

The goal document says “Do not commit, push, or deploy.” The previous publication exception covered the tested security replacement. A new concrete DEV-only publication exception is required before publishing this managed replacement. Hosted compilation, real managed provider execution, role/source/quota gates and browser CORS must be verified afterward before enabling actual generation. No Vercel or Production operation is proposed.

## Security observations and limitations

All canonical qualification writes remain behind human review. Excerpt grounding verifies quotation presence, not semantic relevance or truth. Active target validation is enforced again in the database. Pagination can observe reference changes between requests; a full consistent dictionary revision/quality audit remains required before claiming reproducible enrichment across live vocabulary changes.

Vocabulary processing bounds are 5,000 canonical entries and 10,000 occupation aliases; exceeding them returns failure. No complete official PSOC import or reviewed relevance dataset is claimed. Free-text summaries may contain sensitive content even though structured source fields are selected deliberately.

Existing requirement review still needs editable importance/months where model output requires manual correction. Retention/deletion of captured source/claims, broader operational/privacy work, real Google ownership/linking acceptance and official PSA token/import remain incomplete. Earlier credential rotation remains unverified.

## Next recommended action

Review and resolve the new DEV-only publication exception, then verify hosted managed behavior with scoped synthetic data before enabling the local generation flag. Continue requirement-review completeness and dictionary consistency/quality work while publication remains pending.

**Git commits/pushes:** None.
**Production modified:** No.
**New publication:** None.
**Full goal:** Active and incomplete.

## Requirement review follow-up

DEV_REQUIREMENT_REVIEW_MILESTONE.md records the completed proposed requirement priority/month correction path, 308-unit/70-browser passing regressions and 4-group/73-request signed DEV acceptance with full cleanup. The seven-file managed function package remains byte/hash unchanged; publication approval and actual activation remain pending.

## Dictionary consistency follow-up

DEV_EXTRACTION_DICTIONARY_MILESTONE.md records revision-bound sources/cache, shared-lock begin/completion and changed-during-resolution rejection. Five focused and 313 full unit tests pass; four native DEV groups pass with cleanup. This addresses the live vocabulary-change limitation above. Semantic quality and hosted managed acceptance remain unverified. All seven prepared files are unchanged.

## Approved publication follow-up

DEV_MANAGED_EXTRACTION_PUBLICATION.md records explicit human approval of DEV source processing through OpenRouter, exact seven-file hosted v9 verification, five native hosted groups, five focused browser passes, successful DEV build and local-development activation. No Git, Vercel or Production operation occurred. The earlier publication blocker is resolved.
