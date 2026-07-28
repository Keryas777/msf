"""Small, lossless value normalizers used by capability operations."""

from __future__ import annotations

import copy
from typing import Any


def normalize_progression(
    value: Any,
    *,
    source_field: str,
    source_pointer: str,
) -> dict[str, Any]:
    """Preserve a scalar/array while exposing a uniform level-value view."""

    if isinstance(value, list):
        values = copy.deepcopy(value)
        source_shape = "array"
    else:
        values = [copy.deepcopy(value)]
        source_shape = "scalar"

    return {
        "sourceField": source_field,
        "sourcePointer": source_pointer,
        "sourceShape": source_shape,
        "values": values,
        "maxLevelValue": copy.deepcopy(values[-1]) if values else None,
    }


def normalize_boolean(value: Any) -> tuple[bool | None, bool]:
    """Return a boolean plus whether the source representation was recognized."""

    if type(value) is bool:
        return value, True
    if isinstance(value, str):
        lowered = value.lower()
        if lowered == "true":
            return True, True
        if lowered == "false":
            return False, True
    return None, False


def normalize_boolean_record(
    value: Any,
    *,
    source_field: str,
    source_pointer: str,
) -> dict[str, Any]:
    normalized, valid = normalize_boolean(value)
    return {
        "sourceField": source_field,
        "sourcePointer": source_pointer,
        "raw": copy.deepcopy(value),
        "value": normalized,
        "valid": valid,
    }


def normalize_expression(value: Any) -> Any:
    """Normalize textual booleans without flattening nested expressions."""

    if isinstance(value, dict):
        return {
            key: normalize_expression(child)
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [normalize_expression(child) for child in value]
    normalized, valid = normalize_boolean(value)
    return normalized if valid else copy.deepcopy(value)
