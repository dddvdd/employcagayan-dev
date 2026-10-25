# Local matching evaluation

This workflow measures the current matching engines against supplied, reviewed judgments. It runs locally without Supabase access or provider calls. It does not authorize deployment.

Version 2 covers the current keyword/source-bound model. The original version-1 sections below remain applicable to the qualification and human-review workflow; version-specific replay fields and limits are documented at the end.

The supplied synthetic-regression.json contains eight fictional cases and code-authored expectations. Its approved labels exercise the evaluator; they are not human employment judgments. Reports always label this purpose synthetic_regression_only. Do not describe its scores as real ranking quality.

## Prepare an actual review

Use validation-template.json as an incomplete starting point. It deliberately has no privacy-review reference or real cases and will fail preparation until its required metadata is supplied.

Have the responsible PESO privacy/records officers authorize the selection, local use and retention of the evaluation material. Set purpose to reviewed_validation, origin to authorized_deidentified_capture, a genuine privacy_review_reference alias, a fixed UTC as_of timestamp, and the actual PSOC/platform-skill reference versions. These are local attestations, not authenticated approvals.

Store real evaluation material in an approved, access-controlled location outside the source checkout and unapproved synchronized folders. A feature whitelist does not prove anonymization: qualification details or canonical labels can still identify someone. Do not relabel real cases as synthetic to avoid the privacy review.

Each case needs opaque id, query_id and item_id aliases, a split, direction and input. A jobseeker_to_vacancy query holds one jobseeker fixed while items vary by vacancy; vacancy_to_candidate holds one vacancy fixed while candidates vary. Include the selected authorized pool before filtering by predicted eligibility. Excluding rejected or low-ranked examples in advance would hide errors. Keep selection and human review independent of model rankings.

Use validation for held-out assessment and calibration for development. A query cannot span splits. Exact employment-input pairs cannot cross splits even if semantic values differ. The tool does not prove person-level disjointness or representative sampling; establish those through the review protocol.

The input object accepts jobseeker, vacancy, optional semantic and optional knowledge. It rejects unknown feature fields instead of silently dropping them. Supported employment features cover the current twelve dimensions: occupation and industry preferences; canonical/legacy skills; education; dated work experience; certifications and validity; languages and proficiency; municipality/province preferences; employment type; work arrangement; salary and availability. Structured rows are limited to 100. Personal/contact IDs, names, email, birthday, sex, disability, addresses below municipality, resumes, free profile summaries, employer names, raw vectors and reviewer identities are not part of this contract.

Canonical reference IDs/labels remain employment inputs. Numeric semantic evidence must be captured from the authorized similarity API, including its status, similarity and embedding_version. Knowledge must be a current approved RPC snapshot with its version/hash, repeated consistently across the query. Offline evaluation cannot independently authenticate these captures or their source freshness. Do not construct fake live provenance.

Prepare blinded reviews using a new output filename:

```powershell
npm run evaluate:matching -- prepare selected-inputs.json pending-review.json
```

Preparation resets every label to pending, removes prior reviewer labels and computes an input_sha256 binding. It adds no predictions. Reviewers inspect the employment evidence before seeing engine results.

For each reviewed case, update only review:

- status: approved
- reviewer_alias: an assigned opaque reviewer/adjudicator alias
- reviewed_at: the actual review time, for example 2026-10-15T01:00:00.000Z
- expected_eligibility: eligible, conditionally_eligible or ineligible
- relevance: 0 (not relevant), 1 (weak/uncertain), 2 (relevant for review), 3 (strong alignment)
- reason_codes: one to ten short, non-personal review codes
- input_sha256: preserve the prepared value

Missing/unverified qualifications should be judged as requiring review, rather than a confirmed failure solely because they are absent. A case judged ineligible has relevance zero under its current requirements. Resolve reviewer disagreement through the designated adjudicator before recording the final attested label. Keep any sensitive working notes in the approved review process, not in reason codes.

Changing an input, its aliases/split, reference versions, assessment date, purpose or privacy reference invalidates that review. Re-prepare and obtain a fresh judgment. Hash binding detects accidental changes; an editor who controls the file can forge a local attestation. This workflow does not authenticate reviewer identities.

## Evaluate and interpret

```powershell
npm run evaluate:matching -- evaluate reviewed-dataset.json validation-report.json --k 5 --split validation
```

Outputs must be new files. The CLI refuses overwrite and same-path input/output. File size is limited to 20 MiB, the dataset to 2,000 cases, k to 1–100, and references/labels to a bounded contract. Errors and console output omit source values and filesystem diagnostics.

The report replays deterministic eligibility, deterministic ranking, base hybrid ranking and reviewed-skill hybrid ranking at the fixed assessment time with current default weights. All ranking variants preserve the eligibility gate and existing stable tie-breaks. The actual knowledge-reader adapter enforces one shared query snapshot, target scope and its 100-target/1,000-edge limits, including targets belonging to pending-review cases.

| Measure | Definition |
|---|---|
| Precision at k | Number of grades 2–3 in returned top k, divided by k. Missing slots count as zero. |
| Recall at k | Relevant items returned in top k / relevant items in the supplied judged pool. It is not database-wide retrieval recall. |
| nDCG at k | Gain 2^grade − 1 discounted by log2(position + 1), divided by the ideal ordering's gain. Zero ideal gain gives null. |
| Reciprocal rank at k | 1 / first grade 2–3 position in top k; zero if missed, null if the pool contains no relevant items. |
| False exclusion | Expected eligible/conditionally eligible, predicted ineligible. Rate denominator is all expected-accessible reviewed cases. |
| Unsafe visibility | Expected ineligible, predicted eligible/conditionally eligible. Rate denominator is expected-ineligible reviewed cases. |
| Review shortcut | Expected conditionally eligible, predicted eligible. Reported separately from outright exclusion. |

Eligibility confusion is a complete three-by-three matrix. Missing denominators remain null. Ranking metrics require the entire selected query to be approved; otherwise that query is withheld. Approved cases in partial queries still contribute to eligibility-error measures. Macro metrics average the defined query values and report counts, including zero-gain queries. Both directions are reported separately.

Exclusion slices show counts and rates by missing/verified/unverified/legacy skill evidence, unknown required checks, semantic availability and knowledge availability. These are diagnostic evidence slices, not demographic fairness certification. Profiles with missing evidence must remain inspectable in the wider vacancy-browsing workflow.

Reports contain aliases, numerical outcomes, reason codes, coverage, current model versions/default weights, reference versions, canonical dataset SHA-256 and exact engine/adapter/evaluator source hashes. They omit employment labels, raw input text and reviewer aliases. They can still be sensitive through linkage and must follow the approved evaluation-data controls.

A reviewed_sample_evaluated assessment means only that the supplied selected sample has approved local attestations. It does not establish representativeness, source authority, population fairness, an acceptable error threshold, hiring probability or release readiness. Define thresholds and sampling before evaluating the held-out set; use new held-out cases after tuning.

## Current model replay: dataset version 2

Use `matching-evaluation-v2` for assessment of the current application model. Version 1 remains readable and is explicitly reported as `legacy_models_only`; it cannot establish current keyword/source-bound ranking quality. The supplied review template now selects version 2 and remains deliberately blocked without its privacy authorization reference.

Version 2 retains the same qualification allowlists and review rules. Each input contains `jobseeker`, `vacancy`, optional `knowledge` and required `bound_signals`. Standalone `semantic` input is rejected: numeric semantic evidence belongs inside the captured bound response. See `synthetic-source-bound.json` for eight code-authored protocol controls in both directions and `synthetic-source-bound-sql.json` for two actual local SQL fixture captures. Both remain synthetic.

The bounded `bound_signals` record has these fields:

| Field | Contract |
|---|---|
| provenance | kind: synthetic_sql, synthetic_control or authorized_deidentified_capture; opaque reference alias; sql_sha256 (the source-binding migration SHA256 for synthetic_sql, otherwise null) |
| sources | jobseeker and vacancy, each null for legacy metadata or an object with version and 64-character lowercase hash |
| versions | requested jobseeker and vacancy embedding versions, each at most 200 allowed characters |
| event_alias | null or an opaque local event alias |
| transport | success, unavailable or authorization_denied |
| response | null for a transport failure; otherwise the allowlisted bound endpoint fields, with jobseeker_alias/vacancy_alias/event_alias replacing private entity identifiers |

A successful response records binding_version, bound/source_changed status and strict UTC observed_at (at or before as_of). Bound responses record both source hashes, the optional knowledge snapshot hash, allowlisted keyword metadata and numeric semantic evidence. Changed-source responses contain null keyword/semantic and omit the source/knowledge hashes. No raw vectors, source documents, transport headers, tokens or actual participant/Auth/vacancy IDs are accepted. Existing canonical taxonomy IDs remain allowed qualification references.

Keyword metadata is limited to its status/reason/version/config, bounded score/rank/counts and at most 64 matched terms of 2–64 characters, qualification_credit=false, source version and both source hashes. Terms are derived employment vocabulary, still subject to privacy review; the whitelist alone does not establish anonymity. Numeric semantic input contains only status, similarity and embedding_version. Runtime parsers reject inconsistent proof or score/model metadata rather than accepting it as verified support.

For the query side, the loaded source metadata and requested versions must agree across all cases. Review fingerprints include the entire recorded signal object, including capture provenance, response time, model versions and aliases. Changing any capture invalidates the review. The source hashes are opaque original-capture metadata: they are **not recomputed from the deidentified projection**, and neither a matching hash nor a source-kind label authenticates the original capture. A local editor can forge both. Approved capture authority and the original access boundary must be independently documented outside this file.

Replay derives deterministic local UUIDs from the query/item/event aliases and passes reconstructed responses through the actual `matchingSignalService` and `matchingSignals` scorer. Raw private entity IDs never enter the input contract. Ranking tie-breaks operate on the supplied item aliases, so exact tied ordering can differ from original private UUID ordering. Reports add keyword and source-binding evidence slices, current model versions, capture-kind counts and source hashes for the actual consumer/scoring/evaluation modules.

The five diagnostic variants are deterministic, hybrid_base, hybrid_reviewed, hybrid_keywords and hybrid_source_bound. Only hybrid_source_bound represents the current application path. Historical variants support comparison; their graph/scoring rules can differ. Invalid/missing proof cannot add current-model credit. Eligibility remains the original deterministic gate.

All non-ineligible cases, including pending-review cases, participate in the real 100-pair transport chunking and the shared graph consumer bounds. A captured denial or source change discards earlier returned frames and withholds ranking metrics for the whole query. The report records authorization_denied/source_changed; it invents no fresh retry response. Frontend reload/retry lifecycle is covered separately by browser/DEV acceptance. A temporary unavailable chunk receives structured-only current scoring, exactly as in the actual adapter; other successful chunks retain their valid evidence. Ineligible rows never request extra signals. Eligibility-error summaries remain diagnostics even when ranking is withheld.

For genuinely reviewed inputs, a blocked captured comparison yields comparison_replay_blocked rather than a reviewed-sample assessment. Synthetic material always remains synthetic_regression_only. Labels, capture kinds and privacy references remain unauthenticated local attestations. No score or report grants deployment, records disposition or AI-provider permission.

Example local commands (new output paths only):

```powershell
npm run evaluate:matching -- prepare evaluation/matching/synthetic-source-bound.json pending-v2.json
npm run evaluate:matching -- evaluate evaluation/matching/synthetic-source-bound.json synthetic-v2-report.json --k 3
npm run evaluate:matching -- evaluate evaluation/matching/synthetic-source-bound-sql.json synthetic-sql-report.json --k 1
```

The SQL capture helper in `tests/support/source-bound-evaluation-fixture.js` runs existing migration SQL against an isolated local fixture, calls the real guarded readers and strips personal fixture columns/identifiers. It uses opaque-text vectors without vector math and makes no hosted database/provider requests. It does not prove hosted positive-vector behavior, live graph approval or representative relevance. Synthetic expectations are code-authored. A positive provider/vector transport and an approved representative human review remain separate requirements.
