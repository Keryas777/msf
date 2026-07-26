"""Deterministic identifiers used by the intermediate mechanics schema."""

from __future__ import annotations

import hashlib


ID_HASH_LENGTH = 16


class DuplicateIdentifierError(RuntimeError):
    """Raised when two records claim the same deterministic identifier."""

    def __init__(self, identifier: str, existing: str, requested: str):
        super().__init__(
            f"Identifier {identifier} is already claimed by {existing!r}; "
            f"cannot assign it to {requested!r}."
        )
        self.identifier = identifier
        self.existing = existing
        self.requested = requested


def deterministic_id(prefix: str, canonical: str) -> str:
    """Return a readable identifier derived only from stable source data."""

    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{prefix}_{digest[:ID_HASH_LENGTH]}"


class IdRegistry:
    """Claim deterministic IDs and reject duplicates or truncated-hash collisions."""

    def __init__(self) -> None:
        self._claims: dict[str, str] = {}

    def claim(self, prefix: str, canonical: str) -> str:
        identifier = deterministic_id(prefix, canonical)
        existing = self._claims.get(identifier)
        if existing is not None:
            raise DuplicateIdentifierError(identifier, existing, canonical)
        self._claims[identifier] = canonical
        return identifier
