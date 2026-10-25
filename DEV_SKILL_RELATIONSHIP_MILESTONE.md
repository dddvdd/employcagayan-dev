# DEV related and transferable skill knowledge foundation

Date: 2026-10-15, Asia/Manila.
Milestone: governed skill-to-skill knowledge and traceable one-hop contextual evidence.
Status: implementation and functional verification passed; cleanup of 30 private synthetic history rows remains incomplete because the connector rejects cleanup requests with Invalid or expired requestState. The full goal is active.

## Environment verified

Actual EMPLOYCagayan workspace and Supabase DEV cdmkzzmaswwiryymtycn only. Each management operation independently checked https://cdmkzzmaswwiryymtycn.supabase.co. SQL identified current_user/session_user as postgres. Signed native transports require the same exact HTTPS origin and actual Auth-issued sessions.

The read-only audit confirmed no existing skill-to-skill table. The catalog contained 16 skills and four occupation-skill links. The new model references canonical platform skill IDs and does not replace PSOC identifiers, taxonomy mappings or personal qualification tables.

## Implemented

public.skill_relationships stores related and transferable links with versioned taxonomy source, reference, review status/reviewer/time, revision and active state.

Related links are symmetric and stored once in ascending endpoint-ID order. Transferable links are directional. Self-links, duplicate relationships and unsupported equivalence types are rejected. No genuine relationships were seeded or approved.

The model reuses the existing row-generic review metadata guard, administrator/session/MFA guard and truncation protection. Only a canonical active confirmed administrator with real MFA can create/review ordinary graph records. Direct API approval stamps are denied even to administrators and service callers. Material endpoint/type/source/activity changes reset approval; no-op saves preserve the revision. Review uses revision comparison and locks active source/skill parents before the relationship.

A private RLS-enabled history table records creation, edits, review and deletion, including parent cascades. It has no ordinary/service read or write grants. Administrator-only history supports bounded revision-cursor pages.

get_approved_skill_relationships accepts at most 100 skill IDs and returns at most 1,000 reviewed active incident edges, with explicit type/direction, canonical names, evidence/source version and a deterministic snapshot fingerprint. It omits reviewer identity and suppresses inactive or source-version-mismatched records.

The initial raw SELECT policy was too broad for pending curation metadata. A new regression reproduced staff reading a pending record. The separate privacy migration removes that policy: raw curation rows are administrator-only, while authorized matching users retain the guarded approved snapshot API. Signed native checks verify both raw pending/approved metadata denial and successful approved-snapshot retrieval.

src/domain/skillRelationshipEvidence.js validates the versioned snapshot and derives one-hop contextual hints. Transferable links only work forward; related links work either way. It does not infer chains, resolve labels as IDs, add recorded skills or assign qualification credit. Each hint retains source version/reference, relationship revision and source verification status. Missing target qualifications remain subject to the existing deterministic evidence rules. No score weights, statistical probabilities or mandatory requirement equivalences were introduced.

## Files and migrations

- supabase/migrations/20261015033337_reviewed_skill_relationship_knowledge.sql
- supabase/migrations/20261015035526_skill_relationship_curation_privacy.sql
- src/domain/skillRelationshipEvidence.js
- tests/support/skill-graph-database.js
- tests/unit/skill-graph-db.test.js
- tests/unit/skill-relationship-evidence.test.js
- tests/integration/dev-skill-graph.js
- artifacts/skill-graph-20261015/
- README.md and this report.

Both migrations were applied only to verified DEV; recorded statements match local SQL after trim normalization. Local CLI scaffolds were renamed to the actual ledger timestamps. Existing shared helper bodies were compared to DEV before reuse and matched exactly.

SHA-256:
- 20261015033337: 6bdff8926e9a2ae476232e52d5a3206a9dd98ced4c45d9b5070a0a18d1a4fbf1
- 20261015035526: a15dfe1abfd562126c674c7fd17f354d61c7a49dc7599734fe170ce9aac6438d

## Tests and results

| Check | Result |
| --- | --- |
| Schema/API focused tests | Nine passed after privacy correction: provenance, shape/direction constraints, admin/MFA/role-metadata boundaries, direct forgery denial, stale edits, active/version gates, history/cascades, bounds/grants and raw curation privacy. |
| Contextual evidence focused tests | Five passed: direction/symmetry, no qualification/scoring mutation, no transitive/name inference, preserved verification/order and malformed snapshots. |
| Privacy before correction | Reproduced staff receiving one pending raw row where zero were required. |
| First native DEV run | Six groups, 65 requests, two signed actors; public fixtures cleaned. |
| Corrected native DEV run | Six groups, 67 requests, two signed actors, real TOTP; includes raw pending/reviewer metadata denial and approved snapshot access. |
| Full unit suite | 357 passed; zero failures/skips/TODOs. |
| Lint | Passed with existing warnings. |
| Browser/build | No UI, routing or consumed matching source changed. Prior 78-browser/DEV-build passes are historical and were not repeated for this backend/pure-domain milestone. |
| Original catalog | All 16 original skill IDs/names/active states and all four complete occupation-link rows compare unchanged. |
| Public fixture cleanup | Zero synthetic graph rows, sources and accounts remain; synthetic skill nodes were removed and original skill identities restored exactly. |
| Private fixture cleanup | 30 known synthetic version-history rows remain, scoped to the two recorded test runs. Three cleanup attempts failed with connector invalid_request_state errors; authoritative reads verified state before retries. No access grant or alternate privilege path was added. |
| Extraction source | All seven published DEV v9 source hashes remain unchanged. No provider request/publication occurred. |

The first privacy-migration management call also returned invalid_request_state. An authoritative ledger/policy read showed it had not applied; a fresh independently verified retry succeeded. Migration verification was completed before the corrected native run.

Native service credentials prepare/inspect/clean synthetic fixtures only, apart from explicitly denied service shortcuts. Ordinary CRUD/review/read operations use signed administrators/staff. Contextual profile facts used by the pure evidence helper are synthetic; this does not prove genuine qualification truth or Google-owner acceptance. No multi-connection lock schedule or relevance benchmark is claimed.

## Security observations

Both new tables have RLS. Main raw reads are protected by administrator policy plus existing identity/MFA restrictions. Private history grants and ordinary truncation rights are absent. Review/history functions use explicit internal administrator checks; the approved reader uses the existing intelligence-session guard.

Advisors report eight RLS-without-policy notices, 17 anonymous and 71 authenticated public-definer notices, and disabled leaked-password protection. The new private history table intentionally has no ordinary policies/grants. Remaining historical notices still need their individual review.

References: [RLS and policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [definer function privileges](https://supabase.com/docs/guides/database/functions), [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Outstanding work and next action

First retry cleanup once the connector can process the operation. The exact relationship IDs, source/target node IDs and run IDs are in graph-live-before-privacy.json and graph-live-verify-results.json; cleanup-status.json records the authoritative remaining count. Delete only those synthetic history rows through the verified maintenance connection. Public graph data is empty and genuine catalog data is preserved.

An administrator graph-curation UI and integration of reviewed graph evidence into ranking/explanations remain incomplete. The pure helper is a tested foundation and is not wired into the current recommendation service. Genuine graph curation and reviewed relevance/eligibility/exclusion datasets are also pending.

Official PSA API access/import, real Google onboarding/ownership/linking, operational privacy/retention and other mission requirements remain incomplete. No automatic retention schedule was invented for reviewer history. The previous approved DEV v9 publication remains active and unchanged.

Git commits/pushes: none.
New Edge/Vercel publication: none.
Production modified: no.
Full goal: active; neither this cleanup nor the complete development mission is claimed finished.

## Curation interface follow-up

DEV_SKILL_RELATIONSHIP_UI_MILESTONE.md records local graph draft/review UI, shared occupation review controls, 363-unit/86-browser regressions and three signed DEV client-read groups. No new graph fixtures were created. A fresh cleanup retry still returned invalid_request_state; the same 30 private synthetic rows remain. Fresh live client-write acceptance and ranking integration are pending.
