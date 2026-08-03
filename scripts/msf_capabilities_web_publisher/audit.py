"""Strict, dependency-free validation of MSF capability index artifacts."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from typing import Any

from .diagnostics import PublisherAuditError, PublisherInputError


PUBLISHER_SCHEMA_VERSION = "1.0.0"
SUPPORTED_INDEX_SCHEMA_VERSIONS = frozenset({"1.0.0", "1.1.0"})
SUPPORTED_NORMALIZER_SCHEMA_VERSIONS = frozenset({"1.0.0", "1.1.0"})
SUPPORTED_PARSER_SCHEMA_VERSION = "1.0.0"

INDEX_MANIFEST_PATH = "index-manifest.json"
PAYLOAD_PATHS = (
    "abilities.json",
    "characters.json",
    "contexts.json",
    "effects.json",
    "operations.json",
    "spawns.json",
    "uninterpreted-actions.json",
)
EXPECTED_ARTIFACT_PATHS = (INDEX_MANIFEST_PATH, *PAYLOAD_PATHS)
ALLOWED_SOURCE_PATHS = frozenset((*EXPECTED_ARTIFACT_PATHS, "README.md"))

EXPECTED_ARTIFACT_TYPES = {
    "abilities.json": "abilities",
    "characters.json": "characters",
    "contexts.json": "contexts",
    "effects.json": "effects",
    "operations.json": "operations",
    "spawns.json": "spawns",
    "uninterpreted-actions.json": "uninterpreted_actions",
}

SHA256_HEX_PATTERN = re.compile(r"^[0-9a-f]{64}$")
SHA256_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
CURRENT_PATH_PATTERN = re.compile(
    r"^indexed/sha256-([0-9a-f]{64})/$"
)


@dataclass(frozen=True)
class Artifact:
    """One validated artifact and its exact source bytes."""

    path: str
    payload: bytes
    document: dict[str, Any]
    size_bytes: int
    sha256: str


@dataclass(frozen=True)
class ValidatedIndex:
    """The complete, cross-checked contract emitted by the indexer."""

    directory: Path
    artifacts: dict[str, Artifact]
    manifest: dict[str, Any]
    capabilities_checksum: str
    payload_set_checksum: str

    @property
    def payload_set_hex(self) -> str:
        return self.payload_set_checksum.removeprefix("sha256:")


@dataclass(frozen=True)
class StableManifest:
    """A validated stable pointer already present below docs/."""

    payload: bytes
    document: dict[str, Any]
    current_payload_set_checksum: str
    current_path: str
    payload_set_hex: str
    capabilities_checksum: str
    index_manifest_path: str
    index_manifest_size_bytes: int
    index_manifest_sha256: str


def serialize_json(document: Any) -> bytes:
    """Serialize canonical JSON exactly like the upstream pipeline."""

    try:
        text = json.dumps(
            document,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as error:
        raise PublisherInputError(
            "INVALID_WEB_MANIFEST_OUTPUT",
            f"Manifest Web non sérialisable : {error}",
        ) from error
    return (text + "\n").encode("utf-8")


def _reject_constant(value: str) -> None:
    raise ValueError(f"Valeur JSON non finie interdite : {value}.")


def _object_without_duplicate_keys(
    pairs: list[tuple[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Clé JSON dupliquée : {key!r}.")
        result[key] = value
    return result


def _parse_json_object(payload: bytes, path: Path) -> dict[str, Any]:
    try:
        text = payload.decode("utf-8")
        document = json.loads(
            text,
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise PublisherInputError(
            "INVALID_INDEXED_JSON",
            f"JSON indexé invalide : {path}: {error}",
        ) from error
    if not isinstance(document, dict):
        raise PublisherInputError(
            "INVALID_INDEXED_JSON_ROOT",
            f"Racine JSON indexée non objet : {path}.",
        )
    return document


def _read_regular_file(path: Path) -> bytes:
    if path.is_symlink():
        raise PublisherInputError(
            "INDEXED_SYMLINK_FORBIDDEN",
            f"Lien symbolique interdit dans les artefacts indexés : {path}.",
        )
    if not path.is_file():
        raise PublisherInputError(
            "INDEXED_ARTIFACT_NOT_FILE",
            f"Artefact indexé non régulier : {path}.",
        )
    try:
        return path.read_bytes()
    except OSError as error:
        raise PublisherInputError(
            "UNREADABLE_INDEXED_ARTIFACT",
            f"Artefact indexé illisible : {path}: {error}",
        ) from error


def _validate_inventory(
    directory: Path,
    *,
    allow_readme: bool,
) -> None:
    if directory.is_symlink():
        raise PublisherInputError(
            "INDEXED_DIRECTORY_SYMLINK_FORBIDDEN",
            f"Répertoire indexé symbolique interdit : {directory}.",
        )
    if not directory.exists():
        raise PublisherInputError(
            "MISSING_INDEXED_DIRECTORY",
            f"Répertoire des artefacts indexés absent : {directory}.",
        )
    if not directory.is_dir():
        raise PublisherInputError(
            "INVALID_INDEXED_DIRECTORY",
            f"Chemin des artefacts indexés non répertoire : {directory}.",
        )
    try:
        entries = list(directory.iterdir())
    except OSError as error:
        raise PublisherInputError(
            "UNREADABLE_INDEXED_DIRECTORY",
            f"Répertoire des artefacts indexés illisible : "
            f"{directory}: {error}",
        ) from error

    actual_names = {entry.name for entry in entries}
    expected_names = set(EXPECTED_ARTIFACT_PATHS)
    allowed_names = (
        set(ALLOWED_SOURCE_PATHS) if allow_readme else expected_names
    )
    missing = sorted(expected_names - actual_names)
    extra = sorted(actual_names - allowed_names)
    if missing:
        raise PublisherInputError(
            "MISSING_INDEXED_ARTIFACT",
            f"Artefact(s) indexé(s) manquant(s) dans {directory} : "
            f"{', '.join(missing)}.",
        )
    if extra:
        raise PublisherInputError(
            "UNEXPECTED_INDEXED_ARTIFACT",
            f"Artefact(s) indexé(s) supplémentaire(s) dans {directory} : "
            f"{', '.join(extra)}.",
        )
    if allow_readme and "README.md" in actual_names:
        readme = directory / "README.md"
        if readme.is_symlink() or not readme.is_file():
            raise PublisherInputError(
                "INVALID_INDEXED_README",
                f"README indexé non régulier : {readme}.",
            )


def _require_schema(
    *,
    path: Path,
    document: dict[str, Any],
    artifact_type: str,
) -> None:
    if document.get("schemaVersion") not in SUPPORTED_INDEX_SCHEMA_VERSIONS:
        raise PublisherAuditError(
            "UNSUPPORTED_INDEX_SCHEMA",
            f"Schéma indexé non supporté dans {path} : "
            f"{document.get('schemaVersion')!r}.",
        )
    if document.get("artifactType") != artifact_type:
        raise PublisherAuditError(
            "INVALID_INDEX_ARTIFACT_TYPE",
            f"artifactType incohérent dans {path} : "
            f"{document.get('artifactType')!r}, attendu {artifact_type!r}.",
        )
    if (
        document.get("normalizerSchemaVersion")
        not in SUPPORTED_NORMALIZER_SCHEMA_VERSIONS
    ):
        raise PublisherAuditError(
            "UNSUPPORTED_NORMALIZER_SCHEMA",
            f"Schéma normaliseur non supporté dans {path} : "
            f"{document.get('normalizerSchemaVersion')!r}.",
        )
    if (
        document.get("parserSchemaVersion")
        != SUPPORTED_PARSER_SCHEMA_VERSION
    ):
        raise PublisherAuditError(
            "UNSUPPORTED_PARSER_SCHEMA",
            f"Schéma parser non supporté dans {path} : "
            f"{document.get('parserSchemaVersion')!r}.",
        )


def _require_prefixed_checksum(
    value: Any,
    *,
    path: Path,
    field: str,
) -> str:
    if not isinstance(value, str) or SHA256_PATTERN.fullmatch(value) is None:
        raise PublisherAuditError(
            "INVALID_CHECKSUM_FORMAT",
            f"Checksum {field} absent ou invalide dans {path} : {value!r}.",
        )
    return value


def _require_hex_checksum(
    value: Any,
    *,
    path: Path,
    field: str,
) -> str:
    if not isinstance(value, str) or SHA256_HEX_PATTERN.fullmatch(value) is None:
        raise PublisherAuditError(
            "INVALID_CHECKSUM_FORMAT",
            f"Checksum {field} absent ou invalide dans {path} : {value!r}.",
        )
    return value


def _require_size(value: Any, *, path: Path, payload_path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise PublisherAuditError(
            "INVALID_PAYLOAD_SIZE",
            f"Taille invalide pour {payload_path!r} dans {path} : "
            f"{value!r}.",
        )
    return value


def _validate_manifest_audit(
    manifest: dict[str, Any],
    path: Path,
) -> None:
    audit = manifest.get("audit")
    if not isinstance(audit, dict) or audit.get("status") != "passed":
        raise PublisherAuditError(
            "INDEX_AUDIT_NOT_PASSED",
            f"Audit de l’indexeur absent ou non validé dans {path}.",
        )
    general = audit.get("general")
    if not isinstance(general, dict) or general.get("status") != "passed":
        raise PublisherAuditError(
            "INDEX_AUDIT_NOT_PASSED",
            f"Audit général de l’indexeur non validé dans {path}.",
        )
    payload_integrity = audit.get("payloadIntegrity")
    if (
        not isinstance(payload_integrity, dict)
        or payload_integrity.get("status") != "passed"
        or payload_integrity.get("payloadCount") != len(PAYLOAD_PATHS)
    ):
        raise PublisherAuditError(
            "INDEX_PAYLOAD_AUDIT_NOT_PASSED",
            f"Audit des sept payloads non validé dans {path}.",
        )
    snapshot = audit.get("snapshot")
    if (
        not isinstance(snapshot, dict)
        or snapshot.get("status") != "passed"
        or snapshot.get("applied") is not True
    ):
        raise PublisherAuditError(
            "INDEX_SNAPSHOT_AUDIT_NOT_PASSED",
            f"Audit de l’instantané indexé non validé dans {path}.",
        )


def compute_payload_set_checksum(
    payload_entries: list[dict[str, Any]],
) -> str:
    """Recalculate the indexer's payload-set identity independently."""

    return hashlib.sha256(serialize_json(payload_entries)).hexdigest()


def validate_indexed_artifacts(
    directory: Path,
    *,
    allow_readme: bool,
) -> ValidatedIndex:
    """Load and fully validate all eight indexer artifacts."""

    _validate_inventory(directory, allow_readme=allow_readme)
    artifacts: dict[str, Artifact] = {}
    for artifact_path in EXPECTED_ARTIFACT_PATHS:
        path = directory / artifact_path
        payload = _read_regular_file(path)
        document = _parse_json_object(payload, path)
        artifacts[artifact_path] = Artifact(
            path=artifact_path,
            payload=payload,
            document=document,
            size_bytes=len(payload),
            sha256=hashlib.sha256(payload).hexdigest(),
        )

    manifest_artifact = artifacts[INDEX_MANIFEST_PATH]
    manifest = manifest_artifact.document
    manifest_path = directory / INDEX_MANIFEST_PATH
    _require_schema(
        path=manifest_path,
        document=manifest,
        artifact_type="index_manifest",
    )
    _validate_manifest_audit(manifest, manifest_path)

    entries = manifest.get("payloads")
    if not isinstance(entries, list):
        raise PublisherAuditError(
            "INVALID_PAYLOAD_INVENTORY",
            f"Inventaire des payloads absent ou invalide dans {manifest_path}.",
        )
    for entry in entries:
        declared_path = (
            entry.get("path") if isinstance(entry, dict) else None
        )
        if (
            not isinstance(declared_path, str)
            or "/" in declared_path
            or "\\" in declared_path
            or declared_path in {".", ".."}
        ):
            raise PublisherAuditError(
                "UNSAFE_PAYLOAD_PATH",
                f"Chemin de payload non sûr dans {manifest_path} : "
                f"{declared_path!r}.",
            )
    actual_paths = [
        entry.get("path") if isinstance(entry, dict) else None
        for entry in entries
    ]
    expected_paths = list(PAYLOAD_PATHS)
    if actual_paths != expected_paths or len(entries) != len(expected_paths):
        raise PublisherAuditError(
            "INVALID_PAYLOAD_INVENTORY",
            f"Inventaire des sept payloads incohérent dans {manifest_path}.",
        )

    normalized_entries: list[dict[str, Any]] = []
    for entry, payload_path in zip(entries, PAYLOAD_PATHS):
        if not isinstance(entry, dict):
            raise PublisherAuditError(
                "INVALID_PAYLOAD_ENTRY",
                f"Entrée payload invalide dans {manifest_path}.",
            )
        declared_size = _require_size(
            entry.get("sizeBytes"),
            path=manifest_path,
            payload_path=payload_path,
        )
        declared_sha = _require_hex_checksum(
            entry.get("sha256"),
            path=manifest_path,
            field=f"payloads[{payload_path}].sha256",
        )
        artifact = artifacts[payload_path]
        if declared_size != artifact.size_bytes:
            raise PublisherAuditError(
                "PAYLOAD_SIZE_MISMATCH",
                f"Taille déclarée incohérente pour {payload_path} dans "
                f"{manifest_path} : {declared_size}, "
                f"octets réels {artifact.size_bytes}.",
            )
        if declared_sha != artifact.sha256:
            raise PublisherAuditError(
                "PAYLOAD_CHECKSUM_MISMATCH",
                f"SHA-256 déclaré incohérent pour {payload_path} dans "
                f"{manifest_path}.",
            )
        normalized_entries.append(
            {
                "path": payload_path,
                "sizeBytes": declared_size,
                "sha256": declared_sha,
            }
        )

    computed_payload_set_checksum = (
        f"sha256:{compute_payload_set_checksum(normalized_entries)}"
    )
    declared_payload_set_checksum = _require_prefixed_checksum(
        manifest.get("payloadSetChecksum"),
        path=manifest_path,
        field="payloadSetChecksum",
    )
    if declared_payload_set_checksum != computed_payload_set_checksum:
        raise PublisherAuditError(
            "PAYLOAD_SET_CHECKSUM_MISMATCH",
            f"payloadSetChecksum incohérent dans {manifest_path}.",
        )

    capabilities_checksum = _require_prefixed_checksum(
        manifest.get("capabilitiesChecksum"),
        path=manifest_path,
        field="capabilitiesChecksum",
    )
    snapshot = manifest["audit"]["snapshot"]
    if snapshot.get("requiredChecksum") != capabilities_checksum:
        raise PublisherAuditError(
            "CAPABILITIES_CHECKSUM_MISMATCH",
            f"capabilitiesChecksum incohérent avec l’audit dans "
            f"{manifest_path}.",
        )

    for payload_path in PAYLOAD_PATHS:
        artifact = artifacts[payload_path]
        path = directory / payload_path
        _require_schema(
            path=path,
            document=artifact.document,
            artifact_type=EXPECTED_ARTIFACT_TYPES[payload_path],
        )
        payload_capabilities_checksum = _require_prefixed_checksum(
            artifact.document.get("capabilitiesChecksum"),
            path=path,
            field="capabilitiesChecksum",
        )
        if payload_capabilities_checksum != capabilities_checksum:
            raise PublisherAuditError(
                "CAPABILITIES_CHECKSUM_MISMATCH",
                f"capabilitiesChecksum incohérent entre {manifest_path} "
                f"et {path}.",
            )

    return ValidatedIndex(
        directory=directory,
        artifacts=artifacts,
        manifest=manifest,
        capabilities_checksum=capabilities_checksum,
        payload_set_checksum=declared_payload_set_checksum,
    )


def build_stable_manifest_document(
    index: ValidatedIndex,
) -> dict[str, Any]:
    """Build the minimal stable pointer for one immutable generation."""

    segment = f"sha256-{index.payload_set_hex}"
    index_manifest = index.artifacts[INDEX_MANIFEST_PATH]
    return {
        "artifactType": "msf_capabilities_web_publication",
        "schemaVersion": PUBLISHER_SCHEMA_VERSION,
        "currentPayloadSetChecksum": index.payload_set_checksum,
        "currentPath": f"indexed/{segment}/",
        "capabilitiesChecksum": index.capabilities_checksum,
        "indexManifest": {
            "path": INDEX_MANIFEST_PATH,
            "sizeBytes": index_manifest.size_bytes,
            "sha256": index_manifest.sha256,
        },
    }


def build_stable_manifest_bytes(index: ValidatedIndex) -> bytes:
    return serialize_json(build_stable_manifest_document(index))


def validate_stable_manifest(payload: bytes, path: Path) -> StableManifest:
    """Validate an existing stable public pointer without following paths."""

    document = _parse_json_object(payload, path)
    expected_keys = {
        "artifactType",
        "schemaVersion",
        "currentPayloadSetChecksum",
        "currentPath",
        "capabilitiesChecksum",
        "indexManifest",
    }
    if set(document) != expected_keys:
        raise PublisherAuditError(
            "INVALID_WEB_MANIFEST_SCHEMA",
            f"Clés du manifest Web incohérentes dans {path}.",
        )
    if (
        document.get("artifactType")
        != "msf_capabilities_web_publication"
        or document.get("schemaVersion") != PUBLISHER_SCHEMA_VERSION
    ):
        raise PublisherAuditError(
            "UNSUPPORTED_WEB_MANIFEST_SCHEMA",
            f"Schéma du manifest Web non supporté dans {path}.",
        )

    current_payload_set_checksum = _require_prefixed_checksum(
        document.get("currentPayloadSetChecksum"),
        path=path,
        field="currentPayloadSetChecksum",
    )
    capabilities_checksum = _require_prefixed_checksum(
        document.get("capabilitiesChecksum"),
        path=path,
        field="capabilitiesChecksum",
    )
    current_path = document.get("currentPath")
    if not isinstance(current_path, str):
        raise PublisherAuditError(
            "UNSAFE_CURRENT_PATH",
            f"currentPath absent ou invalide dans {path}.",
        )
    path_match = CURRENT_PATH_PATTERN.fullmatch(current_path)
    if path_match is None:
        raise PublisherAuditError(
            "UNSAFE_CURRENT_PATH",
            f"currentPath non sûr dans {path} : {current_path!r}.",
        )
    payload_set_hex = current_payload_set_checksum.removeprefix("sha256:")
    if path_match.group(1) != payload_set_hex:
        raise PublisherAuditError(
            "WEB_MANIFEST_CHECKSUM_MISMATCH",
            f"currentPath ne correspond pas au payloadSetChecksum dans {path}.",
        )

    index_manifest = document.get("indexManifest")
    if not isinstance(index_manifest, dict) or set(index_manifest) != {
        "path",
        "sizeBytes",
        "sha256",
    }:
        raise PublisherAuditError(
            "INVALID_WEB_MANIFEST_SCHEMA",
            f"Description de index-manifest.json invalide dans {path}.",
        )
    index_manifest_path = index_manifest.get("path")
    if index_manifest_path != INDEX_MANIFEST_PATH:
        raise PublisherAuditError(
            "UNSAFE_INDEX_MANIFEST_PATH",
            f"Chemin de index-manifest.json non sûr dans {path} : "
            f"{index_manifest_path!r}.",
        )
    index_manifest_size = _require_size(
        index_manifest.get("sizeBytes"),
        path=path,
        payload_path=INDEX_MANIFEST_PATH,
    )
    index_manifest_sha = _require_hex_checksum(
        index_manifest.get("sha256"),
        path=path,
        field="indexManifest.sha256",
    )
    return StableManifest(
        payload=payload,
        document=document,
        current_payload_set_checksum=current_payload_set_checksum,
        current_path=current_path,
        payload_set_hex=payload_set_hex,
        capabilities_checksum=capabilities_checksum,
        index_manifest_path=index_manifest_path,
        index_manifest_size_bytes=index_manifest_size,
        index_manifest_sha256=index_manifest_sha,
    )
