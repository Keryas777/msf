#!/usr/bin/env python3
import base64
import io
import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
import torch
import torch.nn.functional as F
from PIL import Image, ImageFile
from torchvision.models import mobilenet_v3_large, MobileNet_V3_Large_Weights

# Benchmark-only tolerance: the GitHub text transport can leave otherwise valid
# JPEG crops with a truncated tail. This must not be copied into production code.
ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/data/war-counter-vision/portrait-signatures.json"
BENCH = ROOT / "benchmarks/war-counter-r5/r5-base-crops-transport.json"
OUT = ROOT / "benchmark-r5-embedding-report.json"
CACHE = ROOT / ".cache/war-counter-r5-portraits"
CACHE.mkdir(parents=True, exist_ok=True)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


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


def main():
    started = time.time()
    catalog = load_json(CATALOG)
    refs = [x for x in catalog.get("items", []) if x.get("id") and x.get("u")]
    bench = load_json(BENCH)

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
    for slot in bench["slots"]:
        try:
            raw = base64.b64decode(slot["jpegBase64"])
            query_images.append(Image.open(io.BytesIO(raw)).convert("RGB"))
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

    report = {
        "schemaVersion": "1.0.0",
        "benchmark": "R5 transport machinery validation",
        "warning": "Query crops were resized to <=48 px solely to transport them into this isolated branch. Do not treat this run as final R5 accuracy.",
        "model": "torchvision MobileNet_V3_Large IMAGENET1K_V2, classifier removed, cosine similarity",
        "referenceCount": len(ref_ids),
        "summary": {
            **top_counts,
            "meanRank": round(sum(ranks) / len(ranks), 2) if ranks else None,
            "elapsedSeconds": round(time.time() - started, 2),
        },
        "downloadErrors": errors,
        "slots": results,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
