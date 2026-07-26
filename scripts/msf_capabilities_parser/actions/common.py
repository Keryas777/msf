"""Shared action-adapter contract and extraction helpers."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from ..diagnostics import source_reference
from ..json_pointer import append_pointer


CONDITION_KEYS = (
    "only_if",
    "only_if_any",
    "only_if_target",
    "apply_if",
    "target_apply_if",
    "only_if_outcome",
    "if_has_outcomes",
)


@dataclass(frozen=True)
class ActionContext:
    source_file: str
    source_pointer: str
    container_id: str
    character_id: str
    ability_type: str | None
    action_id: str


@dataclass(frozen=True)
class AdapterResult:
    raw_type: Any
    target: Any
    target_present: bool
    conditions: list[dict[str, Any]]
    parameters: dict[str, Any]
    property_handling: dict[str, list[str]]
    consumed_keys: frozenset[str]
    diagnostics: list[dict[str, Any]]


def extract_conditions(
    node: dict[str, Any], context: ActionContext
) -> list[dict[str, Any]]:
    conditions: list[dict[str, Any]] = []
    for key in CONDITION_KEYS:
        if key not in node:
            continue
        conditions.append(
            {
                "kind": key,
                "source": source_reference(
                    context.source_file,
                    append_pointer(context.source_pointer, key),
                ),
                "raw": copy.deepcopy(node[key]),
            }
        )
    return conditions


def build_adapter_result(
    node: Any,
    context: ActionContext,
    *,
    raw_type: Any,
    explicitly_extracted: set[str],
    unrecognized_parameters: bool,
    diagnostics: list[dict[str, Any]] | None = None,
) -> AdapterResult:
    if not isinstance(node, dict):
        return AdapterResult(
            raw_type=raw_type,
            target=None,
            target_present=False,
            conditions=[],
            parameters={},
            property_handling={
                "extracted": [],
                "rawOnly": [],
                "ignored": [],
                "unrecognized": ["<value>"],
            },
            consumed_keys=frozenset(),
            diagnostics=list(diagnostics or []),
        )

    condition_keys = {key for key in CONDITION_KEYS if key in node}
    target_present = "target" in node
    structural_keys = condition_keys | ({"target"} if target_present else set())
    if "action" in node:
        structural_keys.add("action")

    parameters = {
        key: copy.deepcopy(value)
        for key, value in node.items()
        if key not in structural_keys
    }
    parameter_keys = set(parameters)

    if unrecognized_parameters:
        extracted = explicitly_extracted | structural_keys
        unrecognized = parameter_keys - explicitly_extracted
        raw_only: set[str] = set()
        consumed = extracted
    else:
        extracted = set(node)
        unrecognized = set()
        raw_only = set()
        consumed = set(node)

    return AdapterResult(
        raw_type=copy.deepcopy(raw_type),
        target=copy.deepcopy(node.get("target")),
        target_present=target_present,
        conditions=extract_conditions(node, context),
        parameters=parameters,
        property_handling={
            "extracted": sorted(extracted),
            "rawOnly": sorted(raw_only),
            "ignored": [],
            "unrecognized": sorted(unrecognized),
        },
        consumed_keys=frozenset(consumed),
        diagnostics=list(diagnostics or []),
    )
