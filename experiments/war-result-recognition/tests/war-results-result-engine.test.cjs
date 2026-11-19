const assert = require("node:assert/strict");
require("../../../docs/war-results-result-engine.js");
const resultEngine = globalThis.WarResultsResultEngine;

function pixels(colors, width = colors.length, height = 1) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(colors[i % colors.length], i * 4);
  return { width, height, data };
}
const blue = [55, 155, 255, 255], red = [255, 60, 66, 255], white = [245, 245, 245, 255], green = [60, 230, 100, 255];
const all = (color, size = 90) => pixels(Array.from({ length: size }, () => color), size, 12);

const victory = resultEngine.analyzePixels(all(blue));
assert.equal(victory.value, "win", "blue title color maps to victory");
assert.ok(victory.confidence >= 0.8);
const defeat = resultEngine.analyzePixels(all(red));
assert.equal(defeat.value, "loss", "red title color maps to defeat");

const noisy = pixels(Array.from({ length: 100 }, (_, i) => i < 70 ? blue : i < 88 ? red : i < 95 ? green : white), 100, 1);
assert.equal(resultEngine.analyzePixels(noisy).value, "win", "a strong blue cue survives red, other-color and neutral noise");
const mixed = pixels(Array.from({ length: 100 }, (_, i) => i < 42 ? blue : i < 84 ? red : green), 100, 1);
assert.equal(resultEngine.analyzePixels(mixed).value, null, "mixed dominance is left uncertain");
assert.equal(resultEngine.analyzePixels(all(green)).value, null, "non-blue and non-red colors are not converted into a result");

(async () => {
  let ocrCalls = 0;
  let unnecessaryOcrCalls = 0;
  const bothBlue = await resultEngine.analyzeRegions({ title: all(blue), banner: all(blue), recognize: async () => { unnecessaryOcrCalls++; return { data: { text: "VICTOIRE", confidence: 90 } }; } });
  assert.equal(bothBlue.value, "win");
  assert.equal(bothBlue.source, "title-and-banner-color", "matching title and banner cues raise confirmation confidence");
  assert.equal(bothBlue.diagnostics.ocrUsed, false, "a decisive color result skips OCR");
  assert.equal(bothBlue.diagnostics.fallbackUsed, false, "a decisive title does not analyze fallback subregions");
  assert.equal(unnecessaryOcrCalls, 0);

  const conflict = await resultEngine.analyzeRegions({ title: all(blue), banner: all(red), recognize: async () => { ocrCalls++; return "VICTOIRE"; } });
  assert.equal(conflict.value, null, "contradictory title and banner colors remain unresolved");
  assert.match(conflict.diagnostics.reason, /contradiction/);
  assert.equal(conflict.diagnostics.ocrUsed, false, "persistent color conflict is not overridden by OCR");
  assert.equal(ocrCalls, 0);

  const ambiguousTitle = all(white);
  const targeted = await resultEngine.analyzeRegions({ title: ambiguousTitle, subregions: [all(red), all(red), all(red)] });
  assert.equal(targeted.value, "loss", "targeted title subregions can recover a weak broad crop");
  assert.equal(targeted.source, "targeted-title-subregions");
  assert.equal(targeted.diagnostics.fallbackUsed, true);
  let conflictOcrCalls = 0;
  const targetedConflict = await resultEngine.analyzeRegions({ title: ambiguousTitle, banner: all(blue), subregions: [all(red), all(red), all(red)], recognize: async () => { conflictOcrCalls++; return { data: { text: "DEFAITE", confidence: 90 } }; } });
  assert.equal(targetedConflict.value, null, "a targeted title and banner contradiction remains unresolved");
  assert.equal(targetedConflict.diagnostics.reason, "targeted-title-banner-color-contradiction");
  assert.equal(conflictOcrCalls, 0, "OCR does not overrule a persistent color contradiction");

  let fallbackCalls = 0;
  const textFallback = await resultEngine.analyzeRegions({ title: all(white), recognize: async () => { fallbackCalls++; return { data: { text: "DÉFAITE", confidence: 86 } }; } });
  assert.equal(textFallback.value, "loss", "ambiguous color can use exact-title OCR as a limited fallback");
  assert.equal(textFallback.source, "targeted-title-ocr-fallback");
  assert.equal(textFallback.diagnostics.ocrUsed, true);
  assert.equal(fallbackCalls, 1);

  const lowConfidence = await resultEngine.analyzeRegions({ title: all(white), recognize: async () => ({ data: { text: "VICTOIRE", confidence: 34 } }) });
  assert.equal(lowConfidence.value, null, "a low-confidence fallback title remains uncertain");
  assert.equal(lowConfidence.diagnostics.reason, "low-confidence-ocr-fallback");

  const unrecognized = await resultEngine.analyzeRegions({ title: all(white), recognize: async () => ({ data: { text: "GUERRE", confidence: 88 } }) });
  assert.equal(unrecognized.value, null, "a non-result title is never guessed");
  assert.ok(unrecognized.diagnostics.reason);
  console.log("War Results Vision result engine tests: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
