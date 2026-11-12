import json
import unittest
from pathlib import Path

ROOT = Path(__file__).parent


class Phase3BenchmarkIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.truth = json.loads((ROOT / "ground-truth.json").read_text(encoding="utf-8"))
        cls.phase2 = json.loads((ROOT / "phase2-benchmark-results.json").read_text(encoding="utf-8"))
        cls.phase3_cli = json.loads((ROOT / "phase3-hybrid-benchmark-results.json").read_text(encoding="utf-8"))
        cls.phase3_js = json.loads((ROOT / "phase3-tessjs-hybrid-benchmark-results.json").read_text(encoding="utf-8"))
        cls.phase3_resized = json.loads((ROOT / "phase3-tessjs-resized-hybrid-benchmark-results.json").read_text(encoding="utf-8"))

    def test_unknown_opponent_truth_remains_unknown(self):
        capture = next(x for x in self.truth["captures"] if x["id"] == "capture-09")
        self.assertIsNone(capture["opponentAlliance"])
        result = next(x for x in self.phase3_cli["captures"] if x["id"] == "capture-09")
        self.assertIsNone(result["fields"]["opponentAlliance"]["expected"])

    def test_cli_crop_arbitration_keeps_strict_attribution(self):
        self.assertEqual(self.phase2["summary"]["tesseract-cli-dual-pass-conservative"]["all"]["overall"]["exact"], 46)
        self.assertEqual(self.phase3_cli["comparison"]["phase3"]["all"]["overall"], {"exact": 52, "total": 62, "percent": 83.9})
        self.assertEqual(self.phase3_cli["comparison"]["phase3"]["all"]["opponentTrophies"]["exact"], 9)
        capture = next(x for x in self.phase3_cli["captures"] if x["id"] == "capture-02")
        self.assertEqual(capture["fields"]["opponentTrophies"]["source"], "trophy-header-row", "short crop read must fall back to the existing attributed value")
        self.assertEqual(capture["fields"]["opponentTrophies"]["extracted"], "2680")

    def test_tesseractjs_results_are_reported_separately_by_resolution(self):
        self.assertEqual(self.phase3_js["summary"]["all"]["overall"]["exact"], 49)
        self.assertEqual(self.phase3_resized["summary"]["all"]["overall"]["exact"], 46)
        self.assertEqual(self.phase3_resized["summary"]["all"]["opponentTrophies"], {"exact": 6, "total": 9})
        self.assertIn("not a browser test", self.phase3_js["engine"])

    def test_manual_validation_is_retained(self):
        for capture in self.phase3_cli["captures"]:
            for field in capture["fields"].values():
                self.assertTrue(field["manualValidationRequired"])


if __name__ == "__main__":
    unittest.main()
