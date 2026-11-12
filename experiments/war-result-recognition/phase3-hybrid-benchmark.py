#!/usr/bin/env python3
"""Strict field-level before/after comparison for the phase 3 trophy crop."""
import argparse, json, unicodedata
from pathlib import Path

FIELDS=["localAlliance","opponentAlliance","localScore","opponentScore","localTrophies","opponentTrophies","result"]

def exact(expected, actual):
    if expected is None: return None
    if isinstance(expected,str):
        def norm(s):
            s=unicodedata.normalize('NFKC',str(s or '')).replace('’',"'").replace('‘',"'")
            return ' '.join(s.split()).casefold()
        return norm(expected)==norm(actual)
    return str(expected)==str(actual or '')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--truth',type=Path,default=Path(__file__).with_name('ground-truth.json')); ap.add_argument('--baseline',type=Path,default=Path(__file__).with_name('phase2-benchmark-results.json')); ap.add_argument('--localized',type=Path,default=Path(__file__).with_name('phase3-localized-tesseract-results.json')); ap.add_argument('--output',type=Path,default=Path(__file__).with_name('phase3-hybrid-benchmark-results.json')); a=ap.parse_args()
    truth=json.loads(a.truth.read_text()); baseline=json.loads(a.baseline.read_text()); crop=json.loads(a.localized.read_text())
    base_by={c['id']:c for c in baseline['captures']}; crop_by={c['id']:c for c in crop['captures']}
    captures=[]
    for target in truth['captures']:
        old=base_by[target['id']]['fields']; local=crop_by[target['id']]['fields']; fields={}
        for field in FIELDS:
            previous=old[field]; selected=previous.get('extracted'); source=previous.get('source') or 'phase2-dual-pass'
            alternatives=[]; confidence=previous.get('confidence')
            if field=='opponentTrophies':
                candidate=local.get(field,{}).get('gray-contrast-3x-psm7',{})
                value=candidate.get('value','')
                if len(value)==4 and value.isdigit():
                    if selected and selected!=value: alternatives=[selected,value]
                    selected=value; source='localized-gray-contrast-3x-psm7-first-number-group'; confidence=None
            expected=target.get(field); match=exact(expected,selected)
            fields[field]={'expected':expected,'extracted':selected or None,'exact':match,'confidence':confidence,'source':source,'alternatives':alternatives or None,'manualCorrectionRequired':expected is None or match is not True,'manualValidationRequired':True,'failureType':'unknown_truth' if expected is None else 'exact' if match else 'read_failure' if not selected else 'validation_failure'}
        captures.append({'id':target['id'],'split':target['split'],'fields':fields})
    summary={}
    for split in ('train','holdout','all'):
        rows=[r for r in captures if split=='all' or r['split']==split]
        group={}
        for field in FIELDS:
            vals=[r['fields'][field] for r in rows if r['fields'][field]['expected'] is not None]
            group[field]={'exact':sum(v['exact'] is True for v in vals),'total':len(vals),'readFailure':sum(v['failureType']=='read_failure' for v in vals),'attributionFailure':sum(v['failureType']=='attribution_failure' for v in vals),'validationFailure':sum(v['failureType']=='validation_failure' for v in vals)}
        group['overall']={'exact':sum(x['exact'] for k,x in group.items()),'total':sum(x['total'] for k,x in group.items())}
        group['overall']['percent']=round(100*group['overall']['exact']/group['overall']['total'],1)
        summary[split]=group
    out={'schemaVersion':'1.0.0','metric':'strict exact value equality after side/field attribution; identical phase 2 and phase 3 truth set','baseline':'phase2-benchmark-results.json','method':'Retain phase 2 values for six fields. For opponent trophies, use the dynamic crop PSM 7 grayscale/contrast result only when the first numeric token is exactly four digits; otherwise retain the phase 2 value. No truth-based substitution. Each image contributes isolated digit predictions only; no full-number templates.','corpus':baseline['corpus'],'comparison':{'phase2':baseline['summary']['tesseract-cli-dual-pass-conservative'],'phase3':summary},'captures':captures}
    a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    for split in ('train','holdout','all'):
        print(split,summary[split]['overall'])
        print(' '.join(f'{f}={summary[split][f]["exact"]}/{summary[split][f]["total"]}' for f in FIELDS))
if __name__=='__main__':main()
