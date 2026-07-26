"""Ordered registry for structural action adapters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .common import ActionContext, AdapterResult
from .declared_action import DeclaredActionAdapter
from .generic import GenericUnclassifiedAdapter
from .stat_modifier import StatModifierOnlyAdapter


class ActionAdapter(Protocol):
    name: str

    def can_handle(self, node: Any, context: ActionContext) -> bool: ...

    def parse(self, node: Any, context: ActionContext) -> AdapterResult: ...


@dataclass(frozen=True)
class RegisteredAdapterResult:
    adapter_name: str
    result: AdapterResult


class ActionAdapterRegistry:
    """Select the first matching adapter and always end with a lossless fallback."""

    def __init__(self, adapters: tuple[ActionAdapter, ...] | None = None) -> None:
        self.adapters = adapters or (
            DeclaredActionAdapter(),
            StatModifierOnlyAdapter(),
            GenericUnclassifiedAdapter(),
        )
        if not self.adapters or self.adapters[-1].name != "generic_unclassified":
            raise ValueError("The action adapter registry must end with the generic fallback.")

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(adapter.name for adapter in self.adapters)

    def parse(self, node: Any, context: ActionContext) -> RegisteredAdapterResult:
        for adapter in self.adapters:
            if adapter.can_handle(node, context):
                return RegisteredAdapterResult(
                    adapter_name=adapter.name,
                    result=adapter.parse(node, context),
                )
        raise RuntimeError("Action adapter registry has no usable fallback.")
