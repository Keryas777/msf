import json
import unittest
from pathlib import Path
from PIL import Image, ImageDraw
from benchmark import title_color_result

DATA = json.loads(Path(__file__).with_name("ground-truth.json").read_text(encoding="utf-8"))
CAPTURES = DATA["captures"]

class GroundTruthTests(unittest.TestCase):
    def test_corpus_split_and_no_dates(self):
        self.assertEqual(len(CAPTURES), 9)
        self.assertEqual(sum(x["split"] == "train" for x in CAPTURES), 7)
        self.assertEqual(sum(x["split"] == "holdout" for x in CAPTURES), 2)
        self.assertTrue(all(x["date"] is None for x in CAPTURES))

    def test_truth_is_complete_except_explicitly_uncertain_opponent(self):
        required = {"localAlliance", "localTrophies", "localTrophyChange", "opponentTrophies", "opponentTrophyChange", "localScore", "opponentScore", "result"}
        for capture in CAPTURES:
            self.assertLessEqual(required, capture.keys())
            self.assertIn(capture["result"], {"win", "loss"})
            if capture["id"] != "capture-09":
                self.assertTrue(capture.get("opponentAlliance"))
        self.assertIsNone(CAPTURES[-1]["opponentAlliance"])

    def test_color_result_detector_separates_header_cues(self):
        for color, expected in [((40, 130, 240), "win"), ((240, 30, 55), "loss")]:
            image = Image.new("RGB", (100, 100), (0, 0, 0))
            ImageDraw.Draw(image).rectangle((30, 0, 69, 11), fill=color)
            actual, _ = title_color_result_from_image(image)
            self.assertEqual(actual, expected)

def title_color_result_from_image(image):
    path = Path("/tmp/war-result-color-test.png")
    image.save(path)
    return title_color_result(path)

if __name__ == "__main__":
    unittest.main()
