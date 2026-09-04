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

    def operation_at(self, pointer):
        return next(
            operation
            for operation in self.capabilities["operations"]
            if operation.get("source", {}).get("actionPointer") == pointer
        )

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

    def test_signed_and_contextual_directions_are_projected(self):
        increase = self.operation_at("/Data/AbsorbingMan/passive/1/actions/0")
        decrease = self.operation_at("/Data/Magik/special/actions/4")
        contextual_increase = self.operation_at("/Data/GreenGoblinGlider/passive/1/actions/0")
        contextual_decrease = self.operation_at("/Data/EbonyMaw/ultimate/actions/12")

        self.assertEqual(increase["turnMeter"]["action"], "increase")
        self.assertEqual(decrease["turnMeter"]["action"], "decrease")
        self.assertEqual(contextual_increase["turnMeter"]["action"], "contextual_amount")
        self.assertEqual(contextual_increase["turnMeter"]["direction"], "increase")
        self.assertEqual(contextual_increase["turnMeter"]["perMatchingCharacterPct"], 9)
        self.assertEqual(contextual_decrease["turnMeter"]["action"], "contextual_amount")
        self.assertEqual(contextual_decrease["turnMeter"]["direction"], "decrease")
        self.assertEqual(contextual_decrease["turnMeter"]["perMatchingCharacterPct"], -5)

    def test_explicit_target_dimensions_are_projected_without_replacement(self):
        magik = self.operation_at("/Data/Magik/special/actions/4")
        korg = self.operation_at("/Data/Korg/special/actions/2")
        cyclops = self.operation_at("/Data/Cyclops/passive/3/actions/1")

        self.assertEqual(magik["turnMeter"]["recipient"], "primary")
        self.assertEqual(korg["turnMeter"]["recipient"], "primary_and_adjacent")
        self.assertEqual(cyclops["turnMeter"]["recipient"], "ally_side")
        self.assertEqual(cyclops["turnMeter"]["target"]["type"], "random")
        self.assertEqual(cyclops["turnMeter"]["target"]["limit"], 1)
        self.assertEqual(
            cyclops["turnMeter"]["target"]["filter"]["character"],
            ["Wolverine", "Magik", "Forge"],
        )
        self.assertEqual(cyclops["target"]["value"]["filter"]["character"], ["Wolverine", "Magik", "Forge"])

    def test_missing_target_and_action_dependency_do_not_invent_recipient(self):
        cloak = self.operation_at("/Data/Cloak/passive/1/actions/0")
        blade = self.operation_at("/Data/Blade/basic/actions/3")

        self.assertFalse(cloak["target"]["present"])
        self.assertEqual(cloak["turnMeter"]["recipient"], "unresolved")
        self.assertEqual(cloak["turnMeter"]["resolution"], "unresolved")
        self.assertEqual(blade["control"]["referenceKind"], "previous_action")
        self.assertIsNotNone(blade["control"]["dependsOnActionId"])
        self.assertEqual(blade["turnMeter"]["recipient"], "unresolved")

    def test_fractionated_actions_remain_independent(self):
        morgan_enemy = self.operation_at("/Data/MorganLeFay/special/actions/0")
        morgan_ally = self.operation_at("/Data/MorganLeFay/special/actions/1")
        ebony_ally = self.operation_at("/Data/EbonyMaw/ultimate/actions/11")
        ebony_enemy = self.operation_at("/Data/EbonyMaw/ultimate/actions/12")

        self.assertNotEqual(morgan_enemy["id"], morgan_ally["id"])
        self.assertEqual(morgan_enemy["turnMeter"]["recipient"], "enemy_side")
        self.assertEqual(morgan_ally["turnMeter"]["recipient"], "ally_side")
        self.assertEqual(morgan_enemy["turnMeter"]["baseValuePct"], -100)
        self.assertEqual(morgan_ally["turnMeter"]["baseValuePct"], -100)
        self.assertNotEqual(ebony_ally["id"], ebony_enemy["id"])
        self.assertEqual(ebony_ally["turnMeter"]["direction"], "increase")
        self.assertEqual(ebony_enemy["turnMeter"]["direction"], "decrease")

    def test_contextual_fragments_are_not_replaced_from_official_text(self):
        zombie_juggernaut = self.operation_at("/Data/ZombieJuggernaut/passive/2/actions/1")
        sam_wilson = self.operation_at("/Data/SamWilson/ultimate/actions/1")
        squirrel_girl = self.operation_at("/Data/SquirrelGirl/passive/2/actions/2")

        self.assertEqual(zombie_juggernaut["turnMeter"]["baseValuePct"], 0)
        self.assertEqual(zombie_juggernaut["turnMeter"]["perMatchingCharacterPct"], 5)
        self.assertEqual(sam_wilson["turnMeter"]["perMatchingCharacterPct"], 10)
        self.assertEqual(squirrel_girl["turnMeter"]["baseValuePct"], 0)
        self.assertEqual(squirrel_girl["turnMeter"]["perMatchingCharacterPct"], 10)


if __name__ == "__main__":
    unittest.main()
