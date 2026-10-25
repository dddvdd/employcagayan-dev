import copy
import csv
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "artifacts" / "unified-skills-20261021"
RECON = BASE / "reconciliation"
spec = importlib.util.spec_from_file_location("reconcile_skills", ROOT / "scripts" / "reconcile-unified-skills.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReconcileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (RECON / "skills-original-20261021.csv").open(encoding="utf-8-sig", newline="") as stream:
            cls.csv_rows = list(csv.DictReader(stream))
        cls.companion = json.loads((RECON / "skills-companion-original-20261021.json").read_text(encoding="utf-8"))
        cls.dev = json.loads((ROOT / "artifacts" / "taxonomy-milestone-20261014" / "dev-taxonomy-rows.json").read_text(encoding="utf-8"))["skills"]
        cls.sources = json.loads((BASE / "full-staged-source-records.json").read_text(encoding="utf-8"))
        cls.manifest = json.loads((BASE / "full-source-manifest.json").read_text(encoding="utf-8"))
        cls.baseline = json.loads((RECON / "dev-skill-baseline-20261021.json").read_text(encoding="utf-8"))

    def test_all_inputs_dispositioned_without_activation_or_unverified_merges(self):
        result = module.reconcile(self.csv_rows, self.companion, self.dev, self.sources,
                                  self.manifest, self.baseline["skill_ids_digest"])
        counts = result["counts"]
        self.assertEqual(hashlib.sha256((RECON / "skills-original-20261021.csv").read_bytes()).hexdigest(),
                         "089c38d978adeb47ad4b3e7ad0067094473030708150d1723352b7de77107b90")
        self.assertEqual((counts["csv_rows"], counts["csv_qualification_labels"],
                          counts["csv_exact_existing_links"], counts["canonical_working_candidates"]),
                         (180, 28, 2, 163))
        self.assertEqual((counts["source_records_reconciled"], counts["psf_source_specific_families"]),
                         (8364, 984))
        self.assertEqual((counts["approved_aliases"], counts["approved_source_to_skill_mappings"],
                          counts["proposed_active_skills"]), (0, 0, 0))
        self.assertEqual(len(result["exceptions"]), counts["total_exception_entities"])
        self.assertEqual(len(result["csv_source_alignment"]), 180)
        self.assertTrue(all(r["relationship_status"] == "lexical_evidence_only_unapproved"
                            for r in result["csv_source_alignment"]))
        self.assertTrue(all(not r["canonical_skill_id"] for r in result["source_disposition"]))
        by_csv = {r["csv_id"]: r for r in result["csv_disposition"]}
        self.assertEqual(by_csv["MTL-04"]["classification"], "qualification_label")
        self.assertEqual(by_csv["BC-05"]["existing_dev_id"], "3dfdeef6-9e94-4bf4-adc9-0c80d22520ca")
        mmaw = [r for r in result["source_disposition"] if r["source_id"] == "tesda-mmaw-ncii-2021"]
        self.assertEqual({scope: sum(r["unit_scope"] == scope for r in mmaw)
                          for scope in ("basic", "common", "core")},
                         {"basic": 9, "common": 5, "core": 3})
        search = {r["query"]: r for r in result["search_evaluation"]}
        self.assertFalse(search["welding"]["ready_in_current_skill_search"])
        self.assertFalse(search["MMAW"]["ready_in_current_skill_search"])
        self.assertTrue(search["communication"]["ready_in_current_skill_search"])
        self.assertFalse(search["agriculture"]["ready_in_current_skill_search"])

    def test_wrong_dev_digest_or_active_source_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "DEV snapshot differs"):
            module.reconcile(self.csv_rows, self.companion, self.dev, self.sources,
                             self.manifest, "0" * 32)
        bad = copy.deepcopy(self.sources)
        bad["summary"]["proposed_active_skills"] = 1
        with self.assertRaisesRegex(ValueError, "active skills"):
            module.reconcile(self.csv_rows, self.companion, self.dev, bad,
                             self.manifest, self.baseline["skill_ids_digest"])


if __name__ == "__main__":
    unittest.main()
