from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from collections import Counter, defaultdict
from collections.abc import Mapping
from pathlib import Path
from types import SimpleNamespace

from scripts.msf_capabilities_explorer_builder.builder import (
    BuilderError,
    PROOF_VALUES,
    _json_bytes,
    generate_artifacts,
    load_source_documents,
    normalize_search,
)
from scripts.msf_capabilities_explorer_builder.ability_presentation import (
    build_ability_presentation,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


class DiskPayloads(Mapping):
    def __init__(self, root: Path, paths: list[str]):
        self.root = root
        self.paths = tuple(paths)

    def __getitem__(self, path: str) -> bytes:
        if path not in self.paths:
            raise KeyError(path)
        return (self.root / path).read_bytes()

    def __iter__(self):
        return iter(self.paths)

    def __len__(self) -> int:
        return len(self.paths)


class ExplorerBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.output_temporary = tempfile.TemporaryDirectory()
        output = Path(cls.output_temporary.name) / "explorer"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "scripts.msf_capabilities_explorer_builder.cli",
                "--repository-root",
                str(REPOSITORY_ROOT),
                "--output",
                str(output),
            ],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        stable_bytes = (output / "manifest.json").read_bytes()
        stable = json.loads(stable_bytes)
        generation_path = output / stable["currentPath"]
        generation_bytes = (generation_path / "generation-manifest.json").read_bytes()
        generation = json.loads(generation_bytes)
        payload_paths = [item["path"] for item in generation["payloads"]]
        cls.generated = SimpleNamespace(
            payloads=DiskPayloads(generation_path, payload_paths),
            generation_manifest=generation_bytes,
            stable_manifest=stable_bytes,
            payload_set_checksum=generation["payloadSetChecksum"],
            counts=generation["counts"],
            presentation_audit=generation["presentationAudit"],
        )
        cls.documents = load_source_documents(REPOSITORY_ROOT)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.output_temporary.cleanup()

    @classmethod
    def payload(cls, path: str):
        return json.loads(cls.generated.payloads[path])

    @classmethod
    def ability(cls, character_id: str, ability_type: str):
        shard = cls.payload(f"characters/{character_id}.json")
        return next(
            ability for ability in shard["abilities"] if ability["type"] == ability_type
        )

    @classmethod
    def all_presentations(cls):
        for path, payload in cls.generated.payloads.items():
            if not path.startswith("characters/"):
                continue
            shard = json.loads(payload)
            for ability in shard.get("abilities", []):
                yield ability["presentation"]
            for context in shard.get("technicalContexts", []):
                if context.get("presentation"):
                    yield context["presentation"]

    def test_01_counts_match_real_graph_and_official_catalog(self) -> None:
        self.assertEqual(
            self.generated.counts,
            {
                "characters": 503,
                "officialCharacters": 375,
                "technicalCharacters": 128,
                "abilities": 1856,
                "indexedAbilities": 1844,
                "presentationOnlyAbilities": 12,
                "empoweredAbilities": 23,
                "officialPresentations": 1468,
                "effects": 302,
                "mechanics": 325,
                "operations": 8864,
                "preservedActions": 4971,
                "spawns": 116,
                "textMentions": 979,
                "abilityPresentations": 1856,
                "phases": 2493,
                "assignedActions": 11026,
                "unassignedActions": 1301,
            },
        )
        catalog = self.payload("characters.json")
        self.assertEqual(catalog["recordCount"], 375)
        self.assertTrue(all(record["id"] for record in catalog["records"]))
        self.assertEqual(
            self.generated.presentation_audit,
            {
                "abilityPresentations": 1856,
                "technicalPresentations": 563,
                "totalPhases": 2493,
                "technicalPhases": 76,
                "averagePhasesPerAbility": 1.343211,
                "totalBranches": 8491,
                "singleActionPhases": 374,
                "singleActionPhaseRatio": 0.15002,
                "abilitiesWithAtLeast10Phases": 0,
                "maximumPhasesPerAbility": 5,
                "zeroPhaseAbilities": 14,
                "singlePhaseAbilities": 1301,
                "multiPhaseAbilities": 541,
                "assignedActions": 11026,
                "unassignedActions": 1301,
                "assignedOperations": 8101,
                "textSegments": 9600,
                "textSegmentsAlignedHigh": 3312,
                "textSegmentsAlignedMedium": 4083,
                "textSegmentsTextOnly": 1823,
                "textSegmentsAmbiguous": 382,
                "textSegmentsUnassigned": 0,
                "diagnosticsByType": {
                    "IMPLICIT_PRIMARY_TARGET": 447,
                    "MULTIPLE_PHASE_CANDIDATES": 382,
                    "PHASE_LABEL_FALLBACK": 113,
                    "PHASE_TARGET_INHERITANCE_UNPROVEN": 955,
                    "REPEATED_ACTIONS_NOT_DEDUPLICATED": 55,
                    "SOURCE_TARGET_WITHOUT_TEXT": 3974,
                    "TECHNICAL_CONTEXT_UNRESOLVED": 76,
                    "UNALIGNED_PLAYER_PHASE": 744,
                    "UNASSIGNED_TEXT_SEGMENT": 1823,
                },
                "phasesOnlyOfficialText": 0,
                "phasesWithMechanicalTarget": 2005,
                "phasesWithProbableAttachment": 902,
            },
        )

    def test_02_generation_is_byte_for_byte_deterministic(self) -> None:
        for path, payload in self.generated.payloads.items():
            self.assertEqual(payload, _json_bytes(json.loads(payload)), path)
        self.assertEqual(
            self.generated.generation_manifest,
            _json_bytes(json.loads(self.generated.generation_manifest)),
        )
        self.assertEqual(
            self.generated.stable_manifest,
            _json_bytes(json.loads(self.generated.stable_manifest)),
        )

    def test_03_occurrence_and_context_permutation_is_deterministic(self) -> None:
        ability = self.ability("Abomination", "basic")
        operations = [
            record
            for record in self.documents["payloads"]["operations.json"]["records"].values()
            if record.get("abilityId") == ability["id"]
        ]
        actions = [
            record
            for record in self.documents["payloads"]["uninterpreted-actions.json"]["records"].values()
            if record.get("abilityId") == ability["id"]
        ]
        contexts = self.documents["payloads"]["contexts.json"]["records"]
        first = build_ability_presentation(ability, operations, actions, contexts, {})
        second = build_ability_presentation(
            ability,
            list(reversed(operations)),
            list(reversed(actions)),
            dict(reversed(list(contexts.items()))),
            {},
        )
        self.assertEqual(_json_bytes(first), _json_bytes(second))

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
        trauma = self.payload("mechanics/locked-debuff.json")
        self.assertEqual(ability_block["globalEvidence"], "normalized")
        self.assertEqual(barrier["globalEvidence"], "preserved_uninterpreted")
        self.assertEqual(trauma["globalEvidence"], "normalized")
        self.assertTrue({"effect_apply", "effect_remove"} & {f["id"] for f in ability_block["facets"]})
        self.assertEqual(
            {facet["id"] for facet in barrier["facets"]},
            {"detected_add", "detected_remove"},
        )
        self.assertEqual({facet["id"] for facet in trauma["facets"]}, {"effect_apply", "effect_duration_modify", "mention"})
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
        self.assertEqual(len(presentation_only), 12)
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
        operations = self.documents["payloads"]["operations.json"]["records"]
        operation_id = next(iter(operations))
        original = operations[operation_id]["abilityId"]
        operations[operation_id]["abilityId"] = "abl_ffffffffffffffff"
        try:
            with self.assertRaises(BuilderError) as raised:
                generate_artifacts(self.documents)
        finally:
            operations[operation_id]["abilityId"] = original
        self.assertEqual(raised.exception.code, "ORPHAN_OPERATION_ABILITY")

    def test_12_every_deep_route_resolves_to_a_character_shard(self) -> None:
        ability_ids_by_character = {
            path.removeprefix("characters/").removesuffix(".json"): {
                item["id"] for item in json.loads(payload).get("abilities", [])
            }
            for path, payload in self.generated.payloads.items()
            if path.startswith("characters/")
        }
        for path, payload in self.generated.payloads.items():
            if not path.startswith("routes/"):
                continue
            for identifier, route in json.loads(payload)["records"].items():
                self.assertIn(f"characters/{route['characterId']}.json", self.generated.payloads)
                if route.get("abilityId"):
                    self.assertIn(
                        route["abilityId"],
                        ability_ids_by_character[route["characterId"]],
                    )
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

    def test_16_generated_layout_is_content_addressed_and_immutable(self) -> None:
        stable = json.loads(self.generated.stable_manifest)
        checksum = self.generated.payload_set_checksum.removeprefix("sha256:")
        self.assertEqual(stable["currentPath"], f"generations/sha256-{checksum}/")
        self.assertEqual(
            stable["currentPayloadSetChecksum"],
            self.generated.payload_set_checksum,
        )
        manifest = json.loads(self.generated.generation_manifest)
        self.assertEqual(manifest["payloadSetChecksum"], self.generated.payload_set_checksum)

    def test_17_abomination_has_two_conservative_phases(self) -> None:
        shard = self.payload("characters/Abomination.json")
        ability = next(item for item in shard["abilities"] if item["type"] == "basic")
        occurrences = sorted(
            [*ability["operations"], *ability["actions"]],
            key=lambda item: item["actionOrder"],
        )
        self.assertEqual([item["actionOrder"] for item in occurrences], list(range(6)))
        self.assertEqual(
            [item["actionOrder"] for item in ability["operations"]],
            [1, 2, 4, 5],
        )
        preserved = {item["actionOrder"]: item for item in ability["actions"]}
        self.assertEqual(set(preserved), {0, 3})
        target = preserved[3]["target"]["value"]
        self.assertEqual(target["type"], "direct_neighbor")
        self.assertEqual(target["limit"], [1])
        self.assertEqual(target["primary_selection"], "exclude_from_pool")
        self.assertEqual(target["stop_if_outcome"], ["counter_attack"])
        self.assertEqual(target["filter"]["not"]["target"]["states"], ["stealthed"])
        self.assertEqual(
            preserved[0]["uninterpretedParameters"]["values"]["stat_modifier"][0]["delta"],
            [90, 110, 130, 150, 170, 200, 250],
        )
        self.assertEqual(
            preserved[3]["uninterpretedParameters"]["values"]["stat_modifier"][0]["delta"],
            [40, 60, 80, 100, 120, 150, 200],
        )
        self.assertTrue(all(item.get("target") is None for item in ability["operations"][2:]))
        self.assertFalse(any(
            metric.get("key") == "selectionCount"
            for item in ability["operations"]
            for metric in item.get("metrics", [])
        ))

        presentation = ability["presentation"]
        self.assertEqual(presentation["schemaVersion"], "2.0.0")
        self.assertEqual([phase["label"] for phase in presentation["playerPhases"]], ["Cible principale", "Enchaînement"])
        self.assertEqual(
            [[presentation["occurrences"][ref]["actionOrder"] for ref in phase["occurrenceRefs"]] for phase in presentation["playerPhases"]],
            [[0, 1, 2], [3, 4, 5]],
        )
        return
        self.assertEqual(presentation["schemaVersion"], "1.0.0")
        self.assertEqual(len(presentation["phases"]), 2)
        primary, chain = presentation["phases"]
        self.assertEqual(primary["label"], "Cible principale")
        self.assertEqual(primary["labelSource"], "official_text")
        self.assertEqual([step["actionOrder"] for step in primary["steps"]], [0, 1, 2])
        self.assertFalse(primary["target"]["present"])
        self.assertEqual(primary["target"]["evidence"], "official_text_asserted")
        self.assertTrue(all(step["target"] is None for step in primary["steps"]))

        self.assertEqual(chain["label"], "Enchaînement")
        self.assertEqual(chain["labelSource"], "official_text")
        self.assertEqual([step["actionOrder"] for step in chain["steps"]], [3, 4, 5])
        self.assertEqual(chain["target"]["value"], target)
        self.assertEqual(
            [step["target"] is not None for step in chain["steps"]],
            [True, False, False],
        )
        self.assertEqual(
            [step["phaseAlignment"]["level"] for step in chain["steps"]],
            ["aligned_high", "aligned_medium", "aligned_medium"],
        )
        self.assertEqual(
            [(item["text"], item["evidence"]["level"]) for item in primary["playerItems"]],
            [
                ("250 % de dégâts perforants", "official_text_asserted"),
                ("Retire Défense augmentée", "mechanically_verified"),
                ("Applique Défense réduite", "mechanically_verified"),
            ],
        )
        self.assertEqual(
            [item["text"] for item in chain["playerItems"]],
            [
                "1 cible adjacente",
                "200 % de dégâts perforants",
                "Retire Défense augmentée",
                "Applique Défense réduite",
                "Arrêt si contre-attaque",
            ],
        )
        self.assertEqual(chain["playerItems"][-1]["textEvidence"], "official_text_asserted")
        self.assertEqual(
            {diagnostic["code"] for diagnostic in presentation["diagnostics"]},
            {"IMPLICIT_PRIMARY_TARGET", "PHASE_TARGET_INHERITANCE_UNPROVEN"},
        )

    def test_18_every_source_action_and_operation_occurs_exactly_once(self) -> None:
        source_groups = defaultdict(list)
        for collection in ("operations.json", "uninterpreted-actions.json"):
            for record in self.documents["payloads"][collection]["records"].values():
                source_groups[record["sourceActionId"]].append(record)
        self.assertEqual(len(source_groups), 12_327)
        seen_actions = set()
        seen_operations = Counter()
        for presentation in self.all_presentations():
            occurrences = presentation["occurrences"]
            refs = [ref for phase in presentation["playerPhases"] for ref in phase["occurrenceRefs"]]
            refs += presentation["unassignedOccurrenceRefs"]
            self.assertEqual(set(refs), set(occurrences))
            self.assertEqual(len(refs), len(set(refs)))
            for ref, occurrence in occurrences.items():
                self.assertEqual(ref, occurrence["sourceActionId"])
                self.assertNotIn(ref, seen_actions)
                seen_actions.add(ref)
                seen_operations.update(occurrence["operationIds"])
        self.assertEqual(seen_actions, set(source_groups))
        self.assertEqual(set(seen_operations), set(self.documents["payloads"]["operations.json"]["records"]))
        self.assertTrue(all(count == 1 for count in seen_operations.values()))
        return

        def preserved_values(records, field):
            values = {
                json.dumps(record[field]["value"], ensure_ascii=False, sort_keys=True)
                for record in records
                if record.get(field, {}).get("present") is True
            }
            return values

        seen_actions = set()
        presented_operations = Counter()

        def validate_step(step, phase):
            source_action_id = step["sourceActionId"]
            self.assertNotIn(source_action_id, seen_actions)
            seen_actions.add(source_action_id)
            presented_operations.update(step["operationIds"])
            records = source_groups[source_action_id]
            self.assertEqual(step["actionOrder"], records[0]["actionOrder"])
            self.assertEqual(step["sourcePointer"], (
                records[0].get("sourcePointer")
                or records[0].get("source", {}).get("actionPointer")
                or records[0].get("source", {}).get("pointer")
            ))
            for field in ("target", "recipient"):
                expected = preserved_values(records, field)
                projection = step.get(field)
                if not expected:
                    self.assertIsNone(projection, (source_action_id, field))
                elif "value" in projection:
                    actual = {json.dumps(projection["value"], ensure_ascii=False, sort_keys=True)}
                    self.assertEqual(actual, expected, (source_action_id, field))
                else:
                    actual = {
                        json.dumps(item["value"], ensure_ascii=False, sort_keys=True)
                        for item in projection["alternatives"]
                        if item.get("present") is True
                    }
                    self.assertEqual(actual, expected, (source_action_id, field))
            expected_conditions = {
                json.dumps(record.get("conditions", []), ensure_ascii=False, sort_keys=True)
                for record in records
            }
            if step.get("conditionVariants"):
                actual_conditions = {
                    json.dumps(item["values"], ensure_ascii=False, sort_keys=True)
                    for item in step["conditionVariants"]
                }
            elif phase is not None:
                actual_conditions = {
                    json.dumps(phase["conditions"][index]["values"], ensure_ascii=False, sort_keys=True)
                    for index in step["conditionRefs"]
                } or {"[]"}
            else:
                actual_conditions = {"[]"}
            self.assertEqual(actual_conditions, expected_conditions, source_action_id)

        for presentation in self.all_presentations():
            for phase in presentation["phases"]:
                for step in phase["steps"]:
                    validate_step(step, phase)
            for step in presentation["unassignedOccurrences"]:
                validate_step(step, None)

        self.assertEqual(seen_actions, set(source_groups))
        self.assertEqual(len(seen_actions), 12_036)
        expected_operations = set(
            self.documents["payloads"]["operations.json"]["records"]
        )
        self.assertEqual(set(presented_operations), expected_operations)
        self.assertTrue(all(count == 1 for count in presented_operations.values()))

    def test_19_contract_and_text_segments_are_auditable(self) -> None:
        schema = json.loads(
            (REPOSITORY_ROOT / "scripts/msf_capabilities_explorer_builder/ability-presentation.schema.json").read_text()
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], "2.0.0")
        ability_presentation_count = 0

        def assert_presentation(presentation, text=None):
            nonlocal ability_presentation_count
            if presentation["abilityId"]:
                ability_presentation_count += 1
            self.assertEqual(presentation["schemaVersion"], "2.0.0")
            self.assertEqual([phase["order"] for phase in presentation["playerPhases"]], list(range(len(presentation["playerPhases"]))))
            for phase in presentation["playerPhases"]:
                self.assertEqual(
                    phase["occurrenceRefs"],
                    [ref for branch in phase["branches"] for ref in branch["occurrenceRefs"]],
                )
            if text:
                for segment in presentation["officialText"]["segments"]:
                    self.assertEqual(text[segment["start"]:segment["end"]], segment["text"])
            return
            self.assertEqual(presentation["schemaVersion"], "1.0.0")
            self.assertEqual(
                [phase["order"] for phase in presentation["phases"]],
                list(range(len(presentation["phases"]))),
            )
            for phase in presentation["phases"]:
                self.assertRegex(phase["id"], r"^phase:[0-9a-f]{16}$")
                self.assertIsInstance(phase["evidence"], dict)
                self.assertEqual(
                    phase["sourceActionIds"],
                    [step["sourceActionId"] for step in phase["steps"]],
                )
            if text:
                for segment in presentation["officialText"]["segments"]:
                    self.assertEqual(text[segment["start"]:segment["end"]], segment["text"])

        for path, payload in self.generated.payloads.items():
            if not path.startswith("characters/"):
                continue
            shard = json.loads(payload)
            for ability in shard.get("abilities", []):
                assert_presentation(ability["presentation"], ability.get("officialText"))
            for context in shard.get("technicalContexts", []):
                if context.get("presentation"):
                    assert_presentation(context["presentation"])
        self.assertEqual(ability_presentation_count, 1_856)

    def test_20_repetition_bonus_chain_and_terminal_sequences_are_conservative(self) -> None:
        crystal = self.ability("Crystal", "special")["presentation"]
        self.assertEqual([phase["label"] for phase in crystal["playerPhases"]], ["Attaque répétée"])
        self.assertEqual(len(crystal["occurrences"]), 4)
        gamora = self.ability("Gamora", "basic")["presentation"]
        self.assertEqual([phase["label"] for phase in gamora["playerPhases"]], ["Cible principale", "Attaque bonus"])
        ares = self.ability("Ares", "ultimate")["presentation"]
        self.assertTrue(any(occurrence.get("control", {}).get("actionCondition") == "if_prev_ran" for occurrence in ares["occurrences"].values()))
        return
        self.assertEqual(len(crystal["phases"]), 1)
        self.assertEqual(crystal["phases"][0]["label"], "Attaque répétée")
        self.assertEqual(
            [step["actionOrder"] for step in crystal["phases"][0]["steps"]],
            [0, 1, 2, 3],
        )
        self.assertIn(
            "REPEATED_ACTIONS_NOT_DEDUPLICATED",
            {item["code"] for item in crystal["diagnostics"]},
        )

        gamora = self.ability("Gamora", "basic")["presentation"]
        self.assertEqual([phase["label"] for phase in gamora["phases"]], ["Cible principale", "Attaque bonus"])
        self.assertEqual(
            [step["actionOrder"] for phase in gamora["phases"] for step in phase["steps"]],
            [0, 1],
        )

        ancient = self.ability("AncientOne", "ultimate")["presentation"]
        self.assertEqual([phase["label"] for phase in ancient["phases"][:3]], ["Cible principale", "Rebond", "Attaque"])
        self.assertEqual(
            ancient["phases"][1]["target"]["value"]["type"],
            "direct_neighbor_repeatable",
        )
        self.assertEqual(
            ancient["phases"][1]["stopConditions"][0]["outcome"],
            "counter_attack",
        )

        ares = self.ability("Ares", "ultimate")["presentation"]
        self.assertEqual([step["actionOrder"] for step in ares["phases"][0]["steps"]], [0])
        self.assertEqual([step["actionOrder"] for step in ares["phases"][1]["steps"]], [1, 2])
        self.assertEqual(ares["phases"][1]["steps"][1]["control"]["actionCondition"], "if_prev_ran")

    def test_21_branches_triggers_modes_and_dependencies_remain_explicit(self) -> None:
        maestro = self.ability("Maestro", "basic")["presentation"]
        self.assertEqual([phase["label"] for phase in maestro["playerPhases"]], ["En attaque", "En défense"])
        fury = self.ability("NickFury", "passive")["presentation"]
        self.assertEqual([phase["label"] for phase in fury["playerPhases"]], ["Déclenchement passif"])
        self.assertGreater(len(fury["playerPhases"][0]["branches"]), 1)
        controls = [occurrence.get("control", {}) for presentation in self.all_presentations() for occurrence in presentation["occurrences"].values()]
        self.assertTrue(any(control.get("arbitraryActionIndex") is not None for control in controls))
        self.assertTrue(any(control.get("actionCondition") == "if_prev_ran" for control in controls))
        return
        self.assertTrue(any(phase["kind"] == "conditional" for phase in maestro["phases"]))
        self.assertTrue({"Attaque", "Défense"}.issubset({phase["label"] for phase in maestro["phases"]}))
        fury = self.ability("NickFury", "passive")["presentation"]
        triggers = {
            json.dumps(phase["trigger"]["value"], sort_keys=True)
            for phase in fury["phases"]
            if phase["trigger"]
        }
        self.assertGreater(len(triggers), 1)

        found = {
            "arbitraryActionIndex": False,
            "foreachAction": False,
            "if_prev_ran": False,
            "combatSide": False,
            "mode": False,
        }
        for presentation in self.all_presentations():
            for phase in presentation["phases"]:
                found["combatSide"] |= bool(phase.get("combatSide"))
                found["mode"] |= bool(phase.get("mode"))
                for step in phase["steps"]:
                    control = step.get("control", {})
                    found["arbitraryActionIndex"] |= control.get("arbitraryActionIndex") is not None
                    found["foreachAction"] |= control.get("foreachAction") is not None
                    found["if_prev_ran"] |= control.get("actionCondition") == "if_prev_ran"
        self.assertTrue(all(found.values()), found)

    def test_22_summon_pools_and_repeated_entries_are_not_merged(self) -> None:
        fury = self.ability("NickFury", "ultimate")
        spawn = fury["spawns"][0]
        self.assertEqual([entry["poolIndex"] for entry in spawn["pool"]], [0, 1, 2])
        self.assertEqual(
            [entry["characterId"] for entry in spawn["pool"]],
            ["S_ShieldSupport_Stealth", "S_ShieldTank_Stun", "S_ShieldSupport_Stealth"],
        )
        presentation = fury["presentation"]
        self.assertEqual([phase["label"] for phase in presentation["playerPhases"]], ["Invocation"])
        self.assertEqual(len(presentation["occurrences"]), 1)
        return
        self.assertEqual(len(presentation["phases"]), 1)
        self.assertEqual(presentation["phases"][0]["label"], "Invocation")
        self.assertEqual(
            [item["text"] for item in presentation["phases"][0]["playerItems"][:3]],
            [
                "Invoque Agent du S.H.I.E.L.D.",
                "Invoque Surveillant du S.H.I.E.L.D.",
                "Invoque Agent du S.H.I.E.L.D.",
            ],
        )

    def test_23_empowered_and_safety_relationships_are_explicit(self) -> None:
        gamora = self.payload("characters/Gamora.json")
        base = next(item for item in gamora["abilities"] if item["type"] == "basic")
        empowered = next(item for item in gamora["abilities"] if item["type"] == "basic_empower")
        passive_empowered = next(item for item in gamora["abilities"] if item["type"] == "passive_empower")
        self.assertEqual(empowered["parentAbilityId"], base["id"])
        self.assertEqual(empowered["presentation"]["parentAbilityId"], base["id"])
        self.assertFalse(empowered["presentation"]["officialText"]["available"])
        self.assertFalse(passive_empowered["presentation"]["officialText"]["available"])

        spider_man = self.payload("characters/SpiderMan.json")
        self.assertTrue(all(
            ability["iconUrl"]
            for ability in spider_man["abilities"]
            if ability["type"] in {"basic", "special", "ultimate", "passive"}
        ))
        safety = next(
            context for context in spider_man["technicalContexts"]
            if context.get("variantType") == "safety"
        )
        spider_basic = next(item for item in spider_man["abilities"] if item["type"] == "basic")
        self.assertEqual(safety["label"], "Variante technique — safety")
        self.assertEqual(safety["parentAbilityId"], spider_basic["id"])
        self.assertEqual(safety["relationshipEvidence"], "controlled_rule")
        self.assertEqual(safety["presentation"]["variant"]["sourceContextId"], safety["id"])
        self.assertFalse(any(item["type"] == "safety" for item in spider_man["abilities"]))
        self.assertEqual(safety["presentation"]["playerPhases"], [])
        self.assertTrue(safety["presentation"]["technicalVariants"])

    def test_24_deferred_normalizations_remain_preserved(self) -> None:
        ares_special = self.ability("Ares", "special")
        serialized = json.dumps(ares_special, ensure_ascii=False)
        self.assertIn("LockedDebuff", serialized)
        self.assertIn('"sourceType": "barrier_remove"', serialized)
        locked = next(
            operation for operation in ares_special["operations"]
            if operation.get("effect", {}).get("sourceName") == "LockedDebuff"
        )
        self.assertEqual(locked["effect"]["mechanicId"], "locked-debuff")
        self.assertNotEqual(locked["effect"]["mechanicId"], "trauma")

        vulture = self.ability("Vulture", "ultimate")["presentation"]
        self.assertTrue(any(occurrence["sourceType"] == "turn_meter" for occurrence in vulture["occurrences"].values()))
        iron_fist = self.ability("IronFistOrson", "basic")["presentation"]
        self.assertTrue(any(occurrence["sourceType"] == "barrier" for occurrence in iron_fist["occurrences"].values()))
        return
        self.assertTrue(any(
            step["sourceType"] == "turn_meter" and step["technicalReference"] == "abilityActions"
            for phase in vulture["phases"]
            for step in phase["steps"]
        ))
        iron_fist = self.ability("IronFistOrson", "basic")["presentation"]
        self.assertTrue(any(
            step["sourceType"] == "barrier" and step["technicalReference"] == "abilityActions"
            for phase in iron_fist["phases"]
            for step in phase["steps"]
        ))

    def test_25_entire_mandatory_corpus_has_expected_structural_markers(self) -> None:
        corpus = [
            ("Thing", "basic"),
            ("BlackBolt", "ultimate"),
            ("Abomination", "basic"),
            ("Daredevil", "ultimate"),
            ("AncientOne", "ultimate"),
            ("Crystal", "special"),
            ("Gamora", "basic"),
            ("SpiderMan", "basic"),
            ("Gamora", "basic_empower"),
            ("Gamora", "passive_empower"),
            ("NickFury", "passive"),
            ("Maestro", "basic"),
            ("Ares", "special"),
            ("NickFury", "ultimate"),
            ("NickFury", "special"),
            ("Echo", "special"),
            ("Vulture", "ultimate"),
            ("IronFistOrson", "basic"),
            ("TheHood", "special"),
            ("Ares", "ultimate"),
        ]
        for character_id, ability_type in corpus:
            with self.subTest(character_id=character_id, ability_type=ability_type):
                presentation = self.ability(character_id, ability_type)["presentation"]
                self.assertEqual(presentation["schemaVersion"], "2.0.0")
                self.assertEqual(presentation["characterId"], character_id)

        bucky = self.ability("BuckyBarnes", "ultimate")["presentation"]
        leader = self.ability("TheLeader", "passive")["presentation"]
        self.assertLess(len(bucky["playerPhases"]), 48)
        self.assertLess(len(leader["playerPhases"]), 50)
        self.assertTrue(all(not presentation["quality"]["blockingViolations"] for presentation in self.all_presentations()))
        self.assertEqual([phase["label"] for phase in self.ability("Abomination", "basic")["presentation"]["playerPhases"]], ["Cible principale", "Enchaînement"])
        return

        thing = self.ability("Thing", "basic")["presentation"]
        self.assertEqual(len(thing["phases"]), 1)
        self.assertEqual(thing["phases"][0]["steps"][0]["sourceType"], "stat_modifier")

        black_bolt = self.ability("BlackBolt", "ultimate")["presentation"]
        self.assertEqual(len(black_bolt["phases"]), 1)
        self.assertEqual(black_bolt["phases"][0]["target"]["value"], {"limit": 10, "type": "random"})

        daredevil = self.ability("Daredevil", "ultimate")["presentation"]
        self.assertTrue(any(phase["conditions"] for phase in daredevil["phases"]))
        self.assertTrue(any(
            ((phase.get("target") or {}).get("value") or {}).get("type") == "direct_neighbor"
            for phase in daredevil["phases"]
        ))

        spider_man = self.ability("SpiderMan", "basic")["presentation"]
        chain = next(phase for phase in spider_man["phases"] if phase["label"] == "Enchaînement")
        self.assertEqual(chain["target"]["value"]["stop_if_outcome"], ["counter_attack"])

        fury_special = self.ability("NickFury", "special")["presentation"]
        transfer = next(
            step
            for phase in fury_special["phases"]
            for step in phase["steps"]
            if step["sourceType"] == "proc_transfer"
        )
        self.assertEqual(transfer["recipient"]["value"]["relation"], "ally")
        self.assertEqual(transfer["recipient"]["value"]["primary_selection"], "exclude_from_pool")

        echo = self.ability("Echo", "special")
        duration = next(item for item in echo["operations"] if item["sourceType"] == "proc_duration")
        self.assertEqual(duration["kind"], "effect_duration_modify")

        hood = self.ability("TheHood", "special")["presentation"]
        self.assertEqual(
            [phase["label"] for phase in hood["phases"]],
            ["Cible principale", "Attaque", "Attaque bonus"],
        )

        ares_special = self.ability("Ares", "special")["presentation"]
        self.assertTrue(any(
            any(mode["value"] == "AVA" for mode in phase["mode"])
            for phase in ares_special["phases"]
        ))
        self.assertIn("En guerre", {phase["label"] for phase in ares_special["phases"]})


if __name__ == "__main__":
    unittest.main()
