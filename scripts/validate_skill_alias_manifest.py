#!/usr/bin/env python3
"""Offline ESCO v1.2.1 receipt and concept-label check before any staged import."""
import argparse
import csv
import hashlib
import json
import sys
import unicodedata
from pathlib import Path

EXPECTED_ZIP_SHA256 = "f9761b0b52be1828b38a3e5e0ae59a93a7b0ce358bc800f52f57a8b002adeb3e"


def norm(value):
    return " ".join("".join(
        character.lower() if character.isalnum() else " "
        for character in unicodedata.normalize("NFKC", value or "")
    ).split())


def validate(manifest, source_zip, skills_csv):
    actual = hashlib.sha256(source_zip.read_bytes()).hexdigest()
    if actual != EXPECTED_ZIP_SHA256:
        raise ValueError("ESCO ZIP is not the pinned v1.2.1 package")
    if not isinstance(manifest, list):
        raise ValueError("Manifest must be an array")
    official = {}
    with skills_csv.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            uri = row.get("conceptUri")
            if uri and (uri not in official or
                        (row.get("modifiedDate") or "") > (official[uri].get("modifiedDate") or "")):
                official[uri] = row
    for number, item in enumerate(manifest, 1):
        if item.get("alias_type") not in ("esco_preferred", "esco_alternative"):
            continue
        uri = item.get("external_concept_uri")
        row = official.get(uri)
        if not row or item.get("source_version") != "1.2.1" or (
            item.get("source_sha256") or ""
        ).lower() != EXPECTED_ZIP_SHA256:
            raise ValueError(f"Row {number}: URI, source version or receipt is unverified")
        labels = ([row.get("preferredLabel")] if item["alias_type"] == "esco_preferred"
                  else (row.get("altLabels") or "").splitlines())
        if norm(item.get("alias_text")) not in {norm(label) for label in labels if label}:
            raise ValueError(f"Row {number}: alias is not the stated official label")
    return len(manifest), len(official)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("source_zip", type=Path)
    parser.add_argument("skills_csv", type=Path)
    args = parser.parse_args()
    try:
        count, concepts = validate(
            json.loads(args.manifest.read_text(encoding="utf-8")),
            args.source_zip, args.skills_csv)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    print(f"VALID: {count} manifest rows; {concepts} pinned ESCO skill URIs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
