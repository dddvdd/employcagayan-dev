# EMPLOYCagayan — Local matching evaluation milestone

Milestone: implement the reviewed matching-validation workflow and answer the requested retention recommendation.
Environment verified: actual local EMPLOYCagayan workspace. No Supabase, Production or provider operation was performed in this milestone.
Status: verified local tooling; genuine reviewed matching quality and the full mission remain incomplete.

Follow-up on 2026-10-16: DEV_MATCHING_EVALUATION_V2_MILESTONE.md adds versioned keyword/source-bound replay and new synthetic verification. The original results below remain historical; genuine human relevance and privacy approvals remain pending.

## Implemented

Added a local evaluator for the existing deterministic, base hybrid and reviewed-skill hybrid engines. It uses the fixed dataset assessment time and current default weights, the existing eligibility gate, stable ranking tie-breaks and the real knowledge-consumer adapter with its target/snapshot limits. No runtime matching algorithm or website workflow was changed.

It measures precision/recall/nDCG/reciprocal-rank at k, a three-by-three eligibility confusion matrix, false exclusions, unsafe visibility, review shortcuts and extra review. Separate direction summaries and evidence-status slices expose diagnostic exclusion patterns. Missing denominators remain unavailable. Recall applies to the supplied judged pool, not retrieval coverage of the database.

The preparation step produces blinded pending reviews. A hash binds final labels to the exact employment input, identifiers, split, references, assessment time, purpose and privacy reference. Incomplete query groups are withheld from ranking metrics. Pending cases still contribute to the runtime request bounds, preserving the actual batch fallback behavior. Approved cases can contribute to eligibility-error measures independently of query completion.

The input contract rejects direct/contact identifiers, protected attributes, resumes, free profile text, raw vectors, reviewer IDs and unknown nested fields. Reports omit source labels/text and reviewer aliases. This does not prove deidentification: employment facts, aliases and derived outputs still need approved access/retention controls.

Dataset metadata, labels, source captures and privacy references are local attestations, not authenticated authority. File editors can forge attestations; SHA-256 binding detects accidental changes, not malicious authorship. No report authorizes deployment.

## Files changed

- scripts/evaluate-matching.mjs — safe prepare/evaluate CLI, bounded input, new-file-only output, non-sensitive errors.
- scripts/lib/matching-evaluation-schema.mjs — dataset/privacy contract, review fingerprints and query/item/split consistency.
- scripts/lib/matching-evaluation.mjs — current-engine replay, metrics, slices, source hashes and coverage.
- evaluation/matching/README.md — reviewer protocol, supported data, exact metric definitions, CLI instructions and limitations.
- evaluation/matching/synthetic-regression.json — eight fictional cases in both directions with explicitly code-authored synthetic expectations.
- evaluation/matching/validation-template.json — deliberately incomplete real-validation template; privacy authorization reference is absent and preparation rejects it.
- tests/unit/matching-evaluation.test.js — sixteen meaningful analytical, replay, privacy, leakage, reproducibility and CLI tests.
- package.json — evaluate:matching convenience command; dependencies unchanged.
- DEV_RETENTION_RECOMMENDATION.md — requested source-backed proposal, separate from approved configuration.
- artifacts/matching-evaluation-20261015/ — test/build/lint logs, blinded review example, pending report, verified synthetic report, expected template rejection and final receipt.

Database migrations: none.
Runtime/approved Edge source changes: none.
New dependencies: none.

## Verification

Focused tests: 16 passed, zero failed. They include hand-calculated discounted gain and explicit rate denominators, genuine current-engine replay, missing-evidence visibility, confirmed failure exclusion, privacy-field rejection, stale reviews, incompatible query identities/snapshots, exact employment-input leakage across splits, the 100-target bound including pending cases, zero network calls, deterministic report contents, actual source-byte hashes, overwrite refusal and sensitive-error redaction.

Full unit suite: 391 passed, zero failed.
New tool lint: passed with zero warnings.
Local DEV build: passed with existing dynamic-import/chunk warnings.
Frontend browser suite: not rerun in this milestone because no frontend runtime source changed. The prior milestone's 94 passing browser tests remain historical evidence, not a new test claim.
Native database tests: not run; no database operations or new live fixtures were needed.

Actual command-line acceptance prepared eight pending/blinded cases; evaluated eight synthetic annotations across two complete queries; evaluated the pending file with zero approved cases, zero complete queries and unavailable ranking metrics; and rejected the unapproved real-validation template without producing an output file. Console output contained only aggregate counts/statuses or fixed error codes.

All examples remain explicitly synthetic. No actual jobseeker or employment-case data was collected or labeled. Toy scores and zero toy error counts do not establish representative ranking relevance, source authority, population fairness or calibrated employment probability.

## Requested retention recommendation

The user asked for a recommended retention period. Current NPC, National Archives and PhilJobNet material was researched and cited in DEV_RETENTION_RECOMMENDATION.md. The draft recommends a five-year baseline for core service records, shorter retention for unreferenced CV copies and AI working material, restricted inactive records, and record-series/hold-aware disposal. These are proposed design periods, not a claim that all Cagayan records legally share a five-year schedule.

The current registration notice has general purposes, rights/contact wording and consent, but no concrete configured retention schedule was found in the scoped source audit. Cagayan's DPO/records officer still needs to identify the approved records series, disposal authority, privacy contact and the applicable rules for AI/evaluation material. No privacy notice, retention timer, disposal job, backup policy or provider privacy setting was changed.

## Security observations and outstanding work

This local tooling does not fetch arbitrary data, load service credentials, publish a function, weaken RLS or create an alternate recruitment-data access path. Real-case evaluation requires independently authorized, properly minimized input outside unapproved source/sync locations. Case aliases and numeric reports can still permit linkage.

The official PSA API import still needs an authorized token. In response to the user's question, recommended private storage is C:\Users\User\AppData\Local\EMPLOYCagayan\psa.env containing PSA_PSOC_API_TOKEN. Share only the path, never the token in chat. The existing importer can receive the private file through the verified local Node --env-file capability. No VITE-prefixed credential is requested. The token/path has not yet been supplied or read.

The last verified private synthetic graph-history cleanup remains unresolved from prior milestones; no repeated cleanup attempt or new graph fixtures were introduced here. Actual Google ownership/linking acceptance, full official PSOC import and mappings, genuine human curation, an authorized reviewed validation sample with predefined acceptance thresholds, operational privacy/retention implementation and the full remaining-requirements audit remain outstanding.

Next recommended action: use the privately stored PSA token to retrieve and validate the official catalog once its path is supplied; obtain the approved records-series/privacy contact before implementing disposal; and arrange independent labels for a selected, authorized validation pool. Do not convert synthetic expectations into genuine human review.

Git commits/pushes: none.
Production modified: no.
New deployment/provider call: none.
Full goal: active and incomplete.
