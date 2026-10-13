"""Offline tests for the MagneticZero-first updater, without real HTTP requests."""
from __future__ import annotations

import hashlib
from html import escape
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import update_msf_magneticzero as updater
from scripts.probe_magneticzero import FILES


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class MagneticZeroUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.raw = root / "data/msf-capabilities/raw"
        self.raw.mkdir(parents=True)
        self.manifest = root / "data/msf-capabilities/source-manifest.json"
        self.entries = []
        self.remote = {}
        self.previous = {}
        for filename in FILES:
            name = filename[:-5]
            data = [] if filename == "places.json" else {"before": {"value": 1}}
            doc = {"Name": name, "ForceImportVersion": 2, "Data": data}
            payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            (self.raw / filename).write_bytes(payload)
            self.entries.append({
                "id": f"combat_data/{filename}",
                "file": f"raw/{filename}",
                "url": None,
                "sourceGameVersion": "10_6_0",
                "md5": hashlib.md5(payload).hexdigest(),
                "sha256": digest(payload),
                "sizeBytes": len(payload),
            })
            self.previous[filename] = doc
            self.remote[filename] = json.loads(json.dumps(doc))
        self.manifest.write_text(json.dumps({
            "schemaVersion": 1, "updatedAt": "2026-10-08T08:12:45Z",
            "game": {"version": "10_6_3", "build": "1674780"},
            "catalog": {"table": "RemoteAssetClientEntry", "resourceCount": 11},
            "resources": self.entries
        }), encoding="utf-8")

    def snapshot_sha(self, doc):
        return digest((json.dumps(doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    def response(self, url):
        for filename in FILES:
            revision = self.snapshot_sha(self.remote[filename])
            old_revision = self.snapshot_sha(self.previous[filename])
            listing = f"/file/combat_data/{filename}"
            if url.endswith(listing):
                return (f'<a href="/view/combat_data/{filename}/{revision}">current</a>'
                        f'<a href="/view/combat_data/{filename}/{old_revision}">older</a>')
            if url.endswith(f"/view/combat_data/{filename}/{revision}"):
                formatted = json.dumps(self.remote[filename], ensure_ascii=False, indent=2) + "\n"
                return "<pre>" + escape(formatted) + "</pre>"
        raise AssertionError(f"unexpected URL: {url}")

    def run_with_fake_site(self, *, apply):
        with patch.object(updater, "fetch_page", side_effect=self.response):
            return updater.run(self.raw, self.manifest, apply=apply, current_time="2026-10-13T12:00:00Z")

    def test_dry_run_never_changes_files(self):
        self.remote["missiontraits.json"]["Data"]["TowerChallenger3"] = {"flags": []}
        old = self.manifest.read_bytes()
        result = self.run_with_fake_site(apply=False)
        self.assertTrue(result["changed"])
        self.assertEqual(result["differentFiles"], ["missiontraits.json"])
        self.assertEqual(self.manifest.read_bytes(), old)
        self.assertEqual((self.raw / "missiontraits.json").read_bytes(), 
                         json.dumps(self.previous["missiontraits.json"], separators=(",", ":")).encode())

    def test_apply_stages_all_files_and_is_idempotent(self):
        self.remote["missiontraits.json"]["Data"]["TowerChallenger3"] = {"flags": []}
        first = self.run_with_fake_site(apply=True)
        self.assertTrue(first["changed"])
        updated = json.loads(self.manifest.read_text())
        self.assertEqual(updated["catalog"]["source"], "magneticzero")
        self.assertFalse(updated["game"]["versionVerified"])
        self.assertEqual(updated["game"]["version"], "10_6_3")
        self.assertEqual(len(updated["resources"]), 11)
        self.assertEqual(len(json.loads((self.raw / "missiontraits.json").read_text())["Data"]), 2)
        self.assertEqual(updated["updatedAt"], "2026-10-13T12:00:00Z")
        second = self.run_with_fake_site(apply=True)
        self.assertFalse(second["changed"])
        self.assertEqual(json.loads(self.manifest.read_text()), updated)

    def test_bad_remote_hash_aborts_without_writing(self):
        old_manifest = self.manifest.read_bytes()
        old_content = (self.raw / "characters.json").read_bytes()
        self.remote["characters.json"]["Data"]["new"] = {"x":1}
        def corrupt(url):
            html = self.response(url)
            if "/view/combat_data/characters.json/" in url:
                return html.replace("new", "tampered")
            return html
        with patch.object(updater, "fetch_page", side_effect=corrupt):
            with self.assertRaises(Exception):
                updater.run(self.raw, self.manifest, apply=True)
        self.assertEqual(self.manifest.read_bytes(), old_manifest)
        self.assertEqual((self.raw / "characters.json").read_bytes(), old_content)

    def test_refuse_previous_revision_rollback(self):
        self.run_with_fake_site(apply=True)
        self.previous["procs.json"]["Data"]["older"] = 17
        # The last imported revision is absent from the new page history:
        with patch.object(updater, "fetch_page", side_effect=self.response):
            with self.assertRaisesRegex(Exception, "refusing rollback"):
                updater.run(self.raw, self.manifest, apply=True)

    def test_manifest_corruption_aborts_without_network(self):
        (self.raw / "characters.json").write_text("{}")
        with patch.object(updater, "fetch_page", side_effect=AssertionError("network should not be reached")):
            with self.assertRaisesRegex(Exception, "differs from its recorded hashes"):
                updater.run(self.raw, self.manifest, apply=True)


if __name__ == "__main__":
    unittest.main()
