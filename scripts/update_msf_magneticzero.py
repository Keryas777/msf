#!/usr/bin/env python3
"""Safely stage the 11 public MagneticZero combat_data JSON sources for LoSP.

No write is performed by default. --apply is intended for a gated GitHub Action.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile

from scripts.probe_magneticzero import (
    FILES, ORIGIN, HEX64, PageParser, ProbeError, extract, fetch_page, latest,
)
from scripts.update_msf_capabilities import (
    PipelineError, validate_json_payload, load_existing_manifest,
    replace_if_changed, write_manifest, without_updated_at,
)


def verify_local(manifest: dict, directory: Path) -> dict[str, dict]:
    resources = manifest.get("resources")
    if not isinstance(resources, list) or len(resources) != len(FILES):
        raise PipelineError("Invalid existing source manifest inventory.")
    records = {item["id"]: item for item in resources}
    if set(records) != {f"combat_data/{name}" for name in FILES}:
        raise PipelineError("Manifest has unexpected or duplicated combat data entries.")
    for name in FILES:
        record = records[f"combat_data/{name}"]
        if record.get("file") != f"raw/{name}":
            raise PipelineError(f"Unexpected local source path for {name}.")
        payload = (directory / name).read_bytes()
        if (hashlib.sha256(payload).hexdigest() != record["sha256"] or
                hashlib.md5(payload).hexdigest() != record["md5"]):
            raise PipelineError(f"Existing {name} differs from its recorded hashes.")
        validate_json_payload(name, payload)
    return records


def current_revision(filename: str, previous: str | None) -> tuple[str, str]:
    html = fetch_page(f"{ORIGIN}/file/combat_data/{filename}")
    revision, url = latest(html, filename)
    if previous and previous != revision:
        parser = PageParser()
        parser.feed(html)
        prefix = f"/view/combat_data/{filename}/"
        positions = [
            link[len(prefix):] for link in parser.links
            if link.startswith(prefix) and HEX64.fullmatch(link[len(prefix):])
        ]
        # An older revision must never replace one we've already imported.
        if previous not in positions or positions.index(previous) <= positions.index(revision):
            raise PipelineError(f"Cannot establish newer revision for {filename}; refusing rollback.")
    return revision, url


def build_candidate(
    existing: dict, records: dict[str, dict], directory: Path,
) -> tuple[dict, dict[str, bytes], dict]:
    new_resources = []
    staged = {}
    changed_files = []
    reused = []
    revisions = {}
    for name in FILES:
        record = records[f"combat_data/{name}"]
        previous = record.get("magneticRevision")
        revision, url = current_revision(name, previous)
        source_bytes = (directory / name).read_bytes()
        if previous == revision and record.get("sourceType") == "magneticzero":
            payload = source_bytes
            reused.append(name)
        else:
            remote = extract(fetch_page(url), name.removesuffix(".json"), revision)
            validate_json_payload(name, (json.dumps(remote, ensure_ascii=False) + "\n").encode("utf-8"))
            old_doc = json.loads(source_bytes)
            if old_doc == remote:
                payload = source_bytes
                reused.append(name)
            else:
                # Compact deterministic UTF-8 for newly changed sources.
                payload = (json.dumps(remote, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
                changed_files.append(name)
        sha = hashlib.sha256(payload).hexdigest()
        md5 = hashlib.md5(payload).hexdigest()
        revisions[name] = revision
        staged[name] = payload
        new_resources.append({
            "id": f"combat_data/{name}",
            "file": f"raw/{name}",
            "url": url,
            "sourceGameVersion": None,
            "sourceType": "magneticzero",
            "magneticRevision": revision,
            "md5": md5,
            "sha256": sha,
            "sizeBytes": len(payload),
        })
    # Preserve the last *verified* game version for history / Chrome fallback,
    # while explicitly preventing the UI from claiming these revisions are active.
    game = dict(existing.get("game") or {})
    game["versionVerified"] = False
    manifest = {
        "schemaVersion": 1,
        "game": game,
        "catalog": {
            "table": "MagneticZeroRevisionIndex",
            "resourceCount": len(FILES),
            "source": "magneticzero",
            "gameVersionVerified": False,
        },
        "resources": new_resources,
    }
    summary = {"checked": len(FILES), "differentFiles": changed_files, "identicalFiles": reused,
               "revisions": revisions}
    return manifest, staged, summary


def run(
    directory: Path, manifest_path: Path, *, apply: bool,
    current_time: str | None = None,
) -> dict:
    existing = load_existing_manifest(manifest_path)
    if existing is None:
        raise PipelineError(f"Missing or invalid manifest: {manifest_path}")
    records = verify_local(existing, directory)
    candidate, files, summary = build_candidate(existing, records, directory)
    change = without_updated_at(existing) != candidate
    summary.update({"changed": change, "apply": apply})
    if apply and change:
        # Complete all HTTP/JSON/hash checks before writing any tracked file.
        with tempfile.TemporaryDirectory(prefix="magneticzero-staging-") as tmp:
            root = Path(tmp)
            for name, payload in files.items():
                (root / name).write_bytes(payload)
            for name in FILES:
                replace_if_changed(root / name, directory / name)
        result = {"updatedAt": current_time or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), **candidate}
        write_manifest(manifest_path, result)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write validated changes (default: dry run)")
    parser.add_argument("--raw-dir", type=Path, default=Path("data/msf-capabilities/raw"))
    parser.add_argument("--manifest", type=Path, default=Path("data/msf-capabilities/source-manifest.json"))
    options = parser.parse_args()
    try:
        result = run(options.raw_dir, options.manifest, apply=options.apply)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        output = os.environ.get("GITHUB_OUTPUT")
        if output:
            with open(output, "a", encoding="utf-8") as out:
                out.write(f"changed={'true' if result['changed'] else 'false'}\n")
        return 0
    except (PipelineError, ProbeError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f"MagneticZero collection failed without publishing: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
