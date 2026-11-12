#!/usr/bin/env python3
"""Local OCR ablation for the opponent alliance name band."""
from __future__ import annotations
import argparse, importlib.util, json, re, subprocess, tempfile, time, unicodedata
from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import numpy as np

_spec=importlib.util.spec_from_file_location('visual_digit_experiment',Path(__file__).with_name('visual-digit-experiment.py'))
_module=importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_module)
ocr_words,row_anchors=_module.ocr_words,_module.row_anchors

def variants(im,box):
    crop=im.crop(box).convert('RGB'); s=2
    raw=crop.resize((crop.width*s,crop.height*s),Image.Resampling.LANCZOS)
    gray=ImageOps.grayscale(raw); gray=ImageEnhance.Contrast(gray).enhance(1.8); gray=ImageEnhance.Brightness(gray).enhance(1.1)
    ar=np.asarray(crop,dtype=np.int16); mx=ar.max(2); mn=ar.min(2); sat=mx-mn
    # Keep both brightly colored names and neutral white names. Everything else
    # becomes white background; no vocabulary or truth-dependent substitutions.
    keep=((mx>125)&(sat>25))|((mx>160)&(sat<55))
    color=Image.fromarray(np.where(keep,0,255).astype(np.uint8)).resize((crop.width*s,crop.height*s),Image.Resampling.NEAREST)
    sharp=ImageEnhance.Sharpness(gray).enhance(1.8)
    return {'raw-2x':raw,'gray-contrast-2x':gray,'color-isolation-2x':color,'sharp-gray-2x':sharp}

def recognize(im,psm):
    with tempfile.TemporaryDirectory(prefix='war-name-') as td:
        path=Path(td)/'roi.png'; im.save(path)
        return subprocess.run(['tesseract',str(path),'stdout','-l','eng','--psm',str(psm)],capture_output=True,text=True,check=True).stdout.strip()

def norm(s):
    s=unicodedata.normalize('NFKC',s or '').replace('’',"'").replace('‘',"'")
    return ' '.join(s.split()).casefold()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--images-dir',type=Path,required=True);ap.add_argument('--truth',type=Path,default=Path(__file__).with_name('ground-truth.json'));ap.add_argument('--baseline',type=Path,default=Path(__file__).with_name('phase2-benchmark-results.json'));ap.add_argument('--output',type=Path,default=Path(__file__).with_name('phase3-name-results.json'));a=ap.parse_args()
    truth=json.loads(a.truth.read_text()); baseline=json.loads(a.baseline.read_text()); rows=[]; start=time.perf_counter()
    for item in truth['captures']:
        p=a.images_dir/item['file']; im=Image.open(p).convert('RGB'); w,h=im.size; words=ocr_words(p); anchors=row_anchors(words,w,h)
        expected=item.get('opponentAlliance'); row={'id':item['id'],'split':item['split'],'expected':expected,'phase2':baseline['captures'][item['id'].split('-')[1] and int(item['id'].split('-')[1])-1]['fields']['opponentAlliance']['extracted'],'variants':{}}
        if anchors:
            losp=anchors['losp']; box=(int(w*.595),max(0,int(losp['y0']-h*.015)),min(w,int(w*.91)),min(h,int(losp['y1']+h*.02)))
            row['roi']=[round(box[0]/w,5),round(box[1]/h,5),round(box[2]/w,5),round(box[3]/h,5)]
            for name,roi in variants(im,box).items():
                for psm in (7,11):
                    raw=recognize(roi,psm); row['variants'][f'{name}-psm{psm}']={'raw':raw,'value':' '.join(raw.split()),'exact':None if expected is None else norm(expected)==norm(raw)}
        rows.append(row)
    summary={}
    for row in rows:
        for config,result in row['variants'].items(): summary.setdefault(config,[]).append({'id':row['id'],'split':row['split'],'exact':result['exact'],'value':result['value']})
    report={'schemaVersion':'1.0.0','method':'Proportional opponent-name band crop anchored to OCR LoSP word; raw, grayscale contrast, saturation/neutral-light color mask, sharp grayscale; PSM 7/11; exact normalized string comparison','engine':'Tesseract CLI 5.5.0 local Linux; not browser performance','corpus':{'images':9,'train':7,'historicHoldout':2,'unknownOpponentTruth':'capture-09','holdoutStatus':'Previously examined; contaminated and not independent.'},'summary':{},'captures':rows,'elapsedMs':round((time.perf_counter()-start)*1000,1)}
    for config, vals in summary.items():
        elig=[v for v in vals if v['exact'] is not None]
        report['summary'][config]={'all':sum(v['exact'] is True for v in elig),'eligible':len(elig),'train':sum(v['exact'] is True for v in elig if v['split']=='train'),'trainTotal':sum(v['split']=='train' for v in elig),'historicHoldout':sum(v['exact'] is True for v in elig if v['split']=='holdout'),'holdoutTotal':sum(v['split']=='holdout' for v in elig)}
    a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');
    for k,v in report['summary'].items():print(k,v)
    print('elapsedMs',report['elapsedMs'],'wrote',a.output)
if __name__=='__main__':main()
