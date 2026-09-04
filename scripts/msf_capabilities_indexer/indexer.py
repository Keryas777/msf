"""Build deterministic, canonical-ID indexes from capabilities.json."""

from __future__ import annotations

from collections import defaultdict
import copy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Iterable

from .audit import PROC_OPERATION_KINDS, audit_index, validate_source
from .diagnostics import IndexerInputError


INDEX_SCHEMA_VERSION = "1.1.0"
SUPPORTED_NORMALIZER_SCHEMA_VERSIONS = frozenset({"1.0.0", "1.1.0"})
DEFAULT_INPUT_PATH = Path(
    "data/msf-capabilities/normalized/capabilities.json"
)
DEFAULT_OUTPUT_DIRECTORY = Path("data/msf-capabilities/indexed")
MANIFEST_PATH = "index-manifest.json"
PAYLOAD_PATHS = (
    "abilities.json",
    "characters.json",
    "contexts.json",
    "effects.json",
    "operations.json",
    "spawns.json",
    "uninterpreted-actions.json",
)
EXPECTED_ARTIFACT_PATHS = (MANIFEST_PATH, *PAYLOAD_PATHS)

OPERATION_VIEW_FIELDS = (
    "kind",
    "characterId",
    "abilityType",
    "contextId",
    "contextPathIds",
    "sourceActionId",
    "sourceActionType",
    "rawSourceActionType",
    "actionOrder",
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
)


@dataclass(frozen=True)
class LoadedCapabilities:
    document: dict[str, Any]
    payload: bytes
    checksum: str


@dataclass(frozen=True)
class IndexBuild:
    payloads: dict[str, dict[str, Any]]
    audit: dict[str, Any]
    diagnostics: dict[str, Any]
    counts: dict[str, Any]
    normalizer_schema_version: str
    parser_schema_version: str | None
    mechanics_checksum: str | None
    capabilities_checksum: str


def _reject_constant(value: str) -> None:
    raise ValueError(f"Valeur JSON non finie interdite : {value}.")


def _object_without_duplicate_keys(
    pairs: list[tuple[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Clé JSON dupliquée : {key!r}.")
        result[key] = value
    return result


def load_capabilities(path: Path = DEFAULT_INPUT_PATH) -> LoadedCapabilities:
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise IndexerInputError(
            "MISSING_INDEXER_INPUT",
            f"Entrée normalisée indisponible : {path}: {error}",
        ) from error
    try:
        text = payload.decode("utf-8")
        document = json.loads(
            text,
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise IndexerInputError(
            "INVALID_INDEXER_INPUT",
            f"JSON normalisé invalide : {path}: {error}",
        ) from error
    if not isinstance(document, dict):
        raise IndexerInputError(
            "INVALID_INDEXER_INPUT",
            "La racine de capabilities.json doit être un objet.",
        )
    if document.get("schemaVersion") not in SUPPORTED_NORMALIZER_SCHEMA_VERSIONS:
        raise IndexerInputError(
            "UNSUPPORTED_NORMALIZER_SCHEMA",
            "schemaVersion du normaliseur non supportée : "
            f"{document.get('schemaVersion')!r}.",
        )
    return LoadedCapabilities(
        document=document,
        payload=payload,
        checksum=hashlib.sha256(payload).hexdigest(),
    )


def serialize_json(document: Any) -> bytes:
    try:
        text = json.dumps(
            document,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as error:
        raise IndexerInputError(
            "INVALID_INDEX_OUTPUT",
            f"Artefact non sérialisable : {error}",
        ) from error
    return (text + "\n").encode("utf-8")


def _sha256_prefixed(checksum: str) -> str:
    return checksum if checksum.startswith("sha256:") else f"sha256:{checksum}"


def _common_payload(
    *,
    artifact_type: str,
    normalizer_schema_version: str,
    parser_schema_version: str | None,
    capabilities_checksum: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "artifactType": artifact_type,
        "normalizerSchemaVersion": normalizer_schema_version,
        "parserSchemaVersion": parser_schema_version,
        "capabilitiesChecksum": _sha256_prefixed(capabilities_checksum),
    }


def _sorted_unique(values: Iterable[str]) -> list[str]:
    return sorted(set(values))


def _sorted_group_sets(
    groups: dict[str, set[str]] | defaultdict[str, set[str]],
) -> dict[str, list[str]]:
    return {
        key: sorted(groups[key])
        for key in sorted(groups)
    }


def _copy_character(character: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(character)
    result["traits"] = _sorted_unique(result.get("traits", []))
    return result


def _copy_ability(ability: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(ability)
    result["contextIds"] = _sorted_unique(result.get("contextIds", []))
    result["operationIds"] = _sorted_unique(result.get("operationIds", []))
    return result


def _operation_effect_facets(
    operation_ids: Iterable[str],
    operation_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    proc_effects: dict[str, set[str]] = {
        kind: set() for kind in sorted(PROC_OPERATION_KINDS)
    }
    generic_operations: dict[str, set[str]] = {
        kind: set() for kind in sorted(PROC_OPERATION_KINDS)
    }
    battlefield_set_effect_ids: set[str] = set()
    battlefield_set_operation_ids: set[str] = set()
    battlefield_clear_operation_ids: set[str] = set()
    operation_kinds: set[str] = set()
    for operation_id in operation_ids:
        operation = operation_by_id[operation_id]
        kind = operation["kind"]
        operation_kinds.add(kind)
        effect = operation.get("effect")
        selector = operation.get("selector", {})
        if (
            kind in PROC_OPERATION_KINDS
            and isinstance(effect, dict)
            and effect.get("namespace") == "proc"
            and isinstance(effect.get("effectId"), str)
        ):
            proc_effects[kind].add(effect["effectId"])
        elif (
            kind in PROC_OPERATION_KINDS
            and selector.get("mode") == "generic"
        ):
            generic_operations[kind].add(operation_id)
        if (
            kind == "battlefield_effect_set"
            and isinstance(effect, dict)
            and isinstance(effect.get("effectId"), str)
        ):
            battlefield_set_effect_ids.add(effect["effectId"])
            battlefield_set_operation_ids.add(operation_id)
        elif kind == "battlefield_effect_clear":
            battlefield_clear_operation_ids.add(operation_id)
    return {
        "operationKinds": sorted(operation_kinds),
        "procEffectIdsByKind": {
            kind: sorted(proc_effects[kind])
            for kind in sorted(proc_effects)
        },
        "genericEffectOperationIdsByKind": {
            kind: sorted(generic_operations[kind])
            for kind in sorted(generic_operations)
        },
        "battlefield": {
            "setEffectIds": sorted(battlefield_set_effect_ids),
            "setOperationIds": sorted(battlefield_set_operation_ids),
            "clearOperationIds": sorted(battlefield_clear_operation_ids),
        },
    }


def _build_operations_payload(
    *,
    capabilities: dict[str, Any],
    ability_by_context: dict[str, str],
    context_by_id: dict[str, dict[str, Any]],
    common: dict[str, Any],
) -> dict[str, Any]:
    records: dict[str, dict[str, Any]] = {}
    action_mappings: dict[str, dict[str, Any]] = {}
    index_groups: dict[str, defaultdict[str, set[str]]] = {
        name: defaultdict(set)
        for name in (
            "byKind",
            "byCharacterId",
            "byAbilityId",
            "byAbilityType",
            "byContextId",
            "bySourceActionId",
            "bySourceActionType",
            "byRawSourceActionType",
            "bySelectorMode",
            "bySelectorCategory",
            "byScopeKind",
            "byResolutionMethod",
            "byEffectResolution",
            "byTargetPresence",
            "byDirectTargetRelation",
        )
    }
    without_character_id: set[str] = set()
    without_ability_id: set[str] = set()
    without_ability_type: set[str] = set()
    without_selector_category: set[str] = set()
    without_direct_target_relation: set[str] = set()

    for operation in sorted(
        capabilities["operations"], key=lambda item: item["id"]
    ):
        operation_id = operation["id"]
        ability_id = ability_by_context.get(operation["contextId"])
        record = {
            "operationId": operation_id,
            "normalizedReference": {
                "collection": "operations",
                "id": operation_id,
            },
            "abilityId": ability_id,
        }
        for field in OPERATION_VIEW_FIELDS:
            record[field] = copy.deepcopy(operation[field])
        if "turnMeter" in operation:
            record["turnMeter"] = copy.deepcopy(operation["turnMeter"])
        selector = record["selector"]
        for exclusion in selector.get("exclusions", []):
            if isinstance(exclusion, dict) and isinstance(
                exclusion.get("effectIds"), list
            ):
                exclusion["effectIds"] = _sorted_unique(
                    exclusion["effectIds"]
                )
        records[operation_id] = record

        index_groups["byKind"][operation["kind"]].add(operation_id)
        character_id = operation.get("characterId")
        if isinstance(character_id, str):
            index_groups["byCharacterId"][character_id].add(operation_id)
        else:
            without_character_id.add(operation_id)
        if ability_id is not None:
            index_groups["byAbilityId"][ability_id].add(operation_id)
        else:
            without_ability_id.add(operation_id)
        ability_type = operation.get("abilityType")
        if isinstance(ability_type, str):
            index_groups["byAbilityType"][ability_type].add(operation_id)
        else:
            without_ability_type.add(operation_id)
        index_groups["byContextId"][operation["contextId"]].add(operation_id)
        index_groups["bySourceActionId"][operation["sourceActionId"]].add(
            operation_id
        )
        index_groups["bySourceActionType"][
            operation["sourceActionType"]
        ].add(operation_id)
        index_groups["byRawSourceActionType"][
            operation["rawSourceActionType"]
        ].add(operation_id)
        selector_mode = operation["selector"]["mode"]
        index_groups["bySelectorMode"][selector_mode].add(operation_id)
        selector_category = operation["selector"].get("category")
        if isinstance(selector_category, str):
            index_groups["bySelectorCategory"][selector_category].add(
                operation_id
            )
        else:
            without_selector_category.add(operation_id)
        index_groups["byScopeKind"][operation["scope"]["kind"]].add(
            operation_id
        )
        effect = operation.get("effect")
        if isinstance(effect, dict):
            method = effect.get("resolutionMethod")
            if isinstance(method, str):
                index_groups["byResolutionMethod"][method].add(operation_id)
            if effect.get("namespace") == "proc":
                resolution_group = (
                    "resolved"
                    if effect.get("resolved") is True
                    else "unresolved"
                )
            else:
                resolution_group = "not_applicable"
        else:
            resolution_group = "without_explicit_effect"
        index_groups["byEffectResolution"][resolution_group].add(operation_id)
        target = operation.get("target", {})
        target_group = "present" if target.get("present") is True else "absent"
        index_groups["byTargetPresence"][target_group].add(operation_id)
        target_value = target.get("value")
        relation = (
            target_value.get("relation")
            if isinstance(target_value, dict)
            else None
        )
        if isinstance(relation, str):
            index_groups["byDirectTargetRelation"][relation].add(operation_id)
        else:
            without_direct_target_relation.add(operation_id)

    for mapping in sorted(
        capabilities["actionMappings"],
        key=lambda item: item["sourceActionId"],
    ):
        if mapping["status"] != "normalized":
            continue
        context = context_by_id[mapping["contextId"]]
        source_action_id = mapping["sourceActionId"]
        action_mappings[source_action_id] = {
            "sourceActionId": source_action_id,
            "normalizedReference": {
                "collection": "actionMappings",
                "id": source_action_id,
            },
            "characterId": context.get("characterId"),
            "abilityId": ability_by_context.get(mapping["contextId"]),
            "abilityType": context.get("abilityType"),
            "contextId": mapping["contextId"],
            "rawSourceActionType": mapping["rawSourceActionType"],
            "sourceActionType": mapping["sourceActionType"],
            "status": mapping["status"],
            "operationIds": _sorted_unique(mapping["operationIds"]),
            "source": copy.deepcopy(mapping["source"]),
        }

    indexes = {
        name: _sorted_group_sets(groups)
        for name, groups in sorted(index_groups.items())
    }
    indexes.update(
        {
            "withoutCharacterId": sorted(without_character_id),
            "withoutAbilityId": sorted(without_ability_id),
            "withoutAbilityType": sorted(without_ability_type),
            "withoutSelectorCategory": sorted(without_selector_category),
            "withoutDirectTargetRelation": sorted(
                without_direct_target_relation
            ),
        }
    )
    result = dict(common)
    result.update(
        {
            "artifactType": "operations",
            "records": records,
            "actionMappings": action_mappings,
            "indexes": indexes,
            "counts": {
                "recordCount": len(records),
                "actionMappingCount": len(action_mappings),
                "byKind": {
                    key: len(value)
                    for key, value in indexes["byKind"].items()
                },
            },
        }
    )
    return result


def _build_contexts_payload(
    *,
    capabilities: dict[str, Any],
    ability_by_context: dict[str, str],
    mappings_by_context: dict[str, list[dict[str, Any]]],
    operations_by_context: dict[str, list[dict[str, Any]]],
    common: dict[str, Any],
) -> dict[str, Any]:
    records: dict[str, dict[str, Any]] = {}
    groups: dict[str, defaultdict[str, set[str]]] = {
        name: defaultdict(set)
        for name in (
            "byCharacterId",
            "byAbilityId",
            "byClassification",
            "byContainerType",
            "byTechnicalKey",
        )
    }
    children: defaultdict[str, set[str]] = defaultdict(set)
    for context in capabilities["contexts"]:
        if context.get("parentContextId") is not None:
            children[context["parentContextId"]].add(context["id"])

    without_character_id: set[str] = set()
    without_ability_id: set[str] = set()
    without_technical_key: set[str] = set()
    root_context_ids: set[str] = set()
    for context in sorted(
        capabilities["contexts"], key=lambda item: item["id"]
    ):
        context_id = context["id"]
        mappings = mappings_by_context.get(context_id, [])
        operations = operations_by_context.get(context_id, [])
        ability_id = ability_by_context.get(context_id)
        records[context_id] = {
            "object": copy.deepcopy(context),
            "abilityId": ability_id,
            "childContextIds": sorted(children.get(context_id, set())),
            "operationIds": sorted(item["id"] for item in operations),
            "sourceActionIds": sorted(
                item["sourceActionId"] for item in mappings
            ),
            "preservedUninterpretedSourceActionIds": sorted(
                item["sourceActionId"]
                for item in mappings
                if item["status"] == "preserved_uninterpreted"
            ),
        }
        character_id = context.get("characterId")
        if isinstance(character_id, str):
            groups["byCharacterId"][character_id].add(context_id)
        else:
            without_character_id.add(context_id)
        if ability_id is not None:
            groups["byAbilityId"][ability_id].add(context_id)
        else:
            without_ability_id.add(context_id)
        groups["byClassification"][context["classification"]].add(context_id)
        groups["byContainerType"][context["containerType"]].add(context_id)
        technical_key = context.get("technicalKey")
        if isinstance(technical_key, str):
            groups["byTechnicalKey"][technical_key].add(context_id)
        else:
            without_technical_key.add(context_id)
        if context.get("parentContextId") is None:
            root_context_ids.add(context_id)
    indexes = {
        name: _sorted_group_sets(value)
        for name, value in sorted(groups.items())
    }
    indexes.update(
        {
            "withoutCharacterId": sorted(without_character_id),
            "withoutAbilityId": sorted(without_ability_id),
            "withoutTechnicalKey": sorted(without_technical_key),
            "rootContextIds": sorted(root_context_ids),
        }
    )
    result = dict(common)
    result.update(
        {
            "artifactType": "contexts",
            "records": records,
            "indexes": indexes,
            "counts": {
                "recordCount": len(records),
                "withAbilityCount": len(records) - len(without_ability_id),
                "withoutAbilityCount": len(without_ability_id),
                "byClassification": {
                    key: len(value)
                    for key, value in indexes["byClassification"].items()
                },
                "byContainerType": {
                    key: len(value)
                    for key, value in indexes["byContainerType"].items()
                },
            },
        }
    )
    return result


def _build_characters_payload(
    *,
    capabilities: dict[str, Any],
    ability_by_character: dict[str, list[dict[str, Any]]],
    contexts_by_character: dict[str, list[dict[str, Any]]],
    mappings_by_context: dict[str, list[dict[str, Any]]],
    operations_by_context: dict[str, list[dict[str, Any]]],
    operation_by_id: dict[str, dict[str, Any]],
    common: dict[str, Any],
) -> dict[str, Any]:
    records: dict[str, dict[str, Any]] = {}
    by_object_id: dict[str, str] = {}
    for character in sorted(
        capabilities["characters"], key=lambda item: item["characterId"]
    ):
        character_id = character["characterId"]
        contexts = contexts_by_character.get(character_id, [])
        context_ids = {item["id"] for item in contexts}
        mappings = [
            mapping
            for context_id in context_ids
            for mapping in mappings_by_context.get(context_id, [])
        ]
        operations = [
            operation
            for context_id in context_ids
            for operation in operations_by_context.get(context_id, [])
        ]
        operation_ids = sorted(item["id"] for item in operations)
        facets = _operation_effect_facets(operation_ids, operation_by_id)
        records[character_id] = {
            "object": _copy_character(character),
            "abilityIds": sorted(
                item["id"]
                for item in ability_by_character.get(character_id, [])
            ),
            "contextIds": sorted(context_ids),
            "technicalContextIds": sorted(
                item["id"]
                for item in contexts
                if item.get("classification") == "technical-review"
            ),
            "operationIds": operation_ids,
            "sourceActionIds": sorted(
                item["sourceActionId"] for item in mappings
            ),
            "spawnOperationIds": sorted(
                item["id"] for item in operations if item["kind"] == "spawn"
            ),
            "preservedUninterpretedSourceActionIds": sorted(
                item["sourceActionId"]
                for item in mappings
                if item["status"] == "preserved_uninterpreted"
            ),
            **facets,
        }
        by_object_id[character["id"]] = character_id
    result = dict(common)
    result.update(
        {
            "artifactType": "characters",
            "records": records,
            "indexes": {
                "byObjectId": {
                    key: by_object_id[key] for key in sorted(by_object_id)
                }
            },
            "counts": {"recordCount": len(records)},
        }
    )
    return result


def _build_abilities_payload(
    *,
    capabilities: dict[str, Any],
    mappings_by_context: dict[str, list[dict[str, Any]]],
    operation_by_id: dict[str, dict[str, Any]],
    common: dict[str, Any],
) -> dict[str, Any]:
    records: dict[str, dict[str, Any]] = {}
    by_character: defaultdict[str, set[str]] = defaultdict(set)
    by_type: defaultdict[str, set[str]] = defaultdict(set)
    by_root_context: dict[str, str] = {}
    for ability in sorted(
        capabilities["abilities"], key=lambda item: item["id"]
    ):
        ability_id = ability["id"]
        context_ids = set(ability["contextIds"])
        mappings = [
            mapping
            for context_id in context_ids
            for mapping in mappings_by_context.get(context_id, [])
        ]
        operation_ids = _sorted_unique(ability["operationIds"])
        records[ability_id] = {
            "object": _copy_ability(ability),
            "sourceActionIds": sorted(
                item["sourceActionId"] for item in mappings
            ),
            "spawnOperationIds": sorted(
                operation_id
                for operation_id in operation_ids
                if operation_by_id[operation_id]["kind"] == "spawn"
            ),
            "preservedUninterpretedSourceActionIds": sorted(
                item["sourceActionId"]
                for item in mappings
                if item["status"] == "preserved_uninterpreted"
            ),
            **_operation_effect_facets(operation_ids, operation_by_id),
        }
        by_character[ability["characterId"]].add(ability_id)
        by_type[ability["abilityType"]].add(ability_id)
        by_root_context[ability["rootContextId"]] = ability_id
    result = dict(common)
    result.update(
        {
            "artifactType": "abilities",
            "records": records,
            "indexes": {
                "byCharacterId": _sorted_group_sets(by_character),
                "byAbilityType": _sorted_group_sets(by_type),
                "byRootContextId": {
                    key: by_root_context[key]
                    for key in sorted(by_root_context)
                },
            },
            "counts": {
                "recordCount": len(records),
                "byAbilityType": {
                    key: len(value)
                    for key, value in _sorted_group_sets(by_type).items()
                },
            },
        }
    )
    return result


def _reference_summary(
    *,
    effect_id: str | None,
    operations: list[dict[str, Any]],
    ability_by_context: dict[str, str],
) -> dict[str, Any]:
    operation_ids_by_kind: defaultdict[str, set[str]] = defaultdict(set)
    character_ids_by_kind: defaultdict[str, set[str]] = defaultdict(set)
    ability_ids_by_kind: defaultdict[str, set[str]] = defaultdict(set)
    context_ids_by_kind: defaultdict[str, set[str]] = defaultdict(set)
    without_character_by_kind: defaultdict[str, set[str]] = defaultdict(set)
    without_ability_by_kind: defaultdict[str, set[str]] = defaultdict(set)
    resolution_methods: defaultdict[str, set[str]] = defaultdict(set)
    raw_values: set[str] = set()
    resolved_values: set[str] = set()
    catalog_ids: set[str] = set()
    for operation in operations:
        operation_id = operation["id"]
        kind = operation["kind"]
        operation_ids_by_kind[kind].add(operation_id)
        character_id = operation.get("characterId")
        if isinstance(character_id, str):
            character_ids_by_kind[kind].add(character_id)
        else:
            without_character_by_kind[kind].add(operation_id)
        ability_id = ability_by_context.get(operation["contextId"])
        if ability_id is not None:
            ability_ids_by_kind[kind].add(ability_id)
        else:
            without_ability_by_kind[kind].add(operation_id)
        context_ids_by_kind[kind].add(operation["contextId"])
        effect = operation.get("effect")
        if isinstance(effect, dict):
            method = effect.get("resolutionMethod")
            if isinstance(method, str):
                resolution_methods[method].add(operation_id)
            raw_value = effect.get("rawValue")
            if isinstance(raw_value, str):
                raw_values.add(raw_value)
            resolved_value = effect.get("resolvedValue")
            if isinstance(resolved_value, str):
                resolved_values.add(resolved_value)
            catalog_id = effect.get("catalogEffectId")
            if isinstance(catalog_id, str):
                catalog_ids.add(catalog_id)
    return {
        **({"effectId": effect_id} if effect_id is not None else {}),
        "catalogEffectObjectId": (
            next(iter(catalog_ids)) if len(catalog_ids) == 1 else None
        ),
        "rawValues": sorted(raw_values),
        "resolvedValues": sorted(resolved_values),
        "operationIdsByKind": _sorted_group_sets(operation_ids_by_kind),
        "characterIdsByKind": _sorted_group_sets(character_ids_by_kind),
        "abilityIdsByKind": _sorted_group_sets(ability_ids_by_kind),
        "contextIdsByKind": _sorted_group_sets(context_ids_by_kind),
        "operationIdsWithoutCharacterIdByKind": _sorted_group_sets(
            without_character_by_kind
        ),
        "operationIdsWithoutAbilityIdByKind": _sorted_group_sets(
            without_ability_by_kind
        ),
        "operationIdsByResolutionMethod": _sorted_group_sets(
            resolution_methods
        ),
        "counts": {
            "operationCount": len(operations),
            "byKind": {
                key: len(value)
                for key, value in _sorted_group_sets(
                    operation_ids_by_kind
                ).items()
            },
        },
    }


def _build_effects_payload(
    *,
    capabilities: dict[str, Any],
    ability_by_context: dict[str, str],
    common: dict[str, Any],
) -> dict[str, Any]:
    catalog_by_effect_id: dict[str, dict[str, Any]] = {}
    catalog_by_object_id: dict[str, str] = {}
    catalog_by_category: defaultdict[str, set[str]] = defaultdict(set)
    catalog_without_category: set[str] = set()
    for effect in sorted(
        capabilities["effects"], key=lambda item: item["effectId"]
    ):
        effect_id = effect["effectId"]
        catalog_by_effect_id[effect_id] = copy.deepcopy(effect)
        catalog_by_object_id[effect["id"]] = effect_id
        category = effect.get("category")
        if isinstance(category, str):
            catalog_by_category[category].add(effect_id)
        else:
            catalog_without_category.add(effect_id)

    explicit_groups: dict[
        str, defaultdict[str, list[dict[str, Any]]]
    ] = {
        "proc": defaultdict(list),
        "battlefield": defaultdict(list),
    }
    generic_by_category: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    generic_without_category: list[dict[str, Any]] = []
    battlefield_clear_operation_ids: set[str] = set()
    for operation in capabilities["operations"]:
        effect = operation.get("effect")
        if isinstance(effect, dict):
            explicit_groups[effect["namespace"]][effect["effectId"]].append(
                operation
            )
        elif (
            operation["kind"] in PROC_OPERATION_KINDS
            and operation["selector"].get("mode") == "generic"
        ):
            category = operation["selector"].get("category")
            if isinstance(category, str):
                generic_by_category[category].append(operation)
            else:
                generic_without_category.append(operation)
        elif operation["kind"] == "battlefield_effect_clear":
            battlefield_clear_operation_ids.add(operation["id"])

    references = {
        namespace: {
            effect_id: _reference_summary(
                effect_id=effect_id,
                operations=sorted(
                    operations, key=lambda item: item["id"]
                ),
                ability_by_context=ability_by_context,
            )
            for effect_id, operations in sorted(groups.items())
        }
        for namespace, groups in sorted(explicit_groups.items())
    }
    generic_summaries = {
        category: _reference_summary(
            effect_id=None,
            operations=sorted(operations, key=lambda item: item["id"]),
            ability_by_context=ability_by_context,
        )
        for category, operations in sorted(generic_by_category.items())
    }
    without_category_summary = _reference_summary(
        effect_id=None,
        operations=sorted(
            generic_without_category, key=lambda item: item["id"]
        ),
        ability_by_context=ability_by_context,
    )
    aliases = sorted(
        (copy.deepcopy(item) for item in capabilities["controlledAliasResolutions"]),
        key=lambda item: (
            item.get("source", {}).get("file", ""),
            item.get("source", {}).get("pointer", ""),
            item.get("rawValue", ""),
            item.get("resolvedValue", ""),
            item.get("sourceActionId") or "",
        ),
    )
    result = dict(common)
    result.update(
        {
            "artifactType": "effects",
            "catalog": {
                "byEffectId": catalog_by_effect_id,
                "indexes": {
                    "byObjectId": {
                        key: catalog_by_object_id[key]
                        for key in sorted(catalog_by_object_id)
                    },
                    "byCategory": _sorted_group_sets(catalog_by_category),
                    "withoutCategory": sorted(catalog_without_category),
                },
            },
            "references": references,
            "genericSelectors": {
                "byCategory": generic_summaries,
                "withoutCategory": without_category_summary,
            },
            "battlefieldClearOperationIds": sorted(
                battlefield_clear_operation_ids
            ),
            "controlledAliasResolutions": aliases,
            "counts": {
                "catalogEffectCount": len(catalog_by_effect_id),
                "explicitProcOperationCount": sum(
                    len(value) for value in explicit_groups["proc"].values()
                ),
                "battlefieldSetOperationCount": sum(
                    len(value)
                    for value in explicit_groups["battlefield"].values()
                ),
                "battlefieldClearOperationCount": len(
                    battlefield_clear_operation_ids
                ),
                "genericSelectorOperationCount": len(
                    generic_without_category
                )
                + sum(len(value) for value in generic_by_category.values()),
                "controlledAliasResolutionCount": len(aliases),
                "unresolvedProcReferenceCount": sum(
                    operation.get("effect", {}).get("resolved") is False
                    for operations in explicit_groups["proc"].values()
                    for operation in operations
                ),
            },
        }
    )
    return result


def _build_spawns_payload(
    *,
    capabilities: dict[str, Any],
    character_object_id_by_character_id: dict[str, str],
    ability_by_context: dict[str, str],
    common: dict[str, Any],
) -> dict[str, Any]:
    pool_effects: defaultdict[
        tuple[str, int], list[dict[str, Any]]
    ] = defaultdict(list)
    for operation in capabilities["operations"]:
        scope = operation.get("scope", {})
        if scope.get("kind") == "spawn_pool":
            pool_effects[
                (operation["sourceActionId"], scope["poolIndex"])
            ].append(operation)

    records: dict[str, dict[str, Any]] = {}
    by_invoker: defaultdict[str, set[str]] = defaultdict(set)
    by_ability: defaultdict[str, set[str]] = defaultdict(set)
    by_spawned: defaultdict[str, set[str]] = defaultdict(set)
    by_source_action: defaultdict[str, set[str]] = defaultdict(set)
    without_invoker: set[str] = set()
    without_ability: set[str] = set()
    with_pool_effects: set[str] = set()
    without_pool_effects: set[str] = set()
    pool_effect_operation_count = 0
    for operation in sorted(
        (
            item
            for item in capabilities["operations"]
            if item["kind"] == "spawn"
        ),
        key=lambda item: item["id"],
    ):
        operation_id = operation["id"]
        source_action_id = operation["sourceActionId"]
        ability_id = ability_by_context.get(operation["contextId"])
        raw_parameters = copy.deepcopy(operation["rawParameters"])
        raw_pool = raw_parameters.pop("pool", [])
        pool: list[dict[str, Any]] = []
        linked_for_spawn: set[str] = set()
        for pool_index, raw_entry in enumerate(raw_pool):
            raw_entry_copy = copy.deepcopy(raw_entry)
            spawned_character_id = (
                raw_entry_copy.get("character")
                if isinstance(raw_entry_copy, dict)
                and isinstance(raw_entry_copy.get("character"), str)
                else None
            )
            character_object_id = (
                character_object_id_by_character_id.get(spawned_character_id)
                if spawned_character_id is not None
                else None
            )
            linked = sorted(
                item["id"]
                for item in pool_effects.get(
                    (source_action_id, pool_index), []
                )
            )
            linked_for_spawn.update(linked)
            pool_effect_operation_count += len(linked)
            pool.append(
                {
                    "poolIndex": pool_index,
                    "spawnedCharacterId": spawned_character_id,
                    "raw": raw_entry_copy,
                    "effectApplyOperationIds": linked,
                    "characterJoin": {
                        "method": (
                            "exact"
                            if character_object_id is not None
                            else "none"
                        ),
                        "characterObjectId": character_object_id,
                    },
                }
            )
            if spawned_character_id is not None:
                by_spawned[spawned_character_id].add(operation_id)
        record = {
            "operationId": operation_id,
            "normalizedReference": {
                "collection": "operations",
                "id": operation_id,
            },
            "invokingCharacterId": operation.get("characterId"),
            "abilityId": ability_id,
            "abilityType": operation.get("abilityType"),
            "contextId": operation["contextId"],
            "contextPathIds": copy.deepcopy(operation["contextPathIds"]),
            "sourceActionId": source_action_id,
            "sourceActionType": operation["sourceActionType"],
            "rawSourceActionType": operation["rawSourceActionType"],
            "actionOrder": operation["actionOrder"],
            "selector": copy.deepcopy(operation["selector"]),
            "scope": copy.deepcopy(operation["scope"]),
            "target": copy.deepcopy(operation["target"]),
            "recipient": copy.deepcopy(operation["recipient"]),
            "conditions": copy.deepcopy(operation["conditions"]),
            "control": copy.deepcopy(operation["control"]),
            "metrics": copy.deepcopy(operation["metrics"]),
            "flags": copy.deepcopy(operation["flags"]),
            "source": copy.deepcopy(operation["source"]),
            "parameters": raw_parameters,
            "pool": pool,
        }
        records[operation_id] = record
        invoking_character_id = operation.get("characterId")
        if isinstance(invoking_character_id, str):
            by_invoker[invoking_character_id].add(operation_id)
        else:
            without_invoker.add(operation_id)
        if ability_id is not None:
            by_ability[ability_id].add(operation_id)
        else:
            without_ability.add(operation_id)
        by_source_action[source_action_id].add(operation_id)
        if linked_for_spawn:
            with_pool_effects.add(operation_id)
        else:
            without_pool_effects.add(operation_id)
    result = dict(common)
    result.update(
        {
            "artifactType": "spawns",
            "records": records,
            "indexes": {
                "byInvokingCharacterId": _sorted_group_sets(by_invoker),
                "byAbilityId": _sorted_group_sets(by_ability),
                "bySpawnedCharacterId": _sorted_group_sets(by_spawned),
                "bySourceActionId": _sorted_group_sets(by_source_action),
                "withoutInvokingCharacterId": sorted(without_invoker),
                "withoutAbilityId": sorted(without_ability),
                "withPoolEffectOperations": sorted(with_pool_effects),
                "withoutPoolEffectOperations": sorted(without_pool_effects),
            },
            "counts": {
                "recordCount": len(records),
                "poolEntryCount": sum(
                    len(record["pool"]) for record in records.values()
                ),
                "poolEffectOperationCount": pool_effect_operation_count,
                "withPoolEffectOperationCount": len(with_pool_effects),
                "withoutPoolEffectOperationCount": len(without_pool_effects),
            },
        }
    )
    return result


def _build_uninterpreted_payload(
    *,
    capabilities: dict[str, Any],
    context_by_id: dict[str, dict[str, Any]],
    ability_by_context: dict[str, str],
    common: dict[str, Any],
) -> dict[str, Any]:
    records: dict[str, dict[str, Any]] = {}
    groups: dict[str, defaultdict[str, set[str]]] = {
        name: defaultdict(set)
        for name in (
            "bySourceActionType",
            "byRawSourceActionType",
            "byCharacterId",
            "byAbilityId",
            "byContextId",
            "byContainerType",
            "byTechnicalKey",
            "bySourceFile",
        )
    }
    without_character_id: set[str] = set()
    without_ability_id: set[str] = set()
    without_technical_key: set[str] = set()
    for mapping in sorted(
        (
            item
            for item in capabilities["actionMappings"]
            if item["status"] == "preserved_uninterpreted"
        ),
        key=lambda item: item["sourceActionId"],
    ):
        source_action_id = mapping["sourceActionId"]
        context = context_by_id[mapping["contextId"]]
        character_id = context.get("characterId")
        ability_id = ability_by_context.get(mapping["contextId"])
        technical_key = context.get("technicalKey")
        source = copy.deepcopy(mapping["source"])
        records[source_action_id] = {
            "sourceActionId": source_action_id,
            "normalizedReference": {
                "collection": "actionMappings",
                "id": source_action_id,
            },
            "characterId": mapping.get("characterId", character_id),
            "abilityId": ability_id,
            "abilityType": mapping.get(
                "abilityType", context.get("abilityType")
            ),
            "contextId": mapping["contextId"],
            "contextPathIds": copy.deepcopy(mapping.get("contextPathIds", [])),
            "actionOrder": mapping.get("actionOrder"),
            "classification": mapping.get(
                "classification", context["classification"]
            ),
            "containerType": mapping.get(
                "containerType", context["containerType"]
            ),
            "technicalKey": mapping.get("technicalKey", technical_key),
            "rawSourceActionType": mapping["rawSourceActionType"],
            "sourceActionType": mapping["sourceActionType"],
            "status": mapping["status"],
            "operationIds": [],
            "target": copy.deepcopy(mapping.get("target")),
            "recipient": copy.deepcopy(mapping.get("recipient")),
            "conditions": copy.deepcopy(mapping.get("conditions", [])),
            "control": copy.deepcopy(mapping.get("control", {})),
            "flags": copy.deepcopy(mapping.get("flags", {})),
            "uninterpretedParameters": copy.deepcopy(
                mapping.get("uninterpretedParameters", {})
            ),
            "sourcePointer": source["pointer"],
            "source": source,
        }
        groups["bySourceActionType"][mapping["sourceActionType"]].add(
            source_action_id
        )
        groups["byRawSourceActionType"][mapping["rawSourceActionType"]].add(
            source_action_id
        )
        if isinstance(character_id, str):
            groups["byCharacterId"][character_id].add(source_action_id)
        else:
            without_character_id.add(source_action_id)
        if ability_id is not None:
            groups["byAbilityId"][ability_id].add(source_action_id)
        else:
            without_ability_id.add(source_action_id)
        groups["byContextId"][mapping["contextId"]].add(source_action_id)
        groups["byContainerType"][context["containerType"]].add(
            source_action_id
        )
        if isinstance(technical_key, str):
            groups["byTechnicalKey"][technical_key].add(source_action_id)
        else:
            without_technical_key.add(source_action_id)
        groups["bySourceFile"][source["file"]].add(source_action_id)
    indexes = {
        name: _sorted_group_sets(value)
        for name, value in sorted(groups.items())
    }
    indexes.update(
        {
            "withoutCharacterId": sorted(without_character_id),
            "withoutAbilityId": sorted(without_ability_id),
            "withoutTechnicalKey": sorted(without_technical_key),
        }
    )
    result = dict(common)
    result.update(
        {
            "artifactType": "uninterpreted_actions",
            "facetAvailability": {
                "conditionPresence": "available",
                "targetPresence": "available",
                "dependencyPresence": "available",
            },
            "records": records,
            "indexes": indexes,
            "counts": {"recordCount": len(records)},
        }
    )
    return result


def build_index(
    capabilities: dict[str, Any],
    *,
    capabilities_checksum: str,
) -> IndexBuild:
    """Build and audit all seven payload documents in memory."""

    checksum_value = capabilities_checksum.removeprefix("sha256:")
    if re.fullmatch(r"[a-f0-9]{64}", checksum_value) is None:
        raise IndexerInputError(
            "INVALID_CAPABILITIES_CHECKSUM",
            "Le SHA-256 de capabilities.json doit contenir 64 caractères "
            "hexadécimaux minuscules.",
        )
    validate_source(capabilities)
    normalizer_schema_version = capabilities["schemaVersion"]
    input_metadata = capabilities["input"]
    parser_schema_version = input_metadata.get("parserSchemaVersion")
    if parser_schema_version is not None and not isinstance(
        parser_schema_version, str
    ):
        raise IndexerInputError(
            "INVALID_INDEXER_INPUT",
            "input.parserSchemaVersion doit être une chaîne ou null.",
        )
    mechanics_checksum = input_metadata.get("mechanicsChecksum")
    if mechanics_checksum is not None and not isinstance(
        mechanics_checksum, str
    ):
        raise IndexerInputError(
            "INVALID_INDEXER_INPUT",
            "input.mechanicsChecksum doit être une chaîne ou null.",
        )
    common = _common_payload(
        artifact_type="",
        normalizer_schema_version=normalizer_schema_version,
        parser_schema_version=parser_schema_version,
        capabilities_checksum=checksum_value,
    )

    character_object_id_by_character_id = {
        item["characterId"]: item["id"] for item in capabilities["characters"]
    }
    context_by_id = {item["id"]: item for item in capabilities["contexts"]}
    operation_by_id = {
        item["id"]: item for item in capabilities["operations"]
    }
    ability_by_context = {
        context_id: ability["id"]
        for ability in capabilities["abilities"]
        for context_id in ability["contextIds"]
    }
    ability_by_character: defaultdict[
        str, list[dict[str, Any]]
    ] = defaultdict(list)
    for ability in capabilities["abilities"]:
        ability_by_character[ability["characterId"]].append(ability)
    contexts_by_character: defaultdict[
        str, list[dict[str, Any]]
    ] = defaultdict(list)
    for context in capabilities["contexts"]:
        if isinstance(context.get("characterId"), str):
            contexts_by_character[context["characterId"]].append(context)
    mappings_by_context: defaultdict[
        str, list[dict[str, Any]]
    ] = defaultdict(list)
    for mapping in capabilities["actionMappings"]:
        mappings_by_context[mapping["contextId"]].append(mapping)
    operations_by_context: defaultdict[
        str, list[dict[str, Any]]
    ] = defaultdict(list)
    for operation in capabilities["operations"]:
        operations_by_context[operation["contextId"]].append(operation)

    payloads = {
        "operations.json": _build_operations_payload(
            capabilities=capabilities,
            ability_by_context=ability_by_context,
            context_by_id=context_by_id,
            common=common,
        ),
        "contexts.json": _build_contexts_payload(
            capabilities=capabilities,
            ability_by_context=ability_by_context,
            mappings_by_context=mappings_by_context,
            operations_by_context=operations_by_context,
            common=common,
        ),
        "characters.json": _build_characters_payload(
            capabilities=capabilities,
            ability_by_character=ability_by_character,
            contexts_by_character=contexts_by_character,
            mappings_by_context=mappings_by_context,
            operations_by_context=operations_by_context,
            operation_by_id=operation_by_id,
            common=common,
        ),
        "abilities.json": _build_abilities_payload(
            capabilities=capabilities,
            mappings_by_context=mappings_by_context,
            operation_by_id=operation_by_id,
            common=common,
        ),
        "effects.json": _build_effects_payload(
            capabilities=capabilities,
            ability_by_context=ability_by_context,
            common=common,
        ),
        "spawns.json": _build_spawns_payload(
            capabilities=capabilities,
            character_object_id_by_character_id=(
                character_object_id_by_character_id
            ),
            ability_by_context=ability_by_context,
            common=common,
        ),
        "uninterpreted-actions.json": _build_uninterpreted_payload(
            capabilities=capabilities,
            context_by_id=context_by_id,
            ability_by_context=ability_by_context,
            common=common,
        ),
    }
    audit = audit_index(
        capabilities,
        payloads,
        checksum_value,
    )
    diagnostics = {
        "indexer": {
            "items": [],
            "bySeverity": {"error": 0, "warning": 0, "info": 0},
        },
        "upstream": copy.deepcopy(audit["upstreamDiagnostics"]),
    }
    return IndexBuild(
        payloads=payloads,
        audit=audit,
        diagnostics=diagnostics,
        counts=copy.deepcopy(audit["counts"]),
        normalizer_schema_version=normalizer_schema_version,
        parser_schema_version=parser_schema_version,
        mechanics_checksum=mechanics_checksum,
        capabilities_checksum=checksum_value,
    )


def compute_payload_set_checksum(
    payload_entries: list[dict[str, Any]],
) -> str:
    material = serialize_json(payload_entries)
    return hashlib.sha256(material).hexdigest()


def build_manifest(
    build: IndexBuild,
    payload_bytes: dict[str, bytes],
) -> dict[str, Any]:
    if set(payload_bytes) != set(PAYLOAD_PATHS):
        raise IndexerInputError(
            "INVALID_PAYLOAD_SET",
            f"Payloads sérialisés invalides : {sorted(payload_bytes)!r}.",
        )
    payload_entries = [
        {
            "path": path,
            "sizeBytes": len(payload_bytes[path]),
            "sha256": hashlib.sha256(payload_bytes[path]).hexdigest(),
        }
        for path in sorted(payload_bytes)
    ]
    audit = copy.deepcopy(build.audit)
    audit["payloadIntegrity"] = {
        "status": "passed",
        "payloadCount": len(payload_entries),
    }
    return {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "artifactType": "index_manifest",
        "normalizerSchemaVersion": build.normalizer_schema_version,
        "parserSchemaVersion": build.parser_schema_version,
        "capabilitiesChecksum": _sha256_prefixed(
            build.capabilities_checksum
        ),
        "mechanicsChecksum": build.mechanics_checksum,
        "payloads": payload_entries,
        "payloadSetChecksum": _sha256_prefixed(
            compute_payload_set_checksum(payload_entries)
        ),
        "counts": copy.deepcopy(build.counts),
        "audit": audit,
        "diagnostics": copy.deepcopy(build.diagnostics),
        "limitations": [
            {
                "code": "CAPABILITIES_INPUT_ONLY",
                "description": (
                    "L’indexeur lit exclusivement normalized/capabilities.json."
                ),
            },
            {
                "code": "NO_SOURCE_POINTER_SECONDARY_INDEX",
                "description": (
                    "L’accès exact aux actions préservées utilise "
                    "sourceActionId ; aucun bySourcePointer n’est produit."
                ),
            },
            {
                "code": "NO_GAMEPLAY_INFERENCE",
                "description": (
                    "Aucune jouabilité, opposition d’effet ou sémantique "
                    "gameplay n’est déduite."
                ),
            },
            {
                "code": "RAW_OPERATION_FIELDS_OMITTED",
                "description": (
                    "rawParameters et rawEffectEntry restent dans "
                    "capabilities.json et ne sont pas recopiés dans "
                    "operations.json."
                ),
            },
        ],
        "generation": {
            "deterministic": True,
            "timestampPolicy": "omitted",
            "payloadSetChecksumAlgorithm": (
                "sha256(UTF-8 canonical JSON array of path, sizeBytes and "
                "sha256 entries, with final LF)"
            ),
        },
    }


def build_artifact_bytes(
    capabilities: dict[str, Any],
    *,
    capabilities_checksum: str,
) -> tuple[IndexBuild, dict[str, bytes]]:
    build = build_index(
        capabilities,
        capabilities_checksum=capabilities_checksum,
    )
    payload_bytes = {
        path: serialize_json(build.payloads[path])
        for path in PAYLOAD_PATHS
    }
    manifest = build_manifest(build, payload_bytes)
    artifacts = {
        **payload_bytes,
        MANIFEST_PATH: serialize_json(manifest),
    }
    return build, {
        path: artifacts[path] for path in EXPECTED_ARTIFACT_PATHS
    }
