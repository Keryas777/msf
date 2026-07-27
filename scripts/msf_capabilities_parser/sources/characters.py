"""Structural adapter for ``characters.json``."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Iterable, Protocol

from ..actions.registry import ActionAdapterRegistry
from ..containers import (
    ABILITY_ORDER,
    ContainerEngine,
    property_handling,
    walk_action_arrays,
)
from ..diagnostics import diagnostic, source_reference
from ..ids import IdRegistry
from ..json_pointer import append_pointer
from .character_abilities import parse_abilities
from .character_technical import (
    parse_technical_structures,
    parse_unclassified_action_arrays,
)


PROC_REFERENCE_SINGLE_KEYS = frozenset(
    {
        "proc",
        "specific_proc",
        "opposite_override",
    }
)
PROC_REFERENCE_MULTI_KEYS = frozenset(
    {
        "procs",
        "only_procs",
        "specific_procs",
        "onlyprocs",
        "exceptprocs",
        "for_procs",
    }
)


class CharacterSource(Protocol):
    file: str
    data: dict[str, Any]


@dataclass(frozen=True)
class ProcReference:
    proc_id: str
    source_pointer: str
    character_id: str
    ability_type: str | None
    container_id: str | None
    action_id: str | None


@dataclass
class CharacterParseResult:
    characters: list[dict[str, Any]]
    containers: list[dict[str, Any]]
    actions: list[dict[str, Any]]
    diagnostics: list[dict[str, Any]]
    proc_references: list[ProcReference]
    ability_count: int
    passive_trigger_count: int
    source_action_count: int
    adapter_counts: dict[str, int]
    unhandled_node_count: int


def _walk_proc_references(
    node: Any,
    pointer: str,
) -> Iterable[tuple[str, str]]:
    if isinstance(node, dict):
        for key, value in node.items():
            child_pointer = append_pointer(pointer, key)
            if key in PROC_REFERENCE_SINGLE_KEYS and isinstance(value, str):
                yield value, child_pointer
            elif key in PROC_REFERENCE_MULTI_KEYS:
                if isinstance(value, str):
                    yield value, child_pointer
                elif isinstance(value, list):
                    for index, item in enumerate(value):
                        if isinstance(item, str):
                            yield item, append_pointer(child_pointer, index)
            yield from _walk_proc_references(value, child_pointer)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _walk_proc_references(
                value,
                append_pointer(pointer, index),
            )


def _collect_proc_references(
    *,
    character_id: str,
    node: Any,
    character_pointer: str,
    engine: ContainerEngine,
) -> list[ProcReference]:
    references: list[ProcReference] = []
    for proc_id, reference_pointer in _walk_proc_references(
        node,
        character_pointer,
    ):
        action_record = engine.find_action(reference_pointer)
        container_record = engine.find_container(reference_pointer)
        references.append(
            ProcReference(
                proc_id=proc_id,
                source_pointer=reference_pointer,
                character_id=character_id,
                ability_type=(
                    action_record["abilityType"]
                    if action_record is not None
                    else (
                        container_record["abilityType"]
                        if container_record is not None
                        else None
                    )
                ),
                container_id=(
                    action_record["containerId"]
                    if action_record is not None
                    else (
                        container_record["id"]
                        if container_record is not None
                        else None
                    )
                ),
                action_id=action_record["id"] if action_record is not None else None,
            )
        )
    return references


def _extract_traits(
    *,
    character_id: str,
    node: dict[str, Any],
    character_pointer: str,
    engine: ContainerEngine,
) -> tuple[list[Any], set[str]]:
    extracted_keys = {"traits"} if "traits" in node else set()
    traits = copy.deepcopy(node.get("traits", []))
    if isinstance(traits, list):
        return traits, extracted_keys

    engine.diagnostics.append(
        diagnostic(
            severity="warning",
            code="UNEXPECTED_ABILITY_TYPE",
            message="La propriété traits est conservée mais n’est pas un tableau.",
            character_id=character_id,
            source_file=engine.source_file,
            source_pointer=append_pointer(character_pointer, "traits"),
            raw=node.get("traits"),
        )
    )
    return [], extracted_keys


def _character_record(
    *,
    identifier: str,
    character_id: str,
    traits: list[Any],
    ability_container_ids: list[str],
    technical_container_ids: list[str],
    node: Any,
    extracted_keys: set[str],
    source_file: str,
    character_pointer: str,
    unrecognized: bool = False,
) -> dict[str, Any]:
    return {
        "id": identifier,
        "characterId": character_id,
        "containerType": "character",
        "traits": traits,
        "abilityContainerIds": ability_container_ids,
        "technicalContainerIds": technical_container_ids,
        "propertyHandling": property_handling(
            node,
            extracted=extracted_keys,
            unrecognized=unrecognized,
        ),
        "source": source_reference(source_file, character_pointer),
        "raw": copy.deepcopy(node),
    }


def parse_characters(
    source: CharacterSource,
    ids: IdRegistry,
    registry: ActionAdapterRegistry,
) -> CharacterParseResult:
    characters: list[dict[str, Any]] = []
    proc_references: list[ProcReference] = []
    engine = ContainerEngine(
        source_file=source.file,
        ids=ids,
        registry=registry,
    )
    ability_count = 0
    passive_trigger_count = 0
    source_action_count = 0
    unhandled_node_count = 0

    for character_id in sorted(source.data):
        node = source.data[character_id]
        character_pointer = append_pointer("/Data", character_id)
        character_identifier = ids.claim(
            "chr",
            f"character|{source.file}|{character_pointer}",
        )
        action_arrays = list(walk_action_arrays(node, character_pointer))
        source_action_count += sum(len(item.items) for item in action_arrays)

        if not isinstance(node, dict):
            engine.diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_ABILITY_STRUCTURE",
                    message="La définition du personnage n’est pas un objet.",
                    character_id=character_id,
                    source_file=source.file,
                    source_pointer=character_pointer,
                    raw=node,
                )
            )
            technical_ids = parse_unclassified_action_arrays(
                character_id=character_id,
                action_arrays=action_arrays,
                engine=engine,
            )
            unhandled_node_count += len(technical_ids)
            characters.append(
                _character_record(
                    identifier=character_identifier,
                    character_id=character_id,
                    traits=[],
                    ability_container_ids=[],
                    technical_container_ids=technical_ids,
                    node=node,
                    extracted_keys=set(),
                    source_file=source.file,
                    character_pointer=character_pointer,
                    unrecognized=True,
                )
            )
            proc_references.extend(
                _collect_proc_references(
                    character_id=character_id,
                    node=node,
                    character_pointer=character_pointer,
                    engine=engine,
                )
            )
            continue

        traits, extracted_character_keys = _extract_traits(
            character_id=character_id,
            node=node,
            character_pointer=character_pointer,
            engine=engine,
        )
        abilities = parse_abilities(
            character_id=character_id,
            node=node,
            character_pointer=character_pointer,
            engine=engine,
        )
        technical = parse_technical_structures(
            character_id=character_id,
            node=node,
            character_pointer=character_pointer,
            action_arrays=action_arrays,
            engine=engine,
        )
        extracted_character_keys.update(abilities.extracted_character_keys)
        extracted_character_keys.update(technical.extracted_character_keys)
        ability_count += abilities.ability_count
        passive_trigger_count += abilities.passive_trigger_count
        unhandled_node_count += technical.unhandled_node_count

        proc_references.extend(
            _collect_proc_references(
                character_id=character_id,
                node=node,
                character_pointer=character_pointer,
                engine=engine,
            )
        )
        characters.append(
            _character_record(
                identifier=character_identifier,
                character_id=character_id,
                traits=traits,
                ability_container_ids=abilities.ability_container_ids,
                technical_container_ids=technical.technical_container_ids,
                node=node,
                extracted_keys=extracted_character_keys,
                source_file=source.file,
                character_pointer=character_pointer,
            )
        )

    return CharacterParseResult(
        characters=characters,
        containers=engine.containers,
        actions=engine.actions,
        diagnostics=engine.diagnostics,
        proc_references=proc_references,
        ability_count=ability_count,
        passive_trigger_count=passive_trigger_count,
        source_action_count=source_action_count,
        adapter_counts=dict(engine.adapter_counts),
        unhandled_node_count=unhandled_node_count,
    )
