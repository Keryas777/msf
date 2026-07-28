"""Command-line interface for the MSF capabilities normalizer."""

from __future__ import annotations

import argparse
from collections import Counter
import os
from pathlib import Path
import tempfile

from .normalizer import (
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_PATH,
    NormalizerError,
    load_mechanics,
    normalize_mechanics,
    serialize_capabilities,
)


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize parsed MSF mechanics into deterministic, controlled "
            "effect operations."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT_PATH,
        help="Path to the generated parser mechanics.json.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path of the generated normalized capabilities JSON.",
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


def _print_summary(
    capabilities: dict,
    output: Path,
    *,
    checked: bool,
) -> None:
    audit = capabilities["audit"]
    severities = Counter(
        item["severity"] for item in capabilities["diagnostics"]
    )
    mode = "validé" if checked else "généré"
    print(f"Fichier capabilities.json {mode} : {output}")
    print(
        "Entrée : "
        f"{audit['input']['characterCount']} personnages, "
        f"{audit['input']['containerCount']} conteneurs, "
        f"{audit['input']['actionCount']} actions, "
        f"{audit['input']['effectCount']} effets."
    )
    print(
        "Sortie : "
        f"{audit['output']['abilityCount']} capacités, "
        f"{audit['output']['contextCount']} contextes, "
        f"{audit['output']['actionMappingCount']} mappings d’action, "
        f"{audit['output']['operationCount']} opérations, "
        f"{audit['output']['effectCount']} effets."
    )
    print(
        "Couverture : "
        f"{audit['sourceActionCount']} actions source, "
        f"{audit['mappedActionCount']} normalisée(s), "
        f"{audit['preservedUninterpretedActionCount']} préservée(s) "
        "sans interprétation, "
        f"{audit['integrity']['missingActionMappingCount']} sans mapping, "
        f"{audit['effectResolution']['unresolvedProcReferenceCount']} "
        "référence(s) de proc non résolue(s)."
    )
    print(
        "Contrats explicites : "
        f"spawn={audit['spawnOperationCount']}, "
        f"empower={audit['empowerOperationCount']}, "
        f"empty_result={audit['emptyResultOperationCount']}, "
        "résolutions par alias contrôlé="
        f"{audit['controlledAliasResolutionCount']}."
    )
    print(
        "Diagnostics du normaliseur : "
        f"{severities.get('error', 0)} erreur(s), "
        f"{severities.get('warning', 0)} avertissement(s), "
        f"{severities.get('info', 0)} information(s)."
    )
    print(
        "Opérations : "
        + ", ".join(
            f"{name}={count}"
            for name, count in audit["operationsByKind"].items()
        )
    )


def main(argv: list[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    try:
        mechanics = load_mechanics(arguments.input)
        capabilities = normalize_mechanics(
            mechanics.document,
            mechanics_payload=mechanics.payload,
        )
        payload = serialize_capabilities(capabilities)

        if arguments.check:
            try:
                existing = arguments.output.read_bytes()
            except OSError as error:
                print(
                    f"ERROR: sortie normalisée absente ou illisible : "
                    f"{arguments.output}: {error}",
                    file=os.sys.stderr,
                )
                return 1
            if existing != payload:
                print(
                    f"ERROR: sortie normalisée obsolète : {arguments.output}",
                    file=os.sys.stderr,
                )
                return 1
            _print_summary(
                capabilities,
                arguments.output,
                checked=True,
            )
            return 0

        _write_atomically(arguments.output, payload)
        _print_summary(
            capabilities,
            arguments.output,
            checked=False,
        )
        return 0
    except NormalizerError as error:
        print(f"ERROR [{error.code}]: {error}", file=os.sys.stderr)
        return 1
    except OSError as error:
        print(
            f"ERROR: impossible d’écrire {arguments.output}: {error}",
            file=os.sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
