#!/usr/bin/env python3
"""Build an offline, review-only skills register. No network or database writes."""
import argparse
import collections
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artifacts/unified-skills-20261021"
OUTPUT = SOURCE / "master-register"
DEFAULT_BASE = SOURCE / "master-register"
FIELDS = [
    "record_key", "record_kind", "candidate_key", "candidate_status", "classification",
    "canonical_label_or_source_title", "source_id", "source_document", "source_code",
    "reference_group_id", "proficiency_level", "source_pages", "source_status",
    "inventory_source_version", "printed_source_version", "source_url", "source_pdf_filename",
    "source_download_id", "source_pdf_sha256",
    "source_reuse_status", "official_unit_descriptor", "source_reference_status",
    "source_mapping_status", "review_id", "review_decision", "review_approval",
    "csv_id", "csv_original_label", "csv_type_claim", "csv_nc_level_claim",
    "csv_validated_claim", "csv_evidence_claim", "alias_candidate_count", "overlap_candidate_keys",
    "dev_skill_id", "dev_record_json", "occupation_record_json",
    "deepseek_skill_id", "deepseek_name_claim", "deepseek_status_claim",
    "deepseek_granularity_claim", "deepseek_active_claim", "deepseek_merged_from_claim",
    "alias_status", "activation_proposal", "issues",
]

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def norm(value):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()

def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

def require_unique(rows, key):
    result = {}
    for row in rows:
        k = key(row)
        if k in result:
            raise ValueError(f"Duplicate join key: {k}")
        result[k] = row
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-json", type=Path, default=DEFAULT_BASE / "input-skills-base.json")
    parser.add_argument("--base-csv", type=Path, default=DEFAULT_BASE / "input-skills-base.csv")
    args = parser.parse_args()

    paths = {
        "dev_snapshot": ROOT / "artifacts/taxonomy-milestone-20261014/dev-taxonomy-rows.json",
        "dev_baseline": SOURCE / "reconciliation/dev-skill-baseline-20261021.json",
        "source_manifest": SOURCE / "full-source-manifest.json",
        "source_records": SOURCE / "full-staged-source-records.json",
        "source_disposition": SOURCE / "reconciliation/source-disposition.csv",
        "source_groups": SOURCE / "reconciliation/source-reference-groups.json",
        "source_batch_disposition": SOURCE / "approval-batch/source-batch-disposition.csv",
        "review_sheet": SOURCE / "approval-batch/review-sheet.csv",
        "original_csv": SOURCE / "reconciliation/skills-original-20261021.csv",
        "csv_disposition": SOURCE / "reconciliation/csv-disposition.csv",
        "prior_exceptions": SOURCE / "reconciliation/unresolved-exceptions.csv",
        "alias_review": SOURCE / "reconciliation/alias-review.csv",
        "dev_overlap_review": SOURCE / "reconciliation/semantic-overlap-review.json",
        "csv_overlap_review": SOURCE / "reconciliation/csv-concept-overlap-review.json",
        "deepseek_json": args.base_json,
        "deepseek_csv": args.base_csv,
    }
    for name, path in paths.items():
        if not path.is_file():
            raise FileNotFoundError(f"{name}: {path}")
    assert digest(paths["original_csv"]) == "089c38d978adeb47ad4b3e7ad0067094473030708150d1723352b7de77107b90"
    assert digest(paths["deepseek_json"]) == "f6ec02d7bd434190f1362908449c40554496ab520ebb641b1be0d8b1f68f0e37"
    assert digest(paths["deepseek_csv"]) == "74141429d445a565a37d9906c6b60fe602b211d15b3749b2d8726a144f603d9e"
    dev_snapshot = read_json(paths["dev_snapshot"])
    dev = dev_snapshot["skills"]
    occupations = dev_snapshot["occupations"]
    baseline = read_json(paths["dev_baseline"])
    source = read_json(paths["source_records"])["source_records"]
    docs = require_unique(read_json(paths["source_manifest"])["sources"], lambda x: x["id"])
    disposition = require_unique(read_csv(paths["source_disposition"]), lambda x: (x["source_id"], x["source_code"]))
    batch = require_unique(read_csv(paths["source_batch_disposition"]), lambda x: (x["source_id"], x["source_code"]))
    review = require_unique(read_csv(paths["review_sheet"]), lambda x: (x["source_id"], x["source_code"]))
    csv_original = require_unique(read_csv(paths["original_csv"]), lambda x: x["id"])
    csv_disposition = require_unique(read_csv(paths["csv_disposition"]), lambda x: x["csv_id"])
    groups = read_json(paths["source_groups"])
    prior_exceptions = read_csv(paths["prior_exceptions"])
    aliases = read_csv(paths["alias_review"])
    dev_overlaps = read_json(paths["dev_overlap_review"])
    csv_overlaps = read_json(paths["csv_overlap_review"])
    alias_by_csv = collections.Counter(x["csv_id"] for x in aliases)
    overlap_by_csv = collections.defaultdict(list)
    for x in dev_overlaps:
        overlap_by_csv[x["csv_id"]].append("dev:" + x["existing_dev_id"])
    for x in csv_overlaps:
        overlap_by_csv[x["left_csv_id"]].append("csv:" + x["right_csv_id"])
        overlap_by_csv[x["right_csv_id"]].append("csv:" + x["left_csv_id"])
    ds_json = read_json(paths["deepseek_json"])
    ds_csv = read_csv(paths["deepseek_csv"])
    ds_by_id = require_unique(ds_json["skills"], lambda x: x["id"])
    ds_meta = require_unique(ds_csv, lambda x: x["skill_id"])
    ds_by_name = require_unique(ds_csv, lambda x: norm(x["canonical_name"]))
    ds_by_review_provenance = require_unique((x for x in ds_csv if x["granularity"] == "competency_unit"), lambda x: (x["source_documents"], x["evidence"]))
    dev_by_id = require_unique(dev, lambda x: x["id"])
    source_by_key = require_unique(source, lambda x: (x["source_id"], x["source_code"]))
    group_by_source = {}
    for group in groups:
        for sid in group["source_ids"]:
            for code in group["source_codes"]:
                key = (sid, code)
                if key in group_by_source:
                    raise ValueError(f"Ambiguous source group: {key}")
                group_by_source[key] = group

    assert len(dev) == baseline["skill_count"] == 16
    assert len(occupations) == 10 and len(aliases) == 461 and len(dev_overlaps) + len(csv_overlaps) == 21
    for key in ("aliases", "mappings", "occupations", "occupation_skills"):
        if dev_snapshot[key] != ds_json[key]:
            raise ValueError(f"DeepSeek changed existing DEV {key}")
    assert len(ds_json.get("skill_aliases", [])) == 1
    assert len(source) == len(disposition) == len(batch) == len(group_by_source) == 8364
    assert len(docs) == 395 and len(review) == 465
    assert len(csv_original) == len(csv_disposition) == 180
    assert len(ds_by_id) == len(ds_meta) == len(ds_by_name) == 658
    assert set(ds_by_id) == set(ds_meta)
    for sid, row in ds_by_id.items():
        meta = ds_meta[sid]
        for key, column in (("canonical_name", "canonical_name"), ("normalized_name", "normalized_name"), ("skill_type", "skill_type")):
            if row[key] != meta[column]:
                raise ValueError(f"DeepSeek JSON/CSV mismatch: {sid} {key}")
    if set(dev_by_id) - set(ds_by_id):
        raise ValueError("Original DEV ID missing from DeepSeek file")

    rows = []
    mapped_ds = set()
    dev_drift = {}
    for item in sorted(dev, key=lambda x: x["id"]):
        sid = item["id"]
        dm = ds_meta[sid]
        mapped_ds.add(sid)
        drift = [k for k, value in item.items() if ds_by_id[sid].get(k) != value]
        if drift:
            dev_drift[sid] = drift
        row = {k: "" for k in FIELDS}
        row.update(
            record_key=f"dev:{sid}", record_kind="existing_dev_skill",
            candidate_key=sid, candidate_status="existing_dev_active_preserve_exact",
            classification="skill", canonical_label_or_source_title=item["canonical_name"],
            dev_skill_id=sid, dev_record_json=json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            deepseek_skill_id=sid, deepseek_name_claim=dm["canonical_name"],
            deepseek_status_claim=dm["status"], deepseek_granularity_claim=dm["granularity"],
            deepseek_active_claim=str(ds_by_id[sid]["is_active"]).lower(),
            deepseek_merged_from_claim=dm["merged_from"], alias_status="unapproved" if dm["merged_from"] else "",
            activation_proposal="preserve_existing_only", issues="deepseek_original_record_drift" if drift else "",
        )
        rows.append(row)

    for item in sorted(occupations, key=lambda x: x["id"]):
        row = {k: "" for k in FIELDS}
        row.update(record_key=f"occupation:{item['id']}", record_kind="existing_dev_occupation_context",
                   candidate_status="existing_occupation_not_skill", classification="occupation",
                   canonical_label_or_source_title=item["canonical_name"],
                   occupation_record_json=json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                   activation_proposal="preserve_existing_only")
        rows.append(row)

    csv_ds_link = {}
    for cid, original in sorted(csv_original.items()):
        decision = csv_disposition[cid]
        if original["name"] != decision["label"]:
            raise ValueError(f"CSV/disposition label mismatch: {cid}")
        key = norm(original["name"])
        match = ds_by_name.get(key)
        if match is None and decision["classification"] == "qualification_label":
            stem = re.sub(r"\s+NC\s+[IVX]+\s*$", "", original["name"], flags=re.I)
            match = ds_by_name.get(norm(stem))
        if match is None and cid == "CMC-02":
            match = next((x for x in ds_csv if norm(x["merged_from"]) == key), None)
        if match is None and cid == "HLT-06":
            stem = re.sub(r"\s+Level\s+II\s*$", "", original["name"], flags=re.I)
            match = ds_by_name.get(norm(stem))
        if match is None:
            raise ValueError(f"Unmapped original CSV record: {cid}")
        sid = match["skill_id"]
        csv_ds_link[cid] = sid
        mapped_ds.add(sid)
        classification = decision["classification"]
        candidate = decision["candidate_id"] if classification == "skill_candidate" else ""
        if decision["existing_dev_id"]:
            candidate = decision["existing_dev_id"]
        issues = ["human_skill_classification_unapproved"]
        if classification == "qualification_label":
            issues = ["qualification_not_skill", "deepseek_nc_suffix_removed"]
        elif classification != "skill_candidate":
            issues = ["non_skill_or_mixed_label_held"]
        if cid == "CMC-02":
            issues.append("deepseek_alias_merge_unapproved")
        if cid == "HLT-06":
            issues.append("deepseek_level_suffix_removed")
        row = {k: "" for k in FIELDS}
        row.update(
            record_key=f"csv:{cid}", record_kind=f"original_csv_{classification}",
            candidate_key=candidate, candidate_status=(
                "existing_dev_exact_label" if decision["existing_dev_id"] else
                "provisional_unapproved" if classification == "skill_candidate" else "held_not_skill"
            ),
            classification=classification, canonical_label_or_source_title=original["name"],
            csv_id=cid, csv_original_label=original["name"], csv_type_claim=original["type"],
            csv_nc_level_claim=original["nc_level"], csv_validated_claim=original["validated"],
            csv_evidence_claim=original["evidence"], alias_candidate_count=str(alias_by_csv[cid]),
            overlap_candidate_keys="|".join(sorted(set(overlap_by_csv[cid]))),
            deepseek_skill_id=sid, deepseek_name_claim=match["canonical_name"],
            deepseek_status_claim=match["status"], deepseek_granularity_claim=match["granularity"],
            deepseek_active_claim=str(ds_by_id[sid]["is_active"]).lower(),
            deepseek_merged_from_claim=match["merged_from"], alias_status="unapproved" if match["merged_from"] else "",
            activation_proposal="none", issues=";".join(issues),
        )
        rows.append(row)

    for key, item in sorted(source_by_key.items()):
        d = disposition[key]
        b = batch[key]
        doc = docs[item["source_id"]]
        group = group_by_source[key]
        rv = review.get(key)
        if rv:
            if rv["skill_name"] != d["source_title_or_candidate"] or rv["source_pdf_sha256"] != doc["sha256"]:
                raise ValueError(f"Review/source provenance mismatch: {key}")
            dm = ds_by_review_provenance.get((rv["source_document"], f"{rv['source_code']} p.{rv['pdf_page']}"))
            if dm is None:
                raise ValueError(f"DeepSeek review mapping missing: {key}")
            sid = dm["skill_id"]
            mapped_ds.add(sid)
        else:
            dm, sid = None, ""
        if bool(rv) != (b["state"] == "ready_for_human_review"):
            raise ValueError(f"Review disposition mismatch: {key}")
        row = {k: "" for k in FIELDS}
        row.update(
            record_key=f"source:{item['source_id']}:{item['source_code']}",
            record_kind="tesda_competency_reference" if item["source_kind"] == "tesda_tr" else "psf_proficiency_reference",
            candidate_key=f"tesda-review:{rv['review_id']}" if rv else "",
            candidate_status="page_checked_human_review_pending" if rv else b["state"],
            classification=rv["record_kind"] if rv else item["record_kind"],
            canonical_label_or_source_title=item.get("source_title", item.get("source_title_candidate", "")),
            source_id=item["source_id"], source_document=doc["title"], source_code=item["source_code"],
            reference_group_id=group["reference_group_id"],
            proficiency_level=d["proficiency_level_inferred"], source_pages="|".join(map(str, item["pages"])),
            source_status=doc["status"], inventory_source_version=doc["version"],
            printed_source_version=rv["printed_source_version"] if rv else "",
            source_url=doc["url"], source_pdf_filename=doc["file"],
            source_download_id=str(doc.get("download_id", "")), source_pdf_sha256=doc["sha256"],
            source_reuse_status=rv["source_reuse_status"] if rv else doc["rights_status"],
            official_unit_descriptor=rv["official_unit_descriptor"] if rv else "",
            source_reference_status=d["reference_status"], source_mapping_status=d["mapping_status"],
            review_id=rv["review_id"] if rv else "", review_decision=rv["proposed_decision"] if rv else "",
            review_approval=rv["human_approval"] if rv else "",
            deepseek_skill_id=sid, deepseek_name_claim=dm["canonical_name"] if dm else "",
            deepseek_status_claim=dm["status"] if dm else "",
            deepseek_granularity_claim=dm["granularity"] if dm else "",
            deepseek_active_claim=str(ds_by_id[sid]["is_active"]).lower() if sid else "",
            activation_proposal="none", issues=d["issues"],
        )
        rows.append(row)
    if mapped_ds != set(ds_by_id):
        raise ValueError(f"Unmapped DeepSeek IDs: {len(set(ds_by_id) - mapped_ds)}")
    assert len(rows) == 16 + 10 + 180 + 8364 == 8570
    assert len({row["record_key"] for row in rows}) == len(rows)
    assert len({row["candidate_key"] for row in rows if row["candidate_key"]}) == 628
    assert collections.Counter(x["classification"] for x in rows if x["csv_id"]) == {
        "skill_candidate": 149, "qualification_label": 28, "sector_topic": 1,
        "mixed_occupation_skill": 1, "training_program": 1,
    }
    assert collections.Counter(x["candidate_status"] for x in rows if x["source_id"]) == {
        "page_checked_human_review_pending": 465, "unresolved": 7148, "superseded": 751,
    }

    exceptions = list(prior_exceptions)
    existing_exceptions = {(x["entity_type"], x["entity_id"]) for x in exceptions}
    for sid, dm in sorted(ds_meta.items()):
        issues = []
        if sid not in dev_by_id and ds_by_id[sid]["is_active"]:
            issues.append("unsupported_active_claim")
        if dm["status"] == "imported":
            issues.append("unsupported_imported_claim")
        if sid in dev_drift:
            issues.append("original_dev_fields_differ_in_deepseek_output")
        if dm["merged_from"]:
            issues.append("unapproved_alias_merge")
        if dm["granularity"] == "competency_unit":
            rv = next((r for r in review.values() if (r["source_document"], f"{r['source_code']} p.{r['pdf_page']}") == (dm["source_documents"], dm["evidence"])), None)
            if rv and norm(rv["skill_name"]) != norm(dm["canonical_name"]):
                issues.append("deepseek_title_differs_from_source")
        if dm["granularity"] == "qualification":
            linked = [csv_disposition[cid] for cid, linked_sid in csv_ds_link.items() if linked_sid == sid]
            if linked and linked[0]["classification"] != "qualification_label":
                issues.append("deepseek_qualification_classification_unverified")
            elif linked:
                issues.append("qualification_suffix_removed")
        if issues:
            key = ("deepseek", sid)
            if key in existing_exceptions:
                raise ValueError(f"Duplicate exception: {key}")
            exceptions.append(dict(entity_type="deepseek", entity_id=sid, issues=";".join(issues), source_id="", pages=""))
            existing_exceptions.add(key)
    exceptions.sort(key=lambda x: (x["entity_type"], x["entity_id"]))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    register_path = OUTPUT / "master-skills-register.csv"
    exception_path = OUTPUT / "master-skills-exceptions.csv"
    manifest_path = OUTPUT / "master-skills-import-proposal.json"
    write_csv(register_path, FIELDS, rows)
    write_csv(exception_path, ["entity_type", "entity_id", "issues", "source_id", "pages"], exceptions)

    manifest = {
        "schema_version": 1,
        "project_id": "cdmkzzmaswwiryymtycn",
        "mode": "offline_review_only",
        "unit_of_register": "one DEV row, original CSV row, or official source-code placement; DeepSeek and review sheet are joined metadata, not added records",
        "input_sha256": {name: digest(path) for name, path in sorted(paths.items())},
        "output_sha256": {"master-skills-register.csv": digest(register_path), "master-skills-exceptions.csv": digest(exception_path)},
        "counts": {
            "register_rows": len(rows), "existing_dev_skills": 16, "existing_dev_occupations": 10, "original_csv_rows": 180,
            "tesda_psf_source_placements": 8364, "source_documents": len(docs),
            "tesda_documents": sum(d["kind"] == "tesda_tr" for d in docs.values()),
            "psf_documents": sum(d["kind"] == "psf" for d in docs.values()),
            "documents_with_extracted_references": len({x["source_id"] for x in source}),
            "documents_without_extracted_references": len(docs) - len({x["source_id"] for x in source}),
            "separate_review_candidate_keys": 628, "existing_dev_candidate_keys": 16,
            "provisional_csv_new_skill_keys": 147, "page_checked_tesda_candidate_keys": 465,
            "confirmed_unique_new_skill_concepts": 0,
            "csv_qualification_labels_held": 28, "csv_other_non_skill_labels_held": 3,
            "psf_source_specific_proficiency_families": sum(g["kind"].startswith(("enabling_", "functional_")) for g in groups),
            "deepseek_rows_joined_without_addition": len(ds_by_id),
            "source_review_ready": 465, "source_unresolved": 7148, "source_superseded": 751,
            "human_approved_new_skills": 0, "approved_aliases": 0, "approved_source_skill_mappings": 0,
            "unapproved_original_alias_suggestions": len(aliases), "unapproved_deepseek_alias_merges": 1,
            "unapproved_possible_semantic_overlaps": len(dev_overlaps) + len(csv_overlaps),
            "deepseek_title_differences_from_checked_tesda": sum("deepseek_title_differs_from_source" in x["issues"] for x in exceptions if x["entity_type"] == "deepseek"),
            "exact_csv_existing_dev_label_links": 2,
            "connected_inserts_authorized": 0, "activations_authorized": 0, "exception_rows": len(exceptions),
        },
        "duplicate_and_alias_policy": "Exact label links preserve DEV IDs; repeated codes, similar titles, fuzzy aliases, and DeepSeek merges establish no semantic equivalence.",
        "dev_preservation": {
            "expected_ids": sorted(dev_by_id),
            "id_digest": baseline["skill_ids_digest"],
            "association_counts": baseline["association_counts"],
            "association_row_digests": baseline["association_row_digests"],
            "original_row_json_in_register": True,
            "deepseek_rows_with_original_field_drift": dev_drift,
        },
        "review_gates": [
            "Verify source publication identity, version, current or superseded status, PDF hash, and permitted reuse.",
            "Review each candidate's skill-versus-qualification-versus-occupation meaning and descriptor.",
            "Decide all source mappings, aliases, duplicate or semantic equivalence claims independently; retain decision history.",
            "Freeze a selected-row manifest with reviewer decisions and reverify the DEV project, all 16 rows and association digests.",
            "Obtain separate DEV import authorization; explicitly stage approved records inactive, then seek separate activation approval.",
        ],
        "import_proposal": {
            "selected_new_skill_ids": [], "selected_source_reference_ids": [],
            "selected_aliases": [], "connected_writes": 0, "activations": 0,
            "matching_eligibility_changes": 0, "certification_grants": 0,
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "register_rows": len(rows), "review_candidate_keys": 628,
        "source_states": manifest["counts"]["source_review_ready"], "exceptions": len(exceptions),
        "deepseek_joined": len(mapped_ds), "dev_drift": dev_drift,
        "register_sha256": digest(register_path), "exceptions_sha256": digest(exception_path),
    }, sort_keys=True))

if __name__ == "__main__":
    main()

