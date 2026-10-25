"""Prepare a conservative, offline TESDA skill review batch from pinned official PDFs."""
import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from pypdf import PdfReader


def compact(value):
    return re.sub(r"\s+", " ", value).strip()


def key(value):
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def source_version(page):
    header = compact(page[:500])
    edition = re.search(r"\b(?:Revision|Version)\s*(?:No\.?\s*)?\d{1,2}\b", header, re.I)
    event = re.search(
        r"\b(?:Promulgated|Amended|Revised)\s*\(?\s*"
        r"(?:\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}|"
        r"[A-Z][a-z]+\.?\s+(?:\d{1,2},?\s+)?(?:19|20)\d{2})\s*\)?", header, re.I)
    if not event:
        return ""
    return compact(" ".join(x.group() for x in (edition, event) if x))


def unit_on_page(page, source_code, expected_title):
    # Only accept a single local heading/code/descriptor block, not a table or nearby unit.
    pattern = re.compile(
        r"\b(?:UNIT\s+OF\s+COMPETENCY|UNIT\s+TITLE)\s*:\s*(.*?)"
        r"\bUNIT\s+CODE\s*:\s*([A-Z0-9]+)\s+"
        r"\b(?:UNIT\s+DESCRIPTOR|DESCRIPTOR)\s*:\s*(.*?)"
        r"\b(?:ELEMENTS?\b|PERFORMANCE\s+CRITERIA\b)", re.I | re.S)
    blocks = [m for m in pattern.finditer(page) if m.group(2).upper() == source_code]
    if len(blocks) != 1:
        return "", "unit_heading_code_descriptor_not_unique"
    title = compact(blocks[0].group(1))
    description = compact(blocks[0].group(3))
    if key(title) != key(expected_title):
        return "", "unit_title_disagrees_with_staged_record"
    if not (20 <= len(description) <= 600 and re.match(r"(?i)this unit\b", description)):
        return "", "unit_descriptor_ambiguous"
    return description, ""


def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def prepare(manifest, staged, csv_disposition, dev_skills, source_dir):
    sources = {s["id"]: s for s in manifest["sources"]}
    by_source = defaultdict(list)
    for row in staged["source_records"]:
        by_source[row["source_id"]].append(row)
    current_code_sources = defaultdict(set)
    current_title_codes = defaultdict(set)
    for row in staged["source_records"]:
        if row["source_kind"] == "tesda_tr" and sources[row["source_id"]]["status"] != "superseded":
            current_code_sources[row["source_code"]].add(row["source_id"])
            if row.get("source_title"):
                current_title_codes[key(row["source_title"])].add(row["source_code"])
    csv_by_name = defaultdict(list)
    for row in csv_disposition:
        if row["classification"] == "skill_candidate":
            csv_by_name[key(row["label"])].append(row["csv_id"])
    dev_by_name = {key(row["canonical_name"]): row["id"] for row in dev_skills}

    review, disposition = [], []
    checked_pdfs = 0
    for source_id in sorted(sources):
        source = sources[source_id]
        rows = sorted(by_source[source_id], key=lambda r: r["source_code"])
        if source["kind"] != "tesda_tr" or source["status"] == "superseded":
            state = "superseded" if source["status"] == "superseded" else "unresolved"
            reason = "superseded_source" if state == "superseded" else "psf_version_title_level_review"
            disposition.extend({"source_id": source_id, "source_code": r["source_code"],
                                "state": state, "reason": reason} for r in rows)
            continue
        path = source_dir / source["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Official PDF hash differs from pinned manifest: " + source_id)
        checked_pdfs += 1
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise ValueError("Encrypted source PDF: " + source_id)
        page_cache = {}
        for row in rows:
            code = row["source_code"]
            title = row.get("source_title", "")
            status, reason, description, version, page_number = "unresolved", "", "", "", 0
            if row["reference_status"] == "title_conflict":
                reason = "source_title_conflict"
            elif len(current_code_sources[code]) > 1 and source_id != "tesda-mmaw-ncii-2021":
                reason = "repeated_code_across_current_documents_no_canonical_merge"
            elif re.search(r"\bNC\s*[IVX]+\b", title, re.I):
                reason = "qualification_label_not_skill"
            else:
                for page_number in row["pages"]:
                    if not 1 <= page_number <= len(reader.pages):
                        raise ValueError("Out-of-range source page: " + source_id)
                    page_cache.setdefault(page_number, reader.pages[page_number - 1].extract_text() or "")
                    page = page_cache[page_number]
                    description, reason = unit_on_page(page, code, title)
                    if description:
                        version = source_version(page)
                        if not version:
                            reason = "printed_version_or_date_missing_on_unit_page"
                        elif key(source["title"]) not in key(page[:500]):
                            reason = "document_heading_not_confirmed_on_unit_page"
                        else:
                            status, reason = "ready_for_human_review", ""
                            break
                if not reason and status == "unresolved":
                    reason = "unit_not_verified_on_reported_pages"
            if status == "ready_for_human_review":
                existing = dev_by_name.get(key(title), "")
                review.append({
                    "review_id": source_id + ":" + code,
                    "skill_name": title,
                    "record_kind": "tesda_competency_unit_skill_candidate",
                    "source_document": source["title"],
                    "source_id": source_id,
                    "source_pdf_filename": source["file"],
                    "source_download_id": source.get("download_id", ""),
                    "source_listing_status": source["status"],
                    "source_code": code,
                    "printed_source_version": version,
                    "inventory_version_claim": source["version"],
                    "pdf_page": page_number,
                    "official_unit_descriptor": description,
                    "source_url": source["url"],
                    "source_pdf_sha256": source["sha256"],
                    "source_reuse_status": source["rights_status"],
                    "exact_csv_ids": ";".join(sorted(csv_by_name.get(key(title), []))),
                    "existing_dev_skill_id_exact_label": existing,
                    "supported_alias": "",
                    "alias_evidence": "",
                    "proposed_decision": "preserve_existing_id_review_mapping" if existing else "review_new_source_specific_skill",
                    "source_check": "same_pdf_page_title_code_descriptor_version_heading",
                    "human_approval": "pending",
                })
            disposition.append({"source_id": source_id, "source_code": code,
                                "state": status, "reason": reason})
    title_collisions = {row["review_id"] for row in review
                        if len(current_title_codes[key(row["skill_name"])]) > 1}
    if title_collisions:
        review = [row for row in review if row["review_id"] not in title_collisions]
        for row in disposition:
            if row["source_id"] + ":" + row["source_code"] in title_collisions:
                row["state"] = "unresolved"
                row["reason"] = "same_title_distinct_source_codes_no_canonical_merge"
    review.sort(key=lambda r: (r["source_id"], r["source_code"]))
    disposition.sort(key=lambda r: (r["source_id"], r["source_code"]))
    counts = dict(Counter(row["state"] for row in disposition))
    if len(disposition) != len(staged["source_records"]):
        raise ValueError("Every source record must have exactly one disposition")
    return review, disposition, {"source_records": len(disposition),
                                 "tesda_pdfs_hash_checked": checked_pdfs,
                                 "title_collision_rows_held": len(title_collisions),
                                 "state_counts": counts,
                                 "review_source_reuse_verified": sum(
                                     sources[r["source_id"]]["rights_status"] == "verified_with_acknowledgement"
                                     for r in review),
                                 "review_exact_existing_dev_labels": sum(bool(r["existing_dev_skill_id_exact_label"])
                                                                     for r in review),
                                 "review_exact_csv_labels": sum(bool(r["exact_csv_ids"]) for r in review)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root
    base = root / "artifacts" / "unified-skills-20261021"
    out = base / "approval-batch"
    read = lambda p: json.loads(p.read_text(encoding="utf-8"))
    source_manifest_path = base / "full-source-manifest.json"
    staged_path = base / "full-staged-source-records.json"
    baseline_path = base / "reconciliation" / "dev-skill-baseline-20261021.json"
    baseline = read(baseline_path)
    if baseline["project_id"] != "cdmkzzmaswwiryymtycn" or baseline["skill_count"] != 16:
        raise ValueError("Wrong connected DEV baseline")
    csv_rows = list(csv.DictReader((base / "reconciliation" / "csv-disposition.csv").open(encoding="utf-8-sig", newline="")))
    source_manifest = read(source_manifest_path)
    staged = read(staged_path)
    correction_path = out / "psf-page-186-correction.json"
    correction = read(correction_path)
    psf_source = next(s for s in source_manifest["sources"] if s["id"] == correction["source_id"])
    if correction["source_pdf_sha256"] != psf_source["sha256"]:
        raise ValueError("PSF correction PDF does not match pinned source")
    psf_rows = {(r["source_id"], r["source_code"]): r for r in staged["source_records"]}
    if any(psf_rows[(correction["source_id"], code)].get("source_title_candidate") != "Technical Report Writing"
           for code in correction["rejected_title_mapping_codes"]):
        raise ValueError("PSF title-mapping correction no longer matches extraction")
    review, disposition, counts = prepare(
        source_manifest, staged,
        csv_rows, read(root / "artifacts" / "taxonomy-milestone-20261014" / "dev-taxonomy-rows.json")["skills"],
        args.source_dir)
    out.mkdir(parents=True, exist_ok=True)
    write_csv(out / "review-sheet.csv", review, [
        "review_id", "skill_name", "record_kind", "source_document", "source_id",
        "source_pdf_filename", "source_download_id", "source_listing_status", "source_code",
        "printed_source_version", "inventory_version_claim", "pdf_page", "official_unit_descriptor", "source_url",
        "source_pdf_sha256", "source_reuse_status", "exact_csv_ids", "existing_dev_skill_id_exact_label",
        "supported_alias", "alias_evidence", "proposed_decision", "source_check", "human_approval"])
    write_csv(out / "source-batch-disposition.csv", disposition, ["source_id", "source_code", "state", "reason"])
    (out / "batch-counts.json").write_text(json.dumps(counts, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    proposal = {
        "state": "human_review_pending_no_connected_write",
        "target_project_id": baseline["project_id"],
        "review_row_count": len(review),
        "review_ids": [r["review_id"] for r in review],
        "source_documents_in_review": len({r["source_id"] for r in review}),
        "source_reuse_verified_rows": counts["review_source_reuse_verified"],
        "source_reuse_pending_rows": len(review) - counts["review_source_reuse_verified"],
        "immediate_inserts": 0, "immediate_activations": 0,
        "human_approved_rows": 0, "approved_aliases": 0,
        "rejected_source_records": 0,
        "rejected_extracted_psf_title_mappings": len(correction["rejected_title_mapping_codes"]),
        "csv_qualification_labels_excluded_from_skills": sum(
            r["classification"] == "qualification_label" for r in csv_rows),
        "csv_other_non_skill_labels_held": sum(
            r["classification"] not in ("qualification_label", "skill_candidate") for r in csv_rows),
        "dev_skill_id_digest_to_preserve": baseline["skill_ids_digest"],
        "dev_association_counts_to_preserve": baseline["association_counts"],
        "dev_association_digests_to_preserve": baseline["association_row_digests"],
        "review_sheet_sha256": digest(out / "review-sheet.csv"),
        "source_disposition_sha256": digest(out / "source-batch-disposition.csv"),
        "psf_correction_sha256": digest(correction_path),
        "input_sha256": {"source_manifest": digest(source_manifest_path),
                         "source_records": digest(staged_path),
                         "csv_snapshot": digest(base / "reconciliation" / "skills-original-20261021.csv"),
                         "dev_baseline": digest(baseline_path)},
        "duplicate_controls": [
            "unique review_id and source PDF SHA-256 plus code before staging",
            "no normalized-title conflict with existing or proposed skills",
            "no merge of shared codes or similar titles without an approved mapping",
            "retain source-specific code, document version, page and descriptor",
        ],
        "approval_gates": [
            "human review of each canonical name, descriptor, source mapping and proposed alias",
            "clear source reuse and publication-version questions for every selected row",
            "separate authorization of exact staged DEV writes, always is_active=false",
            "fresh DEV project, 16 skill IDs and association digest preflight",
            "no certification, qualification, PSOC equivalence, eligibility or ranking grant",
        ],
    }
    (out / "proposed-staged-import-manifest.json").write_text(
        json.dumps(proposal, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(counts, sort_keys=True))


if __name__ == "__main__":
    main()
