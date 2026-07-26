"""Lossless fallback adapter for unknown action-entry structures."""

from __future__ import annotations

from typing import Any

from ..diagnostics import diagnostic
from .common import ActionContext, AdapterResult, build_adapter_result


class GenericUnclassifiedAdapter:
    name = "generic_unclassified"

    def can_handle(self, _node: Any, _context: ActionContext) -> bool:
        return True

    def parse(self, node: Any, context: ActionContext) -> AdapterResult:
        if isinstance(node, dict):
            raw_type = "unclassified_object"
        elif isinstance(node, list):
            raw_type = "unclassified_array"
        else:
            raw_type = f"unclassified_{type(node).__name__}"

        item = diagnostic(
            severity="warning",
            code="UNCLASSIFIED_ACTION_STRUCTURE",
            message="Action conservée par l’adaptateur générique.",
            character_id=context.character_id,
            ability_type=context.ability_type,
            container_id=context.container_id,
            action_id=context.action_id,
            source_file=context.source_file,
            source_pointer=context.source_pointer,
            raw=node,
        )
        return build_adapter_result(
            node,
            context,
            raw_type=raw_type,
            explicitly_extracted=set(),
            unrecognized_parameters=True,
            diagnostics=[item],
        )
