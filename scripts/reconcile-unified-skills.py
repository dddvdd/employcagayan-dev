"""Conservative, deterministic offline reconciliation of EMPLOYCagayan skills sources."""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

NC = re.compile(r"\bNC\s*[IVX]+\b", re.I)
FUNCTIONAL = re.compile(r"^([A-Z]{2,4})-([A-Z0-9]{2,8})-([1-6])(\d{3})-(\d(?:\.\d)?)$")
ENABLING = re.compile(r"^([A-Z]{2,4})-([A-Z0-9]{2,8})-([BIA])(\d{3})-(\d(?:\.\d)?)$")
SPECIAL_CSV = {"TRN-01": "training_program", "CON-13": "sector_topic",
               "TOU-06": "mixed_occupation_skill"}
MMAW_SCOPE = {
    **{str(code): "basic" for code in range(400311210, 400311219)},
    **{code: "common" for code in ("MEE721202", "MEE721210", "MEE721211", "MEE721205", "MEE721212")},
    **{code: "core" for code in ("MEE721321", "MEE721322", "MEE721324")},
}
CSV_OVERLAP_REVIEW = [
    ("AGR-01", "AGR-02", "overlapping_crop_production"),
    ("AGR-01", "AGR-03", "overlapping_crop_production"),
    ("AUT-01", "AUT-05", "general_vs_diesel_engine_servicing"),
    ("AUT-01", "AUT-06", "overlapping_engine_servicing"),
    ("AGR-12", "BUS-01", "agricultural_vs_general_entrepreneurship"),
    ("BUS-04", "CMC-03", "overlapping_small_team_leadership"),
    ("BC-01", "COM-13", "workplace_vs_public_communication"),
    ("CMC-01", "DIG-01", "overlapping_computer_literacy"),
    ("DIG-07", "EMR-12", "incident_handling_vs_awareness"),
    ("ELE-09", "ELE-10", "general_vs_installation_rac"),
    ("CON-09", "CON-10", "installation_vs_maintenance_solar"),
    ("TOU-01", "TOU-02", "overlapping_cooking_scope"),
]
OVERLAP_REVIEW = {
    "BC-01": ["Communication Skills"],
    "CMC-02": ["Customer Service"],
    "CMC-03": ["Team Leadership"],
    "BC-12": ["Filing & Records Management", "Document Management"],
    "CMC-04": ["Quality Control"],
    "CMC-01": ["Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint"],
}


def normalized(value):
    value = unicodedata.normalize("NFKC", value).casefold().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^\w+#]+", " ", value)).strip()


def stable_id(prefix, key):
    return prefix + ":" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:20]


def psf_family(row):
    code = row["source_code"]
    match = (FUNCTIONAL if row["record_kind"] == "functional_skill" else ENABLING).fullmatch(code)
    if not match:
        return row["source_id"] + "|unparsed|" + code, "", "psf_code_pattern_unverified"
    level = match[3] if row["record_kind"] == "functional_skill" else {
        "B": "basic", "I": "intermediate", "A": "advanced"}[match[3]]
    key = "|".join((row["source_id"], row["record_kind"], match[1], match[2], match[4], match[5]))
    return key, level, ""


def reconcile(csv_rows, companion, dev_rows, source_data, source_manifest, expected_dev_digest):
    if len(csv_rows) != 180 or len({r["id"] for r in csv_rows}) != 180:
        raise ValueError("Expected 180 unique CSV IDs")
    if len({normalized(r["name"]) for r in csv_rows}) != 180:
        raise ValueError("CSV names are not unique after conservative normalization")
    companion_by_id = {r["id"]: r for r in companion["skills"]}
    if len(companion_by_id) != 180:
        raise ValueError("Companion JSON does not contain 180 unique IDs")
    for row in csv_rows:
        other = companion_by_id.get(row["id"])
        if not other or other["name"] != row["name"] or len(other["aliases"]) != int(row["alias_count"]):
            raise ValueError("CSV and companion alias provenance disagree: " + row["id"])
    if len(dev_rows) != 16 or len({r["id"] for r in dev_rows}) != 16:
        raise ValueError("DEV snapshot must contain 16 unique skill IDs")
    digest = hashlib.md5(",".join(sorted(r["id"] for r in dev_rows)).encode()).hexdigest()
    if digest != expected_dev_digest:
        raise ValueError("DEV snapshot differs from freshly verified DEV ID digest")
    if source_data["summary"]["proposed_active_skills"] != 0:
        raise ValueError("Source extraction proposes active skills")
    sources = {s["id"]: s for s in source_manifest["sources"]}
    records = source_data["source_records"]
    if len(sources) != 395 or len(records) != 8364:
        raise ValueError("Expected complete 395-document, 8,364-record source set")
    if {s["id"] for s in source_data["sources"]} != set(sources):
        raise ValueError("Source document manifests disagree")
    if any(r["activation_status"] != "pending_review" or r["source_id"] not in sources for r in records):
        raise ValueError("Unreviewed or unlinked source record")
    if sorted(source_data["legacy_skill_ids"]) != sorted(r["id"] for r in dev_rows):
        raise ValueError("Existing DEV IDs were not preserved")

    dev_by_name = {normalized(r["canonical_name"]): r for r in dev_rows}
    candidates = [
        {"candidate_id": r["id"], "label": r["canonical_name"], "kind": "existing_dev_skill",
         "review_status": "existing_active_preserve", "existing_dev_id": r["id"]}
        for r in sorted(dev_rows, key=lambda r: r["id"])
    ]
    csv_disposition, qualification_labels, semantic_review = [], [], []
    csv_exceptions = []
    for row in csv_rows:
        label = row["name"]
        category = ("qualification_label" if NC.search(label)
                    else SPECIAL_CSV.get(row["id"], "skill_candidate"))
        existing = dev_by_name.get(normalized(label)) if category == "skill_candidate" else None
        cid = existing["id"] if existing else ("csv:" + row["id"] if category == "skill_candidate" else "")
        decision = ("exact_existing_label" if existing else
                    "provisional_skill_candidate" if category == "skill_candidate" else
                    "excluded_from_skill_candidates")
        entry = {"csv_id": row["id"], "label": label, "csv_type_claim": row["type"],
                 "nc_level_claim": row["nc_level"], "evidence_claim": row["evidence"],
                 "csv_validated_claim": row["validated"], "origin": row["origin"],
                 "classification": category, "candidate_id": cid,
                 "existing_dev_id": existing["id"] if existing else "", "decision": decision}
        csv_disposition.append(entry)
        if category == "qualification_label":
            qualification_labels.append(entry)
        elif category == "skill_candidate" and not existing:
            candidates.append({"candidate_id": cid, "label": label, "kind": "csv_skill_concept",
                               "review_status": "pending_official_source_review",
                               "existing_dev_id": "", "csv_id": row["id"]})
            csv_exceptions.append({"entity_type": "csv", "entity_id": row["id"],
                                   "issues": "official_skill_source_unverified", "source_id": "", "pages": ""})
        elif category != "skill_candidate":
            csv_exceptions.append({"entity_type": "csv", "entity_id": row["id"],
                                   "issues": category + "_review", "source_id": "", "pages": ""})
        if row["id"] in OVERLAP_REVIEW:
            for name in OVERLAP_REVIEW[row["id"]]:
                target = dev_by_name[normalized(name)]
                semantic_review.append({"csv_id": row["id"], "existing_dev_id": target["id"],
                                        "relationship": "possible_overlap_not_equivalence",
                                        "review_status": "unapproved"})
    csv_overlap_review = [
        {"left_csv_id": left, "right_csv_id": right, "relationship": relation,
         "review_status": "unapproved_no_merge"}
        for left, right, relation in CSV_OVERLAP_REVIEW
    ]
    index_titles = defaultdict(list)
    for source in sources.values():
        if source["kind"] == "tesda_tr":
            index_titles[normalized(source["title"])].append(source["download_id"])
    for entry in qualification_labels:
        entry["exact_tesda_index_ids"] = sorted(index_titles[normalized(entry["label"])])
        if not entry["exact_tesda_index_ids"]:
            csv_exceptions.append({"entity_type": "csv", "entity_id": entry["csv_id"],
                                   "issues": "qualification_index_title_unmatched",
                                   "source_id": "", "pages": ""})

    source_titles = defaultdict(list)
    for record in records:
        title = record.get("source_title") or record.get("source_title_candidate") or ""
        if title:
            source_titles[normalized(title)].append({
                "source_id": record["source_id"], "source_code": record["source_code"],
                "pages": record["pages"], "reference_status": record["reference_status"],
            })
    csv_source_alignment = []
    for entry in csv_disposition:
        label_key = normalized(entry["label"])
        csv_source_alignment.append({
            "csv_id": entry["csv_id"], "label": entry["label"],
            "classification": entry["classification"],
            "exact_extracted_title_references": sorted(
                source_titles[label_key], key=lambda r: (r["source_id"], r["source_code"])),
            "exact_tesda_document_ids": sorted(index_titles[label_key]),
            "relationship_status": "lexical_evidence_only_unapproved",
        })

    extracted_sources = {s["id"]: s for s in source_data["sources"]}
    document_review = []
    document_exceptions = []
    for source in sorted(sources.values(), key=lambda s: s["id"]):
        extracted = extracted_sources[source["id"]]
        issues = []
        if "unverified" in source["version"].lower():
            issues.append("document_version_unverified")
        if source["rights_status"] != "verified_with_acknowledgement":
            issues.append("source_reuse_review")
        if extracted["extracted_records"] == 0:
            issues.append("no_competency_or_skill_code_extracted")
        document_review.append({
            "source_id": source["id"], "kind": source["kind"], "title": source["title"],
            "status": source["status"], "version": source["version"],
            "rights_status": source["rights_status"], "sha256": source["sha256"],
            "pages": extracted["pages"], "extracted_records": extracted["extracted_records"],
            "issues": issues,
        })
        if issues:
            document_exceptions.append({
                "entity_type": "source_document", "entity_id": source["id"],
                "issues": ";".join(issues), "source_id": source["id"], "pages": "",
            })
    alias_review = []
    for row in csv_rows:
        for alias in companion_by_id[row["id"]]["aliases"]:
            alias_review.append({"csv_id": row["id"], "alias": alias,
                                 "classification": "qualification_title" if NC.search(alias)
                                                   else "unverified_course_or_alternative_title",
                                 "suggested_candidate_id": next(
                                     (d["candidate_id"] for d in csv_disposition if d["csv_id"] == row["id"]), ""),
                                 "approved": False})
    alias_review.sort(key=lambda r: (r["csv_id"], normalized(r["alias"]), r["alias"]))

    tesda_codes = {r["source_code"] for r in records if r["source_kind"] == "tesda_tr"}
    suspicious_codes = {code for code in tesda_codes
                        if any(other.startswith(code) and len(other) == len(code) + 1
                               for other in tesda_codes)}
    reference_groups = defaultdict(list)
    source_disposition, source_exceptions = [], []
    for row in records:
        source = sources[row["source_id"]]
        title = row.get("source_title") or row.get("source_title_candidate") or ""
        if row["source_kind"] == "tesda_tr":
            group_key = row["source_code"] + "|" + normalized(title)
            family_id = stable_id("tesda-ref", group_key)
            level = ""
            scope = MMAW_SCOPE.get(row["source_code"], "") if row["source_id"] == "tesda-mmaw-ncii-2021" else ""
            kind = "competency_unit_reference"
            family_issue = ""
        else:
            group_key, level, family_issue = psf_family(row)
            family_id = stable_id("psf-family", group_key)
            scope = ""
            kind = row["record_kind"] + "_proficiency_reference"
        issues = ["canonical_mapping_unapproved", "description_not_reviewed"]
        if "unverified" in source["version"].lower():
            issues.append("document_version_unverified")
        if source["rights_status"] != "verified_with_acknowledgement":
            issues.append("source_reuse_review")
        if source["status"] == "superseded":
            issues.append("superseded_source")
        if row["reference_status"] == "title_conflict":
            issues.append("source_title_conflict")
        if row["source_kind"] == "tesda_tr":
            if row["source_code"] in suspicious_codes:
                issues.append("possible_truncated_code")
            if not scope:
                issues.append("basic_common_core_scope_unverified")
            if row["reference_status"] != "verified_source":
                issues.append("unit_title_code_review")
        else:
            issues.append(family_issue or "psf_title_and_level_review")
            if not title:
                issues.append("missing_title_candidate")
        entry = {
            "source_id": row["source_id"], "source_code": row["source_code"],
            "source_title_or_candidate": title, "source_kind": row["source_kind"],
            "reference_kind": kind, "reference_group_id": family_id,
            "source_status": source["status"], "source_version": source["version"],
            "reference_status": row["reference_status"], "unit_scope": scope,
            "proficiency_level_inferred": level, "pages": ",".join(map(str, row["pages"])),
            "canonical_skill_id": "", "mapping_status": "unapproved",
            "issues": ";".join(dict.fromkeys(issues)),
        }
        source_disposition.append(entry)
        reference_groups[(kind, family_id)].append(entry)
        source_exceptions.append({"entity_type": "source_reference",
                                  "entity_id": row["source_id"] + ":" + row["source_code"],
                                  "issues": entry["issues"], "source_id": row["source_id"],
                                  "pages": entry["pages"]})

    groups = []
    for (kind, gid), entries in sorted(reference_groups.items()):
        groups.append({"reference_group_id": gid, "kind": kind,
                       "source_codes": sorted({e["source_code"] for e in entries}),
                       "source_ids": sorted({e["source_id"] for e in entries}),
                       "title_candidates": sorted({e["source_title_or_candidate"] for e in entries
                                                   if e["source_title_or_candidate"]}),
                       "placements": len(entries), "canonical_skill_id": "",
                       "review_status": "unapproved"})
    tesda_groups = [g for g in groups if g["kind"] == "competency_unit_reference"]
    psf_groups = [g for g in groups if g["kind"] != "competency_unit_reference"]
    by_code = defaultdict(set)
    for group in tesda_groups:
        for code in group["source_codes"]:
            by_code[code].add(group["reference_group_id"])
    exact_pairs = Counter(
        (r["source_code"], re.sub(r"\s+", " ", r["source_title_or_candidate"]).strip().casefold())
        for r in source_disposition if r["source_kind"] == "tesda_tr"
    )
    source_pair_duplicates = [g for g in tesda_groups if g["placements"] > 1]
    exceptions = source_exceptions + document_exceptions + csv_exceptions + [
        {"entity_type": "alias", "entity_id": r["csv_id"] + ":" + normalized(r["alias"]),
         "issues": "alias_unapproved;" + r["classification"],
         "source_id": "", "pages": ""} for r in alias_review]
    counts = {
        "existing_dev_skills_preserved": 16,
        "csv_rows": len(csv_rows),
        "csv_qualification_labels": len(qualification_labels),
        "csv_qualification_exact_index_titles": sum(bool(r["exact_tesda_index_ids"]) for r in qualification_labels),
        "csv_non_skill_review_labels": sum(r["classification"] in SPECIAL_CSV.values()
                                           for r in csv_disposition),
        "csv_skill_like_labels": sum(r["classification"] == "skill_candidate" for r in csv_disposition),
        "csv_exact_existing_links": sum(r["decision"] == "exact_existing_label" for r in csv_disposition),
        "csv_exact_extracted_title_labels": sum(bool(r["exact_extracted_title_references"])
                                                for r in csv_source_alignment),
        "csv_exact_extracted_title_reference_hits": sum(len(r["exact_extracted_title_references"])
                                                        for r in csv_source_alignment),
        "csv_exact_tesda_document_title_labels": sum(bool(r["exact_tesda_document_ids"])
                                                      for r in csv_source_alignment),
        "new_csv_skill_concept_candidates": sum(c["kind"] == "csv_skill_concept" for c in candidates),
        "canonical_working_candidates": len(candidates),
        "tesda_reference_groups": len(tesda_groups),
        "tesda_exact_repeated_code_title_groups": sum(n > 1 for n in exact_pairs.values()),
        "tesda_exact_extra_repeated_placements": sum(n - 1 for n in exact_pairs.values()),
        "tesda_repeated_code_title_groups": len(source_pair_duplicates),
        "tesda_extra_repeated_placements": sum(g["placements"] - 1 for g in source_pair_duplicates),
        "tesda_codes_with_multiple_title_groups": sum(len(v) > 1 for v in by_code.values()),
        "tesda_suspicious_prefix_codes": len(suspicious_codes),
        "psf_source_specific_families": len(psf_groups),
        "psf_families_without_title_candidate": sum(not g["title_candidates"] for g in psf_groups),
        "psf_families_with_conflicting_title_candidates": sum(len(g["title_candidates"]) > 1 for g in psf_groups),
        "psf_functional_families": sum(g["kind"] == "functional_skill_proficiency_reference" for g in psf_groups),
        "psf_enabling_families": sum(g["kind"] == "enabling_skill_proficiency_reference" for g in psf_groups),
        "companion_alias_suggestions": len(alias_review),
        "companion_qualification_aliases": sum(r["classification"] == "qualification_title" for r in alias_review),
        "approved_aliases": 0, "approved_source_to_skill_mappings": 0,
        "source_records_reconciled": len(source_disposition),
        "source_exceptions": len(source_exceptions),
        "document_review_exceptions": len(document_exceptions),
        "documents_version_unverified": sum("document_version_unverified" in d["issues"] for d in document_review),
        "documents_reuse_review": sum("source_reuse_review" in d["issues"] for d in document_review),
        "documents_zero_extraction": sum(d["extracted_records"] == 0 for d in document_review),
        "csv_overlap_suggestions": len(csv_overlap_review),
        "semantic_dev_overlap_suggestions": len(semantic_review),
        "total_exception_entities": len(exceptions),
        "proposed_active_skills": 0,
    }
    search_evaluation = []
    for query in ("welding", "MMAW", "communication", "agriculture",
                  "bookkeeping", "animation", "customer service"):
        term = query.casefold()
        active = [c for c in candidates if c["kind"] == "existing_dev_skill"
                  and term in c["label"].casefold()]
        provisional = [c for c in candidates if c["kind"] == "csv_skill_concept"
                       and term in c["label"].casefold()]
        references = [r for r in source_disposition
                      if term in r["source_title_or_candidate"].casefold()]
        qualification_only = [r for r in qualification_labels if term in r["label"].casefold()]
        source_documents = [s for s in sources.values() if term in s["title"].casefold()]
        search_evaluation.append({
            "query": query, "current_active_name_hits": len(active),
            "current_active_labels": [c["label"] for c in active],
            "provisional_csv_name_hits": len(provisional),
            "source_title_reference_hits": len(references),
            "qualification_labels_excluded": len(qualification_only),
            "source_document_title_hits_not_skills": len(source_documents),
            "ready_in_current_skill_search": bool(active),
            "review_status": "source_alias_or_activation_needed" if not active else "active_name_match",
        })
    return {
        "search_evaluation": search_evaluation,
        "document_review": document_review, "csv_overlap_review": csv_overlap_review,
        "counts": counts, "canonical_candidates": candidates,
        "csv_disposition": csv_disposition, "qualification_labels": qualification_labels,
        "csv_source_alignment": csv_source_alignment,
        "alias_review": alias_review, "semantic_review": semantic_review,
        "source_disposition": source_disposition, "source_reference_groups": groups,
        "exceptions": exceptions, "suspicious_codes": sorted(suspicious_codes),
    }


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_csv(path, rows):
    if not rows:
        raise ValueError("Cannot write empty CSV")
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(dict.fromkeys(k for row in rows for k in row)))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--csv-sha256", required=True)
    parser.add_argument("--companion", type=Path, required=True)
    parser.add_argument("--dev", type=Path, required=True)
    parser.add_argument("--dev-baseline", type=Path, required=True)
    parser.add_argument("--source-records", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if hashlib.sha256(args.csv.read_bytes()).hexdigest() != args.csv_sha256.lower():
        raise ValueError("Supplied CSV hash changed")
    with args.csv.open(encoding="utf-8-sig", newline="") as stream:
        csv_rows = list(csv.DictReader(stream))
    read = lambda path: json.loads(path.read_text(encoding="utf-8-sig"))
    baseline = read(args.dev_baseline)
    if baseline["project_id"] != "cdmkzzmaswwiryymtycn" or baseline["skill_count"] != 16:
        raise ValueError("Wrong DEV association baseline")
    result = reconcile(csv_rows, read(args.companion), read(args.dev)["skills"],
                       read(args.source_records), read(args.source_manifest),
                       baseline["skill_ids_digest"])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    names = {
        "canonical-candidates.json": result["canonical_candidates"],
        "csv-source-alignment.json": result["csv_source_alignment"],
        "source-reference-groups.json": result["source_reference_groups"],
        "qualification-labels.json": result["qualification_labels"],
        "semantic-overlap-review.json": result["semantic_review"],
        "search-compatibility.json": result["search_evaluation"],
        "document-review.json": result["document_review"],
        "csv-concept-overlap-review.json": result["csv_overlap_review"],
        "reconciliation-counts.json": result["counts"],
    }
    for filename, data in names.items():
        write_json(args.output_dir / filename, data)
    for filename, data in (
        ("csv-disposition.csv", result["csv_disposition"]),
        ("source-disposition.csv", result["source_disposition"]),
        ("alias-review.csv", result["alias_review"]),
        ("unresolved-exceptions.csv", result["exceptions"]),
    ):
        write_csv(args.output_dir / filename, data)
    artifacts = {filename: hashlib.sha256((args.output_dir / filename).read_bytes()).hexdigest()
                 for filename in sorted([*names, "csv-disposition.csv", "source-disposition.csv",
                                         "alias-review.csv", "unresolved-exceptions.csv"])}
    manifest = {
        "mode": "proposal_only_no_connected_write",
        "target_project_id": "cdmkzzmaswwiryymtycn",
        "csv_sha256": args.csv_sha256.lower(),
        "dev_skill_ids_digest": baseline["skill_ids_digest"],
        "counts": result["counts"],
        "existing_association_counts_from_read_only_dev": baseline["association_counts"],
        "existing_association_row_digests_from_read_only_dev": baseline["association_row_digests"],
        "proposed_connected_inserts": 0, "proposed_activations": 0,
        "ready_for_staged_dev_import": False,
        "approval_gates": [
            "verify TESDA and PSF source versions and reuse terms",
            "review source code, title, descriptor and competency scope",
            "resolve qualification and course labels without certification grants",
            "approve canonical concept, aliases and source mappings with audit history",
            "approve exact staged DEV import manifest separately",
        ],
        "artifact_sha256": artifacts,
    }
    write_json(args.output_dir / "proposed-import-manifest.json", manifest)
    print(json.dumps(result["counts"], sort_keys=True))


if __name__ == "__main__":
    main()



