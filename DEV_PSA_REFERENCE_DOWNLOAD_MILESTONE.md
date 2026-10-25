# DEV PSA reference download milestone

Follow-up on 2026-10-16: explicit newer API paths supplied PSOC 2022 and PSCED 2017. PSOC 2022 is now imported additively in verified DEV with its 466-unit API/456-unit technical-note discrepancy retained. A later PSA publication independently corroborates 466; see [DEV_PSOC_CATALOG_FOUNDATION_MILESTONE.md](DEV_PSOC_CATALOG_FOUNDATION_MILESTONE.md). The original report below describes the historical download milestone and is retained as evidence.

Date: 2026-10-15. Result: requested PSOC, PSGC, PSCED and PSIC API lists downloaded locally with validated pagination and credential exclusion. Current-reference acceptance and database import remain incomplete; the wider development mission is active.

## Environment verified

Actual local EMPLOYCagayan project was used. API host/version/level paths were verified against official PSA documentation and exact HTTPS classification.psa.gov.ph requests, with redirects refused. The token in the user-provided psa.env successfully accessed all four APIs; its value was not displayed or supplied as a command argument. No Supabase operation or remote database mutation occurred, so no new DEV database connection was opened in this milestone. No Git commit/push, deployment, hosting or Production operation occurred.

Download folder: artifacts/psa-references/2026-10-15T07-32-51-626Z/.
Final independent review: artifacts/psa-reference-download-20261015/verified-reviews.json.
The snapshots contain public classification data, not jobseeker records.

## Actual downloaded API coverage

| Catalog / version | All requested API level counts |
|---|---|
| PSOC 2012 | major 10; sub-major 43; minor 130; unit 455 |
| PSGC Q2_2024 | regions 18; provinces endpoint 117; municipalities endpoint 1,623; barangays 42,004; income_classification 1,724; urban_rural 42,004; city_class 149 |
| PSCED 2008 | levels 6; broadgroup 27; field 77; program 397; course 1,479 |
| PSIC 2019 | sections 21; divisions 88; groups 245; classes 519; sub-classes 1,360 |

All 21 endpoints completed across 109 pages, including both 43-page PSGC barangay/urban-rural views. Overlapping PSGC auxiliary views are separate references, not additional unique places. Per-page, per-level and per-catalog record hashes were independently recomputed from saved arrays; reported counts and record versions matched throughout. No claim of one transactional snapshot across all requests is made; the API offers no snapshot token.

## Confirmed downloader defects and corrections

The earlier PSOC downloader accepted only the array shape shown in the documentation. The real service returns count/next/previous/results; credential-echo refusal therefore blocked normal paginated responses. New shared transport extracts only record arrays, count/page metadata and record-array hashes. It discards all credential-bearing pagination URLs, rebuilds requests only on the verified host and rejects malicious next metadata, redirects, repeated/truncated/changing results and oversized pages.

The initial PSGC diagnostic assumed every city/municipality parent came from the municipalities endpoint. Actual province-level results include HUCs. A synthetic HUC regression failed before correction. Final review uses explicit City/Mun/SubMun types from the reference views to resolve parents; all 2,113 initial missing-parent diagnostics were resolved without altering source records. Two untyped geography rows still require review. The original download diagnostics are preserved; verified-reviews.json supersedes them.

The legacy strict PSOC downloader now uses the shared transport but retains its documented completeness test. It still rejects the actual 455-unit snapshot. Its CLI now reports fixed non-sensitive failures. No count expectation was lowered to obtain acceptance.

## Source discrepancies and version limits

- **PSOC:** API has 455 units; both API documentation and technical notes describe 456. The snapshot retains 2121 as the combined mathematicians/actuaries title and has no 2123. The current technical notes describe the 2022 split into 2121 and 2123. This is evidence of a release/conformance difference requiring reconciliation, not permission to invent an extra row or relabel the API dataset as 2022-complete. [PSOC API documentation](https://psa.gov.ph/classifications-api/psoc), [PSOC technical notes](https://psa.gov.ph/classification/psoc/technical-notes).
- **PSGC:** the provinces endpoint actually contains 82 Prov, 33 City and two untyped records; it does not contain 117 provinces. Municipalities contains 1,493 Mun, 116 City and 14 SubMun. Untyped rows are 0990100000 (City of Isabela, Not a Province) and 1999900000 (Special Geographic Area). Exact 10-digit code, 9-digit correspondence code and explicit components are retained; no guessed province slicing or address migration occurred. PSA's current masterlist is as of 30 September 2026, with 42,010 barangays; this API snapshot is Q2_2024 with 42,004. [PSGC API documentation](https://psa.gov.ph/classifications-api/psgc), [current PSGC masterlist page](https://psa.gov.ph/classification/psgc).
- **PSCED:** the documented API supplies 2008, while the official overview identifies 2017 as the latest PSCED. One source course row (id 466) has code with leading whitespace and only six digits after trimming; it was retained unchanged and flagged. Course code widths also vary; padding or changing meaning without a reference is prohibited. Explicit level/group/field/program ancestry was checked without inventing missing broad groups. [PSCED API documentation](https://psa.gov.ph/classifications-api/psced), [PSCED overview](https://psa.gov.ph/classification/psced).
- **PSIC:** the API 2019 snapshot passes the implemented code/title/version/duplicate/parent checks, but that does not make it current. The official overview now presents Revision 5 with 22 sections, 88 divisions, 260 groups, 493 classes and 1,338 subclasses. Do not relabel the downloaded 2019 dataset or overwrite existing PSIC 2009 mappings. [PSIC API documentation](https://psa.gov.ph/classifications-api/psic), [PSIC Revision 5 overview](https://psa.gov.ph/classification/psic).

Official pages were consulted on 2026-10-15. Version currency and applicability require an explicit source/version decision before integration; passing API consistency checks is not official publication or mapping approval.

## Implementation and files

New: scripts/lib/psa-transport.mjs, scripts/lib/psa-reference-review.mjs, scripts/fetch-psa-references.mjs, tests/unit/psa-reference-download.test.js; staging snapshots and README; local verification script/evidence; this report.
Updated: scripts/lib/psoc-reference.mjs (paginated transport, record-array hash provenance), scripts/fetch-psoc-reference.mjs (fixed errors), .env.psa.example (unified variable/config instructions), .gitignore (psa.env and psa.env.txt).
No dependencies, runtime application routes, Supabase tables, RPCs, RLS, grants or canonical mappings changed.

## Tests and independent checks

- 19 focused tests pass: 16 new transport/reference cases plus three existing strict PSOC cases.
- Full unit suite: 434 pass, zero fail/skip.
- Focused lint passes.
- HUC parent regression first failed, then passed after correction; baseline retained.
- Real official download: all four catalogs, 21 endpoint sets, 109 pages complete. This verifies token access and API transport, not canonical import or matching relevance.
- Independent verification: every saved level/page/catalog count and record hash, exact API version, known source diagnostics and strict PSOC rejection checked offline.
- Exact PSA-token variants are absent from saved snapshots/manifest and seven existing dist files. No credential-bearing pagination URL was retained. This is a scoped token check, not a general secret audit.
- Existing application build/browser suites were not rerun: changes are local Node tooling/config exclusions and public JSON artifacts, with no application runtime import. Previous browser/build results remain historical.
- No service-role, paid AI provider, hosted acceptance actor or personal record was used.

## Security observations and outstanding work

psa.env is now ignored; .gitignore is not proof about any pre-existing Git index entry or sync copies. Keep private credential configuration out of shared/synced locations and frontend variables. The application has no new access to this token. Raw API envelopes were inspected only in memory and never saved. Library, CLI and verification errors withhold remote diagnostics and credential URLs.

Every artifact remains import_ready=false. The two first-class statuses are deliberately separate: download_complete means all API-declared records were collected; quality status describes implemented consistency checks and never authorizes an import. The saved original reference rows are unchanged.

Next: reconcile PSOC with the official 2022 updates, obtain/validate the intended current PSCED/PSIC/PSGC releases, document explicit source/version correspondence, then prepare compatible source records and mappings against verified DEV. Do not replace genuine selected IDs, assume PSOC equals ESCO, or silently replace active address cascades. No catalog database migration was applied.

Git commits/pushes: none. Production modified: no.

