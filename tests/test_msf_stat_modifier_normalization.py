from __future__ import annotations

import copy
from pathlib import Path
import unittest

from scripts.msf_capabilities_explorer_builder.builder import (
    _mechanic_facet_spec,
    _operation_mechanic_ids,
)
from scripts.msf_capabilities_normalizer.normalizer import (
    NormalizerError,
    STAT_MODIFIER_SPECS,
    normalize_mechanics,
)
from scripts.msf_capabilities_parser.parser import parse_sources


FIXTURES = Path(__file__).parent / "fixtures/msf_capabilities"


class StatModifierNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.mechanics = parse_sources(
            FIXTURES / "characters.json", FIXTURES / "procs.json"
        )

    def normalize_entries(self, entries, *, target_marker="keep", conditions=None):
        mechanics = copy.deepcopy(self.mechanics)
        action = next(
            item
            for item in mechanics["actions"]
            if item["source"]["pointer"] == "/Data/Apocalypse/basic/actions/1"
        )
        action["parameters"]["stat_modifier"] = copy.deepcopy(entries)
        action["raw"]["stat_modifier"] = copy.deepcopy(entries)
        if target_marker is None:
            action["target"] = None
            action["targetPresent"] = False
            action["raw"].pop("target", None)
        if conditions is not None:
            action["conditions"] = copy.deepcopy(conditions)
        capabilities = normalize_mechanics(mechanics)
        return [
            operation
            for operation in capabilities["operations"]
            if operation["sourceActionId"] == action["id"]
        ]

    def test_known_vocabulary_and_one_operation_per_entry(self):
        self.assertEqual(
            set(STAT_MODIFIER_SPECS),
            {
                "ability_damage_pct", "armor_pierce_pct", "true_damage_pct",
                "damage_pct", "crit_chance_pct", "crit_damage_pct", "drain_pct",
                "accuracy_pct", "dodge_chance_pct", "block_chance_pct", "counter_pct",
            },
        )
        entries = [
            {"stat": stat, "delta": [-10, -20] if stat == "true_damage_pct" else [10, 20]}
            for stat in STAT_MODIFIER_SPECS
        ]
        operations = self.normalize_entries(entries)
        self.assertEqual(len(operations), 11)
        self.assertEqual(len({item["sourceActionId"] for item in operations}), 1)
        self.assertEqual(
            {item["source"]["valuePointer"] for item in operations},
            {f"/Data/Apocalypse/basic/actions/1/stat_modifier/{i}" for i in range(11)},
        )
        true_damage = next(item for item in operations if item["statModifier"]["stat"] == "true_damage_pct")
        self.assertEqual(true_damage["statModifier"]["delta"], [-10, -20])
        self.assertEqual(true_damage["metrics"]["delta"]["maxLevelValue"], -20)

    def test_context_is_preserved_and_missing_target_is_unresolved(self):
        entries = [
            {"stat": "accuracy_pct", "delta_from": "passive_number", "on": "primary", "apply_if": {"owner": {"health_pct": {"if": "less", "than": 50}}}},
            {"stat": "counter_pct", "delta": -100, "on": "secondary"},
        ]
        conditions = [{"kind": "only_if", "raw": {"mode": "WAR"}, "source": {"file": "characters.json", "pointer": "/condition"}}]
        operations = self.normalize_entries(entries, target_marker=None, conditions=conditions)
        self.assertTrue(all(item["target"] == {"present": False, "value": None} for item in operations))
        self.assertEqual(operations[0]["statModifier"]["deltaFrom"], "passive_number")
        self.assertEqual(operations[0]["statModifier"]["quantityResolution"], "contextual")
        self.assertEqual([item["statModifier"]["on"] for item in operations], ["primary", "secondary"])
        self.assertEqual([item["kind"] for item in operations[0]["conditions"]], ["only_if", "apply_if"])

    def test_explicit_target_and_builder_taxonomy_without_collisions(self):
        operation = self.normalize_entries([{"stat": "drain_pct", "delta": [5, 10]}])[0]
        self.assertTrue(operation["target"]["present"])
        self.assertEqual(operation["target"]["value"], {"relation": "enemy"})
        projected = {"kind": "stat_modifier", "statModifier": operation["statModifier"]}
        self.assertEqual(_operation_mechanic_ids(operation, projected), ["action-drain"])
        self.assertEqual(_mechanic_facet_spec("action-drain", projected), {"id": "drain_attack", "label": "Drain de l’attaque"})
        forbidden = {"accuracydown", "evade", "counter", "deflect", "offenseup", "defensedown"}
        self.assertTrue(forbidden.isdisjoint({value[0] for value in STAT_MODIFIER_SPECS.values()}))

    def test_future_stat_fails_explicitly(self):
        with self.assertRaises(NormalizerError) as raised:
            self.normalize_entries([{"stat": "future_twelfth_pct", "delta": 10}])
        self.assertEqual(raised.exception.code, "UNKNOWN_STAT_MODIFIER")


if __name__ == "__main__":
    unittest.main()
