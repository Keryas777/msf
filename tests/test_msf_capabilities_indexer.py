from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from scripts.msf_capabilities_indexer.audit import (
    SNAPSHOT_CAPABILITIES_CHECKSUM,
    SNAPSHOT_COUNTS,
    SNAPSHOT_OPERATION_KINDS,
)
from scripts.msf_capabilities_indexer.cli import main as cli_main
from scripts.msf_capabilities_indexer.diagnostics import (
    IndexerAuditError,
)
from scripts.msf_capabilities_indexer.indexer import (
    EXPECTED_ARTIFACT_PATHS,
    MANIFEST_PATH,
    PAYLOAD_PATHS,
    build_artifact_bytes,
    compute_payload_set_checksum,
    load_capabilities,
    serialize_json,
)


FIXTURE_CHECKSUM = "0" * 64


def _source(pointer: str) -> dict:
    return {"file": "characters.json", "pointer": pointer}


def _context(
    context_id: str,
    *,
    ability_type: str | None,
    container_type: str,
    parent_id: str | None = None,
    classification: str = "mechanical",
    technical_key: str | None = None,
) -> dict:
    return {
        "id": context_id,
        "sourceContainerId": f"ctr_{context_id}",
        "characterId": "Caller",
        "abilityType": ability_type,
        "containerType": container_type,
        "parentContextId": parent_id,
        "order": 0,
        "classification": classification,
        "technicalKey": technical_key,
        "execution": {
            "trigger": "on_turn" if "trigger" in container_type else None,
            "triggerFor": None,
            "values": {},
            "flags": {},
            "qualifiers": {},
            "raw": {},
        },
        "conditions": [],
        "source": _source(f"/Data/Caller/{context_id}"),
    }


def _catalog_effect(
    object_id: str,
    effect_id: str,
    category: str,
    *,
    opposite: str | None = None,
) -> dict:
    return {
        "id": object_id,
        "effectId": effect_id,
        "category": category,
        "type": "state",
        "state": effect_id.lower(),
        "expirationType": "end_of_turn",
        "relations": {
            "opposite": opposite,
            "weak": None,
            "strong": None,
        },
        "source": {"file": "procs.json", "pointer": f"/Data/{effect_id}"},
        "raw": {
            "category": category,
            "type": "state",
            "state": effect_id.lower(),
        },
    }


def _proc_effect(
    effect_id: str,
    catalog_id: str | None,
    pointer: str,
    *,
    raw_value: str | None = None,
    method: str = "exact",
    origin: str | None = None,
) -> dict:
    resolved = catalog_id is not None
    return {
        "namespace": "proc",
        "effectId": effect_id,
        "rawValue": raw_value if raw_value is not None else effect_id,
        "resolvedValue": effect_id,
        "resolutionMethod": method,
        "resolutionOrigin": origin,
        "catalogEffectId": catalog_id,
        "catalogCategory": None,
        "resolved": resolved,
        "source": _source(pointer),
    }


def _battlefield_effect(effect_id: str, pointer: str) -> dict:
    return {
        "namespace": "battlefield",
        "effectId": effect_id,
        "rawValue": effect_id,
        "resolvedValue": effect_id,
        "resolutionMethod": "exact",
        "resolutionOrigin": None,
        "catalogEffectId": None,
        "catalogCategory": None,
        "resolved": None,
        "source": _source(pointer),
    }


def _operation(
    operation_id: str,
    kind: str,
    context_id: str,
    source_action_id: str,
    *,
    ability_type: str | None,
    context_path_ids: list[str] | None = None,
    source_action_type: str | None = None,
    effect: dict | None = None,
    selector_mode: str | None = None,
    selector_category: str | None = None,
    scope: dict | None = None,
    target: dict | None = None,
    raw_parameters: dict | None = None,
) -> dict:
    action_type = source_action_type or kind
    if selector_mode is None:
        selector_mode = "explicit" if effect is not None else "generic"
    pointer = f"/Data/Caller/{context_id}/actions/{source_action_id}"
    return {
        "id": operation_id,
        "kind": kind,
        "characterId": "Caller",
        "abilityType": ability_type,
        "contextId": context_id,
        "contextPathIds": context_path_ids or [context_id],
        "sourceActionId": source_action_id,
        "sourceActionType": action_type,
        "rawSourceActionType": action_type,
        "actionOrder": 0,
        "effect": copy.deepcopy(effect),
        "selector": {
            "mode": selector_mode,
            "sourceField": "procs" if effect is not None else None,
            "category": selector_category,
            "exclusions": [],
            "oppositeOverride": None,
        },
        "scope": scope or {"kind": "action_target"},
        "target": target or {"present": False, "value": None},
        "recipient": {"present": False, "value": None},
        "conditions": [],
        "control": {
            "actionCondition": None,
            "referenceKind": "none",
            "arbitraryActionIndex": None,
            "dependsOnActionId": None,
            "usePreviousResult": None,
            "foreachAction": None,
        },
        "metrics": {},
        "flags": {},
        "source": {
            "file": "characters.json",
            "actionPointer": pointer,
            "valuePointer": pointer,
        },
        "rawParameters": copy.deepcopy(raw_parameters or {}),
        "rawEffectEntry": (
            copy.deepcopy(effect.get("rawValue"))
            if isinstance(effect, dict)
            else None
        ),
    }


def _mapping(
    source_action_id: str,
    context_id: str,
    operation_ids: list[str],
    *,
    status: str = "normalized",
    source_action_type: str = "fixture_action",
) -> dict:
    return {
        "sourceActionId": source_action_id,
        "characterId": "Caller",
        "abilityType": "basic",
        "contextId": context_id,
        "contextPathIds": [context_id],
        "actionOrder": 0,
        "classification": "mechanical",
        "containerType": "ability",
        "technicalKey": None,
        "rawSourceActionType": source_action_type,
        "sourceActionType": source_action_type,
        "status": status,
        "operationIds": operation_ids,
        "target": {"present": False, "value": None},
        "recipient": {"present": False, "value": None},
        "conditions": [],
        "control": {
            "actionCondition": None,
            "referenceKind": "none",
            "arbitraryActionIndex": None,
            "dependsOnActionId": None,
            "usePreviousResult": None,
            "foreachAction": None,
        },
        "flags": {},
        "uninterpretedParameters": {"values": {}, "progressions": []},
        "source": _source(
            f"/Data/Caller/{context_id}/actions/{source_action_id}"
        ),
    }


def make_capabilities_fixture() -> dict:
    contexts = [
        _context(
            "ctx_basic",
            ability_type="basic",
            container_type="ability",
        ),
        _context(
            "ctx_alternative",
            ability_type="basic",
            container_type="ability_alternative",
            parent_id="ctx_basic",
        ),
        _context(
            "ctx_passive",
            ability_type="passive",
            container_type="ability",
        ),
        _context(
            "ctx_passive_trigger",
            ability_type="passive",
            container_type="passive_trigger",
            parent_id="ctx_passive",
        ),
        _context(
            "ctx_passive_empower",
            ability_type="passive_empower",
            container_type="ability",
        ),
        _context(
            "ctx_safety",
            ability_type=None,
            container_type="technical",
            classification="technical-review",
            technical_key="safety",
        ),
    ]
    operations = [
        _operation(
            "op_apply",
            "effect_apply",
            "ctx_basic",
            "act_apply",
            ability_type="basic",
            source_action_type="proc",
            effect=_proc_effect(
                "DoT", "eff_dot", "/Data/Caller/basic/actions/0/procs/0"
            ),
            target={"present": True, "value": {"relation": "enemy"}},
        ),
        _operation(
            "op_remove_generic",
            "effect_remove",
            "ctx_alternative",
            "act_remove_generic",
            ability_type="basic",
            context_path_ids=["ctx_basic", "ctx_alternative"],
            source_action_type="proc_remove",
            selector_mode="generic",
            selector_category="buff",
        ),
        _operation(
            "op_transfer",
            "effect_transfer",
            "ctx_basic",
            "act_transfer",
            ability_type="basic",
            source_action_type="proc_transfer",
            effect=_proc_effect(
                "Taunt",
                "eff_taunt",
                "/Data/Caller/basic/actions/2/procs/0",
            ),
        ),
        _operation(
            "op_flip",
            "effect_flip",
            "ctx_basic",
            "act_flip",
            ability_type="basic",
            source_action_type="proc_flip",
            effect=_proc_effect(
                "DoT", "eff_dot", "/Data/Caller/basic/actions/3/procs/0"
            ),
        ),
        _operation(
            "op_duration",
            "effect_duration_modify",
            "ctx_basic",
            "act_duration",
            ability_type="basic",
            source_action_type="proc_duration",
            effect=_proc_effect(
                "DoT", "eff_dot", "/Data/Caller/basic/actions/4/procs/0"
            ),
        ),
        _operation(
            "op_alias",
            "effect_apply",
            "ctx_passive_empower",
            "act_alias",
            ability_type="passive_empower",
            source_action_type="proc",
            effect=_proc_effect(
                "Empower",
                "eff_empower",
                "/Data/Caller/passive_empower/actions/0/procs/0",
                raw_value="Empower ",
                method="controlled_alias",
                origin="effect-id-aliases-v1",
            ),
        ),
        _operation(
            "op_battlefield_set",
            "battlefield_effect_set",
            "ctx_basic",
            "act_battlefield_set",
            ability_type="basic",
            source_action_type="set_battlefield_effect",
            effect=_battlefield_effect(
                "BE_Test", "/Data/Caller/basic/actions/5/effect_id"
            ),
            scope={"kind": "battlefield"},
        ),
        _operation(
            "op_battlefield_clear",
            "battlefield_effect_clear",
            "ctx_basic",
            "act_battlefield_clear",
            ability_type="basic",
            source_action_type="clear_battlefield_effect",
            selector_mode="generic",
            scope={"kind": "battlefield"},
        ),
        _operation(
            "op_spawn_with",
            "spawn",
            "ctx_passive_trigger",
            "act_spawn_with",
            ability_type="passive",
            context_path_ids=["ctx_passive", "ctx_passive_trigger"],
            source_action_type="spawn",
            selector_mode="generic",
            scope={"kind": "spawn_invocation"},
            raw_parameters={
                "count": [1, 2],
                "pool": [
                    {"character": "Summon", "for_count": 1},
                    {"character": "Ghost", "for_count": 2},
                ],
            },
        ),
        _operation(
            "op_spawn_pool",
            "effect_apply",
            "ctx_passive_trigger",
            "act_spawn_with",
            ability_type="passive",
            context_path_ids=["ctx_passive", "ctx_passive_trigger"],
            source_action_type="spawn",
            effect=_proc_effect(
                "Taunt",
                "eff_taunt",
                "/Data/Caller/passive/0/actions/0/pool/0/procs/0/proc",
            ),
            scope={
                "kind": "spawn_pool",
                "poolIndex": 0,
                "spawnedCharacterId": "Summon",
                "applyToSpawned": True,
            },
        ),
        _operation(
            "op_spawn_without",
            "spawn",
            "ctx_passive_trigger",
            "act_spawn_without",
            ability_type="passive",
            context_path_ids=["ctx_passive", "ctx_passive_trigger"],
            source_action_type="spawn",
            selector_mode="generic",
            scope={"kind": "spawn_invocation"},
            raw_parameters={"pool": [{"character": "Ghost"}]},
        ),
        _operation(
            "op_empty",
            "empty_result",
            "ctx_safety",
            "act_empty",
            ability_type=None,
            source_action_type="empty_result",
            selector_mode="generic",
            scope={"kind": "control"},
        ),
        _operation(
            "op_empower",
            "empower",
            "ctx_safety",
            "act_empower",
            ability_type=None,
            source_action_type="empower",
            selector_mode="generic",
        ),
        _operation(
            "op_unresolved",
            "effect_remove",
            "ctx_basic",
            "act_unresolved",
            ability_type="basic",
            source_action_type="proc_remove",
            effect=_proc_effect(
                "MissingProc",
                None,
                "/Data/Caller/basic/actions/6/procs/0",
            ),
        ),
    ]
    basic_operation_ids = sorted(
        item["id"]
        for item in operations
        if item["contextId"] in {"ctx_basic", "ctx_alternative"}
    )
    passive_operation_ids = sorted(
        item["id"]
        for item in operations
        if item["contextId"] in {"ctx_passive", "ctx_passive_trigger"}
    )
    abilities = [
        {
            "id": "abl_basic",
            "characterId": "Caller",
            "abilityType": "basic",
            "rootContextId": "ctx_basic",
            "contextIds": ["ctx_basic", "ctx_alternative"],
            "operationIds": basic_operation_ids,
            "source": _source("/Data/Caller/basic"),
        },
        {
            "id": "abl_passive",
            "characterId": "Caller",
            "abilityType": "passive",
            "rootContextId": "ctx_passive",
            "contextIds": ["ctx_passive", "ctx_passive_trigger"],
            "operationIds": passive_operation_ids,
            "source": _source("/Data/Caller/passive"),
        },
        {
            "id": "abl_passive_empower",
            "characterId": "Caller",
            "abilityType": "passive_empower",
            "rootContextId": "ctx_passive_empower",
            "contextIds": ["ctx_passive_empower"],
            "operationIds": ["op_alias"],
            "source": _source("/Data/Caller/passive_empower"),
        },
    ]
    operation_ids_by_action: dict[str, list[str]] = {}
    operation_context_by_action: dict[str, str] = {}
    operation_type_by_action: dict[str, str] = {}
    for operation in operations:
        operation_ids_by_action.setdefault(
            operation["sourceActionId"], []
        ).append(operation["id"])
        operation_context_by_action[operation["sourceActionId"]] = operation[
            "contextId"
        ]
        operation_type_by_action[operation["sourceActionId"]] = operation[
            "sourceActionType"
        ]
    mappings = [
        _mapping(
            source_action_id,
            operation_context_by_action[source_action_id],
            sorted(operation_ids),
            source_action_type=operation_type_by_action[source_action_id],
        )
        for source_action_id, operation_ids in sorted(
            operation_ids_by_action.items()
        )
    ]
    mappings.extend(
        [
            _mapping(
                "act_preserved",
                "ctx_basic",
                [],
                status="preserved_uninterpreted",
                source_action_type="damage",
            ),
            _mapping(
                "act_technical_preserved",
                "ctx_safety",
                [],
                status="preserved_uninterpreted",
                source_action_type="stat_modifier",
            ),
        ]
    )
    return {
        "schemaVersion": "1.1.0",
        "input": {
            "parserSchemaVersion": "1.0.0",
            "mechanicsChecksum": f"sha256:{'1' * 64}",
            "sources": [],
        },
        "effectIdAliasPolicy": {
            "origin": "effect-id-aliases-v1",
            "genericTrimAllowed": False,
            "rules": [{"rawValue": "Empower ", "resolvedValue": "Empower"}],
        },
        "characters": [
            {
                "id": "chr_caller",
                "characterId": "Caller",
                "traits": ["Villain", "Bio"],
                "source": _source("/Data/Caller"),
            },
            {
                "id": "chr_summon",
                "characterId": "Summon",
                "traits": [],
                "source": _source("/Data/Summon"),
            },
        ],
        "abilities": abilities,
        "contexts": contexts,
        "actionMappings": mappings,
        "effects": [
            _catalog_effect(
                "eff_dot", "DoT", "debuff", opposite="Taunt"
            ),
            _catalog_effect("eff_taunt", "Taunt", "buff"),
            _catalog_effect("eff_empower", "Empower", "buff"),
        ],
        "operations": operations,
        "controlledAliasResolutions": [
            {
                "rawValue": "Empower ",
                "resolvedValue": "Empower",
                "resolutionMethod": "controlled_alias",
                "resolutionOrigin": "effect-id-aliases-v1",
                "resolved": True,
                "catalogEffectId": "eff_empower",
                "characterId": "Caller",
                "abilityType": "passive_empower",
                "contextId": "ctx_passive_empower",
                "sourceActionId": "act_alias",
                "source": _source(
                    "/Data/Caller/passive_empower/actions/0/procs/0"
                ),
            }
        ],
        "inputDiagnostics": [
            {"severity": "warning", "code": "UPSTREAM_WARNING"}
        ],
        "diagnostics": [
            {"severity": "info", "code": "NORMALIZER_INFO"}
        ],
        "audit": {},
    }


def _run_cli(arguments: list[str]) -> tuple[int, str, str]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    with redirect_stdout(stdout), redirect_stderr(stderr):
        status = cli_main(arguments)
    return status, stdout.getvalue(), stderr.getvalue()


class IndexerFixtureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.capabilities = make_capabilities_fixture()
        self.build, self.artifacts = build_artifact_bytes(
            self.capabilities,
            capabilities_checksum=FIXTURE_CHECKSUM,
        )

    def payload(self, path: str) -> dict:
        return json.loads(self.artifacts[path])

    def test_builds_exact_eight_artifacts(self) -> None:
        self.assertEqual(
            set(self.artifacts), set(EXPECTED_ARTIFACT_PATHS)
        )

    def test_generation_is_byte_for_byte_deterministic(self) -> None:
        _, second = build_artifact_bytes(
            copy.deepcopy(self.capabilities),
            capabilities_checksum=FIXTURE_CHECKSUM,
        )
        self.assertEqual(self.artifacts, second)

    def test_root_collection_permutation_is_deterministic(self) -> None:
        permuted = copy.deepcopy(self.capabilities)
        for key in (
            "characters",
            "abilities",
            "contexts",
            "actionMappings",
            "effects",
            "operations",
            "controlledAliasResolutions",
        ):
            permuted[key].reverse()
        _, second = build_artifact_bytes(
            permuted,
            capabilities_checksum=FIXTURE_CHECKSUM,
        )
        self.assertEqual(self.artifacts, second)

    def test_identifier_arrays_are_lexically_sorted(self) -> None:
        characters = self.payload("characters.json")
        caller = characters["records"]["Caller"]
        self.assertEqual(caller["abilityIds"], sorted(caller["abilityIds"]))
        self.assertEqual(
            caller["object"]["traits"], ["Bio", "Villain"]
        )

    def test_operations_use_canonical_ids_and_controlled_fields(self) -> None:
        operations = self.payload("operations.json")
        record = operations["records"]["op_apply"]
        self.assertEqual(record["operationId"], "op_apply")
        self.assertEqual(record["abilityId"], "abl_basic")
        self.assertEqual(
            record["normalizedReference"],
            {"collection": "operations", "id": "op_apply"},
        )
        self.assertNotIn("rawParameters", record)
        self.assertNotIn("rawEffectEntry", record)
        for field in (
            "effect",
            "selector",
            "scope",
            "target",
            "recipient",
            "conditions",
            "control",
            "metrics",
            "flags",
            "source",
        ):
            self.assertIn(field, record)

    def test_operations_index_kinds_and_source_types(self) -> None:
        operations = self.payload("operations.json")
        indexes = operations["indexes"]
        self.assertIn("op_empty", indexes["byKind"]["empty_result"])
        self.assertIn("op_apply", indexes["bySourceActionType"]["proc"])
        self.assertIn(
            "op_remove_generic", indexes["bySelectorMode"]["generic"]
        )
        self.assertIn(
            "op_spawn_pool", indexes["byScopeKind"]["spawn_pool"]
        )

    def test_target_relation_is_literal(self) -> None:
        operations = self.payload("operations.json")
        self.assertEqual(
            operations["indexes"]["byDirectTargetRelation"]["enemy"],
            ["op_apply"],
        )

    def test_passive_trigger_stays_inside_passive_ability(self) -> None:
        contexts = self.payload("contexts.json")
        trigger = contexts["records"]["ctx_passive_trigger"]
        self.assertEqual(trigger["abilityId"], "abl_passive")
        self.assertEqual(
            trigger["object"]["containerType"], "passive_trigger"
        )

    def test_passive_empower_is_an_ability(self) -> None:
        abilities = self.payload("abilities.json")
        self.assertIn("abl_passive_empower", abilities["records"])
        self.assertEqual(
            abilities["records"]["abl_passive_empower"]["object"][
                "abilityType"
            ],
            "passive_empower",
        )

    def test_ability_alternative_stays_in_parent_ability(self) -> None:
        contexts = self.payload("contexts.json")
        alternative = contexts["records"]["ctx_alternative"]
        self.assertEqual(alternative["abilityId"], "abl_basic")
        self.assertEqual(
            alternative["object"]["containerType"],
            "ability_alternative",
        )

    def test_technical_context_does_not_become_ability(self) -> None:
        contexts = self.payload("contexts.json")
        technical = contexts["records"]["ctx_safety"]
        self.assertIsNone(technical["abilityId"])
        self.assertIn(
            "ctx_safety", contexts["indexes"]["withoutAbilityId"]
        )
        operations = self.payload("operations.json")
        self.assertIn("op_empty", operations["indexes"]["withoutAbilityId"])

    def test_explicit_effect_references_are_strict(self) -> None:
        effects = self.payload("effects.json")
        dot = effects["references"]["proc"]["DoT"]
        self.assertIn(
            "op_apply", dot["operationIdsByKind"]["effect_apply"]
        )
        self.assertNotIn("op_remove_generic", serialize_json(dot).decode())

    def test_generic_effect_is_not_assigned_to_catalog_effect(self) -> None:
        effects = self.payload("effects.json")
        generic = effects["genericSelectors"]["byCategory"]["buff"]
        self.assertEqual(
            generic["operationIdsByKind"]["effect_remove"],
            ["op_remove_generic"],
        )
        self.assertNotIn("effectId", generic)
        for summary in effects["references"]["proc"].values():
            self.assertNotIn(
                "op_remove_generic",
                sum(summary["operationIdsByKind"].values(), []),
            )

    def test_effect_flip_is_not_added_to_opposite(self) -> None:
        effects = self.payload("effects.json")
        self.assertIn(
            "op_flip",
            effects["references"]["proc"]["DoT"][
                "operationIdsByKind"
            ]["effect_flip"],
        )
        self.assertNotIn(
            "effect_flip",
            effects["references"]["proc"]["Taunt"][
                "operationIdsByKind"
            ],
        )

    def test_controlled_alias_preserves_traceability(self) -> None:
        effects = self.payload("effects.json")
        alias = effects["controlledAliasResolutions"][0]
        self.assertEqual(alias["rawValue"], "Empower ")
        self.assertEqual(alias["resolvedValue"], "Empower")
        self.assertEqual(alias["resolutionMethod"], "controlled_alias")
        self.assertEqual(
            alias["resolutionOrigin"], "effect-id-aliases-v1"
        )
        self.assertEqual(
            alias["source"]["pointer"],
            "/Data/Caller/passive_empower/actions/0/procs/0",
        )

    def test_unresolved_effect_keeps_raw_exact_identifier(self) -> None:
        effects = self.payload("effects.json")
        unresolved = effects["references"]["proc"]["MissingProc"]
        self.assertIsNone(unresolved["catalogEffectObjectId"])
        self.assertEqual(unresolved["rawValues"], ["MissingProc"])
        self.assertEqual(
            unresolved["operationIdsByKind"]["effect_remove"],
            ["op_unresolved"],
        )

    def test_battlefield_set_and_clear_are_separate(self) -> None:
        effects = self.payload("effects.json")
        self.assertIn("BE_Test", effects["references"]["battlefield"])
        self.assertEqual(
            effects["battlefieldClearOperationIds"],
            ["op_battlefield_clear"],
        )
        self.assertNotIn(
            "op_battlefield_clear",
            json.dumps(effects["references"]["battlefield"]),
        )

    def test_spawn_links_pool_effect_by_three_exact_facets(self) -> None:
        spawns = self.payload("spawns.json")
        record = spawns["records"]["op_spawn_with"]
        self.assertEqual(
            record["pool"][0]["effectApplyOperationIds"],
            ["op_spawn_pool"],
        )
        self.assertEqual(
            record["pool"][1]["effectApplyOperationIds"], []
        )

    def test_spawn_exact_and_missing_character_joins(self) -> None:
        spawns = self.payload("spawns.json")
        pool = spawns["records"]["op_spawn_with"]["pool"]
        self.assertEqual(
            pool[0]["characterJoin"],
            {"method": "exact", "characterObjectId": "chr_summon"},
        )
        self.assertEqual(
            pool[1]["characterJoin"],
            {"method": "none", "characterObjectId": None},
        )

    def test_spawn_with_and_without_pool_effects_remain_visible(self) -> None:
        spawns = self.payload("spawns.json")
        indexes = spawns["indexes"]
        self.assertEqual(
            indexes["withPoolEffectOperations"], ["op_spawn_with"]
        )
        self.assertEqual(
            indexes["withoutPoolEffectOperations"],
            ["op_spawn_without"],
        )

    def test_empty_result_and_empower_remain_distinct(self) -> None:
        operations = self.payload("operations.json")
        self.assertEqual(
            operations["indexes"]["byKind"]["empty_result"], ["op_empty"]
        )
        self.assertEqual(
            operations["indexes"]["byKind"]["empower"], ["op_empower"]
        )

    def test_preserved_uninterpreted_actions_are_exhaustive(self) -> None:
        uninterpreted = self.payload("uninterpreted-actions.json")
        self.assertEqual(
            set(uninterpreted["records"]),
            {"act_preserved", "act_technical_preserved"},
        )
        self.assertEqual(
            uninterpreted["records"]["act_preserved"]["sourcePointer"],
            "/Data/Caller/ctx_basic/actions/act_preserved",
        )
        record = uninterpreted["records"]["act_preserved"]
        for field in (
            "actionOrder", "contextPathIds", "target", "recipient",
            "conditions", "control", "flags", "uninterpretedParameters", "source",
        ):
            self.assertIn(field, record)
        self.assertEqual(record["actionOrder"], 0)
        self.assertEqual(record["target"], {"present": False, "value": None})

    def test_uninterpreted_facets_are_explicitly_available(self) -> None:
        uninterpreted = self.payload("uninterpreted-actions.json")
        self.assertEqual(
            uninterpreted["facetAvailability"],
            {
                "conditionPresence": "available",
                "targetPresence": "available",
                "dependencyPresence": "available",
            },
        )
        self.assertNotIn("bySourcePointer", uninterpreted["indexes"])
        manifest = self.payload(MANIFEST_PATH)
        limitation_codes = {
            limitation["code"] for limitation in manifest["limitations"]
        }
        self.assertNotIn(
            "UNINTERPRETED_FACETS_UNAVAILABLE", limitation_codes
        )

    def test_manifest_contains_exact_payload_checksums(self) -> None:
        manifest = self.payload(MANIFEST_PATH)
        self.assertEqual(
            [item["path"] for item in manifest["payloads"]],
            sorted(PAYLOAD_PATHS),
        )
        for entry in manifest["payloads"]:
            payload = self.artifacts[entry["path"]]
            self.assertEqual(entry["sizeBytes"], len(payload))
            self.assertEqual(
                entry["sha256"], hashlib.sha256(payload).hexdigest()
            )
        self.assertEqual(
            manifest["payloadSetChecksum"],
            "sha256:"
            + compute_payload_set_checksum(manifest["payloads"]),
        )
        self.assertNotIn("manifestChecksum", manifest)

    def test_manifest_omits_timestamp(self) -> None:
        manifest = self.payload(MANIFEST_PATH)
        self.assertEqual(
            manifest["generation"]["timestampPolicy"], "omitted"
        )
        self.assertNotIn("timestamp", manifest["generation"])


class IndexerAuditFailureTests(unittest.TestCase):
    def assertAuditFailure(self, capabilities: dict) -> None:
        with self.assertRaises(IndexerAuditError):
            build_artifact_bytes(
                capabilities,
                capabilities_checksum=FIXTURE_CHECKSUM,
            )

    def test_duplicate_character_identifier_fails(self) -> None:
        capabilities = make_capabilities_fixture()
        capabilities["characters"].append(
            copy.deepcopy(capabilities["characters"][0])
        )
        self.assertAuditFailure(capabilities)

    def test_orphan_action_mapping_context_fails(self) -> None:
        capabilities = make_capabilities_fixture()
        capabilities["actionMappings"][0]["contextId"] = "ctx_missing"
        self.assertAuditFailure(capabilities)

    def test_technical_context_as_ability_fails(self) -> None:
        capabilities = make_capabilities_fixture()
        ability = capabilities["abilities"][0]
        ability["contextIds"].append("ctx_safety")
        ability["operationIds"].extend(["op_empty", "op_empower"])
        self.assertAuditFailure(capabilities)

    def test_generic_selector_with_effect_fails(self) -> None:
        capabilities = make_capabilities_fixture()
        operation = next(
            item
            for item in capabilities["operations"]
            if item["id"] == "op_remove_generic"
        )
        operation["effect"] = _proc_effect(
            "Taunt", "eff_taunt", "/invalid/generic/effect"
        )
        self.assertAuditFailure(capabilities)

    def test_orphan_spawn_pool_index_fails(self) -> None:
        capabilities = make_capabilities_fixture()
        operation = next(
            item
            for item in capabilities["operations"]
            if item["id"] == "op_spawn_pool"
        )
        operation["scope"]["poolIndex"] = 99
        self.assertAuditFailure(capabilities)


class IndexerCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.input_path = self.root / "capabilities.json"
        self.output_path = self.root / "indexed"
        self.input_path.write_bytes(
            serialize_json(make_capabilities_fixture())
        )

    def args(self, *extra: str) -> list[str]:
        return [
            "--input",
            str(self.input_path),
            "--output",
            str(self.output_path),
            *extra,
        ]

    def generate(self) -> None:
        status, _, stderr = _run_cli(self.args())
        self.assertEqual(status, 0, stderr)

    def test_cli_generation_and_check(self) -> None:
        self.generate()
        status, _, stderr = _run_cli(self.args("--check"))
        self.assertEqual(status, 0, stderr)

    def test_check_absent_output_returns_one_without_creating_directory(
        self,
    ) -> None:
        status, _, _ = _run_cli(self.args("--check"))
        self.assertEqual(status, 1)
        self.assertFalse(self.output_path.exists())

    def test_check_detects_missing_payload(self) -> None:
        self.generate()
        (self.output_path / "effects.json").unlink()
        status, _, _ = _run_cli(self.args("--check"))
        self.assertEqual(status, 1)

    def test_check_detects_additional_file(self) -> None:
        self.generate()
        (self.output_path / "unexpected.json").write_text("{}\n")
        status, _, _ = _run_cli(self.args("--check"))
        self.assertEqual(status, 1)

    def test_check_detects_payload_corruption_without_repairing_it(
        self,
    ) -> None:
        self.generate()
        target = self.output_path / "operations.json"
        target.write_bytes(b"{}\n")
        before = target.read_bytes()
        status, _, _ = _run_cli(self.args("--check"))
        self.assertEqual(status, 1)
        self.assertEqual(target.read_bytes(), before)

    def test_check_detects_falsified_manifest(self) -> None:
        self.generate()
        manifest_path = self.output_path / MANIFEST_PATH
        manifest = json.loads(manifest_path.read_bytes())
        manifest["counts"]["characterCount"] = 999
        manifest_path.write_bytes(serialize_json(manifest))
        status, _, _ = _run_cli(self.args("--check"))
        self.assertEqual(status, 1)

    def test_check_detects_obsolete_output(self) -> None:
        self.generate()
        capabilities = json.loads(self.input_path.read_bytes())
        capabilities["characters"][0]["traits"].append("Changed")
        self.input_path.write_bytes(serialize_json(capabilities))
        status, _, _ = _run_cli(self.args("--check"))
        self.assertEqual(status, 1)

    def test_check_writes_no_octet(self) -> None:
        self.generate()
        before = {
            path.name: path.read_bytes()
            for path in self.output_path.iterdir()
        }
        status, _, stderr = _run_cli(self.args("--check"))
        self.assertEqual(status, 0, stderr)
        after = {
            path.name: path.read_bytes()
            for path in self.output_path.iterdir()
        }
        self.assertEqual(before, after)

    def test_invalid_json_returns_two(self) -> None:
        self.input_path.write_bytes(b"{invalid")
        status, _, _ = _run_cli(self.args())
        self.assertEqual(status, 2)
        self.assertFalse(self.output_path.exists())

    def test_unsupported_schema_returns_two(self) -> None:
        capabilities = make_capabilities_fixture()
        capabilities["schemaVersion"] = "2.0.0"
        self.input_path.write_bytes(serialize_json(capabilities))
        status, _, _ = _run_cli(self.args())
        self.assertEqual(status, 2)
        self.assertFalse(self.output_path.exists())

    def test_audit_failure_returns_three_without_partial_output(self) -> None:
        capabilities = make_capabilities_fixture()
        capabilities["characters"].append(
            copy.deepcopy(capabilities["characters"][0])
        )
        self.input_path.write_bytes(serialize_json(capabilities))
        status, _, _ = _run_cli(self.args())
        self.assertEqual(status, 3)
        self.assertFalse(self.output_path.exists())

    def test_two_generations_are_identical(self) -> None:
        self.generate()
        first = {
            path.name: path.read_bytes()
            for path in self.output_path.iterdir()
        }
        self.generate()
        second = {
            path.name: path.read_bytes()
            for path in self.output_path.iterdir()
        }
        self.assertEqual(first, second)


class IndexerRealSnapshotTests(unittest.TestCase):
    def test_validated_snapshot_assertions(self) -> None:
        path = Path(
            "data/msf-capabilities/normalized/capabilities.json"
        )
        if not path.exists():
            self.skipTest("capabilities.json généré absent")
        loaded = load_capabilities(path)
        if loaded.checksum != SNAPSHOT_CAPABILITIES_CHECKSUM:
            self.skipTest("checksum capabilities.json différent")
        build, _ = build_artifact_bytes(
            loaded.document,
            capabilities_checksum=loaded.checksum,
        )
        for key, expected in SNAPSHOT_COUNTS.items():
            self.assertEqual(build.counts[key], expected, key)
        self.assertEqual(
            build.counts["operationsByKind"],
            SNAPSHOT_OPERATION_KINDS,
        )
        self.assertTrue(build.audit["snapshot"]["applied"])
        self.assertEqual(build.audit["snapshot"]["status"], "passed")


if __name__ == "__main__":
    unittest.main()
