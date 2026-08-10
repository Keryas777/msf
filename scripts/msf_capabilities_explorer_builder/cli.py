"""Command-line interface for the Codex MSF Web builder."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .builder import (
    DEFAULT_OUTPUT_ROOT,
    BuilderError,
    build_explorer,
    check_explorer,
)


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Codex MSF Web artifacts")
    parser.add_argument("--check", action="store_true", help="vérifie sans écrire")
    parser.add_argument(
        "--repository-root",
        type=Path,
        default=Path("."),
        help="racine du dépôt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help="répertoire de publication relatif à la racine",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    try:
        result = (
            check_explorer(
                args.repository_root,
                output_root=args.output,
            )
            if args.check
            else build_explorer(
                args.repository_root,
                output_root=args.output,
            )
        )
    except BuilderError as error:
        print(f"{error.code}: {error.message}", file=sys.stderr)
        return 1 if args.check else 2
    summary = {
        "status": "valid" if args.check else "generated",
        "output": str(result.output_root),
        "generation": str(result.generation_path),
        "payloadSetChecksum": result.payload_set_checksum,
        "counts": result.counts,
        "presentationAudit": result.presentation_audit,
        "payloadBytes": sum(result.payload_sizes.values()),
        "largestPayloads": sorted(
            result.payload_sizes.items(), key=lambda item: (-item[1], item[0])
        )[:10],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
