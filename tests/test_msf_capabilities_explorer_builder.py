from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.msf_capabilities_explorer_builder.builder import (
    BuilderError,
    PROOF_VALUES,
    _json_bytes,
    build_explorer,
    check_explorer,
    generate_artifacts,
    load_source_documents,
    normalize_search,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


class ExplorerBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.documents = load_source_documents(REPOSITORY_ROOT)
        cls.generated = generate_artifacts(cls.documents)

    @classmethod
    def payload(cls, path: str):
        return json.loads(cls.generated.payloads[path])

    def test_01_counts_match_real_graph_and_official_catalog(self) -> None:
        self.assertEqual(
            self.generated.counts,
            {
                "characters": 499,
                "officialCharacters": 375,
                "technicalCharacters": 124,
                "abilities": 1840,
                "indexedAbilities": 1827,
                "presentationOnlyAbilities": 13,
                "empoweredAbilities": 23,
                "officialPresentations": 1468,
                "effects": 286,
                "mechanics": 310,
                "operations": 8657,
                "preservedActions": 4877,
                "spawns": 116,
                "textMentions": 1081,
            },
        )
        catalog = self.payload("characters.json")
        self.assertEqual(catalog["recordCount"], 375)
        self.assertTrue(all(record["id"] for record in catalog["records"]))

    def test_02_generation_is_byte_for_byte_deterministic(self) -> None:
        second = generate_artifacts(self.documents)
        self.assertEqual(second.payload_set_checksum, self.generated.payload_set_checksum)
        self.assertEqual(second.payloads, self.generated.payloads)
        self.assertEqual(second.generation_manifest, self.generated.generation_manifest)
        self.assertEqual(second.stable_manifest, self.generated.stable_manifest)

    def test_03_root_collection_permutation_is_deterministic(self) -> None:
        permuted = copy.deepcopy(self.documents)
        permuted["presentations"] = list(reversed(permuted["presentations"]))
        permuted["portraits"] = list(reversed(permuted["portraits"]))
        for name in (
            "characters.json",
            "abilities.json",
            "contexts.json",
            "operations.json",
            "spawns.json",
            "uninterpreted-actions.json",
        ):
            records = permuted["payloads"][name]["records"]
            permuted["payloads"][name]["records"] = dict(reversed(list(records.items())))
        effects = permuted["payloads"]["effects.json"]["catalog"]["byEffectId"]
        permuted["payloads"]["effects.json"]["catalog"]["byEffectId"] = dict(
            reversed(list(effects.items()))
        )
        result = generate_artifacts(permuted)
        self.assertEqual(result.payload_set_checksum, self.generated.payload_set_checksum)
        self.assertEqual(result.payloads, self.generated.payloads)

    def test_04_manifest_checksums_cover_every_payload(self) -> None:
        manifest = json.loads(self.generated.generation_manifest)
        inventory = manifest["payloads"]
        self.assertEqual(manifest["payloadCount"], len(self.generated.payloads))
        self.assertEqual([item["path"] for item in inventory], sorted(self.generated.payloads))
        for item in inventory:
            payload = self.generated.payloads[item["path"]]
            self.assertEqual(item["sizeBytes"], len(payload))
            self.assertEqual(item["sha256"], hashlib.sha256(payload).hexdigest())
        expected = "sha256:" + hashlib.sha256(_json_bytes(inventory)).hexdigest()
        self.assertEqual(manifest["payloadSetChecksum"], expected)
        self.assertEqual(self.generated.payload_set_checksum, expected)

    def test_05_aliases_accents_apostrophes_and_source_names_are_searchable(self) -> None:
        self.assertEqual(normalize_search("L’Homme-absorbant"), "l homme absorbant")
        self.assertEqual(normalize_search("ÉTOURDISSEMENT"), "etourdissement")
        search = self.payload("search.json")["records"]
        ability_block = next(record for record in search if record["id"] == "ability-block")
        self.assertIn("capablock", ability_block["aliases"])
        self.assertEqual(ability_block["sourceName"], "AbilityBlock")
        heal_block = next(record for record in search if record["id"] == "heal-block")
        self.assertIn("healblock", heal_block["aliases"])

    def test_06_empowered_abilities_follow_their_base_ability(self) -> None:
        thanos = self.payload("characters/Thanos.json")
        ability_types = [ability["type"] for ability in thanos["abilities"]]
        for base in ("basic", "special", "ultimate", "passive"):
            empowered = f"{base}_empower"
            self.assertIn(empowered, ability_types)
            self.assertEqual(ability_types.index(empowered), ability_types.index(base) + 1)
            ability = next(item for item in thanos["abilities"] if item["type"] == empowered)
            self.assertIsNone(ability["iconUrl"])
            self.assertEqual(ability["presentationStatus"], "unavailable")

    def test_07_technical_entities_are_separate_and_spawns_use_exact_joins(self) -> None:
        catalog_ids = {item["id"] for item in self.payload("characters.json")["records"]}
        self.assertNotIn("UltronTank_Taunt", catalog_ids)
        entity = self.payload("characters/UltronTank_Taunt.json")
        self.assertFalse(entity["character"]["playable"])
        self.assertIn(entity["character"]["status"]["kind"], {"summon", "entity", "variant"})
        for path, payload in self.generated.payloads.items():
            if not path.startswith("characters/"):
                continue
            shard = json.loads(payload)
            for spawn in shard.get("invocations", []):
                for pool in spawn["pool"]:
                    if pool["relation"] == "exact":
                        self.assertIn(f"characters/{pool['characterId']}.json", self.generated.payloads)

    def test_08_three_evidence_levels_remain_distinct_per_occurrence(self) -> None:
        ability_block = self.payload("mechanics/ability-block.json")
        barrier = self.payload("mechanics/barrier.json")
        trauma = self.payload("mechanics/trauma.json")
        self.assertEqual(ability_block["globalEvidence"], "normalized")
        self.assertEqual(barrier["globalEvidence"], "preserved_uninterpreted")
        self.assertEqual(trauma["globalEvidence"], "official_text_only")
        self.assertTrue({"effect_apply", "effect_remove"} & {f["id"] for f in ability_block["facets"]})
        self.assertEqual(
            {facet["id"] for facet in barrier["facets"]},
            {"detected_add", "detected_remove"},
        )
        self.assertEqual({facet["id"] for facet in trauma["facets"]}, {"mention"})
        dormammu = self.payload("characters/Dormammu.json")
        eternal_darkness = next(
            ability for ability in dormammu["abilities"] if ability["name"] == "Ténèbres éternelles"
        )
        local_ability_block = next(
            mention
            for mention in eternal_darkness["mentions"]
            if mention["mechanicId"] == "ability-block"
        )
        self.assertEqual(local_ability_block["evidence"], "official_text_only")
        for path, payload in self.generated.payloads.items():
            if not path.startswith("mechanic-results/"):
                continue
            for record in json.loads(payload)["records"]:
                self.assertTrue(set(record["evidence"]).issubset(PROOF_VALUES))
                for occurrence in record["occurrences"]:
                    self.assertIn(occurrence["evidence"], PROOF_VALUES)

    def test_09_official_max_text_is_clean_and_presentations_without_mechanics_survive(self) -> None:
        dormammu = self.payload("characters/Dormammu.json")
        for ability in dormammu["abilities"]:
            if ability["officialText"]:
                self.assertNotIn("<color", ability["officialText"])
                self.assertNotIn("</color", ability["officialText"])
                self.assertTrue(ability["maxLevel"])
        presentation_only = [
            ability
            for path, payload in self.generated.payloads.items()
            if path.startswith("characters/")
            for ability in json.loads(payload).get("abilities", [])
            if ability["id"].startswith("prs_")
        ]
        self.assertEqual(len(presentation_only), 13)
        self.assertTrue(all(item["mechanicsStatus"] == "unavailable" for item in presentation_only))

    def test_10_ability_without_presentation_and_without_mechanics_are_explicit(self) -> None:
        unavailable_presentations = []
        empty_mechanics = []
        for path, payload in self.generated.payloads.items():
            if not path.startswith("characters/"):
                continue
            for ability in json.loads(payload).get("abilities", []):
                if ability["presentationStatus"] == "unavailable":
                    unavailable_presentations.append(ability)
                if ability["mechanicsStatus"] in {"empty", "unavailable"}:
                    empty_mechanics.append(ability)
        self.assertGreaterEqual(len(unavailable_presentations), 23)
        self.assertGreater(len(empty_mechanics), 0)

    def test_11_orphan_relation_is_rejected(self) -> None:
        broken = copy.deepcopy(self.documents)
        operations = broken["payloads"]["operations.json"]["records"]
        operation_id = next(iter(operations))
        operations[operation_id]["abilityId"] = "abl_ffffffffffffffff"
        with self.assertRaises(BuilderError) as raised:
            generate_artifacts(broken)
        self.assertEqual(raised.exception.code, "ORPHAN_OPERATION_ABILITY")

    def test_12_every_deep_route_resolves_to_a_character_shard(self) -> None:
        for path, payload in self.generated.payloads.items():
            if not path.startswith("routes/"):
                continue
            for identifier, route in json.loads(payload)["records"].items():
                self.assertIn(f"characters/{route['characterId']}.json", self.generated.payloads)
                if route.get("abilityId"):
                    character = self.payload(f"characters/{route['characterId']}.json")
                    self.assertIn(route["abilityId"], {item["id"] for item in character["abilities"]})
                self.assertTrue(identifier.startswith(("abl_", "prs_", "op_", "act_")))

    def test_13_browser_payloads_never_reference_operations_json(self) -> None:
        forbidden = b"operations.json"
        self.assertTrue(all(forbidden not in payload for payload in self.generated.payloads.values()))
        bootstrap = self.payload("bootstrap.json")
        self.assertFalse(bootstrap["compatibility"]["operationsJsonBrowserDependency"])

    def test_14_bootstrap_and_shards_are_bounded(self) -> None:
        self.assertLess(len(self.generated.payloads["bootstrap.json"]), 8_000)
        self.assertLess(len(self.generated.payloads["search.json"]), 1_100_000)
        for path, payload in self.generated.payloads.items():
            if path.startswith("mechanic-results/"):
                self.assertLess(len(payload), 150_000, path)
            if path.startswith("mechanics/"):
                self.assertLess(len(payload), 80_000, path)

    def test_15_suggestions_only_target_existing_non_empty_facets(self) -> None:
        suggestions = self.payload("bootstrap.json")["suggestions"]
        self.assertEqual(len(suggestions), 6)
        for suggestion in suggestions:
            shard = self.payload(f"mechanics/{suggestion['id']}.json")
            self.assertIn(suggestion["operation"], {facet["id"] for facet in shard["facets"]})

    def test_16_build_and_check_are_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "explorer"
            built = build_explorer(REPOSITORY_ROOT, output_root=output)
            checked = check_explorer(REPOSITORY_ROOT, output_root=output)
            self.assertEqual(built.payload_set_checksum, checked.payload_set_checksum)
            self.assertEqual(built.counts, checked.counts)
            before = {
                path.relative_to(output).as_posix(): path.read_bytes()
                for path in output.rglob("*")
                if path.is_file()
            }
            check_explorer(REPOSITORY_ROOT, output_root=output)
            after = {
                path.relative_to(output).as_posix(): path.read_bytes()
                for path in output.rglob("*")
                if path.is_file()
            }
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
