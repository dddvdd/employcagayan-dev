import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfWriter

MODULE = Path(__file__).resolve().parents[2] / "scripts" / "build-unified-skills.py"
spec = importlib.util.spec_from_file_location("unified_skills", MODULE)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class Page:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class Reader:
    def __init__(self, *texts):
        self.pages = [Page(text) for text in texts]


class UnifiedSkillsTests(unittest.TestCase):
    def test_tesda_unit_is_reference_not_certification(self):
        source = {"id": "mmaw", "status": "current", "rights_status": "verified_with_acknowledgement", "version": "revision 01"}
        reader = Reader(
            "UNIT OF COMPETENCY : WELD CARBON STEEL PLATES AND PIPES USING MMAW\n"
            "UNIT CODE : MEE721324",
            "UNIT TITLE : SET UP WELDING EQUIPMENT\nUNIT CODE : MEE721321",
        )
        rows = catalog.extract_tesda(reader, source)
        self.assertEqual({row["source_code"] for row in rows}, {"MEE721324", "MEE721321"})
        self.assertTrue(all(row["activation_status"] == "pending_review" for row in rows))
        self.assertTrue(all(row["record_kind"] == "competency_unit" for row in rows))
        self.assertTrue(all(row["reference_status"] == "verified_source" for row in rows))

    def test_superseded_reference_cannot_be_stage_ready(self):
        rows = catalog.extract_tesda(
            Reader("UNIT TITLE : OLD WELDING SKILL\nUNIT CODE : MEE721324"),
            {"id": "old", "status": "superseded"},
        )
        self.assertEqual(rows[0]["reference_status"], "superseded_source")

    def test_psf_functional_and_enabling_identifiers_stay_separate(self):
        reader = Reader(
            "Account Management\nFSC Proficiency Level\nFSC Code BDE-CSH-2023-1",
            "Adaptability\nESC Proficiency Level\nESC Code ESC-SRE-B001-1",
        )
        rows = catalog.extract_psf(reader, {"id": "psf"})
        self.assertEqual({row["record_kind"] for row in rows}, {"functional_skill", "enabling_skill"})
        self.assertTrue(all(row["reference_status"] == "needs_title_review" for row in rows))

    def test_hash_gate_and_legacy_ids(self):
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "fixture.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=72, height=72)
            with path.open("wb") as output:
                writer.write(output)
            source = {"id": "sample", "kind": "tesda_tr", "status": "current",
                      "file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            existing = {"skills": [{"id": "legacy-1", "canonical_name": "Bookkeeping"}]}
            result = catalog.build({"sources": [source]}, Path(dirname), existing)
            self.assertEqual(result["legacy_skill_ids"], ["legacy-1"])
            self.assertEqual(result, catalog.build({"sources": [source]}, Path(dirname), existing))
            self.assertEqual(result["summary"]["proposed_active_skills"], 0)
            source["sha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                catalog.build({"sources": [source]}, Path(dirname), existing)


if __name__ == "__main__":
    unittest.main()

