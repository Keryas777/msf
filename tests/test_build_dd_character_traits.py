import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_dd_character_traits import build


class DDCharacterTraitsTest(unittest.TestCase):
    def test_uses_complete_official_shard_traits_not_display_card_traits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "docs/data/msf-capabilities-explorer"
            generation = base / "generations/test"
            (generation / "characters").mkdir(parents=True)
            (base / "manifest.json").write_text(json.dumps({
                "currentPath": "generations/test/",
                "currentPayloadSetChecksum": "sha256:verified",
            }), encoding="utf-8")
            records = []
            for index in range(300):
                char_id = f"Hero{index}"
                records.append({"id": char_id, "cardTraits": ["Héros"]})
                (generation / "characters" / f"{char_id}.json").write_text(json.dumps({
                    "character": {
                        "id": char_id, "official": True, "playable": True,
                        "traits": ["City", "Hero", "Legendary"] if index == 0 else ["Global"],
                    }
                }), encoding="utf-8")
            (generation / "characters.json").write_text(
                json.dumps({"records": records}), encoding="utf-8"
            )
            data = build(root)
            self.assertEqual(data["sourcePayloadSetChecksum"], "sha256:verified")
            self.assertEqual(len(data["characters"]), 300)
            self.assertEqual(data["characters"]["Hero0"], ["City", "Hero", "Legendary"])
            self.assertNotIn("Héros", data["characters"]["Hero0"])

    def test_rejects_inconsistent_official_shard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "docs/data/msf-capabilities-explorer"
            generation = base / "g"
            (generation / "characters").mkdir(parents=True)
            (base / "manifest.json").write_text(json.dumps({
                "currentPath": "g/", "currentPayloadSetChecksum": "x"
            }), encoding="utf-8")
            (generation / "characters.json").write_text(
                json.dumps({"records": [{"id": "Hero"}]}), encoding="utf-8"
            )
            (generation / "characters/Hero.json").write_text(json.dumps({
                "character": {"id": "Other", "official": True,
                              "playable": True, "traits": ["City"]}
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ID mismatch"):
                build(root)


if __name__ == "__main__":
    unittest.main()
