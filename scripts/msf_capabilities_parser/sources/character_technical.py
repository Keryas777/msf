"""Technical-review and fallback containers from character records."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..containers import (
    TECHNICAL_KEYS,
    ActionArray,
    ContainerEngine,
    extracted_property_names,
)
from ..diagnostics import diagnostic
from ..json_pointer import append_pointer


@dataclass
class TechnicalParseSummary:
    technical_container_ids: list[str]
    extracted_character_keys: set[str]
    unhandled_node_count: int


def _parse_passive_visuals(
    *,
    character_id: str,
    technical_node: Any,
    technical_pointer: str,
    technical: dict[str, Any],
    engine: ContainerEngine,
) -> None:
    engine.diagnostics.append(
        diagnostic(
            severity="info",
            code="TECHNICAL_REVIEW_STRUCTURE",
            message=(
                "passive_visuals est conservé séparément pour revue "
                "technique, sans interprétation gameplay."
            ),
            character_id=character_id,
            container_id=technical["id"],
            source_file=engine.source_file,
            source_pointer=technical_pointer,
            raw={},
        )
    )
    if not isinstance(technical_node, list):
        engine.diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNEXPECTED_PASSIVE_STRUCTURE",
                message="passive_visuals est conservé mais n’est pas un tableau.",
                character_id=character_id,
                container_id=technical["id"],
                source_file=engine.source_file,
                source_pointer=technical_pointer,
                raw=technical_node,
            )
        )
        return

    for index, visual_node in enumerate(technical_node):
        visual_pointer = append_pointer(technical_pointer, index)
        visual = engine.create_container(
            character_id=character_id,
            ability_type=None,
            container_type="technical_trigger",
            parent_container_id=technical["id"],
            order=index,
            node=visual_node,
            classification="technical-review",
            source_pointer=visual_pointer,
            technical_key="passive_visuals",
            extracted_properties=extracted_property_names(
                visual_node,
                extra={"actions"},
            ),
            unrecognized_properties=not isinstance(visual_node, dict),
        )
        engine.parse_direct_actions(
            node=visual_node,
            node_pointer=visual_pointer,
            container=visual,
        )


def _parse_known_technical(
    *,
    character_id: str,
    node: dict[str, Any],
    character_pointer: str,
    engine: ContainerEngine,
) -> tuple[list[str], set[str]]:
    technical_container_ids: list[str] = []
    extracted_character_keys: set[str] = set()

    for technical_order, technical_key in enumerate(TECHNICAL_KEYS):
        if technical_key not in node:
            continue
        extracted_character_keys.add(technical_key)
        technical_node = node[technical_key]
        technical_pointer = append_pointer(character_pointer, technical_key)
        technical = engine.create_container(
            character_id=character_id,
            ability_type=None,
            container_type="technical",
            parent_container_id=None,
            order=technical_order,
            node=technical_node,
            classification="technical-review",
            source_pointer=technical_pointer,
            technical_key=technical_key,
            extracted_properties=extracted_property_names(
                technical_node,
                extra={"actions"},
            ),
            unrecognized_properties=not isinstance(technical_node, (dict, list)),
        )
        technical_container_ids.append(technical["id"])

        if technical_key == "passive_visuals":
            _parse_passive_visuals(
                character_id=character_id,
                technical_node=technical_node,
                technical_pointer=technical_pointer,
                technical=technical,
                engine=engine,
            )
            continue

        if not isinstance(technical_node, dict):
            engine.diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_ABILITY_STRUCTURE",
                    message="Structure technique conservée avec un type inattendu.",
                    character_id=character_id,
                    container_id=technical["id"],
                    source_file=engine.source_file,
                    source_pointer=technical_pointer,
                    raw=technical_node,
                )
            )
        engine.parse_direct_actions(
            node=technical_node,
            node_pointer=technical_pointer,
            container=technical,
        )

    return technical_container_ids, extracted_character_keys


def parse_unclassified_action_arrays(
    *,
    character_id: str,
    action_arrays: list[ActionArray],
    engine: ContainerEngine,
) -> list[str]:
    fallback_container_ids: list[str] = []
    unprocessed = [
        item
        for item in action_arrays
        if item.pointer not in engine.processed_action_arrays
    ]
    for fallback_order, action_array in enumerate(unprocessed):
        nearest = engine.find_container(action_array.parent_pointer)
        parent_id = nearest["id"] if nearest is not None else None
        ability_type = nearest["abilityType"] if nearest is not None else None
        branch_key = (
            str(action_array.path[-2])
            if len(action_array.path) >= 2
            else "unclassified"
        )
        fallback = engine.create_container(
            character_id=character_id,
            ability_type=ability_type,
            container_type="unclassified_branch",
            parent_container_id=parent_id,
            order=fallback_order,
            node=action_array.parent,
            classification="technical-review",
            source_pointer=action_array.parent_pointer,
            technical_key=branch_key,
            extracted_properties={"actions"},
            unrecognized_properties=True,
        )
        fallback_container_ids.append(fallback["id"])
        engine.diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNEXPECTED_ABILITY_STRUCTURE",
                message=(
                    "Tableau actions[] inconnu conservé dans un conteneur "
                    "de revue technique."
                ),
                character_id=character_id,
                ability_type=ability_type,
                container_id=fallback["id"],
                source_file=engine.source_file,
                source_pointer=action_array.parent_pointer,
                raw={},
            )
        )
        engine.processed_action_arrays.add(action_array.pointer)
        engine.parse_action_array(
            action_array=action_array.items,
            action_array_pointer=action_array.pointer,
            container=fallback,
        )
    return fallback_container_ids


def parse_technical_structures(
    *,
    character_id: str,
    node: dict[str, Any],
    character_pointer: str,
    action_arrays: list[ActionArray],
    engine: ContainerEngine,
) -> TechnicalParseSummary:
    technical_ids, extracted_keys = _parse_known_technical(
        character_id=character_id,
        node=node,
        character_pointer=character_pointer,
        engine=engine,
    )
    fallback_ids = parse_unclassified_action_arrays(
        character_id=character_id,
        action_arrays=action_arrays,
        engine=engine,
    )
    technical_ids.extend(fallback_ids)
    return TechnicalParseSummary(
        technical_container_ids=technical_ids,
        extracted_character_keys=extracted_keys,
        unhandled_node_count=len(fallback_ids),
    )
