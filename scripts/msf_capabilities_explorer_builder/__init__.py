"""Build browser-sized artifacts for the MSF capabilities explorer."""

from .official_effects import apply_official_effect_catalog

apply_official_effect_catalog()

from .builder import (
    BuilderError,
    BuildResult,
    build_explorer,
    check_explorer,
    generate_artifacts,
    load_source_documents,
)

__all__ = [
    "BuilderError",
    "BuildResult",
    "build_explorer",
    "check_explorer",
    "generate_artifacts",
    "load_source_documents",
]
