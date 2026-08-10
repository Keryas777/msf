"""Publish validated MSF capability indexes below the GitHub Pages root."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re
import shutil
import tempfile
from typing import Iterable

from .audit import (
    EXPECTED_ARTIFACT_PATHS,
    INDEX_MANIFEST_PATH,
    StableManifest,
    ValidatedIndex,
    build_stable_manifest_bytes,
    validate_indexed_artifacts,
    validate_stable_manifest,
)
from .diagnostics import (
    PublisherAuditError,
    PublisherInputError,
    PublisherStateError,
)


DEFAULT_SOURCE_DIRECTORY = Path("data/msf-capabilities/indexed")
DEFAULT_PUBLIC_ROOT = Path("docs/data/msf-capabilities")
PUBLIC_MANIFEST_PATH = "manifest.json"
PUBLIC_INDEXED_DIRECTORY = "indexed"
PUBLIC_README_PATH = "README.md"
IMMUTABLE_DIRECTORY_PATTERN = re.compile(r"^sha256-([0-9a-f]{64})$")
ALLOWED_PUBLIC_ROOT_PATHS = frozenset(
    {
        PUBLIC_README_PATH,
        PUBLIC_MANIFEST_PATH,
        PUBLIC_INDEXED_DIRECTORY,
    }
)


@dataclass(frozen=True)
class PublicState:
    """A safe snapshot of the publication tree before a mutation."""

    exists: bool
    indexed_root: Path
    generations: dict[str, ValidatedIndex]
    stable_manifest: StableManifest | None


@dataclass(frozen=True)
class PublicationResult:
    """Summary returned by a successful publish operation."""

    public_root: Path
    current_path: str
    payload_set_checksum: str
    capabilities_checksum: str
    reused_generation: bool
    removed_generation_count: int


def _fsync_directory(path: Path) -> None:
    """Best-effort directory durability on platforms supporting directory FDs."""

    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    try:
        descriptor = os.open(path, flags)
    except (OSError, TypeError):
        return
    try:
        os.fsync(descriptor)
    except OSError:
        pass
    finally:
        os.close(descriptor)


def _read_regular_public_file(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise PublisherStateError(
            "UNSAFE_PUBLIC_FILE",
            f"Fichier public non régulier ou symbolique : {path}.",
        )
    try:
        return path.read_bytes()
    except OSError as error:
        raise PublisherStateError(
            "UNREADABLE_PUBLIC_FILE",
            f"Fichier public illisible : {path}: {error}",
        ) from error


def _validate_generation_name(path: Path) -> str:
    if path.is_symlink() or not path.is_dir():
        raise PublisherStateError(
            "UNSAFE_PUBLIC_GENERATION",
            f"Génération publique non régulière : {path}.",
        )
    match = IMMUTABLE_DIRECTORY_PATTERN.fullmatch(path.name)
    if match is None:
        raise PublisherStateError(
            "UNKNOWN_PUBLIC_GENERATION",
            f"Répertoire inconnu sous la racine indexée publique : {path}.",
        )
    return match.group(1)


def _validate_public_generation(path: Path) -> ValidatedIndex:
    expected_hex = _validate_generation_name(path)
    try:
        generation = validate_indexed_artifacts(path, allow_readme=False)
    except (PublisherInputError, PublisherAuditError) as error:
        raise PublisherStateError(
            "INVALID_PUBLIC_GENERATION",
            f"Génération publique invalide : {path}: {error}",
        ) from error
    if generation.payload_set_hex != expected_hex:
        raise PublisherStateError(
            "PUBLIC_GENERATION_NAME_MISMATCH",
            f"Le nom de la génération {path} ne correspond pas à son "
            "payloadSetChecksum.",
        )
    return generation


def _validate_stable_reference(
    *,
    public_root: Path,
    manifest: StableManifest,
    generations: dict[str, ValidatedIndex],
) -> None:
    segment = f"sha256-{manifest.payload_set_hex}"
    generation = generations.get(segment)
    if generation is None:
        raise PublisherStateError(
            "MISSING_CURRENT_PUBLIC_GENERATION",
            f"Le manifest public {public_root / PUBLIC_MANIFEST_PATH} "
            f"référence une génération absente : {segment}.",
        )
    if generation.payload_set_checksum != manifest.current_payload_set_checksum:
        raise PublisherStateError(
            "PUBLIC_MANIFEST_CHECKSUM_MISMATCH",
            "Le payloadSetChecksum du manifest public ne correspond pas à "
            f"la génération {segment}.",
        )
    if generation.capabilities_checksum != manifest.capabilities_checksum:
        raise PublisherStateError(
            "PUBLIC_MANIFEST_CHECKSUM_MISMATCH",
            "Le capabilitiesChecksum du manifest public ne correspond pas à "
            f"la génération {segment}.",
        )
    index_manifest = generation.artifacts[INDEX_MANIFEST_PATH]
    if (
        index_manifest.size_bytes != manifest.index_manifest_size_bytes
        or index_manifest.sha256 != manifest.index_manifest_sha256
    ):
        raise PublisherStateError(
            "PUBLIC_MANIFEST_INDEX_MISMATCH",
            "La description publique de index-manifest.json ne correspond "
            f"pas à la génération {segment}.",
        )


def inspect_public_state(public_root: Path) -> PublicState:
    """Validate every existing public entry before any publisher write."""

    indexed_root = public_root / PUBLIC_INDEXED_DIRECTORY
    if not public_root.exists():
        return PublicState(
            exists=False,
            indexed_root=indexed_root,
            generations={},
            stable_manifest=None,
        )
    if public_root.is_symlink() or not public_root.is_dir():
        raise PublisherStateError(
            "UNSAFE_PUBLIC_ROOT",
            f"Racine publique non régulière ou symbolique : {public_root}.",
        )
    try:
        root_entries = list(public_root.iterdir())
    except OSError as error:
        raise PublisherStateError(
            "UNREADABLE_PUBLIC_ROOT",
            f"Racine publique illisible : {public_root}: {error}",
        ) from error
    root_names = {entry.name for entry in root_entries}
    unexpected_root_names = sorted(root_names - ALLOWED_PUBLIC_ROOT_PATHS)
    if unexpected_root_names:
        raise PublisherStateError(
            "UNKNOWN_PUBLIC_ENTRY",
            f"Entrée(s) inconnue(s) sous {public_root} : "
            f"{', '.join(unexpected_root_names)}.",
        )

    readme_path = public_root / PUBLIC_README_PATH
    if readme_path.exists() and (
        readme_path.is_symlink() or not readme_path.is_file()
    ):
        raise PublisherStateError(
            "UNSAFE_PUBLIC_README",
            f"README public non régulier : {readme_path}.",
        )

    generations: dict[str, ValidatedIndex] = {}
    if indexed_root.exists():
        if indexed_root.is_symlink() or not indexed_root.is_dir():
            raise PublisherStateError(
                "UNSAFE_PUBLIC_INDEX_ROOT",
                f"Racine des générations non régulière : {indexed_root}.",
            )
        try:
            generation_paths = sorted(
                indexed_root.iterdir(),
                key=lambda item: item.name,
            )
        except OSError as error:
            raise PublisherStateError(
                "UNREADABLE_PUBLIC_INDEX_ROOT",
                f"Racine des générations illisible : {indexed_root}: {error}",
            ) from error
        for generation_path in generation_paths:
            _validate_generation_name(generation_path)
            generations[generation_path.name] = _validate_public_generation(
                generation_path
            )

    manifest_path = public_root / PUBLIC_MANIFEST_PATH
    stable_manifest: StableManifest | None = None
    if manifest_path.exists():
        payload = _read_regular_public_file(manifest_path)
        try:
            stable_manifest = validate_stable_manifest(payload, manifest_path)
        except (PublisherInputError, PublisherAuditError) as error:
            raise PublisherStateError(
                "INVALID_PUBLIC_MANIFEST",
                f"Manifest public invalide : {manifest_path}: {error}",
            ) from error
        _validate_stable_reference(
            public_root=public_root,
            manifest=stable_manifest,
            generations=generations,
        )
    return PublicState(
        exists=True,
        indexed_root=indexed_root,
        generations=generations,
        stable_manifest=stable_manifest,
    )


def _artifact_bytes_equal(
    first: ValidatedIndex,
    second: ValidatedIndex,
) -> bool:
    return all(
        first.artifacts[path].payload == second.artifacts[path].payload
        for path in EXPECTED_ARTIFACT_PATHS
    )


def _copy_artifacts(
    source: ValidatedIndex,
    destination: Path,
) -> None:
    if not destination.exists():
        destination.mkdir()
    for artifact_path in EXPECTED_ARTIFACT_PATHS:
        target = destination / artifact_path
        payload = source.artifacts[artifact_path].payload
        with target.open("xb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
    _fsync_directory(destination)


def _remove_generation(path: Path, indexed_root: Path) -> None:
    if path.parent != indexed_root:
        raise PublisherStateError(
            "UNSAFE_RETENTION_PATH",
            f"Suppression refusée hors de la racine publique : {path}.",
        )
    _validate_generation_name(path)
    shutil.rmtree(path)


def _install_generation(
    *,
    source: ValidatedIndex,
    indexed_root: Path,
    preflight: PublicState,
) -> tuple[Path, bool, bool]:
    segment = f"sha256-{source.payload_set_hex}"
    target = indexed_root / segment
    temporary_path = Path(
        tempfile.mkdtemp(
            prefix=f".{segment}.",
            suffix=".tmp",
            dir=indexed_root,
        )
    )
    installed_new = False
    try:
        _copy_artifacts(source, temporary_path)
        verified_copy = validate_indexed_artifacts(
            temporary_path,
            allow_readme=False,
        )
        if not _artifact_bytes_equal(source, verified_copy):
            raise PublisherStateError(
                "COPIED_GENERATION_MISMATCH",
                f"La copie temporaire diffère des sources : {temporary_path}.",
            )

        existing = preflight.generations.get(segment)
        if existing is not None:
            if not _artifact_bytes_equal(source, existing):
                raise PublisherStateError(
                    "IMMUTABLE_GENERATION_CONFLICT",
                    f"La génération immuable existante diffère : {target}.",
                )
            shutil.rmtree(temporary_path)
            return target, True, False

        if target.exists():
            existing = _validate_public_generation(target)
            if not _artifact_bytes_equal(source, existing):
                raise PublisherStateError(
                    "IMMUTABLE_GENERATION_CONFLICT",
                    f"La génération immuable existante diffère : {target}.",
                )
            shutil.rmtree(temporary_path)
            return target, True, False

        os.replace(temporary_path, target)
        installed_new = True
        _fsync_directory(indexed_root)
        return target, False, installed_new
    finally:
        if temporary_path.exists():
            shutil.rmtree(temporary_path)


def _replace_manifest_atomically(public_root: Path, payload: bytes) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{PUBLIC_MANIFEST_PATH}.",
            suffix=".tmp",
            dir=public_root,
            delete=False,
        ) as temporary:
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        os.replace(temporary_path, public_root / PUBLIC_MANIFEST_PATH)
        temporary_path = None
        _fsync_directory(public_root)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _prepare_public_directories(public_root: Path) -> Path:
    try:
        public_root.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise PublisherStateError(
            "CANNOT_CREATE_PUBLIC_ROOT",
            f"Impossible de créer la racine publique {public_root}: {error}",
        ) from error
    if public_root.is_symlink() or not public_root.is_dir():
        raise PublisherStateError(
            "UNSAFE_PUBLIC_ROOT",
            f"Racine publique non régulière ou symbolique : {public_root}.",
        )
    indexed_root = public_root / PUBLIC_INDEXED_DIRECTORY
    try:
        indexed_root.mkdir(exist_ok=True)
    except OSError as error:
        raise PublisherStateError(
            "CANNOT_CREATE_PUBLIC_INDEX_ROOT",
            f"Impossible de créer {indexed_root}: {error}",
        ) from error
    if indexed_root.is_symlink() or not indexed_root.is_dir():
        raise PublisherStateError(
            "UNSAFE_PUBLIC_INDEX_ROOT",
            f"Racine des générations non régulière : {indexed_root}.",
        )
    return indexed_root


def publish(
    source_directory: Path = DEFAULT_SOURCE_DIRECTORY,
    public_root: Path = DEFAULT_PUBLIC_ROOT,
) -> PublicationResult:
    """Validate, stage and atomically publish the current index generation."""

    source = validate_indexed_artifacts(
        source_directory,
        allow_readme=True,
    )
    stable_manifest_payload = build_stable_manifest_bytes(source)
    preflight = inspect_public_state(public_root)
    indexed_root = _prepare_public_directories(public_root)

    target: Path | None = None
    installed_new = False
    reused_generation = False
    try:
        target, reused_generation, installed_new = _install_generation(
            source=source,
            indexed_root=indexed_root,
            preflight=preflight,
        )
        _replace_manifest_atomically(public_root, stable_manifest_payload)
    except Exception:
        if installed_new and target is not None and target.exists():
            _remove_generation(target, indexed_root)
            _fsync_directory(indexed_root)
        raise

    current_segment = f"sha256-{source.payload_set_hex}"
    removed_generation_count = 0

    return PublicationResult(
        public_root=public_root,
        current_path=f"indexed/{current_segment}/",
        payload_set_checksum=source.payload_set_checksum,
        capabilities_checksum=source.capabilities_checksum,
        reused_generation=reused_generation,
        removed_generation_count=removed_generation_count,
    )


def _generation_content_errors(
    expected: ValidatedIndex,
    actual: ValidatedIndex,
) -> list[str]:
    errors: list[str] = []
    for artifact_path in EXPECTED_ARTIFACT_PATHS:
        expected_payload = expected.artifacts[artifact_path].payload
        actual_payload = actual.artifacts[artifact_path].payload
        if actual_payload != expected_payload:
            errors.append(
                f"artefact public obsolète : {artifact_path}"
            )
    return errors


def check_publication(
    source_directory: Path = DEFAULT_SOURCE_DIRECTORY,
    public_root: Path = DEFAULT_PUBLIC_ROOT,
) -> list[str]:
    """Return deterministic drift errors without writing a single byte."""

    source = validate_indexed_artifacts(
        source_directory,
        allow_readme=True,
    )
    if not public_root.exists():
        return [f"publication absente : {public_root}"]
    state = inspect_public_state(public_root)
    if state.stable_manifest is None:
        return [f"manifest public absent : {public_root / PUBLIC_MANIFEST_PATH}"]

    errors: list[str] = []
    expected_manifest = build_stable_manifest_bytes(source)
    if state.stable_manifest.payload != expected_manifest:
        errors.append(
            f"manifest public obsolète : {public_root / PUBLIC_MANIFEST_PATH}"
        )

    expected_segment = f"sha256-{source.payload_set_hex}"
    actual_segments = set(state.generations)
    if expected_segment not in actual_segments:
        errors.append(f"génération publique absente : {expected_segment}")
    else:
        errors.extend(
            _generation_content_errors(
                source,
                state.generations[expected_segment],
            )
        )
    return errors


def public_artifact_paths(result: PublicationResult) -> Iterable[Path]:
    """Yield the eight public paths in the indexer's canonical order."""

    generation_root = result.public_root / result.current_path
    for artifact_path in EXPECTED_ARTIFACT_PATHS:
        yield generation_root / artifact_path
