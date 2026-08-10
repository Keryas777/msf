#!/usr/bin/env python3
import io,json,re,urllib.request
from pathlib import Path
from PIL import Image,ImageOps

SRC=Path('docs/data/msf-characters.json')
OUT=Path('docs/data/war-counter-vision/portrait-signatures.json')
BLOCKED={'CarnageKnullSummon','KnullPVE_Boss_Knull'}
PATTERNS=[re.compile(p,re.I) for p in [r'(?:^|[_-])boss(?:$|[_-])',r'(?:^|[_-])pve(?:$|[_-])',r'(?:^|[_-])raid(?:$|[_-])',r'(?:^|[_-])npc(?:$|[_-])',r'(?:^|[_-])summon(?:$|[_-])',r'summon$',r'clone$',r'dummy',r'test']]

def playable(x):
    i=str(x.get('id','')).strip()
    return bool(i and x.get('nameKey') and x.get('portraitUrl') and i not in BLOCKED and not any(p.search(i) for p in PATTERNS))

def flat(im): return [v for px in im.getdata() for v in (px if isinstance(px,tuple) else (px,))]

def signature(raw):
    im=Image.open(io.BytesIO(raw)).convert('RGBA')
    bg=Image.new('RGBA',im.size,(9,19,38,255)); bg.alpha_composite(im)
    rgb=ImageOps.fit(bg.convert('RGB'),(32,32),method=Image.Resampling.LANCZOS,centering=(.5,.46))
    gray=rgb.convert('L').resize((16,16),Image.Resampling.BILINEAR)
    color=rgb.resize((4,4),Image.Resampling.BILINEAR)
    gp=list(gray.getdata()); edge=[]
    for y in range(16):
        for x in range(16):
            a=gp[y*16+x]; b=gp[y*16+min(15,x+1)]; c=gp[min(15,y+1)*16+x]
            edge.append(min(255,abs(a-b)+abs(a-c)))
    return {'g':gp,'c':flat(color),'e':edge}

def main():
    rows=json.loads(SRC.read_text(encoding='utf-8')); out=[]; failures=[]
    for item in filter(playable,rows):
        try:
            req=urllib.request.Request(item['portraitUrl'],headers={'User-Agent':'msf-war-counter-signatures/1.0'})
            with urllib.request.urlopen(req,timeout=20) as r: sig=signature(r.read())
            out.append({'id':item['id'],'n':item['nameKey'],'u':item['portraitUrl'],**sig})
        except Exception as exc: failures.append({'id':item['id'],'error':str(exc)})
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({'schemaVersion':'1.0.0','count':len(out),'items':out,'failures':failures},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'{len(out)} signatures, {len(failures)} échecs')
    if len(out)<150: raise SystemExit('Trop peu de signatures générées')
if __name__=='__main__': main()
