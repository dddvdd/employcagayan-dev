# DEV unified skills taxonomy reconciliation — 21 October 2026

**Decision: not ready for staged DEV import.** This is a reproducible, offline, review-only inventory. It does not establish 163 approved canonical skills or authorize a connected write. The [proposed import manifest](artifacts/unified-skills-20261021/reconciliation/proposed-import-manifest.json) requests **zero inserts, zero activations, and zero approved source mappings**.

## Inputs and preservation

| Input | Observed coverage | Status |
| --- | ---: | --- |
| Supplied `skills.csv` | 180 unique IDs and normalized labels | Original left unchanged; 18,128 bytes, SHA-256 `089c38d978adeb47ad4b3e7ad0067094473030708150d1723352b7de77107b90`; metadata and byte-identical copy saved in `artifacts/unified-skills-20261021/reconciliation/` |
| TESDA Training Regulations | 384 PDFs, 5,148 extracted unit-code placements | Local public-reference research; 61 index-marked superseded, 322 not marked superseded but version unverified, one MMAW NC II document independently checked |
| Philippine Skills Framework | 11 PDFs, 3,216 extracted proficiency-code placements | Listed on TESDA's PSF page; version and reuse review pending |
| Supabase DEV `cdmkzzmaswwiryymtycn` | 16 active skills | Read-only comparison on 21 October; IDs matched the local snapshot exactly |

The source inventory contains 395 documents and 8,364 code placements. Its extraction output is **not** a set of 8,364 unique skills. The CSV's 137 `validated=True` entries and its fuzzy alias suggestions are internal claims, not official or Provincial approval. [Input metadata](artifacts/unified-skills-20261021/reconciliation/skills-source-metadata.json), [source inventory](artifacts/unified-skills-20261021/full-source-manifest.json), and [source placement inventory](artifacts/unified-skills-20261021/full-staged-source-records.json) retain provenance.

Official reference indexes: [TESDA Training Regulations](https://www.tesda.gov.ph/Download/Training_Regulations), [TESDA Philippine Skills Framework](https://www.tesda.gov.ph/About/TESDA/27898), and the [MMAW NC II PDF](https://www.tesda.gov.ph/Downloadables/TRs/TR%20-%20%20Manual%20Metal%20Arc%20Welding%20%28MMAW%29%20NC%20II.pdf). These support source identification; they do not approve the proposed CSV labels or reuse of derived text in a public catalog.

## Conservative reconciliation

All 180 CSV rows have a classification and an explicit lexical comparison with extracted unit/skill titles and TESDA document titles in [CSV disposition](artifacts/unified-skills-20261021/reconciliation/csv-disposition.csv) and [source alignment](artifacts/unified-skills-20261021/reconciliation/csv-source-alignment.json). No semantic equivalence was inferred from a repeated code or similar wording.

| Result | Count | Meaning |
| --- | ---: | --- |
| Working canonical label candidates | **163** | 16 existing DEV skills plus 147 provisional, skill-like CSV concepts; no new approval |
| Skill-like CSV labels | 149 | Two exactly match existing DEV labels: `BC-05` Problem solving and `BUS-02` Bookkeeping |
| NC qualification labels | 28 | Excluded from skills; 17 exactly match TESDA index titles, 11 need title review |
| Other labels withheld | 3 | Training program `TRN-01`, sector topic `CON-13`, mixed occupation/skill `TOU-06` |
| Exact CSV-to-extracted-title labels | 3 | `BC-06` Critical thinking, `COM-15` Technical report writing, `DIG-12` Digital marketing: 14 PSF code placements, all still requiring title/version/meaning review |
| Normalized duplicate CSV names | 0 | Normalization only folds case, spacing, punctuation and `&`; it does not establish meaning |
| TESDA exact repeated code/title groups | 370 | 3,246 additional placements of the same literal code/title pair; these are repeated references, not merged skills |
| TESDA normalized code/title groups | 1,885 | 365 groups have repeat placements; 180 codes occur under more than one normalized title, so code-only merging is unsafe |
| PSF source-specific code families | 984 | 912 functional, 72 enabling; levels kept as proficiency references, not separate certifications or approved skills |
| Proposed aliases | 461 | **Zero approved**; 205 are NC qualification-shaped and cannot be silently attached to skills |
| Possible semantic overlaps | 21 | 9 CSV-to-DEV and 12 CSV-to-CSV; all explicitly unapproved |

The 16 DEV IDs remain immutable in [working candidates](artifacts/unified-skills-20261021/reconciliation/canonical-candidates.json). DEV read-only counts were six `jobseeker_skills`, three `vacancy_skills`, and four `occupation_skills` associations. Their row digests and the 16-ID digest are recorded in [DEV baseline](artifacts/unified-skills-20261021/reconciliation/dev-skill-baseline-20261021.json). No association was changed.

## Source verification and exceptions

The source index labels 61 TESDA documents superseded (751 extracted placements); 322 TESDA documents are not index-marked superseded (4,380 placements) but their specific versions remain unverified. The separately checked current MMAW NC II PDF contributes 17 verified code/title references: nine basic, five common, three core. All 11 PSF PDFs (3,216 placements) remain version-review pending. **Only those 17 MMAW source references are individually source-verified; none has an approved canonical mapping.** The source index state is not a legal determination of whether a publication is current.

[Unresolved exceptions](artifacts/unified-skills-20261021/reconciliation/unresolved-exceptions.csv) contains 9,380 entity-level rows: all 8,364 source placements lack an approved canonical mapping/description review, 394 documents need version and reuse review, 161 CSV-level exceptions, and 461 alias proposals. This is an exception-register count, not a count of independent errors. The detailed [document review](artifacts/unified-skills-20261021/reconciliation/document-review.json) and [source disposition](artifacts/unified-skills-20261021/reconciliation/source-disposition.csv) identify each case and page.

Specific extraction risks: one TESDA PDF yielded no codes; 22 extracted TESDA codes are suspicious prefixes of longer codes. For example `50031111` is a PDF-text truncation candidate against the displayed `500311114` table code and must be checked against the page, not silently repaired. The earlier 2D Animation and 2D Game Art PDFs produced only nine and six units respectively, indicating incomplete extraction. Among PSF source-specific families, 225 have no extracted title candidate and three have conflicting title candidates. PSF numeric and basic/intermediate/advanced levels are kept as source-level proficiency only. The [reference groups](artifacts/unified-skills-20261021/reconciliation/source-reference-groups.json) aid review and do not assert cross-document equivalence.

## Search and matching compatibility

The current `listSkills` service in `src/services/referenceService.js` searches only active `skills.canonical_name` and `normalized_name`. It does not search the proposed aliases, source codes, or inactive staged references. [Offline search evidence](artifacts/unified-skills-20261021/reconciliation/search-compatibility.json) shows current active-name hits: `welding` 0, `MMAW` 0, `communication` 1, `agriculture` 0, `bookkeeping` 1, `animation` 0, `customer service` 1. The 26 extracted title placements containing “welding” and four containing “MMAW” are pending references; they cannot become selectable through this proposal alone. `skillService.js` records jobseeker choices as self-reported and unverified. This milestone changes neither eligibility nor ranking, and imports must never auto-grant NC credentials, occupation equivalence, or a jobseeker's possession of a skill.

## Proposed approval controls and validation

1. Verify publication identity, version/currentness and permitted extraction/reuse for each source; retain PDF SHA-256, source URL, page, code, original title/description and superseded state.
2. Review malformed/missing titles, unit scope, PSF level parsing, qualifications and course labels. Approve each canonical concept, source-to-skill relationship and alias independently with reviewer and decision history. Preserve different source references where equivalence remains unknown.
3. Freeze a new, exact-count staged-import manifest only after the reviewed subset is named. Reverify target `cdmkzzmaswwiryymtycn`, all 16 IDs and association digests before any separately authorized write. Stage references pending review; activation is a separate decision.
4. Acceptance: one fixture per major source class and each exception type; rerunning the importer is byte-identical and idempotent; search finds approved terminology without exposing pending/qualification labels; existing skill IDs and links are unchanged; no new jobseeker skill, certification, PSOC equivalence, ranking weight, or eligibility edge appears merely from import.

The offline runner is `scripts/reconcile-unified-skills.py`; safeguards and classification tests are in `tests/unit/test_reconcile_unified_skills.py`. Two unit tests pass, and a repeat run produced a byte-identical manifest. The user-supplied original CSV hash and timestamps were unchanged after processing.
