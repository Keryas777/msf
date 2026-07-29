"""Command-line interface for the MSF capabilities indexer."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any

from .diagnostics import IndexerAuditError, IndexerInputError
from .indexer import (
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_DIRECTORY,
    EXPECTED_ARTIFACT_PATHS,
    MANIFEST_PATH,
    PAYLOAD_PATHS,
    build_artifact_bytes,
    compute_payload_set_checksum,
    load_capabilities,
)


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Index normalized MSF capabilities into deterministic, "
            "canonical-ID JSON payloads."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT_PATH,
        help="Path to normalized capabilities.json.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIRECTORY,
        help="Directory receiving the generated index JSON files.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Rebuild in memory and verify the exact existing output.",
    )
    return parser.parse_args(argv)


def _write_artifacts_atomically(
    output_directory: Path,
    artifacts: dict[str, bytes],
) -> None:
    output_directory.mkdir(parents=True, exist_ok=True)
    temporary_paths: dict[str, Path] = {}
    try:
        for path in EXPECTED_ARTIFACT_PATHS:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                prefix=f".{path}.",
                suffix=".tmp",
                dir=output_directory,
                delete=False,
            ) as temporary:
                temporary.write(artifacts[path])
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_paths[path] = Path(temporary.name)
        for path in PAYLOAD_PATHS:
            os.replace(temporary_paths.pop(path), output_directory / path)
        os.replace(
            temporary_paths.pop(MANIFEST_PATH),
            output_directory / MANIFEST_PATH,
        )
    finally:
        for path in temporary_paths.values():
            path.unlink(missing_ok=True)


def _parse_manifest(payload: bytes, path: Path) -> dict[str, Any]:
    def reject_constant(value: str) -> None:
        raise ValueError(f"valeur non finie {value}")

    try:
        document = json.loads(
            payload.decode("utf-8"),
            parse_constant=reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"manifest invalide {path}: {error}") from error
    if not isinstance(document, dict):
        raise ValueError(f"manifest invalide {path}: racine non objet")
    return document


def _verify_manifest_integrity(
    output_directory: Path,
    actual_artifacts: dict[str, bytes],
) -> list[str]:
    errors: list[str] = []
    manifest_path = output_directory / MANIFEST_PATH
    try:
        manifest = _parse_manifest(
            actual_artifacts[MANIFEST_PATH], manifest_path
        )
    except ValueError as error:
        return [str(error)]
    entries = manifest.get("payloads")
    if not isinstance(entries, list):
        return [f"{manifest_path}: payloads absent ou invalide"]
    expected_paths = list(sorted(PAYLOAD_PATHS))
    actual_paths = [
        item.get("path") for item in entries if isinstance(item, dict)
    ]
    if actual_paths != expected_paths or len(entries) != len(expected_paths):
        errors.append(
            f"{manifest_path}: liste des sept payloads incohérente"
        )
        return errors
    normalized_entries: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append(f"{manifest_path}: entrée payload invalide")
            continue
        path = entry.get("path")
        if path not in actual_artifacts:
            errors.append(f"{manifest_path}: payload inconnu {path!r}")
            continue
        payload = actual_artifacts[path]
        expected_size = len(payload)
        expected_sha = hashlib.sha256(payload).hexdigest()
        if entry.get("sizeBytes") != expected_size:
            errors.append(
                f"{manifest_path}: taille incohérente pour {path}"
            )
        if entry.get("sha256") != expected_sha:
            errors.append(
                f"{manifest_path}: SHA-256 incohérent pour {path}"
            )
        normalized_entries.append(
            {
                "path": path,
                "sizeBytes": entry.get("sizeBytes"),
                "sha256": entry.get("sha256"),
            }
        )
    if len(normalized_entries) == len(PAYLOAD_PATHS):
        expected_set_checksum = (
            f"sha256:{compute_payload_set_checksum(normalized_entries)}"
        )
        if manifest.get("payloadSetChecksum") != expected_set_checksum:
            errors.append(
                f"{manifest_path}: payloadSetChecksum incohérent"
            )
    if not isinstance(manifest.get("counts"), dict):
        errors.append(f"{manifest_path}: compteurs absents")
    audit = manifest.get("audit")
    if not isinstance(audit, dict) or audit.get("status") != "passed":
        errors.append(f"{manifest_path}: audit absent ou non validé")
    return errors


def _check_artifacts(
    output_directory: Path,
    expected_artifacts: dict[str, bytes],
) -> list[str]:
    if not output_directory.exists():
        return [f"sortie absente : {output_directory}"]
    if not output_directory.is_dir():
        return [f"sortie non répertoire : {output_directory}"]
    try:
        entries = list(output_directory.iterdir())
    except OSError as error:
        return [f"sortie illisible : {output_directory}: {error}"]
    actual_names = {entry.name for entry in entries}
    expected_names = set(EXPECTED_ARTIFACT_PATHS)
    missing = sorted(expected_names - actual_names)
    extra = sorted(actual_names - expected_names - {"README.md"})
    errors: list[str] = []
    if missing:
        errors.append(f"fichiers manquants : {', '.join(missing)}")
    if extra:
        errors.append(f"fichiers supplémentaires : {', '.join(extra)}")
    if missing:
        return errors

    actual_artifacts: dict[str, bytes] = {}
    for path in EXPECTED_ARTIFACT_PATHS:
        target = output_directory / path
        try:
            payload = target.read_bytes()
        except OSError as error:
            errors.append(f"fichier illisible : {target}: {error}")
            continue
        actual_artifacts[path] = payload
        expected = expected_artifacts[path]
        if len(payload) != len(expected):
            errors.append(
                f"taille obsolète : {target} "
                f"({len(payload)} au lieu de {len(expected)})"
            )
        if hashlib.sha256(payload).digest() != hashlib.sha256(
            expected
        ).digest():
            errors.append(f"checksum ou contenu obsolète : {target}")
        elif payload != expected:
            errors.append(f"contenu obsolète : {target}")
    if set(actual_artifacts) == set(EXPECTED_ARTIFACT_PATHS):
        errors.extend(
            _verify_manifest_integrity(output_directory, actual_artifacts)
        )
    return errors


def _print_summary(
    *,
    output_directory: Path,
    artifacts: dict[str, bytes],
    counts: dict[str, Any],
    checked: bool,
) -> None:
    mode = "validé" if checked else "généré"
    print(f"Index MSF {mode} : {output_directory}")
    print(
        "Couverture : "
        f"{counts['characterCount']} Character, "
        f"{counts['abilityCount']} Ability, "
        f"{counts['contextCount']} Context, "
        f"{counts['actionMappingCount']} ActionMapping, "
        f"{counts['operationCount']} Operation, "
        f"{counts['effectCatalogCount']} effets."
    )
    print(
        "Contrats : "
        f"preserved_uninterpreted="
        f"{counts['preservedUninterpretedActionCount']}, "
        f"spawn={counts['spawnOperationCount']}, "
        f"spawn_pool={counts['spawnPoolEffectOperationCount']}, "
        f"empty_result={counts['emptyResultOperationCount']}, "
        f"empower={counts['empowerOperationCount']}."
    )
    print(
        "Artefacts : "
        + ", ".join(
            f"{path}={len(artifacts[path])} octets"
            for path in EXPECTED_ARTIFACT_PATHS
        )
    )


def main(argv: list[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    try:
        loaded = load_capabilities(arguments.input)
        build, artifacts = build_artifact_bytes(
            loaded.document,
            capabilities_checksum=loaded.checksum,
        )
        if arguments.check:
            errors = _check_artifacts(arguments.output, artifacts)
            if errors:
                for error in errors:
                    print(f"ERROR [INDEX_CHECK_FAILED]: {error}", file=os.sys.stderr)
                return 1
            _print_summary(
                output_directory=arguments.output,
                artifacts=artifacts,
                counts=build.counts,
                checked=True,
            )
            return 0
        _write_artifacts_atomically(arguments.output, artifacts)
        _print_summary(
            output_directory=arguments.output,
            artifacts=artifacts,
            counts=build.counts,
            checked=False,
        )
        return 0
    except IndexerAuditError as error:
        print(f"ERROR [{error.code}]: {error}", file=os.sys.stderr)
        return 3
    except IndexerInputError as error:
        print(f"ERROR [{error.code}]: {error}", file=os.sys.stderr)
        return 2
    except OSError as error:
        print(f"ERROR [INDEXER_IO_ERROR]: {error}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
