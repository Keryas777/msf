#!/usr/bin/env python3
"""Local, repeatable Tesseract CLI sweep. No network, OCR service, or OpenCV."""
from __future__ import annotations
import argparse, hashlib, json, re, shutil, subprocess, tempfile, time, unicodedata
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageChops

CONFIGS = [
    {"id":"baseline-full-psm6", "psm":6, "scale":1, "preprocess":"none"},
    {"id":"sparse-full-psm11", "psm":11, "scale":1, "preprocess":"none"},
    {"id":"gray-2x-psm6", "psm":6, "scale":2, "preprocess":"gray"},
    {"id":"autocontrast-2x-psm6", "psm":6, "scale":2, "preprocess":"autocontrast"},
    {"id":"autocontrast-2x-psm11", "psm":11, "scale":2, "preprocess":"autocontrast"},
    {"id":"adaptive-threshold-psm11", "psm":11, "scale":2, "preprocess":"adaptive"},
    {"id":"label-guided-score-roi-psm7", "psm":6, "scale":1, "preprocess":"none", "scoreRoi":True},
    {"id":"label-guided-score-roi-psm13", "psm":6, "scale":1, "preprocess":"none", "scoreRoi":True, "scorePsm":13},
    {"id":"label-guided-score-roi-psm7-3x", "psm":6, "scale":1, "preprocess":"none", "scoreRoi":True, "scoreScale":3},
    {"id":"yellow-mask-score-roi-psm7", "psm":6, "scale":1, "preprocess":"none", "scoreRoi":True, "scoreColorMask":"yellow"},
    {"id":"label-guided-trophy-roi-psm7", "psm":11, "scale":1, "preprocess":"none", "trophyRoi":True, "colorResult":True},
    {"id":"hybrid-dual-pass-color-result", "psm":6, "secondPsm":11, "scale":1, "preprocess":"none", "colorResult":True},
    {"id":"hybrid-dual-pass-score-roi-fallback-color-result", "psm":6, "secondPsm":11, "scale":1, "preprocess":"none", "scoreRoi":True, "scoreRoiFallback":True, "colorResult":True},
]
FIELDS = ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "result"]

def norm(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", value.lower())

def image_for(path, config, tmp):
    im = Image.open(path).convert("RGB")
    if config["preprocess"] in ("gray", "autocontrast", "adaptive"):
        im = ImageOps.grayscale(im)
        if config["preprocess"] == "autocontrast":
            im = ImageOps.autocontrast(im, cutoff=1)
            im = ImageEnhance.Contrast(im).enhance(1.35)
        elif config["preprocess"] == "adaptive":
            gray = ImageOps.grayscale(im)
            local = gray.filter(ImageFilter.BoxBlur(10))
            # Pixel brighter than the local background minus a small bias.
            im = ImageChops.subtract(gray, local, offset=8).point(lambda value: 255 if value else 0)
    if config["scale"] != 1:
        im = im.resize((im.width * config["scale"], im.height * config["scale"]), Image.Resampling.LANCZOS)
    target = Path(tmp) / "input.png"
    im.save(target)
    return target

def contains_exact(text, value, field):
    if value is None:
        return None
    if field in ("localScore", "opponentScore"):
        rows = [line for line in text.splitlines() if "POINTS" in line.upper()]
        return any(str(value) in re.sub(r"\D", "", line) for line in rows)
    if field in ("localTrophies", "opponentTrophies"):
        return re.search(rf"(?<!\d){re.escape(str(value))}(?!\d)", text) is not None
    if field == "result":
        hay = norm(text)
        return ("victoire" in hay) if value == "win" else ("defaite" in hay or "defaite" in hay)
    return norm(value) in norm(text)

def run_one(image_path, config):
    with tempfile.TemporaryDirectory(prefix="war-ocr-") as tmp:
        prepared = image_for(image_path, config, tmp)
        start = time.perf_counter()
        texts=[]
        for psm in [config["psm"]] + ([config["secondPsm"]] if config.get("secondPsm") else []):
            proc = subprocess.run(["tesseract", str(prepared), "stdout", "-l", "eng", "--psm", str(psm), "-c", "preserve_interword_spaces=1"], capture_output=True, text=True, check=True)
            texts.append(proc.stdout)
        if config.get("scoreRoi"):
            tsv = subprocess.run(["tesseract", str(prepared), "stdout", "-l", "eng", "--psm", "6", "tsv"], capture_output=True, text=True, check=True).stdout
            rows = tsv.splitlines()
            header = rows[0].split("\t") if rows else []
            label_row = None
            for row in rows[1:]:
                values = row.split("\t")
                if len(values) >= 12 and values[11].strip().upper() == "POINTS":
                    label_row = dict(zip(header, values))
                    break
            if label_row:
                source = Image.open(image_path).convert("RGB")
                w,h = source.size
                cy = int(label_row["top"]) + int(label_row["height"]) / 2
                y1, y2 = max(0, int(cy - .035*h)), min(h, int(cy + .035*h))
                roi_text=[]
                score_line = next((line for line in texts[0].splitlines() if "POINTS" in line.upper()), "")
                split_at = score_line.upper().find("POINTS")
                left_part = score_line[:split_at] if split_at >= 0 else ""
                right_part = score_line[split_at+6:] if split_at >= 0 else ""
                for side, (x1,x2) in [("left",(.18,.43)),("right",(.59,.80))]:
                    side_text = left_part if side == "left" else right_part
                    has_six_digit_candidate = re.search(r"\d(?:[\s,.]*\d){5}", side_text) is not None
                    if config.get("scoreRoiFallback") and has_six_digit_candidate:
                        continue
                    crop = source.crop((int(w*x1), y1, int(w*x2), y2))
                    if config.get("scoreColorMask") == "yellow":
                        pixels=crop.load()
                        for yy in range(crop.height):
                            for xx in range(crop.width):
                                red,green,blue=pixels[xx,yy]
                                value=255 if red>185 and green>150 and blue<165 and red-green<140 else 0
                                pixels[xx,yy]=(value,value,value)
                    else:
                        crop = ImageOps.autocontrast(ImageOps.grayscale(crop), cutoff=1)
                    score_scale = int(config.get("scoreScale", 2))
                    crop = crop.resize((crop.width*score_scale, crop.height*score_scale), Image.Resampling.LANCZOS)
                    crop_path = Path(tmp) / f"{side}.png"
                    crop.save(crop_path)
                    score_psm = int(config.get("scorePsm", 7))
                    digit_text = subprocess.run(["tesseract", str(crop_path), "stdout", "-l", "eng", "--psm", str(score_psm), "-c", "tessedit_char_whitelist=0123456789"], capture_output=True, text=True, check=True).stdout.strip()
                    roi_text.append(digit_text)
                if roi_text:
                    texts.append("POINTS " + " ".join(roi_text))
        if config.get("trophyRoi"):
            tsv = subprocess.run(["tesseract", str(prepared), "stdout", "-l", "eng", "--psm", "11", "tsv"], capture_output=True, text=True, check=True).stdout
            rows = tsv.splitlines()
            header = rows[0].split("\t") if rows else []
            label_row = None
            for row in rows[1:]:
                values = row.split("\t")
                if len(values) >= 12 and values[11].strip().upper() == "LOSP":
                    label_row = dict(zip(header, values))
                    break
            if label_row:
                source = Image.open(image_path).convert("RGB")
                w,h = source.size
                cy = int(label_row["top"]) + int(label_row["height"]) / 2 + .067*h
                y1, y2 = max(0, int(cy - .035*h)), min(h, int(cy + .035*h))
                roi_text=[]
                for side, (x1,x2) in [("left",(.12,.38)),("right",(.58,.78))]:
                    crop = source.crop((int(w*x1), y1, int(w*x2), y2))
                    crop = ImageOps.autocontrast(ImageOps.grayscale(crop), cutoff=1)
                    crop = crop.resize((crop.width*3, crop.height*3), Image.Resampling.LANCZOS)
                    crop_path = Path(tmp) / f"trophy-{side}.png"
                    crop.save(crop_path)
                    trophy_text = subprocess.run(["tesseract", str(crop_path), "stdout", "-l", "eng", "--psm", "7", "-c", "tessedit_char_whitelist=0123456789+-"], capture_output=True, text=True, check=True).stdout.strip()
                    roi_text.append(trophy_text)
                texts.append("TROPHIES " + " ".join(roi_text))
        return "\n".join(texts), (time.perf_counter() - start) * 1000

def title_color_result(image_path):
    im=Image.open(image_path).convert("RGB")
    w,h=im.size
    roi=im.crop((int(.30*w),0,int(.70*w),int(.12*h)))
    blue=red=0
    for r,g,b in roi.get_flattened_data():
        if b>150 and b>r*1.18 and b>g*1.08: blue+=1
        if r>165 and r>g*1.25 and r>b*1.1: red+=1
    total=blue+red
    if not total or max(blue,red) < 3*min(blue,red): return None,{"blue":blue,"red":red}
    return ("win" if blue>red else "loss"),{"blue":blue,"red":red}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", type=Path, required=True, help="Private/local directory containing the nine supplied images")
    parser.add_argument("--truth", type=Path, default=Path(__file__).with_name("ground-truth.json"))
    parser.add_argument("--output", type=Path, default=Path("war_ocr_benchmark_results.json"))
    parser.add_argument("--config", help="Run one named configuration from CONFIGS")
    args = parser.parse_args()
    if not shutil.which("tesseract"):
        raise SystemExit("Tesseract CLI is required for this native experiment.")
    truth = json.loads(args.truth.read_text(encoding="utf-8"))
    summary = {"schemaVersion":"1.0.0", "engine":"Tesseract CLI; local only", "metric":"Expected field text present in OCR text; result uses color detector in hybrid config. Not structured extraction precision.", "configs":[]}
    configs = [c for c in CONFIGS if not args.config or c["id"] == args.config]
    if args.config and not configs:
        raise SystemExit(f"Unknown config: {args.config}")
    for config in configs:
        capture_results = []
        times = []
        for capture in truth["captures"]:
            image_path = args.images_dir / capture["file"]
            if not image_path.is_file():
                raise SystemExit(f"Missing image: {image_path}")
            digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
            if capture.get("sha256") and digest != capture["sha256"]:
                raise SystemExit(f"Image hash mismatch: {image_path}")
            text, elapsed = run_one(image_path, config)
            times.append(elapsed)
            fields = {field: contains_exact(text, capture.get(field), field) for field in FIELDS}
            color_result, color_counts = title_color_result(image_path)
            if config.get("colorResult"):
                fields["result"] = color_result == capture["result"]
            capture_results.append({"id":capture["id"], "split":capture["split"], "fields":fields, "titleColor":color_counts})
        scores = {}
        for field in FIELDS:
            eligible = [c for c in capture_results if c["fields"][field] is not None]
            scores[field] = {"correct":sum(c["fields"][field] is True for c in eligible), "total":len(eligible)}
        summary["configs"].append({"config":config, "accuracy":scores, "meanMs":round(sum(times)/len(times),1), "captures":capture_results})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"Wrote {args.output}")
    for entry in summary["configs"]:
        ac=entry["accuracy"]
        print(entry["config"]["id"], f"{entry['meanMs']}ms", " ".join(f"{k}={v['correct']}/{v['total']}" for k,v in ac.items()))

if __name__ == "__main__":
    main()
