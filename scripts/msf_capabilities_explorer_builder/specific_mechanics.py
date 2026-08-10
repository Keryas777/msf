"""Load verified non-standard MSF mechanics into Codex presentation data.

These mappings complement the global official effects catalog. They preserve the
mechanical source ID and only replace the player-facing presentation when an
explicit official-game correspondence has been manually verified.
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
    / "msf-specific-mechanics.json"
)


def load_specific_mechanics_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "1.0.0":
        raise ValueError("Unsupported specific MSF mechanics catalog schema")
    mechanics = payload.get("mechanics")
    if not isinstance(mechanics, list):
        raise ValueError("Specific MSF mechanics catalog must contain a mechanics list")
    return payload


def _aliases(mechanic: dict[str, Any], mechanical_id: str, existing: dict[str, Any]) -> list[str]:
    names = mechanic.get("name") or {}
    candidates = [
        *(existing.get("aliases") or []),
        mechanic.get("id"),
        names.get("en"),
        names.get("fr"),
        mechanical_id,
    ]
    seen: set[str] = set()
    result: list[str] = []
    for value in candidates:
        if value is None:
            continue
        text = str(value).strip()
        normalized = text.lower()
        if text and normalized not in seen:
            seen.add(normalized)
            result.append(text)
    return result


def _apply_verified_operation_labels(presentation: Any) -> None:
    """Apply verified global player-facing wording without changing mechanics."""

    presentation.OPERATION_KINDS["effect_flip"]["label"] = "Convertit"
    presentation.METRICS["flipPct"] = "Chance de conversion"
    presentation.ACTION_PRESENTATIONS["barrier_remove"] = "Supprime la Barrière"


def apply_specific_mechanics_catalog() -> None:
    """Overlay verified player-facing names on non-standard structured mechanics."""

    from . import presentation

    _apply_verified_operation_labels(presentation)

    payload = load_specific_mechanics_catalog()
    mapped_ids: set[str] = set()

    for mechanic in payload["mechanics"]:
        mechanical_ids = mechanic.get("mechanicalIds") or []
        if not mechanical_ids:
            raise ValueError(f"Specific mechanic {mechanic.get('id')} has no mechanical IDs")

        names = mechanic.get("name") or {}
        label = names.get("fr") or names.get("en")
        if not label:
            raise ValueError(f"Specific mechanic {mechanic.get('id')} has no player-facing name")

        descriptions = mechanic.get("description") or {}
        description = descriptions.get("fr") or descriptions.get("en")
        canonical_effect_id = mechanic.get("canonicalEffectId")

        for mechanical_id in mechanical_ids:
            if mechanical_id in mapped_ids:
                raise ValueError(f"Duplicate specific mapping for mechanical ID {mechanical_id}")
            mapped_ids.add(mechanical_id)

            existing = presentation.EFFECT_PRESENTATIONS.get(mechanical_id, {})
            overlay = {
                **existing,
                "label": label,
                "aliases": _aliases(mechanic, mechanical_id, existing),
                "terms": [label],
            }
            if canonical_effect_id:
                overlay["canonicalEffectId"] = canonical_effect_id
            if description:
                overlay["description"] = description

            presentation.EFFECT_PRESENTATIONS[mechanical_id] = overlay
