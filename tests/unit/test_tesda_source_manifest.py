import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[2] / "scripts" / "build-tesda-source-manifest.py"
spec = importlib.util.spec_from_file_location("tesda_manifest", MODULE)
merger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merger)


class ManifestTests(unittest.TestCase):
    def test_exact_hash_keeps_verified_source_and_unverified_stays_review_only(self):
        index = {"items": [
            {"download_id": "1", "title": "Verified TR", "status": "listed_current_unverified",
             "index_url": "https://tesda.gov.ph/Download/Training_Regulations?page=1"},
            {"download_id": "2", "title": "Other TR", "status": "superseded",
             "index_url": "https://tesda.gov.ph/Download/Training_Regulations?page=1"},
        ]}
        downloads = {"downloaded": [
            {"download_id": "1", "file": "tesda-id-1.pdf", "sha256": "a" * 64},
            {"download_id": "2", "file": "tesda-id-2.pdf", "sha256": "b" * 64},
        ], "failures": []}
        previous = {"sources": [
            {"id": "verified", "kind": "tesda_tr", "sha256": "a" * 64,
             "status": "current", "version": "revision 01",
             "rights_status": "verified_with_acknowledgement", "url": "https://tesda.gov.ph/example.pdf"},
            {"id": "psf", "kind": "psf", "sha256": "c" * 64},
        ]}
        sources = merger.combine(index, downloads, previous)["sources"]
        self.assertEqual(len(sources), 3)
        self.assertEqual(sources[1]["id"], "verified")
        self.assertEqual(sources[1]["status"], "current")
        self.assertEqual(sources[2]["status"], "superseded")
        self.assertIn("reuse review pending", sources[2]["rights_status"])
        downloads["downloaded"].pop()
        with self.assertRaisesRegex(ValueError, "Complete"):
            merger.combine(index, downloads, previous)


if __name__ == "__main__":
    unittest.main()
