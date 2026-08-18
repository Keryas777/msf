#!/usr/bin/env python3
"""Convert the validated R5 AKAZE NPZ into browser-friendly static assets.

The browser receives the descriptor bytes directly as one compact binary file and a
small JSON index. No Python/NPZ parser is needed on the phone.
"""

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "benchmark-r5-akaze-reference-descriptors.npz"
OUT_DIR = ROOT / "docs/data/war-counter-vision"
OUT_BIN = OUT_DIR / "akaze-r5-reference-descriptors.bin"
OUT_JSON = OUT_DIR / "akaze-r5-reference-descriptors.json"


def main():
    if not SOURCE.exists():
        raise RuntimeError(f"Missing source descriptor archive: {SOURCE}")

    payload = np.load(SOURCE, allow_pickle=False)
    ref_ids = [str(value) for value in payload["ref_ids"].tolist()]
    offsets = [int(value) for value in payload["offsets"].tolist()]
    descriptors = np.ascontiguousarray(payload["descriptors"], dtype=np.uint8)
    opencv_version = str(payload["opencv_version"][0])
    threshold = float(payload["threshold"][0])
    resize_max = int(payload["resize_max"][0])

    if descriptors.ndim != 2 or descriptors.shape[1] != 61:
        raise RuntimeError(f"Unexpected descriptor shape: {descriptors.shape}")
    if len(offsets) != len(ref_ids) + 1 or offsets[-1] != len(descriptors):
        raise RuntimeError("Invalid descriptor offsets")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_BIN.write_bytes(descriptors.tobytes(order="C"))
    metadata = {
        "schemaVersion": "1.0.0",
        "algorithm": "AKAZE-MLDB",
        "openCvVersion": opencv_version,
        "threshold": threshold,
        "resizeMax": resize_max,
        "descriptorCols": int(descriptors.shape[1]),
        "descriptorCount": int(descriptors.shape[0]),
        "referenceCount": len(ref_ids),
        "refIds": ref_ids,
        "offsets": offsets,
        "binaryFile": OUT_BIN.name,
        "binaryBytes": OUT_BIN.stat().st_size,
    }
    OUT_JSON.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"browser AKAZE assets: refs={len(ref_ids)} descriptors={len(descriptors)} "
        f"bin={OUT_BIN.stat().st_size} bytes meta={OUT_JSON.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
