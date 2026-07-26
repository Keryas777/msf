"""Recognized ability and passive-trigger containers from character records."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..containers import (
    ABILITY_ORDER,
    ACTIVE_ABILITY_TYPES,
    PASSIVE_ABILITY_TYPES,
    ContainerEngine,
    extracted_property_names,
)
from ..diagnostics import diagnostic
from ..json_pointer import append_pointer


@dataclass
class AbilityParseSummary:
    ability_container_ids: list[str]
    extracted_character_keys: set[str]
    ability_count: int
    passive_trigger_count: int


def _parse_alternatives(
    *,
    character_id: str,
    ability_type: str,
    ability_node: dict[str, Any],
    ability_pointer: str,
    ability_container: dict[str, Any],
    engine: ContainerEngine,
) -> None:
    alternatives = ability_node.get("alternatives")
    if alternatives is None:
        return
    if not isinstance(alternatives, list):
        engine.diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNEXPECTED_ABILITY_STRUCTURE",
                message=(
                    "La propriété alternatives est conservée mais n’est pas un tableau."
                ),
                character_id=character_id,
                ability_type=ability_type,
                container_id=ability_container["id"],
                source_file=engine.source_file,
                source_pointer=append_pointer(ability_pointer, "alternatives"),
                raw=alternatives,
            )
        )
        return

    for index, alternative_node in enumerate(alternatives):
        alternative_pointer = append_pointer(
            ability_pointer,
            "alternatives",
            index,
        )
        alternative = engine.create_container(
            character_id=character_id,
            ability_type=ability_type,
            container_type="ability_alternative",
            parent_container_id=ability_container["id"],
            order=index,
            node=alternative_node,
            classification=(
                "mechanical"
                if isinstance(alternative_node, dict)
                else "technical-review"
            ),
            source_pointer=alternative_pointer,
            extracted_properties=extracted_property_names(
                alternative_node,
                extra={"actions"},
            ),
            unrecognized_properties=not isinstance(alternative_node, dict),
        )
        if not isinstance(alternative_node, dict):
            engine.diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_ABILITY_STRUCTURE",
                    message="Alternative conservée avec une structure inattendue.",
                    character_id=character_id,
                    ability_type=ability_type,
                    container_id=alternative["id"],
                    source_file=engine.source_file,
                    source_pointer=alternative_pointer,
                    raw=alternative_node,
                )
            )
        engine.parse_direct_actions(
            node=alternative_node,
            node_pointer=alternative_pointer,
            container=alternative,
        )


def _parse_active_ability(
    *,
    character_id: str,
    ability_type: str,
    ability_node: Any,
    ability_pointer: str,
    ability_container: dict[str, Any],
    engine: ContainerEngine,
) -> None:
    if not isinstance(ability_node, dict):
        engine.diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNEXPECTED_ABILITY_STRUCTURE",
                message=(
                    "Capacité active conservée avec une structure autre qu’un objet."
                ),
                character_id=character_id,
                ability_type=ability_type,
                container_id=ability_container["id"],
                source_file=engine.source_file,
                source_pointer=ability_pointer,
                raw=ability_node,
            )
        )
        return

    engine.parse_direct_actions(
        node=ability_node,
        node_pointer=ability_pointer,
        container=ability_container,
    )
    _parse_alternatives(
        character_id=character_id,
        ability_type=ability_type,
        ability_node=ability_node,
        ability_pointer=ability_pointer,
        ability_container=ability_container,
        engine=engine,
    )


def _parse_passive_ability(
    *,
    character_id: str,
    ability_type: str,
    ability_node: Any,
    ability_pointer: str,
    ability_container: dict[str, Any],
    engine: ContainerEngine,
) -> int:
    if not isinstance(ability_node, list):
        engine.diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNEXPECTED_PASSIVE_STRUCTURE",
                message="Passif conservé avec une structure autre qu’un tableau.",
                character_id=character_id,
                ability_type=ability_type,
                container_id=ability_container["id"],
                source_file=engine.source_file,
                source_pointer=ability_pointer,
                raw=ability_node,
            )
        )
        return 0

    for index, trigger_node in enumerate(ability_node):
        trigger_pointer = append_pointer(ability_pointer, index)
        trigger = engine.create_container(
            character_id=character_id,
            ability_type=ability_type,
            container_type="passive_trigger",
            parent_container_id=ability_container["id"],
            order=index,
            node=trigger_node,
            classification=(
                "mechanical"
                if isinstance(trigger_node, dict)
                else "technical-review"
            ),
            source_pointer=trigger_pointer,
            extracted_properties=extracted_property_names(
                trigger_node,
                extra={"actions"},
            ),
            unrecognized_properties=not isinstance(trigger_node, dict),
        )
        if not isinstance(trigger_node, dict):
            engine.diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_PASSIVE_STRUCTURE",
                    message=(
                        "Déclencheur passif conservé avec une structure inattendue."
                    ),
                    character_id=character_id,
                    ability_type=ability_type,
                    container_id=trigger["id"],
                    source_file=engine.source_file,
                    source_pointer=trigger_pointer,
                    raw=trigger_node,
                )
            )
        engine.parse_direct_actions(
            node=trigger_node,
            node_pointer=trigger_pointer,
            container=trigger,
        )
    return len(ability_node)


def parse_abilities(
    *,
    character_id: str,
    node: dict[str, Any],
    character_pointer: str,
    engine: ContainerEngine,
) -> AbilityParseSummary:
    ability_container_ids: list[str] = []
    extracted_character_keys: set[str] = set()
    ability_count = 0
    passive_trigger_count = 0

    for ability_order, ability_type in enumerate(ABILITY_ORDER):
        if ability_type not in node:
            continue
        extracted_character_keys.add(ability_type)
        ability_count += 1
        ability_node = node[ability_type]
        ability_pointer = append_pointer(character_pointer, ability_type)
        valid_structure = (
            ability_type in ACTIVE_ABILITY_TYPES
            and isinstance(ability_node, dict)
        ) or (
            ability_type in PASSIVE_ABILITY_TYPES
            and isinstance(ability_node, list)
        )
        ability_container = engine.create_container(
            character_id=character_id,
            ability_type=ability_type,
            container_type="ability",
            parent_container_id=None,
            order=ability_order,
            node=ability_node,
            classification="mechanical" if valid_structure else "technical-review",
            source_pointer=ability_pointer,
            extracted_properties=extracted_property_names(
                ability_node,
                extra={"actions", "alternatives"},
            ),
            unrecognized_properties=not isinstance(ability_node, (dict, list)),
        )
        ability_container_ids.append(ability_container["id"])

        if ability_type in ACTIVE_ABILITY_TYPES:
            _parse_active_ability(
                character_id=character_id,
                ability_type=ability_type,
                ability_node=ability_node,
                ability_pointer=ability_pointer,
                ability_container=ability_container,
                engine=engine,
            )
        else:
            passive_trigger_count += _parse_passive_ability(
                character_id=character_id,
                ability_type=ability_type,
                ability_node=ability_node,
                ability_pointer=ability_pointer,
                ability_container=ability_container,
                engine=engine,
            )

    return AbilityParseSummary(
        ability_container_ids=ability_container_ids,
        extracted_character_keys=extracted_character_keys,
        ability_count=ability_count,
        passive_trigger_count=passive_trigger_count,
    )
