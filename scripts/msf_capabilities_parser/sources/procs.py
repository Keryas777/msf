"""Structural adapter for ``procs.json``."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Protocol

from ..diagnostics import diagnostic, source_reference
from ..ids import IdRegistry
from ..json_pointer import append_pointer


EXTRACTED_FIELDS = (
    "category",
    "type",
    "state",
    "expiration_type",
    "opposite",
    "weak",
    "strong",
)
REFERENCE_FIELDS = ("opposite", "weak", "strong")


class ProcSource(Protocol):
    file: str
    data: dict[str, Any]


@dataclass(frozen=True)
class EffectReference:
    proc_id: str
    field: str
    source_pointer: str


@dataclass
class ProcParseResult:
    effects: list[dict[str, Any]]
    diagnostics: list[dict[str, Any]]
    references: list[EffectReference]


def _property_handling(node: Any) -> dict[str, list[str]]:
    if not isinstance(node, dict):
        return {
            "extracted": [],
            "rawOnly": [],
            "ignored": [],
            "unrecognized": ["<value>"],
        }
    extracted = {key for key in EXTRACTED_FIELDS if key in node}
    return {
        "extracted": sorted(extracted),
        "rawOnly": sorted(set(node) - extracted),
        "ignored": [],
        "unrecognized": [],
    }


def parse_procs(source: ProcSource, ids: IdRegistry) -> ProcParseResult:
    effects: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    references: list[EffectReference] = []

    for proc_id in sorted(source.data):
        node = source.data[proc_id]
        pointer = append_pointer("/Data", proc_id)
        identifier = ids.claim(
            "eff",
            f"effect|{source.file}|{pointer}",
        )
        if isinstance(node, dict):
            values = node
        else:
            values = {}
            diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_EFFECT_STRUCTURE",
                    message="Définition de proc conservée avec une structure inattendue.",
                    source_file=source.file,
                    source_pointer=pointer,
                    raw=node,
                )
            )

        effects.append(
            {
                "id": identifier,
                "procId": proc_id,
                "category": copy.deepcopy(values.get("category")),
                "type": copy.deepcopy(values.get("type")),
                "state": copy.deepcopy(values.get("state")),
                "expirationType": copy.deepcopy(values.get("expiration_type")),
                "opposite": copy.deepcopy(values.get("opposite")),
                "weak": copy.deepcopy(values.get("weak")),
                "strong": copy.deepcopy(values.get("strong")),
                "propertyHandling": _property_handling(node),
                "source": source_reference(source.file, pointer),
                "raw": copy.deepcopy(node),
            }
        )

        if not isinstance(node, dict):
            continue
        for field in REFERENCE_FIELDS:
            if field not in node or node[field] is None:
                continue
            value = node[field]
            field_pointer = append_pointer(pointer, field)
            if isinstance(value, str):
                references.append(
                    EffectReference(
                        proc_id=value,
                        field=field,
                        source_pointer=field_pointer,
                    )
                )
                continue
            if isinstance(value, list):
                for index, item in enumerate(value):
                    if isinstance(item, str):
                        references.append(
                            EffectReference(
                                proc_id=item,
                                field=field,
                                source_pointer=append_pointer(field_pointer, index),
                            )
                        )
                    else:
                        diagnostics.append(
                            diagnostic(
                                severity="warning",
                                code="UNEXPECTED_EFFECT_STRUCTURE",
                                message=(
                                    f"Référence {field} conservée avec une valeur "
                                    "non textuelle."
                                ),
                                source_file=source.file,
                                source_pointer=append_pointer(field_pointer, index),
                                raw=item,
                            )
                        )
                continue
            diagnostics.append(
                diagnostic(
                    severity="warning",
                    code="UNEXPECTED_EFFECT_STRUCTURE",
                    message=(
                        f"Référence {field} conservée avec une structure inattendue."
                    ),
                    source_file=source.file,
                    source_pointer=field_pointer,
                    raw=value,
                )
            )

    return ProcParseResult(
        effects=effects,
        diagnostics=diagnostics,
        references=references,
    )
