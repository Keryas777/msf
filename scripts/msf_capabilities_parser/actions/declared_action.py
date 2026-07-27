"""Adapter for source entries that explicitly declare an ``action`` field."""

from __future__ import annotations

from typing import Any

from .common import ActionContext, AdapterResult, build_adapter_result


class DeclaredActionAdapter:
    name = "declared_action"

    def can_handle(self, node: Any, _context: ActionContext) -> bool:
        return isinstance(node, dict) and "action" in node

    def parse(self, node: Any, context: ActionContext) -> AdapterResult:
        return build_adapter_result(
            node,
            context,
            raw_type=node["action"],
            explicitly_extracted={"action"},
            unrecognized_parameters=False,
        )
