from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from scripts.msf_capabilities_normalizer.normalizer import (
    NormalizerError,
    load_mechanics,
    normalize_mechanics,
    serialize_capabilities,
)
from scripts.msf_capabilities_parser.parser import (
    parse_sources,
    serialize_mechanics,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = REPOSITORY_ROOT / "tests/fixtures/msf_capabilities"
CHARACTERS_FIXTURE = FIXTURES / "characters.json"
PROCS_FIXTURE = FIXTURES / "procs.json"
REAL_CHARACTERS = (
    REPOSITORY_ROOT / "data/msf-capabilities/raw/characters.json"
)
REAL_PROCS = REPOSITORY_ROOT / "data/msf-capabilities/raw/procs.json"
REAL_MECHANICS_SHA256 = (
    "37dec7f27cfd491b735b96d82292b55734741783b37ad82d57ec39dfe67e7731"
)


class MsfCapabilitiesNormalizerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mechanics = parse_sources(
            CHARACTERS_FIXTURE,
            PROCS_FIXTURE,
        )
        cls.mechanics_payload = serialize_mechanics(cls.mechanics)
        cls.capabilities = normalize_mechanics(
            cls.mechanics,
            mechanics_payload=cls.mechanics_payload,
        )

    def normalize_copy(self, mutate=None) -> dict:
        mechanics = copy.deepcopy(self.mechanics)
        if mutate is not None:
            mutate(mechanics)
        return normalize_mechanics(
            mechanics,
            mechanics_payload=serialize_mechanics(mechanics),
        )

    def operation(
        self,
        capabilities: dict,
        *,
        source_pointer: str,
        effect_id: str | None = None,
    ) -> dict:
        matches = [
            item
            for item in capabilities["operations"]
            if item["source"]["actionPointer"] == source_pointer
            and (
                effect_id is None
                or (
                    isinstance(item.get("effect"), dict)
                    and item["effect"].get("effectId") == effect_id
                )
            )
        ]
        self.assertEqual(
            len(matches),
            1,
            (source_pointer, effect_id, matches),
        )
        return matches[0]

    def action_mapping(
        self,
        capabilities: dict,
        *,
        source_pointer: str,
    ) -> dict:
        matches = [
            item
            for item in capabilities["actionMappings"]
            if item["source"]["pointer"] == source_pointer
        ]
        self.assertEqual(len(matches), 1, (source_pointer, matches))
        return matches[0]

    def test_root_contract_and_fixture_coverage(self):
        capabilities = self.capabilities
        self.assertEqual(capabilities["schemaVersion"], "1.1.0")

        self.assertEqual(
            capabilities["input"]["parserSchemaVersion"],
            "1.0.0",
        )
        self.assertRegex(
            capabilities["input"]["mechanicsChecksum"],
            r"^sha256:[a-f0-9]{64}$",
        )
        self.assertEqual(len(capabilities["characters"]), 3)
        self.assertEqual(len(capabilities["abilities"]), 9)
        self.assertEqual(len(capabilities["effects"]), 6)
        self.assertEqual(len(capabilities["operations"]), 10)
        self.assertEqual(len(capabilities["actionMappings"]), 14)
        self.assertEqual(
            capabilities["effectIdAliasPolicy"],
            {
                "origin": "effect-id-aliases-v1",
                "genericTrimAllowed": False,
                "rules": [
                    {
                        "rawValue": "Empower ",
                        "resolvedValue": "Empower",
                    }
                ],
            },
        )
        integrity = capabilities["audit"]["integrity"]
        self.assertTrue(integrity["inputUnchanged"])
        self.assertTrue(integrity["aliasPolicyValid"])
        self.assertTrue(
            all(
                value == 0
                for key, value in integrity.items()
                if key.endswith("Count")
            ),
            integrity,
        )

    def test_action_mappings_preserve_structural_contract(self):
        mapping = self.action_mapping(
            self.capabilities,
            source_pointer="/Data/Apocalypse/basic/actions/1",
        )
        expected_fields = {
            "characterId", "abilityType", "contextId", "contextPathIds",
            "actionOrder", "classification", "containerType", "technicalKey",
            "target", "recipient", "conditions", "control", "flags",
            "source", "uninterpretedParameters",
        }
        self.assertTrue(expected_fields <= set(mapping), mapping)
        self.assertEqual(mapping["actionOrder"], 1)
        self.assertEqual(
            mapping["target"],
            {"present": True, "value": {"relation": "enemy"}},
        )
        self.assertIn("values", mapping["uninterpretedParameters"])
        self.assertIn("progressions", mapping["uninterpretedParameters"])

    def test_controlled_alias_is_exact_and_never_a_generic_trim(self):
        def mutate_effect(mechanics, value):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"]
                == "/Data/Apocalypse/passive_empower/0/actions/0"
            )
            action["parameters"]["procs"] = value
            action["raw"]["procs"] = value
            character = next(
                item
                for item in mechanics["characters"]
                if item["characterId"] == "Apocalypse"
            )
            character["raw"]["passive_empower"][0]["actions"][0][
                "procs"
            ] = value

        aliased = self.normalize_copy(
            lambda mechanics: mutate_effect(mechanics, "Empower ")
        )
        aliased_operation = self.operation(
            aliased,
            source_pointer=(
                "/Data/Apocalypse/passive_empower/0/actions/0"
            ),
            effect_id="Empower",
        )
        self.assertEqual(
            {
                key: aliased_operation["effect"][key]
                for key in (
                    "rawValue",
                    "resolvedValue",
                    "resolved",
                    "resolutionMethod",
                    "resolutionOrigin",
                )
            },
            {
                "rawValue": "Empower ",
                "resolvedValue": "Empower",
                "resolved": True,
                "resolutionMethod": "controlled_alias",
                "resolutionOrigin": "effect-id-aliases-v1",
            },
        )
        self.assertEqual(
            aliased_operation["effect"]["source"]["pointer"],
            (
                "/Data/Apocalypse/passive_empower/0/actions/0/procs"
            ),
        )
        self.assertEqual(
            len(aliased["controlledAliasResolutions"]),
            1,
        )

        not_trimmed = self.normalize_copy(
            lambda mechanics: mutate_effect(mechanics, "DefenseUp ")
        )
        exact_operation = self.operation(
            not_trimmed,
            source_pointer=(
                "/Data/Apocalypse/passive_empower/0/actions/0"
            ),
            effect_id="DefenseUp ",
        )
        self.assertEqual(
            exact_operation["effect"]["rawValue"],
            "DefenseUp ",
        )
        self.assertEqual(
            exact_operation["effect"]["resolvedValue"],
            "DefenseUp ",
        )
        self.assertEqual(
            exact_operation["effect"]["resolutionMethod"],
            "exact",
        )
        self.assertIsNone(
            exact_operation["effect"]["resolutionOrigin"]
        )
        self.assertFalse(exact_operation["effect"]["resolved"])
        self.assertEqual(
            not_trimmed["controlledAliasResolutions"],
            [],
        )

    def test_every_source_action_has_one_exhaustive_mapping(self):
        source_action_ids = [
            item["id"] for item in self.mechanics["actions"]
        ]
        mappings = self.capabilities["actionMappings"]
        self.assertEqual(
            [item["sourceActionId"] for item in mappings],
            source_action_ids,
        )
        operation_ids = {
            item["id"] for item in self.capabilities["operations"]
        }
        self.assertEqual(
            {
                operation_id
                for item in mappings
                for operation_id in item["operationIds"]
            },
            operation_ids,
        )
        preserved = self.action_mapping(
            self.capabilities,
            source_pointer="/Data/Apocalypse/basic/actions/1",
        )
        self.assertEqual(
            preserved["status"],
            "preserved_uninterpreted",
        )
        self.assertEqual(preserved["operationIds"], [])

    def test_empower_and_empty_result_are_explicit_control_operations(self):
        cases = (
            (
                "/Data/Apocalypse/basic_empower/actions/0",
                "empower",
                {"present": True, "value": {"relation": "self"}},
                "action_target",
            ),
            (
                "/Data/Apocalypse/passive_visuals/0/actions/0",
                "empty_result",
                {"present": False, "value": None},
                "control",
            ),
        )
        for pointer, kind, target, scope_kind in cases:
            with self.subTest(kind=kind):
                operation = self.operation(
                    self.capabilities,
                    source_pointer=pointer,
                )
                self.assertEqual(operation["kind"], kind)
                self.assertEqual(operation["target"], target)
                self.assertEqual(
                    operation["scope"]["kind"], scope_kind
                )
                self.assertEqual(
                    operation["source"]["actionPointer"], pointer
                )
                self.assertEqual(
                    operation["source"]["valuePointer"], pointer
                )
                mapping = self.action_mapping(
                    self.capabilities,
                    source_pointer=pointer,
                )
                self.assertEqual(mapping["status"], "normalized")
                self.assertEqual(
                    mapping["operationIds"], [operation["id"]]
                )

    def test_abilities_are_autonomous_without_absorbing_technical_contexts(self):
        abilities = self.capabilities["abilities"]
        context_ids = {
            item["id"] for item in self.capabilities["contexts"]
        }
        operation_ids = {
            item["id"] for item in self.capabilities["operations"]
        }
        for ability in abilities:
            self.assertIn(ability["rootContextId"], context_ids)
            self.assertTrue(set(ability["contextIds"]) <= context_ids)
            self.assertTrue(
                set(ability["operationIds"]) <= operation_ids
            )

        ability_types = {item["abilityType"] for item in abilities}
        self.assertIn("passive_empower", ability_types)
        self.assertNotIn("safety", ability_types)
        self.assertNotIn("counter", ability_types)
        safety_context = next(
            item
            for item in self.capabilities["contexts"]
            if item["technicalKey"] == "safety"
        )
        self.assertNotIn(
            safety_context["id"],
            {
                context_id
                for item in abilities
                for context_id in item["contextIds"]
            },
        )
        passive = next(
            item
            for item in abilities
            if item["characterId"] == "Apocalypse"
            and item["abilityType"] == "passive"
        )
        self.assertGreater(len(passive["contextIds"]), 1)

    def test_proc_application_keeps_values_target_conditions_and_source(self):
        operation = self.operation(
            self.capabilities,
            source_pointer="/Data/Apocalypse/basic/actions/0",
            effect_id="DefenseDown",
        )
        self.assertEqual(operation["kind"], "effect_apply")
        self.assertEqual(operation["abilityType"], "basic")
        self.assertEqual(operation["effect"]["catalogCategory"], "debuff")
        self.assertTrue(operation["effect"]["resolved"])
        self.assertEqual(operation["target"], {"present": True, "value": {}})
        self.assertEqual(
            operation["metrics"]["chancePct"]["values"],
            [50, 100],
        )
        self.assertEqual(
            operation["metrics"]["chancePct"]["maxLevelValue"],
            100,
        )
        self.assertEqual(
            operation["metrics"]["useCount"]["values"],
            [1, 2],
        )
        self.assertEqual(
            operation["conditions"][0]["expression"],
            {"mode": "AVA"},
        )
        self.assertEqual(
            operation["source"]["valuePointer"],
            "/Data/Apocalypse/basic/actions/0/procs/0/proc",
        )

    def test_null_target_is_distinct_from_an_implicit_target(self):
        explicit_null = self.operation(
            self.capabilities,
            source_pointer="/Data/Apocalypse/ultimate/actions/0",
            effect_id="DefenseDown",
        )
        implicit = self.operation(
            self.capabilities,
            source_pointer="/Data/Apocalypse/passive/0/actions/0",
            effect_id="DefenseUp",
        )
        self.assertEqual(
            explicit_null["target"],
            {"present": True, "value": None},
        )
        self.assertEqual(
            implicit["target"],
            {"present": False, "value": None},
        )

    def test_alternative_context_keeps_parent_and_duration_operation(self):
        operation = self.operation(
            self.capabilities,
            source_pointer=(
                "/Data/Apocalypse/basic/alternatives/0/actions/0"
            ),
            effect_id="DefenseDown",
        )
        contexts = {
            item["id"]: item for item in self.capabilities["contexts"]
        }
        leaf = contexts[operation["contextId"]]
        self.assertEqual(operation["kind"], "effect_duration_modify")
        self.assertEqual(leaf["containerType"], "ability_alternative")
        self.assertEqual(len(operation["contextPathIds"]), 2)
        self.assertEqual(
            leaf["parentContextId"],
            operation["contextPathIds"][0],
        )
        self.assertEqual(operation["metrics"]["delta"]["values"], [1, 2])

    def test_passive_empower_and_safety_remain_separate(self):
        empowered = self.operation(
            self.capabilities,
            source_pointer="/Data/Apocalypse/passive_empower/0/actions/0",
            effect_id="Empower",
        )
        safety = self.operation(
            self.capabilities,
            source_pointer="/Data/Apocalypse/safety/actions/0",
            effect_id="DefenseUp",
        )
        contexts = {
            item["id"]: item for item in self.capabilities["contexts"]
        }
        self.assertEqual(empowered["abilityType"], "passive_empower")
        self.assertEqual(
            contexts[empowered["contextId"]]["containerType"],
            "passive_trigger",
        )
        self.assertIsNone(safety["abilityType"])
        self.assertEqual(
            contexts[safety["contextId"]]["classification"],
            "technical-review",
        )
        self.assertEqual(
            contexts[safety["contextId"]]["technicalKey"],
            "safety",
        )

    def test_context_boolean_and_level_values_are_normalized_losslessly(self):
        trigger = next(
            item
            for item in self.capabilities["contexts"]
            if item["source"]["pointer"] == "/Data/Apocalypse/passive/1"
        )
        flag = trigger["execution"]["flags"]["execOnStun"]
        self.assertEqual(flag["raw"], "false")
        self.assertIs(flag["value"], False)
        self.assertTrue(flag["valid"])
        self.assertEqual(
            flag["sourcePointer"],
            "/Data/Apocalypse/passive/1/exec_on_stun",
        )

        basic = next(
            item
            for item in self.capabilities["contexts"]
            if item["source"]["pointer"] == "/Data/Apocalypse/basic"
        )
        power = basic["execution"]["values"]["powerMultiplier"]
        self.assertEqual(power["sourceShape"], "scalar")
        self.assertEqual(power["values"], [2])
        self.assertEqual(
            power["sourcePointer"],
            "/Data/Apocalypse/basic/power_mul",
        )

    def test_ability_used_trigger_is_a_qualifier_not_a_boolean(self):
        def mutate(mechanics):
            context = next(
                item
                for item in mechanics["containers"]
                if item["source"]["pointer"]
                == "/Data/Apocalypse/passive/1"
            )
            context["context"]["execOnAbilityUsed"] = ["ultimate"]

        capabilities = self.normalize_copy(mutate)
        context = next(
            item
            for item in capabilities["contexts"]
            if item["source"]["pointer"] == "/Data/Apocalypse/passive/1"
        )
        qualifier = context["execution"]["qualifiers"]["abilityUsed"]
        self.assertEqual(qualifier["value"], ["ultimate"])
        self.assertEqual(
            qualifier["sourcePointer"],
            "/Data/Apocalypse/passive/1/exec_on_ability_used",
        )
        self.assertNotIn(
            "execOnAbilityUsed",
            context["execution"]["flags"],
        )

    def test_parser_diagnostics_are_preserved_as_input_diagnostics(self):
        self.assertEqual(
            self.capabilities["inputDiagnostics"],
            self.mechanics["diagnostics"],
        )
        self.assertIn(
            "UNRESOLVED_PROC_REFERENCE",
            {
                item["code"]
                for item in self.capabilities["inputDiagnostics"]
            },
        )
        self.assertNotIn(
            "/Data/Apocalypse/basic/actions/2",
            {
                item["source"]["actionPointer"]
                for item in self.capabilities["operations"]
            },
        )

    def test_generic_effect_selectors_do_not_invent_effect_ids(self):
        def mutate(mechanics):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"] == "/Data/Alpha/basic/actions/0"
            )
            action["rawType"] = "proc_remove"
            action["parameters"] = {
                "category": "buff",
                "count": [2],
            }

        capabilities = self.normalize_copy(mutate)
        operation = self.operation(
            capabilities,
            source_pointer="/Data/Alpha/basic/actions/0",
        )
        self.assertEqual(operation["kind"], "effect_remove")
        self.assertIsNone(operation["effect"])
        self.assertEqual(operation["selector"]["mode"], "generic")
        self.assertEqual(operation["selector"]["category"], "buff")
        self.assertEqual(
            operation["metrics"]["selectionCount"]["values"],
            [2],
        )

    def test_control_dependency_is_resolved_without_evaluation(self):
        def mutate(mechanics):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"]
                == "/Data/Apocalypse/basic/actions/1"
            )
            action["rawType"] = "proc"
            action["parameters"] = {
                "action_cond": "if_prev_ran",
                "procs": [{"proc": "DefenseUp", "use_count": 1}],
            }

        capabilities = self.normalize_copy(mutate)
        operation = self.operation(
            capabilities,
            source_pointer="/Data/Apocalypse/basic/actions/1",
            effect_id="DefenseUp",
        )
        previous = next(
            item
            for item in self.mechanics["actions"]
            if item["source"]["pointer"]
            == "/Data/Apocalypse/basic/actions/0"
        )
        self.assertEqual(
            operation["control"]["referenceKind"],
            "previous_action",
        )
        self.assertEqual(
            operation["control"]["dependsOnActionId"],
            previous["id"],
        )
        self.assertEqual(
            operation["control"]["actionCondition"],
            "if_prev_ran",
        )

    def test_spawn_without_pool_procs_keeps_the_invocation_visible(self):
        def mutate(mechanics):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"]
                == "/Data/Alpha/basic/actions/0"
            )
            action["rawType"] = "spawn"
            action["target"] = {"relation": "ally"}
            action["targetPresent"] = True
            action["parameters"] = {
                "action_pct": [50, 100],
                "pool": [
                    {
                        "character": "Summon",
                        "count": [1, 2],
                        "spawn_pct": [75, 100],
                    }
                ],
                "custom_flag": "kept",
            }

        capabilities = self.normalize_copy(mutate)
        operation = self.operation(
            capabilities,
            source_pointer="/Data/Alpha/basic/actions/0",
        )
        self.assertEqual(operation["kind"], "spawn")
        self.assertEqual(
            operation["scope"], {"kind": "spawn_invocation"}
        )
        self.assertEqual(
            operation["rawParameters"]["pool"][0],
            {
                "character": "Summon",
                "count": [1, 2],
                "spawn_pct": [75, 100],
            },
        )
        self.assertEqual(
            operation["metrics"]["chancePct"]["values"],
            [50, 100],
        )
        self.assertEqual(
            operation["target"],
            {"present": True, "value": {"relation": "ally"}},
        )
        mapping = self.action_mapping(
            capabilities,
            source_pointer="/Data/Alpha/basic/actions/0",
        )
        self.assertEqual(mapping["operationIds"], [operation["id"]])

    def test_spawn_pool_effects_have_an_explicit_invocation_scope(self):
        def mutate(mechanics):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"] == "/Data/Alpha/basic/actions/0"
            )
            action["rawType"] = "spawn"
            action["parameters"] = {
                "pool": [
                    {
                        "character": "Summon",
                        "procs": [
                            {
                                "proc": "DefenseUp",
                                "use_count": [1, 2],
                                "apply_to_spawned": True,
                                "apply_if": {"mode": "AVA"},
                            }
                        ],
                    }
                ]
            }

        capabilities = self.normalize_copy(mutate)
        operation = self.operation(
            capabilities,
            source_pointer="/Data/Alpha/basic/actions/0",
            effect_id="DefenseUp",
        )
        spawn_operation = next(
            item
            for item in capabilities["operations"]
            if item["source"]["actionPointer"]
            == "/Data/Alpha/basic/actions/0"
            and item["kind"] == "spawn"
        )
        self.assertEqual(
            spawn_operation["scope"], {"kind": "spawn_invocation"}
        )
        self.assertEqual(operation["sourceActionType"], "spawn")
        self.assertEqual(
            operation["scope"],
            {
                "kind": "spawn_pool",
                "poolIndex": 0,
                "spawnedCharacterId": "Summon",
                "applyToSpawned": True,
            },
        )
        self.assertEqual(
            operation["conditions"][0]["expression"],
            {"mode": "AVA"},
        )
        self.assertEqual(
            operation["source"]["valuePointer"],
            "/Data/Alpha/basic/actions/0/pool/0/procs/0/proc",
        )
        mapping = self.action_mapping(
            capabilities,
            source_pointer="/Data/Alpha/basic/actions/0",
        )
        self.assertEqual(
            mapping["operationIds"],
            [spawn_operation["id"], operation["id"]],
        )

    def test_effect_action_families_use_controlled_operation_names(self):
        cases = (
            (
                "proc_transfer",
                {
                    "category": "buff",
                    "onlyprocs": ["DefenseUp"],
                    "recipient": {"relation": "ally"},
                },
                "effect_transfer",
            ),
            (
                "proc_flip",
                {
                    "category": "debuff",
                    "specific_procs": ["DefenseDown"],
                },
                "effect_flip",
            ),
            (
                "proc_duration",
                {
                    "category": "debuff",
                    "only_procs": ["DefenseDown"],
                    "delta": -1,
                },
                "effect_duration_modify",
            ),
        )

        for raw_type, parameters, expected_kind in cases:
            with self.subTest(raw_type=raw_type):
                def mutate(mechanics):
                    action = next(
                        item
                        for item in mechanics["actions"]
                        if item["source"]["pointer"]
                        == "/Data/Alpha/basic/actions/0"
                    )
                    action["rawType"] = raw_type
                    action["parameters"] = copy.deepcopy(parameters)

                capabilities = self.normalize_copy(mutate)
                effect_id = (
                    "DefenseUp"
                    if raw_type == "proc_transfer"
                    else "DefenseDown"
                )
                operation = self.operation(
                    capabilities,
                    source_pointer="/Data/Alpha/basic/actions/0",
                    effect_id=effect_id,
                )
                self.assertEqual(operation["kind"], expected_kind)
                self.assertEqual(operation["selector"]["mode"], "explicit")

    def test_unresolved_and_malformed_references_remain_diagnostic(self):
        def missing_effect(mechanics):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"]
                == "/Data/Apocalypse/basic/actions/0"
            )
            action["parameters"]["procs"][0]["proc"] = "MissingEffect"

        unresolved = self.normalize_copy(missing_effect)
        operation = self.operation(
            unresolved,
            source_pointer="/Data/Apocalypse/basic/actions/0",
            effect_id="MissingEffect",
        )
        self.assertFalse(operation["effect"]["resolved"])
        self.assertIn(
            "UNRESOLVED_EFFECT_REFERENCE",
            {item["code"] for item in unresolved["diagnostics"]},
        )

        def malformed(mechanics):
            action = next(
                item
                for item in mechanics["actions"]
                if item["source"]["pointer"]
                == "/Data/Apocalypse/basic/actions/0"
            )
            action["parameters"]["procs"] = 42

        malformed_output = self.normalize_copy(malformed)
        generic = self.operation(
            malformed_output,
            source_pointer="/Data/Apocalypse/basic/actions/0",
        )
        self.assertIsNone(generic["effect"])
        self.assertIn(
            "UNSUPPORTED_EFFECT_REFERENCE_SHAPE",
            {item["code"] for item in malformed_output["diagnostics"]},
        )
        self.assertEqual(
            malformed_output["audit"]["integrity"][
                "uncoveredSupportedActionCount"
            ],
            0,
        )

    def test_output_is_byte_for_byte_deterministic_and_input_is_unchanged(self):
        mechanics = copy.deepcopy(self.mechanics)
        before = copy.deepcopy(mechanics)
        first = normalize_mechanics(
            mechanics,
            mechanics_payload=self.mechanics_payload,
        )
        second = normalize_mechanics(
            mechanics,
            mechanics_payload=self.mechanics_payload,
        )
        self.assertEqual(mechanics, before)
        self.assertEqual(first, second)
        self.assertEqual(
            serialize_capabilities(first),
            serialize_capabilities(second),
        )
        self.assertTrue(serialize_capabilities(first).endswith(b"\n"))

    def test_load_rejects_invalid_parser_schema(self):
        with tempfile.TemporaryDirectory() as directory_name:
            path = Path(directory_name) / "mechanics.json"
            path.write_text(
                json.dumps({"schemaVersion": "2.0.0"}),
                encoding="utf-8",
            )
            with self.assertRaises(NormalizerError) as raised:
                load_mechanics(path)
            self.assertEqual(
                raised.exception.code,
                "INVALID_NORMALIZER_INPUT",
            )

    def test_cli_generation_and_check_mode(self):
        with tempfile.TemporaryDirectory() as directory_name:
            mechanics_path = Path(directory_name) / "mechanics.json"
            output_path = Path(directory_name) / "capabilities.json"
            mechanics_path.write_bytes(self.mechanics_payload)
            command = [
                sys.executable,
                "-m",
                "scripts.msf_capabilities_normalizer.cli",
                "--input",
                str(mechanics_path),
                "--output",
                str(output_path),
            ]

            generated = subprocess.run(
                command,
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            original = output_path.read_bytes()

            checked = subprocess.run(
                [*command, "--check"],
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(checked.returncode, 0, checked.stderr)
            self.assertEqual(output_path.read_bytes(), original)

            output_path.write_bytes(original + b" ")
            stale = subprocess.run(
                [*command, "--check"],
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(stale.returncode, 0)
            self.assertEqual(output_path.read_bytes(), original + b" ")


class MsfCapabilitiesNormalizerSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mechanics = parse_sources(REAL_CHARACTERS, REAL_PROCS)
        cls.mechanics_payload = serialize_mechanics(cls.mechanics)
        cls.mechanics_checksum = hashlib.sha256(
            cls.mechanics_payload
        ).hexdigest()
        cls.capabilities = normalize_mechanics(
            cls.mechanics,
            mechanics_payload=cls.mechanics_payload,
        )

    def assert_snapshot_checksum(self):
        self.assertEqual(
            self.mechanics_checksum,
            REAL_MECHANICS_SHA256,
            (
                "L’instantané réel a changé ; réviser explicitement son "
                "checksum avant d’imposer ses nombres."
            ),
        )

    def test_real_snapshot_has_the_six_exact_controlled_aliases(self):
        self.assert_snapshot_checksum()
        resolutions = self.capabilities[
            "controlledAliasResolutions"
        ]
        self.assertEqual(len(resolutions), 6)
        self.assertEqual(
            [item["source"]["pointer"] for item in resolutions],
            [
                (
                    "/Data/Gamora/basic_empower/actions/0/"
                    "stat_modifier/1/apply_if/owner/procs/0"
                ),
                (
                    "/Data/Gamora/basic_empower/actions/2/"
                    "stat_modifier/1/apply_if/owner/procs/0"
                ),
                (
                    "/Data/Gamora/counter_empower/actions/0/"
                    "stat_modifier/2/apply_if/owner/procs/0"
                ),
                (
                    "/Data/Gamora/safety_empower/actions/0/"
                    "stat_modifier/2/apply_if/owner/procs/0"
                ),
                (
                    "/Data/Gamora/special_empower/actions/2/"
                    "stat_modifier/1/apply_if/owner/procs/0"
                ),
                (
                    "/Data/Gamora/ultimate_empower/actions/1/"
                    "stat_modifier/1/apply_if/owner/procs/0"
                ),
            ],
        )
        for item in resolutions:
            self.assertEqual(item["rawValue"], "Empower ")
            self.assertEqual(item["resolvedValue"], "Empower")
            self.assertIs(item["resolved"], True)
            self.assertEqual(
                item["resolutionMethod"], "controlled_alias"
            )
            self.assertEqual(
                item["resolutionOrigin"],
                "effect-id-aliases-v1",
            )
            self.assertIsNotNone(item["sourceActionId"])
            self.assertIsNotNone(item["contextId"])

    def test_real_snapshot_control_operation_counts(self):
        self.assert_snapshot_checksum()
        audit = self.capabilities["audit"]
        self.assertEqual(audit["empowerOperationCount"], 7)
        self.assertEqual(audit["emptyResultOperationCount"], 310)
        self.assertEqual(audit["spawnOperationCount"], 116)
        self.assertEqual(
            sum(
                item["kind"] == "empower"
                for item in self.capabilities["operations"]
            ),
            7,
        )
        self.assertEqual(
            sum(
                item["kind"] == "empty_result"
                for item in self.capabilities["operations"]
            ),
            310,
        )
        self.assertEqual(
            sum(
                item["kind"] == "spawn"
                for item in self.capabilities["operations"]
            ),
            116,
        )

    def test_real_spawn_without_and_with_pool_effects(self):
        self.assert_snapshot_checksum()
        mappings_by_pointer = {
            item["source"]["pointer"]: item
            for item in self.capabilities["actionMappings"]
        }
        operations_by_id = {
            item["id"]: item
            for item in self.capabilities["operations"]
        }

        without_effects = mappings_by_pointer[
            "/Data/Annihilus/basic/actions/5"
        ]
        self.assertEqual(len(without_effects["operationIds"]), 1)
        self.assertEqual(
            operations_by_id[without_effects["operationIds"][0]][
                "kind"
            ],
            "spawn",
        )

        with_effects = mappings_by_pointer[
            "/Data/Hela/passive/0/actions/0"
        ]
        kinds = [
            operations_by_id[operation_id]["kind"]
            for operation_id in with_effects["operationIds"]
        ]
        self.assertEqual(kinds[0], "spawn")
        self.assertEqual(kinds[1:], ["effect_apply", "effect_apply"])
        self.assertTrue(
            all(
                operations_by_id[operation_id]["scope"]["kind"]
                == "spawn_pool"
                for operation_id in with_effects["operationIds"][1:]
            )
        )

    def test_real_abilities_include_empowered_passive_only_when_playable(self):
        self.assert_snapshot_checksum()
        abilities = self.capabilities["abilities"]
        self.assertEqual(len(abilities), 1844)
        ability_types = [item["abilityType"] for item in abilities]
        self.assertEqual(ability_types.count("passive_empower"), 5)
        self.assertFalse(
            {"safety", "counter", "safety_empower", "counter_empower"}
            & set(ability_types)
        )
        technical_keys = {
            item["technicalKey"]
            for item in self.capabilities["contexts"]
            if item["technicalKey"] is not None
        }
        self.assertTrue(
            {"safety", "counter", "safety_empower", "counter_empower"}
            <= technical_keys
        )

    def test_real_action_mappings_cover_every_source_action_once(self):
        self.assert_snapshot_checksum()
        mappings = self.capabilities["actionMappings"]
        source_action_ids = {
            item["id"] for item in self.mechanics["actions"]
        }
        self.assertEqual(len(source_action_ids), 12327)
        self.assertEqual(len(mappings), 12327)
        self.assertEqual(
            {item["sourceActionId"] for item in mappings},
            source_action_ids,
        )
        self.assertEqual(
            self.capabilities["audit"]["mappedActionCount"],
            8990,
        )
        self.assertEqual(
            self.capabilities["audit"][
                "preservedUninterpretedActionCount"
            ],
            3337,
        )
        barrier_operations = [
            operation
            for operation in self.capabilities["operations"]
            if operation["kind"] in {"barrier_apply", "barrier_remove"}
        ]
        self.assertEqual(len(barrier_operations), 309)
        self.assertEqual(
            sum(
                item["kind"] == "barrier_apply"
                for item in barrier_operations
            ),
            190,
        )
        removals = [
            item
            for item in barrier_operations
            if item["kind"] == "barrier_remove"
        ]
        self.assertEqual(len(removals), 119)
        self.assertEqual(
            sum(
                item["metrics"]["barrierRemovalPct"]["sourceShape"]
                == "implicit"
                for item in removals
            ),
            27,
        )

    def test_real_hulk_annihilus_and_kraven_warnings_remain_exact(self):
        self.assert_snapshot_checksum()
        self.assertEqual(
            [
                (
                    item["code"],
                    item["characterId"],
                    item["source"]["pointer"],
                )
                for item in self.capabilities["diagnostics"]
            ],
            [
                (
                    "DANGLING_ACTION_DEPENDENCY",
                    "KravenTheHunter",
                    "/Data/KravenTheHunter/passive/0/actions/0",
                ),
                (
                    "UNRESOLVED_EFFECT_REFERENCE",
                    "PVE_Annihilus_Tower",
                    (
                        "/Data/PVE_Annihilus_Tower/basic/actions/3/"
                        "only_procs/0"
                    ),
                ),
                (
                    "UNRESOLVED_EFFECT_REFERENCE",
                    "PVE_Annihilus_Tower",
                    (
                        "/Data/PVE_Annihilus_Tower/special/actions/3/"
                        "only_procs/0"
                    ),
                ),
            ],
        )

    def test_b1_real_abomination_and_phase_a_corpus(self):
        self.assert_snapshot_checksum()
        mappings = {
            item["source"]["pointer"]: item
            for item in self.capabilities["actionMappings"]
        }
        abomination = [
            mappings[f"/Data/Abomination/basic/actions/{index}"]
            for index in range(6)
        ]
        self.assertEqual([item["actionOrder"] for item in abomination], list(range(6)))
        self.assertEqual([item["status"] for item in abomination], [
            "preserved_uninterpreted", "normalized", "normalized",
            "preserved_uninterpreted", "normalized", "normalized",
        ])
        target = abomination[3]["target"]["value"]
        self.assertEqual(target["type"], "direct_neighbor")
        self.assertEqual(target["limit"], [1])
        self.assertEqual(target["primary_selection"], "exclude_from_pool")
        self.assertEqual(target["stop_if_outcome"], ["counter_attack"])
        self.assertEqual(target["filter"]["not"]["target"]["states"], ["stealthed"])
        self.assertEqual(
            abomination[0]["uninterpretedParameters"]["values"]["stat_modifier"][0]["delta"],
            [90, 110, 130, 150, 170, 200, 250],
        )
        self.assertEqual(
            abomination[3]["uninterpretedParameters"]["values"]["stat_modifier"][0]["delta"],
            [40, 60, 80, 100, 120, 150, 200],
        )
        self.assertTrue(abomination[5]["flags"]["counter"]["value"])
        self.assertEqual(
            abomination[5]["uninterpretedParameters"]["values"]["assist"], {}
        )

        required_prefixes = (
            "/Data/SpiderMan/basic/",
            "/Data/Gamora/basic_empower/",
            "/Data/Gamora/passive_empower/",
            "/Data/Maestro/basic/",
            "/Data/NickFury/passive/",
            "/Data/NickFury/ultimate/",
        )
        for prefix in required_prefixes:
            self.assertTrue(any(pointer.startswith(prefix) for pointer in mappings), prefix)
        self.assertIn("health_pct", mappings[
            "/Data/AgathaHarkness/ultimate/actions/11"
        ]["uninterpretedParameters"]["values"])
        self.assertIn("change_pct", mappings[
            "/Data/NickFury/passive/0/actions/1"
        ]["uninterpretedParameters"]["values"])
        self.assertEqual(
            mappings["/Data/Maestro/basic/actions/1"]["control"]["referenceKind"],
            "explicit_action_index",
        )
        self.assertIsNotNone(mappings[
            "/Data/BetaRayBill/passive/0/actions/0"
        ]["control"]["foreachAction"])
        self.assertTrue(mappings[
            "/Data/AbsorbingMan/basic/actions/2"
        ]["recipient"]["present"])

    def test_real_output_is_byte_for_byte_deterministic(self):
        self.assert_snapshot_checksum()
        second = normalize_mechanics(
            copy.deepcopy(self.mechanics),
            mechanics_payload=self.mechanics_payload,
        )
        self.assertEqual(
            serialize_capabilities(self.capabilities),
            serialize_capabilities(second),
        )

    def test_real_reference_integrity_is_zero_error(self):
        self.assert_snapshot_checksum()
        integrity = self.capabilities["audit"]["integrity"]
        self.assertTrue(integrity["inputUnchanged"])
        self.assertTrue(integrity["aliasPolicyValid"])
        self.assertTrue(
            all(
                value == 0
                for key, value in integrity.items()
                if key.endswith("Count")
            ),
            integrity,
        )
        self.assertEqual(
            self.capabilities["audit"]["actionMappingCount"],
            self.capabilities["audit"]["sourceActionCount"],
        )


if __name__ == "__main__":
    unittest.main()
