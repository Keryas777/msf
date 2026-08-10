"""Conservative AbilityPresentation construction for Codex MSF B2.

The phase graph built here is presentation-only.  It never rewrites an
upstream action, completes an absent target, interprets ``count`` or turns an
official sentence into a normalized gameplay operation.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Any, Iterable, Mapping

from .presentation import (
    ACTION_PRESENTATIONS,
    EFFECT_PRESENTATIONS,
    MODE_LABELS,
    OPERATION_KINDS,
    SIDE_LABELS,
    TRIGGER_LABELS,
)


ABILITY_PRESENTATION_SCHEMA_VERSION = "2.0.0"

ASSERTION_EVIDENCE = frozenset(
    {
        "mechanically_verified",
        "mechanically_preserved",
        "official_text_asserted",
        "aligned_high",
        "aligned_medium",
        "inferred_low",
        "unknown",
    }
)
TEXT_ALIGNMENT_LEVELS = frozenset(
    {"aligned_high", "aligned_medium", "text_only", "ambiguous", "unassigned"}
)
PHASE_LABEL_SOURCES = frozenset(
    {"mechanical", "official_text", "controlled_rule", "fallback"}
)
PHASE_CONFIDENCE = frozenset({"high", "medium", "low"})

DIAGNOSTIC_MESSAGES = {
    "IMPLICIT_PRIMARY_TARGET": "La cible principale est indiquée par le texte officiel, pas par une cible mécanique explicite.",
    "PHASE_TARGET_INHERITANCE_UNPROVEN": "Des occurrences suivent une cible explicite sans recevoir de cible héritée.",
    "ORDER_ALIGNMENT_AMBIGUOUS": "L’ordre ne suffit pas à établir un alignement certain.",
    "MULTIPLE_PHASE_CANDIDATES": "Le segment officiel correspond à plusieurs phases possibles.",
    "TEXT_MECHANICS_CONTRADICTION": "Le texte et les données mécaniques ne concordent pas silencieusement.",
    "REPEATED_ACTIONS_NOT_DEDUPLICATED": "Les occurrences répétées sont conservées sans déduplication.",
    "UNASSIGNED_SOURCE_ACTION": "Une action source reste disponible hors phase.",
    "UNASSIGNED_TEXT_SEGMENT": "Un segment officiel reste sans alignement.",
    "CONDITION_BRANCH_AMBIGUOUS": "La branche conditionnelle ne peut pas être résolue davantage.",
    "TARGET_ONLY_IN_TEXT": "La cible n’est affirmée que par le texte officiel.",
    "SOURCE_TARGET_WITHOUT_TEXT": "Une cible source n’a pas de confirmation textuelle attribuée.",
    "PHASE_LABEL_FALLBACK": "Le libellé reste neutre faute d’alignement suffisant.",
    "TECHNICAL_CONTEXT_UNRESOLVED": "Le contexte technique ne peut pas être relié par une règle contrôlée.",
    "PLAYER_PHASE_OVERSEGMENTED": "La projection joueur dépasse le nombre maximal de phases autorisé.",
    "EXCESSIVE_SINGLE_ACTION_PHASES": "La projection contient trop de phases mono-action.",
    "EXCESSIVE_FALLBACK_LABELS": "La projection contient trop de libellés de repli.",
    "TECHNICAL_BRANCH_EXPOSED_AS_PHASE": "Une différence purement technique a été exposée comme phase joueur.",
    "UNALIGNED_PLAYER_PHASE": "Une phase joueur ne possède aucun segment officiel aligné.",
}

ATTACK_ACTION_TYPES = frozenset(
    {"attack", "attack_ally", "damage_mul_per_proc", "drain", "stat_modifier"}
)
BRANCH_CONTROL_KEYS = (
    "actionCondition",
    "arbitraryActionIndex",
    "dependsOnActionId",
    "foreachAction",
    "usePreviousResult",
)


class AbilityPresentationError(RuntimeError):
    """A deterministic contract or conservation failure."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _stable_id(prefix: str, *parts: Any) -> str:
    payload = "\x1f".join(str(part) for part in parts).encode("utf-8")
    return f"{prefix}:{hashlib.sha256(payload).hexdigest()[:16]}"


def _canonical(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _fold(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _split_source_name(value: Any) -> str:
    text = re.sub(r"[_\-]+", " ", str(value or ""))
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text)
    text = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", text)
    return " ".join(text.split()) or "Action préservée"


def _pointer_key(value: Any) -> tuple[Any, ...]:
    return tuple(
        int(part) if part.isdigit() else part
        for part in re.split(r"(\d+)", str(value or ""))
    )


def _deepcopy(value: Any) -> Any:
    return copy.deepcopy(value)


def _present_value(record: Any) -> Any | None:
    if not isinstance(record, dict) or record.get("present") is not True:
        return None
    return _deepcopy(record.get("value"))


def _source_pointer(record: Mapping[str, Any]) -> str | None:
    direct = record.get("sourcePointer")
    if isinstance(direct, str) and direct:
        return direct
    source = record.get("source")
    if isinstance(source, dict):
        for key in ("actionPointer", "pointer", "valuePointer"):
            value = source.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _source_reference(record: Mapping[str, Any]) -> dict[str, Any]:
    source = record.get("source") if isinstance(record.get("source"), dict) else {}
    return {
        "file": source.get("file"),
        "pointer": _source_pointer(record),
    }


def _context_object(contexts: Mapping[str, Any], context_id: Any) -> dict[str, Any]:
    record = contexts.get(context_id)
    if not isinstance(record, dict):
        return {}
    obj = record.get("object")
    return obj if isinstance(obj, dict) else {}


def _context_sort_key(contexts: Mapping[str, Any], step: Mapping[str, Any]) -> tuple[Any, ...]:
    path_ids = step.get("contextPathIds") or [step.get("contextId")]
    path: list[Any] = []
    for context_id in path_ids:
        obj = _context_object(contexts, context_id)
        order = obj.get("order")
        path.extend(
            (
                order if isinstance(order, int) else 999,
                str(context_id or ""),
            )
        )
    return (
        tuple(path),
        step.get("actionOrder") if isinstance(step.get("actionOrder"), int) else 999,
        _pointer_key(step.get("sourcePointer")),
        str(step.get("sourceActionId") or ""),
    )


def _operation_sort_key(record: Mapping[str, Any]) -> tuple[Any, ...]:
    source = record.get("source") if isinstance(record.get("source"), dict) else {}
    return (
        _pointer_key(source.get("valuePointer") or source.get("actionPointer")),
        str(record.get("kind") or ""),
        str(record.get("operationId") or ""),
    )


def _meaningful_control(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        key: _deepcopy(item)
        for key, item in value.items()
        if item not in (None, False, [], {}, "none")
    }


def _operation_effect(record: Mapping[str, Any]) -> dict[str, Any] | None:
    effect = record.get("effect")
    if not isinstance(effect, dict) or not effect.get("effectId"):
        return None
    effect_id = str(effect["effectId"])
    return {
        "id": effect_id,
        "label": EFFECT_PRESENTATIONS.get(effect_id, {}).get("label")
        or _split_source_name(effect_id),
        "resolved": effect.get("resolved") is True,
    }


def _operation_projection(record: Mapping[str, Any]) -> dict[str, Any]:
    kind = str(record.get("kind") or "")
    return {
        "id": record.get("operationId"),
        "kind": kind,
        "label": OPERATION_KINDS.get(kind, {}).get("label")
        or _split_source_name(kind),
        "effect": _operation_effect(record),
        "evidence": "mechanically_verified",
    }


def _assert_consistent_action_group(
    source_action_id: str, records: list[Mapping[str, Any]]
) -> None:
    if not records:
        return
    stable_fields = (
        "abilityId",
        "abilityType",
        "actionOrder",
        "characterId",
        "contextId",
        "contextPathIds",
        "rawSourceActionType",
        "sourceActionType",
    )
    first = records[0]
    for record in records[1:]:
        for field in stable_fields:
            if _canonical(record.get(field)) != _canonical(first.get(field)):
                raise AbilityPresentationError(
                    "INCONSISTENT_SOURCE_ACTION",
                    f"{source_action_id}: champ {field} incohérent entre opérations",
                )


def _record_field_variants(
    records: list[Mapping[str, Any]], field: str, *, present_value: bool = False
) -> tuple[Any, list[dict[str, Any]]]:
    grouped: dict[str, dict[str, Any]] = {}
    for record in records:
        raw = record.get(field)
        value = _present_value(raw) if present_value else _deepcopy(raw)
        present = isinstance(raw, dict) and raw.get("present") is True if present_value else True
        key = _canonical({"present": present, "value": value})
        group = grouped.setdefault(
            key,
            {
                "present": present,
                "value": value,
                "operationIds": [],
            },
        )
        group["operationIds"].append(record.get("operationId"))
    variants = [grouped[key] for key in sorted(grouped)]
    if len(variants) == 1:
        variant = variants[0]
        if present_value and not variant["present"]:
            return None, variants
        return _deepcopy(variant["value"]), variants
    return None, variants


def _merged_conditions(records: list[Mapping[str, Any]]) -> list[Any]:
    result: list[Any] = []
    seen: set[str] = set()
    for record in records:
        for condition in record.get("conditions", []):
            key = _canonical(condition)
            if key not in seen:
                seen.add(key)
                result.append(_deepcopy(condition))
    return result


def _variant_object(
    records: list[Mapping[str, Any]], field: str, *, meaningful: bool = False
) -> dict[str, Any]:
    groups: dict[str, dict[str, Any]] = {}
    for record in records:
        raw = record.get(field)
        value = _meaningful_control(raw) if meaningful else _deepcopy(raw or {})
        key = _canonical(value)
        group = groups.setdefault(key, {"value": value, "operationIds": []})
        group["operationIds"].append(record.get("operationId"))
    variants = [groups[key] for key in sorted(groups)]
    if len(variants) == 1:
        return _deepcopy(variants[0]["value"])
    return {"variants": variants}


def build_ordered_occurrences(
    raw_operations: Iterable[Mapping[str, Any]],
    raw_actions: Iterable[Mapping[str, Any]],
    contexts: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Collapse operations by source action without collapsing source actions."""

    operation_groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for operation in raw_operations:
        source_action_id = operation.get("sourceActionId")
        if not isinstance(source_action_id, str) or not source_action_id:
            raise AbilityPresentationError(
                "MISSING_SOURCE_ACTION_ID", str(operation.get("operationId"))
            )
        operation_groups[source_action_id].append(operation)

    action_records: dict[str, Mapping[str, Any]] = {}
    for action in raw_actions:
        source_action_id = action.get("sourceActionId")
        if not isinstance(source_action_id, str) or not source_action_id:
            raise AbilityPresentationError("MISSING_SOURCE_ACTION_ID", "action préservée")
        if source_action_id in action_records:
            raise AbilityPresentationError("DUPLICATE_SOURCE_ACTION", source_action_id)
        action_records[source_action_id] = action

    overlap = sorted(set(operation_groups) & set(action_records))
    if overlap:
        raise AbilityPresentationError(
            "SOURCE_ACTION_PROOF_OVERLAP", ", ".join(overlap[:5])
        )

    steps: list[dict[str, Any]] = []
    for source_action_id, records in operation_groups.items():
        ordered = sorted(records, key=_operation_sort_key)
        _assert_consistent_action_group(source_action_id, ordered)
        source = ordered[0]
        target, target_variants = _record_field_variants(
            ordered, "target", present_value=True
        )
        recipient, recipient_variants = _record_field_variants(
            ordered, "recipient", present_value=True
        )
        conditions = _merged_conditions(ordered)
        control = _variant_object(ordered, "control", meaningful=True)
        flags = _variant_object(ordered, "flags")
        target_projection = None
        if target is not None:
            target_projection = {
                "value": target,
                "evidence": "mechanically_preserved",
            }
        elif len(target_variants) > 1:
            target_projection = {
                "alternatives": target_variants,
                "evidence": "mechanically_preserved",
            }
        recipient_projection = None
        if recipient is not None:
            recipient_projection = {
                "value": recipient,
                "evidence": "mechanically_preserved",
            }
        elif len(recipient_variants) > 1:
            recipient_projection = {
                "alternatives": recipient_variants,
                "evidence": "mechanically_preserved",
            }
        step = {
            "id": _stable_id("step", source_action_id),
            "sourceActionId": source_action_id,
            "actionOrder": source.get("actionOrder"),
            "operationIds": [record.get("operationId") for record in ordered],
            "sourcePointer": _source_pointer(source),
            "sourceType": source.get("rawSourceActionType")
            or source.get("sourceActionType"),
            "contextId": source.get("contextId"),
            "contextPathIds": _deepcopy(source.get("contextPathIds", [])),
            "target": target_projection,
            "recipient": recipient_projection,
            "conditions": conditions,
            "control": control,
            "flags": flags,
            "uninterpretedParametersRef": None,
            "technicalReference": "abilityOperations",
            "operations": [_operation_projection(record) for record in ordered],
            "sourceReferences": list(
                {
                    _canonical(_source_reference(record)): _source_reference(record)
                    for record in ordered
                }.values()
            ),
            "evidence": [
                {
                    "assertion": "source_action",
                    "level": "mechanically_verified",
                    "operationIds": [record.get("operationId") for record in ordered],
                },
                {
                    "assertion": "source_order",
                    "level": "mechanically_preserved",
                    "sourceActionIds": [source_action_id],
                },
            ],
            "phaseAlignment": {"level": "unknown", "segmentIds": []},
            "textSegmentIds": [],
        }
        condition_groups: dict[str, dict[str, Any]] = {}
        for record in ordered:
            values = _deepcopy(record.get("conditions", []))
            key = _canonical(values)
            group = condition_groups.setdefault(
                key, {"operationIds": [], "values": values}
            )
            group["operationIds"].append(record.get("operationId"))
        if len(condition_groups) > 1:
            step["conditionVariants"] = [
                condition_groups[key] for key in sorted(condition_groups)
            ]
        steps.append(step)

    for source_action_id, source in action_records.items():
        target = _present_value(source.get("target"))
        recipient = _present_value(source.get("recipient"))
        parameters = source.get("uninterpretedParameters")
        has_parameters = isinstance(parameters, dict) and bool(parameters)
        steps.append(
            {
                "id": _stable_id("step", source_action_id),
                "sourceActionId": source_action_id,
                "actionOrder": source.get("actionOrder"),
                "operationIds": [],
                "sourcePointer": _source_pointer(source),
                "sourceType": source.get("rawSourceActionType")
                or source.get("sourceActionType"),
                "contextId": source.get("contextId"),
                "contextPathIds": _deepcopy(source.get("contextPathIds", [])),
                "target": {
                    "value": target,
                    "evidence": "mechanically_preserved",
                }
                if target is not None
                else None,
                "recipient": {
                    "value": recipient,
                    "evidence": "mechanically_preserved",
                }
                if recipient is not None
                else None,
                "conditions": _deepcopy(source.get("conditions", [])),
                "control": _meaningful_control(source.get("control")),
                "flags": _deepcopy(source.get("flags", {})) if source.get("flags") else {},
                "uninterpretedParametersRef": "abilityActions.uninterpretedParameters"
                if has_parameters
                else None,
                "technicalReference": "abilityActions",
                "operations": [],
                "sourceReferences": [_source_reference(source)],
                "evidence": [
                    {
                        "assertion": "source_action",
                        "level": "mechanically_preserved",
                        "sourceActionIds": [source_action_id],
                    },
                    {
                        "assertion": "source_order",
                        "level": "mechanically_preserved",
                        "sourceActionIds": [source_action_id],
                    },
                ],
                "phaseAlignment": {"level": "unknown", "segmentIds": []},
                "textSegmentIds": [],
            }
        )

    steps.sort(key=lambda step: _context_sort_key(contexts, step))
    return steps


def _condition_signature(step: Mapping[str, Any]) -> str:
    normalized = []
    for condition in step.get("conditions", []):
        if not isinstance(condition, dict):
            normalized.append(condition)
            continue
        normalized.append(
            {
                "kind": condition.get("kind"),
                "expression": condition.get("expression"),
            }
        )
    return _canonical(normalized)


def _branch_control(step: Mapping[str, Any]) -> dict[str, Any]:
    control = step.get("control") if isinstance(step.get("control"), dict) else {}
    branch_control = {
        key: control.get(key)
        for key in BRANCH_CONTROL_KEYS
        if control.get(key) not in (None, False, [], {}, "none")
    }
    if branch_control.get("actionCondition") == "always":
        branch_control.pop("actionCondition", None)
    return branch_control


def _branch_signature(step: Mapping[str, Any]) -> str:
    return _canonical(
        {
            "conditions": json.loads(_condition_signature(step)),
            "control": _branch_control(step),
        }
    )


def _has_branch(step: Mapping[str, Any]) -> bool:
    return bool(step.get("conditions")) or bool(_branch_control(step))


def _is_explicit_previous_dependency(
    previous: Mapping[str, Any], next_step: Mapping[str, Any]
) -> bool:
    control = (
        next_step.get("control")
        if isinstance(next_step.get("control"), dict)
        else {}
    )
    return (
        control.get("actionCondition") == "if_prev_ran"
        and control.get("dependsOnActionId") == previous.get("sourceActionId")
    )


def _target_signature(step: Mapping[str, Any]) -> str | None:
    target = step.get("target")
    if not isinstance(target, dict):
        return None
    if "value" in target:
        return _canonical(target.get("value"))
    return _canonical(target.get("alternatives"))


def _recipient_signature(step: Mapping[str, Any]) -> str | None:
    recipient = step.get("recipient")
    if not isinstance(recipient, dict):
        return None
    if "value" in recipient:
        return _canonical(recipient.get("value"))
    return _canonical(recipient.get("alternatives"))


def _is_attack(step: Mapping[str, Any]) -> bool:
    return str(step.get("sourceType") or "") in ATTACK_ACTION_TYPES


def _official_attack_starts(text: str) -> int:
    return len(
        re.findall(
            r"(?:^|(?<=[.!?])\s+|\n+)Attaque\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def _new_phase_reason(
    current_steps: list[Mapping[str, Any]],
    next_step: Mapping[str, Any],
    attack_starts: int,
) -> str | None:
    if not current_steps:
        return "source_start"
    previous = current_steps[-1]
    if next_step.get("contextId") != previous.get("contextId"):
        return "context_change"
    current_branch = _branch_signature(previous)
    next_branch = _branch_signature(next_step)
    if (
        current_branch != next_branch
        and (_has_branch(previous) or _has_branch(next_step))
        and not _is_explicit_previous_dependency(previous, next_step)
    ):
        return "condition_branch"

    existing_targets = [
        signature
        for signature in (_target_signature(step) for step in current_steps)
        if signature is not None
    ]
    next_target = _target_signature(next_step)
    if next_target is not None and (
        not existing_targets or next_target != existing_targets[-1]
    ):
        return "explicit_target"

    existing_recipients = [
        signature
        for signature in (_recipient_signature(step) for step in current_steps)
        if signature is not None
    ]
    next_recipient = _recipient_signature(next_step)
    if next_recipient is not None and (
        not existing_recipients or next_recipient != existing_recipients[-1]
    ):
        return "explicit_recipient"

    if attack_starts > 1 and _is_attack(next_step) and any(
        _is_attack(step) for step in current_steps
    ):
        return "official_attack_sequence"
    return None


def _phase_context(
    phase_steps: list[Mapping[str, Any]], contexts: Mapping[str, Any]
) -> tuple[list[str], dict[str, Any]]:
    context_ids: list[str] = []
    for step in phase_steps:
        context_id = step.get("contextId")
        if isinstance(context_id, str) and context_id not in context_ids:
            context_ids.append(context_id)
    context_id = context_ids[0] if context_ids else None
    obj = _context_object(contexts, context_id)
    execution = obj.get("execution") if isinstance(obj.get("execution"), dict) else {}
    return context_ids, {
        "id": context_id,
        "parentContextId": obj.get("parentContextId"),
        "order": obj.get("order"),
        "classification": obj.get("classification"),
        "containerType": obj.get("containerType"),
        "technicalKey": obj.get("technicalKey"),
        "trigger": _deepcopy(execution.get("trigger")),
        "triggerFor": _deepcopy(execution.get("triggerFor")),
        "qualifiers": _deepcopy(execution.get("qualifiers", {})),
        "flags": _deepcopy(execution.get("flags", {})),
        "source": _deepcopy(obj.get("source")),
    }


def _raw_modes(steps: Iterable[Mapping[str, Any]]) -> list[str]:
    values: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "mode":
                    if isinstance(child, list):
                        for item in child:
                            if isinstance(item, str):
                                values.add(item)
                    elif isinstance(child, str):
                        values.add(child)
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for step in steps:
        visit(step.get("conditions", []))
    return sorted(values)


def _raw_sides(steps: Iterable[Mapping[str, Any]]) -> list[str]:
    values: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "combat_side" and isinstance(child, str):
                    values.add(child)
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for step in steps:
        visit(step.get("conditions", []))
    return sorted(values)


def _phase_target(steps: list[Mapping[str, Any]]) -> dict[str, Any] | None:
    for step in steps:
        target = step.get("target")
        if isinstance(target, dict):
            if "value" not in target:
                alternatives = _deepcopy(target.get("alternatives", []))
                return {
                    "present": any(item.get("present") is True for item in alternatives),
                    "value": None,
                    "alternatives": alternatives,
                    "sourceActionIds": [step["sourceActionId"]],
                    "evidence": "mechanically_preserved",
                }
            return {
                "present": True,
                "value": _deepcopy(target.get("value")),
                "sourceActionIds": [step["sourceActionId"]],
                "evidence": "mechanically_preserved",
            }
    return None


def _phase_conditions(steps: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: dict[str, int] = {}
    for step in steps:
        conditions = step.get("conditions")
        if not conditions:
            continue
        key = _canonical(conditions)
        if key in seen:
            result[seen[key]]["sourceActionIds"].append(step["sourceActionId"])
            continue
        seen[key] = len(result)
        result.append(
            {
                "sourceActionIds": [step["sourceActionId"]],
                "values": _deepcopy(conditions),
                "evidence": "mechanically_preserved",
            }
        )
    return result


def _stop_conditions(steps: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for step in steps:
        target = step.get("target")
        value = target.get("value") if isinstance(target, dict) else None
        outcomes = value.get("stop_if_outcome") if isinstance(value, dict) else None
        if not isinstance(outcomes, list):
            continue
        for outcome in outcomes:
            result.append(
                {
                    "outcome": _deepcopy(outcome),
                    "sourceActionId": step["sourceActionId"],
                    "evidence": "mechanically_preserved",
                }
            )
    return result


def _phase_source_references(steps: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for step in steps:
        for reference in step.get("sourceReferences", []):
            key = _canonical(reference)
            if key not in seen:
                seen.add(key)
                result.append(_deepcopy(reference))
    return result


def build_structural_phases(
    ability_id: str,
    ability_type: str,
    steps: list[dict[str, Any]],
    contexts: Mapping[str, Any],
    official_text: str,
) -> list[dict[str, Any]]:
    if not steps:
        return []
    groups: list[tuple[str, list[dict[str, Any]]]] = []
    attack_starts = _official_attack_starts(official_text)
    reason = "source_start"
    current: list[dict[str, Any]] = []
    for step in steps:
        boundary = _new_phase_reason(current, step, attack_starts)
        if current and boundary:
            groups.append((reason, current))
            current = []
            reason = boundary
        current.append(step)
    if current:
        groups.append((reason, current))

    phases: list[dict[str, Any]] = []
    for order, (boundary_reason, phase_steps) in enumerate(groups):
        first = phase_steps[0]
        phase_id = _stable_id(
            "phase",
            ability_id,
            first.get("contextId"),
            first.get("sourceActionId"),
            boundary_reason,
        )
        context_ids, context = _phase_context(phase_steps, contexts)
        operation_ids = [
            operation_id
            for step in phase_steps
            for operation_id in step.get("operationIds", [])
        ]
        trigger_raw = context.get("trigger")
        trigger = (
            {
                "value": _deepcopy(trigger_raw),
                "label": TRIGGER_LABELS.get(trigger_raw),
                "triggerFor": _deepcopy(context.get("triggerFor")),
                "evidence": "mechanically_preserved",
            }
            if trigger_raw is not None or context.get("triggerFor") is not None
            else None
        )
        modes = _raw_modes(phase_steps)
        sides = _raw_sides(phase_steps)
        phase = {
            "id": phase_id,
            "order": order,
            "kind": "primary" if order == 0 else "secondary",
            "label": "Phase non identifiée",
            "labelSource": "fallback",
            "contextIds": context_ids,
            "context": context,
            "sourceActionIds": [step["sourceActionId"] for step in phase_steps],
            "operationIds": operation_ids,
            "target": _phase_target(phase_steps),
            "conditions": _phase_conditions(phase_steps),
            "trigger": trigger,
            "mode": [
                {
                    "value": value,
                    "label": MODE_LABELS.get(value.upper()),
                    "evidence": "mechanically_preserved",
                }
                for value in modes
            ],
            "combatSide": [
                {
                    "value": value,
                    "label": SIDE_LABELS.get(value.casefold()),
                    "evidence": "mechanically_preserved",
                }
                for value in sides
            ],
            "steps": phase_steps,
            "stopConditions": _stop_conditions(phase_steps),
            "playerItems": [],
            "evidence": [
                {
                    "assertion": "phase_boundary",
                    "level": "mechanically_preserved"
                    if boundary_reason != "official_attack_sequence"
                    else "aligned_medium",
                    "rule": boundary_reason,
                    "sourceActionIds": [first["sourceActionId"]],
                }
            ],
            "sourceReferences": _phase_source_references(phase_steps),
            "confidence": "high"
            if boundary_reason
            in {"context_change", "condition_branch", "explicit_target", "explicit_recipient"}
            else "medium",
            "boundaryReason": boundary_reason,
        }
        phases.append(phase)
    return phases


def segment_official_text(
    ability_id: str,
    text: str | None,
    source_pointer: str | None,
) -> list[dict[str, Any]]:
    source = str(text or "")
    if not source:
        return []
    boundaries = {0, len(source)}
    for match in re.finditer(r"\n+|(?<=[.!?])\s+", source):
        prefix = _fold(source[: match.start()])
        if any(prefix.endswith(value) for value in ("max.", "min.", "env.")):
            continue
        boundaries.add(match.start())
        boundaries.add(match.end())
    transition = re.compile(
        r"\b(?:et\s+)?encha[iî]ne\b|\brebondit\b|"
        r"\br[eé]p[eè]te\b|\bavec\s+\d+\s+attaques?\s+bonus\b",
        flags=re.IGNORECASE,
    )
    for match in transition.finditer(source):
        if match.start() > 0:
            boundaries.add(match.start())
    ordered = sorted(boundaries)
    segments: list[dict[str, Any]] = []
    for left, right in zip(ordered, ordered[1:]):
        raw = source[left:right]
        if not raw.strip():
            continue
        leading = len(raw) - len(raw.lstrip())
        trailing = len(raw.rstrip())
        start = left + leading
        end = left + trailing
        value = source[start:end]
        segment_id = _stable_id("segment", ability_id, start, end, value)
        segments.append(
            {
                "segmentId": segment_id,
                "text": value,
                "start": start,
                "end": end,
                "sourcePointer": source_pointer,
                "alignment": {
                    "phaseId": None,
                    "sourceActionIds": [],
                    "operationIds": [],
                    "confidence": "unassigned",
                },
            }
        )
    return segments


def _phase_target_value(phase: Mapping[str, Any]) -> dict[str, Any]:
    target = phase.get("target")
    value = target.get("value") if isinstance(target, dict) else None
    return value if isinstance(value, dict) else {}


def _phase_effect_terms(phase: Mapping[str, Any]) -> list[str]:
    values: list[str] = []
    for step in phase.get("steps", []):
        for operation in step.get("operations", []):
            effect = operation.get("effect")
            if isinstance(effect, dict):
                values.extend([str(effect.get("id") or ""), str(effect.get("label") or "")])
    return [value for value in values if value]


def _duplicate_step_fingerprints(phase: Mapping[str, Any]) -> bool:
    fingerprints: list[str] = []
    for step in phase.get("steps", []):
        fingerprints.append(
            _canonical(
                {
                    "sourceType": step.get("sourceType"),
                    "target": step.get("target"),
                    "recipient": step.get("recipient"),
                    "conditions": [
                        {
                            "kind": item.get("kind"),
                            "expression": item.get("expression"),
                        }
                        for item in step.get("conditions", [])
                        if isinstance(item, dict)
                    ],
                    "control": step.get("control"),
                    "operations": [
                        {
                            "kind": item.get("kind"),
                            "effect": (item.get("effect") or {}).get("id"),
                            "metrics": item.get("metrics"),
                        }
                        for item in step.get("operations", [])
                    ],
                }
            )
        )
    return len(set(fingerprints)) < len(fingerprints)


def _cue_score(phase: Mapping[str, Any], segment: Mapping[str, Any]) -> int:
    text = _fold(segment.get("text"))
    score = 0
    target = _phase_target_value(phase)
    target_type = target.get("type")
    has_attack = any(_is_attack(step) for step in phase.get("steps", []))
    if has_attack and text.startswith("attaque "):
        score += 5
    if phase.get("order") == 0 and "cible principale" in text and any(
        _is_attack(step) for step in phase.get("steps", [])
    ):
        score += 9
    if target_type == "primary" and "cible principale" in text:
        score += 8
    if target_type == "by_least_health" and "perdu le plus de vie" in text:
        score += 10
    if target_type == "random" and re.search(r"\b(?:tous|toutes)\b", text):
        score += 5
    if target_type == "direct_neighbor":
        if "enchaine" in text:
            score += 10
        elif "adjacent" in text:
            score += 6
    if target_type == "direct_neighbor_repeatable":
        if "rebond" in text:
            score += 11
        elif "adjacent" in text:
            score += 6
    if _duplicate_step_fingerprints(phase) and "repete" in text:
        score += 10
    if phase.get("order", 0) > 0 and re.search(r"\battaques? bonus\b", text):
        score += 10
    if any(operation.get("kind") == "spawn" for step in phase.get("steps", []) for operation in step.get("operations", [])) and "invoqu" in text:
        score += 11
    if phase.get("trigger"):
        trigger = phase["trigger"].get("value")
        trigger_cues = {
            "on_start": ("apparition", "debut du combat"),
            "on_start_early": ("apparition", "debut du combat"),
            "on_start_late": ("apparition", "debut du combat"),
            "on_turn": ("chaque tour",),
            "On_turn": ("chaque tour",),
            "below_health": ("vie", "sous"),
            "on_death": ("mort",),
            "on_attacked": ("attaque",),
        }.get(trigger, ())
        if trigger_cues and all(cue in text for cue in trigger_cues):
            score += 8
    for term in _phase_effect_terms(phase):
        folded = _fold(term)
        if folded and folded in text:
            score += 6
    for stop in phase.get("stopConditions", []):
        outcome = _fold(stop.get("outcome"))
        if outcome == "counter attack" and "contre attaque" in text:
            score += 9
    for mode in phase.get("mode", []):
        label = _fold(mode.get("label") or mode.get("value"))
        if label and label in text:
            score += 5
    if phase.get("conditions") and text.startswith("si "):
        score += 3
    return score


def _segment_occurrence_links(
    phase: Mapping[str, Any], segment: Mapping[str, Any]
) -> tuple[list[str], list[str]]:
    text = _fold(segment.get("text"))
    action_ids: list[str] = []
    operation_ids: list[str] = []
    for step in phase.get("steps", []):
        matched = False
        for operation in step.get("operations", []):
            effect = operation.get("effect")
            terms = []
            if isinstance(effect, dict):
                terms = [effect.get("id"), effect.get("label")]
            if any(_fold(term) and _fold(term) in text for term in terms):
                matched = True
                operation_ids.append(operation.get("id"))
            if operation.get("kind") == "spawn" and "invoqu" in text:
                matched = True
                operation_ids.append(operation.get("id"))
        target = step.get("target")
        target_value = target.get("value") if isinstance(target, dict) else {}
        if isinstance(target_value, dict):
            target_type = target_value.get("type")
            if target_type in {"direct_neighbor", "direct_neighbor_repeatable"} and (
                "adjacent" in text or "enchaine" in text or "rebond" in text
            ):
                matched = True
            outcomes = target_value.get("stop_if_outcome")
            if isinstance(outcomes, list) and "counter_attack" in outcomes and "contre attaque" in text:
                matched = True
        if _is_attack(step) and ("degat" in text or text.startswith("attaque ")):
            matched = True
        if matched:
            action_ids.append(step["sourceActionId"])
    return list(dict.fromkeys(action_ids)), list(dict.fromkeys(operation_ids))


def align_official_text(
    phases: list[dict[str, Any]],
    segments: list[dict[str, Any]],
) -> None:
    if not segments:
        return
    if not phases:
        for segment in segments:
            segment["alignment"]["confidence"] = "text_only"
        return

    anchors: dict[int, int] = {}
    cursor = 0
    for phase_index, phase in enumerate(phases):
        candidates = [
            (_cue_score(phase, segment), index)
            for index, segment in enumerate(segments)
            if index >= cursor
        ]
        if phase_index == 0:
            eligible = [item for item in candidates if item[0] >= 5]
            best_score, best_index = min(
                eligible, default=(0, cursor), key=lambda item: item[1]
            )
        else:
            best_score, best_index = max(
                candidates, default=(0, cursor), key=lambda item: (item[0], -item[1])
            )
        if best_score >= 5:
            anchors[phase_index] = best_index
            cursor = best_index + 1
        elif phase_index == 0:
            anchors[phase_index] = 0
            cursor = 1

    anchor_rows = sorted((segment_index, phase_index) for phase_index, segment_index in anchors.items())
    for segment_index, segment in enumerate(segments):
        scores = [_cue_score(phase, segment) for phase in phases]
        best = max(scores, default=0)
        tied = [index for index, score in enumerate(scores) if score == best and score >= 6]
        previous_anchors = [row for row in anchor_rows if row[0] <= segment_index]
        next_anchors = [row for row in anchor_rows if row[0] > segment_index]
        phase_index: int | None = previous_anchors[-1][1] if previous_anchors else None
        bounded = bool(previous_anchors and next_anchors)
        if len(tied) > 1 and not bounded:
            segment["alignment"]["confidence"] = "ambiguous"
            continue
        if phase_index is None:
            segment["alignment"]["confidence"] = "text_only"
            continue
        unanchored_after = any(
            index not in anchors for index in range(phase_index + 1, len(phases))
        )
        if unanchored_after and not bounded and scores[phase_index] == 0:
            segment["alignment"]["confidence"] = "text_only"
            continue
        phase = phases[phase_index]
        action_ids, operation_ids = _segment_occurrence_links(phase, segment)
        anchor_score = scores[phase_index]
        confidence = "aligned_high" if anchor_score >= 6 else "aligned_medium"
        segment["alignment"] = {
            "phaseId": phase["id"],
            "sourceActionIds": action_ids,
            "operationIds": operation_ids,
            "confidence": confidence,
        }

    # A mechanically unique strong cue may occur after later sequences in the
    # official prose (for example a final sentence describing a chain stop).
    # This only aligns existing structures; it never creates an operation.
    for segment in segments:
        if segment["alignment"].get("confidence") != "text_only":
            continue
        scores = [_cue_score(phase, segment) for phase in phases]
        best = max(scores, default=0)
        candidates = [index for index, score in enumerate(scores) if score == best]
        if best < 9 or len(candidates) != 1:
            continue
        phase = phases[candidates[0]]
        action_ids, operation_ids = _segment_occurrence_links(phase, segment)
        segment["alignment"] = {
            "phaseId": phase["id"],
            "sourceActionIds": action_ids,
            "operationIds": operation_ids,
            "confidence": "aligned_high",
        }

    segment_by_id = {segment["segmentId"]: segment for segment in segments}
    for phase in phases:
        phase_segment_ids = [
            segment["segmentId"]
            for segment in segments
            if segment["alignment"].get("phaseId") == phase["id"]
        ]
        phase["textSegmentIds"] = phase_segment_ids
        for step in phase["steps"]:
            direct = [
                segment["segmentId"]
                for segment in segments
                if step["sourceActionId"]
                in segment["alignment"].get("sourceActionIds", [])
            ]
            step["textSegmentIds"] = direct
            explicit_target_owner = (
                isinstance(phase.get("target"), dict)
                and step["sourceActionId"] in phase["target"].get("sourceActionIds", [])
            )
            if explicit_target_owner:
                level = "aligned_high"
            elif phase.get("target") and step.get("target") is None:
                level = "aligned_medium"
            elif any(
                segment_by_id[segment_id]["alignment"]["confidence"] == "aligned_high"
                for segment_id in direct
            ):
                level = "aligned_high"
            elif direct or phase_segment_ids:
                level = "aligned_medium"
            else:
                level = "unknown"
            step["phaseAlignment"] = {"level": level, "segmentIds": direct}


def _phase_text(phase: Mapping[str, Any], segments: Mapping[str, Mapping[str, Any]]) -> str:
    return " ".join(
        str(segments[segment_id].get("text") or "")
        for segment_id in phase.get("textSegmentIds", [])
        if segment_id in segments
    )


def _label_phase(
    phase: dict[str, Any],
    ability_type: str,
    segments: Mapping[str, Mapping[str, Any]],
) -> None:
    text = _fold(_phase_text(phase, segments))
    target = _phase_target_value(phase)
    target_type = target.get("type")
    has_spawn = any(
        operation.get("kind") == "spawn"
        for step in phase.get("steps", [])
        for operation in step.get("operations", [])
    )
    label = "Phase non identifiée"
    source = "fallback"
    kind = phase.get("kind") or "primary"
    combat_sides = {item.get("value") for item in phase.get("combatSide", [])}
    direct_modes = {
        condition.get("expression", {}).get("mode")
        for group in phase.get("conditions", [])
        for condition in group.get("values", [])
        if isinstance(condition, dict)
        and isinstance(condition.get("expression"), dict)
        and isinstance(condition["expression"].get("mode"), str)
    }

    if has_spawn:
        label, source, kind = "Invocation", "mechanical", "summon"
    elif target_type == "direct_neighbor_repeatable" and "rebond" in text:
        label, source, kind = "Rebond", "official_text", "chain"
    elif target_type == "direct_neighbor" and "enchaine" in text:
        label, source, kind = "Enchaînement", "official_text", "chain"
    elif _duplicate_step_fingerprints(phase) and "repete" in text:
        label, source, kind = "Attaque répétée", "official_text", "repeated_attack"
    elif phase.get("order", 0) > 0 and re.search(r"\battaques? bonus\b", text):
        label, source, kind = "Attaque bonus", "official_text", "bonus_attack"
    elif "cible principale" in text and any(_is_attack(step) for step in phase.get("steps", [])):
        label, source, kind = "Cible principale", "official_text", "primary"
    elif target_type in {"direct_neighbor", "direct_neighbor_repeatable"}:
        label, source, kind = "Cible adjacente", "fallback", "secondary"
    elif ability_type.startswith("passive") and phase.get("trigger"):
        label, source, kind = "Déclenchement passif", "controlled_rule", "trigger"
    elif "AVA" in direct_modes:
        label, source, kind = "En guerre", "controlled_rule", "conditional"
    elif combat_sides == {"offense"}:
        label, source, kind = "Attaque", "controlled_rule", "conditional"
    elif combat_sides == {"defense"}:
        label, source, kind = "Défense", "controlled_rule", "conditional"
    elif phase.get("conditions"):
        label, source, kind = "Branche conditionnelle", "controlled_rule", "conditional"
    elif ability_type.endswith("_empower"):
        label, source, kind = "Capacité renforcée", "controlled_rule", "empowered"
    elif any(_is_attack(step) for step in phase.get("steps", [])) and "attaque" in text:
        label, source, kind = "Attaque", "official_text", kind

    phase["label"] = label
    phase["labelSource"] = source
    phase["kind"] = kind
    label_segments = [
        segment_id
        for segment_id in phase.get("textSegmentIds", [])
        if source == "official_text"
    ]
    phase["evidence"].append(
        {
            "assertion": "label",
            "level": "official_text_asserted"
            if source == "official_text"
            else "mechanically_verified"
            if source == "mechanical"
            else "inferred_low"
            if source == "fallback"
            else "mechanically_preserved",
            "sourceActionIds": phase.get("sourceActionIds", [])
            if source != "official_text"
            else [],
            "segmentIds": label_segments,
            "rule": source,
        }
    )


def _diagnostic(
    ability_id: str,
    code: str,
    *,
    severity: str = "info",
    phase_id: str | None = None,
    source_action_ids: Iterable[str] = (),
    segment_ids: Iterable[str] = (),
    message: str,
) -> dict[str, Any]:
    action_ids = list(source_action_ids)
    text_ids = list(segment_ids)
    return {
        "id": _stable_id("diagnostic", ability_id, code, phase_id, *action_ids, *text_ids),
        "code": code,
        "severity": severity,
        "phaseId": phase_id,
        "sourceActionIds": action_ids,
        "segmentIds": text_ids,
    }


def _target_limit(value: Mapping[str, Any]) -> int | float | None:
    limit = value.get("limit")
    candidates: list[int | float] = []
    values = limit if isinstance(limit, list) else [limit]
    for item in values:
        if isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item):
            candidates.append(item)
        elif isinstance(item, dict):
            terminal = item.get("t")
            if isinstance(terminal, (int, float)) and not isinstance(terminal, bool) and math.isfinite(terminal):
                candidates.append(terminal)
    return candidates[-1] if candidates else None


def _evidence(
    level: str,
    *,
    source_action_ids: Iterable[str] = (),
    operation_ids: Iterable[str] = (),
    segment_ids: Iterable[str] = (),
) -> dict[str, Any]:
    result: dict[str, Any] = {"level": level}
    action_ids = list(source_action_ids)
    operations = list(operation_ids)
    segments = list(segment_ids)
    if action_ids:
        result["sourceActionIds"] = action_ids
    if operations:
        result["operationIds"] = operations
    if segments:
        result["segmentIds"] = segments
    return result


def _damage_statement(text: str) -> str | None:
    match = re.search(
        r"\d+(?:[,.]\d+)?\s*%\s+de\s+d[eé]g[aâ]ts(?:\s+(?:perforants?|bruts?|purs?))?",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(0)).strip()


def _segment_map(segments: Iterable[Mapping[str, Any]]) -> dict[str, Mapping[str, Any]]:
    return {str(segment["segmentId"]): segment for segment in segments}


def _operation_player_items(
    ability_id: str,
    step: Mapping[str, Any],
    spawn_by_operation: Mapping[str, Any],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for operation in step.get("operations", []):
        operation_id = operation.get("id")
        kind = operation.get("kind")
        if kind == "empty_result":
            continue
        if kind == "spawn":
            spawn = spawn_by_operation.get(operation_id, {})
            pool = spawn.get("pool") if isinstance(spawn, dict) else []
            if pool:
                for index, entry in enumerate(pool):
                    text = f"Invoque {entry.get('name') or 'une entité non reliée'}"
                    result.append(
                        {
                            "id": _stable_id("item", ability_id, step["sourceActionId"], operation_id, index),
                            "text": text,
                            "evidence": _evidence(
                                "mechanically_verified",
                                source_action_ids=[step["sourceActionId"]],
                                operation_ids=[operation_id],
                            ),
                        }
                    )
            else:
                result.append(
                    {
                        "id": _stable_id("item", ability_id, step["sourceActionId"], operation_id),
                        "text": "Invocation",
                        "evidence": _evidence(
                            "mechanically_verified",
                            source_action_ids=[step["sourceActionId"]],
                            operation_ids=[operation_id],
                        ),
                    }
                )
            continue
        effect = operation.get("effect")
        if isinstance(effect, dict) and effect.get("label"):
            text = f"{operation.get('label') or 'Action'} {effect['label']}"
        else:
            text = str(operation.get("label") or "Opération vérifiée")
        result.append(
            {
                "id": _stable_id("item", ability_id, step["sourceActionId"], operation_id),
                "text": text,
                "evidence": _evidence(
                    "mechanically_verified",
                    source_action_ids=[step["sourceActionId"]],
                    operation_ids=[operation_id],
                ),
            }
        )
    return result


def _preserved_player_items(
    ability_id: str,
    step: Mapping[str, Any],
    segments: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    assigned = [
        segments[segment_id]
        for segment_id in step.get("textSegmentIds", [])
        if segment_id in segments
    ]
    source_type = str(step.get("sourceType") or "")
    statement = None
    supporting_segment = None
    if source_type == "stat_modifier":
        for segment in assigned:
            statement = _damage_statement(str(segment.get("text") or ""))
            if statement:
                supporting_segment = segment
                break
    elif source_type == "turn_meter":
        supporting_segment = next(
            (segment for segment in assigned if "jauge" in _fold(segment.get("text"))),
            None,
        )
        statement = str(supporting_segment.get("text")) if supporting_segment else None
    elif source_type in {"barrier", "Barrier", "barrier_remove"}:
        supporting_segment = next(
            (segment for segment in assigned if "barriere" in _fold(segment.get("text"))),
            None,
        )
        statement = str(supporting_segment.get("text")) if supporting_segment else None
    if statement and supporting_segment:
        return [
            {
                "id": _stable_id("item", ability_id, step["sourceActionId"], supporting_segment["segmentId"]),
                "text": re.sub(r"\s+", " ", statement).strip(),
                "evidence": _evidence(
                    "official_text_asserted",
                    source_action_ids=[step["sourceActionId"]],
                    segment_ids=[supporting_segment["segmentId"]],
                ),
                "mechanicalSupport": {
                    "sourceActionId": step["sourceActionId"],
                    "sourceType": source_type,
                    "evidence": "mechanically_preserved",
                },
            }
        ]
    label = ACTION_PRESENTATIONS.get(source_type) or _split_source_name(source_type)
    return [
        {
            "id": _stable_id("item", ability_id, step["sourceActionId"]),
            "text": label,
            "evidence": _evidence(
                "mechanically_preserved", source_action_ids=[step["sourceActionId"]]
            ),
        }
    ]


def build_player_items(
    ability_id: str,
    phases: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    spawn_by_operation: Mapping[str, Any],
) -> None:
    segment_by_id = _segment_map(segments)
    for phase in phases:
        phase_items: list[dict[str, Any]] = []
        target = _phase_target_value(phase)
        target_type = target.get("type")
        if target_type in {"direct_neighbor", "direct_neighbor_repeatable"}:
            limit = _target_limit(target)
            label = "cible adjacente" if limit == 1 else "cibles adjacentes"
            value = f"{limit:g} {label}" if isinstance(limit, (int, float)) else "Cible adjacente"
            owner_ids = phase.get("target", {}).get("sourceActionIds", [])
            phase_items.append(
                {
                    "id": _stable_id("item", ability_id, phase["id"], "target"),
                    "text": value,
                    "evidence": _evidence(
                        "mechanically_preserved", source_action_ids=owner_ids
                    ),
                }
            )
        for step in phase["steps"]:
            items = _operation_player_items(ability_id, step, spawn_by_operation)
            if not items:
                items = _preserved_player_items(ability_id, step, segment_by_id)
            phase_items.extend(_deepcopy(items))
        for stop in phase.get("stopConditions", []):
            outcome = stop.get("outcome")
            label = {
                "counter_attack": "Arrêt si contre-attaque",
                "dodge": "Arrêt si esquive",
                "miss": "Arrêt si attaque manquée",
            }.get(outcome, f"Condition d’arrêt : {_split_source_name(outcome)}")
            stop_cues = {
                "counter_attack": ("contre attaque",),
                "dodge": ("esquive",),
                "miss": ("attaque manquee", "rate"),
            }.get(outcome, (_fold(outcome),))
            segment_ids = [
                segment["segmentId"]
                for segment in segments
                if stop.get("sourceActionId")
                in segment["alignment"].get("sourceActionIds", [])
                and any(cue in _fold(segment.get("text")) for cue in stop_cues)
            ]
            item = {
                "id": _stable_id("item", ability_id, phase["id"], outcome),
                "text": label,
                "evidence": _evidence(
                    "mechanically_preserved",
                    source_action_ids=[stop.get("sourceActionId")],
                    segment_ids=segment_ids,
                ),
            }
            if segment_ids:
                item["textEvidence"] = "official_text_asserted"
            phase_items.append(item)
        phase["playerItems"] = phase_items


def add_diagnostics(
    ability_id: str,
    phases: list[dict[str, Any]],
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    segment_by_id = _segment_map(segments)
    for phase in phases:
        text = _fold(_phase_text(phase, segment_by_id))
        if phase["label"] == "Cible principale" and phase.get("target") is None:
            label_segments = [
                segment_id
                for segment_id in phase.get("textSegmentIds", [])
                if "cible principale" in _fold(segment_by_id[segment_id].get("text"))
            ]
            phase["target"] = {
                "present": False,
                "value": None,
                "display": "Cible principale",
                "sourceActionIds": [],
                "segmentIds": label_segments,
                "evidence": "official_text_asserted",
            }
            result.append(
                _diagnostic(
                    ability_id,
                    "IMPLICIT_PRIMARY_TARGET",
                    phase_id=phase["id"],
                    segment_ids=label_segments,
                    message="La cible principale est indiquée par le texte officiel, pas par une cible mécanique explicite.",
                )
            )
        explicit_target = phase.get("target")
        if isinstance(explicit_target, dict) and explicit_target.get("present") is True:
            inherited = [
                step["sourceActionId"]
                for step in phase["steps"]
                if step.get("target") is None
                and step["sourceActionId"]
                not in explicit_target.get("sourceActionIds", [])
            ]
            if inherited:
                phase["confidence"] = "medium"
                result.append(
                    _diagnostic(
                        ability_id,
                        "PHASE_TARGET_INHERITANCE_UNPROVEN",
                        phase_id=phase["id"],
                        source_action_ids=inherited,
                        message="Ces occurrences suivent une cible explicite dans la phase, sans cible héritée ajoutée à leurs données.",
                    )
                )
        if phase["labelSource"] == "fallback":
            result.append(
                _diagnostic(
                    ability_id,
                    "PHASE_LABEL_FALLBACK",
                    phase_id=phase["id"],
                    source_action_ids=phase.get("sourceActionIds", []),
                    message="Le libellé reste volontairement neutre faute d’alignement sémantique suffisant.",
                )
            )
        if _duplicate_step_fingerprints(phase):
            result.append(
                _diagnostic(
                    ability_id,
                    "REPEATED_ACTIONS_NOT_DEDUPLICATED",
                    phase_id=phase["id"],
                    source_action_ids=phase.get("sourceActionIds", []),
                    message="Des actions répétées sont conservées comme occurrences source distinctes.",
                )
            )
        if phase.get("target") and phase["target"].get("present") is True:
            target_value = phase["target"].get("value")
            target_text = any(
                cue in text
                for cue in (
                    "cible",
                    "ennemi",
                    "allie",
                    "soi",
                    "adjacent",
                    "rebond",
                    "enchaine",
                )
            )
            if isinstance(target_value, dict) and target_value and not target_text:
                result.append(
                    _diagnostic(
                        ability_id,
                        "SOURCE_TARGET_WITHOUT_TEXT",
                        phase_id=phase["id"],
                        source_action_ids=phase["target"].get("sourceActionIds", []),
                        message="Une cible existe dans la source sans confirmation textuelle attribuée à cette phase.",
                    )
                )
    for segment in segments:
        confidence = segment["alignment"].get("confidence")
        if confidence == "ambiguous":
            result.append(
                _diagnostic(
                    ability_id,
                    "MULTIPLE_PHASE_CANDIDATES",
                    severity="warning",
                    segment_ids=[segment["segmentId"]],
                    message="Le segment officiel correspond à plusieurs phases possibles et reste non attribué.",
                )
            )
        elif confidence in {"text_only", "unassigned"}:
            result.append(
                _diagnostic(
                    ability_id,
                    "UNASSIGNED_TEXT_SEGMENT",
                    segment_ids=[segment["segmentId"]],
                    message="Le segment officiel reste disponible sans rattachement mécanique certain.",
                )
            )
    return sorted(result, key=lambda item: (item["code"], item["id"]))


def _compact_evidence(entries: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for entry in entries:
        assertion = str(entry.get("assertion") or "assertion")
        value = {
            key: _deepcopy(item)
            for key, item in entry.items()
            if key != "assertion" and item not in (None, [], {})
        }
        result[assertion] = value
    return result


def _compact_contract(
    phases: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    context_registry: dict[str, dict[str, Any]] = {}
    for phase in phases:
        context = phase.pop("context", None)
        if isinstance(context, dict) and isinstance(context.get("id"), str):
            context_registry[context["id"]] = context
        phase.pop("boundaryReason", None)
        phase["evidence"] = _compact_evidence(phase.get("evidence", []))
        for value in phase["evidence"].values():
            value.pop("sourceActionIds", None)
            value.pop("operationIds", None)
            value.pop("segmentIds", None)
        for step in phase.get("steps", []):
            condition_refs = [
                index
                for index, condition in enumerate(phase.get("conditions", []))
                if step.get("sourceActionId") in condition.get("sourceActionIds", [])
            ]
            step["conditionRefs"] = condition_refs
            step.pop("conditions", None)
            step.pop("operations", None)
            step.pop("sourceReferences", None)
            step["evidence"] = _compact_evidence(step.get("evidence", []))
            for value in step["evidence"].values():
                value.pop("sourceActionIds", None)
                value.pop("operationIds", None)
                value.pop("segmentIds", None)
            if not step.get("control"):
                step.pop("control", None)
            if not step.get("flags"):
                step.pop("flags", None)
            if step.get("uninterpretedParametersRef") is None:
                step.pop("uninterpretedParametersRef", None)
            if not step.get("conditionVariants"):
                step.pop("conditionVariants", None)
    for diagnostic in diagnostics:
        diagnostic.pop("id", None)
        diagnostic.pop("severity", None)
        if diagnostic.get("phaseId") is None:
            diagnostic.pop("phaseId", None)
        if not diagnostic.get("sourceActionIds"):
            diagnostic.pop("sourceActionIds", None)
        if not diagnostic.get("segmentIds"):
            diagnostic.pop("segmentIds", None)
    return [context_registry[key] for key in sorted(context_registry)]


def _player_phase_family(phase: Mapping[str, Any], ability_type: str) -> str:
    """Return a conservative player-facing family, never a technical branch key."""
    label = str(phase.get("label") or "")
    folded = _fold(label)
    if ability_type.startswith("passive"):
        trigger = phase.get("trigger") or {}
        value = trigger.get("value") if isinstance(trigger, dict) else None
        if value:
            return "passive:triggered"
        return "passive:permanent"
    if "defense" in folded:
        return "side:defense"
    if folded == "attaque" or folded.startswith("en attaque"):
        return "side:offense"
    if "invocation" in folded:
        return "function:spawn"
    if "transfert" in folded:
        return "function:transfer"
    if "soin" in folded or "barriere" in folded:
        return "function:sustain"
    if "rebond" in folded:
        return "attack:bounce"
    if "enchainement" in folded or "cible adjacente" in folded:
        return "attack:chain"
    if "bonus" in folded:
        return "attack:bonus"
    if "repete" in folded:
        return "attack:repeat"
    if "cible principale" in folded:
        return "attack:primary"
    if any(_is_attack(step) for step in phase.get("steps", [])):
        return "attack:sequence"
    return "function:uninterpreted"


def _player_phase_label(family: str, phases: list[Mapping[str, Any]]) -> tuple[str, str]:
    labels = [str(phase.get("label") or "") for phase in phases]
    usable = [
        (label, str(phase.get("labelSource") or "fallback"))
        for label, phase in zip(labels, phases)
        if label and label != "Phase non identifiée" and label not in {"Branche", "En guerre"}
    ]
    fixed = {
        "side:offense": "En attaque",
        "side:defense": "En défense",
        "function:spawn": "Invocation",
        "function:transfer": "Transfert",
        "function:sustain": "Soin et protection",
        "attack:bounce": "Rebond",
        "attack:chain": "Enchaînement",
        "attack:bonus": "Attaque bonus",
        "attack:repeat": "Attaque répétée",
        "attack:primary": "Cible principale",
        "attack:sequence": "Attaque",
        "passive:permanent": "Effets permanents",
        "function:uninterpreted": "Mécanique non interprétée",
    }
    if family == "passive:triggered":
        return "Déclenchement passif", "controlled_rule"
    if family in fixed:
        source = "fallback" if family == "function:uninterpreted" else "controlled_rule"
        return fixed[family], source
    if usable:
        return usable[0]
    return "Mécanique non interprétée", "fallback"


def _branch_label(phase: Mapping[str, Any], index: int) -> str:
    trigger = phase.get("trigger")
    if isinstance(trigger, dict) and trigger.get("label"):
        return str(trigger["label"])
    sides = [item.get("label") for item in phase.get("combatSide", []) if item.get("label")]
    if sides:
        return " / ".join(sides)
    modes = [item.get("label") for item in phase.get("mode", []) if item.get("label")]
    if modes:
        return "En " + " / ".join(modes).casefold()
    if phase.get("conditions"):
        return "Conditions particulières"
    controls = [step.get("control") for step in phase.get("steps", []) if step.get("control")]
    if controls:
        return "Dépendance technique"
    return f"Étapes {index + 1}"


def build_player_hierarchy(
    ability_id: str,
    ability_type: str,
    structural_phases: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Project aligned B2 phases into player phases + technical branches."""
    occurrences: dict[str, dict[str, Any]] = {}
    for phase in structural_phases:
        for step in phase.get("steps", []):
            source_action_id = step["sourceActionId"]
            if source_action_id in occurrences:
                raise AbilityPresentationError("DUPLICATE_PRESENTED_ACTION", source_action_id)
            occurrences[source_action_id] = _deepcopy(step)

    grouped: list[tuple[str, list[dict[str, Any]]]] = []
    for phase in structural_phases:
        family = _player_phase_family(phase, ability_type)
        if family == "function:uninterpreted" and grouped:
            grouped[-1][1].append(phase)
            continue
        # A repeated family remains one player phase. Technical differences stay branches.
        target_group = next((group for key, group in grouped if key == family), None)
        if target_group is None:
            target_group = []
            grouped.append((family, target_group))
        target_group.append(phase)

    if len(grouped) > 1 and grouped[0][0] == "function:uninterpreted":
        leading = grouped.pop(0)[1]
        grouped[0][1][0:0] = leading

    total_actions = sum(len(phase.get("steps", [])) for _, group in grouped for phase in group)
    if total_actions >= 8:
        while grouped:
            single_groups = [
                index
                for index, (_, group) in enumerate(grouped)
                if sum(len(phase.get("steps", [])) for phase in group) == 1
            ]
            if len(single_groups) / len(grouped) <= 0.60:
                break
            index = single_groups[-1]
            if len(grouped) == 1:
                break
            destination = index - 1 if index > 0 else 1
            moving = grouped.pop(index)[1]
            if destination > index:
                destination -= 1
                grouped[destination][1][0:0] = moving
            else:
                grouped[destination][1].extend(moving)

    player_phases: list[dict[str, Any]] = []
    for order, (family, source_phases) in enumerate(grouped):
        refs = [
            step["sourceActionId"]
            for phase in source_phases
            for step in phase.get("steps", [])
        ]
        label, label_source = _player_phase_label(family, source_phases)
        phase_id = _stable_id("phase", ability_id, family, refs[0] if refs else order)
        branches: list[dict[str, Any]] = []
        for index, phase in enumerate(source_phases):
            branch_refs = [step["sourceActionId"] for step in phase.get("steps", [])]
            branch = {
                "id": _stable_id("branch", ability_id, phase_id, index, *branch_refs),
                "order": index,
                "label": _branch_label(phase, index),
                "trigger": _deepcopy(phase.get("trigger")),
                "mode": _deepcopy(phase.get("mode", [])),
                "combatSide": _deepcopy(phase.get("combatSide", [])),
                "conditions": [
                    {"occurrenceRef": step["sourceActionId"]}
                    for step in phase.get("steps", [])
                    if step.get("conditions")
                ],
                "control": {
                    "occurrenceRefs": [
                        step["sourceActionId"]
                        for step in phase.get("steps", [])
                        if step.get("control")
                    ]
                },
                "occurrenceRefs": branch_refs,
                "sourceReferences": [],
                "textSegmentIds": _deepcopy(phase.get("textSegmentIds", [])),
                "diagnostics": [],
            }
            branches.append(branch)
        items: list[dict[str, Any]] = []
        seen_items: set[str] = set()
        for phase in source_phases:
            for item in phase.get("playerItems", []):
                key = _canonical({k: v for k, v in item.items() if k != "id"})
                if key not in seen_items:
                    seen_items.add(key)
                    items.append(_deepcopy(item))
        player_phases.append(
            {
                "id": phase_id,
                "order": order,
                "kind": family,
                "label": label,
                "labelSource": label_source,
                "occurrenceRefs": refs,
                "branches": branches,
                "playerItems": items,
                "textSegmentIds": list(dict.fromkeys(
                    segment_id
                    for phase in source_phases
                    for segment_id in phase.get("textSegmentIds", [])
                )),
                "evidence": _compact_evidence(source_phases[0].get("evidence", [])),
                "confidence": min(
                    (phase.get("confidence", "low") for phase in source_phases),
                    key={"low": 0, "medium": 1, "high": 2}.get,
                ),
            }
        )
    return occurrences, player_phases


def add_player_quality_diagnostics(
    ability_id: str,
    player_phases: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    action_count: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_action = {
        ref: phase["id"]
        for phase in player_phases
        for ref in phase.get("occurrenceRefs", [])
    }
    result: list[dict[str, Any]] = []
    for diagnostic in diagnostics:
        if diagnostic.get("code") == "PHASE_LABEL_FALLBACK":
            continue
        item = _deepcopy(diagnostic)
        mapped = {
            by_action[ref]
            for ref in item.get("sourceActionIds", [])
            if ref in by_action
        }
        if len(mapped) == 1:
            item["phaseId"] = next(iter(mapped))
        else:
            item.pop("phaseId", None)
        result.append(item)
    fallback_phases = [phase for phase in player_phases if phase.get("labelSource") == "fallback"]
    for phase in fallback_phases:
        result.append(
            _diagnostic(
                ability_id,
                "PHASE_LABEL_FALLBACK",
                phase_id=phase["id"],
                source_action_ids=phase.get("occurrenceRefs", []),
                message=DIAGNOSTIC_MESSAGES["PHASE_LABEL_FALLBACK"],
            )
        )
    unaligned = [phase for phase in player_phases if not phase.get("textSegmentIds")]
    for phase in unaligned:
        result.append(
            _diagnostic(
                ability_id,
                "UNALIGNED_PLAYER_PHASE",
                phase_id=phase["id"],
                source_action_ids=phase.get("occurrenceRefs", []),
                message=DIAGNOSTIC_MESSAGES["UNALIGNED_PLAYER_PHASE"],
            )
        )
    phase_count = len(player_phases)
    single_count = sum(len(phase.get("occurrenceRefs", [])) == 1 for phase in player_phases)
    ratio = phase_count / action_count if action_count else 0
    single_ratio = single_count / phase_count if phase_count else 0
    fallback_count = len(fallback_phases)
    violations: list[str] = []
    if phase_count > 12:
        violations.append("PLAYER_PHASE_OVERSEGMENTED")
    if action_count >= 8 and ratio > 0.60:
        violations.append("PLAYER_PHASE_OVERSEGMENTED")
    if action_count >= 8 and single_ratio > 0.60:
        violations.append("EXCESSIVE_SINGLE_ACTION_PHASES")
    if fallback_count > 3:
        violations.append("EXCESSIVE_FALLBACK_LABELS")
    for code in sorted(set(violations)):
        result.append(
            _diagnostic(
                ability_id,
                code,
                severity="error",
                message=DIAGNOSTIC_MESSAGES[code],
            )
        )
    quality = {
        "actionCount": action_count,
        "playerPhaseCount": phase_count,
        "branchCount": sum(len(phase.get("branches", [])) for phase in player_phases),
        "phaseActionRatio": round(ratio, 6),
        "singleActionPhaseCount": single_count,
        "singleActionPhaseRatio": round(single_ratio, 6),
        "fallbackLabelCount": fallback_count,
        "unassignedTextSegmentCount": sum(
            diagnostic.get("code") == "UNASSIGNED_TEXT_SEGMENT" for diagnostic in result
        ),
        "blockingViolations": sorted(set(violations)),
    }
    return sorted(result, key=lambda item: (item["code"], item.get("id", ""))), quality


def build_ability_presentation(
    ability: Mapping[str, Any],
    raw_operations: Iterable[Mapping[str, Any]],
    raw_actions: Iterable[Mapping[str, Any]],
    contexts: Mapping[str, Any],
    spawn_by_operation: Mapping[str, Any],
    *,
    presentation_id: str | None = None,
    source_context_id: str | None = None,
    variant: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    ability_id = str(presentation_id or ability.get("id") or source_context_id or "unknown")
    ability_type = str(ability.get("type") or (variant or {}).get("type") or "unknown")
    raw_operations = list(raw_operations)
    raw_actions = list(raw_actions)
    steps = build_ordered_occurrences(raw_operations, raw_actions, contexts)
    official_text = ability.get("officialText")
    source_pointer = None
    official_source = ability.get("officialTextSource")
    if isinstance(official_source, dict):
        source_pointer = official_source.get("pointer")
    phases = build_structural_phases(
        ability_id, ability_type, steps, contexts, str(official_text or "")
    )
    segments = segment_official_text(ability_id, official_text, source_pointer)
    align_official_text(phases, segments)
    segment_by_id = _segment_map(segments)
    for phase in phases:
        _label_phase(phase, ability_type, segment_by_id)
    build_player_items(ability_id, phases, segments, spawn_by_operation)
    diagnostics = add_diagnostics(ability_id, phases, segments)
    if variant and variant.get("parentAbilityId") is None:
        diagnostics.append(
            _diagnostic(
                ability_id,
                "TECHNICAL_CONTEXT_UNRESOLVED",
                severity="warning",
                message="Le contexte technique ne peut pas être relié à une capacité par une règle contrôlée.",
            )
        )
        diagnostics.sort(key=lambda item: (item["code"], item["id"]))
    occurrences, player_phases = build_player_hierarchy(ability_id, ability_type, phases)
    is_safety_variant = bool(variant and variant.get("type") in {"safety", "safety_empower"})
    technical_variants = []
    unassigned_occurrence_refs: list[str] = []
    if is_safety_variant:
        all_refs = [ref for phase in player_phases for ref in phase.get("occurrenceRefs", [])]
        technical_variants = [
            {
                "id": _stable_id("technical-variant", ability_id, variant.get("type")),
                "type": variant.get("type"),
                "label": variant.get("label") or "Variante technique",
                "occurrenceRefs": all_refs,
                "sourceContextId": source_context_id,
            }
        ]
        player_phases = []
        unassigned_occurrence_refs = all_refs
    diagnostics, quality = add_player_quality_diagnostics(
        ability_id, player_phases, diagnostics, len(occurrences)
    )
    raw_action_by_id = {
        item.get("sourceActionId"): item
        for item in raw_actions
        if isinstance(item, Mapping) and item.get("sourceActionId")
    }
    for occurrence in occurrences.values():
        source_action = raw_action_by_id.get(occurrence.get("sourceActionId"))
        source_parameters = (
            source_action.get("uninterpretedParameters", {})
            if isinstance(source_action, Mapping)
            else {}
        )
        occurrence["uninterpretedParameters"] = {
            "present": bool(source_parameters),
            "reference": "ability.actions[sourceActionId].uninterpretedParameters"
            if source_parameters
            else None,
        }
        occurrence.pop("uninterpretedParametersRef", None)
        occurrence.pop("operations", None)
        occurrence["evidence"] = _compact_evidence(occurrence.get("evidence", []))
    context_registry = _compact_contract(phases, diagnostics)
    presentation = {
        "schemaVersion": ABILITY_PRESENTATION_SCHEMA_VERSION,
        "abilityId": ability.get("id") if not variant else None,
        "presentationId": ability_id,
        "characterId": ability.get("characterId"),
        "abilityType": ability_type,
        "parentAbilityId": ability.get("parentAbilityId")
        if not variant
        else variant.get("parentAbilityId"),
        "sourceContextId": source_context_id,
        "variant": _deepcopy(dict(variant)) if variant else None,
        "contexts": context_registry,
        "occurrences": {key: occurrences[key] for key in sorted(occurrences)},
        "playerPhases": player_phases,
        "technicalVariants": technical_variants,
        "unassignedOccurrenceRefs": unassigned_occurrence_refs,
        "quality": quality,
        "officialText": {
            "available": bool(official_text),
            "textReference": "ability.officialText" if official_text else None,
            "source": _deepcopy(official_source) if isinstance(official_source, dict) else None,
            "segments": segments,
        },
        "diagnostics": diagnostics,
    }
    validate_ability_presentation(presentation, steps)
    return presentation


def validate_ability_presentation(
    presentation: Mapping[str, Any],
    expected_steps: Iterable[Mapping[str, Any]] | None = None,
) -> None:
    if presentation.get("schemaVersion") != ABILITY_PRESENTATION_SCHEMA_VERSION:
        raise AbilityPresentationError(
            "INVALID_PRESENTATION_SCHEMA", str(presentation.get("schemaVersion"))
        )
    phases = presentation.get("playerPhases")
    occurrences = presentation.get("occurrences")
    unassigned = presentation.get("unassignedOccurrenceRefs")
    if not isinstance(phases, list) or not isinstance(occurrences, dict) or not isinstance(unassigned, list):
        raise AbilityPresentationError("INVALID_PRESENTATION_SHAPE", "playerPhases/occurrences")
    action_ids = list(occurrences)
    if any(key != value.get("sourceActionId") for key, value in occurrences.items()):
        raise AbilityPresentationError("INVALID_OCCURRENCE_KEY", str(presentation.get("presentationId")))
    phase_refs = [ref for phase in phases for ref in phase.get("occurrenceRefs", [])]
    if len(phase_refs) != len(set(phase_refs)):
        raise AbilityPresentationError("DUPLICATE_PRESENTED_ACTION", str(presentation.get("presentationId")))
    if set(phase_refs + list(unassigned)) != set(action_ids):
        raise AbilityPresentationError("SOURCE_ACTION_CONSERVATION_FAILURE", str(presentation.get("presentationId")))
    for phase in phases:
        branch_refs = [ref for branch in phase.get("branches", []) for ref in branch.get("occurrenceRefs", [])]
        if branch_refs != phase.get("occurrenceRefs", []):
            raise AbilityPresentationError("BRANCH_REFERENCE_MISMATCH", str(phase.get("id")))
        if any(ref not in occurrences for ref in branch_refs):
            raise AbilityPresentationError("INVALID_OCCURRENCE_REFERENCE", str(phase.get("id")))
    operation_ids = [operation_id for step in occurrences.values() for operation_id in step.get("operationIds", [])]
    if len(operation_ids) != len(set(operation_ids)):
        raise AbilityPresentationError("DUPLICATE_PRESENTED_OPERATION", str(presentation.get("presentationId")))
    if expected_steps is not None:
        expected = list(expected_steps)
        expected_actions = [step.get("sourceActionId") for step in expected]
        expected_operations = [
            operation_id for step in expected for operation_id in step.get("operationIds", [])
        ]
        if action_ids != sorted(expected_actions):
            raise AbilityPresentationError(
                "SOURCE_ACTION_CONSERVATION_FAILURE", str(presentation.get("presentationId"))
            )
        if sorted(operation_ids) != sorted(expected_operations):
            raise AbilityPresentationError(
                "OPERATION_CONSERVATION_FAILURE", str(presentation.get("presentationId"))
            )
    segment_ids: list[str] = []
    for segment in presentation.get("officialText", {}).get("segments", []):
        segment_id = segment.get("segmentId")
        if segment_id in segment_ids:
            raise AbilityPresentationError("DUPLICATE_TEXT_SEGMENT", str(segment_id))
        segment_ids.append(segment_id)
        alignment = segment.get("alignment", {}).get("confidence")
        if alignment not in TEXT_ALIGNMENT_LEVELS:
            raise AbilityPresentationError("INVALID_TEXT_ALIGNMENT", str(alignment))
    for phase in phases:
        if phase.get("labelSource") not in PHASE_LABEL_SOURCES:
            raise AbilityPresentationError("INVALID_PHASE_LABEL_SOURCE", str(phase.get("labelSource")))
        if phase.get("confidence") not in PHASE_CONFIDENCE:
            raise AbilityPresentationError("INVALID_PHASE_CONFIDENCE", str(phase.get("confidence")))
        evidence_values = phase.get("evidence", {}).values()
        for evidence in evidence_values:
            if evidence.get("level") not in ASSERTION_EVIDENCE:
                raise AbilityPresentationError("INVALID_ASSERTION_EVIDENCE", str(evidence.get("level")))
    violations = presentation.get("quality", {}).get("blockingViolations", [])
    if violations:
        raise AbilityPresentationError(
            "PLAYER_PRESENTATION_QUALITY_FAILURE",
            f"{presentation.get('presentationId')}: {', '.join(violations)}; {presentation.get('quality')}",
        )


def audit_ability_presentations(
    presentations: Iterable[Mapping[str, Any]],
    technical_presentations: Iterable[Mapping[str, Any]],
) -> dict[str, Any]:
    abilities = list(presentations)
    technical = list(technical_presentations)
    ability_phases = [phase for item in abilities for phase in item.get("playerPhases", [])]
    all_presentations = [*abilities, *technical]
    all_phases = [phase for item in all_presentations for phase in item.get("playerPhases", [])]
    assigned_refs = [ref for phase in all_phases for ref in phase.get("occurrenceRefs", [])]
    unassigned_refs = [ref for item in all_presentations for ref in item.get("unassignedOccurrenceRefs", [])]
    action_ids = [*assigned_refs, *unassigned_refs]
    if len(action_ids) != len(set(action_ids)):
        raise AbilityPresentationError("GLOBAL_SOURCE_ACTION_DUPLICATE", "audit B2")
    segments = [
        segment
        for item in abilities
        for segment in item.get("officialText", {}).get("segments", [])
    ]
    alignment_counts = Counter(
        segment.get("alignment", {}).get("confidence") for segment in segments
    )
    diagnostic_counts = Counter(
        diagnostic.get("code")
        for item in all_presentations
        for diagnostic in item.get("diagnostics", [])
    )
    phases_with_probable = sum(
        any(
            item.get("occurrences", {}).get(ref, {}).get("phaseAlignment", {}).get("level") == "aligned_medium"
            for ref in phase.get("occurrenceRefs", [])
        )
        for item in abilities
        for phase in item.get("playerPhases", [])
    )
    return {
        "abilityPresentations": len(abilities),
        "technicalPresentations": len(technical),
        "totalPhases": len(ability_phases),
        "technicalPhases": len(all_phases) - len(ability_phases),
        "averagePhasesPerAbility": round(len(ability_phases) / len(abilities), 6)
        if abilities
        else 0,
        "totalBranches": sum(len(phase.get("branches", [])) for phase in ability_phases),
        "singleActionPhases": sum(len(phase.get("occurrenceRefs", [])) == 1 for phase in ability_phases),
        "singleActionPhaseRatio": round(
            sum(len(phase.get("occurrenceRefs", [])) == 1 for phase in ability_phases) / len(ability_phases),
            6,
        ) if ability_phases else 0,
        "abilitiesWithAtLeast10Phases": sum(len(item.get("playerPhases", [])) >= 10 for item in abilities),
        "maximumPhasesPerAbility": max((len(item.get("playerPhases", [])) for item in abilities), default=0),
        "zeroPhaseAbilities": sum(not item.get("playerPhases") for item in abilities),
        "singlePhaseAbilities": sum(len(item.get("playerPhases", [])) == 1 for item in abilities),
        "multiPhaseAbilities": sum(len(item.get("playerPhases", [])) > 1 for item in abilities),
        "assignedActions": len(assigned_refs),
        "unassignedActions": len(unassigned_refs),
        "assignedOperations": sum(
            len(occurrence.get("operationIds", []))
            for item in all_presentations
            for occurrence in item.get("occurrences", {}).values()
            if occurrence.get("sourceActionId") in set(assigned_refs)
        ),
        "textSegments": len(segments),
        "textSegmentsAlignedHigh": alignment_counts["aligned_high"],
        "textSegmentsAlignedMedium": alignment_counts["aligned_medium"],
        "textSegmentsTextOnly": alignment_counts["text_only"],
        "textSegmentsAmbiguous": alignment_counts["ambiguous"],
        "textSegmentsUnassigned": alignment_counts["unassigned"],
        "diagnosticsByType": dict(sorted(diagnostic_counts.items())),
        "phasesOnlyOfficialText": sum(
            not phase.get("occurrenceRefs") and bool(phase.get("textSegmentIds"))
            for phase in ability_phases
        ),
        "phasesWithMechanicalTarget": sum(
            any(
                isinstance(item.get("occurrences", {}).get(ref, {}).get("target"), dict)
                for ref in phase.get("occurrenceRefs", [])
            )
            for item in abilities
            for phase in item.get("playerPhases", [])
        ),
        "phasesWithProbableAttachment": phases_with_probable,
    }
