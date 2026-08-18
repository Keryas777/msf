#!/usr/bin/env python3
"""Benchmark a mobile-friendly two-stage AKAZE matcher on the exact R5 fixture.

Stage 1 uses one global BFMatcher call per crop against all reference descriptors,
then aggregates descriptor votes by character. Stage 2 reruns the already validated
exact per-reference Lowe-ratio score only on the global shortlist.

The goal is to measure whether browser/mobile work can avoid 450 exact matcher calls
per crop without sacrificing shortlist recall.
"""

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
FIXTURE = ROOT / "benchmarks/war-counter-r5/fixtures/war-counter-r5-benchmark-1786421094500.zip"
OUT = ROOT / "benchmark-r5-akaze-mobile-shortlist-report.json"
CACHE = ROOT / ".cache/war-counter-r5-portraits"
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
SHORTLIST_SIZES = (10, 20, 30, 40, 60)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_fixture():
    data = FIXTURE.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if len(data) != 689033 or digest != FIXTURE_SHA256:
        raise RuntimeError(f"Fixture integrity failure: {len(data)} bytes {digest}")


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


def exact_match_score(query_desc, ref_desc, matcher):
    if query_desc is None or ref_desc is None or len(query_desc) < 2 or len(ref_desc) < 2:
        return 0.0, 0
    pairs = matcher.knnMatch(query_desc, ref_desc, k=2)
    good = 0
    for pair in pairs:
        if len(pair) >= 2 and pair[0].distance < 0.76 * pair[1].distance:
            good += 1
    denom = max(1.0, min(len(query_desc), len(ref_desc)))
    return float((good / denom) * (1.0 + np.sqrt(good))), good


def global_vote_ranking(query_desc, all_desc, descriptor_owner, ref_counts, matcher):
    """Rank characters from one global KNN call.

    Use k=4 globally. Each query descriptor gives inverse-distance votes to distinct
    character owners among its nearest descriptors. A small normalization by the
    square root of the reference descriptor count avoids favoring very dense refs.
    """
    if query_desc is None or len(query_desc) < 2:
        return []
    pairs = matcher.knnMatch(query_desc, all_desc, k=4)
    votes = {}
    hits = {}
    for nearest in pairs:
        seen = set()
        for match in nearest:
            owner = descriptor_owner[match.trainIdx]
            if owner in seen:
                continue
            seen.add(owner)
            # Hamming distance is lower-is-better; +8 prevents tiny-distance spikes.
            votes[owner] = votes.get(owner, 0.0) + 1.0 / (8.0 + float(match.distance))
            hits[owner] = hits.get(owner, 0) + 1
    rows = []
    for owner, vote in votes.items():
        normalized = vote / np.sqrt(max(1, ref_counts[owner]))
        rows.append((owner, float(normalized), hits.get(owner, 0)))
    rows.sort(key=lambda row: (-row[1], -row[2], row[0]))
    return rows


def summarize(ranks):
    return {
        "count": len(ranks),
        "top1": sum(rank <= 1 for rank in ranks),
        "top5": sum(rank <= 5 for rank in ranks),
        "top10": sum(rank <= 10 for rank in ranks),
        "top20": sum(rank <= 20 for rank in ranks),
        "top30": sum(rank <= 30 for rank in ranks),
        "top40": sum(rank <= 40 for rank in ranks),
        "top60": sum(rank <= 60 for rank in ranks),
        "meanRank": round(sum(ranks) / len(ranks), 3) if ranks else None,
        "worstRank": max(ranks) if ranks else None,
    }


def main():
    started = time.perf_counter()
    print(f"OpenCV {cv2.__version__}")
    if cv2.__version__ != "4.10.0":
        raise RuntimeError(f"Benchmark must run on OpenCV 4.10.0, got {cv2.__version__}")
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

    detector = cv2.AKAZE_create(threshold=0.0008)
    ref_desc = {}
    descriptor_blocks = []
    descriptor_owner = []
    ref_counts = {}
    for item in refs:
        cid = item["id"]
        path = downloaded.get(cid)
        if not path:
            continue
        try:
            with Image.open(path) as image:
                desc = describe(detector, image)
            if desc is None or not len(desc):
                continue
            ref_desc[cid] = desc
            ref_counts[cid] = len(desc)
            descriptor_blocks.append(desc)
            descriptor_owner.extend([cid] * len(desc))
        except Exception as exc:
            errors[cid] = f"decode/describe: {exc}"

    if len(ref_desc) < 400:
        raise RuntimeError(f"Too few usable reference descriptors: {len(ref_desc)}")
    all_desc = np.vstack(descriptor_blocks)
    descriptor_owner = np.asarray(descriptor_owner, dtype=object)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    print(f"references={len(ref_desc)} descriptors={len(all_desc)}")

    rows = []
    global_times = []
    refine_times = {size: [] for size in SHORTLIST_SIZES}

    with zipfile.ZipFile(FIXTURE) as archive:
        names = set(archive.namelist())
        for slot, expected in SLOT_TRUTH.items():
            prefix = next(
                name.rsplit("/", 1)[0]
                for name in names
                if name.startswith(f"crops/{slot}-") and name.endswith("/base.jpg")
            )
            for variant in VARIANTS:
                raw = archive.read(f"{prefix}/{variant}.jpg")
                with Image.open(io.BytesIO(raw)) as image:
                    query_desc = describe(detector, image)

                t0 = time.perf_counter()
                global_rows = global_vote_ranking(query_desc, all_desc, descriptor_owner, ref_counts, matcher)
                global_ms = (time.perf_counter() - t0) * 1000.0
                global_times.append(global_ms)
                global_ids = [item[0] for item in global_rows]
                global_rank = global_ids.index(expected) + 1 if expected in global_ids else len(ref_desc) + 1

                refined = {}
                for size in SHORTLIST_SIZES:
                    shortlist = global_ids[:size]
                    t1 = time.perf_counter()
                    scored = []
                    for cid in shortlist:
                        score, good = exact_match_score(query_desc, ref_desc[cid], matcher)
                        scored.append((cid, score, good))
                    scored.sort(key=lambda row: (-row[1], -row[2], row[0]))
                    refine_times[size].append((time.perf_counter() - t1) * 1000.0)
                    ids = [item[0] for item in scored]
                    rank = ids.index(expected) + 1 if expected in ids else None
                    refined[str(size)] = {
                        "expectedPresent": expected in shortlist,
                        "rankWithinShortlist": rank,
                        "top5": [item[0] for item in scored[:5]],
                    }

                rows.append({
                    "slot": slot,
                    "expectedId": expected,
                    "variant": variant,
                    "globalRank": global_rank,
                    "globalTop10": global_ids[:10],
                    "globalMs": round(global_ms, 3),
                    "refined": refined,
                })
                print(f"{slot:>2} {variant:<12} global #{global_rank:>3} " + " ".join(
                    f"N{size}:{refined[str(size)]['rankWithinShortlist'] or '-'}" for size in SHORTLIST_SIZES
                ))

    global_ranks = [row["globalRank"] for row in rows]
    shortlist_summary = {}
    for size in SHORTLIST_SIZES:
        values = [row["refined"][str(size)] for row in rows]
        present = sum(value["expectedPresent"] for value in values)
        ranks = [value["rankWithinShortlist"] for value in values if value["rankWithinShortlist"] is not None]
        shortlist_summary[str(size)] = {
            "recall": present,
            "recallPct": round(present * 100.0 / len(values), 2),
            "refinedTop1": sum(rank == 1 for rank in ranks),
            "refinedTop5": sum(rank <= 5 for rank in ranks),
            "meanRefineMs": round(float(np.mean(refine_times[size])), 3),
            "p95RefineMs": round(float(np.percentile(refine_times[size], 95)), 3),
        }

    report = {
        "schemaVersion": "1.0.0",
        "benchmark": "R5 AKAZE mobile-friendly global shortlist",
        "fixtureSha256": FIXTURE_SHA256,
        "openCvVersion": cv2.__version__,
        "referenceCount": len(ref_desc),
        "descriptorCount": int(len(all_desc)),
        "global": summarize(global_ranks),
        "timing": {
            "meanGlobalMs": round(float(np.mean(global_times)), 3),
            "p95GlobalMs": round(float(np.percentile(global_times, 95)), 3),
        },
        "shortlists": shortlist_summary,
        "rows": rows,
        "downloadErrors": errors,
        "elapsedSeconds": round(time.perf_counter() - started, 2),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("global", report["global"])
    print("timing", report["timing"])
    print("shortlists", json.dumps(shortlist_summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
