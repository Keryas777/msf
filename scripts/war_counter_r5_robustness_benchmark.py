#!/usr/bin/env python3
import hashlib
import io
import json
import os
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2
import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/data/war-counter-vision/portrait-signatures.json"
OUT = ROOT / "benchmark-r5-akaze-robustness-report.json"
CACHE = ROOT / ".cache/war-counter-r5-portraits"
FIXTURE = ROOT / "benchmarks/war-counter-r5/fixtures/war-counter-r5-benchmark-1786421094500.zip"
CACHE.mkdir(parents=True, exist_ok=True)

FIXTURE_SHA256 = "147138e710e63e30f23984efd4d8e6a0fddc83dcbb6a073de7c7cad674831b9a"
VARIANTS = (
    "base", "tight", "loose", "shift-left", "shift-right",
    "shift-up", "shift-down", "red-neutral",
)
SLOT_TRUTH = {
    "G1": "Knull",
    "G2": "Toxin",
    "G3": "Venom",
    "G4": "SymbioteQuicksilver",
    "G5": "Riot",
    "D1": "Gwenpool",
    "D2": "JeffTheLandShark",
    "D3": "SquirrelGirl",
    "D4": "SheHulk",
    "D5": "Deadpool",
}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_fixture():
    if not FIXTURE.exists():
        raise RuntimeError(f"Committed R5 fixture is missing: {FIXTURE}")
    data = FIXTURE.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if len(data) != 689033 or digest != FIXTURE_SHA256:
        raise RuntimeError(
            f"R5 fixture integrity failure: bytes={len(data)} sha256={digest} "
            f"expected bytes=689033 sha256={FIXTURE_SHA256}"
        )
    print(f"fixture verified: {len(data)} bytes sha256={digest}")


def download_one(item):
    cid = item["id"]
    url = item.get("u")
    if not url:
        return cid, None, "missing-url"
    suffix = os.path.splitext(url.split("?", 1)[0])[1] or ".png"
    dest = CACHE / f"{cid}{suffix}"
    if dest.exists() and dest.stat().st_size > 100:
        return cid, dest, None
    last = None
    for attempt in range(3):
        try:
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            dest.write_bytes(response.content)
            return cid, dest, None
        except Exception as exc:
            last = str(exc)
            time.sleep(0.4 * (attempt + 1))
    return cid, None, last


def to_cv_gray(image):
    rgb = np.asarray(image.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    height, width = gray.shape[:2]
    scale = 320.0 / max(width, height)
    if scale != 1.0:
        gray = cv2.resize(
            gray,
            (max(32, round(width * scale)), max(32, round(height * scale))),
            interpolation=cv2.INTER_CUBIC,
        )
    return gray


def describe(detector, image):
    _keypoints, descriptors = detector.detectAndCompute(to_cv_gray(image), None)
    return descriptors


def match_score(query_desc, ref_desc):
    if query_desc is None or ref_desc is None or len(query_desc) < 2 or len(ref_desc) < 2:
        return 0.0, 0
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    pairs = matcher.knnMatch(query_desc, ref_desc, k=2)
    good = []
    for pair in pairs:
        if len(pair) < 2:
            continue
        first, second = pair
        if first.distance < 0.76 * second.distance:
            good.append(first)
    denom = max(1.0, min(len(query_desc), len(ref_desc)))
    score = (len(good) / denom) * (1.0 + np.sqrt(len(good)))
    return float(score), len(good)


def summarize(ranks):
    return {
        "count": len(ranks),
        "top1": sum(rank <= 1 for rank in ranks),
        "top5": sum(rank <= 5 for rank in ranks),
        "top10": sum(rank <= 10 for rank in ranks),
        "top20": sum(rank <= 20 for rank in ranks),
        "meanRank": round(sum(ranks) / len(ranks), 3) if ranks else None,
        "worstRank": max(ranks) if ranks else None,
    }


def main():
    started = time.time()
    print(f"OpenCV {cv2.__version__}")
    if cv2.__version__ != "4.10.0":
        raise RuntimeError(f"This certification must run on OpenCV 4.10.0, got {cv2.__version__}")
    verify_fixture()

    catalog = load_json(CATALOG)
    refs = [item for item in catalog.get("items", []) if item.get("id") and item.get("u")]
    downloaded = {}
    errors = {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(download_one, item): item for item in refs}
        for future in as_completed(futures):
            cid, path, error = future.result()
            if path:
                downloaded[cid] = path
            else:
                errors[cid] = error

    usable = [item for item in refs if item["id"] in downloaded]
    if len(usable) < 400:
        raise RuntimeError(f"Too few reference portraits downloaded: {len(usable)}")

    detector = cv2.AKAZE_create(threshold=0.0008)
    ref_ids = []
    ref_desc = []
    for item in usable:
        try:
            with Image.open(downloaded[item["id"]]) as image:
                desc = describe(detector, image.convert("RGB"))
            ref_ids.append(item["id"])
            ref_desc.append(desc)
        except Exception as exc:
            errors[item["id"]] = f"decode/describe: {exc}"

    rows = []
    with zipfile.ZipFile(FIXTURE) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        names = set(archive.namelist())
        for slot, expected in SLOT_TRUTH.items():
            prefix = next(
                name.rsplit("/", 1)[0]
                for name in names
                if name.startswith(f"crops/{slot}-") and name.endswith("/base.jpg")
            )
            for variant in VARIANTS:
                member = f"{prefix}/{variant}.jpg"
                raw = archive.read(member)
                with Image.open(io.BytesIO(raw)) as image:
                    query_desc = describe(detector, image.convert("RGB"))
                scored = []
                for cid, desc in zip(ref_ids, ref_desc):
                    score, good = match_score(query_desc, desc)
                    scored.append((cid, score, good))
                scored.sort(key=lambda row: (-row[1], -row[2], row[0]))
                ranked_ids = [row[0] for row in scored]
                rank = ranked_ids.index(expected) + 1
                rows.append({
                    "slot": slot,
                    "expectedId": expected,
                    "variant": variant,
                    "rank": rank,
                    "top20": [
                        {"id": cid, "score": round(score, 8), "goodMatches": good}
                        for cid, score, good in scored[:20]
                    ],
                })
                print(f"{slot:>2} {variant:<12} {expected:<24} rank {rank}")

    all_ranks = [row["rank"] for row in rows]
    by_variant = {
        variant: summarize([row["rank"] for row in rows if row["variant"] == variant])
        for variant in VARIANTS
    }
    by_character = {
        expected: {
            "ranks": {
                row["variant"]: row["rank"]
                for row in rows
                if row["expectedId"] == expected
            },
            "summary": summarize([row["rank"] for row in rows if row["expectedId"] == expected]),
        }
        for expected in SLOT_TRUTH.values()
    }

    report = {
        "schemaVersion": "1.0.1",
        "benchmark": "R5 exact 80-crop AKAZE robustness certification",
        "fixturePath": str(FIXTURE.relative_to(ROOT)),
        "fixtureSha256": FIXTURE_SHA256,
        "sourceCapture": manifest.get("source"),
        "openCvVersion": cv2.__version__,
        "akazeThreshold": 0.0008,
        "referenceResizeMax": 320,
        "referenceCount": len(ref_ids),
        "summary": summarize(all_ranks),
        "byVariant": by_variant,
        "byCharacter": by_character,
        "rows": rows,
        "downloadErrors": errors,
        "elapsedSeconds": round(time.time() - started, 2),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("summary", report["summary"])


if __name__ == "__main__":
    main()
