from __future__ import annotations

import unittest

from scripts.msf_capabilities_explorer_builder.presentation import (
    ACTION_PRESENTATIONS,
    EFFECT_PRESENTATIONS,
    METRICS,
    OPERATION_KINDS,
)
from scripts.msf_capabilities_explorer_builder.specific_mechanics import (
    load_specific_mechanics_catalog,
)


class SpecificMechanicsCatalogTests(unittest.TestCase):
    def test_catalog_contains_verified_mappings(self) -> None:
        payload = load_specific_mechanics_catalog()
        mechanics = payload["mechanics"]
        self.assertEqual(len(mechanics), 3)

        by_id = {mechanic["id"]: mechanic for mechanic in mechanics}

        vitality = by_id["vitality"]
        self.assertEqual(vitality["mechanicalIds"], ["Grace"])
        self.assertEqual(vitality["name"]["fr"], "Vitalité")
        self.assertEqual(vitality["name"]["en"], "Vitality")
        self.assertEqual(vitality["scope"], "character_specific")
        self.assertEqual(vitality["characters"], ["Angel"])

        vulnerable = by_id["vulnerable-source-marked"]
        self.assertEqual(vulnerable["mechanicalIds"], ["Marked"])
        self.assertEqual(vulnerable["name"]["fr"], "Vulnérable")
        self.assertEqual(vulnerable["name"]["en"], "Vulnerable")
        self.assertEqual(vulnerable["scope"], "global")

        darkness = by_id["darkness"]
        self.assertEqual(darkness["mechanicalIds"], ["Darkness"])
        self.assertEqual(darkness["name"]["fr"], "Ténèbres")
        self.assertEqual(darkness["name"]["en"], "Darkness")
        self.assertEqual(darkness["scope"], "global")

    def test_verified_player_facing_names_are_applied(self) -> None:
        grace = EFFECT_PRESENTATIONS["Grace"]
        self.assertEqual(grace["label"], "Vitalité")
        self.assertIn("Grace", grace["aliases"])
        self.assertIn("Vitality", grace["aliases"])
        self.assertIn("Vitalité", grace["aliases"])
        self.assertEqual(grace["terms"], ["Vitalité"])

        marked = EFFECT_PRESENTATIONS["Marked"]
        self.assertEqual(marked["label"], "Vulnérable")
        self.assertIn("Marked", marked["aliases"])
        self.assertIn("Vulnerable", marked["aliases"])
        self.assertEqual(marked["terms"], ["Vulnérable"])

        darkness = EFFECT_PRESENTATIONS["Darkness"]
        self.assertEqual(darkness["label"], "Ténèbres")
        self.assertIn("Darkness", darkness["aliases"])
        self.assertEqual(darkness["terms"], ["Ténèbres"])

    def test_verified_global_wording_is_applied(self) -> None:
        self.assertEqual(OPERATION_KINDS["effect_flip"]["label"], "Convertit")
        self.assertEqual(METRICS["flipPct"], "Chance de conversion")
        self.assertEqual(ACTION_PRESENTATIONS["barrier_remove"], "Supprime la Barrière")


if __name__ == "__main__":
    unittest.main()
