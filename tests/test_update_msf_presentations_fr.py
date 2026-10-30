import json
import tempfile
import unittest
from pathlib import Path

from scripts.update_msf_presentations_fr import (
    PresentationsError, CORE, complete, merge, run,
)


def fixture(cid, *, language="fr", full=True):
    names = ("Frappe française", "Special française", "Ultime française", "Passif français") if language == "fr" else ("Strike", "Special", "Ultimate", "Passive")
    kit = {}
    for typ, name in zip(CORE, names):
        kit[typ] = {"name": name, "icon": "https://assets.marvelstrikeforce.com/imgs/example.png",
                    "levels": {"1": {"description": "Attaque principale et dégâts" if language == "fr" else "Primary attack and damage"}}}
    if not full:
        kit["passive"]["levels"] = {}
    return {"id": cid, "abilityKit": kit}


class ImportTests(unittest.TestCase):
    def test_validated_french_adds_character_without_deleting_old(self):
        old = [fixture("Hero"), fixture("Other")]
        source = [fixture("Hero"), fixture("Other"), fixture("Dracula")]
        merged, report = merge(old, source)
        self.assertEqual([x["id"] for x in merged], ["Dracula", "Hero", "Other"])
        self.assertEqual(report["newCharacters"], 1)

    def test_english_response_rejected(self):
        with self.assertRaisesRegex(PresentationsError, "language"):
            merge([fixture("Hero")], [fixture("Hero", language="en")])

    def test_incomplete_new_character_not_added(self):
        merged, report = merge([fixture("Hero")], [fixture("Hero"), fixture("Dracula", full=False)])
        self.assertEqual(len(merged), 1)
        self.assertEqual(report["incompleteSkipped"], 1)

    def test_coverage_drop_rejected(self):
        with self.assertRaisesRegex(PresentationsError, "coverage"):
            merge([fixture("Hero"), fixture("Other"), fixture("Third"), fixture("Fourth")], [fixture("Hero")])

    def test_incomplete_ability_and_icon_rejected(self):
        row = fixture("Hero")
        self.assertTrue(complete(row))
        row["abilityKit"]["basic"]["icon"] = "http://other.com/a.png"
        self.assertFalse(complete(row))

    def test_no_write_in_default_mode_and_idempotent_apply(self):
        with tempfile.TemporaryDirectory() as tmp:
            target, source = Path(tmp) / "old.json", Path(tmp) / "source.json"
            target.write_text(json.dumps([fixture("Hero")]), encoding="utf8")
            source.write_text(json.dumps([fixture("Hero"), fixture("Dracula")]), encoding="utf8")
            before = target.read_bytes()
            self.assertTrue(run(target, source_file=source)["changed"])
            self.assertEqual(target.read_bytes(), before)
            self.assertTrue(run(target, source_file=source, apply=True)["changed"])
            self.assertFalse(run(target, source_file=source, apply=True)["changed"])


if __name__ == "__main__":
    unittest.main()
