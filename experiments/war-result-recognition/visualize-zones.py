#!/usr/bin/env python3
"""Draw the OCR-derived field zones over local screenshots for diagnosis."""
import argparse, importlib.util
from pathlib import Path
from PIL import Image, ImageDraw

spec=importlib.util.spec_from_file_location('visual_digit_experiment',Path(__file__).with_name('visual-digit-experiment.py'))
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--images-dir',type=Path,required=True);ap.add_argument('--out-dir',type=Path,required=True);ap.add_argument('--ids',nargs='*',default=[]);a=ap.parse_args()
    import json
    truth=json.loads((Path(__file__).with_name('ground-truth.json')).read_text());a.out_dir.mkdir(parents=True,exist_ok=True)
    colors={'localScore':(0,255,255),'opponentScore':(255,80,80),'localTrophies':(100,255,100),'opponentTrophies':(255,80,255),'opponentAlliance':(80,170,255),'resultBand':(255,180,0)}
    for item in truth['captures']:
        if a.ids and item['id'] not in a.ids:continue
        path=a.images_dir/item['file'];im=Image.open(path).convert('RGB');w,h=im.size;anchors=mod.row_anchors(mod.ocr_words(path),w,h)
        if not anchors: print('skip, anchors missing:',item['id']);continue
        draw=ImageDraw.Draw(im,'RGBA')
        zones={}
        for field in ('localScore','opponentScore','localTrophies','opponentTrophies'):
            zones[field]=mod.roi_box(anchors,w,h,field)
        losp=anchors['losp']; zones['opponentAlliance']=(int(w*.595),max(0,int(losp['y0']-h*.015)),int(w*.91),min(h,int(losp['y1']+h*.02)))
        zones['resultBand']=(int(w*.30),0,int(w*.70),int(h*.12))
        for name,box in zones.items():
            c=colors[name];draw.rectangle(box,outline=(*c,255),width=max(2,round(w/900)))
            x0,y0,_,_=box;draw.rectangle((x0,y0,x0+max(92,round(w*.11)),y0+22),fill=(*c,190))
            draw.text((x0+3,y0+3),name,fill=(0,0,0,255))
        out=a.out_dir/f"{item['id']}-zones.png";im.save(out);print(out)
if __name__=='__main__':main()
