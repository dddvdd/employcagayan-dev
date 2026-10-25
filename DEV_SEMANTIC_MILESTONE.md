# EMPLOYCagayan — Authorized semantic recommendation milestone

October 13, 2026.

**Milestone:** Implemented and verified the authorized semantic recommendation transport and evidenced scoring/visibility corrections. The full development mission remains active.

**Environment verified:** Existing EMPLOYCagayan workspace and independently verified Supabase DEV cdmkzzmaswwiryymtycn. Every connected operation was preceded by management URL verification; SQL confirmed database/current_user/session_user = postgres. Signed test requests additionally verify their exact DEV HTTPS target and actual Auth-issued ordinary-user sessions. Service credentials only prepare/clean synthetic records.

**Confirmed defects and implementation:**

- Signed DEV showed that an approved employer could read an authorized candidate's structured profile but could not retrieve that candidate's private raw vector. The original client used direct vector reads, so legitimate semantic matching fell back. New get_pair_semantic_similarity/get_semantic_similarities RPCs reuse canonical profile/vacancy authorization, require active Google jobseeker or approved Partner sessions, preserve MFA/jurisdiction, and compute similarity in DEV. Ordinary clients receive numeric similarity, status and version information; raw candidate vectors remain private.
- Actual DEV vectors arrive as strings. The old client treated them as number arrays and produced an available zero score for identical vectors. The reproduced browser displayed 64.6/100 instead of the valid 79.6/100 secondary-signal result. The corrected client consumes numeric RPC results rather than decoding private vectors.
- Zero similarity/score was converted to null by truthiness fallbacks. Nullish handling now preserves numeric zero throughout semantic results.
- Partial deterministic weight overrides omitted default weights from the configured total and could exceed 100. Overrides now merge with the complete documented dimension weights and reject invalid values.
- Malformed available semantic values and invalid hybrid configurations could yield invalid scores. The decoder and hybrid engine now fail safely for nonnumeric/out-of-range semantic values and reject malformed/nondominant hybrid weights. Default structured/semantic weights remain 0.85/0.15.
- Signed DEV and isolated SQL reproduced an event-offering visibility gap: an ordinary employer could retrieve another company's unapproved vacancy through its offering ID. Scalar event lookup now applies the active/approved company and active vacancy filter already used by batch browsing. Existing authorized owner/admin preview behavior remains.

Semantic results use semantic-v2-authorized. Matching remains deterministic-v2-evidence; the hybrid formula remains hybrid-v1. Cosine similarity uses the existing native pgvector operator and compares compatible provider/model/dimension metadata. Different models and undefined zero-magnitude geometry return failed; stale/failed/missing embedding metadata returns explicit fallback states. The client still applies deterministic eligibility first. Similarity cannot restore an ineligible recommendation.

Ranking fetches numeric results in batches of at most 100 pairs instead of two raw-vector reads per eligible pair. Each pair is authorized independently; an unauthorized pair fails the whole request. Response IDs must align with requested IDs. Event context is retained in vacancy payloads and requests. Scalar responses contain no vectors, source text or profile content; batch responses add the caller's canonical pair IDs.

Use deterministicWeights for component configuration and hybridWeights for hybrid configuration. The legacy weights alias remains supported for deterministic dimension overrides. Hybrid weights must be finite, sum to one and keep deterministic weight greater than semantic weight. Scores describe fit, not employment probability.

**Files changed:**

- supabase/migrations/20261013063051_authorized_semantic_pair_similarity.sql.
- src/domain/semanticProtocol.js, matching.js and hybridMatching.js.
- src/services/semanticMatchingService.js.
- tests/unit/semantic-contract.test.js and semantic-authorization-db.test.js.
- tests/browser/semantic-recommendations.spec.js.
- tests/integration/dev-semantic.js.
- DEV_SEMANTIC_MILESTONE.md, README.md and artifacts/semantic-milestone-20261013/.

**Database migrations:** Applied 20261013063051_authorized_semantic_pair_similarity.sql only to verified DEV. Full 11,489-byte body exactly matches the independently retrieved ledger; local filename/test reference was aligned with its timestamp. SHA-256: 6f9d3d952c813c12b15c8dbe04d3eb8768d76a9a668f3e10ca4b6e8b484c36db. No new data tables, raw-vector grants or broad RLS changes.

**Tests executed:** Read-only DEV schema/policy audit; signed pre-fix baseline; pre-fix scoring/browser reproductions; focused owner/Partner/jurisdiction/batch SQL tests; full unit/browser/lint/build checks; signed native pgvector post-migration acceptance; preserved intelligence regression; exact ledger/ACL/RLS/cleanup checks; security advisors and sanitized rebuilt-client inspection.

**Tests passed/failed:**

| Check | Result |
| --- | --- |
| Complete Node suite | 168 passed; zero failures/skips/TODOs. |
| Focused final contract/database suite | 12 passed, including the historical event-visibility reproduction. |
| Complete Chromium suite | 54 passed, including five semantic recommendation/fallback cases. |
| Signed DEV baseline | Three observed groups, 147 guarded requests, nine accounts; passed and cleaned up. |
| Signed semantic verification | Eight groups, 179 guarded requests, nine accounts; passed and cleaned up. |
| Signed intelligence regression after migration | Eight groups, 194 guarded requests, nine accounts; passed and cleaned up. |
| Lint/build | Passed; 15 existing lint warnings and existing chunk/dynamic-import/timing advisories. |
| Final DEV | Fixed search paths, authenticated-only pair APIs, no anon/service execution, existing embedding RLS/policies preserved. |
| Independent cleanup | Zero synthetic Auth accounts, companies, vacancies, events, canonical skills, extraction runs or embeddings remain. Other fixture children/Storage objects were removed by the guarded harness; private audit records remain. |
| Rebuilt client | Public DEV client configuration; no fixture service credential or protected Production ref/URL in the bundle. |

Historical failures are preserved in score-before-repair.txt, weights-before-validation.txt and browser-before-repair.txt. An initial repaired browser assertion rounded the expected displayed score to an integer while the interface displays decimals; it was corrected to the actual score contract. That fixture assertion error is not a product vulnerability.

Signed native tests verify identical and orthogonal vectors, compatible model checks, undefined zero-magnitude handling, stale/failed/missing states, numeric-only output, raw-vector isolation, canonical PID distinct from UID, employer A/B and Google-purpose denial, municipality/provincial/staff/admin scope, AAL1 denial, 100-pair bounds, foreign-pair rejection, event approval filtering and revoked-session denial.

**Security observations:** Definer APIs authorize before metadata lookup. Employers must own the target vacancy and already have an authorized relationship to the candidate profile; jobseekers must own their canonical participant profile. Existing scoped profile/event rules govern PESO access. Anonymous and worker credentials cannot execute these APIs. Worker-only metadata/invalidation APIs and raw vector policies retain their existing grants.

Current Supabase guidance supports native similarity through RPCs and requires compatible embedding models: [Vector columns](https://supabase.com/docs/guides/ai/vector-columns). The fixed search path, narrow grants and explicit ownership checks follow [Database function security](https://supabase.com/docs/guides/database/functions#secure-a-database-function).

Advisors retain 18 anonymous and 58 authenticated public definer execution notices, two RLS-enabled tables without policies and disabled leaked-password protection. The two new authenticated notices correspond to the explicitly guarded pair APIs; notices alone do not establish a vulnerability. Remaining functions still need individual review. [Definer audit guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

**Outstanding defects and limitations:**

Google callback observation at 2026-10-13T06:40:52Z still returns redirect_uri_mismatch. Real signed Google owner onboarding, persistence/application/resume and semantic acceptance, plus identity linking, remain unverified. Designated account remains pesocagayanjobfair@gmail.com. Owner-positive evidence is isolated SQL/browser coverage; no live Google identities/provider claims were fabricated.

PGlite uses an opaque text domain for vector signatures and tests authorization/fallback before native math. Native math was verified in actual DEV with synthetic 1,536-dimensional vectors and signed approved Partner/PESO actors. These vectors prove geometry and authorization, not semantic employment relevance, embedding-provider quality or calibrated hiring likelihood.

Source-row invalidation, revision-checked persistence, strict provider failure behavior and the private-schema qualification guard correction are now verified in DEV; see DEV_EMBEDDING_FRESHNESS_MILESTONE.md. Real provider orchestration, taxonomy/time-derived invalidation and representation quality remain unverified.

PSOC/taxonomy source/version/provenance validation, reviewed ranking datasets and quality/exclusion metrics remain required. Employer/PESO events, outcome/reporting/export, retention/privacy, recovery fallback and remaining privileged RPC requirements stay in the full mission. Previously disclosed credential rotation remains unverified.

**Next recommended action:** Audit embedding generation/freshness and validate canonical PSOC/taxonomy provenance; then continue remaining core workflow and RPC checks. Resolve the dedicated DEV Google callback and run real signed owner acceptance. Establish reviewed relevance/eligibility/exclusion evidence before deployment claims.

**Git commits/pushes:** None.

**Production modified:** No.

## Taxonomy follow-up, October 14

DEV_TAXONOMY_MILESTONE.md records current canonical resolver/search corrections, representation v2 and dictionary/source/mapping invalidation. Shared v2 defaults and native authorization regressions pass. Full official PSOC import and mapping review remain pending the selected local reference file path. The full mission remains active.
