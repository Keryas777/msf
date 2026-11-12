#!/usr/bin/env python3
"""Run proportion-based numeric ROI trials; native Tesseract CLI only."""
import argparse,csv,io,json,subprocess,time
from pathlib import Path
from PIL import Image,ImageOps

BASE=Path(__file__).parent
TRUTH=json.loads((BASE/'ground-truth.json').read_text())['captures']

def tsv(path,psm):
    return subprocess.run(['tesseract',str(path),'stdout','-l','eng','--psm',str(psm),'tsv'],capture_output=True,text=True,check=True).stdout

def words(raw):
    return [r for r in csv.DictReader(io.StringIO(raw),delimiter='\t') if r.get('level')=='5' and r.get('text')]

def find_row(raw,label):
    return next((r for r in words(raw) if r['text'].strip().casefold()==label.casefold()),None)

def ocr_crop(image,box,scale):
    crop=image.crop(box).convert('RGB')
    crop=ImageOps.autocontrast(ImageOps.grayscale(crop),cutoff=1).resize((crop.width*scale,crop.height*scale),Image.Resampling.LANCZOS)
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
        crop.save(tmp.name)
        return subprocess.run(['tesseract',tmp.name,'stdout','-l','eng','--psm','7','-c','tessedit_char_whitelist=0123456789'],capture_output=True,text=True,check=True).stdout.strip().replace(' ','')

def main():
    p=argparse.ArgumentParser();p.add_argument('--images-dir',type=Path,required=True);p.add_argument('--output',type=Path,default=BASE/'roi-sweep-results.json');args=p.parse_args()
    configs={key:[] for key in ['score-wide-3x','score-narrow-3x','trophy-narrow-4x']};times={key:[] for key in configs}
    for item in TRUTH:
        path=args.images_dir/item['file']; image=Image.open(path).convert('RGB');w,h=image.size
        anchor=tsv(path,11); point=find_row(anchor,'POINTS');losp=find_row(anchor,'LoSP')
        values={key:{'localScore':None,'opponentScore':None,'localTrophies':None,'opponentTrophies':None} for key in configs}
        if point:
            cy=int(point['top'])+int(point['height'])/2
            y1=max(0,int(cy-.035*h));y2=min(h,int(cy+.035*h))
            for key,ranges,scale in [('score-wide-3x',[(.18,.43),(.59,.80)],3),('score-narrow-3x',[(.26,.46),(.58,.82)],3)]:
                started=time.perf_counter()
                for side,(x1,x2) in zip(['localScore','opponentScore'],ranges): values[key][side]=ocr_crop(image,(int(w*x1),y1,int(w*x2),y2),scale)
                times[key].append((time.perf_counter()-started)*1000)
        if losp:
            cy=int(losp['top'])+int(losp['height'])/2+.075*h
            y1=max(0,int(cy-.035*h));y2=min(h,int(cy+.035*h));started=time.perf_counter()
            for side,(x1,x2) in zip(['localTrophies','opponentTrophies'],[(.14,.29),(.59,.69)]): values['trophy-narrow-4x'][side]=ocr_crop(image,(int(w*x1),y1,int(w*x2),y2),4)
            times['trophy-narrow-4x'].append((time.perf_counter()-started)*1000)
        for key in configs: configs[key].append({'id':item['id'],'split':item['split'],'expected':{field:item[field] for field in values[key]},'extracted':values[key]})
    summary={}
    for key,captures in configs.items():
        summary[key]={}
        for field in captures[0]['expected']:
            eligible=[c for c in captures if c['expected'][field] is not None]
            summary[key][field]={'exact':sum(str(c['expected'][field])==str(c['extracted'][field]) for c in eligible),'total':len(eligible)}
    result={'schemaVersion':'1.0.0','engine':'Tesseract CLI; local-only numeric ROI experiment','method':'Proportional crop around OCR label anchor; grayscale, autocontrast, upscale, PSM 7 digit whitelist. These are candidate values only and not used by the default extractor.','configurationHistory':[{'id':'score-wide-3x','anchor':'POINTS row from PSM 11','xRanges':{'local':[.18,.43],'opponent':[.59,.80]},'yRange':'label midpoint +/- .035 * image height','scale':3,'psm':7,'whitelist':'0123456789'},{'id':'score-narrow-3x','anchor':'POINTS row from PSM 11','xRanges':{'local':[.26,.46],'opponent':[.58,.82]},'yRange':'label midpoint +/- .035 * image height','scale':3,'psm':7,'whitelist':'0123456789'},{'id':'trophy-narrow-4x','anchor':'LoSP row from PSM 11; crop midpoint = row midpoint + .075 * image height','xRanges':{'local':[.14,.29],'opponent':[.59,.69]},'yRange':'anchor midpoint +/- .035 * image height','scale':4,'psm':7,'whitelist':'0123456789'}],'meanMsPerCapture':{key:round(sum(v)/len(v),1) for key,v in times.items()},'summary':summary,'captures':configs}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    for key,values in summary.items():print(key,values)

if __name__=='__main__':main()
