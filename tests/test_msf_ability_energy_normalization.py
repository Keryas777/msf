from __future__ import annotations

from pathlib import Path
import unittest

from scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics
from scripts.msf_capabilities_parser.parser import parse_sources, serialize_mechanics

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "data/msf-capabilities/raw/characters.json"
PROCS = ROOT / "data/msf-capabilities/raw/procs.json"

class AbilityEnergyNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mechanics = parse_sources(CHARACTERS, PROCS)
        cls.capabilities = normalize_mechanics(
            cls.mechanics, mechanics_payload=serialize_mechanics(cls.mechanics)
        )

    def test_every_ability_energy_action_is_normalized_once(self):
        source_ids = {
            action["id"]
            for action in self.mechanics["actions"]
            if str(action.get("rawType") or "").lower() == "ability_energy"
        }
        operations = [
            operation for operation in self.capabilities["operations"]
            if operation.get("sourceActionType") == "ability_energy"
        ]
        self.assertTrue(source_ids)
        self.assertEqual(len(operations), len(source_ids))
        self.assertEqual({op["sourceActionId"] for op in operations}, source_ids)
        self.assertTrue(all(op["kind"] == "ability_energy_generate" for op in operations))
        self.assertTrue(all("selectionCount" not in op.get("metrics", {}) for op in operations))
        statuses = {
            mapping["sourceActionId"]: mapping["status"]
            for mapping in self.capabilities["actionMappings"]
            if mapping["sourceActionId"] in source_ids
        }
        self.assertEqual(set(statuses), source_ids)
        self.assertEqual(set(statuses.values()), {"normalized"})

    def test_deathlok_encodes_audited_semantics(self):
        operation = next(
            op for op in self.capabilities["operations"]
            if op["source"]["actionPointer"] == "/Data/Deathlok/basic/actions/2"
        )
        self.assertEqual(operation["kind"], "ability_energy_generate")
        self.assertEqual(operation["metrics"]["energyAmount"]["maxLevelValue"], 1)
        self.assertEqual(operation["metrics"]["chancePct"]["maxLevelValue"], 100)
        self.assertEqual(operation["target"], {"present": True, "value": {"limit": 2}})
        recipient = operation["recipient"]["value"]
        self.assertEqual(recipient["relation"], "ally")
        self.assertEqual(recipient["type"], "random_repeat")
        self.assertIn("BionicAvenger", recipient["filter"]["and"][0]["traits"]["has_any"])
        self.assertEqual(recipient["filter"]["and"][1]["target"]["energy_level"], "partial_energy")
        condition = operation["conditions"][0]["expression"]
        self.assertEqual(condition["mode"], "RAID")
        self.assertEqual(condition["owner"]["energy_level"], "full_energy")
        self.assertEqual(operation["control"]["actionCondition"], "if_has_crit_result")

    def test_count_is_energy_amount_not_recipient_count(self):
        operation = next(
            op for op in self.capabilities["operations"]
            if op["source"]["actionPointer"] == "/Data/Deathlok/basic/actions/2"
        )
        self.assertEqual(operation["rawParameters"]["count"], 1)
        self.assertEqual(operation["metrics"]["energyAmount"]["maxLevelValue"], 1)
        self.assertEqual(operation["target"]["value"]["limit"], 2)

if __name__ == "__main__":
    unittest.main()
