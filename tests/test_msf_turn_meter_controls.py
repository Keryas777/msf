from __future__ import annotations

import copy
import json
from pathlib import Path
import tempfile
import unittest

from scripts.msf_capabilities_explorer_builder.ability_presentation import (
    _turn_meter_control_operation_label,
)
from scripts.msf_capabilities_explorer_builder.builder import (
    _operation_mechanic_ids,
)
from scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics
from scripts.msf_capabilities_parser.parser import parse_sources, serialize_mechanics


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_CHARACTERS = ROOT / "tests/fixtures/msf_capabilities/characters.json"
FIXTURE_PROCS = ROOT / "tests/fixtures/msf_capabilities/procs.json"


class TurnMeterControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        characters = json.loads(FIXTURE_CHARACTERS.read_text(encoding="utf-8"))
        characters["Data"].update(
            {
                "FalconJoaquin": {
                    "traits": [],
                    "dynamic_stats": [
                        {
                            "stat": "turnmeter_increase_mod_pct",
                            "delta": [-100],
                            "apply_if": {
                                "mode": "AVA",
                                "relationship": "enemy",
                            },
                        }
                    ],
                },
                "SpiderManBigTime": {
                    "traits": [],
                    "dynamic_stats": [
                        {
                            "stat": "turnmeter_increase_mod_pct",
                            "delta": [-50],
                            "apply_if": {
                                "combat_side": "defense",
                                "mode": "AVA",
                                "relationship": "enemy",
                                "traits": {"has_any": ["Controller"]},
                            },
                        }
                    ],
                },
                "CosmicGhostRider": {
                    "traits": [],
                    "dynamic_stats": [
                        {
                            "stat": "turnmeter_increase_mod_pct",
                            "delta": [100],
                            "apply_if": {"relationship": "enemy"},
                        }
                    ],
                },
                "Annihilus": {
                    "traits": [],
                    "stat_immunity": [
                        {
                            "stat": "turnmeter_increase_mod_pct",
                            "allow_negative_modifier": False,
                            "allow_positive_modifier": True,
                            "allow_proc_modifier": True,
                            "apply_if": {
                                "owner_ok": True,
                                "relationship": "ally",
                            },
                        }
                    ],
                },
                "Gladiator": {
                    "traits": [],
                    "dynamic_stats": [
                        {
                            "stat": "turnmeter_increase_mod_pct",
                            "delta": [-100],
                            "apply_if": {
                                "mode": "BATTLEGROUNDS",
                                "relationship": "enemy",
                            },
                        },
                        {
                            "stat": "turnmeter_decrease_mod_pct",
                            "delta": [-100],
                            "apply_if": {
                                "mode": "BATTLEGROUNDS",
                                "relationship": "enemy",
                            },
                        },
                    ],
                },
                "Quicksilver": {
                    "traits": [],
                    "passive_stats": [
                        {"stat": "turnmeter_immune_pct", "delta": [100]}
                    ],
                    "special": {
                        "actions": [
                            {
                                "action": "turn_meter",
                                "change_pct": [20],
                                "target": {"relation": "ally"},
                            }
                        ]
                    },
                },
                "PVE_Boss_Maestro": {
                    "traits": [],
                    "dynamic_stats": [
                        {"stat": "turnmeter_immune_pct", "delta": 999}
                    ],
                },
                "HowardTheDuck": {
                    "traits": [],
                    "dynamic_stats": [
                        {
                            "stat": "turnmeter_increase_mod_pct",
                            "delta": [-200],
                            "min_value": [-100],
                            "apply_if": {"relationship": "enemy"},
                        },
                        {
                            "stat": "turnmeter_decrease_mod_pct",
                            "delta": [-200],
                            "min_value": [-100],
                            "apply_if": {"relationship": "enemy"},
                        },
                    ],
                },
                "Northstar": {
                    "traits": [],
                    "passive_stats": [
                        {"stat": "speed_pct", "delta": [25]},
                        {"stat": "turnmeter_immune_pct", "delta": [100]},
                    ],
                },
            }
        )
        cls.temporary = tempfile.TemporaryDirectory()
        characters_path = Path(cls.temporary.name) / "characters.json"
        characters_path.write_text(json.dumps(characters), encoding="utf-8")
        cls.mechanics = parse_sources(characters_path, FIXTURE_PROCS)
        cls.capabilities = normalize_mechanics(
            cls.mechanics,
            mechanics_payload=serialize_mechanics(cls.mechanics),
        )

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def operation_at(self, pointer):
        return next(
            operation
            for operation in self.capabilities["operations"]
            if operation.get("source", {}).get("actionPointer") == pointer
        )

    def test_increase_modifier_actions(self):
        cases = {
            "/Data/SpiderManBigTime/dynamic_stats/0": "modify_induced_gain",
            "/Data/FalconJoaquin/dynamic_stats/0": "block_induced_gain",
            "/Data/HowardTheDuck/dynamic_stats/0": "block_induced_gain",
            "/Data/CosmicGhostRider/dynamic_stats/0": "amplify_induced_gain",
        }
        for pointer, expected in cases.items():
            with self.subTest(pointer=pointer):
                operation = self.operation_at(pointer)
                self.assertEqual(operation["kind"], "stat_modifier")
                self.assertEqual(operation["mechanicFamily"], "turn_meter")
                self.assertEqual(operation["turnMeterControl"]["action"], expected)

        spider = self.operation_at("/Data/SpiderManBigTime/dynamic_stats/0")
        self.assertEqual(spider["turnMeterControl"]["technicalValuePct"], -50)
        self.assertEqual(spider["turnMeterControl"]["affectedActor"]["relation"], "enemy")
        self.assertEqual(
            spider["turnMeterControl"]["affectedActor"]["filter"]["traits"],
            {"has_any": ["Controller"]},
        )

    def test_joaquin_preserves_normal_gain_exception_and_unknown_recipient(self):
        operation = self.operation_at("/Data/FalconJoaquin/dynamic_stats/0")
        control = operation["turnMeterControl"]
        self.assertTrue(control["normalGainUnaffected"])
        self.assertEqual(control["affectedActor"]["relation"], "enemy")
        self.assertEqual(
            control["controlledGainRecipient"]["resolution"], "unresolved"
        )
        self.assertNotIn("FalconJoaquin_Speedmeter_Block", json.dumps(operation))

    def test_stat_immunity_protects_induced_gain_only(self):
        operation = self.operation_at("/Data/Annihilus/stat_immunity/0")
        self.assertEqual(operation["kind"], "stat_immunity")
        self.assertEqual(
            operation["turnMeterControl"]["action"],
            "protect_induced_gain_from_suppression",
        )
        self.assertNotEqual(
            operation["turnMeterControl"]["action"], "reduction_immunity"
        )

    def test_decrease_modifiers_and_combined_facets_stay_fractionated(self):
        gladiator_gain = self.operation_at("/Data/Gladiator/dynamic_stats/0")
        gladiator_reduction = self.operation_at("/Data/Gladiator/dynamic_stats/1")
        self.assertNotEqual(gladiator_gain["id"], gladiator_reduction["id"])
        self.assertEqual(
            gladiator_reduction["turnMeterControl"]["action"],
            "block_induced_reduction",
        )
        for operation in (gladiator_gain, gladiator_reduction):
            self.assertEqual(
                operation["turnMeterControl"]["combinedAction"],
                "block_induced_modification",
            )
            self.assertNotIn("block_all", json.dumps(operation))

        howard = self.operation_at("/Data/HowardTheDuck/dynamic_stats/1")
        self.assertEqual(
            howard["metrics"]["technicalMinValuePct"]["maxLevelValue"], -100
        )
        self.assertNotIn("200 %", _turn_meter_control_operation_label(howard))

    def test_reduction_immunity_does_not_hide_positive_turn_meter(self):
        immunity = self.operation_at("/Data/Quicksilver/passive_stats/0")
        increase = self.operation_at("/Data/Quicksilver/special/actions/0")
        self.assertEqual(
            immunity["turnMeterControl"]["action"], "reduction_immunity"
        )
        self.assertEqual(increase["kind"], "turn_meter_modify")
        self.assertEqual(increase["turnMeter"]["direction"], "increase")

        boss = self.operation_at("/Data/PVE_Boss_Maestro/dynamic_stats/0")
        self.assertEqual(boss["turnMeterControl"]["action"], "reduction_immunity")
        self.assertEqual(boss["turnMeterControl"]["confidence"], "mechanical_only")
        self.assertNotIn("999", _turn_meter_control_operation_label(boss))

    def test_speed_stats_and_markers_are_not_promoted(self):
        control_pointers = {
            action["source"]["pointer"]
            for action in self.mechanics["actions"]
            if action.get("adapter") == "turn_meter_control"
        }
        self.assertNotIn("/Data/Northstar/passive_stats/0", control_pointers)
        northstar = self.operation_at("/Data/Northstar/passive_stats/1")
        self.assertEqual(
            northstar["turnMeterControl"]["action"], "reduction_immunity"
        )
        self.assertNotIn(
            "BossTurnMeterImmunity",
            {operation.get("sourceActionType") for operation in self.capabilities["operations"]},
        )

    def test_controls_join_turn_meter_family_without_losing_kind(self):
        operation = self.operation_at("/Data/FalconJoaquin/dynamic_stats/0")
        projected = copy.deepcopy(operation)
        self.assertIn(
            "action-turn-meter",
            _operation_mechanic_ids(operation, projected),
        )
        self.assertEqual(operation["kind"], "stat_modifier")


if __name__ == "__main__":
    unittest.main()
