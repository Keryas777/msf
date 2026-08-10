"""Verify a published explorer generation from permuted source collections.

This runs in its own process so the full-corpus determinism check does not keep
two large generated graphs resident at once.
"""

from __future__ import annotations

import json
from pathlib import Path

from .builder import DEFAULT_OUTPUT_ROOT, generate_artifacts, load_source_documents


REVERSED_RECORD_COLLECTIONS = (
    "characters.json",
    "abilities.json",
    "contexts.json",
    "operations.json",
    "spawns.json",
    "uninterpreted-actions.json",
)


def _permute(documents: dict) -> None:
    documents["presentations"].reverse()
    documents["portraits"].reverse()
    for name in REVERSED_RECORD_COLLECTIONS:
        records = documents["payloads"][name]["records"]
        documents["payloads"][name]["records"] = dict(
            reversed(list(records.items()))
        )
    effects = documents["payloads"]["effects.json"]["catalog"]["byEffectId"]
    documents["payloads"]["effects.json"]["catalog"]["byEffectId"] = dict(
        reversed(list(effects.items()))
    )


def main() -> int:
    repository_root = Path(".").resolve()
    output_root = repository_root / DEFAULT_OUTPUT_ROOT
    stable_path = output_root / "manifest.json"
    stable = json.loads(stable_path.read_text(encoding="utf-8"))
    expected_directory = output_root / stable["currentPath"]

    documents = load_source_documents(repository_root)
    _permute(documents)
    generated = generate_artifacts(documents)

    if generated.payload_set_checksum != stable["currentPayloadSetChecksum"]:
        raise SystemExit(
            "PERMUTED_CHECKSUM_MISMATCH: "
            f"{generated.payload_set_checksum} != {stable['currentPayloadSetChecksum']}"
        )
    if generated.stable_manifest != stable_path.read_bytes():
        raise SystemExit("PERMUTED_STABLE_MANIFEST_MISMATCH")

    expected = {
        **generated.payloads,
        "generation-manifest.json": generated.generation_manifest,
    }
    actual_paths = {
        path.relative_to(expected_directory).as_posix()
        for path in expected_directory.rglob("*")
        if path.is_file()
    }
    if actual_paths != set(expected):
        raise SystemExit("PERMUTED_INVENTORY_MISMATCH")
    for relative, payload in expected.items():
        if (expected_directory / relative).read_bytes() != payload:
            raise SystemExit(f"PERMUTED_BYTE_MISMATCH: {relative}")

    print(
        json.dumps(
            {
                "status": "valid",
                "payloadSetChecksum": generated.payload_set_checksum,
                "payloadCount": len(generated.payloads),
                "permutedCollections": [
                    "presentations",
                    "portraits",
                    *REVERSED_RECORD_COLLECTIONS,
                    "effects.json/catalog/byEffectId",
                ],
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
