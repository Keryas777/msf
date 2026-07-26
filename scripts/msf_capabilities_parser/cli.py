"""Command-line interface for the structural MSF capabilities parser."""

from __future__ import annotations

import argparse
from collections import Counter
import os
from pathlib import Path
import tempfile

from .parser import (
    DEFAULT_CHARACTERS_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PROCS_PATH,
    ParserError,
    parse_sources,
    serialize_mechanics,
)


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Parse characters.json and procs.json into the deterministic "
            "intermediate MSF mechanics representation."
        )
    )
    parser.add_argument(
        "--characters",
        type=Path,
        default=DEFAULT_CHARACTERS_PATH,
        help="Path to the immutable characters.json source.",
    )
    parser.add_argument(
        "--procs",
        type=Path,
        default=DEFAULT_PROCS_PATH,
        help="Path to the immutable procs.json source.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path of the generated intermediate JSON file.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when the existing output differs; never write a file.",
    )
    return parser.parse_args(argv)


def _write_atomically(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as temporary:
            temporary.write(payload)
            temporary_path = Path(temporary.name)
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _print_summary(mechanics: dict, output: Path, *, checked: bool) -> None:
    audit = mechanics["audit"]
    severities = Counter(
        item["severity"] for item in mechanics["diagnostics"]
    )
    mode = "validé" if checked else "généré"
    print(f"Fichier mechanics.json {mode} : {output}")
    print(
        "Entrée : "
        f"{audit['input']['characterCount']} personnages, "
        f"{audit['input']['abilityCount']} capacités, "
        f"{audit['input']['passiveTriggerCount']} déclencheurs passifs, "
        f"{audit['input']['sourceActionCount']} actions, "
        f"{audit['input']['procCount']} procs."
    )
    print(
        "Sortie : "
        f"{audit['output']['containerCount']} conteneurs, "
        f"{audit['output']['actionCount']} actions, "
        f"{audit['output']['effectCount']} effets."
    )
    print(
        "Diagnostics : "
        f"{severities.get('error', 0)} erreur(s), "
        f"{severities.get('warning', 0)} avertissement(s), "
        f"{severities.get('info', 0)} information(s)."
    )
    print(
        "Adaptateurs : "
        + ", ".join(
            f"{name}={count}" for name, count in audit["adapters"].items()
        )
    )


def main(argv: list[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    try:
        mechanics = parse_sources(arguments.characters, arguments.procs)
        payload = serialize_mechanics(mechanics)

        if arguments.check:
            try:
                existing = arguments.output.read_bytes()
            except OSError as error:
                print(
                    f"ERROR: sortie générée absente ou illisible : "
                    f"{arguments.output}: {error}",
                    file=os.sys.stderr,
                )
                return 1
            if existing != payload:
                print(
                    f"ERROR: sortie générée obsolète : {arguments.output}",
                    file=os.sys.stderr,
                )
                return 1
            _print_summary(mechanics, arguments.output, checked=True)
            return 0

        _write_atomically(arguments.output, payload)
        _print_summary(mechanics, arguments.output, checked=False)
        return 0
    except ParserError as error:
        print(f"ERROR [{error.code}]: {error}", file=os.sys.stderr)
        return 1
    except OSError as error:
        print(f"ERROR: impossible d’écrire {arguments.output}: {error}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
