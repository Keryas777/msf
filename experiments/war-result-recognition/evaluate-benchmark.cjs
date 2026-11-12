#!/usr/bin/env node
const fs = require("node:fs");
const core = require("../../docs/war-result-recognition-core.js");

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("usage: evaluate-benchmark.cjs <ocr-input.json> <fields.json>");
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const captures = input.captures.map((capture) => {
  const psm6 = core.extract(core.parseTsv(capture.psm6.tsv), capture.width, capture.height, { colorResult: capture.colorResult });
  const psm11 = core.extract(core.parseTsv(capture.psm11.tsv), capture.width, capture.height, { colorResult: capture.colorResult });
  const fields = { ...psm11.fields };
  const failures = [];
  for (const key of ["localScore", "opponentScore", "localTrophies", "opponentTrophies"]) {
    const a = psm11.fields[key], b = psm6.fields[key];
    if (!a.value && b.value) fields[key] = { ...b, source: "psm6-fallback" };
    else if (a.value && b.value && a.value !== b.value) {
      const delta = Math.abs((a.confidence || 0) - (b.confidence || 0));
      if (delta >= 18) fields[key] = (a.confidence > b.confidence ? a : b);
      else fields[key] = { ...a, value: "", uncertain: true, alternatives: [a.value, b.value], source: "pass-conflict" };
    } else if (a.value && b.value && a.value === b.value) fields[key] = { ...a, confidence: Math.max(a.confidence || 0, b.confidence || 0), uncertain: a.uncertain && b.uncertain, source: "psm6+psm11-agree" };
  }
  const knownLocal = ["Zeus", "Dionysos", "Poseidon", "Athena", "Kronos"];
  const isKnownLocal = (entry) => knownLocal.some((name) => core.toSearchKey(name) === core.toSearchKey(entry.value));
  if ((!fields.localAlliance.value || !isKnownLocal(fields.localAlliance)) && isKnownLocal(psm6.fields.localAlliance)) fields.localAlliance = psm6.fields.localAlliance;
  if (!fields.opponentAlliance.value && psm6.fields.opponentAlliance.value) fields.opponentAlliance = psm6.fields.opponentAlliance;
  fields.result = { value: capture.colorResult || "", confidence: null, uncertain: !capture.colorResult, source: "title-color" };
  const warnings = new Set([...psm6.warnings, ...psm11.warnings]);
  for (const [key, value] of Object.entries(fields)) if (!value.value || value.uncertain || value.alternatives) warnings.add(`${key}_uncertain`);
  if (fields.localScore.value && fields.opponentScore.value && capture.colorResult) {
    if ((Number(fields.localScore.value) > Number(fields.opponentScore.value) ? "win" : "loss") !== capture.colorResult) warnings.add("score_result_conflict");
  }
  return { id: capture.id, split: capture.split, width: capture.width, height: capture.height, colorResult: capture.colorResult, variants: { psm6: psm6.fields, psm11: psm11.fields }, fields, warnings: [...warnings], needsManualReview: true };
});
fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: "2.0.0", metric: "strict field extraction and side attribution; OCR text presence is not counted", captures }, null, 2)}\n`);
