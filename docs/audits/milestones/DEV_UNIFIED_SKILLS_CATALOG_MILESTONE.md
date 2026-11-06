# EMPLOYCagayan — Unified Philippine Skills Catalog, local source inventory

21 October 2026 (Asia/Manila). Local source research and offline staging only. No Supabase DEV catalog writes, activation, production change, deployment, commit or push.

## Official access and downloaded sources

The [TESDA Training Regulations index](https://tesda.gov.ph/Download/Training_Regulations?Searchcat=Training+Regulations) listed 384 documents over 39 pages: 61 explicitly superseded and 323 not marked superseded. The latter label does not independently verify each PDF's current revision. Using TESDA's normal form with the user-provided DEV purpose, Philippines, and designated email, the resumable downloader obtained all 384 PDFs. The submitted email and form token are not stored in the scripts or manifests.

The two PDFs supplied by the user, 2D Animation NC III and 2D Game Art Development NC III, match TESDA form downloads byte for byte (download IDs 123 and 464). Animation states version 02, amended February 27, 2018. The game-art document's formal revision remains unverified. Both are suitable official source evidence for internal DEV research; they are qualifications containing competency units, not individual certifications or already approved catalog skills.

All 11 PDFs linked by [TESDA's Philippine Skills Framework index](https://www.tesda.gov.ph/About/TESDA/27898) remain in the local source set. The current MMAW NC II PDF exactly matches TESDA index download 2519; the superseded SMAW NC II PDF exactly matches download 216. MMAW NC II revision 01, promulgated September 14, 2021, has a reproduction-with-acknowledgement notice. Other TESDA TR and PSF reuse/version decisions remain pending source-owner or legal review before publication or connected-catalog use. Local download through the public form is not a grant to redistribute the PDFs or their contents.

The PDFs are in D:\PES Download\TESDA Training Regulations; the 11 PSF files were copied there from the previously hash-verified local samples. All 384 TESDA downloads were checked against their manifest hashes and opened as PDFs: **zero hash mismatches, unreadable files or encrypted files**. They total 37,532 pages and 334,886,077 bytes; no two index entries are byte-identical. One document, Performing Arts (Magician) NC II, has a textless first page and yielded no competency units to the current parser.

## Review-only extraction

The combined source manifest contains 384 TESDA TR documents and 11 PSF documents. The existing deterministic extractor produced 8,364 **source-code-level records**: 5,148 TESDA competency-unit references and 3,216 PSF proficiency-code references (3,030 functional, 186 enabling). These counts are neither unique skills nor an approved canonical catalog.

| Review measure | Count |
| --- | ---: |
| Distinct extracted code strings across all documents | 4,603 |
| Codes found in multiple documents | 432 |
| Shared title-candidate groups | 588 |
| PSF codes without a usable title candidate | 732 |
| Source records needing reference/title review | 8,347 |
| Previously verified current MMAW reference rows | 17 |
| Proposed active skills | **0** |
| Preserved existing skill IDs | **16** |

Of TESDA records, 751 came from the 61 index entries marked superseded, 4,380 from 322 entries not marked superseded but without a verified version/reuse decision, and 17 from the separately verified MMAW document. Repeated TESDA basic/common codes and PSF proficiency variants are not automatically equivalent or duplicate skills.

Extraction coverage is incomplete: the parser found only nine units in 2D Animation and six in 2D Game Art, and produced at least one suspicious shortened code (50031111) from PDF text. The Magician document yielded zero units. Its first page is textless; whether the rest require OCR or a different layout parser needs review. Do not use the extracted counts as a complete competency inventory or bulk-activate them.

## Catalog compatibility and controls

The prior read-only Supabase DEV snapshot (cdmkzzmaswwiryymtycn) had 16 active skills and existing jobseeker/vacancy/occupation associations. No connected database operation occurred in this download milestone. The offline builder preserves those 16 IDs; the local SQLite stage has only source_documents, source_records, and legacy_skill_ids, with all 8,364 source records pending_review. It has no active-skills table.

Current jobseeker skill search uses active canonical/normalized names, not source codes or aliases. Reviewed TESDA/PSF terms would need governed canonical entries and aliases before becoming selectable. Existing occupation-skill and skill-relationship controls do not approve creation of canonical skills; a narrow source-backed catalog-entry and alias review gate is still needed. No downloaded TR grants a jobseeker a qualification or certification, and no source code establishes PSOC occupation-skill equivalence or changes matching eligibility.

## Local artifacts and checks

- artifacts/unified-skills-20261021/tesda-tr-index.json: 384 public index titles and IDs.
- artifacts/unified-skills-20261021/tesda-download-manifest.json: ID, title, status, filename, size and SHA-256 for each download; no submitted personal data.
- artifacts/unified-skills-20261021/tesda-download-validation.json: PDF readability, page counts and hash checks.
- artifacts/unified-skills-20261021/full-source-manifest.json: 395 source/version/rights references.
- artifacts/unified-skills-20261021/full-staged-source-records.json and .sqlite: 8,364 pending references and 16 preserved legacy IDs.
- scripts/download-tesda-tr.py, scripts/build-tesda-source-manifest.py, scripts/build-unified-skills.py, and scripts/stage-unified-skills.py: resumable official-form download, deterministic manifests, hash-gated extraction and idempotent offline staging.

Nine focused offline tests passed: six extraction/staging, two downloader and one manifest-merger test. A separate stage check confirmed 395 documents, 8,364 pending rows, 16 legacy IDs, zero active skills and no active-skills table. Previously run matching/eligibility tests (53) passed before this source-download work; matching code was not changed here.

## Decisions before connected DEV import

Confirm TESDA and PSF rights for derived catalog labels and public redistribution; verify revision/supersession per document; repair and measure extraction coverage against each PDF's Section 1 unit list; review codes, titles, proficiency, duplicate placements and legacy mappings; approve an audited canonical-entry/alias activation workflow. Only then present a final DEV import manifest, counts and review controls for the separate approval already required by the goal.
