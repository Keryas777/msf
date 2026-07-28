"""Integrity and coverage audit for normalized capability operations."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

from .diagnostics import diagnostic, sort_diagnostics
from .effect_aliases import (
    EFFECT_ID_ALIASES,
    alias_policy_record,
    iter_mechanics_effect_identifiers,
    resolve_effect_identifier,
)


@dataclass
class AuditResult:
    audit: dict[str, Any]
    diagnostics: list[dict[str, Any]]
    has_errors: bool


def _record_source(record: Any) -> tuple[str, str]:
    if not isinstance(record, dict):
        return "<generated>", ""
    source = record.get("source")
    if not isinstance(source, dict):
        return "<generated>", ""
    file = source.get("file")
    pointer = (
        source.get("pointer")
        if "pointer" in source
        else source.get("valuePointer", source.get("actionPointer"))
    )
    return (
        file if isinstance(file, str) else "<generated>",
        pointer if isinstance(pointer, str) else "",
    )


def _audit_error(message: str, *, raw: Any = None) -> dict[str, Any]:
    return diagnostic(
        severity="error",
        code="INTERNAL_AUDIT_MISMATCH",
        message=message,
        source_file="<generated>",
        source_pointer="",
        raw=raw,
    )


def _escape_pointer_segment(value: object) -> str:
    return str(value).replace("~", "~0").replace("/", "~1")


def _append_pointer(pointer: str, *segments: object) -> str:
    result = pointer
    for segment in segments:
        result = f"{result}/{_escape_pointer_segment(segment)}"
    return result


def _source_value_at_pointer(
    mechanics: dict[str, Any],
    source_file: str,
    pointer: str,
) -> tuple[bool, Any]:
    if source_file == "characters.json":
        root = {
            "Data": {
                item.get("characterId"): item.get("raw")
                for item in mechanics.get("characters", [])
                if isinstance(item, dict)
                and isinstance(item.get("characterId"), str)
            }
        }
    elif source_file == "procs.json":
        root = {
            "Data": {
                item.get("procId"): item.get("raw")
                for item in mechanics.get("effects", [])
                if isinstance(item, dict)
                and isinstance(item.get("procId"), str)
            }
        }
    else:
        return False, None

    current: Any = root
    if pointer == "":
        return True, current
    if not pointer.startswith("/"):
        return False, None
    for encoded_segment in pointer[1:].split("/"):
        segment = encoded_segment.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and segment in current:
            current = current[segment]
            continue
        if isinstance(current, list):
            try:
                index = int(segment)
            except ValueError:
                return False, None
            if 0 <= index < len(current):
                current = current[index]
                continue
        return False, None
    return True, current


def audit_capabilities(
    capabilities: dict[str, Any],
    mechanics: dict[str, Any],
    *,
    supported_action_ids: set[str],
    input_unchanged: bool,
) -> AuditResult:
    diagnostics = list(capabilities.get("diagnostics", []))
    characters = [
        item
        for item in capabilities.get("characters", [])
        if isinstance(item, dict)
    ]
    abilities = [
        item
        for item in capabilities.get("abilities", [])
        if isinstance(item, dict)
    ]
    contexts = [
        item
        for item in capabilities.get("contexts", [])
        if isinstance(item, dict)
    ]
    action_mappings = [
        item
        for item in capabilities.get("actionMappings", [])
        if isinstance(item, dict)
    ]
    effects = [
        item
        for item in capabilities.get("effects", [])
        if isinstance(item, dict)
    ]
    operations = [
        item
        for item in capabilities.get("operations", [])
        if isinstance(item, dict)
    ]
    alias_resolutions = [
        item
        for item in capabilities.get("controlledAliasResolutions", [])
        if isinstance(item, dict)
    ]
    source_actions = [
        item
        for item in mechanics.get("actions", [])
        if isinstance(item, dict)
    ]

    records = [*characters, *abilities, *contexts, *effects, *operations]
    id_counts = Counter(
        item.get("id")
        for item in records
        if isinstance(item.get("id"), str)
    )
    duplicate_ids = sorted(
        identifier
        for identifier, count in id_counts.items()
        if count > 1
    )
    duplicate_id_count = sum(id_counts[item] - 1 for item in duplicate_ids)
    for identifier in duplicate_ids:
        record = next(item for item in records if item.get("id") == identifier)
        source_file, source_pointer = _record_source(record)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="DUPLICATE_ID",
                message=f"Identifiant normalisé dupliqué : {identifier}.",
                character_id=record.get("characterId"),
                ability_type=record.get("abilityType"),
                context_id=(
                    identifier if identifier.startswith("ctx_") else record.get("contextId")
                ),
                operation_id=(
                    identifier if identifier.startswith("op_") else None
                ),
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"id": identifier, "occurrences": id_counts[identifier]},
            )
        )

    character_ids = {
        item["characterId"]
        for item in characters
        if isinstance(item.get("characterId"), str)
    }
    context_ids = {
        item["id"]
        for item in contexts
        if isinstance(item.get("id"), str)
    }
    context_by_id = {
        item["id"]: item
        for item in contexts
        if isinstance(item.get("id"), str)
    }
    operation_ids = {
        item["id"]
        for item in operations
        if isinstance(item.get("id"), str)
    }
    effect_ids = {
        item["effectId"]: item
        for item in effects
        if isinstance(item.get("effectId"), str)
    }
    source_action_ids = {
        item["id"]
        for item in source_actions
        if isinstance(item.get("id"), str)
    }
    source_action_by_id = {
        item["id"]: item
        for item in source_actions
        if isinstance(item.get("id"), str)
    }

    orphan_context_count = 0
    child_context_types = {
        "passive_trigger",
        "ability_alternative",
        "technical_trigger",
    }
    for context in contexts:
        parent_id = context.get("parentContextId")
        requires_parent = context.get("containerType") in child_context_types
        if (
            parent_id in context_ids
            or (parent_id is None and not requires_parent)
        ):
            continue
        orphan_context_count += 1
        source_file, source_pointer = _record_source(context)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="ORPHAN_CONTEXT",
                message="Contexte normalisé dont le parent est absent ou invalide.",
                character_id=context.get("characterId"),
                ability_type=context.get("abilityType"),
                context_id=context.get("id"),
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"parentContextId": parent_id},
            )
        )

    def is_playable_ability_type(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        base_types = {"basic", "special", "ultimate", "passive"}
        if value in base_types:
            return True
        return (
            value.endswith("_empower")
            and value.removesuffix("_empower") in base_types
        )

    def context_belongs_to_root(
        context_id: Any,
        root_context_id: str,
    ) -> bool:
        current = context_id
        visited: set[str] = set()
        while isinstance(current, str) and current not in visited:
            if current == root_context_id:
                return True
            visited.add(current)
            context = context_by_id.get(current)
            if context is None:
                return False
            current = context.get("parentContextId")
        return False

    expected_ability_roots = {
        item["id"]: item
        for item in contexts
        if isinstance(item.get("id"), str)
        and item.get("containerType") == "ability"
        and is_playable_ability_type(item.get("abilityType"))
    }
    ability_root_counts = Counter(
        item.get("rootContextId")
        for item in abilities
        if isinstance(item.get("rootContextId"), str)
    )
    missing_ability_root_ids = sorted(
        set(expected_ability_roots) - set(ability_root_counts)
    )
    duplicate_ability_root_ids = sorted(
        root_id
        for root_id, count in ability_root_counts.items()
        if count > 1
    )
    unexpected_ability_root_ids = sorted(
        set(ability_root_counts) - set(expected_ability_roots)
    )
    orphan_ability_count = 0
    for ability in abilities:
        root_context_id = ability.get("rootContextId")
        root_context = expected_ability_roots.get(root_context_id)
        expected_context_ids = (
            [
                item["id"]
                for item in contexts
                if isinstance(item.get("id"), str)
                and context_belongs_to_root(
                    item["id"], str(root_context_id)
                )
            ]
            if root_context is not None
            else []
        )
        expected_operation_ids = (
            [
                item["id"]
                for item in operations
                if isinstance(item.get("id"), str)
                and root_context_id in item.get("contextPathIds", [])
            ]
            if root_context is not None
            else []
        )
        invalid: list[str] = []
        if root_context is None:
            invalid.append("rootContext")
        else:
            if ability.get("characterId") != root_context.get(
                "characterId"
            ):
                invalid.append("character")
            if ability.get("abilityType") != root_context.get("abilityType"):
                invalid.append("abilityType")
            if ability.get("source") != root_context.get("source"):
                invalid.append("source")
        if ability.get("contextIds") != expected_context_ids:
            invalid.append("contextIds")
        if ability.get("operationIds") != expected_operation_ids:
            invalid.append("operationIds")
        if invalid:
            orphan_ability_count += 1
            diagnostics.append(
                _audit_error(
                    "Ability autonome avec références absentes ou incohérentes.",
                    raw={
                        "abilityId": ability.get("id"),
                        "invalid": invalid,
                    },
                )
            )
    if (
        missing_ability_root_ids
        or duplicate_ability_root_ids
        or unexpected_ability_root_ids
    ):
        diagnostics.append(
            _audit_error(
                "Couverture des contextes Ability incohérente.",
                raw={
                    "missingRootContextIds": missing_ability_root_ids,
                    "duplicateRootContextIds": duplicate_ability_root_ids,
                    "unexpectedRootContextIds": unexpected_ability_root_ids,
                },
            )
        )

    orphan_operation_count = 0
    for operation in operations:
        path = operation.get("contextPathIds")
        path_valid = (
            isinstance(path, list)
            and all(item in context_ids for item in path)
            and bool(path)
            and path[-1] == operation.get("contextId")
        )
        missing: list[str] = []
        if operation.get("contextId") not in context_ids or not path_valid:
            missing.append("context")
        if operation.get("sourceActionId") not in source_action_ids:
            missing.append("sourceAction")
        if operation.get("characterId") not in character_ids:
            missing.append("character")
        control = operation.get("control")
        if isinstance(control, dict):
            dependency_id = control.get("dependsOnActionId")
            if (
                dependency_id is not None
                and dependency_id not in source_action_ids
            ):
                missing.append("actionDependency")
        if not missing:
            continue
        orphan_operation_count += 1
        source_file, source_pointer = _record_source(operation)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="ORPHAN_OPERATION",
                message=(
                    "Opération normalisée avec référence absente ou invalide : "
                    + ", ".join(missing)
                    + "."
                ),
                character_id=operation.get("characterId"),
                ability_type=operation.get("abilityType"),
                context_id=operation.get("contextId"),
                source_action_id=operation.get("sourceActionId"),
                operation_id=operation.get("id"),
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"missing": missing},
            )
        )

    context_id_by_source_container_id = {
        item["sourceContainerId"]: item["id"]
        for item in contexts
        if isinstance(item.get("sourceContainerId"), str)
        and isinstance(item.get("id"), str)
    }
    operation_ids_by_source_action: dict[str, list[str]] = {}
    for operation in operations:
        source_action_id = operation.get("sourceActionId")
        operation_id = operation.get("id")
        if not all(
            isinstance(value, str)
            for value in (source_action_id, operation_id)
        ):
            continue
        operation_ids_by_source_action.setdefault(
            source_action_id, []
        ).append(operation_id)

    mapping_source_action_counts = Counter(
        item.get("sourceActionId")
        for item in action_mappings
        if isinstance(item.get("sourceActionId"), str)
    )
    missing_action_mapping_ids = sorted(
        source_action_ids - set(mapping_source_action_counts)
    )
    orphan_action_mapping_ids = sorted(
        set(mapping_source_action_counts) - source_action_ids
    )
    duplicate_action_mapping_ids = sorted(
        action_id
        for action_id, count in mapping_source_action_counts.items()
        if count > 1
    )
    invalid_action_mapping_count = 0
    for mapping in action_mappings:
        source_action_id = mapping.get("sourceActionId")
        source_action = source_action_by_id.get(source_action_id)
        invalid: list[str] = []
        if source_action is None:
            invalid.append("sourceActionId")
        else:
            source = source_action.get("source")
            if not isinstance(source, dict):
                source = {}
            expected_operation_ids = operation_ids_by_source_action.get(
                source_action_id, []
            )
            expected_status = (
                "normalized"
                if expected_operation_ids
                else "preserved_uninterpreted"
            )
            raw_type = source_action.get("rawType")
            expected_type = (
                raw_type.lower()
                if isinstance(raw_type, str)
                else raw_type
            )
            if mapping.get("contextId") != (
                context_id_by_source_container_id.get(
                    source_action.get("containerId")
                )
            ):
                invalid.append("contextId")
            if mapping.get("rawSourceActionType") != raw_type:
                invalid.append("rawSourceActionType")
            if mapping.get("sourceActionType") != expected_type:
                invalid.append("sourceActionType")
            if mapping.get("status") != expected_status:
                invalid.append("status")
            if mapping.get("operationIds") != expected_operation_ids:
                invalid.append("operationIds")
            if mapping.get("source") != {
                "file": str(source.get("file", "<generated>")),
                "pointer": str(source.get("pointer", "")),
            }:
                invalid.append("source")
        if invalid:
            invalid_action_mapping_count += 1
            diagnostics.append(
                _audit_error(
                    "ActionMapping avec références absentes ou incohérentes.",
                    raw={
                        "sourceActionId": source_action_id,
                        "invalid": invalid,
                    },
                )
            )
    if (
        missing_action_mapping_ids
        or orphan_action_mapping_ids
        or duplicate_action_mapping_ids
    ):
        diagnostics.append(
            _audit_error(
                "Couverture exhaustive des ActionMapping incohérente.",
                raw={
                    "missingSourceActionIds": missing_action_mapping_ids,
                    "orphanSourceActionIds": orphan_action_mapping_ids,
                    "duplicateSourceActionIds": duplicate_action_mapping_ids,
                },
            )
        )

    covered_action_ids = {
        item["sourceActionId"]
        for item in operations
        if isinstance(item.get("sourceActionId"), str)
    }
    uncovered_action_ids = sorted(supported_action_ids - covered_action_ids)
    for action_id in uncovered_action_ids:
        action = source_action_by_id.get(action_id, {})
        source_file, source_pointer = _record_source(action)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="UNCOVERED_SUPPORTED_ACTION",
                message="Action d’effet reconnue sans opération normalisée.",
                character_id=action.get("characterId"),
                ability_type=action.get("abilityType"),
                source_action_id=action_id,
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"rawType": action.get("rawType")},
            )
        )

    invalid_effect_reference_count = 0
    for operation in operations:
        effect = operation.get("effect")
        if not isinstance(effect, dict):
            continue
        raw_value = effect.get("rawValue")
        operation_source = operation.get("source")
        if not isinstance(operation_source, dict):
            operation_source = {}
        invalid: list[str] = []
        if not isinstance(raw_value, str):
            invalid.append("rawValue")
            expected_resolution = None
        else:
            expected_resolution = resolve_effect_identifier(raw_value)
            for field in (
                "rawValue",
                "resolvedValue",
                "resolutionMethod",
                "resolutionOrigin",
            ):
                if effect.get(field) != expected_resolution[field]:
                    invalid.append(field)
            if effect.get("effectId") != expected_resolution[
                "resolvedValue"
            ]:
                invalid.append("effectId")
        if effect.get("source") != {
            "file": str(operation_source.get("file", "<generated>")),
            "pointer": str(operation_source.get("valuePointer", "")),
        }:
            invalid.append("source")

        if effect.get("namespace") == "proc" and expected_resolution:
            effect_id = expected_resolution["resolvedValue"]
            catalog = effect_ids.get(effect_id)
            expected_resolved = catalog is not None
            if effect.get("resolved") != expected_resolved:
                invalid.append("resolved")
            if effect.get("catalogEffectId") != (
                catalog.get("id") if catalog else None
            ):
                invalid.append("catalogEffectId")
        elif effect.get("namespace") == "battlefield":
            if effect.get("resolved") is not None:
                invalid.append("resolved")
        else:
            invalid.append("namespace")

        if invalid:
            invalid_effect_reference_count += 1
            diagnostics.append(
                _audit_error(
                    "Résolution de référence d’effet incohérente.",
                    raw={
                        "operationId": operation.get("id"),
                        "invalid": sorted(set(invalid)),
                    },
                )
            )

    alias_policy_valid = (
        capabilities.get("effectIdAliasPolicy")
        == alias_policy_record()
    )
    if not alias_policy_valid:
        diagnostics.append(
            _audit_error(
                "Politique d’alias d’identifiants absente ou incohérente.",
                raw={
                    "effectIdAliasPolicy": capabilities.get(
                        "effectIdAliasPolicy"
                    )
                },
            )
        )

    expected_alias_keys = {
        (
            item["source"]["file"],
            item["source"]["pointer"],
            item["rawValue"],
        )
        for item in iter_mechanics_effect_identifiers(
            mechanics,
            append_pointer=_append_pointer,
        )
        if item.get("rawValue") in EFFECT_ID_ALIASES
    }
    actual_alias_keys = [
        (
            item.get("source", {}).get("file"),
            item.get("source", {}).get("pointer"),
            item.get("rawValue"),
        )
        for item in alias_resolutions
    ]
    alias_key_counts = Counter(actual_alias_keys)
    missing_alias_keys = sorted(
        expected_alias_keys - set(actual_alias_keys)
    )
    orphan_alias_keys = sorted(
        set(actual_alias_keys) - expected_alias_keys
    )
    duplicate_alias_keys = sorted(
        key for key, count in alias_key_counts.items() if count > 1
    )
    invalid_alias_resolution_count = 0
    for resolution in alias_resolutions:
        source = resolution.get("source")
        if not isinstance(source, dict):
            source = {}
        source_file = source.get("file")
        source_pointer = source.get("pointer")
        raw_value = resolution.get("rawValue")
        invalid: list[str] = []
        if not isinstance(raw_value, str):
            invalid.append("rawValue")
        else:
            expected = resolve_effect_identifier(raw_value)
            if expected["resolutionMethod"] != "controlled_alias":
                invalid.append("resolutionMethod")
            for field in (
                "rawValue",
                "resolvedValue",
                "resolutionMethod",
                "resolutionOrigin",
            ):
                if resolution.get(field) != expected[field]:
                    invalid.append(field)
            catalog = effect_ids.get(expected["resolvedValue"])
            if resolution.get("resolved") is not (catalog is not None):
                invalid.append("resolved")
            if resolution.get("catalogEffectId") != (
                catalog.get("id") if catalog else None
            ):
                invalid.append("catalogEffectId")
        if not all(
            isinstance(value, str)
            for value in (source_file, source_pointer)
        ):
            invalid.append("source")
        else:
            found, source_value = _source_value_at_pointer(
                mechanics,
                source_file,
                source_pointer,
            )
            if not found or source_value != raw_value:
                invalid.append("sourceValue")
        source_action_id = resolution.get("sourceActionId")
        if (
            source_action_id is not None
            and source_action_id not in source_action_ids
        ):
            invalid.append("sourceActionId")
        context_id = resolution.get("contextId")
        if context_id is not None and context_id not in context_ids:
            invalid.append("contextId")
        if invalid:
            invalid_alias_resolution_count += 1
            diagnostics.append(
                _audit_error(
                    "Résolution contrôlée d’alias incohérente.",
                    raw={
                        "source": source,
                        "invalid": sorted(set(invalid)),
                    },
                )
            )
    if missing_alias_keys or orphan_alias_keys or duplicate_alias_keys:
        diagnostics.append(
            _audit_error(
                "Couverture des références résolues par alias incohérente.",
                raw={
                    "missing": missing_alias_keys,
                    "orphan": orphan_alias_keys,
                    "duplicate": duplicate_alias_keys,
                },
            )
        )

    if not input_unchanged:
        diagnostics.append(
            _audit_error(
                "Le document mechanics a été modifié pendant la normalisation."
            )
        )

    if capabilities.get("schemaVersion") != "1.0.0":
        diagnostics.append(
            _audit_error(
                "Version de schéma normalisé absente ou invalide.",
                raw={"schemaVersion": capabilities.get("schemaVersion")},
            )
        )

    for field in (
        "characters",
        "abilities",
        "contexts",
        "actionMappings",
        "effects",
        "operations",
        "controlledAliasResolutions",
        "inputDiagnostics",
        "diagnostics",
    ):
        if not isinstance(capabilities.get(field), list):
            diagnostics.append(
                _audit_error(
                    f"Le champ normalisé {field} doit être un tableau.",
                    raw={"field": field},
                )
            )

    diagnostics = sort_diagnostics(diagnostics)
    operation_kind_counts = Counter(
        str(item.get("kind")) for item in operations
    )
    source_action_type_counts = Counter(
        str(item.get("sourceActionType")) for item in operations
    )
    proc_references = [
        item.get("effect")
        for item in operations
        if isinstance(item.get("effect"), dict)
        and item["effect"].get("namespace") == "proc"
        and item["effect"].get("effectId") is not None
    ]
    generic_selector_count = sum(
        1
        for item in operations
        if item.get("effect") is None
    )
    battlefield_reference_count = sum(
        1
        for item in operations
        if isinstance(item.get("effect"), dict)
        and item["effect"].get("namespace") == "battlefield"
    )
    mapped_action_count = sum(
        1
        for item in action_mappings
        if item.get("status") == "normalized"
    )
    preserved_uninterpreted_action_count = sum(
        1
        for item in action_mappings
        if item.get("status") == "preserved_uninterpreted"
    )
    mapped_operation_id_counts = Counter(
        operation_id
        for item in action_mappings
        if isinstance(item.get("operationIds"), list)
        for operation_id in item["operationIds"]
        if isinstance(operation_id, str)
    )
    unmapped_operation_ids = sorted(
        operation_ids - set(mapped_operation_id_counts)
    )
    orphan_mapped_operation_ids = sorted(
        set(mapped_operation_id_counts) - operation_ids
    )
    duplicate_mapped_operation_ids = sorted(
        operation_id
        for operation_id, count in mapped_operation_id_counts.items()
        if count > 1
    )
    if (
        unmapped_operation_ids
        or orphan_mapped_operation_ids
        or duplicate_mapped_operation_ids
    ):
        diagnostics.append(
            _audit_error(
                "Références d’opérations des ActionMapping incohérentes.",
                raw={
                    "unmappedOperationIds": unmapped_operation_ids,
                    "orphanOperationIds": orphan_mapped_operation_ids,
                    "duplicateOperationIds": duplicate_mapped_operation_ids,
                },
            )
        )
        diagnostics = sort_diagnostics(diagnostics)

    input_audit = mechanics.get("audit")
    if not isinstance(input_audit, dict):
        input_audit = {}
    audit = {
        "sourceActionCount": len(source_actions),
        "actionMappingCount": len(action_mappings),
        "mappedActionCount": mapped_action_count,
        "preservedUninterpretedActionCount": (
            preserved_uninterpreted_action_count
        ),
        "abilityCount": len(abilities),
        "spawnOperationCount": operation_kind_counts["spawn"],
        "empowerOperationCount": operation_kind_counts["empower"],
        "emptyResultOperationCount": operation_kind_counts[
            "empty_result"
        ],
        "controlledAliasResolutionCount": len(alias_resolutions),
        "input": {
            "characterCount": len(mechanics.get("characters", [])),
            "containerCount": len(mechanics.get("containers", [])),
            "actionCount": len(mechanics.get("actions", [])),
            "effectCount": len(mechanics.get("effects", [])),
            "parserDiagnosticCount": len(mechanics.get("diagnostics", [])),
            "supportedActionCount": len(supported_action_ids),
            "parserAudit": input_audit,
        },
        "output": {
            "characterCount": len(characters),
            "abilityCount": len(abilities),
            "contextCount": len(contexts),
            "actionMappingCount": len(action_mappings),
            "effectCount": len(effects),
            "operationCount": len(operations),
            "controlledAliasResolutionCount": len(alias_resolutions),
            "diagnosticCount": len(diagnostics),
        },
        "operationsByKind": {
            key: operation_kind_counts[key]
            for key in sorted(operation_kind_counts)
        },
        "sourceActionTypes": {
            key: source_action_type_counts[key]
            for key in sorted(source_action_type_counts)
        },
        "effectResolution": {
            "explicitProcReferenceCount": len(proc_references),
            "resolvedProcReferenceCount": sum(
                1 for item in proc_references if item.get("resolved") is True
            ),
            "unresolvedProcReferenceCount": sum(
                1 for item in proc_references if item.get("resolved") is False
            ),
            "genericSelectorCount": generic_selector_count,
            "battlefieldReferenceCount": battlefield_reference_count,
        },
        "integrity": {
            "duplicateIdCount": duplicate_id_count,
            "orphanContextCount": orphan_context_count,
            "orphanAbilityCount": orphan_ability_count,
            "missingAbilityCount": len(missing_ability_root_ids),
            "duplicateAbilityRootCount": len(
                duplicate_ability_root_ids
            ),
            "unexpectedAbilityCount": len(
                unexpected_ability_root_ids
            ),
            "orphanOperationCount": orphan_operation_count,
            "uncoveredSupportedActionCount": len(uncovered_action_ids),
            "missingActionMappingCount": len(
                missing_action_mapping_ids
            ),
            "orphanActionMappingCount": len(
                orphan_action_mapping_ids
            ),
            "duplicateActionMappingCount": len(
                duplicate_action_mapping_ids
            ),
            "invalidActionMappingCount": (
                invalid_action_mapping_count
            ),
            "unmappedOperationCount": len(unmapped_operation_ids),
            "orphanMappedOperationCount": len(
                orphan_mapped_operation_ids
            ),
            "duplicateMappedOperationCount": len(
                duplicate_mapped_operation_ids
            ),
            "invalidEffectReferenceCount": (
                invalid_effect_reference_count
            ),
            "aliasPolicyValid": alias_policy_valid,
            "missingAliasResolutionCount": len(missing_alias_keys),
            "orphanAliasResolutionCount": len(orphan_alias_keys),
            "duplicateAliasResolutionCount": len(
                duplicate_alias_keys
            ),
            "invalidAliasResolutionCount": (
                invalid_alias_resolution_count
            ),
            "inputUnchanged": input_unchanged,
        },
    }
    has_errors = any(item.get("severity") == "error" for item in diagnostics)
    return AuditResult(
        audit=audit,
        diagnostics=diagnostics,
        has_errors=has_errors,
    )
