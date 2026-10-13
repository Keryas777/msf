"""Offline tests for MagneticZero read-only HTML probe."""
import hashlib
import json
import unittest
from scripts.probe_magneticzero import ProbeError, latest, extract, compare

class ProbeTests(unittest.TestCase):
    def test_latest_rejects_foreign_host_and_wrong_file(self):
        a, b = 'a'*64, 'b'*64
        html = ('<a href="https://evil.test/view/combat_data/procs.json/'+a+'">fake</a>'
                '<a href="/view/combat_data/characters.json/'+a+'">wrong</a>'
                '<a href="/view/combat_data/procs.json/'+b+'">correct</a>')
        self.assertEqual(latest(html,'procs.json'),(b,'https://msf-datamines.magneticzero.dev/view/combat_data/procs.json/'+b))

    def test_latest_missing_revision(self):
        with self.assertRaises(ProbeError):
            latest('<a href="/view/combat_data/procs.json/not-sha">view</a>','procs.json')

    def test_html_entities_and_hash(self):
        doc = {'Data':{'x':'A&B'},'ForceImportVersion':2,'Name':'procs'}
        formatted = json.dumps(doc,ensure_ascii=False,indent=2)+'\n'
        sha = hashlib.sha256(formatted.encode()).hexdigest()
        html = '<pre>'+formatted.replace('&','&amp;').replace('"','&quot;')+'</pre>'
        self.assertEqual(extract(html,'procs',sha),doc)
        with self.assertRaises(ProbeError):
            extract(html,'procs','0'*64)

    def test_semantic_comparison_ignores_order(self):
        local = {'Name':'procs','ForceImportVersion':2,'Data':{'x':1,'y':2}}
        remote = {'Data':{'y':2,'x':1},'ForceImportVersion':2,'Name':'procs'}
        self.assertTrue(compare(local,remote)['semanticallyIdentical'])
        remote['Data']['z'] = 3
        self.assertEqual(compare(local,remote)['addedCount'],1)

if __name__ == '__main__':
    unittest.main()
