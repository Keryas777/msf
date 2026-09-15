from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "scripts/build-war-counter-signatures.py"
CHARACTERS_PATH = ROOT / "docs/data/msf-characters.json"
SIGNATURES_PATH = ROOT / "docs/data/war-counter-vision/portrait-signatures.json"
AKAZE_META_PATH = (
    ROOT / "docs/data/war-counter-vision/akaze-r5-reference-descriptors.json"
)
AKAZE_BIN_PATH = (
    ROOT / "docs/data/war-counter-vision/akaze-r5-reference-descriptors.bin"
)

_spec = importlib.util.spec_from_file_location(
    "build_war_counter_signatures", BUILDER_PATH
)
builder = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(builder)


class WarCounterPlayableCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.characters = json.loads(CHARACTERS_PATH.read_text(encoding="utf-8"))
        cls.by_id = {item["id"]: item for item in cls.characters}
        cls.playable = builder.select_playable(cls.characters)
        cls.playable_ids = [item["id"] for item in cls.playable]
        cls.signatures = json.loads(SIGNATURES_PATH.read_text(encoding="utf-8"))
        cls.akaze = json.loads(AKAZE_META_PATH.read_text(encoding="utf-8"))

    def test_player_character_is_the_only_selection_authority(self):
        self.assertTrue(
            all(
                isinstance(item.get("player_Character"), bool)
                for item in self.characters
            )
        )
        self.assertEqual(
            self.playable_ids,
            [
                item["id"]
                for item in self.characters
                if item["player_Character"] is True
            ],
        )

        shared_portrait = "https://example.invalid/shared.png"
        fixture = [
            {
                "id": "FutureBossLookingId",
                "nameKey": "Future playable",
                "portraitUrl": shared_portrait,
                "player_Character": True,
                "blacklist_mode": 2,
            },
            {
                "id": "FutureNormalLookingId",
                "nameKey": "Future NPC",
                "portraitUrl": shared_portrait,
                "player_Character": False,
                "blacklist_mode": 0,
            },
        ]
        self.assertEqual(
            [item["id"] for item in builder.select_playable(fixture)],
            ["FutureBossLookingId"],
        )

    def test_missing_or_invalid_playable_metadata_fails_closed(self):
        base = {
            "id": "MissingMetadata",
            "nameKey": "Missing metadata",
            "portraitUrl": "https://example.invalid/portrait.png",
        }
        with self.assertRaisesRegex(ValueError, "player_Character"):
            builder.select_playable([base])
        with self.assertRaisesRegex(ValueError, "player_Character"):
            builder.select_playable([{**base, "player_Character": 1}])

    def test_current_catalog_has_exactly_379_playable_characters(self):
        self.assertEqual(len(self.playable_ids), 379)
        self.assertEqual(len(set(self.playable_ids)), 379)

    def test_known_non_playable_units_are_excluded(self):
        excluded = {
            "PVE_Boss_Knull",
            "CarnageKnullSummon",
            "DarkPhoenix",
            "DoomBot",
            "Greg",
            "LokiMinion",
            "MultipleManMinion",
            "MysterioMinion",
            "AimOperator",
            "VampireBlaster",
            "War_ShieldDmg_AoE",
            "GT_HandDmg_Bonus",
            "NUESpiderMan",
            "S_HandDmg_Bonus",
            "UltronDmg_Offense",
            "LivingTribunal",
            "RocketRaccoon_BBMinn",
            "MysteryMan",
        }
        self.assertTrue(excluded.isdisjoint(self.playable_ids))
        self.assertFalse(self.by_id["Greg"]["player_Character"])
        self.assertFalse(self.by_id["VampireBlaster"]["player_Character"])

    def test_knull_survives_its_shared_boss_portrait(self):
        self.assertIn("Knull", self.playable_ids)
        self.assertTrue(self.by_id["Knull"]["player_Character"])
        self.assertFalse(self.by_id["PVE_Boss_Knull"]["player_Character"])
        self.assertEqual(
            self.by_id["Knull"]["portraitUrl"],
            self.by_id["PVE_Boss_Knull"]["portraitUrl"],
        )

    def test_generated_signature_and_akaze_catalogs_are_consistent(self):
        signature_ids = [item["id"] for item in self.signatures["items"]]
        akaze_ids = self.akaze["refIds"]

        self.assertEqual(self.signatures["count"], 379)
        self.assertEqual(self.signatures["failures"], [])
        self.assertEqual(signature_ids, self.playable_ids)
        self.assertEqual(akaze_ids, signature_ids)
        self.assertEqual(self.akaze["referenceCount"], 379)
        self.assertEqual(len(set(akaze_ids)), 379)
        self.assertEqual(len(self.akaze["offsets"]), 380)
        self.assertEqual(
            self.akaze["offsets"][-1],
            self.akaze["descriptorCount"],
        )

        binary_size = AKAZE_BIN_PATH.stat().st_size
        self.assertEqual(binary_size, self.akaze["binaryBytes"])
        self.assertEqual(
            binary_size,
            self.akaze["descriptorCount"] * self.akaze["descriptorCols"],
        )


if __name__ == "__main__":
    unittest.main()
