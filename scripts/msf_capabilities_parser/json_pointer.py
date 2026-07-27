"""RFC 6901 JSON Pointer helpers."""

from __future__ import annotations

from typing import Any


class JsonPointerError(ValueError):
    """Raised when a JSON Pointer cannot be resolved."""


def escape_segment(value: object) -> str:
    """Escape one JSON Pointer reference token."""

    return str(value).replace("~", "~0").replace("/", "~1")


def unescape_segment(value: str) -> str:
    """Decode one JSON Pointer reference token."""

    result: list[str] = []
    index = 0
    while index < len(value):
        character = value[index]
        if character != "~":
            result.append(character)
            index += 1
            continue

        if index + 1 >= len(value) or value[index + 1] not in {"0", "1"}:
            raise JsonPointerError(f"Invalid JSON Pointer escape in {value!r}.")
        result.append("~" if value[index + 1] == "0" else "/")
        index += 2
    return "".join(result)


def append_pointer(base: str, *segments: object) -> str:
    """Append reference tokens to an existing JSON Pointer."""

    if base and not base.startswith("/"):
        raise JsonPointerError(f"Invalid JSON Pointer base: {base!r}.")
    suffix = "".join(f"/{escape_segment(segment)}" for segment in segments)
    return f"{base}{suffix}"


def resolve_pointer(document: Any, pointer: str) -> Any:
    """Resolve a JSON Pointer against a parsed JSON document."""

    if pointer == "":
        return document
    if not pointer.startswith("/"):
        raise JsonPointerError(f"Invalid JSON Pointer: {pointer!r}.")

    current = document
    for encoded in pointer[1:].split("/"):
        segment = unescape_segment(encoded)
        if isinstance(current, dict):
            if segment not in current:
                raise JsonPointerError(
                    f"Object key {segment!r} does not exist at {pointer!r}."
                )
            current = current[segment]
            continue
        if isinstance(current, list):
            if not segment.isdigit():
                raise JsonPointerError(
                    f"List index {segment!r} is invalid at {pointer!r}."
                )
            index = int(segment)
            if index >= len(current):
                raise JsonPointerError(
                    f"List index {index} is out of range at {pointer!r}."
                )
            current = current[index]
            continue
        raise JsonPointerError(
            f"Cannot descend through {type(current).__name__} at {pointer!r}."
        )
    return current
