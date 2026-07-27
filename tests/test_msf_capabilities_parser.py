from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from scripts.msf_capabilities_parser.audit import inspect_integrity
from scripts.msf_capabilities_parser.ids import deterministic_id
from scripts.msf_capabilities_parser.json_pointer import (
    append_pointer,
    escape_segment,
    resolve_pointer,
)
from scripts.msf_capabilities_parser.parser import (
    ParserError,
    load_source,
    parse_sources,
    serialize_mechanics,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = REPOSITORY_ROOT / "tests/fixtures/msf_capabilities"
CHARACTERS_FIXTURE = FIXTURES / "characters.json"
PROCS_FIXTURE = FIXTURES / "procs.json"


class MsfCapabilitiesParserTests(unittest.TestCase):
    def parse_fixture(self) -> dict:
        return parse_sources(CHARACTERS_FIXTURE, PROCS_FIXTURE)

    def test_loads_and_validates_source_envelopes(self):
        characters = load_source(CHARACTERS_FIXTURE, "characters")
        procs = load_source(PROCS_FIXTURE, "procs")

        self.assertEqual(characters.name, "characters")
        self.assertEqual(characters.force_import_version, 2)
        self.assertIsInstance(characters.data, dict)
        self.assertEqual(len(characters.data), 3)
        self.assertEqual(procs.name, "procs")
        self.assertEqual(procs.force_import_version, 2)
        self.assertEqual(len(procs.data), 6)

    def test_rejects_invalid_envelopes_with_stable_codes(self):
        cases = (
            ([], "INVALID_SOURCE_ROOT"),
            ({"Name": "characters", "ForceImportVersion": 2}, "MISSING_DATA_ROOT"),
            (
                {"Name": "characters", "ForceImportVersion": 2, "Data": []},
                "INVALID_DATA_ROOT_TYPE",
            ),
            (
                {"Name": "wrong", "ForceImportVersion": 2, "Data": {}},
                "INVALID_SOURCE_ROOT",
            ),
        )

        with tempfile.TemporaryDirectory() as directory_name:
            path = Path(directory_name) / "characters.json"
            for payload, expected_code in cases:
                path.write_text(json.dumps(payload), encoding="utf-8")
                with self.subTest(payload=payload):
                    with self.assertRaises(ParserError) as raised:
                        load_source(path, "characters")
                    self.assertEqual(raised.exception.code, expected_code)

    def test_deterministic_ids_and_json_pointer_escaping(self):
        canonical = "action|characters.json|/Data/Apocalypse/basic/actions/0"
        self.assertEqual(
            deterministic_id("act", canonical),
            deterministic_id("act", canonical),
        )
        self.assertRegex(deterministic_id("act", canonical), r"^act_[a-f0-9]{16}$")
        self.assertEqual(escape_segment("a~/b"), "a~0~1b")
        pointer = append_pointer("/Data", "A/B", "~ability", 0)
        self.assertEqual(pointer, "/Data/A~1B/~0ability/0")
        self.assertEqual(
            resolve_pointer({"Data": {"A/B": {"~ability": ["ok"]}}}, pointer),
            "ok",
        )

    def test_characters_and_effects_are_sorted_deterministically(self):
        mechanics = self.parse_fixture()
        self.assertEqual(
            [record["characterId"] for record in mechanics["characters"]],
            ["Alpha", "Apocalypse", "Zeta"],
        )
        self.assertEqual(
            [record["procId"] for record in mechanics["effects"]],
            sorted(record["procId"] for record in mechanics["effects"]),
        )

    def test_sources_use_exact_byte_checksums_and_record_counts(self):
        mechanics = self.parse_fixture()
        sources = {source["file"]: source for source in mechanics["sources"]}

        for path in (CHARACTERS_FIXTURE, PROCS_FIXTURE):
            source = sources[path.name]
            self.assertEqual(
                source["checksum"],
                f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}",
            )
            self.assertEqual(source["rootType"], "object")

        self.assertEqual(sources["characters.json"]["recordCount"], 3)
        self.assertEqual(sources["procs.json"]["recordCount"], 6)

    def test_active_abilities_and_functional_order(self):
        mechanics = self.parse_fixture()
        apocalypse = next(
            item for item in mechanics["characters"] if item["characterId"] == "Apocalypse"
        )
        containers = {item["id"]: item for item in mechanics["containers"]}
        ability_types = [
            containers[identifier]["abilityType"]
            for identifier in apocalypse["abilityContainerIds"]
        ]

        self.assertEqual(
            ability_types,
            [
                "basic",
                "special",
                "ultimate",
                "passive",
                "basic_empower",
                "special_empower",
                "passive_empower",
            ],
        )
        self.assertTrue(
            all(
                containers[identifier]["containerType"] == "ability"
                for identifier in apocalypse["abilityContainerIds"]
            )
        )

    def test_passive_entries_create_parented_trigger_containers(self):
        mechanics = self.parse_fixture()
        passive = next(
            item
            for item in mechanics["containers"]
            if item["characterId"] == "Apocalypse"
            and item["abilityType"] == "passive"
            and item["containerType"] == "ability"
        )
        triggers = [
            item
            for item in mechanics["containers"]
            if item["parentContainerId"] == passive["id"]
            and item["containerType"] == "passive_trigger"
        ]

        self.assertEqual([item["order"] for item in triggers], [0, 1])
        self.assertTrue(all(item["parentContainerId"] == passive["id"] for item in triggers))
        self.assertEqual(triggers[0]["context"]["exec"], "on_turn")
        self.assertEqual(triggers[0]["context"]["execFor"], "owner")
        self.assertEqual(triggers[0]["conditions"][0]["kind"], "only_if")

    def test_actions_keep_source_order_and_exact_pointers(self):
        mechanics = self.parse_fixture()
        basic = next(
            item
            for item in mechanics["containers"]
            if item["characterId"] == "Apocalypse"
            and item["abilityType"] == "basic"
            and item["containerType"] == "ability"
        )
        actions = {item["id"]: item for item in mechanics["actions"]}
        ordered = [actions[identifier] for identifier in basic["actionIds"]]

        self.assertEqual([item["order"] for item in ordered], [0, 1, 2])
        self.assertEqual(
            [item["source"]["pointer"] for item in ordered],
            [
                "/Data/Apocalypse/basic/actions/0",
                "/Data/Apocalypse/basic/actions/1",
                "/Data/Apocalypse/basic/actions/2",
            ],
        )
        self.assertEqual(
            [item["adapter"] for item in ordered],
            ["declared_action", "stat_modifier_only", "generic_unclassified"],
        )
        self.assertEqual(ordered[0]["target"], {})
        self.assertTrue(ordered[0]["targetPresent"])

    def test_action_adapters_preserve_parameters_conditions_and_raw(self):
        mechanics = self.parse_fixture()
        actions = {
            item["source"]["pointer"]: item for item in mechanics["actions"]
        }
        declared = actions["/Data/Apocalypse/basic/actions/0"]
        stat_modifier = actions["/Data/Apocalypse/basic/actions/1"]
        generic = actions["/Data/Apocalypse/basic/actions/2"]

        self.assertEqual(declared["rawType"], "proc")
        self.assertEqual(declared["parameters"]["action_pct"], [50, 100])
        self.assertEqual(declared["conditions"][0]["kind"], "only_if")
        self.assertEqual(stat_modifier["rawType"], "stat_modifier")
        self.assertEqual(stat_modifier["raw"]["assist"], "true")
        self.assertEqual(generic["rawType"], "unclassified_object")
        self.assertIn("arbitrary_action_idx", generic["propertyHandling"]["unrecognized"])
        self.assertEqual(
            generic["raw"]["visualID"],
            "novisuals",
        )

    def test_raw_is_complete_and_inputs_are_not_mutated(self):
        characters_before = json.loads(CHARACTERS_FIXTURE.read_text(encoding="utf-8"))
        procs_before = json.loads(PROCS_FIXTURE.read_text(encoding="utf-8"))
        mechanics = self.parse_fixture()

        self.assertEqual(
            json.loads(CHARACTERS_FIXTURE.read_text(encoding="utf-8")),
            characters_before,
        )
        self.assertEqual(
            json.loads(PROCS_FIXTURE.read_text(encoding="utf-8")),
            procs_before,
        )
        apocalypse = next(
            item for item in mechanics["characters"] if item["characterId"] == "Apocalypse"
        )
        self.assertEqual(apocalypse["raw"], characters_before["Data"]["Apocalypse"])
        self.assertNotIn("abilityContainerIds", apocalypse["raw"])

    def test_all_procs_including_none_category_are_imported_with_references(self):
        mechanics = self.parse_fixture()
        effects = {item["procId"]: item for item in mechanics["effects"]}

        self.assertEqual(len(effects), 6)
        self.assertEqual(effects["TechnicalMarker"]["category"], "none")
        self.assertEqual(effects["DefenseUp"]["opposite"], "DefenseDown")
        self.assertEqual(effects["DefenseUp"]["weak"], "MinorDefenseUp")
        self.assertEqual(effects["DefenseUp"]["strong"], "MajorDefenseUp")
        self.assertEqual(
            effects["DefenseUp"]["raw"]["stat_modifier"],
            [{"stat": "Armor", "mul": 1.5}],
        )

    def test_unknown_structures_and_unresolved_references_are_diagnostic(self):
        first = self.parse_fixture()["diagnostics"]
        second = self.parse_fixture()["diagnostics"]

        self.assertEqual(first, second)
        self.assertIn("UNCLASSIFIED_ACTION_STRUCTURE", {item["code"] for item in first})
        unresolved = [
            item for item in first if item["code"] == "UNRESOLVED_PROC_REFERENCE"
        ]
        self.assertEqual(len(unresolved), 1)
        self.assertEqual(unresolved[0]["raw"], {"procId": "MissingProc"})

    def test_integrity_inspection_detects_duplicate_and_orphan_records(self):
        mechanics = self.parse_fixture()
        broken = copy.deepcopy(mechanics)
        broken["containers"][1]["id"] = broken["containers"][0]["id"]
        broken["containers"][2]["parentContainerId"] = "ctr_missing"
        broken["actions"][0]["containerId"] = "ctr_missing"

        inspection = inspect_integrity(broken)

        self.assertGreaterEqual(inspection.duplicate_id_count, 1)
        self.assertGreaterEqual(inspection.orphan_container_count, 1)
        self.assertGreaterEqual(inspection.orphan_action_count, 1)
        self.assertTrue(
            {"DUPLICATE_ID", "ORPHAN_CONTAINER", "ORPHAN_ACTION"}
            <= {item["code"] for item in inspection.diagnostics}
        )

    def test_output_and_serialization_are_byte_for_byte_deterministic(self):
        first = self.parse_fixture()
        second = self.parse_fixture()
        first_bytes = serialize_mechanics(first)
        second_bytes = serialize_mechanics(second)

        self.assertEqual(first, second)
        self.assertEqual(first_bytes, second_bytes)
        self.assertTrue(first_bytes.endswith(b"\n"))
        self.assertIn("Apocalypse".encode(), first_bytes)

    def test_cli_generation_and_check_mode(self):
        with tempfile.TemporaryDirectory() as directory_name:
            output = Path(directory_name) / "mechanics.json"
            command = [
                sys.executable,
                "-m",
                "scripts.msf_capabilities_parser.cli",
                "--characters",
                str(CHARACTERS_FIXTURE),
                "--procs",
                str(PROCS_FIXTURE),
                "--output",
                str(output),
            ]
            generated = subprocess.run(
                command,
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            original = output.read_bytes()

            checked = subprocess.run(
                [*command, "--check"],
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(checked.returncode, 0, checked.stderr)
            self.assertEqual(output.read_bytes(), original)

            output.write_bytes(original + b" ")
            stale = subprocess.run(
                [*command, "--check"],
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(stale.returncode, 0)
            self.assertEqual(output.read_bytes(), original + b" ")

    def test_empower_is_independent_and_safety_remains_technical(self):
        mechanics = self.parse_fixture()
        containers = [
            item for item in mechanics["containers"] if item["characterId"] == "Apocalypse"
        ]
        empower = next(
            item
            for item in containers
            if item["abilityType"] == "basic_empower"
            and item["containerType"] == "ability"
        )
        normal = next(
            item
            for item in containers
            if item["abilityType"] == "basic"
            and item["containerType"] == "ability"
        )
        safety = next(
            item
            for item in containers
            if item["context"].get("technicalKey") == "safety"
        )

        self.assertNotEqual(empower["id"], normal["id"])
        self.assertEqual(empower["source"]["pointer"], "/Data/Apocalypse/basic_empower")
        self.assertIsNone(safety["abilityType"])
        self.assertEqual(safety["classification"], "technical-review")
        self.assertNotEqual(safety["parentContainerId"], normal["id"])

    def test_scalars_arrays_and_string_booleans_remain_unchanged(self):
        mechanics = self.parse_fixture()
        containers = {
            item["source"]["pointer"]: item for item in mechanics["containers"]
        }
        actions = {
            item["source"]["pointer"]: item for item in mechanics["actions"]
        }

        self.assertEqual(containers["/Data/Apocalypse/basic"]["raw"]["power_mul"], 2)
        self.assertEqual(
            containers["/Data/Apocalypse/basic_empower"]["raw"]["power_mul"],
            [2, 3],
        )
        self.assertEqual(
            containers["/Data/Apocalypse/special"]["raw"]["cost"],
            [4, 3],
        )
        self.assertEqual(
            actions["/Data/Apocalypse/basic/actions/1"]["raw"]["assist"],
            "true",
        )
        trigger = containers["/Data/Apocalypse/passive/1"]
        self.assertEqual(trigger["raw"]["exec_on_stun"], "false")

    def test_audit_counts_match_source_and_output(self):
        mechanics = self.parse_fixture()
        audit = mechanics["audit"]

        self.assertEqual(
            audit["input"]["sourceActionCount"],
            audit["output"]["actionCount"],
        )
        self.assertEqual(
            audit["output"]["diagnosticCount"],
            len(mechanics["diagnostics"]),
        )
        self.assertEqual(
            sum(audit["adapters"].values()),
            audit["output"]["actionCount"],
        )
        self.assertEqual(audit["integrity"]["duplicateIdCount"], 0)
        self.assertEqual(audit["integrity"]["orphanContainerCount"], 0)
        self.assertEqual(audit["integrity"]["orphanActionCount"], 0)


if __name__ == "__main__":
    unittest.main()
