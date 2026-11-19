import importlib.util
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/'calibrate-war-results-confidence.py'
spec=importlib.util.spec_from_file_location('calibrate',SCRIPT)
cal=importlib.util.module_from_spec(spec);spec.loader.exec_module(cal)

def row(capture,margin,exact,score=.9,warning=None):
    return {'captureId':capture,'candidate':'1234','expected':'1234' if exact else '1235','candidateExact':exact,'minScore':score,'minMargin':margin,'segmentation':{'warnings':[warning] if warning else []}}

class ConfidenceCalibrationTests(unittest.TestCase):
    def test_threshold_is_selected_between_wrong_and_correct_oof_margins(self):
        threshold=cal.choose_threshold([row('a',.01,False),row('b',.04,True),row('c',.08,True)])
        self.assertAlmostEqual(threshold,.025)

    def test_no_threshold_when_error_and_correct_margins_overlap(self):
        self.assertIsNone(cal.choose_threshold([row('a',.04,False),row('b',.03,True)]))

    def test_edge_and_low_similarity_rows_do_not_calibrate(self):
        rows=[row('a',.01,False,warning='crop-edge'),row('b',.02,False),row('c',.04,True,score=.78),row('d',.06,True)]
        self.assertAlmostEqual(cal.choose_threshold(rows),.04)

    def test_missing_class_gate_refuses_even_a_high_confidence_proposal(self):
        rows=[row('a',.9,True)]
        result=cal.evaluate(rows,.5,missing_class=True,enforce_class_gate=True)
        self.assertEqual(result['accepted'],0)
        hypothetical=cal.evaluate(rows,.5,missing_class=True,enforce_class_gate=False)
        self.assertEqual(hypothetical['acceptedExact'],1)

if __name__=='__main__':unittest.main()
