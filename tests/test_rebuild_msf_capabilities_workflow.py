from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/rebuild-msf-capabilities.yml"


class RebuildWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")

    def test_manual_main_checkout_and_serial_execution(self):
        self.assertRegex(self.workflow, r"(?m)^  workflow_dispatch:$")
        self.assertIn("ref: main", self.workflow)
        self.assertIn("fetch-depth: 0", self.workflow)
        self.assertIn("group: rebuild-msf-capabilities", self.workflow)
        self.assertIn("cancel-in-progress: false", self.workflow)
        self.assertIn("contents: write", self.workflow)

    def test_official_commands_are_present_in_pipeline_order(self):
        commands = [
            "python -m scripts.msf_capabilities_parser.cli\n",
            "python -m scripts.msf_capabilities_normalizer.cli\n",
            "python -m scripts.msf_capabilities_indexer.cli\n",
            "python -m scripts.msf_capabilities_web_publisher.cli\n",
            "python -m scripts.msf_capabilities_explorer_builder.cli\n",
        ]
        offsets = [self.workflow.index(command) for command in commands]
        self.assertEqual(offsets, sorted(offsets))
        for module in (
            "msf_capabilities_parser",
            "msf_capabilities_normalizer",
            "msf_capabilities_indexer",
            "msf_capabilities_web_publisher",
            "msf_capabilities_explorer_builder",
        ):
            self.assertIn(f"python -m scripts.{module}.cli --check", self.workflow)

    def test_commit_scope_excludes_sources_and_unsafe_git_operations(self):
        self.assertIn(
            "git add -A -- docs/data/msf-capabilities docs/data/msf-capabilities-explorer",
            self.workflow,
        )
        self.assertNotRegex(self.workflow, r"(?m)^\s*git add \.(?:\s|$)")
        self.assertNotIn("--force", self.workflow)
        self.assertNotIn("data/msf-capabilities/raw", self.workflow)
        self.assertNotIn("source-manifest.json", self.workflow)
        self.assertIn("git pull --rebase origin main", self.workflow)
        self.assertIn("git push origin HEAD:main", self.workflow)

    def test_turn_meter_contract_and_no_node_setup(self):
        for expected in ("540", "323", "205", "12", "97", "44", "20", "33"):
            self.assertRegex(self.workflow, rf"\b{expected}\b")
        for phrase in (
            "augmente jauge",
            "réduit jauge",
            "immunité jauge",
            "bloque jauge",
            "gain provoqué",
        ):
            self.assertIn(phrase, self.workflow)
        self.assertNotIn("setup-node", self.workflow)


if __name__ == "__main__":
    unittest.main()
