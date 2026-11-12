import json
import unittest
from pathlib import Path

ROOT = Path(__file__).parent


class Phase4HybridTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = json.loads((ROOT / "phase4-hybrid-benchmark-results.json").read_text())

    def test_unknown_truth_and_contaminated_holdout_are_preserved(self):
        self.assertEqual(self.result["corpus"]["scoredFields"], 62)
        self.assertEqual(self.result["corpus"]["contaminatedHoldout"], 2)
        row = next(x for x in self.result["captures"] if x["id"] == "capture-09")
        self.assertIsNone(row["fields"]["opponentAlliance"]["expected"])

    def test_hybrid_is_truth_blind_and_manually_reviewed(self):
        self.assertIn("truth-blind", self.result["method"])
        for capture in self.result["captures"]:
            for field in capture["fields"].values():
                self.assertTrue(field["manualReviewRequired"])

    def test_current_development_corpus_summary(self):
        all_rows = self.result["summaries"]["all"]
        self.assertEqual(all_rows["systematic"]["overall"], {"exact": 55, "total": 62, "percent": 88.7})
        self.assertEqual(all_rows["adaptive"]["overall"], {"exact": 55, "total": 62, "percent": 88.7})
        self.assertEqual(all_rows["adaptive"]["holdout"] if "holdout" in all_rows["adaptive"] else self.result["summaries"]["holdout"]["adaptive"]["overall"], {"exact": 13, "total": 13, "percent": 100.0})

    def test_digit_method_is_not_accepted_as_standalone(self):
        metrics = self.result["complementarity"]
        self.assertEqual(metrics["visualDigitExact"], 8)
        self.assertEqual(metrics["classifierRegressionsIfUsedAlone"], 20)
        self.assertEqual(metrics["incorrectHybridValuesAccepted"], 0)


if __name__ == "__main__":
    unittest.main()
