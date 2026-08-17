#!/usr/bin/env python3
import base64
import io
import itertools
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2
import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/data/war-counter-vision/portrait-signatures.json"
WAR_COUNTERS = ROOT / "docs/data/war-counters.json"
BENCH_DIR = ROOT / "benchmarks/war-counter-r5/base-128"
BENCH_SLOTS = ("G1", "G2", "G3", "G4", "G5", "D1", "D2", "D3", "D4", "D5")
OUT = ROOT / "benchmark-r5-feature-report.json"
CACHE = ROOT / ".cache/war-counter-r5-portraits"
CACHE.mkdir(parents=True, exist_ok=True)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_benchmark_slots():
    rows = []
    for slot_name in BENCH_SLOTS:
        row = load_json(BENCH_DIR / f"{slot_name}.json")
        if row.get("slot") != slot_name:
            raise RuntimeError(f"Unexpected benchmark slot in {slot_name}.json")
        rows.append(row)
    return rows


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


def create_akaze():
    legacy_factory = getattr(cv2, "AKAZE_create", None)
    if callable(legacy_factory):
        return legacy_factory(threshold=0.0008), "cv2.AKAZE_create"

    akaze_class = getattr(cv2, "AKAZE", None)
    class_factory = getattr(akaze_class, "create", None) if akaze_class is not None else None
    if callable(class_factory):
        return class_factory(threshold=0.0008), "cv2.AKAZE.create"

    raise RuntimeError(
        "AKAZE is unavailable in this OpenCV build "
        f"(cv2.__version__={getattr(cv2, '__version__', 'unknown')})"
    )


def make_detectors():
    akaze, akaze_factory = create_akaze()
    print(
        "OpenCV feature factories: "
        f"version={getattr(cv2, '__version__', 'unknown')} "
        f"ORB=cv2.ORB_create AKAZE={akaze_factory}"
    )
    return {
        "orb": cv2.ORB_create(
            nfeatures=1800,
            scaleFactor=1.2,
            nlevels=8,
            edgeThreshold=15,
            fastThreshold=8,
        ),
        "akaze": akaze,
    }


def describe(detector, gray):
    keypoints, descriptors = detector.detectAndCompute(gray, None)
    return keypoints or [], descriptors


def match_score(query_desc, ref_desc, norm):
    if query_desc is None or ref_desc is None or len(query_desc) < 2 or len(ref_desc) < 2:
        return 0.0, 0
    matcher = cv2.BFMatcher(norm, crossCheck=False)
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


def rank_method(method_name, detector, norm, query_images, ref_images, ref_ids, expected, slots):
    ref_desc = []
    for image in ref_images:
        _, desc = describe(detector, to_cv_gray(image))
        ref_desc.append(desc)

    results = []
    rankings = []
    for slot, target, image in zip(slots, expected, query_images):
        _, query_desc = describe(detector, to_cv_gray(image))
        scored = []
        for cid, desc in zip(ref_ids, ref_desc):
            score, good = match_score(query_desc, desc, norm)
            scored.append((cid, score, good))
        scored.sort(key=lambda row: (-row[1], -row[2], row[0]))
        ranked_ids = [row[0] for row in scored]
        rank = ranked_ids.index(target) + 1 if target in ranked_ids else None
        rankings.append(ranked_ids)
        results.append({
            "slot": slot,
            "expectedId": target,
            "rank": rank,
            "top20": [
                {"id": cid, "score": round(score, 8), "goodMatches": good}
                for cid, score, good in scored[:20]
            ],
        })
        print(f"{method_name:>5} {slot:>2} {target:<24} rank {rank}")
    return results, rankings


def summarize(results):
    ranks = [row["rank"] for row in results if row["rank"] is not None]
    return {
        "top1": sum(rank <= 1 for rank in ranks),
        "top5": sum(rank <= 5 for rank in ranks),
        "top10": sum(rank <= 10 for rank in ranks),
        "top20": sum(rank <= 20 for rank in ranks),
        "meanRank": round(sum(ranks) / len(ranks), 2) if ranks else None,
    }


def fuse_rrf(rankings_by_method, ref_ids, expected, slots, k=60.0):
    results = []
    fused_rankings = []
    for slot_index, (slot, target) in enumerate(zip(slots, expected)):
        scores = {cid: 0.0 for cid in ref_ids}
        for method_rankings in rankings_by_method:
            for rank, cid in enumerate(method_rankings[slot_index], start=1):
                scores[cid] += 1.0 / (k + rank)
        ordered = sorted(ref_ids, key=lambda cid: (-scores[cid], cid))
        fused_rankings.append(ordered)
        rank = ordered.index(target) + 1
        results.append({
            "slot": slot,
            "expectedId": target,
            "rank": rank,
            "top20": [{"id": cid, "score": round(scores[cid], 8)} for cid in ordered[:20]],
        })
        print(f"  rrf {slot:>2} {target:<24} rank {rank}")
    return results, fused_rankings


def load_defense_teams(valid_ids):
    teams = []
    seen = set()
    for row in load_json(WAR_COUNTERS):
        chars = tuple(row.get(f"def_char{i}") for i in range(1, 6))
        if any(not cid or cid not in valid_ids for cid in chars):
            continue
        signature = tuple(sorted(chars))
        if signature in seen:
            continue
        seen.add(signature)
        teams.append({
            "key": row.get("def_key") or "",
            "family": row.get("def_family") or "",
            "variant": row.get("def_variant") or "",
            "chars": chars,
        })
    return teams


def score_team_rankings(defense_rankings, ref_ids, expected_defense):
    teams = load_defense_teams(set(ref_ids))
    rank_maps = [
        {cid: rank for rank, cid in enumerate(ranking, start=1)}
        for ranking in defense_rankings
    ]
    scored = []
    for team in teams:
        best_sum = None
        best_assignment = None
        for assignment in itertools.permutations(team["chars"]):
            rank_sum = sum(rank_maps[index][cid] for index, cid in enumerate(assignment))
            if best_sum is None or rank_sum < best_sum:
                best_sum = rank_sum
                best_assignment = assignment
        scored.append({**team, "bestRankSum": best_sum, "assignment": best_assignment})
    scored.sort(key=lambda row: (row["bestRankSum"], row["key"]))
    expected_set = frozenset(expected_defense)
    target_rank = next(
        (idx for idx, row in enumerate(scored, start=1) if frozenset(row["chars"]) == expected_set),
        None,
    )
    return {
        "teamCount": len(teams),
        "targetRank": target_rank,
        "target": (
            {**scored[target_rank - 1], "assignment": list(scored[target_rank - 1]["assignment"])}
            if target_rank
            else None
        ),
        "top5": [
            {**row, "assignment": list(row["assignment"]), "rank": idx}
            for idx, row in enumerate(scored[:5], start=1)
        ],
    }


def main():
    started = time.time()
    catalog = load_json(CATALOG)
    refs = [item for item in catalog.get("items", []) if item.get("id") and item.get("u")]
    bench = load_benchmark_slots()

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

    ref_images = []
    ref_ids = []
    for item in usable:
        try:
            with Image.open(downloaded[item["id"]]) as image:
                ref_images.append(image.convert("RGB"))
                ref_ids.append(item["id"])
        except Exception as exc:
            errors[item["id"]] = f"decode: {exc}"

    query_images = []
    expected = []
    slots = []
    for row in bench:
        raw = base64.b64decode(row["jpegBase64"])
        with Image.open(io.BytesIO(raw)) as image:
            query_images.append(image.convert("RGB"))
        expected.append(row["characterId"])
        slots.append(row["slot"])

    detectors = make_detectors()
    orb_results, orb_rankings = rank_method(
        "ORB",
        detectors["orb"],
        cv2.NORM_HAMMING,
        query_images,
        ref_images,
        ref_ids,
        expected,
        slots,
    )
    akaze_results, akaze_rankings = rank_method(
        "AKAZE",
        detectors["akaze"],
        cv2.NORM_HAMMING,
        query_images,
        ref_images,
        ref_ids,
        expected,
        slots,
    )
    rrf_results, rrf_rankings = fuse_rrf(
        [orb_rankings, akaze_rankings], ref_ids, expected, slots
    )

    report = {
        "schemaVersion": "1.0.1",
        "benchmark": "R5 local feature matching on exact 128px crops",
        "openCvVersion": getattr(cv2, "__version__", "unknown"),
        "referenceCount": len(ref_ids),
        "methods": {
            "orb": {
                "summary": summarize(orb_results),
                "defenseTeamBenchmark": score_team_rankings(
                    orb_rankings[5:10], ref_ids, expected[5:10]
                ),
                "slots": orb_results,
            },
            "akaze": {
                "summary": summarize(akaze_results),
                "defenseTeamBenchmark": score_team_rankings(
                    akaze_rankings[5:10], ref_ids, expected[5:10]
                ),
                "slots": akaze_results,
            },
            "orbAkazeRrf": {
                "summary": summarize(rrf_results),
                "defenseTeamBenchmark": score_team_rankings(
                    rrf_rankings[5:10], ref_ids, expected[5:10]
                ),
                "slots": rrf_results,
            },
        },
        "downloadErrors": errors,
        "elapsedSeconds": round(time.time() - started, 2),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("summary:")
    for name, data in report["methods"].items():
        print(name, data["summary"], "RetCon", data["defenseTeamBenchmark"]["targetRank"])


if __name__ == "__main__":
    main()
