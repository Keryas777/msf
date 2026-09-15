#!/usr/bin/env python3
import io,json,time,urllib.request
from pathlib import Path
from PIL import Image,ImageOps

SRC=Path('docs/data/msf-characters.json')
OUT=Path('docs/data/war-counter-vision/portrait-signatures.json')

def playable(x):
    return x.get('player_Character') is True

def select_playable(rows):
    selected=[]; seen=set(); metadata_errors=[]; playable_errors=[]
    for item in rows:
        character_id=str(item.get('id','')).strip()
        if not character_id:
            metadata_errors.append('<missing id>'); continue
        if character_id in seen:
            metadata_errors.append(f'{character_id}: duplicate id'); continue
        seen.add(character_id)

        value=item.get('player_Character')
        if not isinstance(value,bool):
            metadata_errors.append(f'{character_id}: invalid player_Character={value!r}')
            continue
        if not playable(item): continue

        missing=[field for field in ('nameKey','portraitUrl') if not str(item.get(field,'')).strip()]
        if missing:
            playable_errors.append(f"{character_id}: missing {', '.join(missing)}")
            continue
        selected.append(item)

    if metadata_errors:
        raise ValueError('Invalid playable metadata: '+'; '.join(metadata_errors[:20]))
    if playable_errors:
        raise ValueError('Playable characters are incomplete: '+'; '.join(playable_errors[:20]))
    return selected

def download(url, attempts=4):
    error=None
    for attempt in range(attempts):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'msf-war-counter-signatures/1.0'})
            with urllib.request.urlopen(req,timeout=20) as response:
                return response.read()
        except Exception as exc:
            error=exc
            if attempt+1<attempts:
                time.sleep(2**attempt)
    raise error

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
    selected=select_playable(rows)
    for item in selected:
        try:
            sig=signature(download(item['portraitUrl']))
            out.append({'id':item['id'],'n':item['nameKey'],'u':item['portraitUrl'],**sig})
        except Exception as exc: failures.append({'id':item['id'],'error':str(exc)})
    if failures:
        details='; '.join(f"{failure['id']}: {failure['error']}" for failure in failures[:20])
        raise SystemExit(f'Portrait signature build failed for {len(failures)} playable character(s): {details}')

    payload={'schemaVersion':'1.0.0','count':len(out),'items':out,'failures':[]}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    temporary=OUT.with_suffix(OUT.suffix+'.tmp')
    temporary.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    temporary.replace(OUT)
    print(f'{len(out)} playable signatures, {len(rows)-len(selected)} non-playable entries excluded')
if __name__=='__main__': main()
