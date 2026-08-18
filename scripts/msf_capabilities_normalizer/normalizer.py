"""Normalize parsed MSF mechanics into controlled, auditable operations."""

from __future__ import annotations

import copy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

from .audit import audit_capabilities
from .diagnostics import diagnostic
from .effect_aliases import (
    EFFECT_ID_ALIASES,
    alias_policy_record,
    iter_mechanics_effect_identifiers,
    resolve_effect_identifier,
)
from .values import (
    normalize_boolean_record,
    normalize_expression,
    normalize_progression,
)


SCHEMA_VERSION = "1.1.0"
SUPPORTED_PARSER_SCHEMA_VERSION = "1.0.0"
DEFAULT_INPUT_PATH = Path("data/msf-capabilities/parsed/mechanics.json")
DEFAULT_OUTPUT_PATH = Path(
    "data/msf-capabilities/normalized/capabilities.json"
)

ROOT_LIST_FIELDS = (
    "sources",
    "characters",
    "containers",
    "actions",
    "effects",
    "diagnostics",
)

EFFECT_ACTION_SPECS: dict[str, tuple[str, tuple[str, ...]]] = {
    "proc": ("effect_apply", ("procs",)),
    "proc_remove": (
        "effect_remove",
        ("procs", "only_procs", "onlyprocs", "specific_procs"),
    ),
    "proc_transfer": (
        "effect_transfer",
        ("onlyprocs", "only_procs", "procs", "specific_procs"),
    ),
    "proc_flip": (
        "effect_flip",
        ("specific_procs", "procs", "only_procs", "onlyprocs"),
    ),
    "proc_duration": (
        "effect_duration_modify",
        ("only_procs", "procs", "onlyprocs", "specific_procs"),
    ),
}

ABILITY_ENERGY_METRIC_FIELDS = (
    ("chancePct", "action_pct"),
    ("energyAmount", "count"),
)

TURN_METER_METRIC_FIELDS = (
    ("chancePct", "action_pct"),
    ("turnMeterPct", "change_pct"),
    ("specificCharacterTurnMeterPct", "specific_characters_mul"),
)

HEAL_METRIC_FIELDS = (
    ("chancePct", "action_pct"),
    ("healAmount", "heal_amt"),
    ("sourceMaxHealthPct", "heal_pct"),
)

METRIC_FIELDS = (
    ("chancePct", "action_pct"),
    ("applyCount", "apply_count"),
    ("selectionCount", "count"),
    ("delta", "delta"),
    ("maxDuration", "max_duration"),
    ("transferPct", "transferpct"),
    ("sourceRemovalPct", "removepct"),
    ("removePct", "remove_pct"),
    ("flipPct", "flip_pct"),
)

ENTRY_METRIC_FIELDS = (
    ("useCount", "use_count"),
    ("useCountPerCrit", "use_count_per_crit"),
    ("spawnPct", "spawn_pct"),
)

BOOLEAN_FLAG_FIELDS = (
    ("addIfMissing", "add_if_not"),
    ("newResult", "new_result"),
    ("counter", "counter"),
    ("checkBlock", "check_block"),
    ("skipFocusCheck", "skip_focus_check"),
    ("forceApplyDynamicStats", "force_apply_dynamic_stats"),
    ("includePreviousDead", "include_previous_dead"),
    ("transferOpposite", "transferopposite"),
    ("forceTransferAllProcs", "force_transfer_all_procs"),
    ("clearFromOtherSide", "clear_from_other_side"),
    ("clearLock", "clear_lock"),
)

ENTRY_BOOLEAN_FLAG_FIELDS = (
    ("applyToSpawned", "apply_to_spawned"),
)

CONTEXT_VALUE_FIELDS = (
    ("execValue", "execValue", "exec_value"),
    ("cost", "cost", "cost"),
    ("startEnergy", "startEnergy", "start_energy"),
    ("powerMultiplier", "powerMultiplier", "power_mul"),
)

CONTEXT_BOOLEAN_FIELDS = (
    ("execOnStun", "execOnStun", "exec_on_stun"),
    (
        "canTriggerOnAssist",
        "canTriggerOnAssist",
        "can_trigger_on_assist",
    ),
    (
        "canTriggerOnCounter",
        "canTriggerOnCounter",
        "can_trigger_on_counter",
    ),
    ("targetPrimary", "targetPrimary", "target_primary"),
    ("excludePrimary", "excludePrimary", "exclude_Primary"),
    ("excludeSecondary", "excludeSecondary", "exclude_Secondary"),
    (
        "skipForKilledTargets",
        "skipForKilledTargets",
        "skip_for_killed_targets",
    ),
)

CONTEXT_QUALIFIER_FIELDS = (
    (
        "abilityUsed",
        "execOnAbilityUsed",
        "exec_on_ability_used",
    ),
)

PREVIOUS_ACTION_CONDITIONS = frozenset(
    {
        "if_prev_ran",
        "if_prev_skipped",
        "if_prev_skipped_or_unsuccessful",
    }
)

PLAYABLE_ABILITY_BASE_TYPES = frozenset(
    {
        "basic",
        "special",
        "ultimate",
        "passive",
    }
)


class NormalizerError(RuntimeError):
    """A blocking input-validation or normalizer-audit failure."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        diagnostics: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.diagnostics = list(diagnostics or [])


@dataclass(frozen=True)
class MechanicsDocument:
    document: dict[str, Any]
    payload: bytes
    checksum: str


def _canonical_json_payload(value: Any) -> bytes:
    text = json.dumps(
        value,
        ensure_ascii=False,
        indent=2,
        allow_nan=False,
    )
    return f"{text}\n".encode("utf-8")


def _validate_mechanics(mechanics: Any) -> dict[str, Any]:
    if not isinstance(mechanics, dict):
        raise NormalizerError(
            "INVALID_NORMALIZER_INPUT",
            "mechanics.json doit contenir un objet JSON à sa racine.",
        )
    if mechanics.get("schemaVersion") != SUPPORTED_PARSER_SCHEMA_VERSION:
        raise NormalizerError(
            "INVALID_NORMALIZER_INPUT",
            (
                "Version de schéma du parser non prise en charge : "
                f"{mechanics.get('schemaVersion')!r}."
            ),
        )
    for field in ROOT_LIST_FIELDS:
        if not isinstance(mechanics.get(field), list):
            raise NormalizerError(
                "INVALID_NORMALIZER_INPUT",
                f"Le champ mechanics.{field} doit être un tableau.",
            )
    if not isinstance(mechanics.get("audit"), dict):
        raise NormalizerError(
            "INVALID_NORMALIZER_INPUT",
            "Le champ mechanics.audit doit être un objet.",
        )
    return mechanics


def load_mechanics(path: Path = DEFAULT_INPUT_PATH) -> MechanicsDocument:
    try:
        payload = Path(path).read_bytes()
    except OSError as error:
        raise NormalizerError(
            "INVALID_NORMALIZER_INPUT",
            f"Intermédiaire mechanics indisponible : {path}: {error}",
        ) from error
    try:
        document = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise NormalizerError(
            "INVALID_NORMALIZER_INPUT",
            f"JSON mechanics invalide : {path}: {error}",
        ) from error

    validated = _validate_mechanics(document)
    return MechanicsDocument(
        document=validated,
        payload=payload,
        checksum=hashlib.sha256(payload).hexdigest(),
    )


def _escape_pointer_segment(value: object) -> str:
    return str(value).replace("~", "~0").replace("/", "~1")


def _append_pointer(pointer: str, *segments: object) -> str:
    result = pointer
    for segment in segments:
        result = f"{result}/{_escape_pointer_segment(segment)}"
    return result


def _deterministic_id(prefix: str, canonical: str) -> str:
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{prefix}_{digest[:16]}"


def _normalize_condition_records(
    records: Any,
) -> list[dict[str, Any]]:
    if not isinstance(records, list):
        return []
    normalized: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        raw = copy.deepcopy(record.get("raw"))
        normalized.append(
            {
                "kind": record.get("kind"),
                "source": copy.deepcopy(record.get("source")),
                "expression": normalize_expression(raw),
                "raw": raw,
            }
        )
    return normalized


def _condition_record(
    *,
    kind: str,
    raw: Any,
    source_file: str,
    source_pointer: str,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "source": {
            "file": source_file,
            "pointer": source_pointer,
        },
        "expression": normalize_expression(raw),
        "raw": copy.deepcopy(raw),
    }


def _normalize_characters(
    mechanics: dict[str, Any],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for character in mechanics["characters"]:
        if not isinstance(character, dict):
            continue
        records.append(
            {
                "id": character.get("id"),
                "characterId": character.get("characterId"),
                "traits": copy.deepcopy(character.get("traits", [])),
                "source": copy.deepcopy(character.get("source")),
            }
        )
    return records


def _normalize_contexts(
    mechanics: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    containers = [
        item for item in mechanics["containers"] if isinstance(item, dict)
    ]
    context_id_by_container_id = {
        item["id"]: _deterministic_id("ctx", f"context|{item['id']}")
        for item in containers
        if isinstance(item.get("id"), str)
    }
    contexts: list[dict[str, Any]] = []
    for container in containers:
        source_container_id = container.get("id")
        if not isinstance(source_container_id, str):
            continue
        source = copy.deepcopy(container.get("source"))
        if not isinstance(source, dict):
            source = {"file": "<generated>", "pointer": ""}
        pointer = source.get("pointer")
        if not isinstance(pointer, str):
            pointer = ""
        raw_context = copy.deepcopy(container.get("context"))
        if not isinstance(raw_context, dict):
            raw_context = {}

        values = {
            output_name: normalize_progression(
                raw_context[context_name],
                source_field=source_name,
                source_pointer=_append_pointer(pointer, source_name),
            )
            for output_name, context_name, source_name in CONTEXT_VALUE_FIELDS
            if context_name in raw_context
        }
        flags = {
            output_name: normalize_boolean_record(
                raw_context[context_name],
                source_field=source_name,
                source_pointer=_append_pointer(pointer, source_name),
            )
            for output_name, context_name, source_name in CONTEXT_BOOLEAN_FIELDS
            if context_name in raw_context
        }
        qualifiers = {
            output_name: {
                "sourceField": source_name,
                "sourcePointer": _append_pointer(pointer, source_name),
                "value": copy.deepcopy(raw_context[context_name]),
            }
            for (
                output_name,
                context_name,
                source_name,
            ) in CONTEXT_QUALIFIER_FIELDS
            if context_name in raw_context
        }
        parent_source_id = container.get("parentContainerId")
        contexts.append(
            {
                "id": context_id_by_container_id[source_container_id],
                "sourceContainerId": source_container_id,
                "characterId": container.get("characterId"),
                "abilityType": container.get("abilityType"),
                "containerType": container.get("containerType"),
                "parentContextId": context_id_by_container_id.get(
                    parent_source_id
                ),
                "order": container.get("order"),
                "classification": container.get("classification"),
                "technicalKey": raw_context.get("technicalKey"),
                "execution": {
                    "trigger": copy.deepcopy(raw_context.get("exec")),
                    "triggerFor": copy.deepcopy(raw_context.get("execFor")),
                    "values": values,
                    "flags": flags,
                    "qualifiers": qualifiers,
                    "raw": raw_context,
                },
                "conditions": _normalize_condition_records(
                    container.get("conditions")
                ),
                "source": source,
            }
        )
    return contexts, context_id_by_container_id


def _normalize_effects(
    mechanics: dict[str, Any],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for effect in mechanics["effects"]:
        if not isinstance(effect, dict):
            continue
        records.append(
            {
                "id": effect.get("id"),
                "effectId": effect.get("procId"),
                "category": copy.deepcopy(effect.get("category")),
                "type": copy.deepcopy(effect.get("type")),
                "state": copy.deepcopy(effect.get("state")),
                "expirationType": copy.deepcopy(effect.get("expirationType")),
                "relations": {
                    "opposite": copy.deepcopy(effect.get("opposite")),
                    "weak": copy.deepcopy(effect.get("weak")),
                    "strong": copy.deepcopy(effect.get("strong")),
                },
                "source": copy.deepcopy(effect.get("source")),
                "raw": copy.deepcopy(effect.get("raw")),
            }
        )
    return records


def _is_playable_ability_type(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    if value in PLAYABLE_ABILITY_BASE_TYPES:
        return True
    if not value.endswith("_empower"):
        return False
    return value.removesuffix("_empower") in PLAYABLE_ABILITY_BASE_TYPES


def _normalize_abilities(
    contexts: list[dict[str, Any]],
    operations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    context_by_id = {
        item["id"]: item
        for item in contexts
        if isinstance(item.get("id"), str)
    }

    def belongs_to_root(context_id: Any, root_context_id: str) -> bool:
        visited: set[str] = set()
        current = context_id
        while isinstance(current, str) and current not in visited:
            if current == root_context_id:
                return True
            visited.add(current)
            context = context_by_id.get(current)
            if context is None:
                return False
            current = context.get("parentContextId")
        return False

    abilities: list[dict[str, Any]] = []
    for context in contexts:
        if context.get("containerType") != "ability":
            continue
        ability_type = context.get("abilityType")
        if not _is_playable_ability_type(ability_type):
            continue
        root_context_id = context.get("id")
        source_container_id = context.get("sourceContainerId")
        if not all(
            isinstance(value, str)
            for value in (
                root_context_id,
                source_container_id,
                ability_type,
            )
        ):
            continue
        context_ids = [
            item["id"]
            for item in contexts
            if isinstance(item.get("id"), str)
            and belongs_to_root(item["id"], root_context_id)
        ]
        operation_ids = [
            item["id"]
            for item in operations
            if isinstance(item.get("id"), str)
            and root_context_id in item.get("contextPathIds", [])
        ]
        abilities.append(
            {
                "id": _deterministic_id(
                    "abl", f"ability|{source_container_id}"
                ),
                "characterId": context.get("characterId"),
                "abilityType": ability_type,
                "rootContextId": root_context_id,
                "contextIds": context_ids,
                "operationIds": operation_ids,
                "source": copy.deepcopy(context.get("source")),
            }
        )
    return abilities


def _canonical_action_type(raw_type: Any) -> Any:
    return raw_type.lower() if isinstance(raw_type, str) else copy.deepcopy(
        raw_type
    )


def _build_action_mappings(
    mechanics: dict[str, Any],
    operations: list[dict[str, Any]],
    context_id_by_container_id: dict[str, str],
    builder: "OperationBuilder",
    contexts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    operation_ids_by_action: dict[str, list[str]] = {}
    for operation in operations:
        source_action_id = operation.get("sourceActionId")
        operation_id = operation.get("id")
        if not all(
            isinstance(value, str)
            for value in (source_action_id, operation_id)
        ):
            continue
        operation_ids_by_action.setdefault(source_action_id, []).append(
            operation_id
        )

    context_by_id = {
        item["id"]: item
        for item in contexts
        if isinstance(item.get("id"), str)
    }
    controlled_parameter_names = {
        "recipient",
        "action_cond",
        "arbitrary_action_idx",
        "use_previous_result",
        "foreach_action",
        *(source_name for _, source_name in BOOLEAN_FLAG_FIELDS),
    }

    def progression_records(
        value: Any,
        pointer: str,
        field: str,
    ) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        if isinstance(value, list):
            records.append(
                normalize_progression(
                    value,
                    source_field=field,
                    source_pointer=pointer,
                )
            )
            for index, child in enumerate(value):
                records.extend(
                    progression_records(
                        child,
                        _append_pointer(pointer, index),
                        f"{field}/{index}",
                    )
                )
        elif isinstance(value, dict):
            for key, child in value.items():
                records.extend(
                    progression_records(
                        child,
                        _append_pointer(pointer, key),
                        f"{field}/{key}",
                    )
                )
        return records

    mappings: list[dict[str, Any]] = []
    for action in mechanics["actions"]:
        if not isinstance(action, dict):
            continue
        source_action_id = action.get("id")
        if not isinstance(source_action_id, str):
            continue
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        operation_ids = operation_ids_by_action.get(source_action_id, [])
        context_id = context_id_by_container_id.get(action.get("containerId"))
        context = context_by_id.get(context_id, {})
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        recipient_present = "recipient" in parameters
        action_pointer = str(source.get("pointer", ""))
        remaining_parameters = {
            key: copy.deepcopy(value)
            for key, value in parameters.items()
            if key not in controlled_parameter_names
        }
        progressions: list[dict[str, Any]] = []
        for key, value in remaining_parameters.items():
            progressions.extend(
                progression_records(
                    value,
                    _append_pointer(action_pointer, key),
                    key,
                )
            )
        mappings.append(
            {
                "sourceActionId": source_action_id,
                "characterId": action.get("characterId"),
                "abilityType": action.get("abilityType"),
                "contextId": context_id,
                "contextPathIds": builder._context_path(
                    action.get("containerId")
                ),
                "actionOrder": action.get("order"),
                "classification": context.get("classification"),
                "containerType": context.get("containerType"),
                "technicalKey": context.get("technicalKey"),
                "rawSourceActionType": copy.deepcopy(
                    action.get("rawType")
                ),
                "sourceActionType": _canonical_action_type(
                    action.get("rawType")
                ),
                "status": (
                    "normalized"
                    if operation_ids
                    else "preserved_uninterpreted"
                ),
                "operationIds": list(operation_ids),
                "target": {
                    "present": bool(action.get("targetPresent")),
                    "value": copy.deepcopy(action.get("target")),
                },
                "recipient": {
                    "present": recipient_present,
                    "value": copy.deepcopy(parameters.get("recipient")),
                },
                "conditions": _normalize_condition_records(
                    action.get("conditions")
                ),
                "control": builder._control(action),
                "flags": builder._flags(
                    action,
                    entry=None,
                    entry_pointer=action_pointer,
                ),
                "source": {
                    "file": str(source.get("file", "<generated>")),
                    "pointer": str(source.get("pointer", "")),
                },
                "uninterpretedParameters": {
                    "values": remaining_parameters,
                    "progressions": progressions,
                },
            }
        )
    return mappings


def _source_record_containing(
    records: list[dict[str, Any]],
    *,
    source_file: str,
    source_pointer: str,
) -> dict[str, Any] | None:
    matches: list[tuple[int, dict[str, Any]]] = []
    for record in records:
        source = record.get("source")
        if not isinstance(source, dict):
            continue
        pointer = source.get("pointer")
        if source.get("file") != source_file or not isinstance(pointer, str):
            continue
        if source_pointer == pointer or source_pointer.startswith(
            f"{pointer}/"
        ):
            matches.append((len(pointer), record))
    if not matches:
        return None
    return max(matches, key=lambda item: item[0])[1]


def _collect_controlled_alias_resolutions(
    mechanics: dict[str, Any],
    effects: list[dict[str, Any]],
    context_id_by_container_id: dict[str, str],
) -> list[dict[str, Any]]:
    source_actions = [
        item for item in mechanics["actions"] if isinstance(item, dict)
    ]
    source_containers = [
        item for item in mechanics["containers"] if isinstance(item, dict)
    ]
    effect_by_id = {
        item["effectId"]: item
        for item in effects
        if isinstance(item.get("effectId"), str)
    }
    resolutions: list[dict[str, Any]] = []
    for reference in iter_mechanics_effect_identifiers(
        mechanics,
        append_pointer=_append_pointer,
    ):
        raw_value = reference["rawValue"]
        if raw_value not in EFFECT_ID_ALIASES:
            continue
        resolution = resolve_effect_identifier(raw_value)
        source = reference["source"]
        action = _source_record_containing(
            source_actions,
            source_file=source["file"],
            source_pointer=source["pointer"],
        )
        container = _source_record_containing(
            source_containers,
            source_file=source["file"],
            source_pointer=source["pointer"],
        )
        source_container_id = (
            action.get("containerId")
            if action is not None
            else (
                container.get("id") if container is not None else None
            )
        )
        catalog = effect_by_id.get(resolution["resolvedValue"])
        resolutions.append(
            {
                **resolution,
                "resolved": catalog is not None,
                "catalogEffectId": (
                    catalog.get("id") if catalog is not None else None
                ),
                "characterId": (
                    action.get("characterId")
                    if action is not None
                    else reference.get("characterId")
                ),
                "abilityType": (
                    action.get("abilityType")
                    if action is not None
                    else reference.get("abilityType")
                ),
                "contextId": context_id_by_container_id.get(
                    source_container_id
                ),
                "sourceActionId": (
                    action.get("id")
                    if action is not None
                    else reference.get("sourceActionId")
                ),
                "source": copy.deepcopy(source),
            }
        )
    resolutions.sort(
        key=lambda item: (
            str(item["source"].get("file", "")),
            str(item["source"].get("pointer", "")),
            str(item.get("rawValue", "")),
        )
    )
    return resolutions


class OperationBuilder:
    def __init__(
        self,
        mechanics: dict[str, Any],
        contexts: list[dict[str, Any]],
        context_id_by_container_id: dict[str, str],
        effects: list[dict[str, Any]],
    ) -> None:
        self.mechanics = mechanics
        self.contexts = contexts
        self.context_id_by_container_id = context_id_by_container_id
        self.effect_by_id = {
            item["effectId"]: item
            for item in effects
            if isinstance(item.get("effectId"), str)
        }
        self.container_by_id = {
            item["id"]: item
            for item in mechanics["containers"]
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        self.action_by_container_order = {
            (item.get("containerId"), item.get("order")): item.get("id")
            for item in mechanics["actions"]
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        self.operations: list[dict[str, Any]] = []
        self.diagnostics: list[dict[str, Any]] = []
        self.supported_action_ids: set[str] = set()
        self._claimed_ids: dict[str, str] = {}
        self._diagnostic_keys: set[tuple[Any, ...]] = set()
        self._control_cache: dict[str, dict[str, Any]] = {}

    def _claim_operation_id(self, canonical: str) -> str:
        identifier = _deterministic_id("op", canonical)
        existing = self._claimed_ids.get(identifier)
        if existing is not None and existing != canonical:
            raise NormalizerError(
                "INTERNAL_AUDIT_MISMATCH",
                (
                    f"Collision d’identifiant normalisé {identifier} entre "
                    f"{existing!r} et {canonical!r}."
                ),
            )
        if existing is not None:
            raise NormalizerError(
                "INTERNAL_AUDIT_MISMATCH",
                f"Opération normalisée dupliquée : {canonical!r}.",
            )
        self._claimed_ids[identifier] = canonical
        return identifier

    def _add_diagnostic_once(
        self,
        key: tuple[Any, ...],
        item: dict[str, Any],
    ) -> None:
        if key in self._diagnostic_keys:
            return
        self._diagnostic_keys.add(key)
        self.diagnostics.append(item)

    def _context_path(self, source_container_id: Any) -> list[str]:
        path: list[str] = []
        visited: set[str] = set()
        current = source_container_id
        while isinstance(current, str) and current not in visited:
            visited.add(current)
            context_id = self.context_id_by_container_id.get(current)
            if context_id is not None:
                path.append(context_id)
            container = self.container_by_id.get(current)
            if container is None:
                break
            current = container.get("parentContainerId")
        path.reverse()
        return path

    def _control(self, action: dict[str, Any]) -> dict[str, Any]:
        action_id = action.get("id")
        if isinstance(action_id, str) and action_id in self._control_cache:
            return copy.deepcopy(self._control_cache[action_id])

        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        condition = parameters.get("action_cond")
        arbitrary_index = parameters.get("arbitrary_action_idx")
        depends_on_action_id: Any = None
        reference_kind = "none"

        if condition in PREVIOUS_ACTION_CONDITIONS:
            reference_kind = "previous_action"
            order = action.get("order")
            if isinstance(order, int):
                depends_on_action_id = self.action_by_container_order.get(
                    (action.get("containerId"), order - 1)
                )
        elif condition == "if_arbitrary_action_ran" or (
            condition is None and arbitrary_index is not None
        ):
            reference_kind = "explicit_action_index"
            if isinstance(arbitrary_index, int):
                depends_on_action_id = self.action_by_container_order.get(
                    (action.get("containerId"), arbitrary_index)
                )
        elif condition not in (None, "always"):
            reference_kind = "result_state"

        should_resolve = reference_kind in {
            "previous_action",
            "explicit_action_index",
        }
        if should_resolve and depends_on_action_id is None:
            source = action.get("source")
            if not isinstance(source, dict):
                source = {}
            self._add_diagnostic_once(
                (
                    "DANGLING_ACTION_DEPENDENCY",
                    action_id,
                    condition,
                    arbitrary_index,
                ),
                diagnostic(
                    severity="warning",
                    code="DANGLING_ACTION_DEPENDENCY",
                    message=(
                        "Dépendance d’action conservée mais cible non résolue."
                    ),
                    character_id=action.get("characterId"),
                    ability_type=action.get("abilityType"),
                    context_id=self.context_id_by_container_id.get(
                        action.get("containerId")
                    ),
                    source_action_id=(
                        action_id if isinstance(action_id, str) else None
                    ),
                    source_file=str(source.get("file", "<generated>")),
                    source_pointer=str(source.get("pointer", "")),
                    raw={
                        "actionCondition": condition,
                        "arbitraryActionIndex": arbitrary_index,
                    },
                ),
            )

        control = {
            "actionCondition": copy.deepcopy(condition),
            "referenceKind": reference_kind,
            "arbitraryActionIndex": copy.deepcopy(arbitrary_index),
            "dependsOnActionId": depends_on_action_id,
            "usePreviousResult": copy.deepcopy(
                parameters.get("use_previous_result")
            ),
            "foreachAction": copy.deepcopy(parameters.get("foreach_action")),
        }
        if isinstance(action_id, str):
            self._control_cache[action_id] = copy.deepcopy(control)
        return control

    def _effect_entries(
        self,
        action: dict[str, Any],
        *,
        field: str,
        value: Any,
    ) -> list[dict[str, Any]]:
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        field_pointer = _append_pointer(action_pointer, field)
        action_id = action.get("id")

        def invalid(pointer: str, raw: Any) -> None:
            self._add_diagnostic_once(
                (
                    "UNSUPPORTED_EFFECT_REFERENCE_SHAPE",
                    action_id,
                    pointer,
                ),
                diagnostic(
                    severity="warning",
                    code="UNSUPPORTED_EFFECT_REFERENCE_SHAPE",
                    message=(
                        "Forme de référence d’effet non reconnue ; "
                        "l’opération reste générique."
                    ),
                    character_id=action.get("characterId"),
                    ability_type=action.get("abilityType"),
                    context_id=self.context_id_by_container_id.get(
                        action.get("containerId")
                    ),
                    source_action_id=(
                        action_id if isinstance(action_id, str) else None
                    ),
                    source_file=str(source.get("file", "<generated>")),
                    source_pointer=pointer,
                    raw=raw,
                ),
            )

        def one_entry(
            item: Any,
            *,
            entry_pointer: str,
        ) -> dict[str, Any]:
            if isinstance(item, str):
                return {
                    "effectId": item,
                    "effectPointer": entry_pointer,
                    "entryPointer": entry_pointer,
                    "entry": copy.deepcopy(item),
                }
            if isinstance(item, dict) and isinstance(item.get("proc"), str):
                return {
                    "effectId": item["proc"],
                    "effectPointer": _append_pointer(entry_pointer, "proc"),
                    "entryPointer": entry_pointer,
                    "entry": copy.deepcopy(item),
                }
            invalid(entry_pointer, item)
            return {
                "effectId": None,
                "effectPointer": entry_pointer,
                "entryPointer": entry_pointer,
                "entry": copy.deepcopy(item),
            }

        if isinstance(value, list):
            if not value:
                invalid(field_pointer, value)
                return [
                    {
                        "effectId": None,
                        "effectPointer": field_pointer,
                        "entryPointer": field_pointer,
                        "entry": [],
                    }
                ]
            return [
                one_entry(
                    item,
                    entry_pointer=_append_pointer(field_pointer, index),
                )
                for index, item in enumerate(value)
            ]
        if isinstance(value, (str, dict)):
            return [one_entry(value, entry_pointer=field_pointer)]

        invalid(field_pointer, value)
        return [
            {
                "effectId": None,
                "effectPointer": field_pointer,
                "entryPointer": field_pointer,
                "entry": copy.deepcopy(value),
            }
        ]

    def _selector(
        self,
        parameters: dict[str, Any],
        *,
        source_field: str | None,
        explicit: bool,
    ) -> dict[str, Any]:
        exclusions: list[dict[str, Any]] = []
        for field in ("exceptprocs", "exclude"):
            if field not in parameters:
                continue
            raw = parameters[field]
            if isinstance(raw, list):
                effect_ids = [
                    item for item in raw if isinstance(item, str)
                ]
            elif isinstance(raw, str):
                effect_ids = [raw]
            else:
                effect_ids = []
            exclusions.append(
                {
                    "sourceField": field,
                    "effectIds": effect_ids,
                    "raw": copy.deepcopy(raw),
                }
            )
        return {
            "mode": "explicit" if explicit else "generic",
            "sourceField": source_field,
            "category": copy.deepcopy(parameters.get("category")),
            "exclusions": exclusions,
            "oppositeOverride": copy.deepcopy(
                parameters.get("opposite_override")
            ),
        }

    def _metrics(
        self,
        action: dict[str, Any],
        *,
        entry: dict[str, Any] | None,
        entry_pointer: str,
        metric_fields: tuple[tuple[str, str], ...] = METRIC_FIELDS,
    ) -> dict[str, Any]:
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        metrics = {
            output_name: normalize_progression(
                parameters[source_name],
                source_field=source_name,
                source_pointer=_append_pointer(action_pointer, source_name),
            )
            for output_name, source_name in metric_fields
            if source_name in parameters
        }
        if isinstance(entry, dict):
            for output_name, source_name in ENTRY_METRIC_FIELDS:
                if source_name not in entry:
                    continue
                metrics[output_name] = normalize_progression(
                    entry[source_name],
                    source_field=source_name,
                    source_pointer=_append_pointer(
                        entry_pointer, source_name
                    ),
                )
        return metrics

    def _flags(
        self,
        action: dict[str, Any],
        *,
        entry: dict[str, Any] | None,
        entry_pointer: str,
    ) -> dict[str, Any]:
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        action_id = action.get("id")
        flags: dict[str, Any] = {}
        for output_name, source_name in BOOLEAN_FLAG_FIELDS:
            if source_name not in parameters:
                continue
            record = normalize_boolean_record(
                parameters[source_name],
                source_field=source_name,
                source_pointer=_append_pointer(action_pointer, source_name),
            )
            flags[output_name] = record
            if not record["valid"]:
                self._add_diagnostic_once(
                    (
                        "INVALID_BOOLEAN_VALUE",
                        action_id,
                        source_name,
                    ),
                    diagnostic(
                        severity="warning",
                        code="INVALID_BOOLEAN_VALUE",
                        message=(
                            f"Valeur booléenne non reconnue pour "
                            f"{source_name}."
                        ),
                        character_id=action.get("characterId"),
                        ability_type=action.get("abilityType"),
                        context_id=self.context_id_by_container_id.get(
                            action.get("containerId")
                        ),
                        source_action_id=(
                            action_id if isinstance(action_id, str) else None
                        ),
                        source_file=str(
                            source.get("file", "<generated>")
                        ),
                        source_pointer=record["sourcePointer"],
                        raw={"value": parameters[source_name]},
                    ),
                )
        if isinstance(entry, dict):
            for output_name, source_name in ENTRY_BOOLEAN_FLAG_FIELDS:
                if source_name not in entry:
                    continue
                record = normalize_boolean_record(
                    entry[source_name],
                    source_field=source_name,
                    source_pointer=_append_pointer(
                        entry_pointer, source_name
                    ),
                )
                flags[output_name] = record
                if not record["valid"]:
                    self._add_diagnostic_once(
                        (
                            "INVALID_BOOLEAN_VALUE",
                            action_id,
                            entry_pointer,
                            source_name,
                        ),
                        diagnostic(
                            severity="warning",
                            code="INVALID_BOOLEAN_VALUE",
                            message=(
                                f"Valeur booléenne non reconnue pour "
                                f"{source_name}."
                            ),
                            character_id=action.get("characterId"),
                            ability_type=action.get("abilityType"),
                            context_id=self.context_id_by_container_id.get(
                                action.get("containerId")
                            ),
                            source_action_id=(
                                action_id
                                if isinstance(action_id, str)
                                else None
                            ),
                            source_file=str(
                                source.get("file", "<generated>")
                            ),
                            source_pointer=record["sourcePointer"],
                            raw={"value": entry[source_name]},
                        ),
                    )
        return flags

    def _effect_reference(
        self,
        action: dict[str, Any],
        *,
        operation_id: str,
        namespace: str,
        effect_id: str | None,
        effect_pointer: str,
    ) -> dict[str, Any] | None:
        if effect_id is None:
            return None
        resolution = resolve_effect_identifier(effect_id)
        resolved_value = resolution["resolvedValue"]
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        reference_source = {
            "file": str(source.get("file", "<generated>")),
            "pointer": effect_pointer,
        }
        if namespace == "battlefield":
            return {
                "namespace": "battlefield",
                "effectId": resolved_value,
                **resolution,
                "catalogEffectId": None,
                "catalogCategory": None,
                "resolved": None,
                "source": reference_source,
            }

        catalog = self.effect_by_id.get(resolved_value)
        resolved = catalog is not None
        if not resolved:
            self._add_diagnostic_once(
                (
                    "UNRESOLVED_EFFECT_REFERENCE",
                    action.get("id"),
                    effect_pointer,
                    effect_id,
                ),
                diagnostic(
                    severity="warning",
                    code="UNRESOLVED_EFFECT_REFERENCE",
                    message=(
                        f"Référence d’effet absente du catalogue : "
                        f"{resolved_value}."
                    ),
                    character_id=action.get("characterId"),
                    ability_type=action.get("abilityType"),
                    context_id=self.context_id_by_container_id.get(
                        action.get("containerId")
                    ),
                    source_action_id=action.get("id"),
                    operation_id=operation_id,
                    source_file=str(source.get("file", "<generated>")),
                    source_pointer=effect_pointer,
                    raw={
                        "rawValue": effect_id,
                        "resolvedValue": resolved_value,
                    },
                ),
            )
        return {
            "namespace": "proc",
            "effectId": resolved_value,
            **resolution,
            "catalogEffectId": catalog.get("id") if catalog else None,
            "catalogCategory": (
                copy.deepcopy(catalog.get("category"))
                if catalog
                else None
            ),
            "resolved": resolved,
            "source": reference_source,
        }

    def _build_operation(
        self,
        action: dict[str, Any],
        *,
        kind: str,
        canonical_action_type: str,
        source_field: str | None,
        effect_id: str | None,
        effect_pointer: str,
        entry_pointer: str,
        entry: Any,
        ordinal: int,
        namespace: str = "proc",
        scope: dict[str, Any] | None = None,
        extra_conditions: list[dict[str, Any]] | None = None,
        metric_fields: tuple[tuple[str, str], ...] = METRIC_FIELDS,
    ) -> None:
        source = action.get("source")
        if not isinstance(source, dict):
            source = {"file": "<generated>", "pointer": ""}
        action_pointer = str(source.get("pointer", ""))
        source_action_id = str(action.get("id"))
        canonical = (
            f"operation|{source_action_id}|{kind}|"
            f"{effect_pointer}|{ordinal}"
        )
        operation_id = self._claim_operation_id(canonical)
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        entry_object = entry if isinstance(entry, dict) else None
        conditions = _normalize_condition_records(action.get("conditions"))
        if extra_conditions:
            conditions.extend(copy.deepcopy(extra_conditions))
        context_id = self.context_id_by_container_id.get(
            action.get("containerId")
        )
        selector = self._selector(
            parameters,
            source_field=source_field,
            explicit=effect_id is not None,
        )
        effect = self._effect_reference(
            action,
            operation_id=operation_id,
            namespace=namespace,
            effect_id=effect_id,
            effect_pointer=effect_pointer,
        )
        target_present = bool(action.get("targetPresent"))
        recipient_present = "recipient" in parameters
        operation = {
            "id": operation_id,
            "kind": kind,
            "characterId": action.get("characterId"),
            "abilityType": action.get("abilityType"),
            "contextId": context_id,
            "contextPathIds": self._context_path(
                action.get("containerId")
            ),
            "sourceActionId": action.get("id"),
            "sourceActionType": canonical_action_type,
            "rawSourceActionType": copy.deepcopy(action.get("rawType")),
            "actionOrder": action.get("order"),
            "effect": effect,
            "selector": selector,
            "scope": copy.deepcopy(
                scope if scope is not None else {"kind": "action_target"}
            ),
            "target": {
                "present": target_present,
                "value": copy.deepcopy(action.get("target")),
            },
            "recipient": {
                "present": recipient_present,
                "value": copy.deepcopy(parameters.get("recipient")),
            },
            "conditions": conditions,
            "control": self._control(action),
            "metrics": self._metrics(
                action,
                entry=entry_object,
                entry_pointer=entry_pointer,
                metric_fields=metric_fields,
            ),
            "flags": self._flags(
                action,
                entry=entry_object,
                entry_pointer=entry_pointer,
            ),
            "source": {
                "file": str(source.get("file", "<generated>")),
                "actionPointer": action_pointer,
                "valuePointer": effect_pointer,
            },
            "rawParameters": copy.deepcopy(parameters),
            "rawEffectEntry": copy.deepcopy(entry),
        }
        self.operations.append(operation)

    def _build_effect_action(
        self,
        action: dict[str, Any],
        canonical_action_type: str,
    ) -> None:
        source_action_id = action.get("id")
        if isinstance(source_action_id, str):
            self.supported_action_ids.add(source_action_id)
        kind, selector_fields = EFFECT_ACTION_SPECS[
            canonical_action_type
        ]
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))

        source_field = next(
            (field for field in selector_fields if field in parameters),
            None,
        )
        if source_field is None:
            entries = [
                {
                    "effectId": None,
                    "effectPointer": action_pointer,
                    "entryPointer": action_pointer,
                    "entry": None,
                }
            ]
        else:
            entries = self._effect_entries(
                action,
                field=source_field,
                value=parameters[source_field],
            )

        for ordinal, effect_entry in enumerate(entries):
            entry = effect_entry["entry"]
            extra_conditions: list[dict[str, Any]] = []
            if isinstance(entry, dict) and "apply_if" in entry:
                extra_conditions.append(
                    _condition_record(
                        kind="apply_if",
                        raw=entry["apply_if"],
                        source_file=str(
                            source.get("file", "<generated>")
                        ),
                        source_pointer=_append_pointer(
                            effect_entry["entryPointer"], "apply_if"
                        ),
                    )
                )
            self._build_operation(
                action,
                kind=kind,
                canonical_action_type=canonical_action_type,
                source_field=source_field,
                effect_id=effect_entry["effectId"],
                effect_pointer=effect_entry["effectPointer"],
                entry_pointer=effect_entry["entryPointer"],
                entry=entry,
                ordinal=ordinal,
                extra_conditions=extra_conditions,
            )

    def _build_ability_energy_action(
        self,
        action: dict[str, Any],
    ) -> None:
        source_action_id = action.get("id")
        if isinstance(source_action_id, str):
            self.supported_action_ids.add(source_action_id)
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        self._build_operation(
            action,
            kind="ability_energy_generate",
            canonical_action_type="ability_energy",
            source_field=None,
            effect_id=None,
            effect_pointer=action_pointer,
            entry_pointer=action_pointer,
            entry=None,
            ordinal=0,
            scope={"kind": "ability_energy_recipient"},
            metric_fields=ABILITY_ENERGY_METRIC_FIELDS,
        )

    def _build_turn_meter_action(
        self,
        action: dict[str, Any],
    ) -> None:
        source_action_id = action.get("id")
        if isinstance(source_action_id, str):
            self.supported_action_ids.add(source_action_id)
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        self._build_operation(
            action,
            kind="turn_meter_modify",
            canonical_action_type="turn_meter",
            source_field=None,
            effect_id=None,
            effect_pointer=action_pointer,
            entry_pointer=action_pointer,
            entry=None,
            ordinal=0,
            scope={"kind": "action_target"},
            metric_fields=TURN_METER_METRIC_FIELDS,
        )

    def _build_heal_action(
        self,
        action: dict[str, Any],
    ) -> None:
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        self._build_operation(
            action,
            kind="heal_restore",
            canonical_action_type="heal",
            source_field=None,
            effect_id=None,
            effect_pointer=action_pointer,
            entry_pointer=action_pointer,
            entry=None,
            ordinal=0,
            scope={"kind": "action_target"},
            metric_fields=HEAL_METRIC_FIELDS,
        )

    def _build_battlefield_action(
        self,
        action: dict[str, Any],
        canonical_action_type: str,
    ) -> None:
        source_action_id = action.get("id")
        if isinstance(source_action_id, str):
            self.supported_action_ids.add(source_action_id)
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        is_set = canonical_action_type == "set_battlefield_effect"
        effect_id = (
            parameters.get("effect_id")
            if isinstance(parameters.get("effect_id"), str)
            else None
        )
        source_field = "effect_id" if is_set and "effect_id" in parameters else None
        effect_pointer = (
            _append_pointer(action_pointer, "effect_id")
            if source_field
            else action_pointer
        )
        self._build_operation(
            action,
            kind=(
                "battlefield_effect_set"
                if is_set
                else "battlefield_effect_clear"
            ),
            canonical_action_type=canonical_action_type,
            source_field=source_field,
            effect_id=effect_id,
            effect_pointer=effect_pointer,
            entry_pointer=effect_pointer,
            entry=effect_id,
            ordinal=0,
            namespace="battlefield",
            scope={"kind": "battlefield"},
        )

    def _build_explicit_action_operation(
        self,
        action: dict[str, Any],
        *,
        kind: str,
        canonical_action_type: str,
        scope_kind: str,
    ) -> None:
        source_action_id = action.get("id")
        if isinstance(source_action_id, str):
            self.supported_action_ids.add(source_action_id)
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        self._build_operation(
            action,
            kind=kind,
            canonical_action_type=canonical_action_type,
            source_field=None,
            effect_id=None,
            effect_pointer=action_pointer,
            entry_pointer=action_pointer,
            entry=None,
            ordinal=0,
            scope={"kind": scope_kind},
        )

    def _build_spawn_effects(
        self,
        action: dict[str, Any],
    ) -> None:
        parameters = action.get("parameters")
        if not isinstance(parameters, dict):
            return
        pool = parameters.get("pool")
        if not isinstance(pool, list):
            return
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        action_pointer = str(source.get("pointer", ""))
        source_file = str(source.get("file", "<generated>"))
        pool_entries = [
            (index, item)
            for index, item in enumerate(pool)
            if isinstance(item, dict) and "procs" in item
        ]
        if not pool_entries:
            return
        source_action_id = action.get("id")
        if isinstance(source_action_id, str):
            self.supported_action_ids.add(source_action_id)

        operation_ordinal = 0
        for pool_index, pool_entry in pool_entries:
            field = "procs"
            pool_pointer = _append_pointer(
                action_pointer, "pool", pool_index
            )
            proxy_action = copy.deepcopy(action)
            proxy_action["source"] = {
                "file": source_file,
                "pointer": pool_pointer,
            }
            entries = self._effect_entries(
                proxy_action,
                field=field,
                value=pool_entry[field],
            )
            for effect_entry in entries:
                entry = effect_entry["entry"]
                extra_conditions: list[dict[str, Any]] = []
                if isinstance(entry, dict) and "apply_if" in entry:
                    extra_conditions.append(
                        _condition_record(
                            kind="apply_if",
                            raw=entry["apply_if"],
                            source_file=source_file,
                            source_pointer=_append_pointer(
                                effect_entry["entryPointer"], "apply_if"
                            ),
                        )
                    )
                apply_to_spawned = None
                if isinstance(entry, dict) and "apply_to_spawned" in entry:
                    flag = normalize_boolean_record(
                        entry["apply_to_spawned"],
                        source_field="apply_to_spawned",
                        source_pointer=_append_pointer(
                            effect_entry["entryPointer"],
                            "apply_to_spawned",
                        ),
                    )
                    apply_to_spawned = flag["value"]
                self._build_operation(
                    action,
                    kind="effect_apply",
                    canonical_action_type="spawn",
                    source_field="pool.procs",
                    effect_id=effect_entry["effectId"],
                    effect_pointer=effect_entry["effectPointer"],
                    entry_pointer=effect_entry["entryPointer"],
                    entry=entry,
                    ordinal=operation_ordinal,
                    scope={
                        "kind": "spawn_pool",
                        "poolIndex": pool_index,
                        "spawnedCharacterId": copy.deepcopy(
                            pool_entry.get("character")
                        ),
                        "applyToSpawned": apply_to_spawned,
                    },
                    extra_conditions=extra_conditions,
                )
                operation_ordinal += 1

    def build(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]], set[str]]:
        action_rank = {
            item.get("id"): index
            for index, item in enumerate(self.mechanics["actions"])
            if isinstance(item, dict)
        }
        for action in self.mechanics["actions"]:
            if not isinstance(action, dict):
                continue
            raw_type = action.get("rawType")
            if not isinstance(raw_type, str):
                continue
            canonical_action_type = raw_type.lower()
            if canonical_action_type in EFFECT_ACTION_SPECS:
                self._build_effect_action(action, canonical_action_type)
            elif canonical_action_type == "ability_energy":
                self._build_ability_energy_action(action)
            elif canonical_action_type == "turn_meter":
                self._build_turn_meter_action(action)
            elif canonical_action_type == "heal":
                self._build_heal_action(action)
            elif canonical_action_type in {
                "set_battlefield_effect",
                "clear_battlefield_effect",
            }:
                self._build_battlefield_action(
                    action, canonical_action_type
                )
            elif canonical_action_type == "spawn":
                self._build_explicit_action_operation(
                    action,
                    kind="spawn",
                    canonical_action_type=canonical_action_type,
                    scope_kind="spawn_invocation",
                )
                self._build_spawn_effects(action)
            elif canonical_action_type in {"empower", "empty_result"}:
                self._build_explicit_action_operation(
                    action,
                    kind=canonical_action_type,
                    canonical_action_type=canonical_action_type,
                    scope_kind=(
                        "action_target"
                        if canonical_action_type == "empower"
                        else "control"
                    ),
                )

        self.operations.sort(
            key=lambda item: (
                action_rank.get(
                    item.get("sourceActionId"), len(action_rank)
                ),
                str(item.get("source", {}).get("valuePointer", "")),
                str(item.get("kind", "")),
                str(item.get("id", "")),
            )
        )
        return (
            self.operations,
            self.diagnostics,
            self.supported_action_ids,
        )


def normalize_mechanics(
    mechanics: dict[str, Any],
    *,
    mechanics_payload: bytes | None = None,
) -> dict[str, Any]:
    validated = _validate_mechanics(mechanics)
    snapshot = copy.deepcopy(validated)
    if mechanics_payload is None:
        mechanics_payload = _canonical_json_payload(validated)
    mechanics_checksum = hashlib.sha256(mechanics_payload).hexdigest()

    characters = _normalize_characters(validated)
    contexts, context_id_by_container_id = _normalize_contexts(validated)
    effects = _normalize_effects(validated)
    builder = OperationBuilder(
        validated,
        contexts,
        context_id_by_container_id,
        effects,
    )
    operations, diagnostics, supported_action_ids = builder.build()
    abilities = _normalize_abilities(contexts, operations)
    action_mappings = _build_action_mappings(
        validated,
        operations,
        context_id_by_container_id,
        builder,
        contexts,
    )
    controlled_alias_resolutions = (
        _collect_controlled_alias_resolutions(
            validated,
            effects,
            context_id_by_container_id,
        )
    )

    capabilities: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "input": {
            "parserSchemaVersion": validated["schemaVersion"],
            "mechanicsChecksum": f"sha256:{mechanics_checksum}",
            "sources": copy.deepcopy(validated["sources"]),
        },
        "effectIdAliasPolicy": alias_policy_record(),
        "characters": characters,
        "abilities": abilities,
        "contexts": contexts,
        "actionMappings": action_mappings,
        "effects": effects,
        "operations": operations,
        "controlledAliasResolutions": controlled_alias_resolutions,
        "inputDiagnostics": copy.deepcopy(validated["diagnostics"]),
        "diagnostics": diagnostics,
        "audit": {},
    }
    audit_result = audit_capabilities(
        capabilities,
        validated,
        supported_action_ids=supported_action_ids,
        input_unchanged=validated == snapshot,
    )
    capabilities["diagnostics"] = audit_result.diagnostics
    capabilities["audit"] = audit_result.audit

    if audit_result.has_errors:
        first_error = next(
            item
            for item in audit_result.diagnostics
            if item.get("severity") == "error"
        )
        raise NormalizerError(
            str(first_error.get("code", "INTERNAL_AUDIT_MISMATCH")),
            str(
                first_error.get(
                    "message", "Erreur bloquante du normaliseur."
                )
            ),
            diagnostics=audit_result.diagnostics,
        )
    return capabilities


def serialize_capabilities(capabilities: dict[str, Any]) -> bytes:
    return _canonical_json_payload(capabilities)
