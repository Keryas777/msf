"""Stable errors and diagnostics for the MSF capabilities indexer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Diagnostic:
    """A deterministic indexer diagnostic."""

    severity: str
    code: str
    message: str
    details: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "details": {} if self.details is None else self.details,
        }


class IndexerError(Exception):
    """Base class carrying a stable error code and CLI exit status."""

    exit_code = 2

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class IndexerInputError(IndexerError):
    """The normalized input cannot be read or does not match its schema."""

    exit_code = 2


class IndexerAuditError(IndexerError):
    """A semantic or coverage invariant is violated."""

    exit_code = 3


def input_error(code: str, message: str) -> IndexerInputError:
    return IndexerInputError(code, message)


def audit_error(code: str, message: str) -> IndexerAuditError:
    return IndexerAuditError(code, message)
