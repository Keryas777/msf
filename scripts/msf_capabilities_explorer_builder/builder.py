"""Deterministic Web-artifact builder for the Codex MSF explorer."""

from __future__ import annotations

import copy
import hashlib
import html
import json
import math
import os
import re
import shutil
import tempfile
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from .ability_presentation import (
    ABILITY_PRESENTATION_SCHEMA_VERSION,
    ASSERTION_EVIDENCE,
    DIAGNOSTIC_MESSAGES,
    AbilityPresentationError,
    audit_ability_presentations,
    build_ability_presentation,
)
from .presentation import (
    ABILITY_TYPES,
    ACTION_PRESENTATIONS,
    DETECTED_ACTIONS,
    EFFECT_PRESENTATIONS,
    GENERIC_MECHANICS,
    LIMITATIONS,
    METRICS,
    MODE_LABELS,
    OPERATION_KINDS,
    PROOF,
    RELATION_LABELS,
    SCHEMA_VERSION,
    TURN_METER_CONTROL_LABELS,
    SIDE_LABELS,
    SUGGESTION_SPECS,
    TARGET_TYPE_LABELS,
    TEXT_ONLY_MECHANICS,
    TRAIT_LABELS,
    TRIGGER_LABELS,
)


DEFAULT_PUBLIC_ROOT = Path("docs/data/msf-capabilities")
DEFAULT_PRESENTATIONS = Path(
    "data/msf-capabilities/raw/msf-character-abilities-fr.json"
)
DEFAULT_PORTRAITS = Path("docs/data/msf-characters.json")
DEFAULT_SOURCE_MANIFEST = Path("data/msf-capabilities/source-manifest.json")
DEFAULT_OUTPUT_ROOT = Path("docs/data/msf-capabilities-explorer")

PUBLISHER_PAYLOADS = {
    "abilities.json",
    "characters.json",
    "contexts.json",
    "effects.json",
    "operations.json",
    "spawns.json",
    "uninterpreted-actions.json",
}
PROOF_VALUES = frozenset(PROOF)
ROUTE_BUCKETS = tuple("0123456789abcdef")
SAFE_CHARACTER_ID = re.compile(r"^[A-Za-z0-9_-]+$")
SAFE_HASH_DIRECTORY = re.compile(r"^sha256-[0-9a-f]{64}$")
TECHNICAL_PREFIXES = ("PVE_", "War_", "NUE", "Raid_", "DD_", "DD7_")
TECHNICAL_SUFFIXES = ("NPC", "_NPC", "_Boss", "Boss")


class BuilderError(RuntimeError):
    """A stable, user-actionable builder validation failure."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class GeneratedArtifacts:
    payloads: dict[str, bytes]
    generation_manifest: bytes
    stable_manifest: bytes
    payload_set_checksum: str
    counts: dict[str, int]
    presentation_audit: dict[str, Any]


@dataclass(frozen=True)
class BuildResult:
    output_root: Path
    generation_path: Path
    payload_set_checksum: str
    counts: dict[str, int]
    payload_sizes: dict[str, int]
    presentation_audit: dict[str, Any]


def _duplicate_checked_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BuilderError("DUPLICATE_JSON_KEY", f"Clé JSON dupliquée : {key}")
        result[key] = value
    return result


def _reject_non_finite(value: str) -> None:
    raise BuilderError("NON_FINITE_JSON", f"Valeur JSON non finie : {value}")


def _load_json_bytes(data: bytes, source: str) -> Any:
    try:
        return json.loads(
            data.decode("utf-8"),
            object_pairs_hook=_duplicate_checked_object,
            parse_constant=_reject_non_finite,
        )
    except BuilderError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BuilderError("INVALID_JSON", f"JSON invalide dans {source}: {error}") from error


def _read_json(path: Path) -> tuple[Any, bytes]:
    try:
        if path.is_symlink():
            raise BuilderError("SYMLINK_INPUT", f"Lien symbolique refusé : {path}")
        data = path.read_bytes()
    except BuilderError:
        raise
    except OSError as error:
        raise BuilderError("INPUT_IO", f"Lecture impossible : {path}: {error}") from error
    return _load_json_bytes(data, str(path)), data


def _json_bytes(value: Any) -> bytes:
    try:
        return (
            json.dumps(
                value,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise BuilderError("SERIALIZATION_ERROR", str(error)) from error


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_prefixed(data: bytes) -> str:
    return f"sha256:{_sha256(data)}"


def _stable_id(prefix: str, *parts: str) -> str:
    payload = "\x1f".join(parts).encode("utf-8")
    return f"{prefix}_{hashlib.sha256(payload).hexdigest()[:16]}"


def _as_dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BuilderError("INVALID_SOURCE_SCHEMA", f"{label} doit être un objet")
    return value


def _as_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise BuilderError("INVALID_SOURCE_SCHEMA", f"{label} doit être un tableau")
    return value


def _safe_relative_directory(base: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise BuilderError("INVALID_PUBLIC_PATH", "Chemin public invalide")
    pure = Path(relative)
    if pure.is_absolute() or ".." in pure.parts:
        raise BuilderError("INVALID_PUBLIC_PATH", f"Traversée de chemin refusée : {relative}")
    candidate = (base / pure).resolve()
    base_resolved = base.resolve()
    try:
        candidate.relative_to(base_resolved)
    except ValueError as error:
        raise BuilderError("INVALID_PUBLIC_PATH", f"Chemin hors publication : {relative}") from error
    return candidate


def _validate_prefixed_checksum(value: Any, label: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
        raise BuilderError("INVALID_CHECKSUM", f"SHA-256 invalide pour {label}")
    return value


def load_source_documents(
    repository_root: Path | str = Path("."),
    *,
    public_root: Path = DEFAULT_PUBLIC_ROOT,
    presentations_path: Path = DEFAULT_PRESENTATIONS,
    portraits_path: Path = DEFAULT_PORTRAITS,
    source_manifest_path: Path = DEFAULT_SOURCE_MANIFEST,
) -> dict[str, Any]:
    """Load and checksum every declared input without importing upstream code."""

    root = Path(repository_root).resolve()
    publisher_root = root / public_root
    publisher_manifest, publisher_manifest_bytes = _read_json(
        publisher_root / "manifest.json"
    )
    publisher_manifest = _as_dict(publisher_manifest, "manifest publisher")
    if publisher_manifest.get("artifactType") != "msf_capabilities_web_publication":
        raise BuilderError("INVALID_PUBLISHER_MANIFEST", "Type de publication inattendu")
    if publisher_manifest.get("schemaVersion") != "1.0.0":
        raise BuilderError("UNSUPPORTED_PUBLISHER_SCHEMA", "Schéma publisher non pris en charge")
    capabilities_checksum = _validate_prefixed_checksum(
        publisher_manifest.get("capabilitiesChecksum"), "capabilities"
    )
    publisher_payload_checksum = _validate_prefixed_checksum(
        publisher_manifest.get("currentPayloadSetChecksum"), "publication publisher"
    )

    generation_dir = _safe_relative_directory(
        publisher_root, publisher_manifest.get("currentPath")
    )
    if not generation_dir.is_dir() or generation_dir.is_symlink():
        raise BuilderError("MISSING_PUBLISHER_GENERATION", "Génération publisher absente")

    index_manifest, index_manifest_bytes = _read_json(
        generation_dir / "index-manifest.json"
    )
    index_manifest = _as_dict(index_manifest, "index-manifest")
    declared_index = _as_dict(
        publisher_manifest.get("indexManifest"), "indexManifest publisher"
    )
    if declared_index.get("path") != "index-manifest.json":
        raise BuilderError("INVALID_INDEX_MANIFEST", "Chemin d’index-manifest inattendu")
    if declared_index.get("sizeBytes") != len(index_manifest_bytes):
        raise BuilderError("INDEX_SIZE_MISMATCH", "Taille d’index-manifest incohérente")
    if declared_index.get("sha256") != _sha256(index_manifest_bytes):
        raise BuilderError("INDEX_CHECKSUM_MISMATCH", "Checksum d’index-manifest incohérent")
    if index_manifest.get("artifactType") != "index_manifest":
        raise BuilderError("INVALID_INDEX_MANIFEST", "Type d’index-manifest inattendu")
    if index_manifest.get("schemaVersion") not in {"1.0.0", "1.1.0"}:
        raise BuilderError("UNSUPPORTED_INDEX_SCHEMA", "Schéma indexer non pris en charge")
    if index_manifest.get("capabilitiesChecksum") != capabilities_checksum:
        raise BuilderError("CAPABILITIES_CHECKSUM_MISMATCH", "Identité capabilities incohérente")
    if index_manifest.get("payloadSetChecksum") != publisher_payload_checksum:
        raise BuilderError("PAYLOAD_CHECKSUM_MISMATCH", "Identité publisher incohérente")
    if index_manifest.get("audit", {}).get("status") != "passed":
        raise BuilderError("FAILED_UPSTREAM_AUDIT", "Audit de l’indexer non validé")

    payload_inventory = _as_list(index_manifest.get("payloads"), "payloads indexer")
    declared_names = {item.get("path") for item in payload_inventory if isinstance(item, dict)}
    if declared_names != PUBLISHER_PAYLOADS:
        raise BuilderError("INVALID_PAYLOAD_INVENTORY", "Inventaire publisher inattendu")

    payloads: dict[str, Any] = {}
    payload_checksums: dict[str, str] = {}
    for item in sorted(payload_inventory, key=lambda entry: entry["path"]):
        item = _as_dict(item, "entrée payload")
        name = item.get("path")
        if name not in PUBLISHER_PAYLOADS or Path(name).name != name:
            raise BuilderError("INVALID_PAYLOAD_PATH", f"Payload refusé : {name}")
        document, data = _read_json(generation_dir / name)
        if item.get("sizeBytes") != len(data):
            raise BuilderError("PAYLOAD_SIZE_MISMATCH", f"Taille incohérente : {name}")
        if item.get("sha256") != _sha256(data):
            raise BuilderError("PAYLOAD_CHECKSUM_MISMATCH", f"Checksum incohérent : {name}")
        document = _as_dict(document, name)
        if document.get("capabilitiesChecksum") != capabilities_checksum:
            raise BuilderError(
                "CAPABILITIES_CHECKSUM_MISMATCH", f"Identité incohérente : {name}"
            )
        payloads[name] = document
        payload_checksums[name] = _sha256_prefixed(data)

    presentations, presentation_bytes = _read_json(root / presentations_path)
    portraits, portrait_bytes = _read_json(root / portraits_path)
    source_manifest, source_manifest_bytes = _read_json(root / source_manifest_path)

    return {
        "publisherManifest": publisher_manifest,
        "publisherManifestChecksum": _sha256_prefixed(publisher_manifest_bytes),
        "indexManifest": index_manifest,
        "indexManifestChecksum": _sha256_prefixed(index_manifest_bytes),
        "payloads": payloads,
        "payloadChecksums": payload_checksums,
        "presentations": _as_list(presentations, "présentations officielles"),
        "presentationsChecksum": _sha256_prefixed(presentation_bytes),
        "portraits": _as_list(portraits, "catalogue de portraits"),
        "portraitsChecksum": _sha256_prefixed(portrait_bytes),
        "sourceManifest": _as_dict(source_manifest, "source-manifest"),
        "sourceManifestChecksum": _sha256_prefixed(source_manifest_bytes),
    }


def normalize_search(value: Any) -> str:
    text = html.unescape(str(value or "")).replace("’", "'").replace(" ", " ")
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = re.sub(r"['’`´\-‐‑‒–—―_/]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _compact_search(value: Any) -> str:
    return normalize_search(value).replace(" ", "")


def _sort_key(value: Any) -> tuple[str, str]:
    normalized = normalize_search(value)
    return normalized, str(value or "")


def _split_source_name(value: str) -> str:
    text = re.sub(r"[_\-]+", " ", value)
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text)
    text = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", text)
    return " ".join(text.split()) or value


def _slug_base(value: str) -> str:
    source = _split_source_name(value)
    return normalize_search(source).replace(" ", "-") or "mechanic"


def _plain_official_text(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?color(?:=[^>]*)?>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _max_level(levels: Any) -> tuple[str | None, dict[str, Any] | None]:
    if not isinstance(levels, dict) or not levels:
        return None, None
    numeric: list[tuple[int, str, dict[str, Any]]] = []
    for raw_level, payload in levels.items():
        if not isinstance(payload, dict):
            continue
        try:
            number = int(raw_level)
        except (TypeError, ValueError):
            continue
        numeric.append((number, str(raw_level), payload))
    if not numeric:
        return None, None
    _, label, payload = max(numeric, key=lambda row: row[0])
    return label, payload


def _route_bucket(identifier: str, prefix: str) -> str:
    match = re.fullmatch(rf"{re.escape(prefix)}_([0-9a-f]{{16}})", identifier)
    if not match:
        raise BuilderError("INVALID_CANONICAL_ID", f"Identifiant inattendu : {identifier}")
    return match.group(1)[0]


def _unique_strings(values: Iterable[Any]) -> list[str]:
    return sorted(
        {str(value).strip() for value in values if isinstance(value, str) and value.strip()},
        key=_sort_key,
    )


def _search_fields(
    label: str,
    aliases: Iterable[str],
    source_name: str | None,
    parent_label: str | None = None,
) -> dict[str, Any]:
    clean_aliases = _unique_strings(aliases)
    return {
        "name": normalize_search(label),
        "nameCompact": _compact_search(label),
        "words": normalize_search(label).split(),
        "aliases": [
            {
                "label": alias,
                "key": normalize_search(alias),
                "compact": _compact_search(alias),
            }
            for alias in clean_aliases
        ],
        "source": normalize_search(source_name),
        "sourceCompact": _compact_search(source_name),
        "parent": normalize_search(parent_label),
        "parentCompact": _compact_search(parent_label),
    }


def _records(document: Mapping[str, Any], label: str) -> dict[str, Any]:
    return _as_dict(document.get("records"), f"records de {label}")


def _validate_sources(documents: Mapping[str, Any]) -> dict[str, Any]:
    payloads = _as_dict(documents.get("payloads"), "payloads")
    if set(payloads) != PUBLISHER_PAYLOADS:
        raise BuilderError("INVALID_PAYLOAD_INVENTORY", "Les sept payloads sont requis")

    characters = _records(payloads["characters.json"], "characters")
    abilities = _records(payloads["abilities.json"], "abilities")
    contexts = _records(payloads["contexts.json"], "contexts")
    operations = _records(payloads["operations.json"], "operations")
    spawns = _records(payloads["spawns.json"], "spawns")
    actions = _records(payloads["uninterpreted-actions.json"], "uninterpreted-actions")
    effects_document = _as_dict(payloads["effects.json"], "effects")
    effects = _as_dict(
        _as_dict(effects_document.get("catalog"), "catalogue d’effets").get("byEffectId"),
        "catalogue par effectId",
    )

    if set(PROOF) != PROOF_VALUES:
        raise BuilderError("INVALID_PROOF_REGISTRY", "Registre de preuve incomplet")
    for value, presentation in PROOF.items():
        if not presentation.get("label") or not presentation.get("explanation"):
            raise BuilderError("INVALID_PROOF_REGISTRY", f"Preuve incomplète : {value}")

    official_records = _as_list(documents.get("presentations"), "présentations")
    portrait_records = _as_list(documents.get("portraits"), "portraits")
    official: dict[str, dict[str, Any]] = {}
    for item in official_records:
        item = _as_dict(item, "kit officiel")
        character_id = item.get("id")
        if not isinstance(character_id, str) or not SAFE_CHARACTER_ID.fullmatch(character_id):
            raise BuilderError("INVALID_CHARACTER_ID", f"Identifiant officiel invalide : {character_id}")
        if character_id in official:
            raise BuilderError("DUPLICATE_OFFICIAL_CHARACTER", character_id)
        kit = _as_dict(item.get("abilityKit"), f"abilityKit de {character_id}")
        for ability_type, presentation in kit.items():
            if ability_type not in ABILITY_TYPES:
                raise BuilderError(
                    "UNSUPPORTED_PRESENTATION_TYPE", f"{character_id}/{ability_type}"
                )
            presentation = _as_dict(
                presentation, f"présentation {character_id}/{ability_type}"
            )
            level, max_payload = _max_level(presentation.get("levels"))
            if level is None or max_payload is None:
                raise BuilderError(
                    "MISSING_MAX_LEVEL_PRESENTATION", f"{character_id}/{ability_type}"
                )
            if not isinstance(presentation.get("name"), str) or not presentation["name"].strip():
                raise BuilderError(
                    "MISSING_ABILITY_NAME", f"{character_id}/{ability_type}"
                )
            if not isinstance(presentation.get("icon"), str) or not presentation["icon"].strip():
                raise BuilderError(
                    "MISSING_ABILITY_ICON", f"{character_id}/{ability_type}"
                )
            if not _plain_official_text(max_payload.get("description")):
                raise BuilderError(
                    "MISSING_MAX_LEVEL_TEXT", f"{character_id}/{ability_type}"
                )
        official[character_id] = item

    portraits: dict[str, dict[str, Any]] = {}
    for item in portrait_records:
        item = _as_dict(item, "portrait")
        character_id = item.get("id")
        if not isinstance(character_id, str) or not character_id:
            raise BuilderError("INVALID_PORTRAIT", "Portrait sans identifiant")
        if character_id in portraits:
            raise BuilderError("DUPLICATE_PORTRAIT", character_id)
        portraits[character_id] = item

    for character_id, record in characters.items():
        if character_id != record.get("object", {}).get("characterId"):
            raise BuilderError("CHARACTER_KEY_MISMATCH", character_id)
        if not SAFE_CHARACTER_ID.fullmatch(character_id):
            raise BuilderError("INVALID_CHARACTER_ID", character_id)
    missing_official = sorted(set(official) - set(characters))
    if missing_official:
        raise BuilderError(
            "ORPHAN_OFFICIAL_PRESENTATION", ", ".join(missing_official[:5])
        )

    abilities_by_character: dict[str, list[str]] = defaultdict(list)
    ability_by_character_type: dict[tuple[str, str], str] = {}
    for ability_id, record in abilities.items():
        obj = _as_dict(record.get("object"), f"Ability {ability_id}")
        if obj.get("id") != ability_id:
            raise BuilderError("ABILITY_KEY_MISMATCH", ability_id)
        character_id = obj.get("characterId")
        ability_type = obj.get("abilityType")
        if character_id not in characters:
            raise BuilderError("ORPHAN_ABILITY_CHARACTER", ability_id)
        if ability_type not in ABILITY_TYPES:
            raise BuilderError("UNSUPPORTED_ABILITY_TYPE", f"{ability_id}: {ability_type}")
        pair = (character_id, ability_type)
        if pair in ability_by_character_type:
            raise BuilderError("DUPLICATE_CHARACTER_ABILITY_TYPE", f"{pair}")
        ability_by_character_type[pair] = ability_id
        abilities_by_character[character_id].append(ability_id)
        for context_id in obj.get("contextIds", []):
            if context_id not in contexts:
                raise BuilderError("ORPHAN_ABILITY_CONTEXT", f"{ability_id}/{context_id}")

    for character_id, record in characters.items():
        declared = sorted(record.get("abilityIds", []))
        actual = sorted(abilities_by_character.get(character_id, []))
        if declared != actual:
            raise BuilderError("CHARACTER_ABILITY_RELATION_MISMATCH", character_id)

    for context_id, record in contexts.items():
        if record.get("object", {}).get("id") != context_id:
            raise BuilderError("CONTEXT_KEY_MISMATCH", context_id)
        ability_id = record.get("abilityId")
        character_id = record.get("object", {}).get("characterId")
        if ability_id is not None and ability_id not in abilities:
            raise BuilderError("ORPHAN_CONTEXT_ABILITY", context_id)
        if character_id is not None and character_id not in characters:
            raise BuilderError("ORPHAN_CONTEXT_CHARACTER", context_id)

    for operation_id, record in operations.items():
        if record.get("operationId") != operation_id:
            raise BuilderError("OPERATION_KEY_MISMATCH", operation_id)
        character_id = record.get("characterId")
        ability_id = record.get("abilityId")
        context_id = record.get("contextId")
        if character_id not in characters:
            raise BuilderError("ORPHAN_OPERATION_CHARACTER", operation_id)
        if ability_id is not None and ability_id not in abilities:
            raise BuilderError("ORPHAN_OPERATION_ABILITY", operation_id)
        if context_id not in contexts:
            raise BuilderError("ORPHAN_OPERATION_CONTEXT", operation_id)
        effect = record.get("effect")
        if isinstance(effect, dict) and effect.get("resolved") is True:
            effect_id = effect.get("effectId")
            if effect.get("namespace") == "proc" and effect_id not in effects:
                raise BuilderError("ORPHAN_OPERATION_EFFECT", operation_id)

    for action_id, record in actions.items():
        if record.get("sourceActionId") != action_id:
            raise BuilderError("ACTION_KEY_MISMATCH", action_id)
        if record.get("status") != "preserved_uninterpreted":
            raise BuilderError("INVALID_ACTION_PROOF", action_id)
        if record.get("characterId") not in characters:
            raise BuilderError("ORPHAN_ACTION_CHARACTER", action_id)
        if record.get("abilityId") is not None and record.get("abilityId") not in abilities:
            raise BuilderError("ORPHAN_ACTION_ABILITY", action_id)
        if record.get("contextId") not in contexts:
            raise BuilderError("ORPHAN_ACTION_CONTEXT", action_id)

    for operation_id, record in spawns.items():
        if operation_id not in operations or operations[operation_id].get("kind") != "spawn":
            raise BuilderError("ORPHAN_SPAWN_OPERATION", operation_id)
        invoking = record.get("invokingCharacterId")
        if invoking not in characters:
            raise BuilderError("ORPHAN_SPAWN_INVOKER", operation_id)
        for pool_item in record.get("pool", []):
            pool_item = _as_dict(pool_item, f"pool {operation_id}")
            join = pool_item.get("characterJoin")
            if isinstance(join, dict) and join.get("method") == "exact":
                spawned = pool_item.get("spawnedCharacterId")
                if spawned not in characters:
                    raise BuilderError("ORPHAN_SPAWN_ENTITY", f"{operation_id}/{spawned}")

    alias_owners: dict[str, str] = {}
    for effect_id, presentation in EFFECT_PRESENTATIONS.items():
        if effect_id not in effects:
            continue
        for alias in [presentation.get("label", ""), *presentation.get("aliases", [])]:
            key = _compact_search(alias)
            if not key:
                raise BuilderError("INVALID_ALIAS", f"Alias vide pour {effect_id}")
            owner_id = presentation.get("canonicalEffectId") or effect_id
            owner = alias_owners.get(key)
            if owner is not None and owner != owner_id:
                raise BuilderError("AMBIGUOUS_ALIAS", f"{alias}: {owner}/{owner_id}")
            alias_owners[key] = owner_id

    return {
        "characters": characters,
        "abilities": abilities,
        "contexts": contexts,
        "operations": operations,
        "spawns": spawns,
        "actions": actions,
        "effects": effects,
        "official": official,
        "portraits": portraits,
        "abilityByCharacterType": ability_by_character_type,
    }


def _entity_status(character_id: str, official: bool, spawned_ids: set[str]) -> dict[str, str]:
    if official:
        return {"kind": "official", "label": "Personnage jouable"}
    if character_id in spawned_ids:
        return {"kind": "summon", "label": "Invocation"}
    if character_id.startswith(TECHNICAL_PREFIXES) or character_id.endswith(
        TECHNICAL_SUFFIXES
    ):
        return {"kind": "variant", "label": "Variante de combat"}
    return {"kind": "entity", "label": "Entité de combat"}


def _display_character(character_id: str, portrait: Mapping[str, Any] | None) -> str:
    if portrait:
        for key in ("nameFr", "nameKey", "nameEn"):
            value = portrait.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return _split_source_name(character_id)


def _trait_label(value: str) -> str:
    return TRAIT_LABELS.get(value, _split_source_name(value))


def _collect_values(value: Any, key: str) -> list[Any]:
    found: list[Any] = []
    if isinstance(value, dict):
        for child_key, child_value in value.items():
            if child_key == key:
                found.append(child_value)
            found.extend(_collect_values(child_value, key))
    elif isinstance(value, list):
        for child in value:
            found.extend(_collect_values(child, key))
    return found


def _flatten_scalars(values: Iterable[Any]) -> list[Any]:
    result: list[Any] = []
    for value in values:
        if isinstance(value, list):
            result.extend(_flatten_scalars(value))
        elif isinstance(value, (str, int, float, bool)) and not isinstance(value, bool):
            result.append(value)
    return result


def _condition_modes(conditions: Iterable[Any]) -> list[str]:
    raw = _flatten_scalars(_collect_values(list(conditions), "mode"))
    return _unique_strings(MODE_LABELS.get(str(value).upper()) for value in raw)


def _condition_sides(conditions: Iterable[Any]) -> list[str]:
    raw = _flatten_scalars(_collect_values(list(conditions), "combat_side"))
    return _unique_strings(SIDE_LABELS.get(str(value).casefold()) for value in raw)


def _comparison_label(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    operator = value.get("if")
    threshold = value.get("than")
    operators = {
        "less": "inférieur à",
        "greater": "supérieur à",
        "equal": "égal à",
        "less_or_equal": "inférieur ou égal à",
        "greater_or_equal": "supérieur ou égal à",
    }
    if operator in operators and isinstance(threshold, (int, float)):
        return f"{operators[operator]} {threshold:g}"
    return None


def _condition_summary(expression: Any) -> list[str]:
    if not isinstance(expression, dict):
        return ["Condition structurée supplémentaire"]
    summaries: list[str] = []
    modes = _condition_modes([expression])
    sides = _condition_sides([expression])
    if modes:
        summaries.append("Mode : " + ", ".join(modes))
    if sides:
        summaries.append("Contexte : " + ", ".join(sides))

    trait_values = _flatten_scalars(_collect_values(expression, "has_any"))
    safe_traits = _unique_strings(
        _trait_label(value) for value in trait_values if isinstance(value, str)
    )
    if safe_traits:
        summaries.append("Traits : " + ", ".join(safe_traits[:4]))

    for owner in _collect_values(expression, "owner"):
        if not isinstance(owner, dict):
            continue
        for source_key, label in (
            ("health_pct", "Vie du personnage"),
            ("barrier_pct", "Barrière du personnage"),
        ):
            comparison = _comparison_label(owner.get(source_key))
            if comparison:
                summaries.append(f"{label} {comparison} %")

    count_values = _collect_values(expression, "count")
    for count in count_values:
        comparison = _comparison_label(count)
        if comparison:
            summaries.append(f"Nombre de cibles {comparison}")
            break

    if "not" in expression and not any(item.startswith("Sauf") for item in summaries):
        summaries.append("Condition d’exclusion présente")
    if not summaries:
        summaries.append("Condition structurée supplémentaire")
    return _unique_strings(summaries)


def _target_summary(target: Any) -> str | None:
    if not isinstance(target, dict) or not target:
        return None
    relation = target.get("relation") or target.get("relationship")
    target_type = target.get("type")
    limit = target.get("limit")
    parts: list[str] = []
    if isinstance(relation, str) and relation in RELATION_LABELS:
        parts.append(RELATION_LABELS[relation])
    if isinstance(target_type, str) and target_type in TARGET_TYPE_LABELS:
        parts.append(TARGET_TYPE_LABELS[target_type])
    limits = [value for value in _flatten_scalars([limit]) if isinstance(value, (int, float))]
    if limits:
        parts.append(f"jusqu’à {max(limits):g}")
    if not parts:
        return None
    return " · ".join(parts)


def _metric_projection(metrics: Any) -> list[dict[str, Any]]:
    if not isinstance(metrics, dict):
        return []
    order = {name: index for index, name in enumerate(METRICS)}
    result: list[dict[str, Any]] = []
    for name, record in sorted(metrics.items(), key=lambda row: order.get(row[0], 999)):
        if name not in METRICS or not isinstance(record, dict):
            continue
        value = record.get("maxLevelValue")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            continue
        result.append(
            {
                "key": name,
                "label": METRICS[name],
                "value": value,
                "unit": "%" if name.endswith("Pct") else None,
            }
        )
    return result


def _scope_label(scope: Any) -> str | None:
    if not isinstance(scope, dict):
        return None
    return {
        "action_target": "Cible de l’action",
        "spawn_invocation": "Invocation",
        "spawn_pool": "Entité invoquée",
        "character": "Personnage",
        "battlefield": "Champ de bataille",
        "ability_energy_recipient": "Destinataire de l’énergie",
    }.get(scope.get("kind"))


def _ability_energy_target_summary(target: Any, recipient: Any) -> str | None:
    combined: dict[str, Any] = {}
    for source in (recipient, target):
        if not isinstance(source, dict):
            continue
        for key in ("relation", "relationship", "type", "limit"):
            if key in source and key not in combined:
                combined[key] = copy.deepcopy(source[key])
    summary = _target_summary(combined)
    filters = [
        value
        for source in (recipient, target)
        if isinstance(source, dict)
        for value in [source.get("filter")]
        if isinstance(value, dict)
    ]
    energy_levels = _flatten_scalars(
        value
        for filter_value in filters
        for value in _collect_values(filter_value, "energy_level")
    )
    parts = [summary] if summary else []
    if "partial_energy" in energy_levels:
        parts.append("énergie non maximale")
    return " · ".join(parts) if parts else None


def _project_operation(
    operation: Mapping[str, Any],
    contexts: Mapping[str, Any],
    effect_ids: Mapping[str, str],
) -> dict[str, Any]:
    operation_id = operation["operationId"]
    kind = operation.get("kind")
    context = contexts.get(operation.get("contextId"), {})
    context_object = context.get("object", {}) if isinstance(context, dict) else {}
    execution = context_object.get("execution", {}) if isinstance(context_object, dict) else {}
    trigger_raw = execution.get("trigger") if isinstance(execution, dict) else None
    conditions = operation.get("conditions", [])
    condition_summaries: list[str] = []
    for condition in conditions:
        if isinstance(condition, dict):
            condition_summaries.extend(_condition_summary(condition.get("expression")))
    effect = operation.get("effect")
    effect_projection = None
    if isinstance(effect, dict) and effect.get("effectId"):
        source_name = str(effect.get("effectId"))
        mechanic_id = effect_ids.get(source_name)
        presentation = EFFECT_PRESENTATIONS.get(source_name, {})
        effect_projection = {
            "mechanicId": mechanic_id,
            "label": presentation.get("label") or _split_source_name(source_name),
            "sourceName": source_name,
            "resolved": bool(effect.get("resolved")),
        }
    target_record = operation.get("target")
    target_value = target_record.get("value") if isinstance(target_record, dict) else None
    recipient_record = operation.get("recipient")
    recipient_value = (
        recipient_record.get("value") if isinstance(recipient_record, dict) else None
    )
    target_summary = (
        _ability_energy_target_summary(target_value, recipient_value)
        if kind == "ability_energy_generate"
        else _target_summary(target_value)
    )
    metrics = _metric_projection(operation.get("metrics"))
    chance = next((item["value"] for item in metrics if item["key"] == "chancePct"), None)
    turn_meter_control = operation.get("turnMeterControl")
    control_action = (
        turn_meter_control.get("action")
        if isinstance(turn_meter_control, dict)
        else None
    )
    return {
        "id": operation_id,
        "kind": kind,
        "kindLabel": TURN_METER_CONTROL_LABELS.get(control_action)
        or OPERATION_KINDS.get(kind, {}).get("label")
        or _split_source_name(str(kind or "opération")),
        "evidence": "normalized",
        "characterId": operation.get("characterId"),
        "abilityId": operation.get("abilityId"),
        "abilityType": operation.get("abilityType"),
        "effect": effect_projection,
        "target": target_summary,
        "chance": chance,
        "metrics": metrics,
        "modes": _condition_modes(conditions),
        "sides": _condition_sides(conditions),
        "conditions": _unique_strings(condition_summaries),
        "trigger": TRIGGER_LABELS.get(trigger_raw),
        "scope": _scope_label(operation.get("scope")),
        "actionOrder": operation.get("actionOrder"),
        "sourceType": operation.get("rawSourceActionType")
        or operation.get("sourceActionType"),
        "mechanicFamily": copy.deepcopy(operation.get("mechanicFamily")),
        "turnMeterControl": copy.deepcopy(turn_meter_control),
    }


def _project_action(action: Mapping[str, Any]) -> dict[str, Any]:
    source_type = str(action.get("rawSourceActionType") or action.get("sourceActionType") or "")
    detected = DETECTED_ACTIONS.get(source_type)
    label = (
        detected.get("label")
        if detected
        else ACTION_PRESENTATIONS.get(source_type, _split_source_name(source_type))
    )
    mechanic_id = detected.get("mechanicId") if detected else f"action-{_slug_base(source_type)}"
    facet = detected.get("facet") if detected else "detected"
    return {
        "id": action.get("sourceActionId"),
        "kind": facet,
        "kindLabel": OPERATION_KINDS[facet]["label"],
        "label": label,
        "mechanicId": mechanic_id,
        "evidence": "preserved_uninterpreted",
        "characterId": action.get("characterId"),
        "abilityId": action.get("abilityId"),
        "abilityType": action.get("abilityType"),
        "sourceActionId": action.get("sourceActionId"),
        "actionOrder": action.get("actionOrder"),
        "rawSourceActionType": copy.deepcopy(action.get("rawSourceActionType")),
        "sourceActionType": action.get("sourceActionType"),
        "contextId": action.get("contextId"),
        "contextPathIds": copy.deepcopy(action.get("contextPathIds", [])),
        "sourceType": source_type,
        "target": copy.deepcopy(action.get("target")),
        "recipient": copy.deepcopy(action.get("recipient")),
        "structuredConditions": copy.deepcopy(action.get("conditions", [])),
        "control": copy.deepcopy(action.get("control", {})),
        "flags": copy.deepcopy(action.get("flags", {})),
        "uninterpretedParameters": copy.deepcopy(
            action.get("uninterpretedParameters", {})
        ),
        "source": copy.deepcopy(action.get("source")),
        "chance": None,
        "metrics": [],
        "modes": [],
        "sides": [],
        "conditions": [],
        "trigger": None,
    }


def _build_mechanics(
    effects: Mapping[str, Any], actions: Mapping[str, Any]
) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    mechanics: dict[str, dict[str, Any]] = {}
    effect_ids: dict[str, str] = {}
    slug_owners: dict[str, str] = {}
    reserved_ids = set(GENERIC_MECHANICS) | set(TEXT_ONLY_MECHANICS) | {
        presentation["mechanicId"] for presentation in DETECTED_ACTIONS.values()
    }

    for effect_id in sorted(effects, key=_sort_key):
        effect = _as_dict(effects[effect_id], f"effet {effect_id}")
        presentation = EFFECT_PRESENTATIONS.get(effect_id, {})
        if presentation.get("canonicalEffectId"):
            continue
        base = _slug_base(effect_id)
        mechanic_id = f"effect-{base}" if base in reserved_ids else base
        if mechanic_id in slug_owners and slug_owners[mechanic_id] != effect_id:
            mechanic_id = f"{base}-{hashlib.sha256(effect_id.encode()).hexdigest()[:8]}"
        if mechanic_id in mechanics:
            raise BuilderError("MECHANIC_ID_COLLISION", mechanic_id)
        slug_owners[mechanic_id] = effect_id
        effect_ids[effect_id] = mechanic_id
        presentation = EFFECT_PRESENTATIONS.get(effect_id, {})
        label = presentation.get("label") or _split_source_name(effect_id)
        category = effect.get("category") or "none"
        mechanics[mechanic_id] = {
            "id": mechanic_id,
            "kind": "effect",
            "label": label,
            "sourceName": effect_id,
            "aliases": _unique_strings(presentation.get("aliases", [])),
            "description": presentation.get("description")
            or "Effet structuré présent dans le catalogue de combat.",
            "category": category,
            "catalogSection": "primary"
            if presentation and category in {"buff", "debuff"}
            else "technical",
            "catalogEffectId": effect.get("id"),
            "terms": _unique_strings(presentation.get("terms", [])),
            "occurrences": [],
        }

    for effect_id in sorted(effects, key=_sort_key):
        presentation = EFFECT_PRESENTATIONS.get(effect_id, {})
        canonical_effect_id = presentation.get("canonicalEffectId")
        if not canonical_effect_id:
            continue
        if canonical_effect_id not in effects:
            raise BuilderError(
                "UNKNOWN_CANONICAL_EFFECT", f"{effect_id}: {canonical_effect_id}"
            )
        mechanic_id = effect_ids.get(canonical_effect_id)
        if mechanic_id is None:
            raise BuilderError(
                "INVALID_CANONICAL_EFFECT", f"{effect_id}: {canonical_effect_id}"
            )
        effect_ids[effect_id] = mechanic_id
        mechanic = mechanics[mechanic_id]
        mechanic["aliases"] = _unique_strings(
            [*mechanic.get("aliases", []), effect_id, *presentation.get("aliases", [])]
        )

    action_types = sorted(
        {
            str(record.get("rawSourceActionType") or record.get("sourceActionType") or "")
            for record in actions.values()
        },
        key=_sort_key,
    )
    detected_by_mechanic: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for source_type, presentation in DETECTED_ACTIONS.items():
        if source_type in action_types:
            detected_by_mechanic[presentation["mechanicId"]].append(presentation)
    for mechanic_id, presentations in sorted(detected_by_mechanic.items()):
        first = presentations[0]
        mechanics[mechanic_id] = {
            "id": mechanic_id,
            "kind": "detected_action",
            "label": first["label"],
            "sourceName": first["sourceName"],
            "sourceTerms": _unique_strings(item["sourceName"] for item in presentations),
            "aliases": _unique_strings(
                alias for item in presentations for alias in item.get("aliases", [])
            ),
            "description": first["description"],
            "category": "mechanic",
            "catalogSection": "primary",
            # A detected-action mechanic stays in its dedicated proof case.
            # Text-only occurrences are deliberately not merged into it.
            "terms": [],
            "occurrences": [],
        }

    for source_type in action_types:
        if source_type in DETECTED_ACTIONS:
            continue
        mechanic_id = f"action-{_slug_base(source_type)}"
        if mechanic_id in mechanics:
            raise BuilderError("MECHANIC_ID_COLLISION", mechanic_id)
        mechanics[mechanic_id] = {
            "id": mechanic_id,
            "kind": "detected_action",
            "label": ACTION_PRESENTATIONS.get(source_type, _split_source_name(source_type)),
            "sourceName": source_type,
            "aliases": [],
            "description": (
                "Action conservée par le pipeline sans interprétation complète de ses paramètres."
            ),
            "category": "action",
            "catalogSection": "primary",
            "terms": [],
            "occurrences": [],
        }

    for mechanic_id, presentation in GENERIC_MECHANICS.items():
        if mechanic_id in mechanics:
            raise BuilderError("MECHANIC_ID_COLLISION", mechanic_id)
        mechanics[mechanic_id] = {
            "id": mechanic_id,
            "kind": "mechanic",
            "label": presentation["label"],
            "sourceName": presentation["sourceName"],
            "aliases": _unique_strings(presentation.get("aliases", [])),
            "description": presentation["description"],
            "category": "mechanic",
            "catalogSection": "primary",
            "terms": [],
            "occurrences": [],
        }

    for mechanic_id, presentation in TEXT_ONLY_MECHANICS.items():
        if mechanic_id in mechanics:
            raise BuilderError("MECHANIC_ID_COLLISION", mechanic_id)
        mechanics[mechanic_id] = {
            "id": mechanic_id,
            "kind": "text" if mechanic_id != "war-defense" else "context",
            "label": presentation["label"],
            "sourceName": presentation["sourceName"],
            "aliases": _unique_strings(presentation.get("aliases", [])),
            "description": presentation["description"],
            "category": "mechanic",
            "catalogSection": "primary",
            "terms": _unique_strings(presentation.get("terms", [])),
            "occurrences": [],
        }

    return mechanics, effect_ids


def _presentation_projection(
    character_id: str,
    ability_type: str,
    presentation: Mapping[str, Any],
) -> dict[str, Any]:
    max_level, max_payload = _max_level(presentation.get("levels"))
    if max_level is None or max_payload is None:
        raise BuilderError("MISSING_MAX_LEVEL_PRESENTATION", f"{character_id}/{ability_type}")
    start_energy = max_payload.get("startEnergy")
    cost_energy = max_payload.get("costEnergy")
    energy = None
    if isinstance(start_energy, (int, float)) or isinstance(cost_energy, (int, float)):
        energy = {
            "start": start_energy if isinstance(start_energy, (int, float)) else None,
            "cost": cost_energy if isinstance(cost_energy, (int, float)) else None,
        }
    return {
        "name": str(presentation["name"]).strip(),
        "iconUrl": str(presentation["icon"]).strip(),
        "maxLevel": max_level,
        "officialText": _plain_official_text(max_payload.get("description")),
        "officialTextSource": {
            "file": DEFAULT_PRESENTATIONS.as_posix(),
            "pointer": (
                f"/characters/{character_id}/abilityKit/{ability_type}/"
                f"levels/{max_level}/description"
            ),
        },
        "energy": energy,
    }


def _build_ability_nodes(
    source: Mapping[str, Any],
    character_names: Mapping[str, str],
) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str], str], int]:
    abilities = source["abilities"]
    official = source["official"]
    ability_by_character_type = dict(source["abilityByCharacterType"])
    nodes: dict[str, dict[str, Any]] = {}

    official_presentations: dict[tuple[str, str], dict[str, Any]] = {}
    for character_id in sorted(official):
        kit = official[character_id]["abilityKit"]
        for ability_type in sorted(kit, key=lambda value: ABILITY_TYPES[value]["order"]):
            official_presentations[(character_id, ability_type)] = _presentation_projection(
                character_id, ability_type, kit[ability_type]
            )

    for ability_id in sorted(abilities):
        record = abilities[ability_id]
        obj = record["object"]
        character_id = obj["characterId"]
        ability_type = obj["abilityType"]
        type_presentation = ABILITY_TYPES[ability_type]
        presentation = official_presentations.get((character_id, ability_type))
        base_type = type_presentation["base"]
        base_presentation = official_presentations.get((character_id, base_type))
        if presentation:
            display_name = presentation["name"]
        elif ability_type.endswith("_empower") and base_presentation:
            display_name = f"{base_presentation['name']} — renforcée"
        else:
            display_name = f"{type_presentation['label']} — {character_names[character_id]}"
        nodes[ability_id] = {
            "id": ability_id,
            "characterId": character_id,
            "type": ability_type,
            "typeLabel": type_presentation["label"],
            "typeOrder": type_presentation["order"],
            "baseType": base_type,
            "name": display_name,
            "sourceName": ability_type,
            "iconUrl": presentation["iconUrl"] if presentation else None,
            "maxLevel": presentation["maxLevel"] if presentation else None,
            "officialText": presentation["officialText"] if presentation else None,
            "officialTextSource": presentation["officialTextSource"]
            if presentation
            else None,
            "energy": presentation["energy"] if presentation else None,
            "presentationStatus": "official" if presentation else "unavailable",
            "mechanicsStatus": "available" if record.get("operationKinds") else "empty",
            "isEmpowered": ability_type.endswith("_empower"),
            "parentAbilityId": None,
            "operations": [],
            "actions": [],
            "mentions": [],
            "spawns": [],
        }

    presentation_only_count = 0
    for pair, presentation in sorted(
        official_presentations.items(),
        key=lambda item: (item[0][0], ABILITY_TYPES[item[0][1]]["order"]),
    ):
        if pair in ability_by_character_type:
            continue
        character_id, ability_type = pair
        ability_id = _stable_id("prs", character_id, ability_type)
        if ability_id in nodes:
            raise BuilderError("SYNTHETIC_ABILITY_COLLISION", ability_id)
        type_presentation = ABILITY_TYPES[ability_type]
        nodes[ability_id] = {
            "id": ability_id,
            "characterId": character_id,
            "type": ability_type,
            "typeLabel": type_presentation["label"],
            "typeOrder": type_presentation["order"],
            "baseType": type_presentation["base"],
            "name": presentation["name"],
            "sourceName": ability_type,
            "iconUrl": presentation["iconUrl"],
            "maxLevel": presentation["maxLevel"],
            "officialText": presentation["officialText"],
            "officialTextSource": presentation["officialTextSource"],
            "energy": presentation["energy"],
            "presentationStatus": "official",
            "mechanicsStatus": "unavailable",
            "isEmpowered": False,
            "parentAbilityId": None,
            "operations": [],
            "actions": [],
            "mentions": [],
            "spawns": [],
        }
        ability_by_character_type[pair] = ability_id
        presentation_only_count += 1

    for ability in nodes.values():
        if not ability["isEmpowered"]:
            continue
        base_id = ability_by_character_type.get(
            (ability["characterId"], ability["baseType"])
        )
        if base_id is None:
            raise BuilderError("ORPHAN_EMPOWERED_ABILITY", ability["id"])
        ability["parentAbilityId"] = base_id

    return nodes, ability_by_character_type, presentation_only_count


def _operation_mechanic_ids(
    raw: Mapping[str, Any], projected: Mapping[str, Any]
) -> list[str]:
    result: set[str] = set()
    effect = projected.get("effect")
    if isinstance(effect, dict) and effect.get("mechanicId"):
        result.add(effect["mechanicId"])
    kind = projected.get("kind")
    if kind in {"spawn", "empower"}:
        result.add(str(kind))
    if kind == "ability_energy_generate":
        result.add("action-ability-energy")
    if kind == "turn_meter_modify":
        result.add("action-turn-meter")
    if raw.get("mechanicFamily") == "turn_meter":
        result.add("action-turn-meter")
    if kind == "heal_restore":
        result.add("action-heal")
    if kind in {"barrier_apply", "barrier_remove"}:
        result.add("barrier")
    if kind in {"battlefield_effect_set", "battlefield_effect_clear"}:
        result.add("battlefield-effects")
    selector = raw.get("selector") if isinstance(raw.get("selector"), dict) else {}
    category = selector.get("category")
    if effect is None or not effect.get("mechanicId"):
        if category == "buff":
            result.add("generic-buffs")
        elif category == "debuff":
            result.add("generic-debuffs")
        elif kind and str(kind).startswith("effect_"):
            result.add("generic-effects")
    if kind == "effect_duration_modify" and (
        category == "debuff"
        or (isinstance(effect, dict) and raw.get("effect", {}).get("catalogCategory") == "debuff")
    ):
        result.add("negative-effect-duration")
    if "Guerre" in projected.get("modes", []) and "Défense" in projected.get("sides", []):
        result.add("war-defense")
    return sorted(result)


def _contains_term(text: str, term: str) -> bool:
    text_key = normalize_search(text)
    term_key = normalize_search(term)
    if not text_key or not term_key:
        return False
    pattern = rf"(?:^| ){re.escape(term_key)}(?: |$)"
    for match in re.finditer(pattern, text_key):
        remainder = text_key[match.end() :].lstrip()
        if not term_key.endswith("mineur") and remainder.startswith("mineur"):
            continue
        return True
    return False


def _text_excerpt(text: str, term: str, maximum: int = 220) -> str:
    paragraphs = [line.strip(" >\t") for line in text.splitlines() if line.strip()]
    paragraph = next((line for line in paragraphs if _contains_term(line, term)), text.strip())
    if len(paragraph) <= maximum:
        return paragraph
    key = normalize_search(term)
    lowered = normalize_search(paragraph)
    position = lowered.find(key)
    if position < 0:
        return paragraph[: maximum - 1].rstrip() + "…"
    # Normalization changes offsets; this approximation only selects a readable window.
    ratio = position / max(len(lowered), 1)
    center = int(len(paragraph) * ratio)
    start = max(0, center - maximum // 2)
    end = min(len(paragraph), start + maximum)
    excerpt = paragraph[start:end].strip()
    if start:
        excerpt = "…" + excerpt
    if end < len(paragraph):
        excerpt += "…"
    return excerpt


def _project_spawn(
    spawn: Mapping[str, Any],
    character_names: Mapping[str, str],
    character_statuses: Mapping[str, Mapping[str, str]],
    portraits: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    pool: list[dict[str, Any]] = []
    for item in spawn.get("pool", []):
        if not isinstance(item, dict):
            continue
        character_id = item.get("spawnedCharacterId")
        exact = item.get("characterJoin", {}).get("method") == "exact"
        pool.append(
            {
                "characterId": character_id if exact else None,
                "name": character_names.get(character_id, _split_source_name(str(character_id)))
                if character_id
                else "Entité non reliée",
                "status": character_statuses.get(character_id),
                "portraitUrl": portraits.get(character_id, {}).get("portraitUrl")
                if exact
                else None,
                "relation": "exact" if exact else "unresolved",
                "poolIndex": item.get("poolIndex"),
            }
        )
    return {
        "operationId": spawn.get("operationId"),
        "abilityId": spawn.get("abilityId"),
        "invokingCharacterId": spawn.get("invokingCharacterId"),
        "evidence": "normalized",
        "chance": spawn.get("metrics", {}).get("chancePct", {}).get("maxLevelValue"),
        "pool": sorted(pool, key=lambda item: (item.get("poolIndex") or 0, _sort_key(item["name"]))),
    }


def _occurrence_sort_key(item: Mapping[str, Any]) -> tuple[Any, ...]:
    return (
        item.get("actionOrder") if isinstance(item.get("actionOrder"), int) else 999,
        OPERATION_KINDS.get(str(item.get("kind")), {}).get("order", 999),
        str(item.get("id") or ""),
    )


def _add_mechanic_occurrence(
    mechanics: Mapping[str, dict[str, Any]],
    mechanic_id: str,
    occurrence: Mapping[str, Any],
) -> None:
    if mechanic_id not in mechanics:
        raise BuilderError("ORPHAN_MECHANIC_RELATION", mechanic_id)
    evidence = occurrence.get("evidence")
    if evidence not in PROOF_VALUES:
        raise BuilderError("INVALID_OCCURRENCE_PROOF", f"{mechanic_id}/{evidence}")
    projected = copy.deepcopy(dict(occurrence))
    projected["mechanicId"] = mechanic_id
    mechanics[mechanic_id]["occurrences"].append(projected)


def _compact_occurrence(item: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: copy.deepcopy(item.get(key))
        for key in (
            "id",
            "kind",
            "kindLabel",
            "evidence",
            "target",
            "chance",
            "metrics",
            "modes",
            "sides",
            "conditions",
            "trigger",
            "scope",
            "sourceType",
            "mechanicFamily",
            "turnMeterControl",
            "excerpt",
        )
        if item.get(key) not in (None, [], "")
    }


def _mechanic_result_group(
    ability_id: str,
    occurrences: list[dict[str, Any]],
    abilities: Mapping[str, Mapping[str, Any]],
    character_meta: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    ability = abilities[ability_id]
    character = character_meta[ability["characterId"]]
    chances = [
        item.get("chance")
        for item in occurrences
        if isinstance(item.get("chance"), (int, float))
    ]
    if any(value == 100 for value in chances):
        chance_category = "100"
    elif any(value < 100 for value in chances):
        chance_category = "less"
    else:
        chance_category = "unspecified"
    modes = _unique_strings(mode for item in occurrences for mode in item.get("modes", []))
    sides = _unique_strings(side for item in occurrences for side in item.get("sides", []))
    conditions = _unique_strings(
        condition for item in occurrences for condition in item.get("conditions", [])
    )
    return {
        "abilityId": ability_id,
        "abilityName": ability["name"],
        "abilityType": ability["type"],
        "abilityTypeLabel": ability["typeLabel"],
        "abilityTypeOrder": ability["typeOrder"],
        "isEmpowered": ability["isEmpowered"],
        "iconUrl": ability["iconUrl"],
        "characterId": ability["characterId"],
        "characterName": character["name"],
        "portraitUrl": character["portraitUrl"],
        "playable": character["playable"],
        "status": character["status"],
        "summary": " · ".join(
            _unique_strings(item.get("kindLabel") for item in occurrences)
        ),
        "chanceCategory": chance_category,
        "modes": modes,
        "hasUnrestrictedMode": any(not item.get("modes") for item in occurrences),
        "sides": sides,
        "conditions": conditions,
        "evidence": _unique_strings(item.get("evidence") for item in occurrences),
        "occurrenceCount": len(occurrences),
        "occurrences": [_compact_occurrence(item) for item in occurrences],
    }


def _build_mechanic_shard(
    mechanic: Mapping[str, Any],
    abilities: Mapping[str, Mapping[str, Any]],
    character_meta: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    occurrences = sorted(mechanic.get("occurrences", []), key=_occurrence_sort_key)
    by_evidence = {value: 0 for value in PROOF_VALUES}
    for item in occurrences:
        by_evidence[item["evidence"]] += 1
    if by_evidence["normalized"]:
        global_evidence = "normalized"
    elif by_evidence["preserved_uninterpreted"]:
        global_evidence = "preserved_uninterpreted"
    elif by_evidence["official_text_only"]:
        global_evidence = "official_text_only"
    elif mechanic.get("kind") == "effect":
        global_evidence = "normalized"
    else:
        global_evidence = "official_text_only"

    facets: list[dict[str, Any]] = []
    facet_records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in occurrences:
        if item.get("abilityId") in abilities:
            facet_records[str(item["kind"])].append(item)
    for facet_id, facet_occurrences in sorted(
        facet_records.items(),
        key=lambda row: (OPERATION_KINDS.get(row[0], {}).get("order", 999), row[0]),
    ):
        by_ability: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for occurrence in facet_occurrences:
            by_ability[occurrence["abilityId"]].append(occurrence)
        records = [
            _mechanic_result_group(
                ability_id,
                sorted(items, key=_occurrence_sort_key),
                abilities,
                character_meta,
            )
            for ability_id, items in sorted(by_ability.items())
        ]
        records.sort(
            key=lambda item: (
                _sort_key(item["characterName"]),
                item["abilityTypeOrder"],
                _sort_key(item["abilityName"]),
            )
        )
        facets.append(
            {
                "id": facet_id,
                "label": OPERATION_KINDS.get(facet_id, {}).get("label")
                or _split_source_name(facet_id),
                "abilityCount": len(records),
                "occurrenceCount": len(facet_occurrences),
                "records": records,
            }
        )

    grouped_ability_ids = {
        item["abilityId"] for item in occurrences if item.get("abilityId") in abilities
    }
    playable_ability_ids = {
        ability_id
        for ability_id in grouped_ability_ids
        if character_meta[abilities[ability_id]["characterId"]]["playable"]
    }
    warning = PROOF[global_evidence]["explanation"]
    return {
        "artifactType": "codex_mechanic_shard",
        "schemaVersion": SCHEMA_VERSION,
        "id": mechanic["id"],
        "kind": mechanic["kind"],
        "label": mechanic["label"],
        "sourceName": mechanic.get("sourceName"),
        "sourceTerms": mechanic.get("sourceTerms", []),
        "aliases": mechanic.get("aliases", []),
        "description": mechanic["description"],
        "category": mechanic["category"],
        "globalEvidence": global_evidence,
        "warning": warning,
        "counts": {
            "abilities": len(grouped_ability_ids),
            "playableAbilities": len(playable_ability_ids),
            "occurrences": len(occurrences),
            "technicalOccurrences": sum(
                1 for item in occurrences if item.get("abilityId") not in abilities
            ),
            "byEvidence": by_evidence,
        },
        "facets": facets,
    }


def _mechanic_stub(shard: Mapping[str, Any], section: str) -> dict[str, Any]:
    return {
        "id": shard["id"],
        "kind": shard["kind"],
        "label": shard["label"],
        "sourceName": shard.get("sourceName"),
        "aliases": shard.get("aliases", []),
        "description": shard["description"],
        "category": shard["category"],
        "catalogSection": section,
        "globalEvidence": shard["globalEvidence"],
        "counts": shard["counts"],
        "facets": [
            {
                "id": facet["id"],
                "label": facet["label"],
                "abilityCount": facet["abilityCount"],
                "occurrenceCount": facet["occurrenceCount"],
            }
            for facet in shard["facets"]
        ],
    }


def _source_generation(documents: Mapping[str, Any]) -> dict[str, Any]:
    source_manifest = _as_dict(documents.get("sourceManifest"), "source-manifest")
    game = source_manifest.get("game") if isinstance(source_manifest.get("game"), dict) else {}
    return {
        "gameVersion": game.get("version"),
        "gameBuild": game.get("build"),
        "updatedAt": source_manifest.get("updatedAt"),
        "capabilitiesChecksum": documents["publisherManifest"]["capabilitiesChecksum"],
        "publisherPayloadSetChecksum": documents["publisherManifest"][
            "currentPayloadSetChecksum"
        ],
    }


def generate_artifacts(documents: Mapping[str, Any]) -> GeneratedArtifacts:
    """Create every browser payload in memory before any filesystem write."""

    source = _validate_sources(documents)
    characters = source["characters"]
    contexts = source["contexts"]
    operations = source["operations"]
    actions = source["actions"]
    spawn_records = source["spawns"]
    official = source["official"]
    portraits = source["portraits"]

    raw_operations_by_ability: dict[str, list[dict[str, Any]]] = defaultdict(list)
    raw_actions_by_ability: dict[str, list[dict[str, Any]]] = defaultdict(list)
    raw_operations_by_context: dict[str, list[dict[str, Any]]] = defaultdict(list)
    raw_actions_by_context: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for operation in operations.values():
        ability_id = operation.get("abilityId")
        context_id = operation.get("contextId")
        if isinstance(ability_id, str):
            raw_operations_by_ability[ability_id].append(operation)
        elif isinstance(context_id, str):
            raw_operations_by_context[context_id].append(operation)
    for action in actions.values():
        ability_id = action.get("abilityId")
        context_id = action.get("contextId")
        if isinstance(ability_id, str):
            raw_actions_by_ability[ability_id].append(action)
        elif isinstance(context_id, str):
            raw_actions_by_context[context_id].append(action)

    spawned_ids: set[str] = set()
    for spawn in spawn_records.values():
        for pool_item in spawn.get("pool", []):
            if (
                isinstance(pool_item, dict)
                and pool_item.get("characterJoin", {}).get("method") == "exact"
                and pool_item.get("spawnedCharacterId") in characters
            ):
                spawned_ids.add(pool_item["spawnedCharacterId"])

    character_names = {
        character_id: _display_character(character_id, portraits.get(character_id))
        for character_id in sorted(characters)
    }
    character_statuses = {
        character_id: _entity_status(
            character_id, character_id in official, spawned_ids
        )
        for character_id in sorted(characters)
    }
    character_meta: dict[str, dict[str, Any]] = {}
    for character_id in sorted(characters):
        portrait = portraits.get(character_id, {})
        raw_traits = characters[character_id].get("object", {}).get("traits", [])
        traits = _unique_strings(raw_traits)
        character_meta[character_id] = {
            "id": character_id,
            "name": character_names[character_id],
            "sourceName": character_id,
            "official": character_id in official,
            "playable": character_id in official,
            "status": character_statuses[character_id],
            "portraitUrl": portrait.get("portraitUrl")
            if isinstance(portrait.get("portraitUrl"), str)
            else None,
            "traits": traits,
            "displayTraits": [_trait_label(value) for value in traits],
        }

    mechanics, effect_ids = _build_mechanics(source["effects"], actions)
    ability_nodes, ability_by_character_type, presentation_only_count = (
        _build_ability_nodes(source, character_names)
    )
    abilities_by_character: dict[str, list[str]] = defaultdict(list)
    for ability_id, ability in ability_nodes.items():
        abilities_by_character[ability["characterId"]].append(ability_id)

    ability_mechanics: dict[str, set[str]] = defaultdict(set)
    character_mechanics: dict[str, set[str]] = defaultdict(set)
    technical_contexts: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    operation_routes: dict[str, dict[str, Any]] = {}
    action_routes: dict[str, dict[str, Any]] = {}

    for operation_id in sorted(operations):
        raw = operations[operation_id]
        projected = _project_operation(raw, contexts, effect_ids)
        mechanic_ids = _operation_mechanic_ids(raw, projected)
        projected["mechanicIds"] = mechanic_ids
        ability_id = projected.get("abilityId")
        character_id = projected["characterId"]
        if ability_id in ability_nodes:
            ability_nodes[ability_id]["operations"].append(projected)
        else:
            context_id = raw.get("contextId")
            group = technical_contexts[character_id].setdefault(
                context_id,
                {
                    "id": context_id,
                    "label": "Contexte technique",
                    "trigger": TRIGGER_LABELS.get(
                        contexts.get(context_id, {})
                        .get("object", {})
                        .get("execution", {})
                        .get("trigger")
                    ),
                    "operations": [],
                    "actions": [],
                },
            )
            group["operations"].append(projected)
        for mechanic_id in mechanic_ids:
            _add_mechanic_occurrence(mechanics, mechanic_id, projected)
            character_mechanics[character_id].add(mechanic_id)
            if ability_id in ability_nodes:
                ability_mechanics[ability_id].add(mechanic_id)
        operation_routes[operation_id] = {
            "characterId": character_id,
            "abilityId": ability_id if ability_id in ability_nodes else None,
            "mechanicIds": mechanic_ids,
            "evidence": "normalized",
        }

    for action_id in sorted(actions):
        raw = actions[action_id]
        projected = _project_action(raw)
        mechanic_id = projected["mechanicId"]
        if mechanic_id not in mechanics:
            raise BuilderError("ORPHAN_ACTION_MECHANIC", f"{action_id}/{mechanic_id}")
        ability_id = projected.get("abilityId")
        character_id = projected["characterId"]
        if ability_id in ability_nodes:
            ability_nodes[ability_id]["actions"].append(projected)
        else:
            context_id = raw.get("contextId")
            group = technical_contexts[character_id].setdefault(
                context_id,
                {
                    "id": context_id,
                    "label": "Contexte technique",
                    "trigger": TRIGGER_LABELS.get(
                        contexts.get(context_id, {})
                        .get("object", {})
                        .get("execution", {})
                        .get("trigger")
                    ),
                    "operations": [],
                    "actions": [],
                },
            )
            group["actions"].append(projected)
        _add_mechanic_occurrence(mechanics, mechanic_id, projected)
        character_mechanics[character_id].add(mechanic_id)
        if ability_id in ability_nodes:
            ability_mechanics[ability_id].add(mechanic_id)
        action_routes[action_id] = {
            "characterId": character_id,
            "abilityId": ability_id if ability_id in ability_nodes else None,
            "mechanicIds": [mechanic_id],
            "evidence": "preserved_uninterpreted",
        }

    spawn_projections: dict[str, dict[str, Any]] = {}
    character_invocations: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for operation_id in sorted(spawn_records):
        projection = _project_spawn(
            spawn_records[operation_id],
            character_names,
            character_statuses,
            portraits,
        )
        spawn_projections[operation_id] = projection
        character_invocations[projection["invokingCharacterId"]].append(projection)
        if projection.get("abilityId") in ability_nodes:
            ability_nodes[projection["abilityId"]]["spawns"].append(projection)

    ability_presentations: dict[str, dict[str, Any]] = {}
    try:
        for ability_id in sorted(ability_nodes):
            ability = ability_nodes[ability_id]
            presentation = build_ability_presentation(
                ability,
                raw_operations_by_ability.get(ability_id, []),
                raw_actions_by_ability.get(ability_id, []),
                contexts,
                spawn_projections,
            )
            ability["presentation"] = presentation
            ability_presentations[ability_id] = presentation
    except AbilityPresentationError as error:
        raise BuilderError(error.code, error.message) from error

    mention_terms = {
        mechanic_id: mechanic.get("terms", [])
        for mechanic_id, mechanic in mechanics.items()
        if mechanic.get("terms")
    }
    for ability_id in sorted(ability_nodes):
        ability = ability_nodes[ability_id]
        official_text = ability.get("officialText")
        if not official_text:
            continue
        for mechanic_id, terms in sorted(mention_terms.items()):
            if mechanic_id in ability_mechanics[ability_id]:
                continue
            matched_term = next(
                (term for term in sorted(terms, key=lambda value: (-len(value), value)) if _contains_term(official_text, term)),
                None,
            )
            if matched_term is None:
                continue
            mention = {
                "id": _stable_id("txt", ability_id, mechanic_id),
                "kind": "mention",
                "kindLabel": OPERATION_KINDS["mention"]["label"],
                "evidence": "official_text_only",
                "characterId": ability["characterId"],
                "abilityId": ability_id,
                "abilityType": ability["type"],
                "mechanicId": mechanic_id,
                "term": matched_term,
                "excerpt": _text_excerpt(official_text, matched_term),
                "target": None,
                "chance": None,
                "metrics": [],
                "modes": [],
                "sides": [],
                "conditions": [],
                "trigger": None,
            }
            ability["mentions"].append(mention)
            _add_mechanic_occurrence(mechanics, mechanic_id, mention)
            ability_mechanics[ability_id].add(mechanic_id)
            character_mechanics[ability["characterId"]].add(mechanic_id)

    for ability_id, ability in ability_nodes.items():
        ability["operations"].sort(key=_occurrence_sort_key)
        ability["actions"].sort(key=_occurrence_sort_key)
        ability["mentions"].sort(key=_occurrence_sort_key)
        ability["spawns"].sort(key=lambda item: item["operationId"])
        ability["relatedMechanicIds"] = sorted(ability_mechanics.get(ability_id, set()))

    technical_presentations: dict[str, dict[str, Any]] = {}
    try:
        for character_id in sorted(technical_contexts):
            for context_id, group in sorted(technical_contexts[character_id].items()):
                context_object = contexts.get(context_id, {}).get("object", {})
                technical_key = context_object.get("technicalKey")
                parent_type = {
                    "safety": "basic",
                    "safety_empower": "basic_empower",
                }.get(technical_key)
                parent_ability_id = (
                    ability_by_character_type.get((character_id, parent_type))
                    if parent_type
                    else None
                )
                variant_type = technical_key or "technical_context"
                variant_id = f"variant:{context_id}"
                relationship_evidence = (
                    "controlled_rule" if parent_type and parent_ability_id else "unknown"
                )
                variant = {
                    "id": variant_id,
                    "type": variant_type,
                    "label": (
                        f"Variante technique — {technical_key}"
                        if technical_key in {"safety", "safety_empower"}
                        else "Contexte technique"
                    ),
                    "sourceContextId": context_id,
                    "source": copy.deepcopy(context_object.get("source")),
                    "parentAbilityId": parent_ability_id,
                    "parentAbilityType": parent_type,
                    "relationshipEvidence": relationship_evidence,
                }
                synthetic_ability = {
                    "id": variant_id,
                    "characterId": character_id,
                    "type": variant_type,
                    "parentAbilityId": parent_ability_id,
                    "officialText": None,
                    "officialTextSource": None,
                }
                presentation = build_ability_presentation(
                    synthetic_ability,
                    raw_operations_by_context.get(context_id, []),
                    raw_actions_by_context.get(context_id, []),
                    contexts,
                    spawn_projections,
                    presentation_id=variant_id,
                    source_context_id=context_id,
                    variant=variant,
                )
                group["label"] = variant["label"]
                group["variantType"] = variant_type
                group["parentAbilityId"] = parent_ability_id
                group["relationshipEvidence"] = relationship_evidence
                group["source"] = copy.deepcopy(context_object.get("source"))
                group["presentation"] = presentation
                technical_presentations[context_id] = presentation
    except AbilityPresentationError as error:
        raise BuilderError(error.code, error.message) from error

    mechanic_shards: dict[str, dict[str, Any]] = {}
    mechanic_stubs: dict[str, dict[str, Any]] = {}
    for mechanic_id in sorted(mechanics):
        shard = _build_mechanic_shard(
            mechanics[mechanic_id], ability_nodes, character_meta
        )
        mechanic_shards[mechanic_id] = shard
        mechanic_stubs[mechanic_id] = _mechanic_stub(
            shard, mechanics[mechanic_id]["catalogSection"]
        )

    mechanic_output_shards: dict[str, dict[str, Any]] = {}
    mechanic_result_pages: dict[str, dict[str, Any]] = {}
    mechanic_page_size = 80
    for mechanic_id, shard in mechanic_shards.items():
        output_shard = copy.deepcopy(shard)
        for facet in output_shard["facets"]:
            records = facet.pop("records")
            pages: list[dict[str, Any]] = []
            page_count = max(1, (len(records) + mechanic_page_size - 1) // mechanic_page_size)
            for page_index in range(page_count):
                start = page_index * mechanic_page_size
                page_records = records[start : start + mechanic_page_size]
                path = (
                    f"mechanic-results/{mechanic_id}/{facet['id']}-{page_index + 1}.json"
                )
                mechanic_result_pages[path] = {
                    "artifactType": "codex_mechanic_results",
                    "schemaVersion": SCHEMA_VERSION,
                    "mechanicId": mechanic_id,
                    "facetId": facet["id"],
                    "page": page_index + 1,
                    "pageCount": page_count,
                    "recordCount": len(page_records),
                    "records": page_records,
                }
                pages.append(
                    {
                        "path": path,
                        "page": page_index + 1,
                        "recordCount": len(page_records),
                    }
                )
            facet["pages"] = pages
        mechanic_output_shards[mechanic_id] = output_shard

    character_shards: dict[str, dict[str, Any]] = {}
    character_catalog: list[dict[str, Any]] = []
    for character_id in sorted(characters):
        ability_ids = sorted(
            abilities_by_character.get(character_id, []),
            key=lambda ability_id: (
                ability_nodes[ability_id]["typeOrder"],
                ability_id,
            ),
        )
        related_stubs = [
            {
                "id": mechanic_id,
                "label": mechanic_stubs[mechanic_id]["label"],
                "kind": mechanic_stubs[mechanic_id]["kind"],
                "globalEvidence": mechanic_stubs[mechanic_id]["globalEvidence"],
                "occurrenceCount": sum(
                    1
                    for item in mechanics[mechanic_id]["occurrences"]
                    if item.get("characterId") == character_id
                ),
            }
            for mechanic_id in sorted(
                character_mechanics.get(character_id, set()),
                key=lambda value: _sort_key(mechanic_stubs[value]["label"]),
            )
        ]
        technical_groups = list(technical_contexts.get(character_id, {}).values())
        technical_groups.sort(
            key=lambda item: (
                _sort_key(item.get("trigger") or item["label"]),
                item["id"],
            )
        )
        for index, group in enumerate(technical_groups, 1):
            if group.get("variantType") not in {"safety", "safety_empower"}:
                group["label"] = f"Contexte technique {index}"
            group["operations"].sort(key=_occurrence_sort_key)
            group["actions"].sort(key=_occurrence_sort_key)
        shard_abilities = [copy.deepcopy(ability_nodes[ability_id]) for ability_id in ability_ids]
        for ability in shard_abilities:
            ability["relatedMechanics"] = [
                {
                    "id": mechanic_id,
                    "label": mechanic_stubs[mechanic_id]["label"],
                    "kind": mechanic_stubs[mechanic_id]["kind"],
                }
                for mechanic_id in ability.pop("relatedMechanicIds")
            ]
        shard = {
            "artifactType": "codex_character_shard",
            "schemaVersion": SCHEMA_VERSION,
            "character": copy.deepcopy(character_meta[character_id]),
            "abilities": shard_abilities,
            "invocations": copy.deepcopy(character_invocations.get(character_id, [])),
            "relatedMechanics": related_stubs,
            "technicalContexts": copy.deepcopy(technical_groups),
        }
        character_shards[character_id] = shard
        if character_id in official:
            character_catalog.append(
                {
                    "id": character_id,
                    "name": character_meta[character_id]["name"],
                    "portraitUrl": character_meta[character_id]["portraitUrl"],
                    "cardTraits": character_meta[character_id]["displayTraits"][:3],
                    "abilities": [
                        {
                            "id": ability["id"],
                            "name": ability["name"],
                            "type": ability["type"],
                            "typeLabel": ability["typeLabel"],
                            "iconUrl": ability["iconUrl"],
                            "isEmpowered": ability["isEmpowered"],
                            "parentAbilityId": ability["parentAbilityId"],
                        }
                        for ability in shard_abilities
                    ],
                    "hasEmpowered": any(
                        ability["isEmpowered"] for ability in shard_abilities
                    ),
                }
            )
    character_catalog.sort(key=lambda item: _sort_key(item["name"]))

    search_records: list[dict[str, Any]] = []
    for character_id in sorted(character_meta):
        character = character_meta[character_id]
        result_group = "characters" if character["official"] else "related"
        search_records.append(
            {
                "kind": "character" if character["official"] else "entity",
                "resultGroup": result_group,
                "view": "character" if character["official"] else "entity",
                "id": character_id,
                "label": character["name"],
                "sourceName": character["sourceName"],
                "context": " · ".join(character["displayTraits"][:3])
                if character["official"]
                else character["status"]["label"],
                "portraitUrl": character["portraitUrl"],
            }
        )
    for ability_id in sorted(ability_nodes):
        ability = ability_nodes[ability_id]
        parent = character_meta[ability["characterId"]]
        search_records.append(
            {
                "kind": "ability",
                "resultGroup": "abilities",
                "view": "ability",
                "id": ability_id,
                "label": ability["name"],
                "sourceName": ability["sourceName"],
                "context": ability["typeLabel"],
                "iconUrl": ability["iconUrl"],
                "parentLabel": parent["name"],
            }
        )
    for mechanic_id in sorted(mechanic_stubs):
        mechanic = mechanic_stubs[mechanic_id]
        search_records.append(
            {
                "kind": "effect" if mechanic["kind"] == "effect" else "mechanic",
                "resultGroup": "mechanics",
                "view": "effect" if mechanic["kind"] == "effect" else "mechanic",
                "id": mechanic_id,
                "label": mechanic["label"],
                "sourceName": mechanic.get("sourceName"),
                "aliases": mechanic.get("aliases", []),
                "context": PROOF[mechanic["globalEvidence"]]["label"],
            }
        )
    group_order = {"characters": 0, "mechanics": 1, "abilities": 2, "related": 3}
    search_records.sort(
        key=lambda item: (
            group_order[item["resultGroup"]],
            _sort_key(item["label"]),
            item["id"],
        )
    )

    route_payloads: dict[str, dict[str, Any]] = {}
    for prefix, records, route_name in (
        ("abl", {key: value for key, value in ability_nodes.items() if key.startswith("abl_")}, "abilities"),
        ("prs", {key: value for key, value in ability_nodes.items() if key.startswith("prs_")}, "abilities"),
    ):
        for identifier, ability in records.items():
            bucket = _route_bucket(identifier, prefix)
            path = f"routes/{route_name}-{bucket}.json"
            payload = route_payloads.setdefault(
                path,
                {
                    "artifactType": "codex_ability_routes",
                    "schemaVersion": SCHEMA_VERSION,
                    "records": {},
                },
            )
            payload["records"][identifier] = {
                "characterId": ability["characterId"],
                "abilityId": identifier,
            }
    for identifier, route in operation_routes.items():
        bucket = _route_bucket(identifier, "op")
        path = f"routes/operations-{bucket}.json"
        payload = route_payloads.setdefault(
            path,
            {
                "artifactType": "codex_operation_routes",
                "schemaVersion": SCHEMA_VERSION,
                "records": {},
            },
        )
        payload["records"][identifier] = route
    for identifier, route in action_routes.items():
        bucket = _route_bucket(identifier, "act")
        path = f"routes/actions-{bucket}.json"
        payload = route_payloads.setdefault(
            path,
            {
                "artifactType": "codex_action_routes",
                "schemaVersion": SCHEMA_VERSION,
                "records": {},
            },
        )
        payload["records"][identifier] = route
    for route_name, artifact_type in (
        ("abilities", "codex_ability_routes"),
        ("operations", "codex_operation_routes"),
        ("actions", "codex_action_routes"),
    ):
        for bucket in ROUTE_BUCKETS:
            route_payloads.setdefault(
                f"routes/{route_name}-{bucket}.json",
                {
                    "artifactType": artifact_type,
                    "schemaVersion": SCHEMA_VERSION,
                    "records": {},
                },
            )

    primary_mechanics = sorted(
        (
            copy.deepcopy(stub)
            for stub in mechanic_stubs.values()
            if stub["catalogSection"] == "primary"
            and stub["counts"]["occurrences"] > 0
        ),
        key=lambda item: _sort_key(item["label"]),
    )
    technical_mechanics = sorted(
        (
            copy.deepcopy(stub)
            for stub in mechanic_stubs.values()
            if stub["catalogSection"] == "technical"
        ),
        key=lambda item: _sort_key(item["label"]),
    )
    mechanics_catalog = {
        "artifactType": "codex_mechanics_catalog",
        "schemaVersion": SCHEMA_VERSION,
        "primary": primary_mechanics,
        "technical": technical_mechanics,
        "counts": {
            "primary": len(primary_mechanics),
            "technical": len(technical_mechanics),
            "total": len(mechanic_stubs),
        },
    }

    supported_suggestions: list[dict[str, Any]] = []
    for suggestion in SUGGESTION_SPECS:
        mechanic = mechanic_shards.get(suggestion["id"])
        if mechanic is None:
            continue
        facets = {facet["id"] for facet in mechanic["facets"]}
        if suggestion.get("operation") not in facets:
            continue
        supported_suggestions.append(copy.deepcopy(suggestion))

    presentation_audit = audit_ability_presentations(
        ability_presentations.values(), technical_presentations.values()
    )
    source_generation = _source_generation(documents)
    counts = {
        "characters": len(characters),
        "officialCharacters": len(official),
        "technicalCharacters": len(characters) - len(official),
        "abilities": len(ability_nodes),
        "indexedAbilities": len(source["abilities"]),
        "presentationOnlyAbilities": presentation_only_count,
        "empoweredAbilities": sum(
            1 for ability in ability_nodes.values() if ability["isEmpowered"]
        ),
        "officialPresentations": sum(
            len(record["abilityKit"]) for record in official.values()
        ),
        "effects": len(source["effects"]),
        "mechanics": len(mechanic_stubs),
        "operations": len(operations),
        "preservedActions": len(actions),
        "spawns": len(spawn_records),
        "textMentions": sum(
            len(ability["mentions"]) for ability in ability_nodes.values()
        ),
        "abilityPresentations": presentation_audit["abilityPresentations"],
        "phases": presentation_audit["totalPhases"],
        "assignedActions": presentation_audit["assignedActions"],
        "unassignedActions": presentation_audit["unassignedActions"],
    }
    bootstrap = {
        "artifactType": "codex_bootstrap",
        "schemaVersion": SCHEMA_VERSION,
        "source": source_generation,
        "counts": counts,
        "proof": PROOF,
        "abilityPresentation": {
            "schemaVersion": ABILITY_PRESENTATION_SCHEMA_VERSION,
            "assertionEvidence": sorted(ASSERTION_EVIDENCE),
            "diagnostics": DIAGNOSTIC_MESSAGES,
            "diagnosticsHiddenByDefault": True,
        },
        "suggestions": supported_suggestions,
        "entrypoints": {
            "search": "search.json",
            "characters": "characters.json",
            "mechanics": "mechanics.json",
            "characterShardPattern": "characters/{id}.json",
            "mechanicShardPattern": "mechanics/{id}.json",
            "abilityRoutePattern": "routes/abilities-{bucket}.json",
            "operationRoutePattern": "routes/operations-{bucket}.json",
            "actionRoutePattern": "routes/actions-{bucket}.json",
        },
        "compatibility": {
            "staticHosting": True,
            "githubPagesSubpath": True,
            "operationsJsonBrowserDependency": False,
        },
    }

    payload_objects: dict[str, Any] = {
        "bootstrap.json": bootstrap,
        "search.json": {
            "artifactType": "codex_search_index",
            "schemaVersion": SCHEMA_VERSION,
            "recordCount": len(search_records),
            "records": search_records,
        },
        "characters.json": {
            "artifactType": "codex_character_catalog",
            "schemaVersion": SCHEMA_VERSION,
            "recordCount": len(character_catalog),
            "pageSize": 24,
            "records": character_catalog,
        },
        "mechanics.json": mechanics_catalog,
    }
    for character_id, shard in character_shards.items():
        payload_objects[f"characters/{character_id}.json"] = shard
    for mechanic_id, shard in mechanic_output_shards.items():
        payload_objects[f"mechanics/{mechanic_id}.json"] = shard
    payload_objects.update(mechanic_result_pages)
    payload_objects.update(route_payloads)

    payloads = {
        path: _json_bytes(payload_objects[path]) for path in sorted(payload_objects)
    }
    inventory = [
        {"path": path, "sizeBytes": len(data), "sha256": _sha256(data)}
        for path, data in sorted(payloads.items())
    ]
    payload_set_checksum = _sha256_prefixed(_json_bytes(inventory))
    source_checksums = {
        "publisherManifest": documents["publisherManifestChecksum"],
        "indexManifest": documents["indexManifestChecksum"],
        "presentations": documents["presentationsChecksum"],
        "portraits": documents["portraitsChecksum"],
        "sourceManifest": documents["sourceManifestChecksum"],
    }
    generation_manifest_object = {
        "artifactType": "codex_generation_manifest",
        "schemaVersion": SCHEMA_VERSION,
        "payloadSetChecksum": payload_set_checksum,
        "source": source_generation,
        "sourceChecksums": source_checksums,
        "counts": counts,
        "presentationAudit": presentation_audit,
        "payloadCount": len(inventory),
        "payloads": inventory,
        "limitations": LIMITATIONS,
        "audit": {
            "status": "passed",
            "checks": [
                "upstream_checksums_match",
                "official_character_relations_are_exact",
                "ability_relations_are_exact",
                "spawn_relations_are_exact",
                "aliases_are_unambiguous",
                "proof_values_are_closed",
                "all_routes_resolve",
                "official_text_full_value_is_stored_once",
                "operations_json_has_no_browser_reference",
                "ability_presentations_match_source_actions",
                "phase_ids_and_text_segments_are_stable",
                "phase_assertions_keep_per_assertion_evidence",
            ],
        },
    }
    generation_manifest = _json_bytes(generation_manifest_object)
    payload_hex = payload_set_checksum.removeprefix("sha256:")
    current_path = f"generations/sha256-{payload_hex}/"
    stable_manifest_object = {
        "artifactType": "msf_capabilities_explorer_publication",
        "schemaVersion": SCHEMA_VERSION,
        "currentPayloadSetChecksum": payload_set_checksum,
        "currentPath": current_path,
        "source": source_generation,
        "counts": counts,
        "bootstrap": {
            "path": "bootstrap.json",
            "sizeBytes": len(payloads["bootstrap.json"]),
            "sha256": _sha256(payloads["bootstrap.json"]),
        },
        "generationManifest": {
            "path": "generation-manifest.json",
            "sizeBytes": len(generation_manifest),
            "sha256": _sha256(generation_manifest),
        },
    }
    stable_manifest = _json_bytes(stable_manifest_object)
    return GeneratedArtifacts(
        payloads=payloads,
        generation_manifest=generation_manifest,
        stable_manifest=stable_manifest,
        payload_set_checksum=payload_set_checksum,
        counts=counts,
        presentation_audit=presentation_audit,
    )


def _generation_directory_name(checksum: str) -> str:
    value = _validate_prefixed_checksum(checksum, "génération explorer")
    return f"sha256-{value.removeprefix('sha256:')}"


def _expected_generation_files(generated: GeneratedArtifacts) -> dict[str, bytes]:
    return {
        **generated.payloads,
        "generation-manifest.json": generated.generation_manifest,
    }


def _compare_generation(directory: Path, expected: Mapping[str, bytes]) -> None:
    if not directory.is_dir() or directory.is_symlink():
        raise BuilderError("MISSING_EXPLORER_GENERATION", str(directory))
    actual_paths: set[str] = set()
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise BuilderError("SYMLINK_OUTPUT", str(path))
        if path.is_file():
            actual_paths.add(path.relative_to(directory).as_posix())
    if actual_paths != set(expected):
        missing = sorted(set(expected) - actual_paths)
        extra = sorted(actual_paths - set(expected))
        raise BuilderError(
            "EXPLORER_INVENTORY_MISMATCH",
            f"manquants={missing[:3]}, supplémentaires={extra[:3]}",
        )
    for relative, expected_bytes in expected.items():
        try:
            actual = (directory / relative).read_bytes()
        except OSError as error:
            raise BuilderError("OUTPUT_IO", f"Lecture impossible : {relative}: {error}") from error
        if actual != expected_bytes:
            raise BuilderError("EXPLORER_PAYLOAD_MISMATCH", relative)


def _validate_output_root(output_root: Path) -> None:
    if output_root.exists() and output_root.is_symlink():
        raise BuilderError("SYMLINK_OUTPUT", str(output_root))
    if not output_root.exists():
        return
    allowed = {"manifest.json", "generations"}
    unknown = sorted(path.name for path in output_root.iterdir() if path.name not in allowed)
    if unknown:
        raise BuilderError("UNKNOWN_OUTPUT_ENTRY", ", ".join(unknown))
    generations = output_root / "generations"
    if generations.exists() and generations.is_symlink():
        raise BuilderError("SYMLINK_OUTPUT", str(generations))
    if generations.exists():
        invalid = sorted(
            path.name
            for path in generations.iterdir()
            if not SAFE_HASH_DIRECTORY.fullmatch(path.name)
        )
        if invalid:
            raise BuilderError("UNKNOWN_GENERATION_ENTRY", ", ".join(invalid))


def check_explorer(
    repository_root: Path | str = Path("."),
    *,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
) -> BuildResult:
    root = Path(repository_root).resolve()
    documents = load_source_documents(root)
    generated = generate_artifacts(documents)
    destination = root / output_root
    _validate_output_root(destination)
    manifest_path = destination / "manifest.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise BuilderError("MISSING_EXPLORER_MANIFEST", str(manifest_path))
    if manifest_path.read_bytes() != generated.stable_manifest:
        raise BuilderError("EXPLORER_MANIFEST_MISMATCH", str(manifest_path))
    generation_name = _generation_directory_name(generated.payload_set_checksum)
    generation_path = destination / "generations" / generation_name
    _compare_generation(generation_path, _expected_generation_files(generated))
    return BuildResult(
        output_root=destination,
        generation_path=generation_path,
        payload_set_checksum=generated.payload_set_checksum,
        counts=generated.counts,
        payload_sizes={path: len(data) for path, data in generated.payloads.items()},
        presentation_audit=generated.presentation_audit,
    )


def build_explorer(
    repository_root: Path | str = Path("."),
    *,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
) -> BuildResult:
    root = Path(repository_root).resolve()
    documents = load_source_documents(root)
    generated = generate_artifacts(documents)
    destination = root / output_root
    _validate_output_root(destination)
    destination.mkdir(parents=True, exist_ok=True)
    generations = destination / "generations"
    generations.mkdir(exist_ok=True)
    generation_name = _generation_directory_name(generated.payload_set_checksum)
    generation_path = generations / generation_name
    expected = _expected_generation_files(generated)

    if generation_path.exists():
        _compare_generation(generation_path, expected)
    else:
        temp_directory = Path(
            tempfile.mkdtemp(prefix=".codex-explorer-", dir=generations)
        )
        try:
            for relative, data in sorted(expected.items()):
                target = temp_directory / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            _compare_generation(temp_directory, expected)
            os.replace(temp_directory, generation_path)
        except Exception:
            shutil.rmtree(temp_directory, ignore_errors=True)
            raise

    manifest_temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=".manifest-", suffix=".json", dir=destination, delete=False
        ) as handle:
            handle.write(generated.stable_manifest)
            handle.flush()
            os.fsync(handle.fileno())
            manifest_temp = Path(handle.name)
        os.replace(manifest_temp, destination / "manifest.json")
        manifest_temp = None
    finally:
        if manifest_temp is not None:
            manifest_temp.unlink(missing_ok=True)

    _compare_generation(generation_path, expected)
    if (destination / "manifest.json").read_bytes() != generated.stable_manifest:
        raise BuilderError("EXPLORER_MANIFEST_MISMATCH", "Écriture finale incohérente")
    return BuildResult(
        output_root=destination,
        generation_path=generation_path,
        payload_set_checksum=generated.payload_set_checksum,
        counts=generated.counts,
        payload_sizes={path: len(data) for path, data in generated.payloads.items()},
        presentation_audit=generated.presentation_audit,
    )
