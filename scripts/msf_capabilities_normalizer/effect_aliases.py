"""Exact, versioned aliases for effect identifiers."""

from __future__ import annotations

from collections.abc import Iterable
import copy
from typing import Any


EFFECT_ID_ALIAS_ORIGIN = "effect-id-aliases-v1"
EFFECT_ID_ALIASES: dict[str, str] = {
    "Empower ": "Empower",
}

EFFECT_REFERENCE_SINGLE_KEYS = frozenset(
    {
        "proc",
        "specific_proc",
        "opposite_override",
    }
)
EFFECT_REFERENCE_MULTI_KEYS = frozenset(
    {
        "procs",
        "only_procs",
        "specific_procs",
        "onlyprocs",
        "exceptprocs",
        "exclude",
        "for_procs",
    }
)


def alias_policy_record() -> dict[str, Any]:
    """Expose the complete alias contract in deterministic order."""

    return {
        "origin": EFFECT_ID_ALIAS_ORIGIN,
        "genericTrimAllowed": False,
        "rules": [
            {
                "rawValue": raw_value,
                "resolvedValue": EFFECT_ID_ALIASES[raw_value],
            }
            for raw_value in sorted(EFFECT_ID_ALIASES)
        ],
    }


def resolve_effect_identifier(raw_value: str) -> dict[str, Any]:
    """Resolve one identifier by exact lookup only; never trim or rewrite it."""

    if raw_value in EFFECT_ID_ALIASES:
        return {
            "rawValue": raw_value,
            "resolvedValue": EFFECT_ID_ALIASES[raw_value],
            "resolutionMethod": "controlled_alias",
            "resolutionOrigin": EFFECT_ID_ALIAS_ORIGIN,
        }
    return {
        "rawValue": raw_value,
        "resolvedValue": raw_value,
        "resolutionMethod": "exact",
        "resolutionOrigin": None,
    }


def walk_effect_identifiers(
    node: Any,
    pointer: str,
    *,
    append_pointer,
) -> Iterable[tuple[str, str]]:
    """Yield effect identifiers and exact source pointers from a raw subtree."""

    if isinstance(node, dict):
        for key, value in node.items():
            child_pointer = append_pointer(pointer, key)
            if (
                key in EFFECT_REFERENCE_SINGLE_KEYS
                and isinstance(value, str)
            ):
                yield value, child_pointer
            elif key in EFFECT_REFERENCE_MULTI_KEYS:
                if isinstance(value, str):
                    yield value, child_pointer
                elif isinstance(value, list):
                    for index, item in enumerate(value):
                        if isinstance(item, str):
                            yield item, append_pointer(
                                child_pointer, index
                            )
            yield from walk_effect_identifiers(
                value,
                child_pointer,
                append_pointer=append_pointer,
            )
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from walk_effect_identifiers(
                value,
                append_pointer(pointer, index),
                append_pointer=append_pointer,
            )


def iter_mechanics_effect_identifiers(
    mechanics: dict[str, Any],
    *,
    append_pointer,
) -> Iterable[dict[str, Any]]:
    """Yield each logical source reference once from parser records."""

    seen: set[tuple[str, str, str]] = set()

    def emit(
        *,
        node: Any,
        source_file: Any,
        source_pointer: Any,
        character_id: Any = None,
        ability_type: Any = None,
        source_action_id: Any = None,
        source_container_id: Any = None,
    ) -> Iterable[dict[str, Any]]:
        if not isinstance(source_file, str):
            return
        if not isinstance(source_pointer, str):
            return
        for raw_value, pointer in walk_effect_identifiers(
            node,
            source_pointer,
            append_pointer=append_pointer,
        ):
            key = (source_file, pointer, raw_value)
            if key in seen:
                continue
            seen.add(key)
            yield {
                "rawValue": raw_value,
                "characterId": copy.deepcopy(character_id),
                "abilityType": copy.deepcopy(ability_type),
                "sourceActionId": copy.deepcopy(source_action_id),
                "sourceContainerId": copy.deepcopy(source_container_id),
                "source": {
                    "file": source_file,
                    "pointer": pointer,
                },
            }

    for character in mechanics.get("characters", []):
        if not isinstance(character, dict):
            continue
        source = character.get("source")
        if not isinstance(source, dict):
            source = {}
        yield from emit(
            node=character.get("raw"),
            source_file=source.get("file"),
            source_pointer=source.get("pointer"),
            character_id=character.get("characterId"),
        )

    for effect in mechanics.get("effects", []):
        if not isinstance(effect, dict):
            continue
        source = effect.get("source")
        if not isinstance(source, dict):
            source = {}
        yield from emit(
            node=effect.get("raw"),
            source_file=source.get("file"),
            source_pointer=source.get("pointer"),
        )

    for action in mechanics.get("actions", []):
        if not isinstance(action, dict):
            continue
        source = action.get("source")
        if not isinstance(source, dict):
            source = {}
        yield from emit(
            node=action.get("raw"),
            source_file=source.get("file"),
            source_pointer=source.get("pointer"),
            character_id=action.get("characterId"),
            ability_type=action.get("abilityType"),
            source_action_id=action.get("id"),
            source_container_id=action.get("containerId"),
        )

    for item in mechanics.get("diagnostics", []):
        if not isinstance(item, dict):
            continue
        raw = item.get("raw")
        source = item.get("source")
        if not isinstance(raw, dict) or not isinstance(source, dict):
            continue
        raw_value = raw.get("procId")
        source_file = source.get("file")
        source_pointer = source.get("pointer")
        if not all(
            isinstance(value, str)
            for value in (raw_value, source_file, source_pointer)
        ):
            continue
        key = (source_file, source_pointer, raw_value)
        if key in seen:
            continue
        seen.add(key)
        yield {
            "rawValue": raw_value,
            "characterId": copy.deepcopy(item.get("characterId")),
            "abilityType": copy.deepcopy(item.get("abilityType")),
            "sourceActionId": copy.deepcopy(item.get("actionId")),
            "sourceContainerId": copy.deepcopy(item.get("containerId")),
            "source": {
                "file": source_file,
                "pointer": source_pointer,
            },
        }
