import copy
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("unified_skills_stage", ROOT / "scripts" / "stage-unified-skills.py")
stage_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage_module)


def snapshot(path):
    connection = sqlite3.connect(path)
    try:
        return tuple(
            tuple(sorted(connection.execute(f"SELECT * FROM {table}").fetchall()))
            for table in ("source_documents", "source_records", "legacy_skill_ids")
        )
    finally:
        connection.close()


class LocalStageTests(unittest.TestCase):
    def test_repeat_is_idempotent_and_cannot_activate(self):
        data = {
            "summary": {"proposed_active_skills": 0},
            "sources": [{"id": "tr", "kind": "tesda_tr", "title": "Example", "status": "current",
                         "version": "1", "url": "https://example.invalid", "sha256": "a" * 64,
                         "rights_status": "verified_with_acknowledgement"}],
            "source_records": [{"source_id": "tr", "source_code": "UNIT1",
                                "record_kind": "competency_unit", "source_title": "Example unit",
                                "reference_status": "verified_source",
                                "activation_status": "pending_review", "pages": [1]}],
            "legacy_skill_ids": ["legacy-1"],
        }
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "stage.sqlite"
            self.assertEqual(stage_module.stage(data, path), (1, 1, 1))
            original = snapshot(path)
            self.assertEqual(stage_module.stage(data, path), (1, 1, 1))
            self.assertEqual(snapshot(path), original)
            connection = sqlite3.connect(path)
            try:
                tables = {row[0] for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )}
                self.assertNotIn("skills", tables)
                self.assertEqual(connection.execute(
                    "SELECT activation_status FROM source_records"
                ).fetchone()[0], "pending_review")
            finally:
                connection.close()
            invalid = copy.deepcopy(data)
            invalid["source_records"][0]["activation_status"] = "active"
            with self.assertRaisesRegex(ValueError, "cannot be activated"):
                stage_module.stage(invalid, path)
            self.assertEqual(snapshot(path), original)

    def test_missing_source_rolls_back_existing_stage(self):
        data = json.loads((ROOT / "artifacts" / "unified-skills-20261021" /
                           "staged-source-records.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "stage.sqlite"
            stage_module.stage(data, path)
            before = snapshot(path)
            invalid = copy.deepcopy(data)
            invalid["source_records"][0]["source_id"] = "unknown-source"
            with self.assertRaises(sqlite3.IntegrityError):
                stage_module.stage(invalid, path)
            self.assertEqual(snapshot(path), before)


if __name__ == "__main__":
    unittest.main()



