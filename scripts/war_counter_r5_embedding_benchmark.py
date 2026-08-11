#!/usr/bin/env python3
import base64
import io
import itertools
import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision.models import mobilenet_v3_large, MobileNet_V3_Large_Weights

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/data/war-counter-vision/portrait-signatures.json"
WAR_COUNTERS = ROOT / "docs/data/war-counters.json"
BENCH_DIR = ROOT / "benchmarks/war-counter-r5/base-128"
BENCH_SLOTS = ("G1", "G2", "G3", "G4", "G5", "D1", "D2", "D3", "D4", "D5")
OUT = ROOT / "benchmark-r5-embedding-report.json"
CACHE = ROOT / ".cache/war-counter-r5-portraits"
CACHE.mkdir(parents=True, exist_ok=True)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_benchmark_slots():
    slots = []
    for slot_name in BENCH_SLOTS:
        path = BENCH_DIR / f"{slot_name}.json"
        if not path.exists():
            raise RuntimeError(f"Missing benchmark crop: {path}")
        slot = load_json(path)
        if slot.get("slot") != slot_name:
            raise RuntimeError(f"Unexpected slot in {path}: {slot.get('slot')}")
        slots.append(slot)
    return slots


def load_defense_teams(valid_ids):
    teams = []
    seen = set()
    for row in load_json(WAR_COUNTERS):
        chars = tuple(row.get(f"def_char{i}") for i in range(1, 6))
        if any(not char or char not in valid_ids for char in chars):
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
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            dest.write_bytes(r.content)
            return cid, dest, None
        except Exception as exc:
            last = str(exc)
            time.sleep(0.4 * (attempt + 1))
    return cid, None, last


def embed_images(model, preprocess, images, batch_size=32):
    out = []
    model.eval()
    with torch.inference_mode():
        for start in range(0, len(images), batch_size):
            batch = torch.stack([preprocess(im) for im in images[start:start + batch_size]])
            emb = model(batch)
            emb = F.normalize(emb, dim=1)
            out.append(emb.cpu())
    return torch.cat(out, dim=0)


def score_defense_teams(sim, ref_ids, expected):
    ref_index = {cid: index for index, cid in enumerate(ref_ids)}
    valid_ids = set(ref_index)
    teams = load_defense_teams(valid_ids)
    defense_rows = list(range(5, 10))

    rank_maps = []
    for query_index in defense_rows:
        order = torch.argsort(sim[query_index], descending=True).tolist()
        rank_maps.append({ref_ids[ref_pos]: rank for rank, ref_pos in enumerate(order, start=1)})

    scored = []
    for team in teams:
        best_rank_sum = None
        best_rank_assignment = None
        best_cosine = None
        best_cosine_assignment = None
        for assignment in itertools.permutations(team["chars"]):
            rank_sum = sum(rank_maps[slot_index][cid] for slot_index, cid in enumerate(assignment))
            cosine = sum(
                float(sim[query_index, ref_index[cid]])
                for query_index, cid in zip(defense_rows, assignment)
            ) / 5.0
            if best_rank_sum is None or rank_sum < best_rank_sum:
                best_rank_sum = rank_sum
                best_rank_assignment = assignment
            if best_cosine is None or cosine > best_cosine:
                best_cosine = cosine
                best_cosine_assignment = assignment
        scored.append({
            **team,
            "bestRankSum": best_rank_sum,
            "bestRankMean": best_rank_sum / 5.0,
            "rankAssignment": best_rank_assignment,
            "bestCosine": best_cosine,
            "cosineAssignment": best_cosine_assignment,
        })

    by_rank = sorted(scored, key=lambda x: (x["bestRankSum"], -x["bestCosine"], x["key"]))
    by_cosine = sorted(scored, key=lambda x: (-x["bestCosine"], x["bestRankSum"], x["key"]))
    expected_set = frozenset(expected[5:10])

    def compact(item, rank):
        return {
            "rank": rank,
            "key": item["key"],
            "family": item["family"],
            "variant": item["variant"],
            "chars": list(item["chars"]),
            "bestRankSum": item["bestRankSum"],
            "bestRankMean": round(item["bestRankMean"], 2),
            "rankAssignment": list(item["rankAssignment"]),
            "bestCosine": round(item["bestCosine"], 6),
            "cosineAssignment": list(item["cosineAssignment"]),
        }

    target_rank = next(
        (index for index, item in enumerate(by_rank, start=1) if frozenset(item["chars"]) == expected_set),
        None,
    )
    target_cosine_rank = next(
        (index for index, item in enumerate(by_cosine, start=1) if frozenset(item["chars"]) == expected_set),
        None,
    )
    target_by_rank = compact(by_rank[target_rank - 1], target_rank) if target_rank else None
    target_by_cosine = compact(by_cosine[target_cosine_rank - 1], target_cosine_rank) if target_cosine_rank else None

    print(f"defense teams: {len(teams)}")
    print(f"expected defense team rank by rank-sum: {target_rank}")
    print(f"expected defense team rank by cosine: {target_cosine_rank}")
    for index, item in enumerate(by_rank[:5], start=1):
        print(f"team rank {index}: {item['key']} mean-rank {item['bestRankMean']:.2f} cosine {item['bestCosine']:.4f}")

    return {
        "teamCount": len(teams),
        "expectedCharacters": expected[5:10],
        "targetRankByRankSum": target_rank,
        "targetRankByCosine": target_cosine_rank,
        "targetByRankSum": target_by_rank,
        "targetByCosine": target_by_cosine,
        "top5ByRankSum": [compact(item, index) for index, item in enumerate(by_rank[:5], start=1)],
        "top5ByCosine": [compact(item, index) for index, item in enumerate(by_cosine[:5], start=1)],
    }


def main():
    started = time.time()
    catalog = load_json(CATALOG)
    refs = [x for x in catalog.get("items", []) if x.get("id") and x.get("u")]
    bench_slots = load_benchmark_slots()

    print(f"catalog refs: {len(refs)}")
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
    print(f"downloaded: {len(usable)} / {len(refs)}")
    if len(usable) < 400:
        raise RuntimeError(f"Too few reference portraits downloaded: {len(usable)}")

    weights = MobileNet_V3_Large_Weights.IMAGENET1K_V2
    preprocess = weights.transforms()
    model = mobilenet_v3_large(weights=weights)
    model.classifier = torch.nn.Identity()

    ref_images = []
    ref_ids = []
    for item in usable:
        try:
            with Image.open(downloaded[item["id"]]) as im:
                ref_images.append(im.convert("RGB"))
                ref_ids.append(item["id"])
        except Exception as exc:
            errors[item["id"]] = f"decode: {exc}"

    print(f"decoded refs: {len(ref_images)}")
    ref_emb = embed_images(model, preprocess, ref_images)

    query_images = []
    expected = []
    slots = []
    for slot in bench_slots:
        try:
            raw = base64.b64decode(slot["jpegBase64"])
            with Image.open(io.BytesIO(raw)) as im:
                query_images.append(im.convert("RGB"))
        except Exception as exc:
            raise RuntimeError(f"Unable to decode benchmark crop {slot.get('slot')}: {exc}") from exc
        expected.append(slot["characterId"])
        slots.append(slot["slot"])
    query_emb = embed_images(model, preprocess, query_images, batch_size=10)

    sim = query_emb @ ref_emb.T
    results = []
    top_counts = {"top1": 0, "top5": 0, "top10": 0, "top20": 0}
    ranks = []

    for i, slot in enumerate(slots):
        order = torch.argsort(sim[i], descending=True).tolist()
        ranked_ids = [ref_ids[j] for j in order]
        target = expected[i]
        rank = ranked_ids.index(target) + 1 if target in ranked_ids else None
        if rank is not None:
            ranks.append(rank)
            for k in (1, 5, 10, 20):
                if rank <= k:
                    top_counts[f"top{k}"] += 1
        top20 = [
            {"id": ref_ids[j], "similarity": round(float(sim[i, j]), 6)}
            for j in order[:20]
        ]
        results.append({
            "slot": slot,
            "expectedId": target,
            "rank": rank,
            "top20": top20,
        })
        print(f"{slot:>2} {target:<24} rank {rank}")

    defense_team_benchmark = score_defense_teams(sim, ref_ids, expected)

    report = {
        "schemaVersion": "1.1.0",
        "benchmark": "R5 base crops 128px",
        "model": "torchvision MobileNet_V3_Large IMAGENET1K_V2, classifier removed, cosine similarity",
        "queryCropSize": "128x118",
        "referenceCount": len(ref_ids),
        "summary": {
            **top_counts,
            "meanRank": round(sum(ranks) / len(ranks), 2) if ranks else None,
            "elapsedSeconds": round(time.time() - started, 2),
        },
        "defenseTeamBenchmark": defense_team_benchmark,
        "downloadErrors": errors,
        "slots": results,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
