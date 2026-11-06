# EMPLOYCagayan — Reviewed skill ranking milestone

Environment: local EMPLOYCagayan and independently verified Supabase DEV cdmkzzmaswwiryymtycn only.
Status: verified milestone; full development mission remains active and incomplete.
Observed date: 2026-10-15.

## Implemented behavior

Both job-to-candidate and candidate-to-job hybrid recommendations now consume the existing guarded approved-skill snapshot. Single-pair explanations use the same scoring path, preventing independent score/explanation calculations, and retain the semantic representation version for audit.

The base hybrid model remains hybrid-v1 (default 85% deterministic and 15% semantic, with deterministic fallback when semantic evidence is unavailable). The composite runtime model is hybrid-v2-reviewed-skills. Explanation version is explanation-v2-reviewed-skills.

Reviewed support adds at most five ranking points: 5 × distinct supported canonical target skills / distinct canonical vacancy target skills. Only explicitly verified, canonically identified source skills can earn support. Related links operate in both directions; transferable links follow their approved direction. No transitive paths or label matches are inferred. Multiple sources/links cannot count a target twice. Adding a recorded target does not remove an existing relationship bonus. Final scores cap at 100; requested and actually applied points are recorded separately.

Eligibility remains the first gate. Missing/unverified requirements retain their existing review status; verified below-minimum evidence remains excluded. Ineligible pairs receive no relationship hints/bonus or knowledge lookup. No qualification, verification, candidate source, application or preference is created or changed by this computation. The five-point setting is a bounded prototype, not an empirically validated relevance weight or hiring probability.

## Knowledge loading and explanations

The existing get_approved_skill_relationships RPC is reused without database changes. One current snapshot is fetched per authorized recommendation batch, after guarded profile/pool loading succeeds. Only sorted, unique canonical vacancy skill IDs are sent; no candidate IDs or free text are sent to this reader.

Its existing limits remain: at most 100 requested IDs and 1,000 returned edges. Batches exceeding the request limit, RPC failures, denied access, malformed/unknown-version snapshots and out-of-scope edges safely preserve the baseline and report unavailable support. Large batches are not split across potentially different snapshots. There is no cross-request snapshot cache. Empty canonical requirements make no request and add no bonus.

Match details show the base score, actual bonus, target coverage, source and target names, direction, source verification, reference version, relationship revision and evidence reference. References render as escaped text. Up to 20 links display in the expandable list, with a total-count notice; the complete bounded evidence remains in the explanation object. The knowledge version and snapshot hash remain available for audit. Reviewer identities and raw embeddings are not exposed by the new reader.

## Files changed

- src/domain/reviewedSkillMatching.js — bounded composite score and trace.
- src/services/reviewedSkillMatchingService.js — guarded single-snapshot reader and safe fallback.
- src/domain/skillRelationshipEvidence.js — optional inclusion of already recorded targets for monotonic ranking; UUID case normalization.
- src/services/semanticMatchingService.js — both recommendation directions and pair scoring.
- src/services/matchExplanationService.js — pair explanation reuses shared scoring.
- src/domain/matchExplanation.js — new explanation version and score decomposition.
- src/domain/matchExplanationFormatter.js — accurate semantic fallback wording.
- src/domain/matchPresentation.js — skill support presentation.
- src/components/matching/MatchExplanationPanel.jsx — separate evidence section.
- tests/unit/reviewed-skill-matching.test.js — 12 score/reader regressions.
- tests/browser/reviewed-skill-recommendations.spec.js — eight browser acceptance cases.
- tests/integration/dev-reviewed-skill-ranking.js — real signed DEV read and negative controls.
- artifacts/reviewed-skill-ranking-20261015/ — verification logs, native receipt and inspected mobile screenshot.

Migrations: none. No database functions, RLS policies, role grants, schema, published Edge source or external-provider payload changed.

## Verification

- Focused domain/reader/evidence tests: 17 passed.
- Full unit suite: 375 passed, zero failed.
- Focused browser suite: eight passed; all eight also passed in the final full run.
- Full browser suite: 94 passed, zero failed.
- Lint: passed with existing warnings.
- Local development-mode build: passed with existing bundle-size/dynamic-import warnings.
- Bundle inspection: verified DEV markers and new model version; service credential and Production project reference absent.
- All seven local files still exactly match the approved managed-function manifest hashes.
- Mobile screenshot visually inspected; skill evidence remains reachable, no horizontal page overflow, and Escape restores focus to the opener.

New test failures came from fixture construction (undefined used a default verified value, and a score object was passed where a ranked record was expected), employer button-label assumptions, an overly strict one-load-per-page assertion, and a floating-point equality assertion against a correctly rounded score. These fixtures were corrected; product eligibility and authorization were not weakened.

Native DEV acceptance: four groups, 15 HTTPS requests, one actual signed staff actor with actual TOTP/AAL2. The new client read the current empty approved snapshot and retained baseline score plus fingerprint. Anonymous and service-role negative controls were denied. After actual global session revocation, the formerly valid signed JWT could not retrieve knowledge and the client returned unavailable. Synthetic account cleanup completed.

Positive relationship scoring is verified with isolated and fully intercepted browser fixtures. Current DEV has zero graph relationships, so this milestone does not claim a fresh positive-edge live acceptance or genuine employment relevance. It creates no graph, node, source, employment-profile or vacancy fixtures and adds no private graph history.

An independent final DEV read confirmed zero ranking fixture accounts, zero graph rows, 16 canonical skills and four original occupation-skill links. Thirty private synthetic graph history rows retained from the prior milestone are unchanged.

## Security and outstanding work

No provider requests, new Edge publication, Git commits/pushes, Vercel operation or Production operation occurred in this milestone. The separately approved v9 managed extraction publication remains documented in DEV_MANAGED_EXTRACTION_PUBLICATION.md.

Private synthetic graph history cleanup remains incomplete because the connector's destructive operation previously returned Invalid or expired requestState. No identical cleanup retry, alternate privilege path, new cleanup function or permission change was attempted here.

The full development mission remains active and incomplete. Outstanding work includes genuine reviewed graph/occupation curation, reviewed relevance/eligibility/exclusion quality datasets and evaluation, official PSA API access/import, actual Google ownership/linking acceptance, privacy/retention requirements, fresh signed graph UI write acceptance after cleanup can complete, and a full remaining-requirements audit.

Next recommended action: prepare the human-reviewed matching evaluation workflow and inspect remaining privacy/consent/retention gaps without inventing relevance labels. Resolve the retained fixture cleanup through a working connector operation when its state changes.
