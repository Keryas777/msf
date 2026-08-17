#!/usr/bin/env python3
import base64
import io
import itertools
import json
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
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            dest.write_bytes(response.content)
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
            batch = torch.stack([preprocess(image) for image in images[start:start + batch_size]])
            emb = model(batch)
            emb = F.normalize(emb, dim=1)
            out.append(emb.cpu())
    return torch.cat(out, dim=0)


def is_red(red, green, blue):
    return red > 145 and red > green * 1.35 and red > blue * 1.25


def neutralize_red(image):
    source = image.convert("RGB")
    pixels = list(source.getdata())
    neutralized = []
    changed = 0
    for red, green, blue in pixels:
        if is_red(red, green, blue):
            gray = round((green + blue) / 2)
            neutralized.append((gray, gray, gray))
            changed += 1
        else:
            neutralized.append((red, green, blue))
    result = Image.new("RGB", source.size)
    result.putdata(neutralized)
    return result, changed


def neutralize_red_cross_geometry(image):
    """Neutralize only red pixels aligned with the two large X diagonals.

    This deliberately preserves red pixels elsewhere in the portrait. The X is
    treated as two diagonals spanning the crop, with a modest tolerance that is
    proportional to crop size. It is intentionally simple and mobile-friendly.
    """
    source = image.convert("RGB")
    width, height = source.size
    pixels = list(source.getdata())
    changed = 0
    out = []

    # In normalized coordinates, the two X strokes are y=x and y=1-x.
    # 0.085 was chosen as a narrow first-pass band: enough for the thick game
    # overlay, but much smaller than the previous whole-image red neutralizer.
    tolerance = 0.085

    for index, (red, green, blue) in enumerate(pixels):
        x = index % width
        y = index // width
        nx = x / max(1, width - 1)
        ny = y / max(1, height - 1)
        on_descending = abs(ny - nx) <= tolerance
        on_ascending = abs(ny - (1.0 - nx)) <= tolerance

        if is_red(red, green, blue) and (on_descending or on_ascending):
            gray = round((green + blue) / 2)
            out.append((gray, gray, gray))
            changed += 1
        else:
            out.append((red, green, blue))

    result = Image.new("RGB", source.size)
    result.putdata(out)
    return result, changed


def rank_slots(sim, ref_ids, expected, slots):
    results = []
    top_counts = {"top1": 0, "top5": 0, "top10": 0, "top20": 0}
    ranks = []
    for index, slot in enumerate(slots):
        order = torch.argsort(sim[index], descending=True).tolist()
        ranked_ids = [ref_ids[position] for position in order]
        target = expected[index]
        rank = ranked_ids.index(target) + 1 if target in ranked_ids else None
        if rank is not None:
            ranks.append(rank)
            for k in (1, 5, 10, 20):
                if rank <= k:
                    top_counts[f"top{k}"] += 1
        results.append({
            "slot": slot,
            "expectedId": target,
            "rank": rank,
            "top20": [
                {"id": ref_ids[position], "similarity": round(float(sim[index, position]), 6)}
                for position in order[:20]
            ],
        })
    return results, {
        **top_counts,
        "meanRank": round(sum(ranks) / len(ranks), 2) if ranks else None,
    }


def score_defense_teams(defense_sim, ref_ids, expected_defense):
    ref_index = {cid: index for index, cid in enumerate(ref_ids)}
    valid_ids = set(ref_index)
    teams = load_defense_teams(valid_ids)

    rank_maps = []
    for query_index in range(5):
        order = torch.argsort(defense_sim[query_index], descending=True).tolist()
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
                float(defense_sim[slot_index, ref_index[cid]])
                for slot_index, cid in enumerate(assignment)
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

    by_rank = sorted(scored, key=lambda item: (item["bestRankSum"], -item["bestCosine"], item["key"]))
    by_cosine = sorted(scored, key=lambda item: (-item["bestCosine"], item["bestRankSum"], item["key"]))
    expected_set = frozenset(expected_defense)

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

    return {
        "teamCount": len(teams),
        "expectedCharacters": expected_defense,
        "targetRankByRankSum": target_rank,
        "targetRankByCosine": target_cosine_rank,
        "targetByRankSum": compact(by_rank[target_rank - 1], target_rank) if target_rank else None,
        "targetByCosine": compact(by_cosine[target_cosine_rank - 1], target_cosine_rank) if target_cosine_rank else None,
        "top5ByRankSum": [compact(item, index) for index, item in enumerate(by_rank[:5], start=1)],
        "top5ByCosine": [compact(item, index) for index, item in enumerate(by_cosine[:5], start=1)],
    }


def evaluate_variant(name, images, model, preprocess, ref_emb, ref_ids, expected, slots):
    embeddings = embed_images(model, preprocess, images, batch_size=10)
    sim = embeddings @ ref_emb.T
    results, summary = rank_slots(sim, ref_ids, expected, slots)
    team = score_defense_teams(sim[5:10], ref_ids, expected[5:10])
    print(f"{name} defense ranks:")
    for item in results[5:10]:
        print(f"{item['slot']:>2} {item['expectedId']:<24} rank {item['rank']}")
    print(
        f"{name} RetCon: rank-sum {team['targetRankByRankSum']}; "
        f"cosine {team['targetRankByCosine']}"
    )
    return sim, results, summary, team


def main():
    started = time.time()
    catalog = load_json(CATALOG)
    refs = [item for item in catalog.get("items", []) if item.get("id") and item.get("u")]
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
            with Image.open(downloaded[item["id"]]) as image:
                ref_images.append(image.convert("RGB"))
                ref_ids.append(item["id"])
        except Exception as exc:
            errors[item["id"]] = f"decode: {exc}"

    print(f"decoded refs: {len(ref_images)}")
    ref_emb = embed_images(model, preprocess, ref_images)

    query_images = []
    expected = []
    slots = []
    for slot in bench_slots:
        raw = base64.b64decode(slot["jpegBase64"])
        with Image.open(io.BytesIO(raw)) as image:
            query_images.append(image.convert("RGB"))
        expected.append(slot["characterId"])
        slots.append(slot["slot"])

    _, base_results, base_summary, base_team = evaluate_variant(
        "base", query_images, model, preprocess, ref_emb, ref_ids, expected, slots
    )

    whole_red_images = list(query_images[:5])
    whole_changed = {}
    for index in range(5, 10):
        neutralized, changed = neutralize_red(query_images[index])
        whole_red_images.append(neutralized)
        whole_changed[slots[index]] = changed
    _, red_results, red_summary, red_team = evaluate_variant(
        "red-neutral", whole_red_images, model, preprocess, ref_emb, ref_ids, expected, slots
    )

    geometric_images = list(query_images[:5])
    geometric_changed = {}
    for index in range(5, 10):
        neutralized, changed = neutralize_red_cross_geometry(query_images[index])
        geometric_images.append(neutralized)
        geometric_changed[slots[index]] = changed
    _, geometric_results, geometric_summary, geometric_team = evaluate_variant(
        "geometric-red-x", geometric_images, model, preprocess, ref_emb, ref_ids, expected, slots
    )

    print("changed red pixels (whole -> geometric):")
    for slot in slots[5:10]:
        print(f"{slot}: {whole_changed[slot]} -> {geometric_changed[slot]}")

    report = {
        "schemaVersion": "1.3.0",
        "benchmark": "R5 base vs whole-red vs geometric-red-X defense crops 128px",
        "model": "torchvision MobileNet_V3_Large IMAGENET1K_V2, classifier removed, cosine similarity",
        "queryCropSize": "128x118",
        "referenceCount": len(ref_ids),
        "redRule": "red > 145 && red > green * 1.35 && red > blue * 1.25",
        "geometricMask": {
            "description": "Only red pixels within normalized diagonal bands y=x or y=1-x are neutralized",
            "tolerance": 0.085,
        },
        "base": {
            "summary": base_summary,
            "defenseTeamBenchmark": base_team,
            "slots": base_results,
        },
        "redNeutralDefense": {
            "summary": red_summary,
            "changedPixels": whole_changed,
            "defenseTeamBenchmark": red_team,
            "slots": red_results,
        },
        "geometricRedXDefense": {
            "summary": geometric_summary,
            "changedPixels": geometric_changed,
            "defenseTeamBenchmark": geometric_team,
            "slots": geometric_results,
        },
        "downloadErrors": errors,
        "elapsedSeconds": round(time.time() - started, 2),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
