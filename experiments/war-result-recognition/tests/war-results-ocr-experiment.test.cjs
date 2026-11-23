const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../../../");

function loadExperiment() {
  const canvases = [];
  function makeCanvas() {
    const canvas = { width: 1, height: 1, toDataURL: () => "data:image/jpeg;base64,TEST" };
    const context = {
      drawImage() {}, putImageData() {},
      getImageData(_x, _y, width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(180) }; }
    };
    canvas.getContext = () => context;
    canvases.push(canvas);
    return canvas;
  }
  const module = { exports: {} };
  const sandbox = { module, document: { createElement: makeCanvas }, performance: { now: () => 10 }, Uint8Array, Uint8ClampedArray, Float64Array, Map, Math, Number, String, Object, Array, Error };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, "docs/war-results-ocr-experiment.js"), "utf8"), sandbox, { filename: "war-results-ocr-experiment.js" });
  return { api: module.exports, canvases };
}

test("OCR strategies retain the current reference and add isolated preprocess and PSM modes", () => {
  const { api } = loadExperiment();
  assert.deepEqual(Array.from(api.strategies, (item) => item.id), ["reference", "grayscale", "otsu", "adaptive", "psm8", "psm13", "glyphs"]);
  assert.equal(api.strategies[0].psm, 7);
  assert.equal(api.strategies.find((item) => item.id === "psm8").psm, 8);
  assert.equal(api.strategies.find((item) => item.id === "psm13").psm, 13);
});

test("numeric parsing rejects incomplete and extra-character reads without repairing them", () => {
  const { api } = loadExperiment();
  assert.deepEqual(JSON.parse(JSON.stringify(api.normalizedRead("014"))), { raw: "014", digits: "014", value: "", digitCount: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(api.normalizedRead("28938"))), { raw: "28938", digits: "28938", value: "", digitCount: 5 });
});

test("consensus counts independent strategy families rather than near-duplicate PSM reads", () => {
  const { api } = loadExperiment();
  const result = api.consensus([
    { strategy: "reference", value: "1111", digitCount: 4 },
    { strategy: "psm8", value: "1111", digitCount: 4 },
    { strategy: "grayscale", value: "2222", digitCount: 4 },
    { strategy: "otsu", value: "2222", digitCount: 4 },
    { strategy: "glyphs", value: "2222", digitCount: 4 }
  ]);
  assert.equal(result.value, "2222");
  assert.equal(result.votes["1111"], 1);
  assert.equal(result.votes["2222"], 2);
  assert.equal(api.consensus([{ strategy: "reference", value: "1111", digitCount: 4 }, { strategy: "psm8", value: "2222", digitCount: 4 }]).value, "");
});

test("uncertain character segmentation is reported and never padded into four digits", async () => {
  const { api } = loadExperiment();
  const source = { width: 40, height: 20, getContext: () => ({ getImageData: () => ({ width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4) }) }) };
  let calls = 0;
  const worker = { setParameters: async () => {}, recognize: async () => { calls++; return { data: { text: "8", confidence: 90 } }; } };
  const result = await api.compare(source, { width: 120, height: 60, toDataURL: () => "data:image/jpeg;base64,REF" }, worker,
    { segment: () => ({ reason: "ambiguous-component-run", confidence: .1, bounds: [] }) }, () => {}, ["reference", "glyphs"]);
  assert.equal(result.strategies.find((item) => item.strategy === "glyphs").value, "");
  assert.ok(result.strategies.find((item) => item.strategy === "glyphs").warnings.includes("ambiguous-component-run"));
  assert.equal(calls, 1);
});

test("per-glyph OCR preserves four positions and rejects a glyph that returns multiple digits", async () => {
  const { api } = loadExperiment();
  const source = { width: 40, height: 20, getContext: () => ({ getImageData: () => ({ width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4) }) }) };
  let currentPsm = "7", ordinal = 0;
  const worker = { setParameters: async ({ tessedit_pageseg_mode }) => { currentPsm = tessedit_pageseg_mode; }, recognize: async () => ({ data: { text: currentPsm === "10" ? (++ordinal === 2 ? "19" : "7") : "1234", confidence: 80 } }) };
  const segments = { segment: () => ({ confidence: .9, bounds: [0, 1, 2, 3].map((x) => ({ x, y: 2, width: 4, height: 8 })) }) };
  const result = await api.compare(source, { width: 120, height: 60, toDataURL: () => "data:image/jpeg;base64,REF" }, worker, segments, () => {}, ["glyphs"]);
  const glyphRead = result.strategies.find((item) => item.strategy === "glyphs");
  assert.equal(glyphRead.glyphs.length, 4);
  assert.equal(glyphRead.digitCount, 5);
  assert.equal(glyphRead.value, "");
  assert.ok(glyphRead.warnings.includes("each-glyph-must-produce-one-digit"));
});

test("all selected OCR reads receive the same frozen crop while preprocessing gets separate canvases", async () => {
  const { api, canvases } = loadExperiment();
  const source = { width: 40, height: 20, getContext: () => ({ getImageData: () => ({ width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4).fill(200) }) }) };
  const reference = { width: 120, height: 60, toDataURL: () => "data:image/jpeg;base64,REF" };
  const images = [], psms = [];
  const worker = { setParameters: async ({ tessedit_pageseg_mode }) => psms.push(tessedit_pageseg_mode), recognize: async (image) => { images.push(image); return { data: { text: "1111", confidence: 75 } }; } };
  await api.compare(source, reference, worker, null, () => {}, ["reference", "grayscale", "psm8"]);
  assert.equal(images[0], reference);
  assert.notEqual(images[1], reference);
  assert.equal(images[2], reference);
  assert.deepEqual(psms, ["7", "7", "8"]);
  assert.ok(canvases.length >= 1);
});

test("an OCR worker error is retained as a failed strategy without inventing a value", async () => {
  const { api } = loadExperiment();
  const source = { width: 20, height: 10, getContext: () => ({ getImageData: () => ({ width: 20, height: 10, data: new Uint8ClampedArray(20 * 10 * 4) }) }) };
  const worker = { setParameters: async () => {}, recognize: async () => { throw new Error("worker interrupted"); } };
  const result = await api.compare(source, { width: 60, height: 30, toDataURL: () => "data:image/jpeg;base64,REF" }, worker, null, () => {}, ["reference", "psm8"]);
  assert.equal(result.strategies.length, 2);
  assert.ok(result.strategies.every((item) => item.value === "" && item.digitCount === 0));
  assert.ok(result.strategies.every((item) => item.warnings[0].startsWith("strategy-error:")));
});

test("the five historical trophy locator variants remain in the laboratory", () => {
  const html = fs.readFileSync(path.join(root, "docs/war-results-vision.html"), "utf8");
  for (const id of ["adaptive", "vertical-recovery", "vertical-recovery-edge-safe", "vertical-recovery-icon-aware", "vertical-recovery-combined"]) assert.match(html, new RegExp(`value="${id}"`));
});

test("the OCR comparator remains numeric-lab-only and does not embed private expected values", () => {
  const engine = fs.readFileSync(path.join(root, "docs/war-results-vision-engine.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "docs/war-results-vision.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "docs/war-results-vision.html"), "utf8");
  assert.match(engine, /options\.compareOcr/);
  assert.match(engine, /ocrRectFrozen: true/);
  assert.match(ui, /variantId: "vertical-recovery-combined", marginPercent: 18, compareOcr: true/);
  assert.match(html, /Copier le rapport OCR JSON/);
  assert.doesNotMatch(`${engine}\n${ui}\n${html}`, /expectedTrophies|benchmarkExpected|privateBenchmarkValues/i);
});
