"""Command-line interface for the MSF capabilities Web publisher."""

from __future__ import annotations

import argparse
import os

from .diagnostics import PublisherError
from .publisher import (
    DEFAULT_PUBLIC_ROOT,
    DEFAULT_SOURCE_DIRECTORY,
    check_publication,
    publish,
)


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Publish existing MSF capability index artifacts below docs/ "
            "without invoking upstream pipeline stages."
        )
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Verify that the public generation exactly matches the current "
            "indexer output; never write a byte."
        ),
    )
    return parser.parse_args(argv)


def _print_summary(
    *,
    current_path: str,
    payload_set_checksum: str,
    capabilities_checksum: str,
    checked: bool,
) -> None:
    mode = "validée" if checked else "générée"
    print(f"Publication Web MSF {mode} : {DEFAULT_PUBLIC_ROOT}")
    print(f"Génération courante : {current_path}")
    print(f"payloadSetChecksum : {payload_set_checksum}")
    print(f"capabilitiesChecksum : {capabilities_checksum}")


def main(argv: list[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    try:
        if arguments.check:
            errors = check_publication(
                DEFAULT_SOURCE_DIRECTORY,
                DEFAULT_PUBLIC_ROOT,
            )
            if errors:
                for error in errors:
                    print(
                        f"ERROR [WEB_PUBLICATION_CHECK_FAILED]: {error}",
                        file=os.sys.stderr,
                    )
                return 1
            from .audit import validate_indexed_artifacts

            source = validate_indexed_artifacts(
                DEFAULT_SOURCE_DIRECTORY,
                allow_readme=True,
            )
            _print_summary(
                current_path=(
                    f"indexed/sha256-{source.payload_set_hex}/"
                ),
                payload_set_checksum=source.payload_set_checksum,
                capabilities_checksum=source.capabilities_checksum,
                checked=True,
            )
            return 0

        result = publish(
            DEFAULT_SOURCE_DIRECTORY,
            DEFAULT_PUBLIC_ROOT,
        )
        _print_summary(
            current_path=result.current_path,
            payload_set_checksum=result.payload_set_checksum,
            capabilities_checksum=result.capabilities_checksum,
            checked=False,
        )
        return 0
    except PublisherError as error:
        print(f"ERROR [{error.code}]: {error}", file=os.sys.stderr)
        return error.exit_code
    except OSError as error:
        print(f"ERROR [WEB_PUBLISHER_IO_ERROR]: {error}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
