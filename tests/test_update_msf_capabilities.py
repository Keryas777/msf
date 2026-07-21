from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from urllib.error import HTTPError

from scripts import update_msf_capabilities as pipeline


class FakeResponse:
    def __init__(self, url: str, payload: bytes):
        self.status = 200
        self.headers = {"Content-Length": str(len(payload))}
        self._url = url
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self) -> str:
        return self._url

    def read(self, amount: int = -1) -> bytes:
        return self._payload if amount < 0 else self._payload[:amount]


class FakeOpener:
    def __init__(self, payloads: dict[str, bytes]):
        self.payloads = payloads
        self.calls: list[str] = []

    def __call__(self, request, *, timeout: float):
        self.calls.append(request.full_url)
        if request.full_url not in self.payloads:
            raise HTTPError(request.full_url, 404, "Not Found", {}, None)
        return FakeResponse(request.full_url, self.payloads[request.full_url])


def make_payloads(version: str) -> tuple[dict[str, bytes], list[tuple[str, str]]]:
    payloads: dict[str, bytes] = {}
    rows: list[tuple[str, str]] = []

    for resource_id, filename in pipeline.EXPECTED_RESOURCES.items():
        name = Path(filename).stem
        data = [] if filename == "places.json" else {"fixture": name}
        payload = json.dumps(
            {"Name": name, "Data": data, "ForceImportVersion": 2},
            separators=(",", ":"),
        ).encode("utf-8")
        resource_hash = hashlib.md5(payload).hexdigest()
        entry = pipeline.CatalogEntry(resource_id, filename, resource_hash)
        url = pipeline.build_resource_url(pipeline.CDN_BASE_URL, version, entry)
        payloads[url] = payload
        rows.append((resource_id, resource_hash))

    return payloads, rows


def create_database(path: Path, rows: list[tuple[str, str]]) -> None:
    with sqlite3.connect(path) as database:
        database.execute(
            "CREATE TABLE RemoteAssetClientEntry ("
            "id varchar primary key not null, path varchar, type integer, "
            "hash varchar, status varchar, url varchar)"
        )
        database.executemany(
            "INSERT INTO RemoteAssetClientEntry "
            "(id, path, type, hash, status, url) VALUES (?, '', NULL, ?, 'local', NULL)",
            rows,
        )


class UpdateMsfCapabilitiesTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.version = "10_3_0"
        self.payloads, self.rows = make_payloads(self.version)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def run_pipeline(self, database_path: Path, opener: FakeOpener, updated_at: str):
        return pipeline.update_sources(
            database_path=database_path,
            game_version=self.version,
            game_build="1654625",
            output_directory=self.root / "data/msf-capabilities/raw",
            manifest_path=self.root / "data/msf-capabilities/source-manifest.json",
            updated_at=updated_at,
            opener=opener,
        )

    def test_accepts_numbered_filename_and_preserves_unchanged_outputs(self):
        database_path = self.root / "combat_data (42).db"
        create_database(database_path, self.rows)

        first = self.run_pipeline(
            database_path,
            FakeOpener(self.payloads),
            "2026-07-21T12:00:00Z",
        )
        manifest_path = first.manifest_path
        original_manifest = manifest_path.read_bytes()

        second = self.run_pipeline(
            database_path,
            FakeOpener({}),
            "2026-07-22T12:00:00Z",
        )

        self.assertTrue(first.changed)
        self.assertFalse(second.changed)
        self.assertEqual(original_manifest, manifest_path.read_bytes())
        self.assertEqual(first.resource_count, 11)
        self.assertEqual(
            len(list((self.root / "data/msf-capabilities/raw").glob("*.json"))),
            11,
        )

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["updatedAt"], "2026-07-21T12:00:00Z")
        self.assertEqual(manifest["game"], {"version": "10_3_0", "build": "1654625"})
        self.assertEqual(manifest["catalog"]["resourceCount"], 11)

    def test_finds_unchanged_sources_in_an_older_cdn_version(self):
        database_path = self.root / "combat_data (3).db"
        create_database(database_path, self.rows)
        older_payloads = {}

        for current_url, payload in self.payloads.items():
            older_payloads[current_url.replace("/10_3_0/", "/10_2_1/")] = payload

        opener = FakeOpener(older_payloads)
        result = self.run_pipeline(
            database_path,
            opener,
            "2026-07-21T12:00:00Z",
        )

        self.assertTrue(result.changed)
        manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
        self.assertTrue(
            all(
                resource["sourceGameVersion"] == "10_2_1"
                for resource in manifest["resources"]
            )
        )
        self.assertGreater(len(opener.calls), 11)

    def test_md5_mismatch_does_not_publish_partial_outputs(self):
        database_path = self.root / "combat_data.db"
        create_database(database_path, self.rows)
        bad_payloads = dict(self.payloads)
        first_url = next(iter(bad_payloads))
        bad_payloads[first_url] += b"tampered"

        with self.assertRaisesRegex(pipeline.PipelineError, "MD5 mismatch"):
            self.run_pipeline(
                database_path,
                FakeOpener(bad_payloads),
                "2026-07-21T12:00:00Z",
            )

        self.assertFalse((self.root / "data/msf-capabilities/raw").exists())
        self.assertFalse(
            (self.root / "data/msf-capabilities/source-manifest.json").exists()
        )

    def test_catalog_must_match_the_exact_allowlist(self):
        database_path = self.root / "combat_data (2).db"
        create_database(database_path, self.rows[:-1])
        opener = FakeOpener(self.payloads)

        with self.assertRaisesRegex(pipeline.PipelineError, "missing"):
            self.run_pipeline(
                database_path,
                opener,
                "2026-07-21T12:00:00Z",
            )

        self.assertEqual(opener.calls, [])


if __name__ == "__main__":
    unittest.main()
