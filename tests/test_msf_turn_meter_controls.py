from __future__ import annotations

from collections import Counter
from pathlib import Path
import unittest

from scripts.msf_capabilities_explorer_builder.builder import _project_operation
from scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics
from scripts.msf_capabilities_parser.parser import parse_sources, serialize_mechanics


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "data/msf-capabilities/raw/characters.json"
PROCS = ROOT / "data/msf-capabilities/raw/procs.json"


class TurnMeterControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mechanics = parse_sources(CHARACTERS, PROCS)
        cls.capabilities = normalize_mechanics(
            cls.mechanics,
            mechanics_payload=serialize_mechanics(cls.mechanics),
        )
        cls.controls = [
            operation
            for operation in cls.capabilities["operations"]
            if operation.get("mechanicFamily") == "turn_meter"
        ]

    def control_at(self, pointer):
        matches = [
            operation
            for operation in self.controls
            if operation["source"]["actionPointer"] == pointer
        ]
        self.assertEqual(len(matches), 1, (pointer, matches))
        return matches[0]

    def test_exact_control_corpus_and_direct_b1_invariants(self):
        self.assertEqual(len(self.controls), 97)
        self.assertEqual(
            Counter(
                operation["turnMeterControl"]["technicalStat"]
                for operation in self.controls
            ),
            {
                "turnmeter_increase_mod_pct": 44,
                "turnmeter_decrease_mod_pct": 20,
                "turnmeter_immune_pct": 33,
            },
        )
        direct = [
            operation
            for operation in self.capabilities["operations"]
            if operation["kind"] == "turn_meter_modify"
        ]
        self.assertEqual(len(direct), 540)
        self.assertEqual(
            Counter(operation["turnMeter"]["action"] for operation in direct),
            {"increase": 323, "decrease": 205, "contextual_amount": 12},
        )

    def test_gain_thresholds_and_raw_technical_values(self):
        big_time = self.control_at(
            "/Data/SpiderManBigTime/dynamic_stats/0"
        )
        joaquin = self.control_at("/Data/FalconJoaquin/dynamic_stats/3")
        howard = self.control_at("/Data/HowardTheDuck/dynamic_stats/1")
        cosmic_ghost_rider = self.control_at(
            "/Data/CosmicGhostRider/dynamic_stats/0"
        )
        self.assertEqual(
            big_time["turnMeterControl"]["action"], "modify_induced_gain"
        )
        self.assertEqual(
            joaquin["turnMeterControl"]["action"], "block_induced_gain"
        )
        self.assertEqual(
            howard["turnMeterControl"]["action"], "block_induced_gain"
        )
        self.assertEqual(
            cosmic_ghost_rider["turnMeterControl"]["action"],
            "amplify_induced_gain",
        )
        self.assertEqual(
            howard["metrics"]["technicalValuePct"]["maxLevelValue"], -200
        )
        self.assertEqual(
            howard["metrics"]["technicalMinValuePct"]["maxLevelValue"], -100
        )

    def test_affected_actor_is_not_conflated_with_gain_recipient(self):
        joaquin = self.control_at("/Data/FalconJoaquin/dynamic_stats/3")
        control = joaquin["turnMeterControl"]
        self.assertEqual(control["affectedActor"]["relation"], "enemy")
        self.assertEqual(
            control["controlledGainRecipient"], {"relation": "unresolved"}
        )
        self.assertTrue(control["normalGainUnaffected"])

        cosmic_ghost_rider = self.control_at(
            "/Data/CosmicGhostRider/dynamic_stats/0"
        )["turnMeterControl"]
        self.assertNotIn("normalGainUnaffected", cosmic_ghost_rider)

        big_time = self.control_at(
            "/Data/SpiderManBigTime/dynamic_stats/0"
        )["turnMeterControl"]
        self.assertEqual(big_time["affectedActor"]["relation"], "enemy")
        self.assertEqual(big_time["affectedActor"]["conditions"]["mode"], "AVA")
        self.assertEqual(
            big_time["affectedActor"]["conditions"]["combat_side"], "defense"
        )
        self.assertEqual(
            big_time["affectedActor"]["filter"]["traits"]["has_any"],
            ["Controller"],
        )

    def test_immunity_semantics_are_narrow(self):
        annihilus = self.control_at("/Data/Annihilus/stat_immunity/4")
        quicksilver = self.control_at("/Data/Quicksilver/passive_stats/1")
        maestro = self.control_at("/Data/PVE_Boss_Maestro/dynamic_stats/15")
        self.assertEqual(annihilus["kind"], "stat_immunity")
        self.assertEqual(
            annihilus["turnMeterControl"]["action"],
            "protect_induced_gain_from_suppression",
        )
        self.assertEqual(
            quicksilver["turnMeterControl"]["action"], "reduction_immunity"
        )
        self.assertEqual(
            maestro["turnMeterControl"]["action"], "reduction_immunity"
        )
        self.assertEqual(maestro["turnMeterControl"]["technicalValuePct"], 999)
        self.assertEqual(maestro["turnMeterControl"]["confidence"], "mechanical_only")

    def test_compatible_gain_and_reduction_controls_remain_separate(self):
        gain = self.control_at("/Data/Gladiator/dynamic_stats/3")
        reduction = self.control_at("/Data/Gladiator/dynamic_stats/4")
        self.assertNotEqual(gain["id"], reduction["id"])
        self.assertEqual(gain["kind"], "stat_modifier")
        self.assertEqual(reduction["kind"], "stat_modifier")
        self.assertEqual(
            gain["turnMeterControl"]["combinedAction"],
            "block_induced_modification",
        )
        self.assertEqual(
            reduction["turnMeterControl"]["combinedAction"],
            "block_induced_modification",
        )

    def test_combined_controls_keep_their_distinct_presentation_labels(self):
        gain = self.control_at("/Data/Gladiator/dynamic_stats/3")
        reduction = self.control_at("/Data/Gladiator/dynamic_stats/4")
        projected = [
            _project_operation(
                {
                    **operation,
                    "operationId": operation["id"],
                    "abilityId": None,
                },
                {},
                {},
            )
            for operation in (gain, reduction)
        ]

        self.assertNotEqual(projected[0]["id"], projected[1]["id"])
        self.assertEqual(
            [operation["kindLabel"] for operation in projected],
            [
                "Empêche les gains provoqués de jauge de vitesse",
                "Empêche les réductions provoquées de jauge de vitesse",
            ],
        )
        self.assertTrue(
            all(
                operation["turnMeterControl"]["combinedAction"]
                == "block_induced_modification"
                for operation in projected
            )
        )

    def test_speed_and_sentinel_names_are_not_promoted(self):
        technical_stats = {
            operation["turnMeterControl"]["technicalStat"]
            for operation in self.controls
        }
        self.assertNotIn("speed", technical_stats)
        self.assertNotIn("speed_pct", technical_stats)
        serialized = serialize_mechanics(self.mechanics).decode("utf-8")
        self.assertIn("FalconJoaquin_Speedmeter_Block", serialized)
        self.assertIn("BossTurnMeterImmunity", serialized)
        self.assertFalse(
            any(
                operation.get("effect", {}).get("effectId")
                in {"FalconJoaquin_Speedmeter_Block", "BossTurnMeterImmunity"}
                and operation.get("mechanicFamily") == "turn_meter"
                for operation in self.capabilities["operations"]
                if isinstance(operation.get("effect"), dict)
            )
        )


if __name__ == "__main__":
    unittest.main()
