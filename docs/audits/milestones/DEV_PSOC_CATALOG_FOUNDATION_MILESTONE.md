# DEV PSOC 2022 API catalog foundation

Date: 2026-10-16 Asia/Manila. Scope: local EMPLOYCagayan and independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only.

## Result and limits

DEV now contains the exact verified PSOC 2022 API hierarchy: 10 major, 43 sub-major, 130 minor and 466 unit groups (649 canonical entries), 649 same-source identity mappings and 466 unit-code aliases. Every pre-existing source, occupation, mapping and alias row, including IDs and timestamps, was preserved. The application selects legacy NULL/zero occupations and level-4 unit groups, excluding broad hierarchy groups from new occupation choices. Code aliases preserve leading zeros.

This is an additive API reference foundation. The [official technical notes](https://psa.gov.ph/statistics/technical-notes/1684075911) describe 456 units, whereas the authenticated 2022 API returned 466 distinct unit codes. A later [PSA publication about the creative-classification system](https://psa.gov.ph/content/pscrcs-about), dated 28 November 2025, also describes 466 four-digit PSOC 2022 unit groups. This independently corroborates the API count but does not explain the technical-note conflict; both claims remain in the provenance record. Existing PSOC 2012 mappings are unchanged. Identity mappings identify the same official source entry; they do not approve equivalence with existing local job titles, ESCO entries or skills.

No Production, Git commit/push, hosting deployment or Edge Function publication occurred. No live retention/disposal mechanism was added. No personal records were deleted.

## Source evidence

- Exact official HTTPS API origin: https://classification.psa.gov.ph, explicit release 2022. Downloads reject redirects and retain record arrays without token-bearing pagination URLs.
- Snapshot: `artifacts/psa-references/2026-10-15T07-50-02-156Z/psoc-2022.json`.
- Snapshot SHA256: `0a77f0a0816246199b51359c76b0cf7baf7393996dfe7fea9b85afcce3ca57ce`.
- Normalized payload SHA256: `3de3889be8c9ca74afb04ec60a0aadbbbfa134e2270477cd33fdfcf7123e7d17`.
- All four record-array hashes were independently re-fetched and matched before import; see `official-source-recheck.json`.
- [PSOC API documentation](https://psa.gov.ph/classifications-api/psoc) and [technical notes](https://psa.gov.ph/classification/psoc/technical-notes) are source references. Public original-PDF retrieval returned HTTP 403; no PDF content was accepted, fabricated or obtained through challenge bypass.
- The API release adds 11 unit codes compared with the 455-unit 2012 API snapshot, including separate actuaries and data scientists. Source descriptions and titles remain the supplied API text.

The original strict 2012 downloader still rejects the 455-versus-456 discrepancy. The newer explicit release support does not lower that expectation or silently reinterpret the older snapshot.

## Verified DEV migrations

Before each database operation, the account connection returned the exact DEV URL. Management identity was postgres/current_user, postgres/session_user and postgres/database; migration guards enforce those identities as well.

| DEV ledger version | Local migration | SHA256 of exact applied SQL |
|---|---|---|
| 20261015233921 | `supabase/migrations/20261015233921_psoc_hierarchy_name_uniqueness.sql` | `76c83cdd7c3c7cf26ddaef8bd5755314cb8f200a4bbe27569a280ba962c41396` |
| 20261015233939 | `supabase/migrations/20261015233939_psoc_2022_api_catalog_foundation.sql` | `da4e37515e6a424683be3d4580e91c30991889000193291113e43c640f86e545` |

The old global unique occupation-name index rejected legitimate repeated names at different hierarchy levels. The replacement preserves uniqueness within each level, treating legacy NULL and zero as the same level. This was necessary to represent the actual hierarchy without changing official names. No rows, grants, policies or callable functions were removed by that index change.

The initial isolated fixture omitted standalone indexes and missed this conflict. The real index definitions were added to the fixture; the conflict was reproduced before correction, and nine import tests now pass. The first failed DEV import rolled back. Subsequent small and large requests failed with invalid/expired requestState and were independently confirmed unapplied. After the user refreshed the connector, both prepared migrations succeeded through the same connection and normal migration tool. Local CLI-scaffolded filenames were aligned with the actual ledger versions only after exact applied SQL hashes matched.

The data import validates pinned payload hashes, release, counts, explicit ancestry and namespace; it uses generated UUIDs and a temporary staging table. Isolated SQL tests verify exact no-op reruns and atomic refusal of changed source data or conflicting namespaces. No new exposed table, RPC, grant or RLS policy was introduced.

## Preservation and security evidence

| Table category | Before | After |
|---|---:|---:|
| Taxonomy sources | 5 | 6 |
| Occupations | 10 | 659 |
| Taxonomy mappings | 22 | 671 |
| Occupation aliases | 5 | 471 |

All original rows were compared by UUID and every stored field. Each of the 649 imported canonical names, normalized names, descriptions, levels, parent identities, external source IDs and exact identity mappings matched the prepared source rows. All 466 unit aliases matched their exact string codes and unit-group targets.

All 382 existing policy metadata entries (names, command, roles, kind and table) match the earlier governance inventory. Authenticated table grants and five recorded lifecycle/audit function definitions also match. The earlier opaque fingerprint serialization formula was unavailable after context recovery, so the original fingerprint strings were not reproduced. The older inventory excludes policy USING/WITH CHECK expressions; this comparison alone is not a full expression-level before/after proof. Exact applied migrations contain no policy/grant/function alterations, and live MFA/role checks provide separate behavioral evidence.

Full post-import public catalog rows are preserved in `dev-catalog-after.json`; compact comparison evidence is in `dev-after-import.json`, `security-after-import.json` and `verification.json`. These artifacts contain public reference data or schema metadata, not genuine jobseeker records.

## Tests and observed behavior

- Full unit suite: **449 passed**, zero failed/skipped.
- Import suite after ledger filename alignment: **9 passed**.
- Full Chromium browser suite: **105 passed**. These browser cases use controlled intercepted fixtures; they do not establish live database authorization.
- Focused occupation browser suite: **5 passed**, including duplicate hierarchy names and code aliases.
- Live DEV acceptance: **4 groups, 23 HTTPS requests**, real synthetic password login and verified TOTP AAL2. An AAL1 Partner could not read protected references. AAL2 staff could read source provenance, ACTUARIES via 2123, a leading-zero 0110 alias and DATA SCIENTIST; repeated broad group names were excluded.
- The first post-import live test incorrectly assumed a legacy substring search must return exactly one row. The expanded catalog legitimately contains additional substring matches. The corrected check verifies the legacy record remains present and every returned row satisfies both text and selectable-level filters. Initial failure evidence is retained; both fixture runs confirmed cleanup.
- Application build and application/tooling lint passed. Existing application lint and build size/dynamic-import warnings remain.
- The initial browser run was not executed because automatic approval review hit a usage limit. After the stated reset time passed and ordinary usage was confirmed available, the same approval path accepted the full run; it completed successfully.

Live acceptance covers reference reads only. It does not prove Google owner onboarding/linking, preference writes, matching relevance, AI provider privacy or genuine-record acceptance.

## Synthetic cleanup resolved

The refreshed connector also resolved the previously blocked cleanup of 30 private skill-relationship history rows belonging to four recorded synthetic relationships across two original runs. Every snapshot's relationship, source/target node IDs, source ID and original test time window were verified; no public relationship survived. The deletion required exact count and identity guards. Independent DEV verification confirmed zero remaining history and zero public skill relationships.

See `artifacts/skill-graph-20261015/cleanup-after-refresh.json` and updated `cleanup-status.json`. This is narrowly scoped test-fixture cleanup, not a records-retention policy or disposal of genuine audit history.

## Remaining mission work

PSCED 2017 was also retrieved with its actual newer API paths: 9 levels, 22 broad fields, 67 narrow fields and 754 detailed fields. It remains a local source snapshot, not a canonical import or education equivalence decision. PSGC Q2_2024 and PSIC 2019 remain historical staged references; current-release correspondence and compatible integration are still required. Empty current-version API responses are not proof of complete current catalogs.

The wider mission remains active, including unresolved real Google onboarding/linking, full text retrieval, human-reviewed relevance validation, provider privacy/configuration evidence and the remaining catalog integration. Governance proposals remain inactive, with no automatic deletion or live disposal executor.

