import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAPABILITIES = ROOT / "data/msf-capabilities/normalized/capabilities.json"

class BarrierNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads(CAPABILITIES.read_text(encoding="utf-8"))
        cls.mappings=[m for m in cls.data["actionMappings"] if m.get("sourceActionType") in {"barrier","barrier_remove"}]
        cls.operations={o["id"]:o for o in cls.data["operations"]}
        cls.contexts={c["id"]:c for c in cls.data["contexts"]}

    def test_all_barrier_actions_are_normalized_once(self):
        self.assertGreaterEqual(len(self.mappings), 288)
        self.assertTrue(all(m["status"] == "normalized" for m in self.mappings))
        self.assertTrue(all(len(m["operationIds"]) == 1 for m in self.mappings))
        kinds=[self.operations[m["operationIds"][0]]["kind"] for m in self.mappings]
        self.assertIn("barrier_apply",kinds)
        self.assertIn("barrier_remove",kinds)

    def test_apply_preserves_health_pct_without_inventing_basis(self):
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings if m.get("sourceActionType") == "barrier"]
        self.assertTrue(any("barrierHealthPct" in o.get("metrics",{}) for o in ops))
        self.assertTrue(all(o.get("semantic",{}).get("healthBasis") == "unresolved" for o in ops))

    def test_remove_without_amnt_is_explicitly_marked_full_removal(self):
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings if m.get("sourceActionType") == "barrier_remove"]
        implicit=[o for o in ops if "amnt" not in o.get("rawParameters",{})]
        self.assertGreater(len(implicit),0)
        self.assertTrue(all(o.get("semantic") == {"fullRemoval": True, "amountImplicit": True} for o in implicit))
        explicit=[o for o in ops if "amnt" in o.get("rawParameters",{})]
        self.assertTrue(all("barrierRemovePct" in o.get("metrics",{}) for o in explicit))

    def test_context_triggers_and_missing_targets_are_preserved(self):
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings]
        triggers=[]
        for o in ops:
            ctx=self.contexts.get(o.get("contextId"),{})
            raw=(ctx.get("execution") or {}).get("trigger")
            if isinstance(raw,dict): raw=raw.get("value")
            if isinstance(raw,str): triggers.append(raw)
        self.assertIn("on_turn",triggers)
        self.assertTrue(any(o.get("target",{}).get("present") is False for o in ops))

if __name__ == "__main__": unittest.main()
