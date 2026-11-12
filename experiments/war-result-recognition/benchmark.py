#!/usr/bin/env python3
"""Repeatable, local-only, strict field-attribution benchmark for Tesseract CLI."""
from __future__ import annotations
import argparse, csv, hashlib, io, json, shutil, subprocess, tempfile, time, unicodedata
from pathlib import Path
from PIL import Image

FIELDS = ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "result"]

def color_cue(image: Image.Image):
    w, h = image.size
    roi = image.crop((int(w*.30), 0, int(w*.70), int(h*.12))).convert("RGB")
    blue = red = 0
    for r, g, b in roi.get_flattened_data():
        if b > 150 and b > r*1.18 and b > g*1.08: blue += 1
        if r > 165 and r > g*1.25 and r > b*1.1: red += 1
    high, low = max(blue, red), min(blue, red)
    return ("win" if blue > red else "loss") if high and high >= 3*low else None, {"blue":blue,"red":red}

def tsv_text(tsv: str):
    return " ".join(row.get("text", "") for row in csv.DictReader(io.StringIO(tsv), delimiter="\t") if row.get("text"))

def compare(expected, actual):
    if expected is None: return None
    if isinstance(expected, str):
        def norm(s):
            s = unicodedata.normalize("NFKC", s).replace("’", "'").replace("‘", "'")
            return " ".join(s.split()).casefold()
        return norm(expected) == norm(str(actual or ""))
    return str(expected) == str(actual or "")

def run_tesseract(image_path, psm):
    proc = subprocess.run(["tesseract", str(image_path), "stdout", "-l", "eng", "--psm", str(psm), "tsv"], capture_output=True, text=True, check=True)
    return proc.stdout

def classify_failure(expected, selected, variants, field, ocr_text):
    if selected.get("alternatives") or selected.get("uncertain") and selected.get("value"):
        return "validation_failure"
    if not selected.get("value"):
        candidate_present = str(expected).casefold() in ocr_text.casefold() if expected is not None else False
        other_fields = [entry.get("value", "") for variant in variants.values() for key, entry in variant.items() if key != field]
        return "attribution_failure" if candidate_present or str(expected) in other_fields else "read_failure"
    other_values = [entry.get("value", "") for variant in variants.values() for key, entry in variant.items() if key != field]
    if str(expected) in other_values: return "attribution_failure"
    return "validation_failure" if expected is not None and selected.get("uncertain") else "read_failure"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", type=Path, required=True)
    parser.add_argument("--truth", type=Path, default=Path(__file__).with_name("ground-truth.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("phase2-benchmark-results.json"))
    parser.add_argument("--tesseract-version", action="store_true")
    args = parser.parse_args()
    if not shutil.which("tesseract"): raise SystemExit("Tesseract CLI is required for this native benchmark.")
    tesseract_version = subprocess.run(["tesseract", "--version"], capture_output=True, text=True, check=True).stdout.splitlines()[0]
    truth = json.loads(args.truth.read_text(encoding="utf-8"))
    ocr_input = {"captures": []}
    elapsed = {"psm6": [], "psm11": []}
    text_by_id = {}
    for item in truth["captures"]:
        path = args.images_dir / item["file"]
        if not path.is_file(): raise SystemExit(f"Missing corpus image: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != item["sha256"]: raise SystemExit(f"Hash mismatch: {path.name}")
        image = Image.open(path).convert("RGB")
        color, color_counts = color_cue(image)
        tsv_results = {}
        for psm in (6, 11):
            started = time.perf_counter(); tsv = run_tesseract(path, psm); elapsed[f"psm{psm}"].append((time.perf_counter()-started)*1000)
            tsv_results[f"psm{psm}"] = {"tsv":tsv, "text":tsv_text(tsv)}
        text_by_id[item["id"]] = " ".join(tsv_results[k]["text"] for k in tsv_results)
        ocr_input["captures"].append({"id":item["id"],"split":item["split"],"width":image.width,"height":image.height,"colorResult":color,"colorCounts":color_counts,"psm6":tsv_results["psm6"],"psm11":tsv_results["psm11"]})
    with tempfile.TemporaryDirectory(prefix="war-result-bench-") as temp:
        raw, parsed = Path(temp)/"ocr-input.json", Path(temp)/"parsed.json"
        raw.write_text(json.dumps(ocr_input), encoding="utf-8")
        evaluator = Path(__file__).with_name("evaluate-benchmark.cjs")
        subprocess.run(["node", str(evaluator), str(raw), str(parsed)], check=True)
        evaluated = json.loads(parsed.read_text(encoding="utf-8"))
    truth_by_id = {item["id"]:item for item in truth["captures"]}
    configs = {"tesseract-cli-psm6":[], "tesseract-cli-psm11":[], "tesseract-cli-dual-pass-conservative":[]}
    capture_reports=[]
    for result in evaluated["captures"]:
        expected = truth_by_id[result["id"]]
        candidates = {"tesseract-cli-psm6":result["variants"]["psm6"],"tesseract-cli-psm11":result["variants"]["psm11"],"tesseract-cli-dual-pass-conservative":result["fields"]}
        per_capture={"id":result["id"],"split":result["split"],"width":result["width"],"height":result["height"],"fields":{}}
        for config, values in candidates.items():
            evaluated_fields={}
            for field in FIELDS:
                want=expected.get(field)
                entry=values[field]
                got=entry.get("value")
                exact=compare(want,got)
                status="unknown_truth" if want is None else "exact" if exact else classify_failure(want,entry,result["variants"],field,text_by_id[result["id"]])
                evaluated_fields[field]={"expected":want,"extracted":got or None,"exact":exact,"confidence":entry.get("confidence"),"source":entry.get("source"),"manualCorrectionRequired":want is None or exact is not True or entry.get("uncertain",False) or bool(entry.get("alternatives")),"failureType":status,"alternatives":entry.get("alternatives")}
            configs[config].append({"id":result["id"],"split":result["split"],"fields":evaluated_fields})
            if config=="tesseract-cli-dual-pass-conservative": per_capture["fields"]=evaluated_fields
        per_capture["resultColorCue"]=result["colorResult"]
        per_capture["automaticWarnings"]=result["warnings"]
        capture_reports.append(per_capture)
    summary={}
    for config, rows in configs.items():
        summary[config]={}
        for split in ("train","holdout","all"):
            selected=[row for row in rows if split=="all" or row["split"]==split]
            summary[config][split]={}
            for field in FIELDS:
                values=[row["fields"][field] for row in selected if row["fields"][field]["expected"] is not None]
                summary[config][split][field]={"exact":sum(value["exact"] is True for value in values),"total":len(values),"readFailure":sum(value["failureType"]=="read_failure" for value in values),"attributionFailure":sum(value["failureType"]=="attribution_failure" for value in values),"validationFailure":sum(value["failureType"]=="validation_failure" for value in values)}
            eligible=sum(x["total"] for x in summary[config][split].values()); correct=sum(x["exact"] for x in summary[config][split].values())
            summary[config][split]["overall"]={"exact":correct,"total":eligible,"percent":round(100*correct/eligible,1) if eligible else None}
    report={"schemaVersion":"2.0.0","engine":f"{tesseract_version}; local only; not browser Tesseract.js","metric":"strict normalized value equality after field and side attribution; no text-presence credit","corpus":{"captureCount":9,"train":7,"holdout":2,"fieldSlots":63,"eligibleTruthFields":62,"unknownTruth":[{"capture":"capture-09","field":"opponentAlliance"}],"holdoutStatus":"Contaminated: these images were examined in prior tuning and are not an independent validation set."},"configurationHistory":[{"id":"baseline-full-psm6","iterations":["initial benchmark"],"result":"legacy metric: 36/54 text-presence matches; not comparable to strict field accuracy"},{"id":"hybrid-dual-pass-score-roi-fallback-color-result","iterations":["initial sweep"],"result":"legacy metric: 48/54 text-presence matches; opponent alliance omitted; not a strict field result"},{"id":"psm6-strict-field-attribution","parameters":{"psm":6,"lang":"eng","preprocess":"none"}},{"id":"psm11-strict-field-attribution","parameters":{"psm":11,"lang":"eng","preprocess":"none"}},{"id":"dual-pass-conservative","parameters":{"passes":[6,11],"numericConflict":"blank unless one confidence is ahead by at least 18 points","trophyCandidate":"same header row, proportional side zone, four digits"}}],"performance":{"cliMeanMs":{"psm6":round(sum(elapsed['psm6'])/9,1),"psm11":round(sum(elapsed['psm11'])/9,1)},"note":"Native Linux CLI timings only; not Tesseract.js browser or mobile timings."},"summary":summary,"captures":capture_reports}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Wrote {args.output}")
    for config, splits in summary.items():
        print(config, "train", splits["train"]["overall"], "holdout", splits["holdout"]["overall"], "all", splits["all"]["overall"])

if __name__=="__main__": main()
