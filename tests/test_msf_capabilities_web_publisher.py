from __future__ import annotations

import ast
from contextlib import redirect_stderr, redirect_stdout
import hashlib
from io import StringIO
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock
from urllib.parse import urljoin

from scripts.msf_capabilities_web_publisher import cli
from scripts.msf_capabilities_web_publisher.audit import (
    EXPECTED_ARTIFACT_PATHS,
    INDEX_MANIFEST_PATH,
    PAYLOAD_PATHS,
    build_stable_manifest_bytes,
    compute_payload_set_checksum,
    serialize_json,
    validate_indexed_artifacts,
)
from scripts.msf_capabilities_web_publisher.diagnostics import (
    PublisherAuditError,
    PublisherInputError,
    PublisherStateError,
)
from scripts.msf_capabilities_web_publisher import publisher as publisher_module
from scripts.msf_capabilities_web_publisher.publisher import (
    check_publication,
    inspect_public_state,
    publish,
)


ARTIFACT_TYPES = {
    "abilities.json": "abilities",
    "characters.json": "characters",
    "contexts.json": "contexts",
    "effects.json": "effects",
    "operations.json": "operations",
    "spawns.json": "spawns",
    "uninterpreted-actions.json": "uninterpreted_actions",
}


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, document: dict) -> None:
    path.write_bytes(serialize_json(document))


def _capabilities_checksum(variant: str) -> str:
    return f"sha256:{hashlib.sha256(variant.encode('utf-8')).hexdigest()}"


def _build_source(parent: Path, variant: str = "alpha") -> Path:
    source = parent / f"source-{variant}"
    source.mkdir(parents=True)
    capabilities_checksum = _capabilities_checksum(variant)

    for payload_path in PAYLOAD_PATHS:
        _write_json(
            source / payload_path,
            {
                "artifactType": ARTIFACT_TYPES[payload_path],
                "capabilitiesChecksum": capabilities_checksum,
                "normalizerSchemaVersion": "1.0.0",
                "parserSchemaVersion": "1.0.0",
                "records": [
                    {
                        "id": f"{variant}:{payload_path}",
                        "value": variant,
                    }
                ],
                "schemaVersion": "1.0.0",
            },
        )

    entries = [
        {
            "path": payload_path,
            "sizeBytes": (source / payload_path).stat().st_size,
            "sha256": hashlib.sha256(
                (source / payload_path).read_bytes()
            ).hexdigest(),
        }
        for payload_path in PAYLOAD_PATHS
    ]
    _write_json(
        source / INDEX_MANIFEST_PATH,
        {
            "artifactType": "index_manifest",
            "audit": {
                "general": {"status": "passed"},
                "payloadIntegrity": {
                    "payloadCount": len(PAYLOAD_PATHS),
                    "status": "passed",
                },
                "snapshot": {
                    "applied": True,
                    "requiredChecksum": capabilities_checksum,
                    "status": "passed",
                },
                "status": "passed",
            },
            "capabilitiesChecksum": capabilities_checksum,
            "normalizerSchemaVersion": "1.0.0",
            "parserSchemaVersion": "1.0.0",
            "payloadSetChecksum": (
                f"sha256:{compute_payload_set_checksum(entries)}"
            ),
            "payloads": entries,
            "schemaVersion": "1.0.0",
        },
    )
    (source / "README.md").write_text(
        "Fixture indexer output.\n",
        encoding="utf-8",
    )
    return source


def _refresh_manifest_integrity(source: Path) -> None:
    manifest_path = source / INDEX_MANIFEST_PATH
    manifest = _read_json(manifest_path)
    entries = [
        {
            "path": payload_path,
            "sizeBytes": (source / payload_path).stat().st_size,
            "sha256": hashlib.sha256(
                (source / payload_path).read_bytes()
            ).hexdigest(),
        }
        for payload_path in PAYLOAD_PATHS
    ]
    manifest["payloads"] = entries
    manifest["payloadSetChecksum"] = (
        f"sha256:{compute_payload_set_checksum(entries)}"
    )
    _write_json(manifest_path, manifest)


def _tree_bytes(root: Path) -> dict[str, bytes]:
    if not root.exists():
        return {}
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file() and not path.is_symlink()
    }


def _generation_root(public_root: Path, source: Path) -> Path:
    index = validate_indexed_artifacts(source, allow_readme=True)
    return (
        public_root
        / "indexed"
        / f"sha256-{index.payload_set_hex}"
    )


class WebPublisherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = _build_source(self.root, "alpha")
        self.public_root = self.root / "docs" / "data" / "msf-capabilities"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_01_initial_publication(self) -> None:
        result = publish(self.source, self.public_root)

        self.assertTrue((self.public_root / "manifest.json").is_file())
        self.assertEqual(
            result.current_path,
            f"indexed/sha256-"
            f"{result.payload_set_checksum.removeprefix('sha256:')}/",
        )
        self.assertTrue(
            (self.public_root / result.current_path).is_dir()
        )
        self.assertFalse(result.reused_generation)
        self.assertEqual(result.removed_generation_count, 0)

    def test_02_second_identical_publication(self) -> None:
        publish(self.source, self.public_root)
        first = _tree_bytes(self.public_root)

        result = publish(self.source, self.public_root)

        self.assertTrue(result.reused_generation)
        self.assertEqual(_tree_bytes(self.public_root), first)
        self.assertFalse(
            any(
                path.name.endswith(".tmp")
                for path in self.public_root.rglob("*")
            )
        )

    def test_03_publication_is_deterministic(self) -> None:
        other_public_root = self.root / "other" / "msf-capabilities"

        publish(self.source, self.public_root)
        publish(self.source, other_public_root)

        self.assertEqual(
            _tree_bytes(self.public_root),
            _tree_bytes(other_public_root),
        )

    def test_04_artifacts_are_copied_byte_for_byte(self) -> None:
        result = publish(self.source, self.public_root)
        generation = self.public_root / result.current_path

        for artifact_path in EXPECTED_ARTIFACT_PATHS:
            with self.subTest(artifact_path=artifact_path):
                self.assertEqual(
                    (generation / artifact_path).read_bytes(),
                    (self.source / artifact_path).read_bytes(),
                )

    def test_05_stable_manifest_is_exact(self) -> None:
        source = validate_indexed_artifacts(
            self.source,
            allow_readme=True,
        )
        result = publish(self.source, self.public_root)

        actual = (self.public_root / "manifest.json").read_bytes()
        expected = build_stable_manifest_bytes(source)
        self.assertEqual(actual, expected)
        document = json.loads(actual)
        self.assertEqual(
            set(document),
            {
                "artifactType",
                "capabilitiesChecksum",
                "currentPath",
                "currentPayloadSetChecksum",
                "indexManifest",
                "schemaVersion",
            },
        )
        self.assertEqual(document["currentPath"], result.current_path)
        self.assertEqual(
            document["indexManifest"]["path"],
            "index-manifest.json",
        )

    def test_06_path_uses_actual_payload_set_checksum(self) -> None:
        source = validate_indexed_artifacts(
            self.source,
            allow_readme=True,
        )

        result = publish(self.source, self.public_root)

        self.assertEqual(
            result.current_path,
            f"indexed/sha256-{source.payload_set_hex}/",
        )
        self.assertNotIn("sha256:", result.current_path)

    def test_07_check_does_not_write(self) -> None:
        publish(self.source, self.public_root)
        before = _tree_bytes(self.public_root)
        before_names = sorted(
            path.relative_to(self.public_root).as_posix()
            for path in self.public_root.rglob("*")
        )

        errors = check_publication(self.source, self.public_root)

        after_names = sorted(
            path.relative_to(self.public_root).as_posix()
            for path in self.public_root.rglob("*")
        )
        self.assertEqual(errors, [])
        self.assertEqual(_tree_bytes(self.public_root), before)
        self.assertEqual(after_names, before_names)

    def test_08_check_reports_absent_publication(self) -> None:
        errors = check_publication(self.source, self.public_root)

        self.assertEqual(
            errors,
            [f"publication absente : {self.public_root}"],
        )
        self.assertFalse(self.public_root.exists())

    def test_09_check_accepts_current_publication(self) -> None:
        publish(self.source, self.public_root)

        self.assertEqual(
            check_publication(self.source, self.public_root),
            [],
        )

    def test_10_check_reports_stale_publication(self) -> None:
        publish(self.source, self.public_root)
        new_source = _build_source(self.root, "beta")

        errors = check_publication(new_source, self.public_root)

        self.assertTrue(
            any("manifest public obsolète" in error for error in errors)
        )
        self.assertTrue(
            any("génération publique absente" in error for error in errors)
        )

    def test_11_missing_source_file_is_rejected(self) -> None:
        (self.source / "effects.json").unlink()

        with self.assertRaises(PublisherInputError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "MISSING_INDEXED_ARTIFACT")
        self.assertFalse(self.public_root.exists())

    def test_12_extra_source_file_is_rejected(self) -> None:
        (self.source / "unexpected.json").write_text(
            "{}\n",
            encoding="utf-8",
        )

        with self.assertRaises(PublisherInputError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(
            context.exception.code,
            "UNEXPECTED_INDEXED_ARTIFACT",
        )
        self.assertFalse(self.public_root.exists())

    def test_13_invalid_json_is_rejected(self) -> None:
        (self.source / "contexts.json").write_bytes(b"{broken\n")

        with self.assertRaises(PublisherInputError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "INVALID_INDEXED_JSON")
        self.assertFalse(self.public_root.exists())

    def test_14_duplicate_json_key_is_rejected(self) -> None:
        (self.source / "spawns.json").write_bytes(
            b'{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}\n'
        )

        with self.assertRaises(PublisherInputError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "INVALID_INDEXED_JSON")
        self.assertIn("dupliquée", str(context.exception))

    def test_15_declared_size_mismatch_is_rejected(self) -> None:
        manifest_path = self.source / INDEX_MANIFEST_PATH
        manifest = _read_json(manifest_path)
        manifest["payloads"][0]["sizeBytes"] += 1
        _write_json(manifest_path, manifest)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "PAYLOAD_SIZE_MISMATCH")

    def test_16_declared_checksum_mismatch_is_rejected(self) -> None:
        manifest_path = self.source / INDEX_MANIFEST_PATH
        manifest = _read_json(manifest_path)
        manifest["payloads"][0]["sha256"] = "0" * 64
        _write_json(manifest_path, manifest)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(
            context.exception.code,
            "PAYLOAD_CHECKSUM_MISMATCH",
        )

    def test_17_payload_set_checksum_mismatch_is_rejected(self) -> None:
        manifest_path = self.source / INDEX_MANIFEST_PATH
        manifest = _read_json(manifest_path)
        manifest["payloadSetChecksum"] = f"sha256:{'0' * 64}"
        _write_json(manifest_path, manifest)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(
            context.exception.code,
            "PAYLOAD_SET_CHECKSUM_MISMATCH",
        )

    def test_18_capabilities_checksum_mismatch_is_rejected(self) -> None:
        payload_path = self.source / "abilities.json"
        payload = _read_json(payload_path)
        payload["capabilitiesChecksum"] = f"sha256:{'f' * 64}"
        _write_json(payload_path, payload)
        _refresh_manifest_integrity(self.source)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(
            context.exception.code,
            "CAPABILITIES_CHECKSUM_MISMATCH",
        )

    def test_19_failed_index_audit_is_rejected(self) -> None:
        manifest_path = self.source / INDEX_MANIFEST_PATH
        manifest = _read_json(manifest_path)
        manifest["audit"]["status"] = "failed"
        _write_json(manifest_path, manifest)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "INDEX_AUDIT_NOT_PASSED")

    def test_20_unsupported_payload_schema_is_rejected(self) -> None:
        payload_path = self.source / "operations.json"
        payload = _read_json(payload_path)
        payload["schemaVersion"] = "2.0.0"
        _write_json(payload_path, payload)
        _refresh_manifest_integrity(self.source)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "UNSUPPORTED_INDEX_SCHEMA")

    def test_21_existing_identical_immutable_directory_is_reused(self) -> None:
        target = _generation_root(self.public_root, self.source)
        target.parent.mkdir(parents=True)
        shutil.copytree(
            self.source,
            target,
            ignore=shutil.ignore_patterns("README.md"),
        )

        result = publish(self.source, self.public_root)

        self.assertTrue(result.reused_generation)
        self.assertEqual(check_publication(self.source, self.public_root), [])

    def test_22_existing_different_immutable_directory_is_rejected(self) -> None:
        target = _generation_root(self.public_root, self.source)
        target.parent.mkdir(parents=True)
        shutil.copytree(
            self.source,
            target,
            ignore=shutil.ignore_patterns("README.md"),
        )
        (target / "abilities.json").write_bytes(b"{}\n")

        with self.assertRaises(PublisherStateError):
            publish(self.source, self.public_root)

        self.assertFalse((self.public_root / "manifest.json").exists())

    def test_23_manifest_is_replaced_after_generation_install(self) -> None:
        replacement_destinations: list[Path] = []
        real_replace = publisher_module.os.replace

        def recording_replace(source: Path, destination: Path) -> None:
            replacement_destinations.append(Path(destination))
            real_replace(source, destination)

        with mock.patch.object(
            publisher_module.os,
            "replace",
            side_effect=recording_replace,
        ):
            result = publish(self.source, self.public_root)

        self.assertEqual(
            replacement_destinations[-1],
            self.public_root / "manifest.json",
        )
        generation_destination = self.public_root / result.current_path
        self.assertIn(generation_destination, replacement_destinations[:-1])

    def test_24_interruption_before_manifest_replacement_preserves_old_state(
        self,
    ) -> None:
        publish(self.source, self.public_root)
        old_tree = _tree_bytes(self.public_root)
        new_source = _build_source(self.root, "beta")

        with mock.patch.object(
            publisher_module,
            "_replace_manifest_atomically",
            side_effect=OSError("simulated interruption"),
        ):
            with self.assertRaises(OSError):
                publish(new_source, self.public_root)

        self.assertEqual(_tree_bytes(self.public_root), old_tree)
        self.assertEqual(check_publication(self.source, self.public_root), [])

    def test_25_old_generation_is_preserved_after_switch(self) -> None:
        first = publish(self.source, self.public_root)
        old_generation = self.public_root / first.current_path
        new_source = _build_source(self.root, "beta")

        second = publish(new_source, self.public_root)

        self.assertTrue(old_generation.exists())
        self.assertTrue((self.public_root / second.current_path).is_dir())
        self.assertEqual(second.removed_generation_count, 0)

    def test_26_current_generation_is_preserved_during_retention(self) -> None:
        result = publish(self.source, self.public_root)
        generation = self.public_root / result.current_path
        before = _tree_bytes(generation)

        publish(self.source, self.public_root)

        self.assertTrue(generation.is_dir())
        self.assertEqual(_tree_bytes(generation), before)

    def test_27_unknown_public_directory_is_refused(self) -> None:
        publish(self.source, self.public_root)
        before = _tree_bytes(self.public_root)
        unknown = self.public_root / "indexed" / "keep-me"
        unknown.mkdir()

        with self.assertRaises(PublisherStateError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(context.exception.code, "UNKNOWN_PUBLIC_GENERATION")
        self.assertTrue(unknown.is_dir())
        self.assertEqual(
            {
                key: value
                for key, value in _tree_bytes(self.public_root).items()
                if not key.startswith("indexed/keep-me/")
            },
            before,
        )

    def test_28_path_traversal_in_payload_inventory_is_refused(self) -> None:
        manifest_path = self.source / INDEX_MANIFEST_PATH
        manifest = _read_json(manifest_path)
        manifest["payloads"][0]["path"] = "../abilities.json"
        _write_json(manifest_path, manifest)

        with self.assertRaises(PublisherAuditError) as context:
            publish(self.source, self.public_root)

        self.assertIn(
            context.exception.code,
            {"UNSAFE_PAYLOAD_PATH", "INVALID_PAYLOAD_INVENTORY"},
        )
        self.assertFalse(self.public_root.exists())

    def test_29_upstream_json_files_are_never_published(self) -> None:
        result = publish(self.source, self.public_root)

        for forbidden_name in ("mechanics.json", "capabilities.json"):
            with self.subTest(forbidden_name=forbidden_name):
                self.assertFalse(
                    any(
                        path.name == forbidden_name
                        for path in self.public_root.rglob("*")
                    )
                )
                self.assertNotIn(
                    forbidden_name,
                    [
                        path.name
                        for path in publisher_module.public_artifact_paths(
                            result
                        )
                    ],
                )

    def test_31_publisher_has_no_external_dependency(self) -> None:
        package_root = (
            Path(__file__).parents[1]
            / "scripts"
            / "msf_capabilities_web_publisher"
        )
        allowed_standard_roots = {
            "__future__",
            "argparse",
            "dataclasses",
            "hashlib",
            "json",
            "os",
            "pathlib",
            "re",
            "shutil",
            "tempfile",
            "typing",
        }
        forbidden_upstream_modules = {
            "scripts.msf_capabilities_parser",
            "scripts.msf_capabilities_normalizer",
            "scripts.msf_capabilities_indexer",
        }
        for path in sorted(package_root.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imported = {alias.name.split(".", 1)[0] for alias in node.names}
                    self.assertLessEqual(imported, allowed_standard_roots)
                    self.assertTrue(
                        forbidden_upstream_modules.isdisjoint(
                            alias.name for alias in node.names
                        )
                    )
                if isinstance(node, ast.ImportFrom) and node.level == 0:
                    self.assertIn(
                        (node.module or "").split(".", 1)[0],
                        allowed_standard_roots,
                    )
                    self.assertNotIn(
                        node.module,
                        forbidden_upstream_modules,
                    )

    def test_32_manifest_paths_preserve_github_pages_subpath(self) -> None:
        publish(self.source, self.public_root)
        manifest = _read_json(self.public_root / "manifest.json")
        base_url = (
            "https://keryas777.github.io/msf/data/msf-capabilities/"
        )

        current_url = urljoin(base_url, manifest["currentPath"])
        index_url = urljoin(
            current_url,
            manifest["indexManifest"]["path"],
        )

        self.assertIn("/msf/data/msf-capabilities/indexed/", index_url)
        self.assertTrue(index_url.endswith("/index-manifest.json"))

    def test_33_cli_exit_codes_are_stable(self) -> None:
        stdout = StringIO()
        stderr = StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            with mock.patch.object(
                cli,
                "DEFAULT_SOURCE_DIRECTORY",
                self.source,
            ), mock.patch.object(
                cli,
                "DEFAULT_PUBLIC_ROOT",
                self.public_root,
            ):
                self.assertEqual(cli.main(["--check"]), 1)
                self.assertEqual(cli.main([]), 0)
                self.assertEqual(cli.main(["--check"]), 0)

            missing = self.root / "missing"
            with mock.patch.object(
                cli,
                "DEFAULT_SOURCE_DIRECTORY",
                missing,
            ), mock.patch.object(
                cli,
                "DEFAULT_PUBLIC_ROOT",
                self.public_root,
            ):
                self.assertEqual(cli.main([]), 2)

            invalid_source = _build_source(self.root, "invalid-audit")
            manifest_path = invalid_source / INDEX_MANIFEST_PATH
            manifest = _read_json(manifest_path)
            manifest["audit"]["status"] = "failed"
            _write_json(manifest_path, manifest)
            with mock.patch.object(
                cli,
                "DEFAULT_SOURCE_DIRECTORY",
                invalid_source,
            ), mock.patch.object(
                cli,
                "DEFAULT_PUBLIC_ROOT",
                self.public_root,
            ):
                self.assertEqual(cli.main([]), 3)

        self.assertIn("WEB_PUBLICATION_CHECK_FAILED", stderr.getvalue())
        self.assertIn("Publication Web MSF générée", stdout.getvalue())

    def test_34_source_symlink_is_refused(self) -> None:
        target = self.root / "abilities-real.json"
        shutil.copy2(self.source / "abilities.json", target)
        (self.source / "abilities.json").unlink()
        try:
            (self.source / "abilities.json").symlink_to(target)
        except OSError as error:
            self.skipTest(f"symlink unavailable: {error}")

        with self.assertRaises(PublisherInputError) as context:
            publish(self.source, self.public_root)

        self.assertEqual(
            context.exception.code,
            "INDEXED_SYMLINK_FORBIDDEN",
        )

    def test_35_invalid_old_generation_blocks_before_write(self) -> None:
        result = publish(self.source, self.public_root)
        before = _tree_bytes(self.public_root)
        invalid = self.public_root / "indexed" / f"sha256-{'0' * 64}"
        shutil.copytree(
            self.public_root / result.current_path,
            invalid,
        )

        with self.assertRaises(PublisherStateError):
            publish(self.source, self.public_root)

        self.assertTrue(invalid.exists())
        self.assertEqual(
            {
                key: value
                for key, value in _tree_bytes(self.public_root).items()
                if not key.startswith(f"indexed/sha256-{'0' * 64}/")
            },
            before,
        )

    def test_36_stable_manifest_root_schema_is_strict(self) -> None:
        publish(self.source, self.public_root)
        manifest_path = self.public_root / "manifest.json"
        manifest = _read_json(manifest_path)
        manifest["unexpected"] = True
        _write_json(manifest_path, manifest)

        with self.assertRaises(PublisherStateError) as context:
            inspect_public_state(self.public_root)

        self.assertEqual(context.exception.code, "INVALID_PUBLIC_MANIFEST")


class RealIndexSnapshotTests(unittest.TestCase):
    def test_real_index_manifest_produces_known_web_manifest(self) -> None:
        source = Path("data/msf-capabilities/indexed")
        if not (source / INDEX_MANIFEST_PATH).exists():
            self.skipTest("real generated index artifacts are absent")

        index = validate_indexed_artifacts(source, allow_readme=True)
        payload = build_stable_manifest_bytes(index)

        self.assertEqual(
            index.payload_set_checksum,
            "sha256:2ff662a4088d4d69f4329d161fbe770f3e45ff6bf6e760b21e74cdb7d266c624",
        )
        self.assertEqual(len(payload), 512)
        self.assertEqual(
            hashlib.sha256(payload).hexdigest(),
            "b042384c1d286e24a6cb16c2407a0bd3477e65220765b3b8c26a7c7474da0dd9",
        )


if __name__ == "__main__":
    unittest.main()
