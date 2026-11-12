#!/usr/bin/env python3
"""Tesseract CLI ablation on dynamically anchored, field-specific image crops."""
from __future__ import annotations
import argparse, importlib.util, json, re, subprocess, tempfile, time
from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import numpy as np
_spec=importlib.util.spec_from_file_location('visual_digit_experiment',Path(__file__).with_name('visual-digit-experiment.py'))
_module=importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_module)
ocr_words,row_anchors,roi_box=_module.ocr_words,_module.row_anchors,_module.roi_box

FIELDS=("localScore","opponentScore","localTrophies","opponentTrophies")

def crop_box(anchors,w,h,field):
    if "Score" in field: return roi_box(anchors,w,h,field)
    losp=anchors['losp']; opp=anchors['opponent']
    if field=='localTrophies':
        x0=losp['x0']-w*.02; x1=losp['x0']+w*.085
    else:
        ax=opp['x0'] if opp else w*.635
        x0=ax+w*.02; x1=ax+w*.115
    y0=losp['y1']+h*.006; y1=y0+h*.075
    return max(0,int(x0)),max(0,int(y0)),min(w,int(x1)),min(h,int(y1))

def make_variants(image,box,field):
    crop=image.crop(box).convert('RGB')
    scale=3
    raw=crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.LANCZOS)
    gray=ImageOps.grayscale(raw)
    gray=ImageEnhance.Contrast(gray).enhance(1.7)
    gray=ImageEnhance.Brightness(gray).enhance(1.12)
    arr=np.asarray(crop,dtype=np.int16)
    if 'Score' in field:
        r,g,b=arr[:,:,0],arr[:,:,1],arr[:,:,2]
        mask=(r>110)&(g>80)&(r-b>30)&(g-b>20)&(r-g>-12)
    else:
        mx=arr.max(2); mn=arr.min(2); mask=(mx>115)&((mx-mn)<115)&(arr.mean(2)>95)
    keyed=Image.fromarray(np.where(mask,0,255).astype(np.uint8)).resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)
    # Otsu threshold after greyscale/contrast, preserving both text polarities.
    gray_native=ImageOps.grayscale(crop)
    gray_native=ImageEnhance.Contrast(gray_native).enhance(1.8)
    hist=np.asarray(gray_native).ravel(); counts=np.bincount(hist,minlength=256); total=len(hist)
    sum_total=np.dot(np.arange(256),counts); sum_b=0; weight_b=0; max_var=-1; threshold=140
    for t,count in enumerate(counts):
        weight_b+=count
        if not weight_b: continue
        weight_f=total-weight_b
        if not weight_f: break
        sum_b+=t*count
        mean_b=sum_b/weight_b; mean_f=(sum_total-sum_b)/weight_f
        var=weight_b*weight_f*(mean_b-mean_f)**2
        if var>max_var: max_var=var; threshold=t
    binary=gray_native.point(lambda p:0 if p<threshold else 255).resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)
    return {'gray-contrast-3x':gray,'color-key-3x':keyed,'otsu-3x':binary,'raw-3x':raw}

def read(image,psm,whitelist=True):
    with tempfile.TemporaryDirectory(prefix='war-roi-') as temp:
        p=Path(temp)/'roi.png'; image.save(p)
        cmd=['tesseract',str(p),'stdout','-l','eng','--psm',str(psm)]
        if whitelist: cmd += ['-c','tessedit_char_whitelist=0123456789']
        out=subprocess.run(cmd,capture_output=True,text=True,check=True).stdout
    return out.strip()

def normalize_read(text,digits):
    groups=re.findall(r'\d+',text)
    if not groups:return ''
    if digits==4:
        # The total precedes the trophy delta in this UI. Keep only the first
        # group, never a number from the other side or another row.
        return groups[0][:4] if len(groups[0])>=4 else groups[0]
    value=''.join(groups)
    return value[:digits] if len(value)>=digits else value

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--images-dir',type=Path,required=True)
    ap.add_argument('--truth',type=Path,default=Path(__file__).with_name('ground-truth.json'))
    ap.add_argument('--baseline',type=Path,default=Path(__file__).with_name('phase2-benchmark-results.json'))
    ap.add_argument('--output',type=Path,default=Path(__file__).with_name('phase3-localized-tesseract-results.json'))
    args=ap.parse_args(); truth=json.loads(args.truth.read_text()); base=json.loads(args.baseline.read_text())
    configs={f'{variant}-psm{psm}':[] for variant in ['raw-3x','gray-contrast-3x','otsu-3x','color-key-3x'] for psm in (7,8)}
    captures=[]; start=time.perf_counter()
    for item in truth['captures']:
        path=args.images_dir/item['file']; im=Image.open(path).convert('RGB'); w,h=im.size
        anchors=row_anchors(ocr_words(path),w,h)
        row={'id':item['id'],'split':item['split'],'fields':{},'regions':{}}
        if anchors:
            row['anchors']={k:{a:round(v[a],1) for a in ('x0','y0','x1','y1')} for k,v in anchors.items() if v}
        for field in FIELDS:
            if not anchors:
                for cfg in configs: configs[cfg].append({'id':item['id'],'split':item['split'],'field':field,'expected':item.get(field),'value':None,'exact':False})
                continue
            box=crop_box(anchors,w,h,field); row['regions'][field]=[round(box[0]/w,5),round(box[1]/h,5),round(box[2]/w,5),round(box[3]/h,5)]
            variants=make_variants(im,box,field)
            for name,roi in variants.items():
                for psm in (7,8):
                    key=f'{name}-psm{psm}'; raw=read(roi,psm); value=normalize_read(raw,4 if 'Trophies' in field else 6)
                    expected=item.get(field); exact=(str(expected)==value) if expected is not None else None
                    entry={'id':item['id'],'split':item['split'],'field':field,'expected':expected,'raw':raw,'value':value,'exact':exact}
                    configs[key].append(entry); row['fields'].setdefault(field,{})[key]=entry
        captures.append(row)
    summary={}
    for key,entries in configs.items():
        fields={}
        for f in FIELDS:
            eligible=[e for e in entries if e['field']==f and e['expected'] is not None]
            fields[f]={'exact':sum(e['exact'] is True for e in eligible),'total':len(eligible),'values':{e['id']:{'expected':e['expected'],'raw':e['raw'],'value':e['value'],'exact':e['exact']} for e in eligible}}
        fields['overall']={'exact':sum(v['exact'] for f,v in fields.items() if f!='overall'),'total':sum(v['total'] for f,v in fields.items() if f!='overall')}
        summary[key]=fields
    out={'schemaVersion':'1.0.0','method':'PSM 11 TSV structural anchors for label/alignment; proportional ROIs; Tesseract CLI numeric whitelist; independent score/trophy crops; RGB-derived key, grayscale contrast and Otsu variants','engine':'Tesseract CLI 5.5.0 local Linux; not browser performance','corpus':{'images':9,'train':7,'historicHoldout':2,'holdoutStatus':'Previously examined; contaminated and not independent.','unknownTruth':[{'capture':'capture-09','field':'opponentAlliance'}]},'parameters':{'psm':[7,8],'scale':3,'variants':['raw-3x','gray-contrast-3x','otsu-3x','color-key-3x'],'scoreAnchors':'recognized POINTS DE GUERRE words, excluding numeric words','trophyAnchors':'LoSP and same-row opponent alliance text; fixed relative field bands'},'summary':summary,'captures':captures,'elapsedMs':round((time.perf_counter()-start)*1000,1)}
    args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    for k,v in summary.items(): print(k,v['overall'],{f:f'{v[f]["exact"]}/{v[f]["total"]}' for f in FIELDS})
    print('elapsedMs',out['elapsedMs'],'wrote',args.output)
if __name__=='__main__':main()
