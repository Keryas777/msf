"""Stable diagnostics emitted by the MSF capabilities normalizer."""

from __future__ import annotations

import copy
from typing import Any


SEVERITY_ORDER = {
    "error": 0,
    "warning": 1,
    "info": 2,
}

DIAGNOSTIC_CODES = frozenset(
    {
        "INVALID_NORMALIZER_INPUT",
        "UNSUPPORTED_EFFECT_REFERENCE_SHAPE",
        "UNRESOLVED_EFFECT_REFERENCE",
        "DANGLING_ACTION_DEPENDENCY",
        "INVALID_BOOLEAN_VALUE",
        "DUPLICATE_ID",
        "ORPHAN_CONTEXT",
        "ORPHAN_OPERATION",
        "UNCOVERED_SUPPORTED_ACTION",
        "INTERNAL_AUDIT_MISMATCH",
    }
)


def diagnostic(
    *,
    severity: str,
    code: str,
    message: str,
    source_file: str,
    source_pointer: str,
    character_id: str | None = None,
    ability_type: str | None = None,
    context_id: str | None = None,
    source_action_id: str | None = None,
    operation_id: str | None = None,
    raw: Any = None,
) -> dict[str, Any]:
    if severity not in SEVERITY_ORDER:
        raise ValueError(f"Unknown diagnostic severity: {severity!r}.")
    if code not in DIAGNOSTIC_CODES:
        raise ValueError(f"Unknown diagnostic code: {code!r}.")

    return {
        "severity": severity,
        "code": code,
        "message": message,
        "characterId": character_id,
        "abilityType": ability_type,
        "contextId": context_id,
        "sourceActionId": source_action_id,
        "operationId": operation_id,
        "source": {
            "file": source_file,
            "pointer": source_pointer,
        },
        "raw": copy.deepcopy({} if raw is None else raw),
    }


def diagnostic_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
    source = item.get("source")
    if not isinstance(source, dict):
        source = {}
    return (
        SEVERITY_ORDER.get(str(item.get("severity")), len(SEVERITY_ORDER)),
        str(item.get("code", "")),
        str(source.get("file", "")),
        str(source.get("pointer", "")),
        str(item.get("sourceActionId", "")),
        str(item.get("operationId", "")),
        str(item.get("message", "")),
    )


def sort_diagnostics(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=diagnostic_sort_key)
