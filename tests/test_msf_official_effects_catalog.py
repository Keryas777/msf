from __future__ import annotations

import unittest

from scripts.msf_capabilities_explorer_builder.official_effects import (
    EXPECTED_COUNTS,
    load_official_effect_catalog,
)
from scripts.msf_capabilities_explorer_builder.presentation import (
    EFFECT_PRESENTATIONS,
    TEXT_ONLY_MECHANICS,
)


class OfficialEffectsCatalogTests(unittest.TestCase):
    def test_catalog_contains_exact_official_counts(self) -> None:
        payload = load_official_effect_catalog()
        self.assertEqual(payload["counts"], EXPECTED_COUNTS)
        self.assertEqual(len(payload["effects"]), 36)

    def test_known_wrong_french_labels_use_official_names(self) -> None:
        self.assertEqual(EFFECT_PRESENTATIONS["Deathproof"]["label"], "Indestructible")
        self.assertEqual(EFFECT_PRESENTATIONS["BuffBlock"]["label"], "Obstruction")
        self.assertEqual(EFFECT_PRESENTATIONS["AccuracyDown"]["label"], "Aveuglement")
        self.assertEqual(EFFECT_PRESENTATIONS["Exposed"]["label"], "Exposé")
        self.assertEqual(EFFECT_PRESENTATIONS["Exhausted"]["label"], "Épuisé")
        self.assertEqual(
            EFFECT_PRESENTATIONS["Vulnerable"]["label"],
            "Vulnérabilité iso-8",
        )

    def test_locked_debuff_is_official_trauma_mapping(self) -> None:
        self.assertEqual(EFFECT_PRESENTATIONS["LockedBuff"]["label"], "Sauvegarde")
        self.assertEqual(EFFECT_PRESENTATIONS["LockedDebuff"]["label"], "Traumatisme")
        self.assertNotIn("trauma", TEXT_ONLY_MECHANICS)

    def test_other_effects_keep_official_french_names(self) -> None:
        self.assertEqual(EFFECT_PRESENTATIONS["Charged"]["label"], "Chargé")
        self.assertEqual(EFFECT_PRESENTATIONS["ReviveOnce"]["label"], "Ressusciter une fois")


if __name__ == "__main__":
    unittest.main()
