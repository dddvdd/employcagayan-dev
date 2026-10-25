"""Combine complete TESDA form downloads with existing PSF source references."""
import argparse
import json
from pathlib import Path


def combine(index, downloads, previous):
    items = index["items"]
    fetched = {str(row["download_id"]): row for row in downloads["downloaded"]}
    if downloads["failures"] or len(fetched) != len(items):
        raise ValueError("Complete, failure-free TESDA download manifest required")
    old_tesda = {row["sha256"]: row for row in previous["sources"] if row["kind"] == "tesda_tr"}
    sources = [row for row in previous["sources"] if row["kind"] == "psf"]
    ids = {row["id"] for row in sources}
    for item in items:
        row = fetched[str(item["download_id"])]
        old = old_tesda.get(row["sha256"])
        reuse_old = old is not None and old["id"] not in ids
        source = {
            "id": old["id"] if reuse_old else f"tesda-index-{item['download_id']}",
            "kind": "tesda_tr",
            "title": item["title"],
            "file": row["file"],
            "sha256": row["sha256"],
            "status": old["status"] if reuse_old else item["status"],
            "version": old["version"] if reuse_old else "unverified in this inventory",
            "rights_status": old["rights_status"] if reuse_old else "local research only; reuse review pending",
            "url": old["url"] if reuse_old else item["index_url"],
            "index_url": item["index_url"],
            "download_id": str(item["download_id"]),
            "download_form": "https://tesda.gov.ph/Download/DownloadTR",
        }
        if source["id"] in ids:
            raise ValueError("Duplicate source ID")
        ids.add(source["id"])
        sources.append(source)
    return {"sources": sources}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--downloads", type=Path, required=True)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text(encoding="utf-8"))
    manifest = combine(read(args.index), read(args.downloads), read(args.previous))
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"tesda": sum(s["kind"] == "tesda_tr" for s in manifest["sources"]),
                      "psf": sum(s["kind"] == "psf" for s in manifest["sources"])}))


if __name__ == "__main__":
    main()
