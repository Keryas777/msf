"""Adapter for action entries driven by ``stat_modifier`` without ``action``."""

from __future__ import annotations

from typing import Any

from .common import ActionContext, AdapterResult, build_adapter_result


class StatModifierOnlyAdapter:
    name = "stat_modifier_only"

    def can_handle(self, node: Any, _context: ActionContext) -> bool:
        return (
            isinstance(node, dict)
            and "action" not in node
            and "stat_modifier" in node
        )

    def parse(self, node: Any, context: ActionContext) -> AdapterResult:
        return build_adapter_result(
            node,
            context,
            raw_type="stat_modifier",
            explicitly_extracted={"stat_modifier"},
            unrecognized_parameters=False,
        )
