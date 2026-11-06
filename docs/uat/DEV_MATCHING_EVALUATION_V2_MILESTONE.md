# EMPLOYCagayan — Current-model offline evaluation milestone

Milestone: extend the reviewed evaluation workflow to the application's keyword/source-bound matching model.
Prepared: 2026-10-16.
Environment verified: actual local EMPLOYCagayan workspace; isolated in-memory SQL fixtures only.
Status: local implementation and synthetic verification passed. The full development mission and genuine relevance assessment remain incomplete.

## Problem and implemented behavior

The existing evaluator replayed deterministic, base-hybrid and reviewed-skill models. After keyword and source-consistency work, those reports no longer covered the model used by recommendations. Version-1 datasets remain supported and are now explicitly marked legacy_models_only.

The new matching-evaluation-v2 contract and matching-evaluator-v2 replay cover five variants: deterministic, hybrid_base, hybrid_reviewed, hybrid_keywords and hybrid_source_bound. Only hybrid_source_bound represents the current application path. The evaluator invokes the actual matchingSignalService transport/parser and matchingSignals scorer with recorded responses, current weights and the original deterministic eligibility gate. No runtime ranking algorithm or frontend service was changed.

Version 2 rejects standalone semantic fields; semantic evidence is captured within the bound response. Recorded metadata includes loaded opaque source fingerprints, requested embedding versions, optional event alias, source-capture kind/reference, transport outcome and an allowlisted response. Local aliases replace captured private entity identifiers. Unknown nested fields, raw vectors, personal IDs, source documents and transport credentials are rejected. Reports omit captured source words, personal source hashes and provenance-reference aliases; canonical graph snapshot hashes and aggregate model metadata remain part of the existing report.

Input fingerprints bind review labels to all capture metadata as well as the qualification input. Query-side source metadata, requested versions and graph snapshots must be consistent across a query. Existing privacy-attestation, split-leakage, item/query consistency, incomplete-review and overwrite rules are preserved.

All non-ineligible cases, including pending-review cases, participate in the actual 100-pair adapter chunking and shared graph-consumer limits. A source_changed or authorization_denied capture discards earlier frames and withholds ranking metrics for the whole query. No fresh retry response is invented. A temporary outage applies structured-only current scoring to its affected chunk; independently successful chunks retain their evidence. Ineligible cases do not request extra signals. Eligibility confusion remains an offline diagnostic independently of whether a ranking was served.

Reports include current model coverage, keyword/source-binding slices, capture-kind counts, per-query signal status/request sizes and actual engine/adapter/evaluator source hashes. Attested reviewed input with a denied/changed comparison is marked comparison_replay_blocked, not a completed reviewed-sample assessment. Synthetic inputs always remain synthetic_regression_only, and deployment_authorized remains false.

## Synthetic data and SQL evidence

Two examples were added without collecting genuine personal records:

- synthetic-source-bound.json: eight code-authored protocol controls in both directions. These include semantic availability, exact/transferable/missing skills, conditional review and confirmed ineligibility. Their signals are explicitly synthetic_control.
- synthetic-source-bound-sql.json: two actual captures from an isolated local SQL fixture using the existing migration SQL and protected readers. A verified synthetic Quantum Welding skill produces actual PostgreSQL simple full-text overlap of 100 for one vacancy and zero for the other. Through the actual application parser/scorer, the overlap contributes five points and changes the top item; the zero-overlap case contributes none. Labels are code-authored expectations, not human relevance judgments.

The SQL capture helper closes its in-memory database in finally. No hosted account, Storage object, genuine record, provider request or DEV cleanup operation is involved. The local vector type is opaque text; this fixture does not simulate vector math or establish native positive-vector behavior. The capture's sql_sha256 identifies the source-binding migration, not a signed certificate of the entire database or capture.

The deidentified projection does not contain the full original DTO, so opaque server source hashes are not recomputed from that projection. Source metadata, capture origin and privacy references remain unauthenticated local attestations. A file editor can forge them. Local alias tie-breaks can also differ from the original private UUID ordering.

## Files changed

- scripts/lib/matching-evaluation-signals.mjs — bounded capture validation, deterministic alias mapping and actual bound-adapter replay.
- scripts/lib/matching-evaluation-schema.mjs — support versions 1 and 2; capture/review and query-context binding.
- scripts/lib/matching-evaluation.mjs — five-model replay, blocked-query handling, metadata, source hashes and diagnostics.
- evaluation/matching/README.md — version-2 schema, capture/privacy protocol, commands and interpretation limits.
- evaluation/matching/validation-template.json — select version 2; still deliberately lacks privacy approval and cases.
- evaluation/matching/synthetic-source-bound.json and synthetic-source-bound-sql.json — fictional examples described above.
- tests/unit/matching-evaluation-signals.test.js — 11 new analytical, SQL, privacy, failure and consumer-bound regressions.
- tests/support/source-bound-evaluation-controls.js and source-bound-evaluation-fixture.js — reproducible synthetic control creation and local SQL capture helper.
- This report, forward references in prior matching reports, and artifacts/matching-evaluation-v2-20261016/.

Database migrations: none.
Hosted Supabase operations: none.
Frontend/runtime or approved Edge changes: none.
New dependencies: none.

## Tests executed and actual results

| Scope | Result |
|---|---|
| Existing plus new focused evaluation tests | 27 passed, zero failed/skipped |
| Full local unit suite | 507 passed, zero failed/skipped |
| Focused lint for changed evaluator/support/tests | Exit 0, zero warnings |
| Command-line implementation acceptance | Passed; details below |

The focused tests verify real five-model replay in both directions, actual SQL keyword contributions and ranking change, unchanged eligibility, no enhancement requests for ineligible rows, whole-query source-change/denial withholding, outage fallback, legacy source metadata, identity/event/hash/knowledge substitution, semantic ABI mismatch, stale review hashes, inconsistent query captures, personal-field/vector rejection, current-versus-legacy coverage, deterministic reports and zero network calls.

A 102-case query includes pending cases across actual 100/2 chunks. A changed source in the second chunk invalidates the earlier bound result and prevents its current-model ranking metric. A separate privacy-attestation test proves that approved local labels cannot turn a denied capture into a completed relevance assessment.

CLI acceptance prepared eight pending/blinded cases, evaluated the eight synthetic controls over two complete queries, evaluated the pending file with zero approved cases and no current-model ranking metrics, and evaluated the two actual SQL captures. It rejected the incomplete privacy template without output and refused to overwrite an existing report. Console output contains aggregate statuses or fixed error codes.

The new acceptance harness calls the same runMatchingEvaluation function used by the command-line entry point. It is not a fresh hosted UI acceptance test. Build and browser tests were not repeated because frontend/runtime source was unchanged; the preceding source-binding milestone's 115 browser checks and build remain historical evidence.

Evidence: unit-focused.txt, unit-full.txt, lint.txt, cli-acceptance.json, cli-output.txt, pending-v2.json, pending-v2-report.json, synthetic-v2-report.json, synthetic-sql-report.json and verification.json in the evidence directory.

## Security observations and outstanding defects

No credentials, genuine profile/application/resume data, external AI calls, Production access, RLS/grant changes, Git commits/pushes or deployment occurred. Retention proposals remain inactive and live disposal remains disabled. Evaluation files containing genuine employment facts must await approved selection, access, location and retention controls; the allowlist does not prove anonymity.

Synthetic success and toy metric values do not establish representative relevance, population fairness, database retrieval recall, calibrated hiring probability or release readiness. Local labels/capture claims and privacy aliases are not authenticated authority.

Remaining full-mission checks include real Google owner sign-in/onboarding, a genuinely approved reviewed relevance dataset and thresholds, positive native embedding/provider transport where approved, provider-privacy settings, remaining authenticated-definer review and records/privacy governance decisions. This milestone does not close those gaps.

Next action: continue the remaining security/workflow completion audit while the authorized owners resolve external Google, privacy and human-review prerequisites. Do not tune ranking weights against these synthetic labels.

Git commits/pushes: None.
Production modified: No.
