#!/usr/bin/env python3
"""Make a transient, proportional, max-width image copy for runtime parity."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--images-dir',type=Path,required=True);ap.add_argument('--out-dir',type=Path,required=True);ap.add_argument('--max-width',type=int,default=1800);a=ap.parse_args();a.out_dir.mkdir(parents=True,exist_ok=True)
    truth=json.loads((Path(__file__).with_name('ground-truth.json')).read_text());manifest=[]
    for item in truth['captures']:
        src=a.images_dir/item['file'];raw=src.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise SystemExit(f'hash mismatch: {src.name}')
        im=Image.open(src).convert('RGB')
        if im.width>a.max_width:
            scale=a.max_width/im.width;im=im.resize((a.max_width,round(im.height*scale)),Image.Resampling.LANCZOS)
        out=a.out_dir/src.name;im.save(out,quality=95)
        manifest.append({'id':item['id'],'file':out.name,'originalSha256':item['sha256'],'resizedWidth':im.width,'resizedHeight':im.height})
    (a.out_dir/'manifest.json').write_text(json.dumps({'maxWidth':a.max_width,'images':manifest},indent=2)+'\n')
    print(f'prepared {len(manifest)} local-only images in {a.out_dir}')
if __name__=='__main__':main()
