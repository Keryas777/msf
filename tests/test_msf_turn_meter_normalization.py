from __future__ import annotations

from pathlib import Path
import unittest

from scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics
from scripts.msf_capabilities_parser.parser import parse_sources, serialize_mechanics

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "data/msf-capabilities/raw/characters.json"
PROCS = ROOT / "data/msf-capabilities/raw/procs.json"


class TurnMeterNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mechanics = parse_sources(CHARACTERS, PROCS)
        cls.capabilities = normalize_mechanics(cls.mechanics, mechanics_payload=serialize_mechanics(cls.mechanics))

    def test_every_turn_meter_action_is_normalized_once(self):
        source_ids = {a["id"] for a in self.mechanics["actions"] if str(a.get("rawType") or "").lower() == "turn_meter"}
        operations = [o for o in self.capabilities["operations"] if o.get("sourceActionType") == "turn_meter"]
        self.assertEqual(len(source_ids), 540)
        self.assertEqual(len(operations), 540)
        self.assertEqual({o["sourceActionId"] for o in operations}, source_ids)
        self.assertTrue(all(o["kind"] == "turn_meter_modify" for o in operations))
        self.assertTrue(all("turnMeterPct" in o.get("metrics", {}) for o in operations))
        statuses = {m["sourceActionId"]: m["status"] for m in self.capabilities["actionMappings"] if m["sourceActionId"] in source_ids}
        self.assertEqual(set(statuses.values()), {"normalized"})

    def test_signed_values_are_preserved(self):
        ops = [o for o in self.capabilities["operations"] if o.get("kind") == "turn_meter_modify"]
        values = [o["metrics"]["turnMeterPct"]["maxLevelValue"] for o in ops]
        self.assertTrue(any(v > 0 for v in values))
        self.assertTrue(any(v < 0 for v in values))
        self.assertIn(100, values)
        self.assertIn(-100, values)

    def test_targets_conditions_and_control_remain_structured(self):
        ops = [o for o in self.capabilities["operations"] if o.get("kind") == "turn_meter_modify"]
        self.assertTrue(any(o.get("target", {}).get("present") for o in ops))
        self.assertTrue(any(o.get("conditions") for o in ops))
        self.assertTrue(any(o.get("control", {}).get("actionCondition") for o in ops))

    def test_specific_character_modifier_is_preserved_as_structured_metric(self):
        ops = [o for o in self.capabilities["operations"] if o.get("kind") == "turn_meter_modify"]
        contextual = [o for o in ops if "specific_characters_mul" in o.get("rawParameters", {})]
        self.assertTrue(contextual)
        self.assertTrue(all("specificCharacterTurnMeterPct" in o.get("metrics", {}) for o in contextual))


if __name__ == "__main__":
    unittest.main()
