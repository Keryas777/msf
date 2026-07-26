"""Source-specific structural adapters."""

from .characters import CharacterParseResult, parse_characters
from .procs import ProcParseResult, parse_procs

__all__ = [
    "CharacterParseResult",
    "ProcParseResult",
    "parse_characters",
    "parse_procs",
]
