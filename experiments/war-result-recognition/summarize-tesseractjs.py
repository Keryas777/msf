#!/usr/bin/env python3
import json
from pathlib import Path
from benchmark import FIELDS, color_cue, compare
from PIL import Image

BASE=Path(__file__).parent
truth=json.loads((BASE/'ground-truth.json').read_text())['captures']
runtime=json.loads((BASE/'tesseractjs-node-raw-results.json').read_text())
captures=[]
totals={field:{'exact':0,'total':0} for field in FIELDS}
for result in runtime['captures']:
    expected=next(item for item in truth if item['id']==result['id'])
    image=Image.open(BASE/'../../upload'/expected['file']).convert('RGB')
    cue,_=color_cue(image)
    primary=result['passes']['psm11']['fields']['fields']
    secondary=result['passes']['psm6']['fields']['fields']
    fields={**primary}
    for name in ('localScore','opponentScore','localTrophies','opponentTrophies'):
        a,b=primary[name],secondary[name]
        if not a['value'] and b['value']: fields[name]=b
        elif a['value'] and b['value'] and a['value']!=b['value']:
            delta=abs((a.get('confidence') or 0)-(b.get('confidence') or 0))
            fields[name]=a if delta<18 else (a if (a.get('confidence') or 0)>(b.get('confidence') or 0) else b)
        elif a['value'] and b['value'] and a['value']==b['value']: fields[name]=a
    if not fields['localAlliance']['value'] or fields['localAlliance']['value'] not in ('Zeus','Dionysos','Poseidon','Athena','Kronos'):
        if secondary['localAlliance']['value'] in ('Zeus','Dionysos','Poseidon','Athena','Kronos'): fields['localAlliance']=secondary['localAlliance']
    fields['result']={'value':cue,'confidence':None,'source':'title-color','uncertain':cue is None}
    capture={'id':result['id'],'split':result['split'],'fields':{}}
    for field in FIELDS:
        want=expected.get(field); entry=fields[field]; got=entry.get('value') or None
        exact=compare(want,got)
        capture['fields'][field]={'expected':want,'extracted':got,'exact':exact,'confidence':entry.get('confidence'),'manualCorrectionRequired':want is None or exact is not True or entry.get('uncertain',False)}
        if want is not None:
            totals[field]['total']+=1; totals[field]['exact']+=int(exact is True)
    captures.append(capture)
runtime['fieldSummary']=totals
runtime['eligibleExact']={'exact':sum(v['exact'] for v in totals.values()),'total':sum(v['total'] for v in totals.values())}
runtime['captures']=captures
(BASE/'tesseractjs-node-results.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2)+'\n')
print(runtime['engine'],runtime['measurements'])
print(runtime['eligibleExact'])
print(totals)
