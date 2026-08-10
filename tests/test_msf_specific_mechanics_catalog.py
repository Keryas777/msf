from __future__ import annotations

import unittest

from scripts.msf_capabilities_explorer_builder.presentation import EFFECT_PRESENTATIONS
from scripts.msf_capabilities_explorer_builder.specific_mechanics import (
    load_specific_mechanics_catalog,
)


class SpecificMechanicsCatalogTests(unittest.TestCase):
    def test_catalog_contains_verified_grace_mapping(self) -> None:
        payload = load_specific_mechanics_catalog()
        mechanics = payload["mechanics"]
        self.assertEqual(len(mechanics), 1)
        vitality = mechanics[0]
        self.assertEqual(vitality["id"], "vitality")
        self.assertEqual(vitality["mechanicalIds"], ["Grace"])
        self.assertEqual(vitality["name"]["fr"], "Vitalité")
        self.assertEqual(vitality["scope"], "character_specific")
        self.assertEqual(vitality["characters"], ["Angel"])

    def test_grace_uses_verified_player_facing_name(self) -> None:
        presentation = EFFECT_PRESENTATIONS["Grace"]
        self.assertEqual(presentation["label"], "Vitalité")
        self.assertIn("Grace", presentation["aliases"])
        self.assertIn("Vitalité", presentation["aliases"])
        self.assertEqual(presentation["terms"], ["Vitalité"])


if __name__ == "__main__":
    unittest.main()
