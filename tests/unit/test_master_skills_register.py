import csv
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts/unified-skills-20261021"
OUT = ART / "master-register"

def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

class MasterSkillsRegisterTest(unittest.TestCase):
    def test_rebuild_is_byte_identical(self):
        manifest = json.loads((OUT / "master-skills-import-proposal.json").read_text(encoding="utf-8"))
        before = {name: sha256(OUT / name) for name in
                  ("master-skills-register.csv", "master-skills-exceptions.csv",
                   "master-skills-import-proposal.json")}
        subprocess.run([sys.executable, str(ROOT / "scripts/build-master-skills-register.py")],
                       cwd=ROOT, check=True, capture_output=True, text=True)
        after = {name: sha256(OUT / name) for name in before}
        self.assertEqual(before, after)
        for name, digest in manifest["input_sha256"].items():
            if name == "deepseek_json":
                path = OUT / "input-skills-base.json"
            elif name == "deepseek_csv":
                path = OUT / "input-skills-base.csv"
            else:
                path = {
                    "dev_snapshot": ROOT / "artifacts/taxonomy-milestone-20261014/dev-taxonomy-rows.json",
                    "dev_baseline": ART / "reconciliation/dev-skill-baseline-20261021.json",
                    "source_manifest": ART / "full-source-manifest.json",
                    "source_records": ART / "full-staged-source-records.json",
                    "source_disposition": ART / "reconciliation/source-disposition.csv",
                    "source_groups": ART / "reconciliation/source-reference-groups.json",
                    "source_batch_disposition": ART / "approval-batch/source-batch-disposition.csv",
                    "review_sheet": ART / "approval-batch/review-sheet.csv",
                    "original_csv": ART / "reconciliation/skills-original-20261021.csv",
                    "csv_disposition": ART / "reconciliation/csv-disposition.csv",
                    "prior_exceptions": ART / "reconciliation/unresolved-exceptions.csv",
                    "alias_review": ART / "reconciliation/alias-review.csv",
                    "dev_overlap_review": ART / "reconciliation/semantic-overlap-review.json",
                    "csv_overlap_review": ART / "reconciliation/csv-concept-overlap-review.json",
                }[name]
            self.assertEqual(digest, sha256(path), name)

    def test_original_rows_and_review_boundaries(self):
        rows = read_csv(OUT / "master-skills-register.csv")
        manifest = json.loads((OUT / "master-skills-import-proposal.json").read_text(encoding="utf-8"))
        dev = json.loads((ROOT / "artifacts/taxonomy-milestone-20261014/dev-taxonomy-rows.json").read_text(encoding="utf-8"))
        skill_rows = {row["dev_skill_id"]: row for row in rows if row["record_kind"] == "existing_dev_skill"}
        self.assertEqual(len(rows), 8570)
        self.assertEqual(len(skill_rows), 16)
        for original in dev["skills"]:
            self.assertEqual(json.loads(skill_rows[original["id"]]["dev_record_json"]), original)
        occupations = [row for row in rows if row["record_kind"] == "existing_dev_occupation_context"]
        self.assertEqual(len(occupations), 10)
        self.assertEqual({json.loads(x["occupation_record_json"])["id"] for x in occupations},
                         {x["id"] for x in dev["occupations"]})
        source = [row for row in rows if row["source_id"]]
        self.assertEqual(len(source), 8364)
        self.assertEqual(len({(x["source_id"], x["source_code"]) for x in source}), 8364)
        review = [x for x in source if x["review_id"]]
        self.assertEqual(len(review), 465)
        self.assertTrue(all(x["review_approval"] == "pending" and
                            x["official_unit_descriptor"] and x["source_pdf_sha256"] for x in review))
        qualifications = [x for x in rows if x["classification"] == "qualification_label"]
        self.assertEqual(len(qualifications), 28)
        self.assertTrue(all(not x["candidate_key"] for x in qualifications))
        self.assertEqual(len({x["candidate_key"] for x in rows if x["candidate_key"]}), 628)
        self.assertEqual(manifest["import_proposal"]["connected_writes"], 0)
        self.assertEqual(manifest["import_proposal"]["activations"], 0)

if __name__ == "__main__":
    unittest.main()

