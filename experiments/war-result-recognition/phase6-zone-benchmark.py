from pathlib import Path
from PIL import Image, ImageOps
import argparse, hashlib, json, subprocess, tempfile, sys
repo=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description="Replay phase 6 OCR zones on real source captures; requires local Tesseract CLI and Pillow.")
parser.add_argument("--images-dir", required=True, type=Path)
parser.add_argument("--output", type=Path, help="Optional JSON output path; summary is always printed.")
args=parser.parse_args()
imgdir=args.images_dir
manifest=json.loads((repo/'experiments/war-result-recognition/ground-truth.json').read_text())
items=[]
for item in manifest['captures']:
 p=imgdir/item['file']
 raw=p.read_bytes(); digest=hashlib.sha256(raw).hexdigest()
 if digest!=item['sha256']: raise SystemExit('hash mismatch '+item['file'])
 im=Image.open(p).convert('RGB'); w,h=im.size
 proc=subprocess.run(['tesseract',str(p),'stdout','--psm','11','tsv'],capture_output=True,text=True,check=False)
 lines=proc.stdout.splitlines(); header=lines[0].split('\t'); words=[]
 for line in lines[1:]:
  c=line.split('\t')
  if len(c)<12 or c[header.index('level')]!='5': continue
  txt=c[header.index('text')].strip()
  if not txt: continue
  x=int(c[header.index('left')]); y=int(c[header.index('top')]); ww=int(c[header.index('width')]); hh=int(c[header.index('height')])
  words.append({'text':txt,'confidence':float(c[header.index('conf')]),'bbox':{'x0':x,'y0':y,'x1':x+ww,'y1':y+hh}})
 items.append({'id':item['id'],'file':item['file'],'width':w,'height':h,'hash':digest,'words':words,'truth':item})
raw=json.dumps(items,ensure_ascii=False)
zone_runner="const fs=require('node:fs'); require(process.argv[1]); const c=globalThis.WarResultRecognition; const a=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(JSON.stringify(a.map(i=>({id:i.id,file:i.file,width:i.width,height:i.height,words:i.words.length,zones:c.locateZones(i.words,i.width,i.height)}))));"
zoneproc=subprocess.run(['node','-e',zone_runner,str(repo/'docs/war-result-recognition-core.js')],input=raw,capture_output=True,text=True,check=False)

if zoneproc.returncode: raise SystemExit(zoneproc.stderr)
zones=json.loads(zoneproc.stdout)
fields=['localAlliance','opponentAlliance','localScore','opponentScore','localTrophies','opponentTrophies','result']
results=[]
for src,z in zip(items,zones):
 truth=src['truth']; im=Image.open(imgdir/src['file']).convert('RGB'); rec={'id':src['id'],'file':src['file'],'dimensions':[src['width'],src['height']],'ratio':round(src['width']/src['height'],4),'anchorsFound':z['zones']['anchorsFound'],'geometryMethod':z['zones']['method'],'panelMethod':z['zones']['panelMethod'],'fields':{}}
 for f in fields:
  zonekey='resultBand' if f=='result' else f
  r=z['zones']['zones'].get(zonekey)
  expected=truth.get(f)
  if f=='result': expected=truth[f]
  if not r or r['width']<1 or r['height']<1:
   rec['fields'][f]={'expected':expected,'rect':r,'ocr':None,'exact':False,'status':'missing-zone'}; continue
  crop=im.crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
  if f=='result':
   # Same blue/red dominance cue as browser engine over the candidate band crop.
   pix=crop.resize((max(1,crop.width//4),max(1,crop.height//4))).convert('RGB').get_flattened_data(); blue=red=0
   for R,G,B in pix:
    if B>150 and B>R*1.18 and B>G*1.08: blue+=1
    if R>165 and R>G*1.25 and R>B*1.1: red+=1
   hi,lo=max(blue,red),min(blue,red)
   got=('win' if blue>red else 'loss') if hi>=3 and hi>=3*lo else ''
   rawocr=''
  else:
   scale=3 if f in ['localScore','opponentScore','localTrophies','opponentTrophies'] else 2
   crop=crop.resize((min(4096,crop.width*scale),min(1024,crop.height*scale)),Image.Resampling.LANCZOS)
   if f in ['localScore','opponentScore','localTrophies','opponentTrophies']:
    crop=ImageOps.grayscale(crop).point(lambda v:max(0,min(255,round((v-127.5)*1.7+127.5))))
   with tempfile.NamedTemporaryFile(suffix='.png') as tf:
    crop.save(tf.name)
    psm=subprocess.run(['tesseract',tf.name,'stdout','--psm','7','-c','preserve_interword_spaces=1']+(['-c','tessedit_char_whitelist=0123456789'] if f in ['localScore','opponentScore','localTrophies','opponentTrophies'] else []),capture_output=True,text=True)
   rawocr=' '.join(psm.stdout.split())
   if f in ['localScore','opponentScore','localTrophies','opponentTrophies']:
    digits=''.join(ch for ch in rawocr if ch.isdigit()); exp_len=6 if 'Score' in f else 4
    got=digits if len(digits)==exp_len else ''
   else:
    got=rawocr
    if f=='localAlliance' and got.lower().startswith('losp '): got=got[5:].strip()
  # normalize alliance values conservatively only case and whitespace; punctuation exact
  if isinstance(expected,str) and f in ['localAlliance','opponentAlliance'] and expected is not None:
   exact=' '.join(got.lower().split())==' '.join(expected.lower().split()) if got else False
  else: exact=str(got)==str(expected) if got else False
  rec['fields'][f]={'expected':expected,'ocr':got or None,'rawOcr':rawocr if f!='result' else None,'rect':r,'exact':exact,'status':'exact' if exact else ('unknown-truth' if expected is None else 'mismatch')}
 results.append(rec)
summary={f:sum(row['fields'][f]['exact'] for row in results) for f in fields}
summary['verifiedFields']=sum(v is not None for row in results for v in [row['fields'][f]['expected'] for f in fields])
summary['exactTotal']=sum(row['fields'][f]['exact'] for row in results for f in fields)
summary['totalSlots']=len(results)*len(fields)
output={'schema':'phase6-zone-corpus-replay-1','engine':'Tesseract CLI 5.5.0 anchor PSM11 + field PSM7; local Linux. Mirrors locator and crop scale/gray parameters from browser module, not a browser/Tesseract.js measurement.','corpusStatus':'Nine real images matched to ground-truth SHA-256; previously used development corpus; not independent validation.','summary':summary,'captures':results}
if args.output: args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'summary':summary,'captures':[{'id':r['id'],'size':r['dimensions'],'ratio':r['ratio'],'anchors':r['anchorsFound'],'method':r['geometryMethod'],'fields':{f:r['fields'][f]['ocr'] for f in fields}} for r in results]},ensure_ascii=False,indent=2))
