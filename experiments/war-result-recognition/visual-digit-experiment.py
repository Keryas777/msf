#!/usr/bin/env python3
"""Local visual glyph experiment for MSF war result digits.

The model learns isolated glyphs, never whole expected values. Training labels
are aligned from verified values; evaluation splits are grouped by capture.
Requires Pillow, NumPy, SciPy and local Tesseract CLI. No network access.
"""
from __future__ import annotations
import argparse, csv, hashlib, io, json, re, subprocess, time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

FIELDS = ("localScore", "opponentScore", "localTrophies", "opponentTrophies")

def ocr_words(path: Path):
    raw = subprocess.run(["tesseract", str(path), "stdout", "-l", "eng", "--psm", "11", "tsv"],
                         capture_output=True, text=True, check=True).stdout
    rows = [r for r in csv.DictReader(io.StringIO(raw), delimiter="\t")
            if r.get("level") == "5" and r.get("text", "").strip()]
    for r in rows:
        for key in ("left", "top", "width", "height", "conf"):
            r[key] = float(r[key])
        r["x0"], r["y0"] = r["left"], r["top"]
        r["x1"], r["y1"] = r["left"] + r["width"], r["top"] + r["height"]
        r["cx"], r["cy"] = (r["x0"] + r["x1"]) / 2, (r["y0"] + r["y1"]) / 2
    return rows

def row_anchors(words, w, h):
    points = [x for x in words if x["text"].casefold() == "points"]
    label = None
    for p in points:
        same = [x for x in words if abs(x["cy"] - p["cy"]) < h * .025]
        label_words = [x for x in same if x["text"].casefold().strip(".,:;[]()") in {"points", "de", "guerre"}]
        if any("guerre" in x["text"].casefold() for x in label_words):
            label = {"words": label_words, "x0": min(x["x0"] for x in label_words), "x1": max(x["x1"] for x in label_words),
                     "y0": min(x["y0"] for x in label_words), "y1": max(x["y1"] for x in label_words)}
            break
    losp = next((x for x in words if x["text"].casefold() == "losp" and x["cy"] < h * .28), None)
    if not label or not losp:
        return None
    top_row = [x for x in words if abs(x["cy"] - losp["cy"]) < h * .035]
    right = [x for x in top_row if x["x0"] > w * .59 and re.search(r"[A-Za-z]", x["text"])]
    opponent = min(right, key=lambda x: x["x0"]) if right else None
    return {"scoreLabel": label, "losp": losp, "opponent": opponent}

def roi_box(anchors, w, h, field):
    if "Score" in field:
        label = anchors["scoreLabel"]
        # Include the whole label on both sides, scaled to screen width.
        if field == "localScore": x0, x1 = label["x0"] - w * .26, label["x0"] - w * .008
        else: x0, x1 = label["x1"] + w * .008, label["x1"] + w * .24
        cy = (label["y0"] + label["y1"]) / 2
        y0, y1 = cy - h * .035, cy + h * .035
        return (max(0, int(x0)), max(0, int(y0)), min(w, int(x1)), min(h, int(y1)))
    losp = anchors["losp"]
    if field == "localTrophies":
        x0, x1 = losp["x0"] - w * .015, losp["x0"] + w * .13
    else:
        opponent = anchors["opponent"]
        x0 = (opponent["x0"] + w * .02) if opponent else w * .635
        x1 = x0 + w * .14
    y0 = losp["y1"] + h * .006
    y1 = y0 + h * .075
    return (max(0, int(x0)), max(0, int(y0)), min(w, int(x1)), min(h, int(y1)))

def component_candidates(image: Image.Image, box, field):
    x0,y0,x1,y1 = box
    a = np.asarray(image.crop(box).convert("RGB"), dtype=np.int16)
    if a.size == 0: return [], "empty_roi"
    if "Score" in field:
        r,g,b = a[:,:,0],a[:,:,1],a[:,:,2]
        mask = (r > 115) & (g > 85) & (r-g > 0) & (r-b > 42) & (g-b > 10)
    else:
        maximum, minimum = a.max(2), a.min(2)
        mask = (maximum > 120) & ((maximum-minimum) < 105) & (a.mean(2) > 100)
    # Close one-pixel anti-alias gaps without combining adjacent characters.
    mask = ndimage.binary_closing(mask, structure=np.ones((2,2), dtype=bool))
    labels, count = ndimage.label(mask, structure=np.ones((3,3), dtype=bool))
    comps=[]
    min_h=max(5, int((y1-y0)*.12))
    for index, sl in enumerate(ndimage.find_objects(labels), 1):
        if sl is None: continue
        hh, ww = sl[0].stop-sl[0].start, sl[1].stop-sl[1].start
        area=int((labels[sl] == index).sum())
        if hh < min_h or ww < 2 or area < 8: continue
        # Score rows are isolated by a label-anchored stripe. For trophies the
        # leftmost four glyph-like components precede rating change text.
        comps.append({"x0": x0+sl[1].start, "x1": x0+sl[1].stop, "y0": y0+sl[0].start,
                      "y1": y0+sl[0].stop, "width":ww, "height":hh, "area":area,
                      "mask": labels[sl] == index})
    comps.sort(key=lambda c:c["x0"])
    if len(comps) < 4: return [], f"too_few_components:{len(comps)}"
    expected = 6 if "Score" in field else 4
    # Select a glyph-height-consistent run; allow the larger thousands-group gap.
    best=None
    for start in range(max(1, len(comps)-expected+1)):
        run=comps[start:start+expected]
        heights=np.array([c["height"] for c in run], dtype=float)
        widths=np.array([c["width"] for c in run], dtype=float)
        hmed=np.median(heights)
        hpen=np.mean(np.abs(heights-hmed)/max(hmed,1))
        wpen=np.mean(np.maximum(0, widths/max(np.median(widths),1)-1.65))
        gaps=np.diff([c["x0"] for c in run])[:-0 or None] if False else np.array([run[i+1]["x0"]-run[i]["x1"] for i in range(len(run)-1)])
        gap_pen=np.mean(np.maximum(0, gaps/max(hmed*.8,1)-.75))
        score=hpen + .45*wpen + .30*gap_pen
        if best is None or score<best[0]: best=(score,run)
    chosen=best[1]
    glyphs=[]
    for c in chosen:
        # Keep aspect ratio, centre in a fixed binary canvas. This is a shape
        # descriptor, not a number/string template.
        binary = c["mask"]
        gh, gw = binary.shape
        scale = min(14 / max(gw, 1), 22 / max(gh, 1))
        nw, nh = max(1, round(gw * scale)), max(1, round(gh * scale))
        glyph = Image.fromarray((binary * 255).astype(np.uint8)).resize((nw, nh), Image.Resampling.NEAREST)
        canvas = np.zeros((24, 16), dtype=bool)
        resized = np.asarray(glyph, dtype=np.uint8) > 127
        ox, oy = (16 - nw) // 2, (24 - nh) // 2
        canvas[oy:oy+nh, ox:ox+nw] = resized
        glyphs.append(canvas)
        c.pop("mask", None)
    if len(glyphs)!=expected: return [],"segmentation_failure"
    return glyphs, {"box":box,"candidateCount":len(comps),"selected":chosen}

def classify(glyph, templates, k=1):
    distances=[]
    for label, sample in templates:
        d=float(np.mean(glyph != sample))
        distances.append((d,label))
    if not distances: return "",1.0
    distances.sort()
    # Weighted nearest-neighbour over glyph prototypes. Report margin proxy.
    votes={}
    for d,label in distances[:k]: votes[label]=votes.get(label,0.)+1/(d+.025)
    best=sorted(votes.items(), key=lambda x:-x[1])
    margin=(best[0][1]-best[1][1])/max(best[0][1],1e-9) if len(best)>1 else 1.
    return best[0][0], 1-margin

def normalize_truth(v): return str(v)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--images-dir',type=Path,required=True)
    ap.add_argument('--truth',type=Path,default=Path(__file__).with_name('ground-truth.json'))
    ap.add_argument('--baseline',type=Path,default=Path(__file__).with_name('phase2-benchmark-results.json'))
    ap.add_argument('--output',type=Path,default=Path(__file__).with_name('phase3-visual-digit-results.json'))
    args=ap.parse_args()
    truth=json.loads(args.truth.read_text(encoding='utf8'))
    baseline=json.loads(args.baseline.read_text(encoding='utf8'))
    base_by={c['id']:c for c in baseline['captures']}
    samples={}
    started=time.perf_counter()
    for item in truth['captures']:
        p=args.images_dir/item['file']; raw=p.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=item['sha256']: raise SystemExit(f'hash mismatch: {p.name}')
        image=Image.open(p).convert('RGB'); w,h=image.size
        anchors=row_anchors(ocr_words(p),w,h)
        capture={'id':item['id'],'split':item['split'],'fields':{},'rois':{},'anchors':None}
        if anchors:
            capture['anchors']={k:{a:round(v[a],1) for a in ('x0','y0','x1','y1')} for k,v in anchors.items() if v}
        for field in FIELDS:
            if not anchors:
                capture['fields'][field]={'value':None,'reason':'structural_anchor_missing','expected':item.get(field),'exact':None}
                continue
            box=roi_box(anchors,w,h,field); glyphs,seg=component_candidates(image,box,field)
            capture['rois'][field]=[round(v/w,5) if i in (0,2) else round(v/h,5) for i,v in enumerate(box)]
            capture['fields'][field]={'expected':item.get(field),'segmentCount':len(glyphs),
                'segmentStatus':seg if isinstance(seg,str) else 'segmented', 'glyphs':glyphs,
                'tesseractPhase2':base_by[item['id']]['fields'][field]['extracted'],
                'truth':item.get(field)}
        samples[item['id']]=capture
    model_results=[]
    # Score and trophy glyphs have separate templates because their fonts/colors differ.
    for field in FIELDS:
        eligible=[(item,capture['fields'][field]) for item in truth['captures'] if item.get(field) is not None and len(samples[item['id']]['fields'][field].get('glyphs',[]))==len(str(item[field]))]
        pred_by={}
        for target in truth['captures']:
            row=samples[target['id']]['fields'][field]
            expected=target.get(field)
            if expected is None or len(row.get('glyphs',[]))!=len(str(expected)):
                pred_by[target['id']]={'predicted':None,'exact':False,'reason':row['segmentStatus']}
                continue
            train=[]
            # Training-split captures are the only templates. In-sample rows
            # use leave-one-capture-out; historic holdouts never teach a model.
            for candidate in truth['captures']:
                if candidate['split']!='train' or candidate['id']==target['id']: continue
                s=samples[candidate['id']]['fields'][field]
                if candidate.get(field) is None or len(s.get('glyphs',[]))!=len(str(candidate[field])): continue
                train.extend(zip(str(candidate[field]),s['glyphs']))
            # For a holdout capture, all seven train captures are retained.
            pred=[]; uncertainties=[]
            for glyph in row['glyphs']:
                char,unc=classify(glyph,train); pred.append(char); uncertainties.append(round(unc,3))
            value=''.join(pred)
            pred_by[target['id']]={'predicted':value,'exact':value==str(expected),
                                   'reason':None,'glyphUncertainty':uncertainties,
                                   'trainGlyphs':len(train),'trainImages':[x['id'] for x in truth['captures'] if x['split']=='train' and x['id']!=target['id']]}
        for item in truth['captures']:
            fieldrow=samples[item['id']]['fields'][field]
            fieldrow['visualClassifier']=pred_by[item['id']]
            fieldrow['exact']=pred_by[item['id']]['exact'] if item.get(field) is not None else None
            fieldrow.pop('glyphs',None)
        totals={"exact":sum(pred_by[i['id']]['exact'] for i in truth['captures'] if i.get(field) is not None),
                "eligible":sum(i.get(field) is not None for i in truth['captures']),
                "segmentable":sum(pred_by[i['id']]['predicted'] is not None for i in truth['captures'] if i.get(field) is not None),
                "baselineExact":baseline['summary']['tesseract-cli-dual-pass-conservative']['all'][field]['exact'],
                "baselineEligible":baseline['summary']['tesseract-cli-dual-pass-conservative']['all'][field]['total']}
        model_results.append({"field":field,"metric":totals})
    # Baseline fields outside numeric scope are preserved exactly from phase 2.
    fields_summary={"numeric":model_results}
    result={"schemaVersion":"1.0.0","method":"Tesseract-anchored, HSV/pale-glyph segmentation + capture-disjoint, per-digit 5-NN binary shape prototypes; no whole-number templates",
      "engine":"Tesseract CLI 5.5.0 for structural word boxes; Python/Pillow/NumPy/SciPy for local visual prototype; not browser performance",
      "corpus":{"images":9,"developmentImages":7,"historicHoldouts":2,"holdoutStatus":"Previously examined and contaminated; no independent validation claim.","unknownTruth":[{"capture":"capture-09","field":"opponentAlliance"}]},
      "trainingProtocol":"Verified ground truth supplies individual glyph labels only. Templates are trained on the seven train captures; each train prediction excludes its own capture. No expected multi-digit number is stored as a template.",
      "summary":fields_summary,"elapsedMs":round((time.perf_counter()-started)*1000,1),"captures":list(samples.values())}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding='utf8')
    for v in model_results: print(v['field'],v['metric'])
    print('wrote',args.output)
if __name__=='__main__': main()
