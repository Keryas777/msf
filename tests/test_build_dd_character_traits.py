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

    def test_accepts_explicit_official_status_for_playable_character(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "docs/data/msf-capabilities-explorer"
            generation = base / "g"
            (generation / "characters").mkdir(parents=True)
            (base / "manifest.json").write_text(json.dumps({
                "currentPath": "g/", "currentPayloadSetChecksum": "verified",
            }), encoding="utf-8")
            records = [{"id": f"Hero{i}"} for i in range(300)]
            records.append({"id": "Destroyer"})
            (generation / "characters.json").write_text(
                json.dumps({"records": records}), encoding="utf-8"
            )
            for i in range(300):
                (generation / "characters" / f"Hero{i}.json").write_text(
                    json.dumps({"character": {
                        "id": f"Hero{i}", "official": True,
                        "playable": True, "traits": ["Global"],
                    }}), encoding="utf-8"
                )
            (generation / "characters/Destroyer.json").write_text(
                json.dumps({"character": {
                    "id": "Destroyer", "official": False,
                    "status": {"kind": "official"}, "playable": True,
                    "traits": ["Asgard", "Brawler", "Cosmic", "Mystic", "Villain"],
                }}), encoding="utf-8"
            )
            result = build(root)
            self.assertEqual(result["characters"]["Destroyer"],
                             ["Asgard", "Brawler", "Cosmic", "Mystic", "Villain"])

    def test_merges_official_event_traits_without_dropping_base_traits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "docs/data/msf-capabilities-explorer"
            generation = base / "g"
            (generation / "characters").mkdir(parents=True)
            (base / "manifest.json").write_text(json.dumps({
                "currentPath": "g", "currentPayloadSetChecksum": "verified",
            }), encoding="utf-8")
            records = [{"id": f"Hero{i}"} for i in range(300)]
            (generation / "characters.json").write_text(
                json.dumps({"records": records}), encoding="utf-8")
            for i in range(300):
                (generation / "characters" / f"Hero{i}.json").write_text(
                    json.dumps({"character": {
                        "id": f"Hero{i}", "official": True,
                        "playable": True, "traits": ["Cosmic"],
                    }}), encoding="utf-8")
            event_path = root / "docs/data/dd-event-character-traits.json"
            event_path.parent.mkdir(parents=True, exist_ok=True)
            event_path.write_text(json.dumps({
                "schemaVersion": 1,
                "characters": {"Hero0": ["Conqueror", "Harbingers"],
                               "NotInCodex": ["Conqueror"]},
            }), encoding="utf-8")
            result = build(root)
            self.assertEqual(result["characters"]["Hero0"],
                             ["Conqueror", "Cosmic", "Harbingers"])
            self.assertEqual(result["characters"]["Hero1"], ["Cosmic"])
            self.assertNotIn("NotInCodex", result["characters"])

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
