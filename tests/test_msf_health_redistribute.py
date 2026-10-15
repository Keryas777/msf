"""Lossless corpus contract and deliberately fail-closed health interpretation."""
from collections import Counter
import copy
import json
from pathlib import Path
import re
import unittest

from scripts.msf_capabilities_normalizer.health_redistribute import (
    PARTIAL_OFFICIAL_TEXT_SIGNATURES,
    REVIEWED_OFFICIAL_TEXT_SIGNATURES,
    _raw_fingerprint,
    normalize_health_redistribute,
)
from scripts.msf_capabilities_normalizer.normalizer import normalize_mechanics
from scripts.msf_capabilities_parser.parser import parse_sources
from scripts.msf_capabilities_indexer.indexer import build_index
from scripts.msf_capabilities_explorer_builder.builder import _project_operation, _mechanic_facet_spec
from scripts.msf_capabilities_explorer_builder.ability_presentation import _operation_projection

ROOT = Path(__file__).resolve().parents[1]


class HealthRedistributeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_manifest = json.loads((ROOT / "data/msf-capabilities/source-manifest.json").read_text())
        cls.game_version = cls.source_manifest["game"]["version"]
        cls.official_presentations = {
            item["id"]: item
            for item in json.loads(
                (ROOT / "data/msf-capabilities/raw/msf-character-abilities-fr.json").read_text()
            )
        }
        cls.mechanics = parse_sources(ROOT / "data/msf-capabilities/raw/characters.json",
                                     ROOT / "data/msf-capabilities/raw/procs.json")
        cls.actions = {a["id"]: a for a in cls.mechanics["actions"]
                       if a.get("rawType") == "health_redistribute"}
        cls.capabilities = normalize_mechanics(cls.mechanics)
        cls.operations = [o for o in cls.capabilities["operations"] if o["kind"] == "health_redistribute"]
        cls.index = build_index(cls.capabilities, capabilities_checksum="0" * 64)
        cls.indexed = [o for o in cls.index.payloads["operations.json"]["records"].values()
                       if o["kind"] == "health_redistribute"]

    def test_exhaustive_lossless_contract(self):
        expected_by_version = {
            # PR #225 reference corpus and the current raw source version.
            "10_5_0": {"actions": 203, "abilities": 122, "characters": 76, "without_ability": 23},
            "10_6_3": {"actions": 230, "abilities": 128, "characters": 81, "without_ability": 26},
        }
        expected = expected_by_version.get(self.game_version)
        self.assertIsNotNone(expected, f"Unreviewed source version: {self.game_version}")
        self.assertEqual(len(self.actions), expected["actions"])
        self.assertEqual(len(self.operations), expected["actions"])
        self.assertEqual(len(self.indexed), expected["actions"])
        self.assertEqual({o["sourceActionId"] for o in self.operations}, set(self.actions))
        self.assertEqual(len({o["abilityId"] for o in self.indexed if o["abilityId"]}), expected["abilities"])
        self.assertEqual(len({o["characterId"] for o in self.indexed}), expected["characters"])
        self.assertEqual(sum(o["abilityId"] is None for o in self.indexed), expected["without_ability"])
        mappings = {m["sourceActionId"]: m for m in self.capabilities["actionMappings"]}
        for op in self.indexed:
            with self.subTest(source=op["sourceActionId"]):
                action = self.actions[op["sourceActionId"]]
                self.assertEqual(op["healthRedistribute"]["rawAction"], action["raw"])
                self.assertEqual(mappings[action["id"]]["operationIds"], [op["operationId"]])
                self.assertEqual(mappings[action["id"]]["conditions"], op["conditions"])
                self.assertEqual(mappings[action["id"]]["control"], op["control"])
                projected = _project_operation(op, {}, {})
                self.assertEqual(projected["healthRedistribute"], op["healthRedistribute"])
                ability_item = _operation_projection(op)
                self.assertEqual(ability_item["label"], {
                    "health_equalize": "Égalise les points de vie",
                    "health_steal_redistribute": "Vole et redistribue de la vie",
                    "health_transfer_allies": "Transfère de la vie entre alliés",
                    "health_loss": "Retire de la vie",
                    "detected": "Comportement non résolu",
                }[op["healthRedistribute"]["behavior"]])
                self.assertEqual(
                    ability_item["evidence"],
                    "mechanically_preserved" if not op["healthRedistribute"]["resolved"] else "mechanically_verified",
                )
                facet = _mechanic_facet_spec("action-health-redistribute", projected)
                self.assertEqual(facet["id"], op["healthRedistribute"]["behavior"])
                if facet["id"] == "detected":
                    self.assertEqual(projected["evidence"], "preserved_uninterpreted")
                    self.assertEqual(_operation_projection(op)["evidence"], "mechanically_preserved")

    def test_repeated_branches_and_witnesses(self):
        required = {"ScarletWitch", "Mantis", "Apocalypse", "LokiTeen", "AmadeusCho",
                    "Darkstar", "Thunderstrike", "Satana", "Phoenix", "MrSinister",
                    "Nebula", "BlackKnight", "JeffTheLandShark", "Odin", "Executioner", "Sentry",
                    "Cloak", "IronMonger", "Void", "EbonyMaw", "Oath", "Minerva", "BlueMarvel"}
        counts = Counter(o["characterId"] for o in self.operations)
        self.assertTrue(required <= counts.keys(), required - counts.keys())
        self.assertEqual(counts["EbonyMaw"], 5)
        for char in required:
            self.assertEqual(counts[char], sum(a["characterId"] == char for a in self.actions.values()))
        for char in ("Phoenix", "MrSinister"):
            self.assertIn("health_transfer_allies", [o["healthRedistribute"]["behavior"]
                                                    for o in self.operations if o["characterId"] == char])
        void_transfer = next(o for o in self.operations if o["source"]["actionPointer"] == "/Data/Void/passive/3/actions/0")
        self.assertEqual(void_transfer["healthRedistribute"]["behavior"], "detected")
        phoenix = next(o for o in self.operations if o["characterId"] == "Phoenix")
        self.assertEqual(phoenix["healthRedistribute"]["numeric"]["extra_heal"]["values"],
                         [250, 500, 750, 1500, 10000, 10000, 10000])
        expected_health_stat_modifier_actions = {"10_5_0": 9, "10_6_3": 19}
        self.assertEqual(
            sum("stat_modifier" in a["raw"] for a in self.actions.values()),
            expected_health_stat_modifier_actions[self.game_version],
        )

    def test_absence_shapes_flags_and_no_defaults(self):
        def normalize(**raw):
            return normalize_health_redistribute({"raw": raw})
        absent = normalize(drain_pct=[10], to={"relation": "ally"}, target={})
        self.assertEqual(absent["behavior"], "detected")
        self.assertEqual(absent["numeric"]["heal_multi"], {"present": False})
        self.assertEqual(absent["selectors"]["from"], {"present": False})
        self.assertEqual(absent["selectors"]["target"]["raw"], {})
        self.assertEqual(absent["selectors"]["to"]["raw"], {"relation": "ally"})
        for value in (True, False, "true", "other"):
            value_result = normalize(trigger_deathproof=value)
            self.assertIs(type(value_result["properties"]["trigger_deathproof"]["raw"]), type(value))
            self.assertEqual(value_result["properties"]["trigger_deathproof"]["raw"], value)
        self.assertEqual(normalize()["properties"]["trigger_deathproof"], {"present": False})
        for value, shape in ((0, "scalar"), ([0, 0], "array")):
            result = normalize(drain_pct=[0, 10], heal_multi=value, mystery={"x": [1, 2]})
            self.assertEqual(result["behavior"], "health_loss")
            self.assertEqual(result["numeric"]["heal_multi"]["sourceShape"], shape)
            self.assertEqual(result["rawAction"]["mystery"], {"x": [1, 2]})
        self.assertEqual(normalize(drain_pct=10, heal_multi=[100, 0])["behavior"], "detected")
        self.assertEqual(normalize(drain_pct=10, heal_multi="0")["behavior"], "detected")
        self.assertEqual(normalize(drain_pct=10, heal_multi=0, extra_heal=25)["behavior"], "detected")
        self.assertEqual(normalize(drain_pct=999, heal_multi=100)["behavior"], "detected")

    def test_reviewed_shapes_fail_closed(self):
        action = copy.deepcopy(next(a for a in self.actions.values() if a["characterId"] == "ScarletWitch"))
        self.assertEqual(normalize_health_redistribute(action)["behavior"], "health_equalize")
        action["raw"]["from"]["relation"] = "enemy"
        self.assertEqual(normalize_health_redistribute(action)["behavior"], "detected")
        action["raw"]["from"]["relation"] = "ally"
        action["raw"]["to"] = {}
        self.assertEqual(normalize_health_redistribute(action)["behavior"], "detected")

    def test_official_text_interpretations_are_fingerprint_gated(self):
        self.assertEqual(len(REVIEWED_OFFICIAL_TEXT_SIGNATURES), 50)
        self.assertEqual(len(PARTIAL_OFFICIAL_TEXT_SIGNATURES), 5)
        by_pointer = {a["source"]["pointer"]: a for a in self.actions.values()}
        matched = 0
        for pointer, reviewed in REVIEWED_OFFICIAL_TEXT_SIGNATURES.items():
            action = by_pointer.get(pointer)
            if not action or _raw_fingerprint(action["raw"]) != reviewed["sha256"]:
                continue
            matched += 1
            result = normalize_health_redistribute(action)
            parts = pointer.strip("/").split("/")
            ability = self.official_presentations[parts[1]]["abilityKit"][parts[2]]
            description = " ".join(level.get("description", "") for level in ability.get("levels", {}).values())
            description = re.sub(r"<[^>]+>", "", description).lower()
            self.assertIn("vole", description)
            self.assertIn("vie", description)
            self.assertTrue("redistrib" in description or "redonne" in description)
            self.assertEqual(result["behavior"], "health_steal_redistribute")
            self.assertTrue(result["resolved"])
            self.assertEqual(result["evidence"]["proofLevel"], "confirmed")
            self.assertEqual(result["percentageBasis"], "unresolved")
            self.assertEqual(result["engineFormula"], "unresolved")

        expected_matches = {"10_5_0": 50, "10_6_3": 49}
        self.assertEqual(matched, expected_matches[self.game_version])

    def test_partial_text_claims_do_not_resolve_the_behavior(self):
        by_pointer = {a["source"]["pointer"]: a for a in self.actions.values()}
        matched = 0
        for pointer, reviewed in PARTIAL_OFFICIAL_TEXT_SIGNATURES.items():
            action = by_pointer.get(pointer)
            if not action or _raw_fingerprint(action["raw"]) != reviewed["sha256"]:
                continue
            matched += 1
            result = normalize_health_redistribute(action)
            parts = pointer.strip("/").split("/")
            ability = self.official_presentations[parts[1]]["abilityKit"][parts[2]]
            description = " ".join(level.get("description", "") for level in ability.get("levels", {}).values())
            description = re.sub(r"<[^>]+>", "", description).lower()
            self.assertIn("vole", description)
            self.assertIn("vie", description)
            self.assertEqual(result["behavior"], "detected")
            self.assertFalse(result["resolved"])
            self.assertEqual(result["evidence"]["proofLevel"], "partially_confirmed")
            self.assertIn("assertion", result["evidence"])
        self.assertEqual(matched, 5)

    def test_standalone_stat_modifier_is_unchanged(self):
        # Removing only this family's source actions must leave every other
        # normalized operation byte-for-byte equivalent as structured data.
        mechanics = copy.deepcopy(self.mechanics)
        for action in mechanics["actions"]:
            if action["id"] in self.actions:
                action["rawType"] = "health_redistribute_unhandled_for_regression_test"
        baseline = normalize_mechanics(mechanics)
        self.assertEqual([o for o in self.capabilities["operations"] if o["kind"] != "health_redistribute"], baseline["operations"])
        expected_stat_modifier_operations = {"10_5_0": 4198, "10_6_3": 4415}
        self.assertEqual(
            sum(o["kind"] == "stat_modifier" for o in baseline["operations"]),
            expected_stat_modifier_operations[self.game_version],
        )


if __name__ == "__main__":
    unittest.main()
