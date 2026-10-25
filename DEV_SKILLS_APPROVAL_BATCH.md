# EMPLOYCagayan skills approval batch — 21 October 2026

**Review decision:** 465 TESDA competency-unit labels are technically ready for **human review**, not human-approved or import-authorized. No new skill, alias, certificate, qualification, PSOC relationship, or matching-eligibility edge was activated. The [review sheet](artifacts/unified-skills-20261021/approval-batch/review-sheet.csv) gives the exact title, code, printed version/date, PDF page and hash, unit descriptor, proposed decision, and approval status. The [staged-import proposal](artifacts/unified-skills-20261021/approval-batch/proposed-staged-import-manifest.json) specifies zero immediate inserts and activations.

## Exact disposition

| Population | Ready for human review | Unresolved | Superseded | Rejected |
| --- | ---: | ---: | ---: | ---: |
| 8,364 TESDA/PSF extracted source-code records | **465** | **7,148** | **751** | **0 source records** |
| Extracted PSF title-to-code mapping proposals checked on page 186 | 0 | 0 | 0 | **3 false mappings**; the codes remain valid unresolved source records |
| 180 supplied CSV labels, separate classification | 0 automatically approved | 149 skill-like labels and 3 mixed/topic/program labels remain unapproved | 0 | **28 NC qualification labels excluded as skills** |

The 465 review rows come from 123 of the 323 hash-checked, index-non-superseded TESDA PDFs. Their title, code, descriptor, document heading, and printed version/date occur together on the cited page. They are 465 distinct normalized labels. The filter withheld 62 otherwise page-checked rows because the same label appears with different codes elsewhere in the current-listed corpus. It also withheld repeated codes across documents instead of assuming equivalence. The [complete disposition sheet](artifacts/unified-skills-20261021/approval-batch/source-batch-disposition.csv) gives a reason for each of the 8,364 references; 3,216 PSF references remain unresolved pending title/level/version review. The 751 superseded placements come from 61 TESDA PDFs marked superseded in the captured index.

**Source-use gate:** 11 review rows use the separately checked MMAW NC II source; 454 rows have `local research only; reuse review pending` in the source inventory. The batch is fit for offline human review, while **zero rows are cleared for connected import**. The sheet records the printed edition evidence and the separate inventory version claim; a printed promulgation month/date alone does not prove latest-publication status. Official indexes: [TESDA Training Regulations](https://www.tesda.gov.ph/Download/Training_Regulations) and [TESDA Philippine Skills Framework](https://www.tesda.gov.ph/About/TESDA/27898).

## CSV, PSF, aliases, and preservation

The original 180-row CSV is unchanged (SHA-256 `089c38d978adeb47ad4b3e7ad0067094473030708150d1723352b7de77107b90`). None of the 465 strict TESDA unit titles exactly matches a CSV label or existing DEV skill label. This is a **lexical** result, not proof that no concepts overlap. The prior 147 provisional CSV skill labels and 21 possible overlap relationships still require human semantic review. The 28 NC labels are qualifications, not possessed certifications or selectable skills; the other three non-skill/mixed CSV labels remain held. **Zero aliases are proposed as supported or approved:** the companion file's 461 fuzzy suggestions include 205 qualification-shaped names and cannot be adopted from name similarity.

Three CSV labels exactly match PSF headings—Critical Thinking, Digital Marketing, and Technical Report Writing—but their editions and reuse terms remain unverified. The visual [PSF page-186 correction](artifacts/unified-skills-20261021/approval-batch/psf-page-186-correction.json) rejects the prior assignment of `HIM-GMA-4004-1.1`, `5004-1.1`, and `6004-1.1` to Technical Report Writing: those codes belong to the adjacent **Strategy Planning** table. The three correct Technical Report Writing code placements are `HIM-GMA-2005-1.1`, `3005-1.1`, and `4005-1.1`; these are proficiency references, not separate skills or qualifications. No PSF row enters this approval batch yet.

Supabase DEV `cdmkzzmaswwiryymtycn` was independently rechecked read-only before the final proposal. It still has the same 16 skill IDs (digest `c303a7da06db3ff47fd04eb5d27dc06d`) and association counts/digests: six jobseeker, three vacancy, four occupation links. The manifest pins these values as future preflight invariants. No DEV record was changed.

## Approval and import controls

The proposed review decision on each row is **review new source-specific skill**; `human_approval=pending`. A reviewer must confirm the canonical meaning, descriptor quality, any CSV/DEV overlap, publication status, reuse permission, and any alias separately. Existing DEV IDs and links must be preserved if a concept is later mapped. A TESDA qualification title or NC level must not become an automatic credential claim. PSF proficiency codes must remain levels attached to a reviewed skill, not independent certifications.

Before any later, separately authorized staged import, compare the exact [manifest](artifacts/unified-skills-20261021/approval-batch/proposed-staged-import-manifest.json) hashes and selected review IDs; reverify the DEV project, 16 IDs and association digests; enforce unique source PDF hash plus code and normalized-title checks; and stage approved new records with `is_active=false`. Existing `public.skills` has a unique normalized-name index and defaults `is_active=true`, so an importer must explicitly set inactivity. `taxonomy_sources` and `taxonomy_mappings` exist, but their mapping semantics and review audit trail require approval before use. Search, ranking and eligibility remain unchanged.

The local runner is `scripts/prepare-skills-approval-batch.py`. Four focused reconciliation/batch tests pass; the batch and manifest regenerated byte-identically. Visual spot checks confirmed a welding unit, a biogas unit, an animal-production unit, and the two-column PSF correction. No connected write, app-code edit, commit, push, deployment, or Production operation occurred.
