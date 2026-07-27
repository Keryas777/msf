"""Orchestrator for the first structural MSF capabilities parser."""

from __future__ import annotations

import copy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

from .actions.registry import ActionAdapterRegistry
from .audit import audit_mechanics
from .diagnostics import diagnostic
from .ids import DuplicateIdentifierError, IdRegistry
from .sources.characters import ABILITY_ORDER, parse_characters
from .sources.procs import parse_procs


SCHEMA_VERSION = "1.0.0"
DEFAULT_CHARACTERS_PATH = Path("data/msf-capabilities/raw/characters.json")
DEFAULT_PROCS_PATH = Path("data/msf-capabilities/raw/procs.json")
DEFAULT_OUTPUT_PATH = Path("data/msf-capabilities/parsed/mechanics.json")


class ParserError(RuntimeError):
    """A blocking source-validation or internal-audit failure."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        diagnostics: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.diagnostics = list(diagnostics or [])


@dataclass(frozen=True)
class SourceDocument:
    file: str
    payload: bytes
    document: dict[str, Any]
    name: str
    force_import_version: int
    data: dict[str, Any]
    checksum: str

    def source_record(self) -> dict[str, Any]:
        return {
            "file": self.file,
            "name": self.name,
            "forceImportVersion": self.force_import_version,
            "checksum": f"sha256:{self.checksum}",
            "rootType": "object",
            "recordCount": len(self.data),
        }


def load_source(path: Path, expected_name: str) -> SourceDocument:
    """Read and validate one immutable official JSON source."""

    try:
        payload = path.read_bytes()
    except OSError as error:
        raise ParserError(
            "INVALID_SOURCE_ROOT",
            f"Source file unavailable: {path}: {error}",
        ) from error

    try:
        document = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ParserError(
            "INVALID_SOURCE_ROOT",
            f"Invalid JSON in {path}: {error}",
        ) from error

    if not isinstance(document, dict):
        raise ParserError(
            "INVALID_SOURCE_ROOT",
            f"{path} must contain a JSON object at its root.",
        )
    if "Data" not in document:
        raise ParserError(
            "MISSING_DATA_ROOT",
            f"{path} is missing its Data root.",
        )
    if not isinstance(document["Data"], dict):
        raise ParserError(
            "INVALID_DATA_ROOT_TYPE",
            f"{path} Data root must be an object.",
        )
    if document.get("Name") != expected_name:
        raise ParserError(
            "INVALID_SOURCE_ROOT",
            (
                f"{path} has Name={document.get('Name')!r}; "
                f"expected {expected_name!r}."
            ),
        )
    if type(document.get("ForceImportVersion")) is not int:
        raise ParserError(
            "INVALID_SOURCE_ROOT",
            f"{path} ForceImportVersion must be an integer.",
        )

    return SourceDocument(
        file=path.name,
        payload=payload,
        document=document,
        name=expected_name,
        force_import_version=document["ForceImportVersion"],
        data=document["Data"],
        checksum=hashlib.sha256(payload).hexdigest(),
    )


def _container_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
    ability_rank = {
        ability_type: index for index, ability_type in enumerate(ABILITY_ORDER)
    }
    container_type_rank = {
        "ability": 0,
        "passive_trigger": 1,
        "ability_alternative": 1,
        "technical": 2,
        "technical_trigger": 3,
        "unclassified_branch": 4,
    }
    return (
        item["characterId"],
        ability_rank.get(item.get("abilityType"), len(ability_rank)),
        container_type_rank.get(item.get("containerType"), 99),
        item.get("order", -1),
        item["source"]["pointer"],
    )


def _sort_output(
    containers: list[dict[str, Any]],
    actions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ordered_containers = sorted(containers, key=_container_sort_key)
    container_rank = {
        container["id"]: index for index, container in enumerate(ordered_containers)
    }
    ordered_actions = sorted(
        actions,
        key=lambda item: (
            container_rank.get(item["containerId"], len(container_rank)),
            item["order"],
            item["source"]["pointer"],
        ),
    )
    return ordered_containers, ordered_actions


def _unresolved_reference_diagnostics(
    *,
    characters_result: Any,
    procs_result: Any,
    proc_ids: set[str],
    characters_file: str,
    procs_file: str,
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    for reference in characters_result.proc_references:
        if reference.proc_id in proc_ids:
            continue
        diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNRESOLVED_PROC_REFERENCE",
                message=(
                    f"Référence de proc absente de procs.json : "
                    f"{reference.proc_id}."
                ),
                character_id=reference.character_id,
                ability_type=reference.ability_type,
                container_id=reference.container_id,
                action_id=reference.action_id,
                source_file=characters_file,
                source_pointer=reference.source_pointer,
                raw={"procId": reference.proc_id},
            )
        )
    for reference in procs_result.references:
        if reference.proc_id in proc_ids:
            continue
        diagnostics.append(
            diagnostic(
                severity="warning",
                code="UNRESOLVED_PROC_REFERENCE",
                message=(
                    f"Référence {reference.field} absente de procs.json : "
                    f"{reference.proc_id}."
                ),
                source_file=procs_file,
                source_pointer=reference.source_pointer,
                raw={"procId": reference.proc_id},
            )
        )
    return diagnostics


def parse_sources(
    characters_path: Path = DEFAULT_CHARACTERS_PATH,
    procs_path: Path = DEFAULT_PROCS_PATH,
) -> dict[str, Any]:
    """Parse both sources, run the audit, and return the in-memory representation."""

    characters_source = load_source(Path(characters_path), "characters")
    procs_source = load_source(Path(procs_path), "procs")
    characters_snapshot = copy.deepcopy(characters_source.document)
    procs_snapshot = copy.deepcopy(procs_source.document)
    ids = IdRegistry()
    registry = ActionAdapterRegistry()

    try:
        characters_result = parse_characters(characters_source, ids, registry)
        procs_result = parse_procs(procs_source, ids)
    except DuplicateIdentifierError as error:
        raise ParserError("DUPLICATE_ID", str(error)) from error

    proc_ids = {effect["procId"] for effect in procs_result.effects}
    unresolved_diagnostics = _unresolved_reference_diagnostics(
        characters_result=characters_result,
        procs_result=procs_result,
        proc_ids=proc_ids,
        characters_file=characters_source.file,
        procs_file=procs_source.file,
    )
    containers, actions = _sort_output(
        characters_result.containers,
        characters_result.actions,
    )
    diagnostics = [
        *characters_result.diagnostics,
        *procs_result.diagnostics,
        *unresolved_diagnostics,
    ]
    mechanics: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "sources": [
            characters_source.source_record(),
            procs_source.source_record(),
        ],
        "characters": characters_result.characters,
        "containers": containers,
        "actions": actions,
        "effects": procs_result.effects,
        "diagnostics": diagnostics,
        "audit": {},
    }
    input_counts = {
        "characterCount": len(characters_source.data),
        "procCount": len(procs_source.data),
        "abilityCount": characters_result.ability_count,
        "passiveTriggerCount": characters_result.passive_trigger_count,
        "sourceActionCount": characters_result.source_action_count,
    }
    input_unchanged = (
        characters_source.document == characters_snapshot
        and procs_source.document == procs_snapshot
    )
    audit_result = audit_mechanics(
        mechanics,
        documents={
            characters_source.file: characters_source.document,
            procs_source.file: procs_source.document,
        },
        input_counts=input_counts,
        adapter_counts=characters_result.adapter_counts,
        unhandled_node_count=characters_result.unhandled_node_count,
        unresolved_proc_reference_count=len(unresolved_diagnostics),
        input_unchanged=input_unchanged,
    )
    mechanics["diagnostics"] = audit_result.diagnostics
    mechanics["audit"] = audit_result.audit

    if audit_result.has_errors:
        first_error = next(
            item
            for item in audit_result.diagnostics
            if item.get("severity") == "error"
        )
        raise ParserError(
            str(first_error.get("code", "INTERNAL_AUDIT_MISMATCH")),
            str(first_error.get("message", "Blocking parser audit error.")),
            diagnostics=audit_result.diagnostics,
        )

    return mechanics


def serialize_mechanics(mechanics: dict[str, Any]) -> bytes:
    """Serialize with the repository's stable, readable JSON convention."""

    text = json.dumps(
        mechanics,
        ensure_ascii=False,
        indent=2,
        allow_nan=False,
    )
    return f"{text}\n".encode("utf-8")
