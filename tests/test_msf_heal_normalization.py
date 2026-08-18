import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CAPABILITIES = ROOT / "data/msf-capabilities/normalized/capabilities.json"


class HealNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(CAPABILITIES.read_text(encoding="utf-8"))
        cls.mappings = [m for m in cls.data["actionMappings"] if m.get("sourceActionType") == "heal"]
        cls.operations = {o["id"]: o for o in cls.data["operations"]}
        cls.contexts = {c["id"]: c for c in cls.data["contexts"]}

    def test_all_502_heal_actions_are_normalized_once(self):
        self.assertEqual(len(self.mappings), 502)
        self.assertTrue(all(m["status"] == "normalized" for m in self.mappings))
        self.assertTrue(all(len(m["operationIds"]) == 1 for m in self.mappings))
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings]
        self.assertEqual(sum(o["kind"] == "heal_restore" for o in ops), 502)

    def test_heal_metrics_preserve_fixed_percent_and_chance_sources(self):
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings]
        self.assertTrue(any("healAmount" in o["metrics"] for o in ops))
        self.assertTrue(any("sourceMaxHealthPct" in o["metrics"] for o in ops))
        self.assertTrue(any("healAmount" in o["metrics"] and "sourceMaxHealthPct" in o["metrics"] for o in ops))
        chances=[]
        for o in ops:
            metric=o["metrics"].get("chancePct")
            if isinstance(metric,dict):
                chances.append(metric.get("maxLevelValue"))
        self.assertIn(25, chances)
        self.assertIn(50, chances)

    def test_passive_triggers_remain_on_contexts(self):
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings]
        triggers=[]
        for o in ops:
            ctx=self.contexts[o["contextId"]]
            execution=ctx.get("execution") or {}
            raw=execution.get("trigger")
            if isinstance(raw,dict): raw=raw.get("value")
            if isinstance(raw,str): triggers.append(raw)
        self.assertIn("on_turn", triggers)
        self.assertIn("on_death", triggers)
        self.assertIn("below_health", triggers)

    def test_normalization_does_not_invent_missing_targets(self):
        ops=[self.operations[m["operationIds"][0]] for m in self.mappings]
        self.assertTrue(any(isinstance(o.get("target"),dict) and o["target"].get("present") is False for o in ops))


if __name__ == "__main__":
    unittest.main()
