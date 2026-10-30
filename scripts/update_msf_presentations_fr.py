#!/usr/bin/env python3
"""Fail-closed import of official French MSF ability presentations.

The public web-service route is checked at runtime; it is not assumed to be
French merely because lang=fr is requested. --source-file accepts an exported
R2 source for the same verification without any external HTTP request.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen

SOURCE_URL = "https://api-prod.marvelstrikeforce.com/services/api/getCharacterAbilities?lang=fr"
DEFAULT_TARGET = Path("data/msf-capabilities/raw/msf-character-abilities-fr.json")
CORE = ("basic", "special", "ultimate", "passive")
ID = re.compile(r"^[A-Za-z0-9_-]+$")
MAX_BYTES = 16_000_000


class PresentationsError(RuntimeError):
    pass


def _pairs_unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise PresentationsError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def decode(source: bytes):
    try:
        return json.loads(source.decode("utf-8"), object_pairs_hook=_pairs_unique,
                          parse_constant=lambda value: (_ for _ in ()).throw(
                              PresentationsError(f"Invalid JSON number: {value}")))
    except (ValueError, UnicodeError) as exc:
        raise PresentationsError(f"Invalid JSON source: {exc}") from exc


def rows(value):
    if isinstance(value, dict):
        value = value.get("data", value.get("characters"))
        if isinstance(value, dict):
            value = value.get("characters")
    if not isinstance(value, list) or not value:
        raise PresentationsError("Expected a nonempty list of official character records")
    result = {}
    for record in value:
        if not isinstance(record, dict):
            raise PresentationsError("Invalid character record")
        cid = record.get("id")
        if not isinstance(cid, str) or not ID.fullmatch(cid) or cid in result:
            raise PresentationsError(f"Missing, invalid or repeated character ID: {cid!r}")
        result[cid] = record
    return result


def complete(record):
    kit = record.get("abilityKit")
    if not isinstance(kit, dict):
        return False
    for typ in CORE:
        ability = kit.get(typ)
        if not isinstance(ability, dict):
            return False
        if not isinstance(ability.get("name"), str) or not ability["name"].strip():
            return False
        icon = ability.get("icon")
        if not isinstance(icon, str) or not icon.startswith(
                "https://assets.marvelstrikeforce.com/imgs/"):
            return False
        levels = ability.get("levels")
        if not isinstance(levels, dict) or not levels:
            return False
        numeric = [int(n) for n in levels if n.isdecimal() and int(n) > 0]
        if len(numeric) != len(levels):
            return False
        for level in numeric:
            entry = levels.get(str(level))
            if not isinstance(entry, dict) or not isinstance(entry.get("description"), str) \
                    or not entry["description"].strip():
                return False
    return True


def _language_guard(previous, incoming):
    overlap = [cid for cid in previous.keys() & incoming.keys()
               if complete(previous[cid]) and complete(incoming[cid])]
    minimum = min(25, max(1, len(previous) // 4))
    if len(overlap) < minimum or len(incoming) < max(1, (len(previous) * 3) // 4):
        raise PresentationsError("Candidate has insufficient coverage to verify language")
    same_names = same_descriptions = 0
    for cid in overlap:
        before = previous[cid]["abilityKit"]["basic"]
        after = incoming[cid]["abilityKit"]["basic"]
        same_names += before["name"] == after["name"]
        a_levels, b_levels = before["levels"], after["levels"]
        a_max, b_max = max(map(int, a_levels)), max(map(int, b_levels))
        same_descriptions += a_levels[str(a_max)]["description"] == b_levels[str(b_max)]["description"]
    # Existing records are already verified French presentations. Mass-language
    # switches or unrelated payloads must fail, not silently replace the Codex.
    if same_names * 100 < len(overlap) * 70 or \
            same_descriptions * 100 < len(overlap) * 55:
        raise PresentationsError("French-language continuity could not be verified")
    return len(overlap)


def merge(existing, source):
    previous, incoming = rows(existing), rows(source)
    overlap = _language_guard(previous, incoming)
    result = deepcopy(previous)
    changed_ids = []
    skipped = []
    for cid, record in incoming.items():
        if not complete(record):
            skipped.append(cid)
            continue
        updated = deepcopy(result[cid]) if cid in result else deepcopy(record)
        updated["abilityKit"] = deepcopy(record["abilityKit"])
        # Do not rewrite unrelated existing fields; keep expanded ability kits.
        if isinstance(record.get("empoweredAbilityKit"), dict):
            updated["empoweredAbilityKit"] = deepcopy(record["empoweredAbilityKit"])
        if updated != result.get(cid):
            result[cid] = updated
            changed_ids.append(cid)
    return [result[cid] for cid in sorted(result)], {
        "sourceCharacters": len(incoming), "verifiedOverlap": overlap,
        "changedCharacters": len(changed_ids), "newCharacters": sum(cid not in previous for cid in changed_ids),
        "incompleteSkipped": len(skipped),
    }


def fetch_source():
    req = Request(SOURCE_URL, headers={"Accept": "application/json", "User-Agent": "LoSP-Codex/1.0"})
    with urlopen(req, timeout=20) as response:
        if response.status != 200 or "json" not in response.headers.get("Content-Type", "").lower():
            raise PresentationsError("Official source did not return HTTP 200 JSON")
        if response.geturl() != SOURCE_URL:
            raise PresentationsError("Unexpected official-source redirect")
        data = response.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise PresentationsError("Official source is empty or exceeds the size limit")
    return data


def run(target: Path, *, source_file: Path | None = None, apply: bool = False):
    if target.is_symlink():
        raise PresentationsError("Refusing symlink target")
    original = target.read_bytes()
    candidate = source_file.read_bytes() if source_file else fetch_source()
    if not candidate or len(candidate) > MAX_BYTES:
        raise PresentationsError("Missing or oversized source payload")
    merged, summary = merge(decode(original), decode(candidate))
    payload = (json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    # Semantic equality avoids needless rewrites when just whitespace changes.
    changed = decode(original) != merged
    summary["changed"] = changed
    if changed and apply:
        fd, name = tempfile.mkstemp(prefix=".msf-fr-", dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(payload)
                f.flush()
                os.fsync(f.fileno())
            os.replace(name, target)
        finally:
            if os.path.exists(name):
                os.unlink(name)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed and apply else 'false'}\n")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Atomically write the validated update")
    parser.add_argument("--source-file", type=Path, help="Validate an exported R2 JSON without HTTP")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    opts = parser.parse_args()
    try:
        print(json.dumps(run(opts.target, source_file=opts.source_file, apply=opts.apply), ensure_ascii=False))
    except (OSError, PresentationsError) as exc:
        parser.exit(1, f"French presentations: {exc}\n")


if __name__ == "__main__":
    main()
