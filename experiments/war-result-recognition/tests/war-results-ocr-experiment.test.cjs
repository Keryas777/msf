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
  assert.deepEqual(Array.from(api.strategies, (item) => item.id), ["reference", "grayscale", "otsu", "adaptive", "tight-crop", "thin-strokes", "psm8", "psm13", "glyphs"]);
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

test("combination builder crosses selected PSM and preprocessing modes without chaining", () => {
 const {api}=loadExperiment(), combos=api.buildCombinations([8,13],["reference","tight-crop","thin-strokes"]);
 assert.equal(combos.length,6);
 assert.deepEqual(JSON.parse(JSON.stringify(combos.map(x=>[x.psm,x.prep]))),[[8,"reference"],[13,"reference"],[8,"tight-crop"],[13,"tight-crop"],[8,"thin-strokes"],[13,"thin-strokes"]]);
 assert.ok(combos.every(x=>!x.prep.includes("+")));
});
test("recommended seven-read set focuses corrections on PSM 8 and 13", () => {
 const {api}=loadExperiment();
 const combos=[...api.buildCombinations([7],["reference"]),...api.buildCombinations([8,13],["tight-crop","thin-strokes"]),...api.buildCombinations([8,13],["reference"])];
 assert.equal(combos.length,7);
 assert.deepEqual(combos.map(x=>x.id),["combo:reference:psm7","combo:tight-crop:psm8","combo:tight-crop:psm13","combo:thin-strokes:psm8","combo:thin-strokes:psm13","combo:reference:psm8","combo:reference:psm13"]);
});
test("numeric lab UI exposes preset, count, independent combinations and exports", () => {
 const html=fs.readFileSync(path.join(root,"docs/war-results-vision.html"),"utf8");
 for(const id of ["ocrCombinationOptions","applyRecommendedOcrPreset","ocrCombinationCount","ocrGlyphOption","copyNumericOcrButton","exportNumericOcrButton"]) assert.match(html,new RegExp(id));
 assert.match(html,/war-results-ocr-experiment\.js\?v=0\.3\.0-experimental/);
});

test("combined OCR results keep the existing session key, details and JSON export actions", () => {
 const ui=fs.readFileSync(path.join(root,"docs/war-results-vision.js"),"utf8");
 assert.match(ui,/sessionStorage\.setItem\(NUMERIC_OCR_KEY/);
 assert.match(ui,/copyNumericOcrJson/);
 assert.match(ui,/exportNumericOcrJson/);
 assert.match(ui,/variants: \(d\.ocrComparison\?\.strategies/);
});
test("all three lab engines and the OCR result controls live inside the unified experimental panel", () => {
 const html=fs.readFileSync(path.join(root,"docs/war-results-vision.html"),"utf8");
 const start=html.indexOf('id="recognitionLabTitle"'), end=html.indexOf('<section id="batchSummary"');
 assert.ok(start>=0&&end>start);
 const lab=html.slice(start,end);
 for(const text of ["identity","numeric","result","Scores et trophées","Localisation et découpe","Reconnaissance OCR","Résultats détaillés, diagnostics et exports"]) assert.ok(lab.includes(text),text);
});

test("morphology features distinguish a two-loop 8 from a single-loop 9 without auto-correction", () => {
 const {api}=loadExperiment();
 const ring=(two)=>{const a=new Uint8Array(20*24);for(let y=2;y<22;y++)for(let x=3;x<17;x++){if(x===3||x===16||y===2||y===21)a[y*20+x]=1;if(two&&(y===11||y===12))a[y*20+x]=1;}return a;};
 const f8=api.morphologyFeatures(ring(true)),f9=api.morphologyFeatures(ring(false));
 assert.equal(f8.holeCount,2);assert.equal(f8.classification,"8");
 assert.equal(f9.holeCount,1);assert.ok(f9.upperHole);assert.equal(f9.classification,"9");
});
test("hybrid strategy runs PSM 8 and keeps the OCR value unchanged while recording morphology", async () => {
 const {api}=loadExperiment();
 const image={width:40,height:20,getContext:()=>({getImageData:()=>({width:40,height:20,data:new Uint8ClampedArray(40*20*4)})})};
 const worker={setParameters:async p=>assert.equal(p.tessedit_pageseg_mode,"8"),recognize:async()=>({data:{text:"2580",confidence:96}})};
 const reader={segment:(_data,_category,count)=>count===4?{confidence:.9,bounds:[],glyphs:[0,1,2,3].map(()=>({rect:{x:0,y:0,width:5,height:8},area:20,bitmap:new Uint8Array(480)}))}:{reason:"ambiguous-component-run",bounds:[],glyphs:[]}};
 const result=await api.compare(image,{width:40,height:20,toDataURL:()=>"data:image/jpeg;base64,ref"},worker,reader,()=>{},["psm8-morphology"]);
 const hybrid=result.strategies[0];assert.equal(hybrid.value,"2580");assert.equal(hybrid.psm,8);assert.equal(hybrid.morphology.selectedCount,4);assert.equal(hybrid.proposedCorrection,null);
});
test("JSON diagnostics retain combination ID, morphology evidence and proposal explanation", () => {
 const ui=fs.readFileSync(path.join(root,"docs/war-results-vision.js"),"utf8");
 assert.match(ui,/proposedCorrection: item\.proposedCorrection/);assert.match(ui,/morphology: item\.morphology/);
 assert.match(ui,/ocrMorphologyOption/);assert.match(ui,/automatic:false/);
});
