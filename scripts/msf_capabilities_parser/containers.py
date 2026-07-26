"""Shared container and action extraction engine."""

from __future__ import annotations

import copy
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

from .actions.common import ActionContext, CONDITION_KEYS
from .actions.registry import ActionAdapterRegistry
from .diagnostics import diagnostic, source_reference
from .ids import IdRegistry
from .json_pointer import append_pointer


ABILITY_ORDER = (
    "basic",
    "special",
    "ultimate",
    "passive",
    "basic_empower",
    "special_empower",
    "ultimate_empower",
    "passive_empower",
)
ACTIVE_ABILITY_TYPES = frozenset(
    {
        "basic",
        "special",
        "ultimate",
        "basic_empower",
        "special_empower",
        "ultimate_empower",
    }
)
PASSIVE_ABILITY_TYPES = frozenset({"passive", "passive_empower"})
TECHNICAL_KEYS = (
    "safety",
    "safety_empower",
    "counter",
    "counter_empower",
    "passive_visuals",
)

CONTEXT_FIELDS = (
    ("exec", "exec"),
    ("exec_for", "execFor"),
    ("exec_value", "execValue"),
    ("exec_on_stun", "execOnStun"),
    ("exec_on_ability_used", "execOnAbilityUsed"),
    ("can_trigger_on_assist", "canTriggerOnAssist"),
    ("can_trigger_on_counter", "canTriggerOnCounter"),
    ("target_primary", "targetPrimary"),
    ("exclude_Primary", "excludePrimary"),
    ("exclude_Secondary", "excludeSecondary"),
    ("feature_source", "featureSource"),
    ("skip_for_killed_targets", "skipForKilledTargets"),
    ("cost", "cost"),
    ("start_energy", "startEnergy"),
    ("power_mul", "powerMultiplier"),
    ("stat_lock", "statLock"),
    ("ai_filter", "aiFilter"),
    ("need_ally", "needAlly"),
    ("for_procs", "forProcs"),
)


@dataclass(frozen=True)
class ActionArray:
    pointer: str
    items: list[Any]
    parent_pointer: str
    parent: Any
    path: tuple[object, ...]


def extract_context(
    node: Any,
    *,
    technical_key: str | None = None,
) -> dict[str, Any]:
    context: dict[str, Any] = {}
    if technical_key is not None:
        context["technicalKey"] = technical_key
    if not isinstance(node, dict):
        return context
    for source_key, output_key in CONTEXT_FIELDS:
        if source_key in node:
            context[output_key] = copy.deepcopy(node[source_key])
    return context


def extract_conditions(
    node: Any,
    *,
    source_file: str,
    source_pointer: str,
) -> list[dict[str, Any]]:
    if not isinstance(node, dict):
        return []
    return [
        {
            "kind": key,
            "source": source_reference(
                source_file,
                append_pointer(source_pointer, key),
            ),
            "raw": copy.deepcopy(node[key]),
        }
        for key in CONDITION_KEYS
        if key in node
    ]


def property_handling(
    node: Any,
    *,
    extracted: Iterable[str] = (),
    unrecognized: bool = False,
) -> dict[str, list[str]]:
    if isinstance(node, dict):
        source_keys = set(node)
        extracted_keys = source_keys & set(extracted)
        remaining = source_keys - extracted_keys
        return {
            "extracted": sorted(extracted_keys),
            "rawOnly": [] if unrecognized else sorted(remaining),
            "ignored": [],
            "unrecognized": sorted(remaining) if unrecognized else [],
        }
    if isinstance(node, list):
        return {
            "extracted": ["<arrayEntries>"],
            "rawOnly": [],
            "ignored": [],
            "unrecognized": [],
        }
    return {
        "extracted": [],
        "rawOnly": [],
        "ignored": [],
        "unrecognized": ["<value>"],
    }


def extracted_property_names(
    node: Any,
    *,
    extra: Iterable[str] = (),
) -> set[str]:
    if not isinstance(node, dict):
        return set()
    extracted = {
        source_key
        for source_key, _output_key in CONTEXT_FIELDS
        if source_key in node
    }
    extracted.update(key for key in CONDITION_KEYS if key in node)
    extracted.update(key for key in extra if key in node)
    return extracted


def walk_action_arrays(
    node: Any,
    pointer: str,
    path: tuple[object, ...] = (),
) -> Iterable[ActionArray]:
    if isinstance(node, dict):
        for key, value in node.items():
            child_pointer = append_pointer(pointer, key)
            child_path = (*path, key)
            if key == "actions" and isinstance(value, list):
                yield ActionArray(
                    pointer=child_pointer,
                    items=value,
                    parent_pointer=pointer,
                    parent=node,
                    path=child_path,
                )
            yield from walk_action_arrays(value, child_pointer, child_path)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from walk_action_arrays(
                value,
                append_pointer(pointer, index),
                (*path, index),
            )


def longest_pointer_prefix(
    pointer: str,
    records_by_pointer: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    matches = [
        record
        for candidate, record in records_by_pointer.items()
        if pointer == candidate or pointer.startswith(f"{candidate}/")
    ]
    if not matches:
        return None
    return max(matches, key=lambda record: len(record["source"]["pointer"]))


class ContainerEngine:
    """Build containers and actions through one source-agnostic contract."""

    def __init__(
        self,
        *,
        source_file: str,
        ids: IdRegistry,
        registry: ActionAdapterRegistry,
    ) -> None:
        self.source_file = source_file
        self.ids = ids
        self.registry = registry
        self.containers: list[dict[str, Any]] = []
        self.actions: list[dict[str, Any]] = []
        self.diagnostics: list[dict[str, Any]] = []
        self.adapter_counts: Counter[str] = Counter(
            {name: 0 for name in registry.names}
        )
        self.processed_action_arrays: set[str] = set()
        self.containers_by_pointer: dict[str, dict[str, Any]] = {}
        self.actions_by_pointer: dict[str, dict[str, Any]] = {}

    def create_container(
        self,
        *,
        character_id: str,
        ability_type: str | None,
        container_type: str,
        parent_container_id: str | None,
        order: int,
        node: Any,
        classification: str,
        source_pointer: str,
        technical_key: str | None = None,
        extracted_properties: Iterable[str] = (),
        unrecognized_properties: bool = False,
    ) -> dict[str, Any]:
        identifier = self.ids.claim(
            "ctr",
            f"container|{self.source_file}|{source_pointer}",
        )
        record = {
            "id": identifier,
            "characterId": character_id,
            "abilityType": ability_type,
            "containerType": container_type,
            "parentContainerId": parent_container_id,
            "order": order,
            "context": extract_context(node, technical_key=technical_key),
            "conditions": extract_conditions(
                node,
                source_file=self.source_file,
                source_pointer=source_pointer,
            ),
            "actionIds": [],
            "classification": classification,
            "propertyHandling": property_handling(
                node,
                extracted=extracted_properties,
                unrecognized=unrecognized_properties,
            ),
            "source": source_reference(self.source_file, source_pointer),
            "raw": copy.deepcopy(node),
        }
        self.containers.append(record)
        self.containers_by_pointer[source_pointer] = record
        return record

    def parse_action_array(
        self,
        *,
        action_array: list[Any],
        action_array_pointer: str,
        container: dict[str, Any],
    ) -> None:
        for index, node in enumerate(action_array):
            action_pointer = append_pointer(action_array_pointer, index)
            identifier = self.ids.claim(
                "act",
                f"action|{self.source_file}|{action_pointer}",
            )
            context = ActionContext(
                source_file=self.source_file,
                source_pointer=action_pointer,
                container_id=container["id"],
                character_id=container["characterId"],
                ability_type=container["abilityType"],
                action_id=identifier,
            )
            adapted = self.registry.parse(node, context)
            result = adapted.result
            record = {
                "id": identifier,
                "containerId": container["id"],
                "characterId": container["characterId"],
                "abilityType": container["abilityType"],
                "order": index,
                "adapter": adapted.adapter_name,
                "rawType": result.raw_type,
                "target": result.target,
                "targetPresent": result.target_present,
                "conditions": result.conditions,
                "parameters": result.parameters,
                "propertyHandling": result.property_handling,
                "source": source_reference(self.source_file, action_pointer),
                "raw": copy.deepcopy(node),
            }
            self.actions.append(record)
            self.actions_by_pointer[action_pointer] = record
            container["actionIds"].append(identifier)
            self.diagnostics.extend(result.diagnostics)
            self.adapter_counts[adapted.adapter_name] += 1

    def parse_direct_actions(
        self,
        *,
        node: Any,
        node_pointer: str,
        container: dict[str, Any],
    ) -> None:
        if not isinstance(node, dict) or "actions" not in node:
            return

        action_array_pointer = append_pointer(node_pointer, "actions")
        action_array = node["actions"]
        if not isinstance(action_array, list):
            self.diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_ABILITY_STRUCTURE",
                    message=(
                        "La propriété actions est conservée mais n’est pas un tableau."
                    ),
                    character_id=container["characterId"],
                    ability_type=container["abilityType"],
                    container_id=container["id"],
                    source_file=self.source_file,
                    source_pointer=action_array_pointer,
                    raw=action_array,
                )
            )
            return

        self.processed_action_arrays.add(action_array_pointer)
        self.parse_action_array(
            action_array=action_array,
            action_array_pointer=action_array_pointer,
            container=container,
        )

    def find_container(self, pointer: str) -> dict[str, Any] | None:
        return longest_pointer_prefix(pointer, self.containers_by_pointer)

    def find_action(self, pointer: str) -> dict[str, Any] | None:
        return longest_pointer_prefix(pointer, self.actions_by_pointer)
