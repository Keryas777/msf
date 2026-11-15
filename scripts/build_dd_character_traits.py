"""Publish compact official character traits for the static DD9 roster evaluator.

The Codex generation's per-character shards are authoritative. The public
characters.json catalogue contains only display cardTraits and is insufficient.
"""
import argparse
import json
from pathlib import Path


def build(root: Path) -> dict:
    base = root / "docs/data/msf-capabilities-explorer"
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    generation = base / manifest["currentPath"]
    index = json.loads((generation / "characters.json").read_text(encoding="utf-8"))
    result = {}
    for record in index["records"]:
        character_id = record["id"]
        path = generation / "characters" / (character_id + ".json")
        shard = json.loads(path.read_text(encoding="utf-8"))["character"]
        if shard.get("id") != character_id:
            raise ValueError(f"Codex character ID mismatch: {character_id}")
        # Codex can mark a playable character official in its explicit status
        # even when the legacy `official` boolean is false (e.g. Destroyer).
        # Require verified provenance; never infer tags from display labels.
        is_official = shard.get("official") is True or (
            isinstance(shard.get("status"), dict)
            and shard["status"].get("kind") == "official"
        )
        if not is_official or shard.get("playable") is not True:
            continue
        traits = shard.get("traits")
        if not isinstance(traits, list) or not traits or any(not isinstance(t, str) for t in traits):
            raise ValueError(f"Official character lacks verified traits: {character_id}")
        result[character_id] = sorted(set(traits))
    if len(result) < 300:
        raise ValueError(f"Unexpected official Codex coverage: {len(result)}")
    return {
        "schemaVersion": 1,
        "sourcePayloadSetChecksum": manifest["currentPayloadSetChecksum"],
        "characters": dict(sorted(result.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    target = root / "docs/data/dd-character-traits.json"
    content = json.dumps(build(root), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            raise SystemExit("DD character traits are stale; rebuild them")
    else:
        target.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
