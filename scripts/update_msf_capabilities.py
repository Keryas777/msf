#!/usr/bin/env python3
"""Download and validate the official MSF combat-data sources.

The SQLite catalog is treated as untrusted input. Its filename is deliberately
ignored: only its contents, schema, active rows and integrity are validated.
"""

from __future__ import annotations

import argparse
import base64
import binascii
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
from typing import Any, Callable
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


CDN_BASE_URL = "https://cdn.m3.scopelypv.com/bulky_rules"
DATABASE_MAX_BYTES = 5 * 1024 * 1024
RESOURCE_MAX_BYTES = 25 * 1024 * 1024
VERSION_PATTERN = re.compile(r"^(?:\d+_)+\d+$")
BUILD_PATTERN = re.compile(r"^\d+$")
MD5_PATTERN = re.compile(r"^[a-f0-9]{32}$")

RESOURCE_NAMES = (
    "ai_filter",
    "ai_selector",
    "battlefield_effects",
    "characters",
    "combat_mods",
    "constants",
    "iso8skills",
    "missiontraits",
    "overpower_bonuses",
    "places",
    "procs",
)

EXPECTED_RESOURCES = {
    f"combat_data/{name}.json": f"{name}.json" for name in RESOURCE_NAMES
}


class PipelineError(RuntimeError):
    """A validation error that should stop the update without touching outputs."""


class ResourceUnavailable(PipelineError):
    """A valid CDN URL that does not exist for the attempted game version."""


@dataclass(frozen=True)
class CatalogEntry:
    resource_id: str
    filename: str
    md5: str


@dataclass(frozen=True)
class DownloadedResource:
    entry: CatalogEntry
    url: str | None
    source_game_version: str | None
    payload: bytes
    sha256: str


@dataclass(frozen=True)
class PipelineResult:
    changed: bool
    resource_count: int
    characters_hash: str
    manifest_path: Path


def validate_game_version(value: str) -> str:
    version = value.strip()
    if not VERSION_PATTERN.fullmatch(version):
        raise PipelineError(
            f"Invalid game version {value!r}; expected a value such as 10_3_0."
        )
    return version


def validate_game_build(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None

    build = value.strip()
    if not BUILD_PATTERN.fullmatch(build):
        raise PipelineError(
            f"Invalid game build {value!r}; only decimal digits are accepted."
        )
    return build


def read_catalog(database_path: Path) -> list[CatalogEntry]:
    if not database_path.is_file():
        raise PipelineError(f"SQLite catalog not found: {database_path}")

    database_size = database_path.stat().st_size
    if database_size <= 16 or database_size > DATABASE_MAX_BYTES:
        raise PipelineError(
            f"Unexpected SQLite catalog size: {database_size} bytes "
            f"(maximum {DATABASE_MAX_BYTES})."
        )

    with database_path.open("rb") as database_file:
        if database_file.read(16) != b"SQLite format 3\x00":
            raise PipelineError("Invalid SQLite header.")

    database_uri = f"{database_path.resolve().as_uri()}?mode=ro"

    try:
        with sqlite3.connect(database_uri, uri=True) as database:
            database.row_factory = sqlite3.Row
            database.execute("PRAGMA query_only = ON")

            integrity_rows = database.execute("PRAGMA integrity_check").fetchall()
            integrity = [row[0] for row in integrity_rows]
            if integrity != ["ok"]:
                raise PipelineError(
                    "SQLite integrity check failed: " + "; ".join(map(str, integrity))
                )

            table = database.execute(
                "SELECT 1 FROM sqlite_master "
                "WHERE type = 'table' AND name = 'RemoteAssetClientEntry'"
            ).fetchone()
            if table is None:
                raise PipelineError("RemoteAssetClientEntry table not found.")

            columns = {
                row[1]
                for row in database.execute(
                    "PRAGMA table_info(RemoteAssetClientEntry)"
                ).fetchall()
            }
            required_columns = {"id", "hash", "status"}
            missing_columns = sorted(required_columns - columns)
            if missing_columns:
                raise PipelineError(
                    "RemoteAssetClientEntry is missing columns: "
                    + ", ".join(missing_columns)
                )

            rows = database.execute(
                "SELECT id, hash, status "
                "FROM RemoteAssetClientEntry ORDER BY id"
            ).fetchall()
    except sqlite3.Error as error:
        raise PipelineError(f"Unable to read SQLite catalog: {error}") from error

    found_ids = {str(row["id"]) for row in rows}
    expected_ids = set(EXPECTED_RESOURCES)

    missing_ids = sorted(expected_ids - found_ids)
    unexpected_ids = sorted(found_ids - expected_ids)
    if missing_ids or unexpected_ids:
        details = []
        if missing_ids:
            details.append("missing: " + ", ".join(missing_ids))
        if unexpected_ids:
            details.append("unexpected: " + ", ".join(unexpected_ids))
        raise PipelineError(
            "The active catalog does not match the 11-resource allowlist ("
            + "; ".join(details)
            + ")."
        )

    entries: list[CatalogEntry] = []
    for row in rows:
        resource_id = str(row["id"])
        status = str(row["status"] or "")
        resource_hash = str(row["hash"] or "")

        if status != "local":
            raise PipelineError(
                f"Unexpected status for {resource_id}: {status!r}; expected 'local'."
            )
        if not MD5_PATTERN.fullmatch(resource_hash):
            raise PipelineError(
                f"Invalid MD5 for {resource_id}: {resource_hash!r}."
            )

        entries.append(
            CatalogEntry(
                resource_id=resource_id,
                filename=EXPECTED_RESOURCES[resource_id],
                md5=resource_hash,
            )
        )

    if len(entries) != len(EXPECTED_RESOURCES):
        raise PipelineError(
            f"Expected {len(EXPECTED_RESOURCES)} active resources, got {len(entries)}."
        )

    return entries


def validate_cdn_base_url(value: str) -> str:
    base_url = value.rstrip("/")
    parsed = urlsplit(base_url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise PipelineError(f"Invalid CDN base URL: {value!r}.")
    return base_url


def build_resource_url(
    cdn_base_url: str, game_version: str, entry: CatalogEntry
) -> str:
    stem = Path(entry.filename).stem
    return (
        f"{cdn_base_url}/combat_data/{game_version}/"
        f"{stem}.{entry.md5}.json"
    )


def candidate_source_versions(game_version: str) -> list[str]:
    """Return bounded CDN-version candidates, newest first.

    Unchanged bulky-rules files are not necessarily copied into the current
    version directory. The active hash remains authoritative, so older version
    folders may safely be tried as long as the downloaded MD5 still matches.
    """

    candidates = [game_version]
    parts = game_version.split("_")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        return candidates

    current_major, current_minor, current_patch = map(int, parts)

    for patch in range(current_patch - 1, -1, -1):
        candidates.append(f"{current_major}_{current_minor}_{patch}")

    common_patch_order = (1, 0, 2, 3, 4, 5)
    for major in range(current_major, max(-1, current_major - 2), -1):
        highest_minor = current_minor - 1 if major == current_major else 9
        for minor in range(highest_minor, -1, -1):
            for patch in common_patch_order:
                candidates.append(f"{major}_{minor}_{patch}")

    return list(dict.fromkeys(candidates))


def ensure_same_cdn_scope(requested_url: str, final_url: str, base_url: str) -> None:
    requested = urlsplit(requested_url)
    final = urlsplit(final_url)
    base = urlsplit(base_url)

    expected_origin = (base.scheme, base.hostname, base.port)
    if (requested.scheme, requested.hostname, requested.port) != expected_origin:
        raise PipelineError(f"Download URL left the configured CDN origin: {requested_url}")
    if (final.scheme, final.hostname, final.port) != expected_origin:
        raise PipelineError(f"CDN redirect left the configured origin: {final_url}")

    base_path = base.path.rstrip("/") + "/"
    if not requested.path.startswith(base_path) or not final.path.startswith(base_path):
        raise PipelineError("Download URL left the configured CDN path.")


def validate_json_payload(filename: str, payload: bytes) -> None:
    try:
        parsed: Any = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PipelineError(f"Invalid JSON for {filename}: {error}") from error

    if not isinstance(parsed, dict):
        raise PipelineError(f"Unexpected top-level JSON type for {filename}.")

    required_keys = {"Data", "ForceImportVersion", "Name"}
    missing_keys = sorted(required_keys - set(parsed))
    if missing_keys:
        raise PipelineError(
            f"{filename} is missing required keys: {', '.join(missing_keys)}."
        )

    expected_name = Path(filename).stem
    if parsed["Name"] != expected_name:
        raise PipelineError(
            f"Unexpected Name in {filename}: {parsed['Name']!r}; "
            f"expected {expected_name!r}."
        )

    expected_data_type = list if filename == "places.json" else dict
    if not isinstance(parsed["Data"], expected_data_type):
        raise PipelineError(
            f"Unexpected Data type in {filename}; "
            f"expected {expected_data_type.__name__}."
        )
    if not isinstance(parsed["ForceImportVersion"], int):
        raise PipelineError(f"Unexpected ForceImportVersion in {filename}.")


def download_resource(
    entry: CatalogEntry,
    *,
    source_game_version: str,
    cdn_base_url: str,
    timeout_seconds: float,
    max_bytes: int,
    opener: Callable[..., Any] = urlopen,
) -> DownloadedResource:
    resource_url = build_resource_url(cdn_base_url, source_game_version, entry)
    request = Request(
        resource_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "LoSP-MSF-capabilities-pipeline/1.0",
        },
    )

    try:
        with opener(request, timeout=timeout_seconds) as response:
            status = getattr(response, "status", None)
            if status in {403, 404}:
                raise ResourceUnavailable(
                    f"{entry.resource_id} is unavailable in {source_game_version}."
                )
            if status != 200:
                raise PipelineError(
                    f"HTTP {status!r} while downloading {entry.resource_id}."
                )

            final_url = response.geturl()
            ensure_same_cdn_scope(resource_url, final_url, cdn_base_url)

            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    announced_bytes = int(content_length)
                except ValueError as error:
                    raise PipelineError(
                        f"Invalid Content-Length for {entry.resource_id}."
                    ) from error
                if announced_bytes > max_bytes:
                    raise PipelineError(
                        f"{entry.resource_id} exceeds the {max_bytes}-byte limit."
                    )

            payload = response.read(max_bytes + 1)
    except ResourceUnavailable:
        raise
    except HTTPError as error:
        if error.code in {403, 404}:
            raise ResourceUnavailable(
                f"{entry.resource_id} is unavailable in {source_game_version}."
            ) from error
        raise PipelineError(
            f"HTTP {error.code} while downloading {entry.resource_id}."
        ) from error
    except PipelineError:
        raise
    except Exception as error:
        raise PipelineError(
            f"Unable to download {entry.resource_id}: {error}"
        ) from error

    if len(payload) > max_bytes:
        raise PipelineError(
            f"{entry.resource_id} exceeds the {max_bytes}-byte limit."
        )

    actual_md5 = hashlib.md5(payload).hexdigest()  # noqa: S324 - source protocol uses MD5
    if actual_md5 != entry.md5:
        raise PipelineError(
            f"MD5 mismatch for {entry.resource_id}: "
            f"expected {entry.md5}, got {actual_md5}."
        )

    validate_json_payload(entry.filename, payload)

    return DownloadedResource(
        entry=entry,
        url=resource_url,
        source_game_version=source_game_version,
        payload=payload,
        sha256=hashlib.sha256(payload).hexdigest(),
    )


def download_resource_with_fallback(
    entry: CatalogEntry,
    *,
    game_version: str,
    cdn_base_url: str,
    timeout_seconds: float,
    max_bytes: int,
    opener: Callable[..., Any] = urlopen,
) -> DownloadedResource:
    attempted_versions = []

    for source_game_version in candidate_source_versions(game_version):
        attempted_versions.append(source_game_version)
        try:
            resource = download_resource(
                entry,
                source_game_version=source_game_version,
                cdn_base_url=cdn_base_url,
                timeout_seconds=timeout_seconds,
                max_bytes=max_bytes,
                opener=opener,
            )
            if source_game_version != game_version:
                print(
                    f"Located unchanged {entry.resource_id} in CDN version "
                    f"{source_game_version}."
                )
            return resource
        except ResourceUnavailable:
            continue

    raise PipelineError(
        f"Unable to locate {entry.resource_id} with MD5 {entry.md5}; "
        f"tried {len(attempted_versions)} bounded CDN versions."
    )


def existing_resource(
    entry: CatalogEntry,
    *,
    output_directory: Path,
    existing_manifest_resources: dict[str, dict[str, Any]],
    cdn_base_url: str,
) -> DownloadedResource | None:
    path = output_directory / entry.filename
    if not path.is_file():
        return None

    payload = path.read_bytes()
    if hashlib.md5(payload).hexdigest() != entry.md5:  # noqa: S324
        return None

    validate_json_payload(entry.filename, payload)
    previous = existing_manifest_resources.get(entry.resource_id, {})
    previous_url = previous.get("url")
    previous_source_version = previous.get("sourceGameVersion")

    if isinstance(previous_url, str):
        try:
            ensure_same_cdn_scope(previous_url, previous_url, cdn_base_url)
        except PipelineError:
            previous_url = None
            previous_source_version = None
    else:
        previous_url = None
        previous_source_version = None

    if not isinstance(previous_source_version, str):
        previous_source_version = None

    return DownloadedResource(
        entry=entry,
        url=previous_url,
        source_game_version=previous_source_version,
        payload=payload,
        sha256=hashlib.sha256(payload).hexdigest(),
    )


def utc_timestamp() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def load_existing_manifest(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def without_updated_at(manifest: dict[str, Any] | None) -> dict[str, Any] | None:
    if manifest is None:
        return None
    stable = dict(manifest)
    stable.pop("updatedAt", None)
    return stable


def replace_if_changed(source: Path, destination: Path) -> bool:
    if destination.is_file() and source.read_bytes() == destination.read_bytes():
        return False

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".tmp")
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)
    return True


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def update_sources(
    *,
    database_path: Path,
    game_version: str,
    game_build: str | None,
    output_directory: Path,
    manifest_path: Path,
    cdn_base_url: str = CDN_BASE_URL,
    timeout_seconds: float = 30,
    max_resource_bytes: int = RESOURCE_MAX_BYTES,
    updated_at: str | None = None,
    opener: Callable[..., Any] = urlopen,
) -> PipelineResult:
    version = validate_game_version(game_version)
    build = validate_game_build(game_build)
    base_url = validate_cdn_base_url(cdn_base_url)

    if timeout_seconds <= 0:
        raise PipelineError("Download timeout must be positive.")
    if max_resource_bytes <= 0:
        raise PipelineError("Resource size limit must be positive.")

    entries = read_catalog(database_path)
    output_directory.parent.mkdir(parents=True, exist_ok=True)
    existing_manifest = load_existing_manifest(manifest_path)
    manifest_resources = (existing_manifest or {}).get("resources", [])
    if not isinstance(manifest_resources, list):
        manifest_resources = []
    existing_manifest_resources = {
        resource["id"]: resource
        for resource in manifest_resources
        if isinstance(resource, dict) and isinstance(resource.get("id"), str)
    }

    with tempfile.TemporaryDirectory(
        prefix=".msf-capabilities-", dir=output_directory.parent
    ) as temporary_directory_name:
        temporary_directory = Path(temporary_directory_name)
        downloaded: list[DownloadedResource] = []

        for entry in entries:
            resource = existing_resource(
                entry,
                output_directory=output_directory,
                existing_manifest_resources=existing_manifest_resources,
                cdn_base_url=base_url,
            )
            if resource is None:
                resource = download_resource_with_fallback(
                    entry,
                    game_version=version,
                    cdn_base_url=base_url,
                    timeout_seconds=timeout_seconds,
                    max_bytes=max_resource_bytes,
                    opener=opener,
                )
            else:
                print(f"Reused verified {entry.resource_id} from the repository.")

            (temporary_directory / entry.filename).write_bytes(resource.payload)
            downloaded.append(resource)
            print(
                f"Validated {entry.resource_id}: "
                f"{len(resource.payload)} bytes, MD5 {entry.md5}"
            )

        game: dict[str, str] = {"version": version}
        if build is not None:
            game["build"] = build

        stable_manifest: dict[str, Any] = {
            "schemaVersion": 1,
            "game": game,
            "catalog": {
                "table": "RemoteAssetClientEntry",
                "resourceCount": len(downloaded),
            },
            "resources": [
                {
                    "id": resource.entry.resource_id,
                    "file": f"raw/{resource.entry.filename}",
                    "url": resource.url,
                    "sourceGameVersion": resource.source_game_version,
                    "md5": resource.entry.md5,
                    "sha256": resource.sha256,
                    "sizeBytes": len(resource.payload),
                }
                for resource in downloaded
            ],
        }

        manifest_changed = without_updated_at(existing_manifest) != stable_manifest

        changed_files = []
        for resource in downloaded:
            source = temporary_directory / resource.entry.filename
            destination = output_directory / resource.entry.filename
            if replace_if_changed(source, destination):
                changed_files.append(resource.entry.filename)

        changed = bool(changed_files) or manifest_changed
        if changed:
            manifest = {
                "schemaVersion": stable_manifest["schemaVersion"],
                "updatedAt": updated_at or utc_timestamp(),
                "game": stable_manifest["game"],
                "catalog": stable_manifest["catalog"],
                "resources": stable_manifest["resources"],
            }
            write_manifest(manifest_path, manifest)
        else:
            print("No source changes detected; existing files were preserved.")

    characters_hash = next(
        entry.md5
        for entry in entries
        if entry.resource_id == "combat_data/characters.json"
    )
    return PipelineResult(
        changed=changed,
        resource_count=len(entries),
        characters_hash=characters_hash,
        manifest_path=manifest_path,
    )


def decode_database_from_environment(variable_name: str, destination: Path) -> None:
    encoded = os.environ.get(variable_name)
    if encoded is None:
        raise PipelineError(f"Environment variable {variable_name!r} is not set.")

    normalized = "".join(encoded.split())
    if normalized.startswith("data:"):
        marker = ";base64,"
        marker_index = normalized.find(marker)
        if marker_index == -1:
            raise PipelineError("Invalid SQLite data URI.")
        normalized = normalized[marker_index + len(marker) :]

    try:
        payload = base64.b64decode(normalized, validate=True)
    except (ValueError, binascii.Error) as error:
        raise PipelineError("Invalid Base64 SQLite payload.") from error

    if len(payload) > DATABASE_MAX_BYTES:
        raise PipelineError(
            f"Decoded SQLite payload exceeds {DATABASE_MAX_BYTES} bytes."
        )

    destination.write_bytes(payload)


def write_github_outputs(result: PipelineResult) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return

    with Path(output_path).open("a", encoding="utf-8") as output:
        output.write(f"changed={'true' if result.changed else 'false'}\n")
        output.write(f"resource_count={result.resource_count}\n")
        output.write(f"characters_hash={result.characters_hash}\n")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read an MSF combat_data SQLite catalog, download its 11 official "
            "JSON resources and update the provenance manifest."
        )
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--database",
        type=Path,
        help=(
            "Path to the SQLite catalog. The filename is unrestricted; "
            "combat_data.db and combat_data (1).db are both accepted."
        ),
    )
    source.add_argument(
        "--database-base64-env",
        metavar="VARIABLE",
        help="Environment variable containing the Base64-encoded SQLite catalog.",
    )
    parser.add_argument("--game-version", required=True)
    parser.add_argument("--game-build", default=None)
    parser.add_argument(
        "--output-directory",
        type=Path,
        default=Path("data/msf-capabilities/raw"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("data/msf-capabilities/source-manifest.json"),
    )
    parser.add_argument("--cdn-base-url", default=CDN_BASE_URL)
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument(
        "--max-resource-bytes", type=int, default=RESOURCE_MAX_BYTES
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    temporary_database: tempfile.TemporaryDirectory[str] | None = None

    try:
        if arguments.database is not None:
            database_path = arguments.database
        else:
            temporary_database = tempfile.TemporaryDirectory(
                prefix="msf-capabilities-database-"
            )
            database_path = Path(temporary_database.name) / "combat_data.db"
            decode_database_from_environment(
                arguments.database_base64_env, database_path
            )

        result = update_sources(
            database_path=database_path,
            game_version=arguments.game_version,
            game_build=arguments.game_build,
            output_directory=arguments.output_directory,
            manifest_path=arguments.manifest,
            cdn_base_url=arguments.cdn_base_url,
            timeout_seconds=arguments.timeout,
            max_resource_bytes=arguments.max_resource_bytes,
        )
        write_github_outputs(result)
        print(
            f"MSF capabilities sources ready: {result.resource_count} resources; "
            f"changed={'yes' if result.changed else 'no'}."
        )
        return 0
    except PipelineError as error:
        print(f"ERROR: {error}", file=os.sys.stderr)
        return 1
    finally:
        if temporary_database is not None:
            temporary_database.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
