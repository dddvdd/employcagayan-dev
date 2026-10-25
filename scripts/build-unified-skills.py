"""Build a local-only, review-first TESDA/PSF skills source manifest."""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from pypdf import PdfReader

TESDA_UNIT = re.compile(
    r"UNIT\s+(?:OF\s+COMPETENCY|TITLE)\s*:\s*(.*?)\s+UNIT\s+CODE\s*:\s*([A-Z0-9]+)",
    re.I | re.S,
)
PSF_CODE = re.compile(r"\b[A-Z]{2,4}-[A-Z0-9]{2,8}-[A-Z0-9]{4}-[0-9](?:\.[0-9])?\b")
SPACE = re.compile(r"\s+")


def compact(value):
    return SPACE.sub(" ", value).strip()


def heading_before_code(text):
    marker = re.search(r"\b(?:FSC|ESC|ECS)\s+Code\b", text, re.I)
    if not marker:
        return None
    lines = [compact(line) for line in text[:marker.start()].splitlines()]
    for line in lines[:12]:
        if not 4 <= len(line) <= 60 or line == line.upper() or not line[0].isupper():
            continue
        if line.lower().startswith(("continue", "fsc ", "esc ", "proficiency", "skills and", "functional ", "enabling ")):
            continue
        if line.endswith((".", ":", ";")) or len(line.split()) > 5:
            continue
        return line
    return None


def extract_tesda(reader, source):
    rows = {}
    for page_no, page in enumerate(reader.pages, 1):
        for match in TESDA_UNIT.finditer(page.extract_text() or ""):
            title = compact(match.group(1))
            code = match.group(2).upper()
            if len(title) > 180 or not re.fullmatch(r"[A-Z0-9]{8,12}", code):
                continue
            row = rows.setdefault(code, {
                "source_id": source["id"], "source_kind": "tesda_tr",
                "source_code": code, "source_title": title,
                "record_kind": "competency_unit", "pages": [],
                "reference_status": ("verified_source" if source["status"] == "current"
                    and source.get("rights_status") == "verified_with_acknowledgement"
                    and "unverified" not in source.get("version", "").lower()
                    else "superseded_source" if source["status"] == "superseded"
                    else "source_review_needed"),
                "activation_status": "pending_review",
            })
            if title != row["source_title"]:
                row["reference_status"] = "title_conflict"
            row["pages"].append(page_no)
    return list(rows.values())


def extract_psf(reader, source):
    rows = {}
    for page_no, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        marker = re.search(r"\b(FSC|ESC|ECS)\s+Code\b", text, re.I)
        if not marker:
            continue
        kind = "enabling_skill" if marker.group(1).upper() in ("ESC", "ECS") else "functional_skill"
        title = heading_before_code(text)
        for code in set(PSF_CODE.findall(text[marker.end():])):
            row = rows.setdefault(code, {
                "source_id": source["id"], "source_kind": "psf",
                "source_code": code, "source_title_candidate": title,
                "record_kind": kind, "pages": [],
                "reference_status": "needs_title_review",
                "activation_status": "pending_review",
            })
            if row["source_title_candidate"] is None and title:
                row["source_title_candidate"] = title
            if row["record_kind"] != kind:
                row["reference_status"] = "kind_conflict"
            row["pages"].append(page_no)
    return list(rows.values())


def build(manifest, source_dir, existing):
    sources, rows = [], []
    ids = set()
    for source in manifest["sources"]:
        if source["kind"] not in ("tesda_tr", "psf"):
            raise ValueError("Unsupported source kind")
        if source["id"] in ids:
            raise ValueError("Duplicate source ID: " + source["id"])
        ids.add(source["id"])
        filename = Path(source["file"])
        if filename.name != source["file"] or filename.suffix.lower() != ".pdf":
            raise ValueError("Source file must be a local PDF basename")
        path = source_dir / filename
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != source["sha256"].lower():
            raise ValueError("PDF hash mismatch: " + source["id"])
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise ValueError("Encrypted PDF: " + source["id"])
        extracted = extract_tesda(reader, source) if source["kind"] == "tesda_tr" else extract_psf(reader, source)
        sources.append({**source, "pages": len(reader.pages), "extracted_records": len(extracted)})
        rows.extend(extracted)
    existing_rows = existing["skills"] if isinstance(existing, dict) else existing
    legacy_ids = [row["id"] for row in existing_rows]
    if len(legacy_ids) != len(set(legacy_ids)):
        raise ValueError("Duplicate legacy skill ID")
    by_code, by_title = defaultdict(set), defaultdict(set)
    for row in rows:
        by_code[row["source_code"]].add(row["source_id"])
        title = row.get("source_title") or row.get("source_title_candidate")
        if title:
            by_title[compact(title).casefold()].add(row["source_code"])
    existing_titles = {compact(row["canonical_name"]).casefold() for row in existing_rows}
    duplicates = {code: sorted(sources) for code, sources in by_code.items() if len(sources) > 1}
    title_collisions = {name: sorted(codes) for name, codes in by_title.items() if len(codes) > 1}
    counts = Counter(row["source_kind"] for row in rows)
    review = sum(row["reference_status"] != "verified_source" for row in rows)
    summary = {
        "source_documents": dict(Counter(source["kind"] for source in sources)),
        "source_records": dict(counts),
        "unique_source_codes": len(by_code),
        "duplicate_codes_across_documents": len(duplicates),
        "shared_title_candidate_groups": len(title_collisions),
        "psf_codes_without_title_candidate": sum(
            not row.get("source_title_candidate") for row in rows if row["source_kind"] == "psf"
        ),
        "records_requiring_reference_review": review,
        "current_tesda_reference_rows_proposed_for_staging": sum(
            row["reference_status"] == "verified_source" for row in rows
        ),
        "proposed_active_skills": 0,
        "existing_skills_preserved": len(legacy_ids),
        "legacy_title_collisions_for_review": sum(name in existing_titles for name in by_title),
    }
    rows.sort(key=lambda row: (row["source_id"], row["source_code"]))
    sources.sort(key=lambda source: source["id"])
    return {"summary": summary, "sources": sources, "source_records": rows,
            "duplicate_codes": duplicates, "shared_title_candidate_groups": title_collisions,
            "legacy_skill_ids": sorted(legacy_ids)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--existing", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = build(json.loads(args.manifest.read_text(encoding="utf-8-sig")),
                   args.source_dir, json.loads(args.existing.read_text(encoding="utf-8-sig")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                           encoding="utf-8")
    print(json.dumps(result["summary"], sort_keys=True))


if __name__ == "__main__":
    main()


