"""Integrity and coverage audit for the parsed mechanics representation."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

from .diagnostics import diagnostic, sort_diagnostics
from .json_pointer import JsonPointerError, resolve_pointer
from .sources.characters import ABILITY_ORDER


ROOT_LIST_FIELDS = (
    "sources",
    "characters",
    "containers",
    "actions",
    "effects",
    "diagnostics",
)


@dataclass
class IntegrityInspection:
    duplicate_id_count: int
    orphan_container_count: int
    orphan_action_count: int
    diagnostics: list[dict[str, Any]]


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
    pointer = source.get("pointer")
    return (
        file if isinstance(file, str) else "<generated>",
        pointer if isinstance(pointer, str) else "",
    )


def inspect_integrity(mechanics: dict[str, Any]) -> IntegrityInspection:
    """Inspect generated IDs and parent links without requiring source documents."""

    diagnostics: list[dict[str, Any]] = []
    collections = [
        mechanics.get("characters", []),
        mechanics.get("containers", []),
        mechanics.get("actions", []),
        mechanics.get("effects", []),
    ]
    records = [
        record
        for collection in collections
        if isinstance(collection, list)
        for record in collection
        if isinstance(record, dict)
    ]
    id_counts = Counter(
        record.get("id")
        for record in records
        if isinstance(record.get("id"), str)
    )
    duplicate_ids = {identifier for identifier, count in id_counts.items() if count > 1}
    duplicate_id_count = sum(id_counts[identifier] - 1 for identifier in duplicate_ids)
    for identifier in sorted(duplicate_ids):
        record = next(item for item in records if item.get("id") == identifier)
        source_file, source_pointer = _record_source(record)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="DUPLICATE_ID",
                message=f"Identifiant généré dupliqué : {identifier}.",
                character_id=record.get("characterId"),
                ability_type=record.get("abilityType"),
                container_id=(
                    identifier if identifier.startswith("ctr_") else record.get("containerId")
                ),
                action_id=identifier if identifier.startswith("act_") else None,
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"id": identifier, "occurrences": id_counts[identifier]},
            )
        )

    containers = [
        item
        for item in mechanics.get("containers", [])
        if isinstance(item, dict)
    ]
    container_ids = {
        item["id"]
        for item in containers
        if isinstance(item.get("id"), str)
    }
    child_container_types = {
        "passive_trigger",
        "ability_alternative",
        "technical_trigger",
    }
    orphan_container_count = 0
    for container in containers:
        parent_id = container.get("parentContainerId")
        requires_parent = container.get("containerType") in child_container_types
        if (parent_id is None and not requires_parent) or parent_id in container_ids:
            continue
        orphan_container_count += 1
        source_file, source_pointer = _record_source(container)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="ORPHAN_CONTAINER",
                message="Conteneur dont le parent est absent ou invalide.",
                character_id=container.get("characterId"),
                ability_type=container.get("abilityType"),
                container_id=container.get("id"),
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"parentContainerId": parent_id},
            )
        )

    actions = [
        item for item in mechanics.get("actions", []) if isinstance(item, dict)
    ]
    orphan_action_count = 0
    for action in actions:
        if action.get("containerId") in container_ids:
            continue
        orphan_action_count += 1
        source_file, source_pointer = _record_source(action)
        diagnostics.append(
            diagnostic(
                severity="error",
                code="ORPHAN_ACTION",
                message="Action dont le conteneur est absent.",
                character_id=action.get("characterId"),
                ability_type=action.get("abilityType"),
                container_id=action.get("containerId"),
                action_id=action.get("id"),
                source_file=source_file,
                source_pointer=source_pointer,
                raw={"containerId": action.get("containerId")},
            )
        )

    return IntegrityInspection(
        duplicate_id_count=duplicate_id_count,
        orphan_container_count=orphan_container_count,
        orphan_action_count=orphan_action_count,
        diagnostics=sort_diagnostics(diagnostics),
    )


def _audit_mismatch(
    message: str,
    *,
    raw: Any = None,
) -> dict[str, Any]:
    return diagnostic(
        severity="error",
        code="INTERNAL_AUDIT_MISMATCH",
        message=message,
        source_file="<generated>",
        source_pointer="",
        raw=raw,
    )


def _validate_root(mechanics: dict[str, Any]) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    if mechanics.get("schemaVersion") != "1.0.0":
        diagnostics.append(
            _audit_mismatch(
                "Version de schéma racine absente ou invalide.",
                raw={"schemaVersion": mechanics.get("schemaVersion")},
            )
        )
    for field in ROOT_LIST_FIELDS:
        if not isinstance(mechanics.get(field), list):
            diagnostics.append(
                _audit_mismatch(
                    f"Le champ racine {field} doit être un tableau.",
                    raw={"field": field},
                )
            )
    return diagnostics


def _validate_source_pointers(
    mechanics: dict[str, Any],
    documents: dict[str, Any],
) -> tuple[list[dict[str, Any]], int, int]:
    diagnostics: list[dict[str, Any]] = []
    invalid_pointer_count = 0
    duplicate_pointer_count = 0

    for field in ("characters", "containers", "actions", "effects"):
        records = mechanics.get(field, [])
        if not isinstance(records, list):
            continue
        pointers: Counter[tuple[str, str]] = Counter()
        for record in records:
            if not isinstance(record, dict):
                continue
            source_file, source_pointer = _record_source(record)
            pointers[(source_file, source_pointer)] += 1
            document = documents.get(source_file)
            try:
                if document is None:
                    raise JsonPointerError(
                        f"Source document {source_file!r} is unavailable."
                    )
                source_value = resolve_pointer(document, source_pointer)
                if source_value != record.get("raw"):
                    raise JsonPointerError(
                        "The source value does not match the preserved raw value."
                    )
            except JsonPointerError as error:
                invalid_pointer_count += 1
                diagnostics.append(
                    diagnostic(
                        severity="error",
                        code="INVALID_SOURCE_POINTER",
                        message=f"Pointeur source invalide : {error}",
                        character_id=record.get("characterId"),
                        ability_type=record.get("abilityType"),
                        container_id=(
                            record.get("id")
                            if field == "containers"
                            else record.get("containerId")
                        ),
                        action_id=record.get("id") if field == "actions" else None,
                        source_file=source_file,
                        source_pointer=source_pointer,
                        raw={},
                    )
                )

        for (source_file, source_pointer), count in sorted(pointers.items()):
            if count <= 1:
                continue
            duplicate_pointer_count += count - 1
            diagnostics.append(
                _audit_mismatch(
                    (
                        f"Pointeur source dupliqué dans {field} : "
                        f"{source_file}{source_pointer}."
                    ),
                    raw={"occurrences": count},
                )
            )

    return diagnostics, invalid_pointer_count, duplicate_pointer_count


def _validate_links_and_order(
    mechanics: dict[str, Any],
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    containers = [
        item
        for item in mechanics.get("containers", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    ]
    actions = [
        item
        for item in mechanics.get("actions", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    ]
    container_by_id = {item["id"]: item for item in containers}
    action_by_id = {item["id"]: item for item in actions}

    for container in containers:
        listed = container.get("actionIds")
        if not isinstance(listed, list):
            diagnostics.append(
                _audit_mismatch(
                    f"actionIds invalide pour {container['id']}.",
                    raw={"actionIds": listed},
                )
            )
            continue
        expected = [
            item["id"]
            for item in sorted(
                (
                    action
                    for action in actions
                    if action.get("containerId") == container["id"]
                ),
                key=lambda item: (
                    item.get("order", -1),
                    item.get("source", {}).get("pointer", ""),
                ),
            )
        ]
        if listed != expected:
            diagnostics.append(
                _audit_mismatch(
                    f"Ordre ou rattachement actionIds incohérent pour {container['id']}.",
                    raw={"expected": expected, "actual": listed},
                )
            )
        for action_id in listed:
            action = action_by_id.get(action_id)
            if action is None or action.get("containerId") != container["id"]:
                diagnostics.append(
                    _audit_mismatch(
                        f"Référence actionIds invalide pour {container['id']}.",
                        raw={"actionId": action_id},
                    )
                )

    ability_rank = {ability_type: index for index, ability_type in enumerate(ABILITY_ORDER)}
    for character in mechanics.get("characters", []):
        if not isinstance(character, dict):
            continue
        ability_ids = character.get("abilityContainerIds")
        if not isinstance(ability_ids, list):
            diagnostics.append(
                _audit_mismatch(
                    f"abilityContainerIds invalide pour {character.get('characterId')}.",
                    raw={"abilityContainerIds": ability_ids},
                )
            )
            continue
        ability_containers = [container_by_id.get(identifier) for identifier in ability_ids]
        if any(container is None for container in ability_containers):
            diagnostics.append(
                _audit_mismatch(
                    f"Capacité absente dans abilityContainerIds pour {character.get('characterId')}.",
                    raw={"abilityContainerIds": ability_ids},
                )
            )
            continue
        actual_ranks = [
            ability_rank.get(container.get("abilityType"), len(ability_rank))
            for container in ability_containers
            if container is not None
        ]
        if actual_ranks != sorted(actual_ranks):
            diagnostics.append(
                _audit_mismatch(
                    f"Ordre fonctionnel des capacités invalide pour {character.get('characterId')}.",
                    raw={"abilityContainerIds": ability_ids},
                )
            )

    return diagnostics


def audit_mechanics(
    mechanics: dict[str, Any],
    *,
    documents: dict[str, Any],
    input_counts: dict[str, int],
    adapter_counts: dict[str, int],
    unhandled_node_count: int,
    unresolved_proc_reference_count: int,
    input_unchanged: bool,
) -> AuditResult:
    """Run all blocking integrity checks and produce deterministic audit counters."""

    diagnostics = list(mechanics.get("diagnostics", []))
    diagnostics.extend(_validate_root(mechanics))

    integrity = inspect_integrity(mechanics)
    diagnostics.extend(integrity.diagnostics)

    pointer_diagnostics, invalid_pointer_count, duplicate_pointer_count = (
        _validate_source_pointers(mechanics, documents)
    )
    diagnostics.extend(pointer_diagnostics)
    diagnostics.extend(_validate_links_and_order(mechanics))

    output_counts = {
        "characterCount": len(mechanics.get("characters", [])),
        "containerCount": len(mechanics.get("containers", [])),
        "actionCount": len(mechanics.get("actions", [])),
        "effectCount": len(mechanics.get("effects", [])),
    }
    expected_output = {
        "characterCount": input_counts["characterCount"],
        "actionCount": input_counts["sourceActionCount"],
        "effectCount": input_counts["procCount"],
    }
    for field, expected in expected_output.items():
        actual = output_counts[field]
        if actual != expected:
            diagnostics.append(
                _audit_mismatch(
                    f"Compteur {field} incohérent : attendu {expected}, obtenu {actual}.",
                    raw={"expected": expected, "actual": actual},
                )
            )

    adapter_total = sum(adapter_counts.values())
    if adapter_total != output_counts["actionCount"]:
        diagnostics.append(
            _audit_mismatch(
                (
                    "Le total des adaptateurs ne correspond pas au nombre "
                    "d’actions produites."
                ),
                raw={
                    "adapterTotal": adapter_total,
                    "actionCount": output_counts["actionCount"],
                },
            )
        )

    input_mutation_count = 0 if input_unchanged else 1
    if input_mutation_count:
        diagnostics.append(
            _audit_mismatch(
                "Une source d’entrée a été mutée pendant le parsing.",
                raw={"inputMutationCount": input_mutation_count},
            )
        )

    diagnostics = sort_diagnostics(diagnostics)
    output_counts["diagnosticCount"] = len(diagnostics)
    fallback_action_count = adapter_counts.get("generic_unclassified", 0)
    audit = {
        "input": dict(input_counts),
        "output": output_counts,
        "coverage": {
            "handledActionCount": output_counts["actionCount"]
            - fallback_action_count,
            "fallbackActionCount": fallback_action_count,
            "unhandledNodeCount": unhandled_node_count,
        },
        "integrity": {
            "duplicateIdCount": integrity.duplicate_id_count,
            "orphanContainerCount": integrity.orphan_container_count,
            "orphanActionCount": integrity.orphan_action_count,
            "unresolvedProcReferenceCount": unresolved_proc_reference_count,
            "invalidSourcePointerCount": invalid_pointer_count,
            "duplicateSourcePointerCount": duplicate_pointer_count,
            "inputMutationCount": input_mutation_count,
        },
        "adapters": dict(adapter_counts),
    }
    return AuditResult(
        audit=audit,
        diagnostics=diagnostics,
        has_errors=any(item.get("severity") == "error" for item in diagnostics),
    )
