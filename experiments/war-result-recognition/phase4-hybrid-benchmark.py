#!/usr/bin/env python3
"""Reproducible, truth-blind arbitration analysis for the Phase 4 hybrid.

The predictor inputs are frozen Phase 2/3 result artifacts. This script never
uses ground truth to choose a value. Ground truth is consulted only afterward
to score the proposed outputs and disagreement flags.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).parent
FIELDS = ["localAlliance", "opponentAlliance", "localScore", "opponentScore",
          "localTrophies", "opponentTrophies", "result"]
NUMERIC = ["localScore", "opponentScore", "localTrophies", "opponentTrophies"]
VARIANTS = ["gray-contrast-3x-psm7", "gray-contrast-3x-psm8",
            "color-key-3x-psm7", "color-key-3x-psm8", "otsu-3x-psm7",
            "otsu-3x-psm8", "raw-3x-psm7", "raw-3x-psm8"]

def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

def expected_match(expected, actual):
    if expected is None:
        return None
    if isinstance(expected, str):
        import unicodedata
        def norm(v):
            return " ".join(unicodedata.normalize("NFKC", str(v or "")).replace("’", "'").split()).casefold()
        return norm(expected) == norm(actual)
    return str(expected) == str(actual or "")

def token(field, value):
    value = str(value or "")
    length = 6 if "Score" in field else 4
    return value if value.isdigit() and len(value) == length else ""

def main():
    truth = load("ground-truth.json")["captures"]
    primary = {x["id"]: x for x in load("phase2-benchmark-results.json")["captures"]}
    visual = {x["id"]: x for x in load("phase3-visual-digit-results.json")["captures"]}
    crops = {x["id"]: x for x in load("phase3-localized-tesseract-results.json")["captures"]}
    trophy_hybrid = {x["id"]: x for x in load("phase3-hybrid-benchmark-results.json")["captures"]}
    rows = []
    counts = {"systematic": {f: [0, 0] for f in FIELDS}, "adaptive": {f: [0, 0] for f in FIELDS}}
    rescue = regress = common = accepted_wrong = classifier_rescue = classifier_regress = 0
    flags = {"systematic": {"conflicts": 0, "correctlyFlaggedWrongPrimary": 0},
             "adaptive": {"conflicts": 0, "correctlyFlaggedWrongPrimary": 0, "triggered": 0,
                          "missedWrongPrimary": 0}}
    for t in truth:
        ident = t["id"]
        fields_out = {}
        for field in FIELDS:
            p = primary[ident]["fields"][field]
            expected = t.get(field)
            base = str(p.get("extracted") or "")
            proposed = base
            source = p.get("source") or "phase2-tesseract"
            alt = []
            triggered = False
            visual_value = ""
            crop_values = []
            if field in NUMERIC:
                visual_value = token(field, visual[ident]["fields"][field]["visualClassifier"].get("predicted"))
                for variant in VARIANTS:
                    item = crops[ident]["fields"][field][variant]
                    value = token(field, item.get("value"))
                    if value:
                        crop_values.append(value)
            if field == "opponentTrophies":
                # Phase 3 crop rule is retained as the current best result.
                trophy = trophy_hybrid[ident]["fields"][field]
                selected = str(trophy.get("extracted") or "")
                if selected:
                    proposed, source = selected, trophy.get("source", "phase3-opponent-trophy-crop")
                    if selected not in crop_values:
                        crop_values.append(selected)
                trigger = True
                alt = [base] if base and base != proposed else []
            elif field in NUMERIC:
                # Fill an empty primary only when the per-digit visual classifier
                # and at least one spatially cropped OCR hypothesis agree.
                # Never override a populated primary on the basis of truth.
                consensus = visual_value and visual_value in crop_values
                confidence = p.get("confidence")
                trigger = (not token(field, base) or confidence is None or confidence < 50)
                if not base and consensus:
                    proposed = visual_value
                    source = "phase4-visual-glyph+localized-ocr-consensus"
                if base and consensus and base != visual_value:
                    alt = [base, visual_value]
            else:
                trigger = False
            # Systematic executes the second pass for each numeric field. Adaptive
            # executes it only for missing/invalid/low-confidence numeric reads.
            if field in NUMERIC:
                flags["adaptive"]["triggered"] += int(trigger)
            if expected is not None:
                for mode in ("systematic", "adaptive"):
                    # Both policies use the same conservative arbitration rule;
                    # only the number of second-pass calls differs.
                    value = proposed if mode == "systematic" or trigger or field == "opponentTrophies" else base
                    exact = expected_match(expected, value)
                    counts[mode][field][0] += int(exact is True)
                    counts[mode][field][1] += 1
                if field in NUMERIC:
                    base_correct = expected_match(expected, base) is True
                    final_correct = expected_match(expected, proposed) is True
                    rescue += int(not base_correct and final_correct and bool(proposed))
                    regress += int(base_correct and not final_correct)
                    raw_visual_correct = expected_match(expected, visual[ident]["fields"][field]["visualClassifier"].get("predicted")) is True
                    classifier_rescue += int(not base_correct and raw_visual_correct)
                    classifier_regress += int(base_correct and not raw_visual_correct)
                    common += int(not base_correct and not raw_visual_correct)
                    accepted_wrong += int(not base and bool(proposed) and not final_correct)
                    candidate_values = [visual_value] + crop_values
                    if field == "opponentTrophies":
                        candidate_values.append(proposed)
                    has_conflict = bool(base) and any(value and value != base for value in candidate_values)
                    flags["systematic"]["conflicts"] += int(has_conflict)
                    flags["adaptive"]["conflicts"] += int(trigger and has_conflict)
                    flags["systematic"]["correctlyFlaggedWrongPrimary"] += int(has_conflict and not base_correct)
                    flags["adaptive"]["correctlyFlaggedWrongPrimary"] += int(trigger and has_conflict and not base_correct)
                    flags["adaptive"]["missedWrongPrimary"] += int(not trigger and not base_correct)
            fields_out[field] = {"expected": expected, "primary": base or None,
                                 "visualDigit": visual[ident]["fields"].get(field, {}).get("visualClassifier", {}).get("predicted") if field in NUMERIC else None,
                                 "localizedOcrHypotheses": crop_values or None,
                                 "hybrid": proposed or None, "source": source,
                                 "alternatives": alt or None,
                                 "exact": expected_match(expected, proposed),
                                 "primaryExact": expected_match(expected, base),
                                 "secondPassTriggeredAdaptive": trigger if field in NUMERIC else False,
                                 "manualReviewRequired": True}
        rows.append({"id": ident, "split": t["split"], "fields": fields_out})
    summaries = {}
    for split in ("train", "holdout", "all"):
        selected = [r for r in rows if split == "all" or r["split"] == split]
        summary = {}
        for mode in ("systematic", "adaptive"):
            fields = {}
            for f in FIELDS:
                considered = [r["fields"][f] for r in selected if r["fields"][f]["expected"] is not None]
                n = sum(x["exact"] is True for x in considered)
                fields[f] = {"exact": n, "total": len(considered)}
            fields["overall"] = {"exact": sum(x["exact"] for f,x in fields.items()),
                                 "total": sum(x["total"] for f,x in fields.items())}
            fields["overall"]["percent"] = round(100*fields["overall"]["exact"]/fields["overall"]["total"], 1)
            summary[mode] = fields
        summaries[split] = summary
    numeric_total = sum(len([r for r in rows if r["fields"][f]["expected"] is not None]) for f in NUMERIC)
    out = {"schemaVersion": "1.0.0", "method": "truth-blind conservative two-pass arbitration; missing primary is filled only when isolated-glyph classifier agrees with at least one of eight localized OCR hypotheses; existing primary is never replaced by glyph model; opponent trophy uses phase 3 proven ROI fallback", "engine": "Frozen local experiment artifacts: Tesseract CLI 5.5, Python/Pillow/NumPy/SciPy glyph classifier; no browser inference", "corpus": {"captures": 9, "scoredFields": 62, "train": 7, "contaminatedHoldout": 2, "unknownTruth": [{"capture": "capture-09", "field": "opponentAlliance"}]}, "policies": {"systematic": {"digitClassifierCalls": numeric_total, "localizedTrophyCropCalls": 9, "calls": numeric_total + 9, "description": "run visual digit and crop methods on every numeric field; only fill absent primary on cross-method agreement"}, "adaptive": {"digitClassifierCalls": flags["adaptive"]["triggered"], "localizedTrophyCropCalls": 9, "calls": flags["adaptive"]["triggered"] + 9, "description": "run second pass for missing/invalid/under-50-confidence numeric primary; same arbitration; confidence does not detect confident errors"}}, "complementarity": {"primaryNumericExact": 22, "visualDigitExact": 8, "commonNumericErrors": common, "classifierRescuesBeforeConsensusGate": classifier_rescue, "classifierRegressionsIfUsedAlone": classifier_regress, "combinedHybridRescuesOverPrimary": rescue, "combinedHybridRegressions": regress, "incorrectHybridValuesAccepted": accepted_wrong, "systematicFlags": flags["systematic"], "adaptiveFlags": flags["adaptive"]}, "summaries": summaries, "captures": rows}
    output = ROOT / "phase4-hybrid-benchmark-results.json"
    output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for split in ("train", "holdout", "all"):
        print(split, json.dumps(summaries[split], ensure_ascii=False))
    print("complementarity", json.dumps(out["complementarity"], ensure_ascii=False))
    print("adaptive_calls", out["policies"]["adaptive"]["calls"], "of", numeric_total)

if __name__ == "__main__":
    main()
