#!/usr/bin/env python3
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
CACHE = ROOT / ".cache/war-counter-r5-portraits"
OUT = ROOT / "benchmark-r5-akaze-reference-descriptors.npz"
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


def main():
    catalog = load_json(CATALOG)
    refs = [item for item in catalog.get("items", []) if item.get("id") and item.get("u")]

    downloaded = {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(download_one, item): item for item in refs}
        for future in as_completed(futures):
            cid, path, _error = future.result()
            if path:
                downloaded[cid] = path

    usable = [item for item in refs if item["id"] in downloaded]
    if len(usable) < 400:
        raise RuntimeError(f"Too few reference portraits downloaded: {len(usable)}")

    akaze = cv2.AKAZE_create(threshold=0.0008)
    ref_ids = []
    descriptor_blocks = []
    offsets = [0]

    for item in usable:
        with Image.open(downloaded[item["id"]]) as image:
            gray = to_cv_gray(image)
        _keypoints, descriptors = akaze.detectAndCompute(gray, None)
        if descriptors is None:
            descriptors = np.empty((0, 61), dtype=np.uint8)
        descriptors = np.ascontiguousarray(descriptors, dtype=np.uint8)
        ref_ids.append(item["id"])
        descriptor_blocks.append(descriptors)
        offsets.append(offsets[-1] + len(descriptors))

    all_descriptors = (
        np.concatenate(descriptor_blocks, axis=0)
        if descriptor_blocks
        else np.empty((0, 61), dtype=np.uint8)
    )
    np.savez_compressed(
        OUT,
        ref_ids=np.asarray(ref_ids),
        offsets=np.asarray(offsets, dtype=np.int64),
        descriptors=all_descriptors,
        opencv_version=np.asarray([cv2.__version__]),
        threshold=np.asarray([0.0008], dtype=np.float32),
        resize_max=np.asarray([320], dtype=np.int32),
    )
    print(
        f"saved {len(ref_ids)} references, "
        f"{len(all_descriptors)} descriptors -> {OUT.name} ({OUT.stat().st_size} bytes)"
    )


if __name__ == "__main__":
    main()
