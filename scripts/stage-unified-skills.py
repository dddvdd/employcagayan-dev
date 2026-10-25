"""Idempotently stage reviewed-source candidates in a local SQLite file only."""
import argparse
import json
import sqlite3
from pathlib import Path


def stage(data, path):
    rows = data["source_records"]
    sources = data["sources"]
    legacy = data["legacy_skill_ids"]
    if data["summary"]["proposed_active_skills"] != 0:
        raise ValueError("Active skill proposals are not allowed in local staging")
    if any(row["activation_status"] != "pending_review" for row in rows):
        raise ValueError("Unreviewed source records cannot be activated")
    if len({(row["source_id"], row["source_code"]) for row in rows}) != len(rows):
        raise ValueError("Duplicate source identifiers")
    if len({source["id"] for source in sources}) != len(sources):
        raise ValueError("Duplicate source documents")
    if len(set(legacy)) != len(legacy):
        raise ValueError("Duplicate legacy skill IDs")
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS source_documents(
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
                status TEXT NOT NULL, version TEXT NOT NULL, url TEXT NOT NULL,
                sha256 TEXT NOT NULL, rights_status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS source_records(
                source_id TEXT NOT NULL REFERENCES source_documents(id),
                source_code TEXT NOT NULL, record_kind TEXT NOT NULL,
                title_candidate TEXT, reference_status TEXT NOT NULL,
                activation_status TEXT NOT NULL CHECK(activation_status = 'pending_review'),
                pages_json TEXT NOT NULL,
                PRIMARY KEY(source_id, source_code)
            );
            CREATE TABLE IF NOT EXISTS legacy_skill_ids(id TEXT PRIMARY KEY);
        """)
        with connection:
            connection.execute("DELETE FROM source_records")
            connection.execute("DELETE FROM source_documents")
            connection.execute("DELETE FROM legacy_skill_ids")
            connection.executemany(
                "INSERT INTO source_documents VALUES (?,?,?,?,?,?,?,?)",
                [(s["id"], s["kind"], s["title"], s["status"], s["version"],
                  s["url"], s["sha256"], s["rights_status"]) for s in sources],
            )
            connection.executemany(
                "INSERT INTO source_records VALUES (?,?,?,?,?,?,?)",
                [(r["source_id"], r["source_code"], r["record_kind"],
                  r.get("source_title") or r.get("source_title_candidate"),
                  r["reference_status"], r["activation_status"],
                  json.dumps(r["pages"])) for r in rows],
            )
            connection.executemany("INSERT INTO legacy_skill_ids VALUES (?)",
                                   [(id_,) for id_ in legacy])
        counts = tuple(connection.execute(
            "SELECT (SELECT count(*) FROM source_documents), "
            "(SELECT count(*) FROM source_records), "
            "(SELECT count(*) FROM legacy_skill_ids)"
        ).fetchone())
        if counts != (len(sources), len(rows), len(legacy)):
            raise ValueError("Local staging count mismatch")
        return counts
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    counts = stage(data, args.output)
    print(json.dumps({"local_documents": counts[0], "local_source_records": counts[1],
                      "legacy_skill_ids_preserved": counts[2], "active_skills": 0}))


if __name__ == "__main__":
    main()
