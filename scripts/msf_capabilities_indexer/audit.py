"""Integrity, coverage, and snapshot audit for capability indexes."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Iterable

from .diagnostics import IndexerAuditError, IndexerInputError


SNAPSHOT_CAPABILITIES_CHECKSUM = (
    "64dae5978546fc0b50a59b18cebd6511741ff564c2d26285a05090c53a9457f6"
)

KNOWN_OPERATION_KINDS = frozenset(
    {
        "effect_apply",
        "effect_remove",
        "effect_transfer",
        "effect_flip",
        "effect_duration_modify",
        "ability_energy_generate",
        "turn_meter_modify",
        "heal_restore",
        "barrier_apply",
        "barrier_remove",
        "battlefield_effect_set",
        "battlefield_effect_clear",
        "spawn",
        "empower",
        "empty_result",
    }
)

PROC_OPERATION_KINDS = frozenset(
    {
        "effect_apply",
        "effect_remove",
        "effect_transfer",
        "effect_flip",
        "effect_duration_modify",
    }
)

SNAPSHOT_OPERATION_KINDS = {
    "ability_energy_generate": 283,
    "turn_meter_modify": 540,
    "heal_restore": 502,
    "barrier_apply": 190,
    "barrier_remove": 119,
    "battlefield_effect_clear": 21,
    "battlefield_effect_set": 17,
    "effect_apply": 5116,
    "effect_duration_modify": 1179,
    "effect_flip": 510,
    "effect_remove": 1214,
    "effect_transfer": 374,
    "empower": 7,
    "empty_result": 310,
    "spawn": 116,
}

SNAPSHOT_COUNTS = {
    "characterCount": 503,
    "abilityCount": 1844,
    "contextCount": 3930,
    "actionMappingCount": 12327,
    "operationCount": 10498,
    "effectCatalogCount": 302,
    "preservedUninterpretedActionCount": 3337,
    "spawnOperationCount": 116,
    "spawnPoolEffectOperationCount": 39,
    "spawnWithPoolEffectCount": 9,
    "spawnWithoutPoolEffectCount": 107,
    "emptyResultOperationCount": 310,
    "empowerOperationCount": 7,
    "controlledAliasResolutionCount": 6,
    "unresolvedProcReferenceCount": 2,
    "battlefieldEffectSetCount": 17,
    "battlefieldEffectClearCount": 21,
    "technicalContextCount": 606,
    "passiveEmpowerAbilityCount": 5,
}

REQUIRED_COLLECTIONS = (
    "characters",
    "abilities",
    "contexts",
    "actionMappings",
    "effects",
    "operations",
    "controlledAliasResolutions",
    "inputDiagnostics",
    "diagnostics",
)

REQUIRED_OPERATION_FIELDS = (
    "id",
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
    "rawParameters",
    "rawEffectEntry",
)


def _input_error(message: str) -> IndexerInputError:
    return IndexerInputError("INVALID_INDEXER_INPUT", message)


def _audit_error(code: str, message: str) -> IndexerAuditError:
    return IndexerAuditError(code, message)


def _require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _input_error(f"{label} doit être un objet JSON.")
    return value


def _require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise _input_error(f"{label} doit être un tableau JSON.")
    return value


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise _input_error(f"{label} doit être une chaîne.")
    return value


def _require_nullable_string(value: Any, label: str) -> str | None:
    if value is not None and not isinstance(value, str):
        raise _input_error(f"{label} doit être une chaîne ou null.")
    return value


def _require_string_list(value: Any, label: str) -> list[str]:
    items = _require_list(value, label)
    for index, item in enumerate(items):
        _require_string(item, f"{label}[{index}]")
    return items


def _require_unique_strings(
    records: list[dict[str, Any]],
    field: str,
    label: str,
) -> set[str]:
    values = [_require_string(item.get(field), f"{label}.{field}") for item in records]
    duplicates = sorted(
        value for value, count in Counter(values).items() if count > 1
    )
    if duplicates:
        raise _audit_error(
            "DUPLICATE_CANONICAL_ID",
            f"{label} contient des identifiants dupliqués : {duplicates!r}.",
        )
    return set(values)


def _records(document: dict[str, Any], key: str) -> list[dict[str, Any]]:
    items = _require_list(document.get(key), key)
    for index, item in enumerate(items):
        _require_object(item, f"{key}[{index}]")
    return items


def _check_unique_reference_list(values: list[str], label: str) -> None:
    duplicates = sorted(
        value for value, count in Counter(values).items() if count > 1
    )
    if duplicates:
        raise _audit_error(
            "DUPLICATE_REFERENCE",
            f"{label} contient des références dupliquées : {duplicates!r}.",
        )


def _require_members(
    values: Iterable[str],
    valid: set[str],
    label: str,
) -> None:
    unknown = sorted(set(values) - valid)
    if unknown:
        raise _audit_error(
            "ORPHAN_REFERENCE",
            f"{label} contient des références inconnues : {unknown!r}.",
        )


def validate_source(capabilities: dict[str, Any]) -> None:
    """Validate normalized schema relations without snapshot assumptions."""

    _require_object(capabilities, "racine")
    if capabilities.get("schemaVersion") not in {"1.0.0", "1.1.0"}:
        raise IndexerInputError(
            "UNSUPPORTED_NORMALIZER_SCHEMA",
            "schemaVersion du normaliseur non supportée : "
            f"{capabilities.get('schemaVersion')!r}.",
        )
    _require_object(capabilities.get("input"), "input")
    for key in REQUIRED_COLLECTIONS:
        _require_list(capabilities.get(key), key)

    characters = _records(capabilities, "characters")
    abilities = _records(capabilities, "abilities")
    contexts = _records(capabilities, "contexts")
    mappings = _records(capabilities, "actionMappings")
    effects = _records(capabilities, "effects")
    operations = _records(capabilities, "operations")
    aliases = _records(capabilities, "controlledAliasResolutions")

    character_object_ids = _require_unique_strings(characters, "id", "Character")
    character_ids = _require_unique_strings(
        characters, "characterId", "Character"
    )
    ability_ids = _require_unique_strings(abilities, "id", "Ability")
    context_ids = _require_unique_strings(contexts, "id", "Context")
    source_action_ids = _require_unique_strings(
        mappings, "sourceActionId", "ActionMapping"
    )
    effect_object_ids = _require_unique_strings(effects, "id", "Effect")
    effect_ids = _require_unique_strings(effects, "effectId", "Effect")
    operation_ids = _require_unique_strings(operations, "id", "Operation")

    if len(character_object_ids) != len(character_ids):
        raise _audit_error(
            "CHARACTER_ID_MISMATCH",
            "Les identifiants objet et métier Character ne sont pas bijectifs.",
        )
    if len(effect_object_ids) != len(effect_ids):
        raise _audit_error(
            "EFFECT_ID_MISMATCH",
            "Les identifiants objet et métier Effect ne sont pas bijectifs.",
        )

    character_by_id = {item["characterId"]: item for item in characters}
    context_by_id = {item["id"]: item for item in contexts}
    mapping_by_id = {item["sourceActionId"]: item for item in mappings}
    effect_by_object_id = {item["id"]: item for item in effects}
    operation_by_id = {item["id"]: item for item in operations}

    for character in characters:
        _require_string_list(character.get("traits"), "Character.traits")
        _require_object(character.get("source"), "Character.source")

    ability_by_context: dict[str, str] = {}
    expected_ability_operations: dict[str, set[str]] = {}
    for ability in abilities:
        ability_id = ability["id"]
        character_id = _require_string(
            ability.get("characterId"), f"Ability[{ability_id}].characterId"
        )
        if character_id not in character_ids:
            raise _audit_error(
                "ORPHAN_ABILITY",
                f"Ability {ability_id!r} référence Character {character_id!r}.",
            )
        _require_string(
            ability.get("abilityType"), f"Ability[{ability_id}].abilityType"
        )
        root_context_id = _require_string(
            ability.get("rootContextId"),
            f"Ability[{ability_id}].rootContextId",
        )
        ability_context_ids = _require_string_list(
            ability.get("contextIds"), f"Ability[{ability_id}].contextIds"
        )
        _check_unique_reference_list(
            ability_context_ids, f"Ability[{ability_id}].contextIds"
        )
        _require_members(
            ability_context_ids,
            context_ids,
            f"Ability[{ability_id}].contextIds",
        )
        if root_context_id not in ability_context_ids:
            raise _audit_error(
                "INVALID_ABILITY_ROOT",
                f"Ability {ability_id!r} ne contient pas son rootContextId.",
            )
        ability_operation_ids = _require_string_list(
            ability.get("operationIds"),
            f"Ability[{ability_id}].operationIds",
        )
        _check_unique_reference_list(
            ability_operation_ids, f"Ability[{ability_id}].operationIds"
        )
        _require_members(
            ability_operation_ids,
            operation_ids,
            f"Ability[{ability_id}].operationIds",
        )
        expected_ability_operations[ability_id] = set(ability_operation_ids)
        for context_id in ability_context_ids:
            previous = ability_by_context.get(context_id)
            if previous is not None:
                raise _audit_error(
                    "CONTEXT_IN_MULTIPLE_ABILITIES",
                    f"Context {context_id!r} appartient à {previous!r} "
                    f"et {ability_id!r}.",
                )
            ability_by_context[context_id] = ability_id

    for context in contexts:
        context_id = context["id"]
        character_id = _require_nullable_string(
            context.get("characterId"), f"Context[{context_id}].characterId"
        )
        if character_id is not None and character_id not in character_ids:
            raise _audit_error(
                "ORPHAN_CONTEXT",
                f"Context {context_id!r} référence Character "
                f"{character_id!r}.",
            )
        _require_nullable_string(
            context.get("abilityType"), f"Context[{context_id}].abilityType"
        )
        _require_string(
            context.get("containerType"), f"Context[{context_id}].containerType"
        )
        parent_id = _require_nullable_string(
            context.get("parentContextId"),
            f"Context[{context_id}].parentContextId",
        )
        if parent_id is not None and parent_id not in context_ids:
            raise _audit_error(
                "ORPHAN_CONTEXT_PARENT",
                f"Context {context_id!r} référence le parent {parent_id!r}.",
            )
        _require_string(
            context.get("classification"),
            f"Context[{context_id}].classification",
        )
        _require_nullable_string(
            context.get("technicalKey"), f"Context[{context_id}].technicalKey"
        )
        _require_object(context.get("execution"), f"Context[{context_id}].execution")
        _require_list(context.get("conditions"), f"Context[{context_id}].conditions")
        _require_object(context.get("source"), f"Context[{context_id}].source")

        if (
            context.get("classification") == "technical-review"
            and context_id in ability_by_context
        ):
            raise _audit_error(
                "TECHNICAL_CONTEXT_AS_ABILITY",
                f"Context technique {context_id!r} est rattaché à une Ability.",
            )
        if context.get("containerType") in {
            "passive_trigger",
            "ability_alternative",
        } and context_id not in ability_by_context:
            raise _audit_error(
                "ORPHAN_ABILITY_CONTEXT",
                f"Context fonctionnel {context_id!r} n’appartient à aucune "
                "Ability.",
            )

    for mapping in mappings:
        source_action_id = mapping["sourceActionId"]
        context_id = _require_string(
            mapping.get("contextId"),
            f"ActionMapping[{source_action_id}].contextId",
        )
        if context_id not in context_ids:
            raise _audit_error(
                "ORPHAN_ACTION_MAPPING",
                f"ActionMapping {source_action_id!r} référence Context "
                f"{context_id!r}.",
            )
        _require_string(
            mapping.get("rawSourceActionType"),
            f"ActionMapping[{source_action_id}].rawSourceActionType",
        )
        _require_string(
            mapping.get("sourceActionType"),
            f"ActionMapping[{source_action_id}].sourceActionType",
        )
        status = _require_string(
            mapping.get("status"), f"ActionMapping[{source_action_id}].status"
        )
        if status not in {"normalized", "preserved_uninterpreted"}:
            raise _input_error(
                f"Statut ActionMapping non supporté : {status!r}."
            )
        mapped_operation_ids = _require_string_list(
            mapping.get("operationIds"),
            f"ActionMapping[{source_action_id}].operationIds",
        )
        _check_unique_reference_list(
            mapped_operation_ids,
            f"ActionMapping[{source_action_id}].operationIds",
        )
        _require_members(
            mapped_operation_ids,
            operation_ids,
            f"ActionMapping[{source_action_id}].operationIds",
        )
        if status == "normalized" and not mapped_operation_ids:
            raise _audit_error(
                "EMPTY_NORMALIZED_ACTION_MAPPING",
                f"ActionMapping normalisé {source_action_id!r} est vide.",
            )
        if status == "preserved_uninterpreted" and mapped_operation_ids:
            raise _audit_error(
                "INTERPRETED_PRESERVED_ACTION",
                f"ActionMapping préservé {source_action_id!r} référence des "
                "opérations.",
            )
        _require_object(mapping.get("source"), f"ActionMapping[{source_action_id}].source")

    mapped_operation_counts: Counter[str] = Counter()
    for mapping in mappings:
        mapped_operation_counts.update(mapping["operationIds"])
    missing_mapped = sorted(operation_ids - set(mapped_operation_counts))
    duplicate_mapped = sorted(
        operation_id
        for operation_id, count in mapped_operation_counts.items()
        if count != 1
    )
    if missing_mapped or duplicate_mapped:
        raise _audit_error(
            "INVALID_OPERATION_MAPPING",
            "Les opérations doivent appartenir à un unique ActionMapping ; "
            f"absentes={missing_mapped!r}, multiples={duplicate_mapped!r}.",
        )

    actual_ability_operations: defaultdict[str, set[str]] = defaultdict(set)
    spawn_by_source_action: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    spawn_pool_operations: list[dict[str, Any]] = []

    for operation in operations:
        operation_id = operation["id"]
        missing_fields = [
            field for field in REQUIRED_OPERATION_FIELDS if field not in operation
        ]
        if missing_fields:
            raise _input_error(
                f"Operation {operation_id!r} ne contient pas "
                f"{missing_fields!r}."
            )
        kind = _require_string(
            operation.get("kind"), f"Operation[{operation_id}].kind"
        )
        if kind not in KNOWN_OPERATION_KINDS:
            raise IndexerInputError(
                "UNSUPPORTED_OPERATION_KIND",
                f"Kind d’opération non supporté : {kind!r}.",
            )
        character_id = _require_nullable_string(
            operation.get("characterId"),
            f"Operation[{operation_id}].characterId",
        )
        if character_id is not None and character_id not in character_ids:
            raise _audit_error(
                "ORPHAN_OPERATION_CHARACTER",
                f"Operation {operation_id!r} référence Character "
                f"{character_id!r}.",
            )
        _require_nullable_string(
            operation.get("abilityType"),
            f"Operation[{operation_id}].abilityType",
        )
        context_id = _require_string(
            operation.get("contextId"),
            f"Operation[{operation_id}].contextId",
        )
        if context_id not in context_ids:
            raise _audit_error(
                "ORPHAN_OPERATION_CONTEXT",
                f"Operation {operation_id!r} référence Context "
                f"{context_id!r}.",
            )
        context_character_id = context_by_id[context_id].get("characterId")
        if (
            character_id is not None
            and context_character_id is not None
            and character_id != context_character_id
        ):
            raise _audit_error(
                "OPERATION_CONTEXT_CHARACTER_MISMATCH",
                f"Operation {operation_id!r} et Context {context_id!r} "
                "référencent des personnages différents.",
            )
        context_path_ids = _require_string_list(
            operation.get("contextPathIds"),
            f"Operation[{operation_id}].contextPathIds",
        )
        if not context_path_ids or context_path_ids[-1] != context_id:
            raise _audit_error(
                "INVALID_CONTEXT_PATH",
                f"Operation {operation_id!r} ne termine pas son chemin par "
                f"{context_id!r}.",
            )
        _require_members(
            context_path_ids,
            context_ids,
            f"Operation[{operation_id}].contextPathIds",
        )
        for parent_id, child_id in zip(context_path_ids, context_path_ids[1:]):
            if context_by_id[child_id].get("parentContextId") != parent_id:
                raise _audit_error(
                    "INVALID_CONTEXT_PATH",
                    f"Chemin Context invalide pour Operation {operation_id!r}.",
                )
        source_action_id = _require_string(
            operation.get("sourceActionId"),
            f"Operation[{operation_id}].sourceActionId",
        )
        if source_action_id not in source_action_ids:
            raise _audit_error(
                "ORPHAN_OPERATION_ACTION",
                f"Operation {operation_id!r} référence ActionMapping "
                f"{source_action_id!r}.",
            )
        mapping = mapping_by_id[source_action_id]
        if operation_id not in mapping["operationIds"]:
            raise _audit_error(
                "OPERATION_MAPPING_MISMATCH",
                f"Operation {operation_id!r} manque dans son ActionMapping.",
            )
        if mapping["contextId"] != context_id:
            raise _audit_error(
                "OPERATION_MAPPING_CONTEXT_MISMATCH",
                f"Operation {operation_id!r} et son ActionMapping ne partagent "
                "pas le même Context.",
            )
        _require_string(
            operation.get("sourceActionType"),
            f"Operation[{operation_id}].sourceActionType",
        )
        _require_string(
            operation.get("rawSourceActionType"),
            f"Operation[{operation_id}].rawSourceActionType",
        )
        action_order = operation.get("actionOrder")
        if isinstance(action_order, bool) or not isinstance(action_order, int):
            raise _input_error(
                f"Operation[{operation_id}].actionOrder doit être un entier."
            )

        for field in ("selector", "scope", "target", "recipient", "control", "metrics", "flags", "source", "rawParameters"):
            _require_object(operation.get(field), f"Operation[{operation_id}].{field}")
        _require_list(
            operation.get("conditions"), f"Operation[{operation_id}].conditions"
        )

        selector = operation["selector"]
        selector_mode = _require_string(
            selector.get("mode"), f"Operation[{operation_id}].selector.mode"
        )
        if selector_mode not in {"explicit", "generic"}:
            raise _input_error(
                f"Mode de sélecteur non supporté : {selector_mode!r}."
            )
        effect = operation.get("effect")
        if selector_mode == "generic" and effect is not None:
            raise _audit_error(
                "GENERIC_SELECTOR_HAS_EFFECT",
                f"Operation générique {operation_id!r} possède un effectId.",
            )
        if effect is not None:
            effect = _require_object(effect, f"Operation[{operation_id}].effect")
            namespace = _require_string(
                effect.get("namespace"),
                f"Operation[{operation_id}].effect.namespace",
            )
            if namespace not in {"proc", "battlefield"}:
                raise _input_error(
                    f"Namespace d’effet non supporté : {namespace!r}."
                )
            effect_id = _require_string(
                effect.get("effectId"),
                f"Operation[{operation_id}].effect.effectId",
            )
            _require_string(
                effect.get("rawValue"),
                f"Operation[{operation_id}].effect.rawValue",
            )
            resolved_value = _require_string(
                effect.get("resolvedValue"),
                f"Operation[{operation_id}].effect.resolvedValue",
            )
            resolution_method = _require_string(
                effect.get("resolutionMethod"),
                f"Operation[{operation_id}].effect.resolutionMethod",
            )
            if namespace == "proc":
                if kind not in PROC_OPERATION_KINDS:
                    raise _audit_error(
                        "INCOMPATIBLE_EFFECT_OPERATION",
                        f"Operation {operation_id!r} associe un proc au kind "
                        f"{kind!r}.",
                    )
                resolved = effect.get("resolved")
                if not isinstance(resolved, bool):
                    raise _input_error(
                        f"Operation[{operation_id}].effect.resolved doit être "
                        "booléen pour un proc."
                    )
                catalog_id = effect.get("catalogEffectId")
                if resolved:
                    catalog_id = _require_string(
                        catalog_id,
                        f"Operation[{operation_id}].effect.catalogEffectId",
                    )
                    if catalog_id not in effect_object_ids:
                        raise _audit_error(
                            "ORPHAN_EFFECT_REFERENCE",
                            f"Operation {operation_id!r} référence Effect "
                            f"{catalog_id!r}.",
                        )
                    if effect_by_object_id[catalog_id]["effectId"] != resolved_value:
                        raise _audit_error(
                            "EFFECT_RESOLUTION_MISMATCH",
                            f"Operation {operation_id!r} ne résout pas le bon "
                            "Effect.",
                        )
                elif catalog_id is not None:
                    raise _audit_error(
                        "INVENTED_EFFECT_RESOLUTION",
                        f"Operation non résolue {operation_id!r} possède un "
                        "catalogEffectId.",
                    )
                if resolution_method == "controlled_alias":
                    _require_string(
                        effect.get("resolutionOrigin"),
                        f"Operation[{operation_id}].effect.resolutionOrigin",
                    )
                if effect_id != resolved_value:
                    raise _audit_error(
                        "EFFECT_ID_MISMATCH",
                        f"Operation {operation_id!r} ne conserve pas son "
                        "resolvedValue comme effectId.",
                    )
            else:
                if kind != "battlefield_effect_set":
                    raise _audit_error(
                        "INCOMPATIBLE_BATTLEFIELD_EFFECT",
                        f"Operation {operation_id!r} associe un effet de champ "
                        f"au kind {kind!r}.",
                    )
                if effect.get("catalogEffectId") is not None:
                    raise _audit_error(
                        "BATTLEFIELD_EFFECT_IN_PROC_CATALOG",
                        f"Operation de champ {operation_id!r} pointe le "
                        "catalogue proc.",
                    )

        ability_id = ability_by_context.get(context_id)
        if ability_id is not None:
            actual_ability_operations[ability_id].add(operation_id)
        scope_kind = _require_string(
            operation["scope"].get("kind"),
            f"Operation[{operation_id}].scope.kind",
        )
        if kind == "spawn":
            if scope_kind != "spawn_invocation":
                raise _audit_error(
                    "INVALID_SPAWN_SCOPE",
                    f"Operation spawn {operation_id!r} n’utilise pas "
                    "spawn_invocation.",
                )
            spawn_by_source_action[source_action_id].append(operation)
        if scope_kind == "spawn_pool":
            if kind != "effect_apply":
                raise _audit_error(
                    "INVALID_SPAWN_POOL_OPERATION",
                    f"Operation {operation_id!r} de scope spawn_pool n’est pas "
                    "un effect_apply.",
                )
            spawn_pool_operations.append(operation)

    for ability_id, expected in expected_ability_operations.items():
        actual = actual_ability_operations.get(ability_id, set())
        if expected != actual:
            raise _audit_error(
                "ABILITY_OPERATION_MISMATCH",
                f"Ability {ability_id!r} ne référence pas exactement ses "
                f"opérations : attendu={sorted(actual)!r}, "
                f"reçu={sorted(expected)!r}.",
            )

    duplicate_spawn_sources = sorted(
        source_action_id
        for source_action_id, records in spawn_by_source_action.items()
        if len(records) != 1
    )
    if duplicate_spawn_sources:
        raise _audit_error(
            "AMBIGUOUS_SPAWN_SOURCE",
            "Une action spawn doit produire une unique opération spawn : "
            f"{duplicate_spawn_sources!r}.",
        )
    for operation in spawn_pool_operations:
        operation_id = operation["id"]
        source_action_id = operation["sourceActionId"]
        candidates = spawn_by_source_action.get(source_action_id, [])
        if len(candidates) != 1:
            raise _audit_error(
                "ORPHAN_SPAWN_POOL_EFFECT",
                f"Operation spawn_pool {operation_id!r} ne trouve pas son "
                "spawn par sourceActionId exact.",
            )
        pool_index = operation["scope"].get("poolIndex")
        if isinstance(pool_index, bool) or not isinstance(pool_index, int):
            raise _input_error(
                f"Operation[{operation_id}].scope.poolIndex doit être un entier."
            )
        pool = candidates[0]["rawParameters"].get("pool", [])
        pool = _require_list(pool, f"Operation[{candidates[0]['id']}].rawParameters.pool")
        if pool_index < 0 or pool_index >= len(pool):
            raise _audit_error(
                "ORPHAN_SPAWN_POOL_INDEX",
                f"Operation {operation_id!r} référence poolIndex "
                f"{pool_index!r} hors limites.",
            )

    alias_pointers: list[tuple[str, str]] = []
    for index, alias in enumerate(aliases):
        raw_value = _require_string(
            alias.get("rawValue"),
            f"controlledAliasResolutions[{index}].rawValue",
        )
        resolved_value = _require_string(
            alias.get("resolvedValue"),
            f"controlledAliasResolutions[{index}].resolvedValue",
        )
        method = _require_string(
            alias.get("resolutionMethod"),
            f"controlledAliasResolutions[{index}].resolutionMethod",
        )
        if method != "controlled_alias":
            raise _audit_error(
                "INVALID_CONTROLLED_ALIAS",
                f"Résolution d’alias invalide pour {raw_value!r}.",
            )
        _require_string(
            alias.get("resolutionOrigin"),
            f"controlledAliasResolutions[{index}].resolutionOrigin",
        )
        if alias.get("resolved") is not True:
            raise _audit_error(
                "INVALID_CONTROLLED_ALIAS",
                f"Alias {raw_value!r} vers {resolved_value!r} n’est pas résolu.",
            )
        catalog_id = _require_string(
            alias.get("catalogEffectId"),
            f"controlledAliasResolutions[{index}].catalogEffectId",
        )
        if catalog_id not in effect_object_ids:
            raise _audit_error(
                "ORPHAN_CONTROLLED_ALIAS",
                f"Alias {raw_value!r} référence Effect {catalog_id!r}.",
            )
        source = _require_object(
            alias.get("source"), f"controlledAliasResolutions[{index}].source"
        )
        source_file = _require_string(
            source.get("file"),
            f"controlledAliasResolutions[{index}].source.file",
        )
        source_pointer = _require_string(
            source.get("pointer"),
            f"controlledAliasResolutions[{index}].source.pointer",
        )
        alias_pointers.append((source_file, source_pointer))
    duplicate_alias_pointers = sorted(
        pointer
        for pointer, count in Counter(alias_pointers).items()
        if count > 1
    )
    if duplicate_alias_pointers:
        raise _audit_error(
            "DUPLICATE_CONTROLLED_ALIAS",
            f"Résolutions d’alias dupliquées : {duplicate_alias_pointers!r}.",
        )


def _assert_record_keys(
    payload: dict[str, Any],
    expected: set[str],
    label: str,
) -> None:
    records = payload.get("records")
    if not isinstance(records, dict):
        raise _audit_error(
            "INVALID_INDEX_PAYLOAD", f"{label}.records doit être un objet."
        )
    actual = set(records)
    if actual != expected:
        raise _audit_error(
            "INDEX_COVERAGE_MISMATCH",
            f"Couverture {label} incorrecte : "
            f"manquants={sorted(expected - actual)!r}, "
            f"supplémentaires={sorted(actual - expected)!r}.",
        )


def _assert_canonical_id_values(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key.endswith("Ids"):
                if not isinstance(child, list) or any(
                    not isinstance(item, str) for item in child
                ):
                    raise _audit_error(
                        "NON_CANONICAL_INDEX_REFERENCE",
                        f"{child_path} doit contenir uniquement des IDs "
                        "canoniques.",
                    )
            elif (
                key.endswith("Id")
                and child is not None
                and not isinstance(child, (dict, list))
            ):
                if not isinstance(child, str):
                    raise _audit_error(
                        "NON_CANONICAL_INDEX_REFERENCE",
                        f"{child_path} doit être un ID canonique ou null.",
                    )
            _assert_canonical_id_values(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _assert_canonical_id_values(child, f"{path}[{index}]")


def _diagnostic_severities(items: list[Any]) -> dict[str, int]:
    counts = Counter(
        item.get("severity")
        for item in items
        if isinstance(item, dict) and isinstance(item.get("severity"), str)
    )
    return {
        severity: counts.get(severity, 0)
        for severity in ("error", "warning", "info")
    }


def audit_index(
    capabilities: dict[str, Any],
    payloads: dict[str, dict[str, Any]],
    capabilities_checksum: str,
) -> dict[str, Any]:
    """Audit complete payload coverage and return deterministic counters."""

    expected_payloads = {
        "characters.json",
        "abilities.json",
        "contexts.json",
        "operations.json",
        "effects.json",
        "spawns.json",
        "uninterpreted-actions.json",
    }
    if set(payloads) != expected_payloads:
        raise _audit_error(
            "INVALID_PAYLOAD_SET",
            f"Jeu de payloads invalide : {sorted(payloads)!r}.",
        )

    characters = capabilities["characters"]
    abilities = capabilities["abilities"]
    contexts = capabilities["contexts"]
    mappings = capabilities["actionMappings"]
    effects = capabilities["effects"]
    operations = capabilities["operations"]
    aliases = capabilities["controlledAliasResolutions"]

    character_ids = {item["characterId"] for item in characters}
    ability_ids = {item["id"] for item in abilities}
    context_ids = {item["id"] for item in contexts}
    operation_ids = {item["id"] for item in operations}
    effect_ids = {item["effectId"] for item in effects}
    normalized_action_ids = {
        item["sourceActionId"]
        for item in mappings
        if item["status"] == "normalized"
    }
    preserved_action_ids = {
        item["sourceActionId"]
        for item in mappings
        if item["status"] == "preserved_uninterpreted"
    }
    spawn_operation_ids = {
        item["id"] for item in operations if item["kind"] == "spawn"
    }

    _assert_record_keys(payloads["characters.json"], character_ids, "characters")
    _assert_record_keys(payloads["abilities.json"], ability_ids, "abilities")
    _assert_record_keys(payloads["contexts.json"], context_ids, "contexts")
    _assert_record_keys(payloads["operations.json"], operation_ids, "operations")
    _assert_record_keys(payloads["spawns.json"], spawn_operation_ids, "spawns")
    _assert_record_keys(
        payloads["uninterpreted-actions.json"],
        preserved_action_ids,
        "uninterpreted-actions",
    )

    normalized_records = payloads["operations.json"].get("actionMappings")
    if not isinstance(normalized_records, dict) or set(normalized_records) != normalized_action_ids:
        raise _audit_error(
            "ACTION_MAPPING_COVERAGE_MISMATCH",
            "Les ActionMapping normalisés ne sont pas couverts exactement.",
        )
    catalog_records = (
        payloads["effects.json"].get("catalog", {}).get("byEffectId")
    )
    if not isinstance(catalog_records, dict) or set(catalog_records) != effect_ids:
        raise _audit_error(
            "EFFECT_CATALOG_COVERAGE_MISMATCH",
            "Le catalogue d’effets n’est pas couvert exactement.",
        )

    operation_records = payloads["operations.json"]["records"]
    for operation_id, record in operation_records.items():
        if record.get("operationId") != operation_id:
            raise _audit_error(
                "OPERATION_ID_MISMATCH",
                f"Record Operation incohérent : {operation_id!r}.",
            )
        if "rawParameters" in record or "rawEffectEntry" in record:
            raise _audit_error(
                "RAW_OPERATION_DATA_COPIED",
                f"Operation indexée {operation_id!r} recopie des données brutes.",
            )

    facet_availability = payloads["uninterpreted-actions.json"].get(
        "facetAvailability"
    )
    expected_facets = {
        "conditionPresence": "available",
        "targetPresence": "available",
        "dependencyPresence": "available",
    }
    if facet_availability != expected_facets:
        raise _audit_error(
            "INVALID_UNINTERPRETED_FACETS",
            "Les facettes structurelles enrichies doivent être disponibles.",
        )
    if "bySourcePointer" in payloads["uninterpreted-actions.json"].get(
        "indexes", {}
    ):
        raise _audit_error(
            "FORBIDDEN_SOURCE_POINTER_INDEX",
            "bySourcePointer est interdit dans l’index v1.",
        )

    effects_payload = payloads["effects.json"]
    references = effects_payload.get("references", {})
    generic = effects_payload.get("genericSelectors", {})
    for operation in operations:
        operation_id = operation["id"]
        kind = operation["kind"]
        effect = operation["effect"]
        selector = operation["selector"]
        if isinstance(effect, dict):
            namespace = effect["namespace"]
            effect_id = effect["effectId"]
            namespace_records = references.get(namespace, {})
            summary = namespace_records.get(effect_id)
            if not isinstance(summary, dict):
                raise _audit_error(
                    "MISSING_EFFECT_REFERENCE",
                    f"Operation {operation_id!r} manque dans effects.json.",
                )
            indexed = summary.get("operationIdsByKind", {}).get(kind, [])
            if operation_id not in indexed:
                raise _audit_error(
                    "MISSING_EFFECT_REFERENCE",
                    f"Operation {operation_id!r} manque dans son groupe "
                    "d’effet.",
                )
        elif selector.get("mode") == "generic" and kind in PROC_OPERATION_KINDS:
            category = selector.get("category")
            if isinstance(category, str):
                summary = generic.get("byCategory", {}).get(category)
            else:
                summary = generic.get("withoutCategory")
            if not isinstance(summary, dict) or operation_id not in summary.get(
                "operationIdsByKind", {}
            ).get(kind, []):
                raise _audit_error(
                    "MISSING_GENERIC_EFFECT_REFERENCE",
                    f"Operation générique {operation_id!r} manque dans "
                    "effects.json.",
                )

    spawn_records = payloads["spawns.json"]["records"]
    source_operations = {item["id"]: item for item in operations}
    linked_pool_operation_ids: list[str] = []
    for spawn_operation_id, record in spawn_records.items():
        source_action_id = source_operations[spawn_operation_id]["sourceActionId"]
        for pool_entry in record.get("pool", []):
            pool_index = pool_entry.get("poolIndex")
            for linked_id in pool_entry.get("effectApplyOperationIds", []):
                linked = source_operations.get(linked_id)
                if (
                    linked is None
                    or linked.get("sourceActionId") != source_action_id
                    or linked.get("scope", {}).get("kind") != "spawn_pool"
                    or linked.get("scope", {}).get("poolIndex") != pool_index
                ):
                    raise _audit_error(
                        "INVALID_SPAWN_POOL_JOIN",
                        f"Liaison spawn_pool invalide : {linked_id!r}.",
                    )
                linked_pool_operation_ids.append(linked_id)
            join = pool_entry.get("characterJoin")
            if not isinstance(join, dict):
                raise _audit_error(
                    "INVALID_SPAWN_CHARACTER_JOIN",
                    f"Jointure de personnage absente pour "
                    f"{spawn_operation_id!r}.",
                )
            spawned_character_id = pool_entry.get("spawnedCharacterId")
            expected_method = (
                "exact"
                if isinstance(spawned_character_id, str)
                and spawned_character_id in character_ids
                else "none"
            )
            if join.get("method") != expected_method:
                raise _audit_error(
                    "INVALID_SPAWN_CHARACTER_JOIN",
                    f"Jointure de personnage incorrecte pour "
                    f"{spawn_operation_id!r}.",
                )
    expected_pool_operation_ids = {
        item["id"]
        for item in operations
        if item.get("scope", {}).get("kind") == "spawn_pool"
    }
    if (
        set(linked_pool_operation_ids) != expected_pool_operation_ids
        or len(linked_pool_operation_ids) != len(expected_pool_operation_ids)
    ):
        raise _audit_error(
            "SPAWN_POOL_COVERAGE_MISMATCH",
            "Les effect_apply spawn_pool ne sont pas liés exactement une fois.",
        )

    for path, payload in payloads.items():
        _assert_canonical_id_values(payload, path)

    operation_kind_counts = Counter(item["kind"] for item in operations)
    technical_context_count = sum(
        item.get("classification") == "technical-review" for item in contexts
    )
    spawn_pool_effect_count = len(expected_pool_operation_ids)
    spawn_with_effect_count = sum(
        any(entry.get("effectApplyOperationIds") for entry in record.get("pool", []))
        for record in spawn_records.values()
    )
    unresolved_proc_count = sum(
        isinstance(item.get("effect"), dict)
        and item["effect"].get("namespace") == "proc"
        and item["effect"].get("resolved") is False
        for item in operations
    )
    counts: dict[str, Any] = {
        "characterCount": len(characters),
        "abilityCount": len(abilities),
        "contextCount": len(contexts),
        "actionMappingCount": len(mappings),
        "normalizedActionMappingCount": len(normalized_action_ids),
        "preservedUninterpretedActionCount": len(preserved_action_ids),
        "operationCount": len(operations),
        "effectCatalogCount": len(effects),
        "explicitEffectOperationCount": sum(
            isinstance(item.get("effect"), dict) for item in operations
        ),
        "genericSelectorOperationCount": sum(
            item.get("selector", {}).get("mode") == "generic"
            for item in operations
        ),
        "spawnOperationCount": len(spawn_operation_ids),
        "spawnPoolEffectOperationCount": spawn_pool_effect_count,
        "spawnWithPoolEffectCount": spawn_with_effect_count,
        "spawnWithoutPoolEffectCount": len(spawn_operation_ids)
        - spawn_with_effect_count,
        "emptyResultOperationCount": operation_kind_counts["empty_result"],
        "empowerOperationCount": operation_kind_counts["empower"],
        "controlledAliasResolutionCount": len(aliases),
        "unresolvedProcReferenceCount": unresolved_proc_count,
        "battlefieldEffectSetCount": operation_kind_counts[
            "battlefield_effect_set"
        ],
        "battlefieldEffectClearCount": operation_kind_counts[
            "battlefield_effect_clear"
        ],
        "technicalContextCount": technical_context_count,
        "passiveEmpowerAbilityCount": sum(
            item.get("abilityType") == "passive_empower" for item in abilities
        ),
        "operationsByKind": {
            key: operation_kind_counts[key]
            for key in sorted(operation_kind_counts)
        },
    }

    snapshot_applied = capabilities_checksum == SNAPSHOT_CAPABILITIES_CHECKSUM
    snapshot_actual = {
        key: counts[key] for key in SNAPSHOT_COUNTS
    }
    snapshot_mismatches: dict[str, Any] = {}
    if snapshot_applied:
        for key, expected in SNAPSHOT_COUNTS.items():
            actual = counts[key]
            if actual != expected:
                snapshot_mismatches[key] = {
                    "expected": expected,
                    "actual": actual,
                }
        if counts["operationsByKind"] != SNAPSHOT_OPERATION_KINDS:
            snapshot_mismatches["operationsByKind"] = {
                "expected": SNAPSHOT_OPERATION_KINDS,
                "actual": counts["operationsByKind"],
            }
        if snapshot_mismatches:
            raise _audit_error(
                "SNAPSHOT_ASSERTION_FAILED",
                f"Assertions d’instantané violées : {snapshot_mismatches!r}.",
            )

    parser_diagnostics = capabilities.get("inputDiagnostics", [])
    normalizer_diagnostics = capabilities.get("diagnostics", [])
    integrity = {
        "duplicateCanonicalIdCount": 0,
        "orphanReferenceCount": 0,
        "unindexedCharacterCount": 0,
        "unindexedAbilityCount": 0,
        "unindexedContextCount": 0,
        "unindexedActionMappingCount": 0,
        "unindexedOperationCount": 0,
        "unindexedEffectCount": 0,
        "unindexedSpawnCount": 0,
        "unindexedPreservedActionCount": 0,
        "invalidKindIndexCount": 0,
        "genericEffectMisassociationCount": 0,
        "invalidSpawnPoolJoinCount": 0,
        "nonCanonicalReferenceCount": 0,
    }
    return {
        "status": "passed",
        "general": {
            "status": "passed",
            "checks": [
                "canonical_ids_are_unique",
                "cross_references_are_exact",
                "all_source_records_are_indexed",
                "action_mapping_partition_is_exhaustive",
                "operations_use_compatible_indexes",
                "generic_selectors_have_no_invented_effect_id",
                "proc_and_battlefield_namespaces_are_separate",
                "spawn_pool_links_use_source_action_scope_and_pool_index",
                "controlled_aliases_preserve_traceability",
                "technical_contexts_are_not_abilities",
                "index_references_use_canonical_ids_only",
            ],
        },
        "snapshot": {
            "applied": snapshot_applied,
            "status": "passed" if snapshot_applied else "not_applicable",
            "requiredChecksum": f"sha256:{SNAPSHOT_CAPABILITIES_CHECKSUM}",
            "actual": snapshot_actual if snapshot_applied else {},
            "operationsByKind": (
                counts["operationsByKind"] if snapshot_applied else {}
            ),
        },
        "counts": counts,
        "coverage": {
            "characters": {"source": len(characters), "indexed": len(character_ids)},
            "abilities": {"source": len(abilities), "indexed": len(ability_ids)},
            "contexts": {"source": len(contexts), "indexed": len(context_ids)},
            "actionMappings": {
                "source": len(mappings),
                "indexed": len(normalized_action_ids) + len(preserved_action_ids),
            },
            "operations": {
                "source": len(operations),
                "indexed": len(operation_ids),
            },
            "effects": {"source": len(effects), "indexed": len(effect_ids)},
            "spawns": {
                "source": len(spawn_operation_ids),
                "indexed": len(spawn_records),
            },
            "preservedUninterpretedActions": {
                "source": len(preserved_action_ids),
                "indexed": len(
                    payloads["uninterpreted-actions.json"]["records"]
                ),
            },
        },
        "integrity": integrity,
        "upstreamDiagnostics": {
            "parser": {
                "count": len(parser_diagnostics),
                "bySeverity": _diagnostic_severities(parser_diagnostics),
            },
            "normalizer": {
                "count": len(normalizer_diagnostics),
                "bySeverity": _diagnostic_severities(normalizer_diagnostics),
            },
        },
    }
