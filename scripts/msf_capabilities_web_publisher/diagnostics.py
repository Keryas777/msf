"""Stable errors emitted by the MSF capabilities Web publisher."""

from __future__ import annotations


class PublisherError(Exception):
    """Base error carrying a stable diagnostic code and CLI exit status."""

    exit_code = 2

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class PublisherInputError(PublisherError):
    """The indexer output cannot be read or does not match its schema."""

    exit_code = 2


class PublisherAuditError(PublisherError):
    """The indexer contract fails an integrity or audit check."""

    exit_code = 3


class PublisherStateError(PublisherError):
    """The existing public tree cannot be updated safely."""

    exit_code = 4


def input_error(code: str, message: str) -> PublisherInputError:
    return PublisherInputError(code, message)


def audit_error(code: str, message: str) -> PublisherAuditError:
    return PublisherAuditError(code, message)


def state_error(code: str, message: str) -> PublisherStateError:
    return PublisherStateError(code, message)
