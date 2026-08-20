from __future__ import annotations

from pathlib import Path
import unittest

from scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics
from scripts.msf_capabilities_parser.parser import parse_sources, serialize_mechanics


FIXTURES = Path(__file__).resolve().parent / "fixtures/msf_capabilities"


class MsfBarrierNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        mechanics = parse_sources(
            FIXTURES / "characters.json", FIXTURES / "procs.json"
        )
        cls.mechanics = mechanics

    def normalize_action(self, raw_type: str, **parameters):
        mechanics = {
            **self.mechanics,
            "actions": [dict(self.mechanics["actions"][0])],
        }
        action = mechanics["actions"][0]
        action["rawType"] = raw_type
        action["parameters"] = parameters
        action["raw"] = {"action": raw_type, **parameters}
        capabilities = normalize_mechanics(
            mechanics, mechanics_payload=serialize_mechanics(mechanics)
        )
        self.assertEqual(len(capabilities["operations"]), 1)
        return capabilities, capabilities["operations"][0]

    def test_barrier_apply_normalizes_health_percentage(self):
        capabilities, operation = self.normalize_action(
            "Barrier", action_pct=[0, 100], health_pct=[10, 25]
        )
        self.assertEqual(operation["kind"], "barrier_apply")
        self.assertEqual(operation["sourceActionType"], "barrier")
        self.assertEqual(
            operation["metrics"]["sourceMaxHealthPct"]["values"],
            [10, 25],
        )
        self.assertEqual(
            capabilities["actionMappings"][0]["status"], "normalized"
        )

    def test_barrier_remove_preserves_explicit_amount(self):
        _, operation = self.normalize_action(
            "barrier_remove", action_pct=[100], amnt=50
        )
        self.assertEqual(operation["kind"], "barrier_remove")
        amount = operation["metrics"]["barrierRemovalPct"]
        self.assertEqual(amount["values"], [50])
        self.assertEqual(amount["sourceShape"], "scalar")

    def test_barrier_remove_without_amount_means_full_removal(self):
        _, operation = self.normalize_action(
            "barrier_remove", action_pct=[100]
        )
        amount = operation["metrics"]["barrierRemovalPct"]
        self.assertEqual(amount["values"], [100])
        self.assertEqual(amount["sourceShape"], "implicit")
        self.assertNotIn("amnt", operation["rawParameters"])


if __name__ == "__main__":
    unittest.main()
