import unittest
from scripts.audit_msf_playable_presentations import audit

class AuditTests(unittest.TestCase):
    def test_dracula_missing_source_is_reported_without_fabrication(self):
        report=audit([{"id":"Dracula","player_Character":True}],[],{"Dracula":{"character":{"id":"Dracula","playable":False},"abilities":[{"id":"a"+str(i),"type":t,"baseType":t,"name":t,"iconUrl":None,"maxLevel":None,"officialText":None} for i,t in enumerate(("basic","special","ultimate","passive"))]}},"2026-10-30T00:00:00Z")
        self.assertEqual(report["summary"]["sourceAbsentAbilities"],4)
        self.assertEqual([a["status"] for a in report["characters"][0]["abilities"]],["source_absent"]*4)
        self.assertTrue(all(a["publication"]["missingFields"] for a in report["characters"][0]["abilities"]))
    def test_source_present_but_artifacts_absent_is_integration_failure(self):
        kit={t:{"name":t,"icon":"https://assets.test/a.png","levels":{"7":{"description":"texte officiel"}}} for t in ("basic","special","ultimate","passive")}
        report=audit([{"id":"Hero","player_Character":True}],[{"id":"Hero","abilityKit":kit}],{},"2026-10-30T00:00:00Z")
        self.assertEqual(report["summary"]["publicationIncompleteAbilities"],4)
    def test_nonplayable_is_ignored(self):
        report=audit([{"id":"NPC","player_Character":False}],[],{},"2026-10-30T00:00:00Z")
        self.assertEqual(report["characters"],[])
if __name__=="__main__": unittest.main()
