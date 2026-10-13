"""Offline tests for MagneticZero read-only HTML probe."""
import hashlib
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from scripts.probe_magneticzero import FILES, ProbeError, latest, extract, compare, probe

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

    def test_complete_official_source_inventory(self):
        self.assertEqual(len(FILES),11)
        self.assertEqual(len(set(FILES)),11)
        self.assertIn('places.json',FILES)
        self.assertIn('overpower_bonuses.json',FILES)

    def test_nested_content_difference_not_hidden_by_identical_ids(self):
        local = {'Name':'procs','ForceImportVersion':2,'Data':{'A':{'effects':[1,2]}}}
        remote = {'Name':'procs','ForceImportVersion':2,'Data':{'A':{'effects':[1,3]}}}
        report = compare(local,remote)
        self.assertFalse(report['semanticallyIdentical'])
        self.assertEqual(report['changedCount'],1)
        self.assertEqual(report['sampleChangedIds'],['A'])

    def test_manifest_hash_mismatch_is_blocking(self):
        doc = {'Name':'procs','ForceImportVersion':2,'Data':{'A':1}}
        with TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder/'procs.json').write_text(json.dumps(doc),encoding='utf-8')
            with patch('scripts.probe_magneticzero.fetch_page',return_value='sample'), \
                 patch('scripts.probe_magneticzero.latest',return_value=('0'*64,'https://msf-datamines.magneticzero.dev/view/combat_data/procs.json/'+'0'*64)), \
                 patch('scripts.probe_magneticzero.extract',return_value=doc):
                with self.assertRaisesRegex(ProbeError,'disagree with LoSP source manifest'):
                    probe('procs.json',folder,{'combat_data/procs.json':{'sha256':'0'*64,'md5':'0'*32}})

if __name__ == '__main__':
    unittest.main()
