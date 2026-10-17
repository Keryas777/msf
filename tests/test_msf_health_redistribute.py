"""Lossless corpus contract and deliberately fail-closed health interpretation."""
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import re
import unittest

from scripts.msf_capabilities_normalizer.health_redistribute import (
    PARTIAL_OFFICIAL_TEXT_SIGNATURES,
    REVIEWED_OFFICIAL_TEXT_SIGNATURES,
    REVIEWED_OFFICIAL_TEXT_SIGNATURE_VARIANTS,
    REVIEWED_USER_VALIDATED_SIGNATURES,
    REVIEWED_PUBLISHED_SELF_SIGNATURES,
    REVIEWED_COMPARATIVE_SIGNATURES,
    REVIEWED_COMPARATIVE_REFERENCES,
    REVIEWED_PLAYABLE_LINKED_SUMMON_SIGNATURES,
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
        self.assertEqual(
            Counter(o["healthRedistribute"]["behavior"] for o in self.operations),
            Counter({
                "health_loss": 98,
                "health_steal_redistribute": 104,
                "detected": 17,
                "health_equalize": 8,
                "health_transfer_allies": 3,
            }),
        )
        self.assertEqual(sum(o["healthRedistribute"]["engineFormula"] == "unresolved"
                             for o in self.operations), 230)
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
        self.assertEqual(len(PARTIAL_OFFICIAL_TEXT_SIGNATURES), 0)
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
            self.assertIsNone(result["evidence"]["sourceVersionVerified"])
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
        self.assertEqual(matched, 0)

    def test_three_published_self_restitutions_are_fingerprint_gated(self):
        self.assertEqual(len(REVIEWED_PUBLISHED_SELF_SIGNATURES), 3)
        by_pointer = {a["source"]["pointer"]: a for a in self.actions.values()}
        for pointer, reviewed in REVIEWED_PUBLISHED_SELF_SIGNATURES.items():
            with self.subTest(pointer=pointer):
                action = by_pointer[pointer]
                self.assertEqual(_raw_fingerprint(action["raw"]), reviewed["sha256"])
                result = normalize_health_redistribute(action)
                self.assertEqual(result["behavior"], "health_steal_redistribute")
                self.assertTrue(result["resolved"])
                self.assertEqual(result["evidence"]["proofLevel"], "confirmed")
                self.assertEqual(result["evidence"]["recipient"], "self")
                self.assertEqual(result["evidence"]["recipientEvidence"], reviewed["recipientEvidence"])
                self.assertEqual(result["evidence"]["sourceUrl"], reviewed["sourceUrl"])
                self.assertEqual(result["evidence"]["rule"], "reviewed_published_english_self_restitution")
                self.assertFalse(result["evidence"]["sourceVersionVerified"])
                self.assertEqual(result["percentageBasis"], "unresolved")
                self.assertEqual(result["engineFormula"], "unresolved")
                self.assertEqual(result["rawAction"], action["raw"])
                self.assertEqual(result["selectors"]["to"]["raw"], {"relation": "ally"})
                changed = copy.deepcopy(action)
                changed["raw"]["drain_pct"] = [99]
                fallback = normalize_health_redistribute(changed)
                self.assertEqual(fallback["behavior"], "detected")
                self.assertFalse(fallback["resolved"])
                self.assertNotIn("recipient", fallback["evidence"])

    def test_quasar_user_reviewed_self_restitution_is_fingerprint_gated(self):
        self.assertEqual(len(REVIEWED_USER_VALIDATED_SIGNATURES), 2)
        by_pointer = {a["source"]["pointer"]: a for a in self.actions.values()}
        for pointer, reviewed in REVIEWED_USER_VALIDATED_SIGNATURES.items():
            with self.subTest(pointer=pointer):
                action = by_pointer[pointer]
                self.assertEqual(_raw_fingerprint(action["raw"]), reviewed["sha256"])
                result = normalize_health_redistribute(action)
                self.assertEqual(result["behavior"], "health_steal_redistribute")
                self.assertTrue(result["resolved"])
                self.assertEqual(result["evidence"]["rule"], "reviewed_user_validated_self_restitution")
                self.assertEqual(result["evidence"]["recipient"], "self")
                self.assertEqual(result["evidence"]["recipientEvidence"], "project_owner_validation")
                self.assertFalse(result["evidence"]["sourceVersionVerified"])
                self.assertEqual(result["percentageBasis"], "unresolved")
                self.assertEqual(result["engineFormula"], "unresolved")
                self.assertEqual(result["rawAction"], action["raw"])
                self.assertEqual(result["selectors"]["to"]["raw"], {"relation": "ally"})
                changed = copy.deepcopy(action)
                changed["raw"]["drain_pct"] = [99]
                fallback = normalize_health_redistribute(changed)
                self.assertEqual(fallback["behavior"], "detected")
                self.assertNotIn("recipient", fallback["evidence"])

    def test_msfbase_playable_correspondences_are_fingerprint_gated(self):
        self.assertEqual(len(REVIEWED_COMPARATIVE_SIGNATURES), 30)
        self.assertEqual(
            Counter(item["tier"] for item in REVIEWED_COMPARATIVE_SIGNATURES.values()),
            Counter({"direct": 18, "technical_correlated": 12}),
        )
        by_pointer = {a["source"]["pointer"]: a for a in self.actions.values()}
        for pointer, signature in REVIEWED_COMPARATIVE_SIGNATURES.items():
            with self.subTest(pointer=pointer):
                action = by_pointer[pointer]
                self.assertEqual(_raw_fingerprint(action["raw"]), signature["sha256"])
                self.assertNotIn("PVE_", pointer)
                reference = REVIEWED_COMPARATIVE_REFERENCES[signature["ref"]]
                result = normalize_health_redistribute(action)
                self.assertEqual(result["behavior"], "health_steal_redistribute")
                self.assertTrue(result["resolved"])
                self.assertEqual(result["evidence"]["recipient"], signature["recipient"])
                self.assertEqual(result["evidence"]["sourceUrl"], reference["url"])
                self.assertEqual(result["evidence"]["technicalContext"], signature["context"])
                self.assertEqual(
                    result["evidence"]["proofLevel"],
                    "confirmed" if signature["tier"] == "direct" else "corroborated",
                )
                self.assertEqual(
                    result["evidence"]["rule"],
                    "reviewed_comparative_direct_description"
                    if signature["tier"] == "direct"
                    else "reviewed_comparative_technical_context",
                )
                self.assertFalse(result["evidence"]["sourceVersionVerified"])
                self.assertEqual(result["percentageBasis"], "unresolved")
                self.assertEqual(result["engineFormula"], "unresolved")
                self.assertEqual(result["rawAction"], action["raw"])
                self.assertEqual(result["selectors"]["to"]["raw"], action["raw"]["to"])
                changed = copy.deepcopy(action)
                changed["raw"]["drain_pct"] = [999]
                fallback = normalize_health_redistribute(changed)
                self.assertEqual(fallback["behavior"], "detected")
                self.assertNotIn("recipient", fallback["evidence"])

        shadow = [x for x in REVIEWED_COMPARATIVE_SIGNATURES if x.split("/")[2]
                  in {"AncientOne", "DoctorStrange", "EmmaFrostXMen", "Moondragon"}]
        self.assertEqual(len(shadow), 12)
        self.assertTrue(all(REVIEWED_COMPARATIVE_SIGNATURES[x]["recipient"]
                            == "possessed_character" for x in shadow))
        self.assertEqual(REVIEWED_COMPARATIVE_REFERENCES["shadow"]["source"],
                         "official_ability_text")
        # Safety is a technical context, never silently merged with Basic.
        for pointer, signature in REVIEWED_COMPARATIVE_SIGNATURES.items():
            if signature["context"] == "safety_assist_counter":
                self.assertIn("/safety/", pointer)

    def test_playable_linked_summons_are_reviewed_not_pve(self):
        self.assertEqual(len(REVIEWED_PLAYABLE_LINKED_SUMMON_SIGNATURES), 2)
        by_pointer = {a["source"]["pointer"]: a for a in self.actions.values()}
        catalog = {
            item["id"]: item for item in json.loads(
                (ROOT / "docs/data/msf-characters.json").read_text()
            )
        }
        expected = {
            "DarkPhoenix": ("Phoenix", "ally", "health_steal_redistribute", "enemy"),
            "Void": ("Sentry", "enemy", "health_transfer_allies", "ally"),
        }
        for pointer, review in REVIEWED_PLAYABLE_LINKED_SUMMON_SIGNATURES.items():
            with self.subTest(pointer=pointer):
                char = pointer.split("/")[2]
                parent, side, family, donor = expected[char]
                self.assertEqual(review["parentCharacterId"], parent)
                self.assertTrue(catalog[parent]["player_Character"])
                self.assertFalse(catalog[char]["player_Character"])
                self.assertEqual((review["summonedSide"], review["behavior"],
                                  review["sourceRelation"]), (side, family, donor))
                # The official playable parent abilities identify this summon.
                passive = self.official_presentations[parent]["abilityKit"]["passive"]
                passive_text = " ".join(
                    level.get("description", "") for level in passive["levels"].values()
                ).lower()
                self.assertIn("void" if char == "Void" else "phénix noir", passive_text)
                action = by_pointer[pointer]
                self.assertEqual(_raw_fingerprint(action["raw"]), review["sha256"])
                result = normalize_health_redistribute(action)
                self.assertTrue(result["resolved"])
                self.assertEqual(result["behavior"], family)
                self.assertEqual(result["evidence"]["rule"], "reviewed_playable_linked_summon")
                self.assertEqual(result["evidence"]["proofLevel"], "corroborated")
                self.assertEqual(result["evidence"]["playableParentCharacterId"], parent)
                self.assertEqual(result["evidence"]["summonedSide"], side)
                self.assertEqual(result["evidence"]["sourceRelation"], donor)
                self.assertEqual(result["evidence"]["recipient"], "self")
                self.assertFalse(result["evidence"]["sourceVersionVerified"])
                self.assertEqual(result["percentageBasis"], "unresolved")
                self.assertEqual(result["engineFormula"], "unresolved")
                self.assertEqual(result["rawAction"], action["raw"])
                self.assertEqual(result["selectors"]["from"]["raw"], action["raw"]["from"])
                self.assertEqual(result["selectors"]["to"]["raw"], action["raw"]["to"])
                changed = copy.deepcopy(action)
                changed["raw"]["drain_pct"] = [999]
                fallback = normalize_health_redistribute(changed)
                self.assertEqual(fallback["behavior"], "detected")
                self.assertFalse(fallback["resolved"])
                self.assertNotIn("playableParentCharacterId", fallback["evidence"])

    def test_all_residual_unresolved_actions_are_technical_or_pve(self):
        ledger = json.loads(
            (ROOT / "data/msf-capabilities/health-redistribute-review-ledger-10.6.3.json").read_text()
        )
        self.assertEqual(len(ledger["entries"]), 17)
        self.assertTrue(all(item["unitClass"] == "technical_or_nonplayable"
                            for item in ledger["entries"]))
        for entry in ledger["entries"]:
            operation = next(o for o in self.operations
                             if o["healthRedistribute"]["evidence"]["sourcePointer"]
                             == entry["sourcePointer"])
            self.assertEqual(operation["healthRedistribute"]["behavior"], "detected")
            self.assertFalse(operation["healthRedistribute"]["resolved"])
        self.assertEqual(
            Counter(entry["characterId"] for entry in ledger["entries"]),
            Counter({
                "PVE_ChaosRaid_ShadowKing": 3,
                "PVE_EbonyMaw_Gauntlet": 5, "PVE_LokiTeen_DestroyerBoss": 1,
                "PVE_Odin_DestroyerBoss": 4, "PVE_SagaBoss_ShadowKing": 3,
                "VampireSupport": 1,
            }),
        )

    def test_oath_1063_changed_signature_is_revalidated_by_current_text(self):
        pointer = "/Data/Oath/special/actions/0"
        action = next(a for a in self.actions.values() if a["source"]["pointer"] == pointer)
        variant = REVIEWED_OFFICIAL_TEXT_SIGNATURE_VARIANTS[pointer]
        self.assertEqual(_raw_fingerprint(action["raw"]), variant["sha256"])
        result = normalize_health_redistribute(action)
        self.assertEqual(result["behavior"], "health_steal_redistribute")
        self.assertTrue(result["resolved"])
        self.assertEqual(result["evidence"]["sourceGameVersion"], "10_6_3")
        self.assertFalse(result["evidence"]["sourceVersionVerified"])
        description = " ".join(
            level.get("description", "")
            for level in self.official_presentations["Oath"]["abilityKit"]["special"]["levels"].values()
        ).lower()
        self.assertIn("vole", description)
        self.assertIn("vie", description)
        self.assertIn("redistrib", description)
        self.assertEqual(result["percentageBasis"], "unresolved")
        self.assertEqual(result["engineFormula"], "unresolved")

    def test_unverified_source_provenance_and_resource_integrity(self):
        manifest = self.source_manifest
        self.assertEqual(manifest["game"]["version"], "10_6_3")
        self.assertEqual(manifest["game"]["build"], "1674780")
        self.assertFalse(manifest["game"]["versionVerified"])
        self.assertFalse(manifest["catalog"]["gameVersionVerified"])
        self.assertEqual(manifest["catalog"]["resourceCount"], 11)
        for resource in manifest["resources"]:
            path = ROOT / "data/msf-capabilities" / resource["file"]
            content = path.read_bytes()
            with self.subTest(resource=resource["id"]):
                self.assertEqual(len(content), resource["sizeBytes"])
                self.assertEqual(hashlib.md5(content).hexdigest(), resource["md5"])
                self.assertEqual(hashlib.sha256(content).hexdigest(), resource["sha256"])
                self.assertEqual(resource["sourceGameVersion"], None)
                self.assertEqual(resource["sourceType"], "magneticzero")

    def test_unresolved_review_ledger_covers_current_signatures(self):
        ledger = json.loads(
            (ROOT / "data/msf-capabilities/health-redistribute-review-ledger-10.6.3.json").read_text()
        )
        self.assertEqual(ledger["corpus"]["version"], self.game_version)
        self.assertFalse(ledger["corpus"]["versionVerified"])
        entries = {entry["sourcePointer"]: entry for entry in ledger["entries"]}
        playable_catalog = {
            item["id"]: item for item in json.loads((ROOT / "docs/data/msf-characters.json").read_text())
        }
        unresolved = {
            operation["healthRedistribute"]["evidence"]["sourcePointer"]: operation
            for operation in self.operations
            if operation["healthRedistribute"]["behavior"] == "detected"
        }
        self.assertEqual(set(entries), set(unresolved))
        self.assertEqual(Counter(entry["knowledgeLevel"] for entry in entries.values()),
                         Counter({"B": 0, "C": 17}))
        for pointer, operation in unresolved.items():
            entry = entries[pointer]
            with self.subTest(pointer=pointer):
                self.assertEqual(entry["sourceActionId"], operation["sourceActionId"])
                self.assertEqual(entry["rawFingerprintSha256"],
                                 _raw_fingerprint(operation["healthRedistribute"]["rawAction"]))
                self.assertEqual(entry["rawAction"], operation["healthRedistribute"]["rawAction"])
                player_flag = playable_catalog[entry["characterId"]]["player_Character"]
                expected_class = "playable" if player_flag else "technical_or_nonplayable"
                self.assertEqual(entry["unitClass"], expected_class)

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
