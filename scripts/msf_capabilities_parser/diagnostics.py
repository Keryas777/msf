"""Stable structured diagnostics for parsing and audit results."""

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
        "INVALID_SOURCE_ROOT",
        "MISSING_DATA_ROOT",
        "INVALID_DATA_ROOT_TYPE",
        "UNEXPECTED_ABILITY_TYPE",
        "UNEXPECTED_ABILITY_STRUCTURE",
        "UNEXPECTED_PASSIVE_STRUCTURE",
        "UNCLASSIFIED_ACTION_STRUCTURE",
        "UNHANDLED_PROPERTY",
        "DUPLICATE_ID",
        "ORPHAN_CONTAINER",
        "ORPHAN_ACTION",
        "UNRESOLVED_PROC_REFERENCE",
        "INVALID_SOURCE_POINTER",
        "INTERNAL_AUDIT_MISMATCH",
        "TECHNICAL_REVIEW_STRUCTURE",
        "UNEXPECTED_EFFECT_STRUCTURE",
    }
)


def source_reference(file: str, pointer: str) -> dict[str, str]:
    return {
        "file": file,
        "pointer": pointer,
    }


def diagnostic(
    *,
    severity: str,
    code: str,
    message: str,
    source_file: str,
    source_pointer: str,
    character_id: str | None = None,
    ability_type: str | None = None,
    container_id: str | None = None,
    action_id: str | None = None,
    raw: Any = None,
) -> dict[str, Any]:
    """Build a diagnostic with a uniform, serialization-friendly shape."""

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
        "containerId": container_id,
        "actionId": action_id,
        "source": source_reference(source_file, source_pointer),
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
        str(item.get("message", "")),
    )


def sort_diagnostics(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=diagnostic_sort_key)
