import csv
import importlib.util
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts" / "unified-skills-20261021" / "approval-batch"
spec = importlib.util.spec_from_file_location("skills_batch", ROOT / "scripts" / "prepare-skills-approval-batch.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ApprovalBatchTests(unittest.TestCase):
    def test_same_page_evidence_rejects_truncated_code_and_wrong_title(self):
        page = ("TR Example NC II Revision 01 Promulgated (9/14/2021)\n"
                "UNIT TITLE: SET UP WELDING EQUIPMENT\nUNIT CODE: MEE721321\n"
                "DESCRIPTOR: This unit covers the skills needed to prepare welding equipment.\nELEMENT")
        self.assertEqual(module.source_version(page), "Revision 01 Promulgated (9/14/2021)")
        self.assertTrue(module.unit_on_page(page, "MEE721321", "Set up welding equipment")[0])
        self.assertEqual(module.unit_on_page(page, "MEE72132", "Set up welding equipment")[1],
                         "unit_heading_code_descriptor_not_unique")
        self.assertEqual(module.unit_on_page(page, "MEE721321", "Weld pipes")[1],
                         "unit_title_disagrees_with_staged_record")

    def test_review_sheet_is_unapproved_unique_and_partitions_every_source(self):
        with (OUT / "review-sheet.csv").open(encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        with (OUT / "source-batch-disposition.csv").open(encoding="utf-8", newline="") as stream:
            disposition = list(csv.DictReader(stream))
        counts = json.loads((OUT / "batch-counts.json").read_text(encoding="utf-8"))
        proposal = json.loads((OUT / "proposed-staged-import-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual((len(rows), len(disposition)), (465, 8364))
        self.assertEqual(counts["state_counts"],
                         {"ready_for_human_review": 465, "superseded": 751, "unresolved": 7148})
        self.assertEqual(len({r["review_id"] for r in rows}), len(rows))
        self.assertEqual(len({module.key(r["skill_name"]) for r in rows}), len(rows))
        self.assertTrue(all(r["human_approval"] == "pending" and not r["supported_alias"]
                            and r["printed_source_version"] and r["official_unit_descriptor"]
                            and not re.search(r"\bNC\s*[IVX]+\b", r["skill_name"], re.I)
                            for r in rows))
        self.assertEqual((proposal["immediate_inserts"], proposal["immediate_activations"],
                          proposal["human_approved_rows"], proposal["approved_aliases"]), (0, 0, 0, 0))
        self.assertEqual((proposal["source_reuse_verified_rows"], proposal["source_reuse_pending_rows"]),
                         (11, 454))
        self.assertEqual(proposal["dev_skill_id_digest_to_preserve"],
                         "c303a7da06db3ff47fd04eb5d27dc06d")
        self.assertEqual(proposal["rejected_extracted_psf_title_mappings"], 3)


if __name__ == "__main__":
    unittest.main()
