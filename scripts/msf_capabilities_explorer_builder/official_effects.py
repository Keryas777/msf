"""Load the canonical bilingual MSF effects catalog into Codex presentation data.

The catalog is manually transcribed from the official Marvel Strike Force
French and English effects pages. This module only maps explicitly declared
mechanical IDs; it never guesses a relation from a translated name.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CATALOG_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "msf-capabilities"
    / "reference"
    / "msf-effects.json"
)
EXPECTED_COUNTS = {"positive": 16, "negative": 14, "other": 6, "total": 36}


def load_official_effect_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "1.0.0":
        raise ValueError("Unsupported official MSF effects catalog schema")
    if payload.get("counts") != EXPECTED_COUNTS:
        raise ValueError("Official MSF effects catalog count mismatch")
    effects = payload.get("effects")
    if not isinstance(effects, list) or len(effects) != EXPECTED_COUNTS["total"]:
        raise ValueError("Official MSF effects catalog must contain exactly 36 effects")
    return payload


def _aliases(effect: dict[str, Any], mechanical_id: str, existing: dict[str, Any]) -> list[str]:
    candidates = [
        *(existing.get("aliases") or []),
        effect["id"],
        effect["name"]["en"],
        effect["name"]["fr"],
        mechanical_id,
    ]
    seen: set[str] = set()
    result: list[str] = []
    for value in candidates:
        normalized = str(value).strip().lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(str(value).strip())
    return result


def apply_official_effect_catalog() -> None:
    """Overlay official effect names/descriptions on the existing presentation map."""

    from . import presentation

    payload = load_official_effect_catalog()
    mapped_ids: set[str] = set()

    for effect in payload["effects"]:
        mechanical_ids = effect.get("mechanicalIds") or []
        for mechanical_id in mechanical_ids:
            if mechanical_id in mapped_ids:
                raise ValueError(f"Duplicate official mapping for mechanical ID {mechanical_id}")
            mapped_ids.add(mechanical_id)
            existing = presentation.EFFECT_PRESENTATIONS.get(mechanical_id, {})
            presentation.EFFECT_PRESENTATIONS[mechanical_id] = {
                **existing,
                "label": effect["name"]["fr"],
                "aliases": _aliases(effect, mechanical_id, existing),
                "terms": [effect["name"]["fr"]],
                "description": effect["description"]["fr"],
            }

    # The official catalog establishes the symmetric pair:
    # LockedBuff -> Safeguard / Sauvegarde and LockedDebuff -> Trauma / Traumatisme.
    # Trauma is therefore no longer text-only once LockedDebuff is mapped explicitly.
    presentation.TEXT_ONLY_MECHANICS.pop("trauma", None)
