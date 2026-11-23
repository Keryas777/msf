import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const html = fs.readFileSync(path.join(root, "docs/war-results-vision.html"), "utf8");
const app = fs.readFileSync(path.join(root, "docs/war-results-vision.js"), "utf8");
const engineSource = fs.readFileSync(path.join(root, "docs/war-results-vision-engine.js"), "utf8");

test("the lab selects an engine and exposes field groups without replacing normal analysis", () => {
  for (const id of ["recognitionLabTitle", "labEngineSelect", "laboratoryFields", "runRecognitionLabButton", "labResults", "copyLabJsonButton", "exportLabJsonButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const label of ["Identité", "Numérique", "Résultat"]) assert.ok(html.includes(label));
  assert.match(app, /data-lab-select="scores"/);
  assert.match(app, /data-lab-select="trophies"/);
  assert.match(app, /WarResultsVisionEngine\.analyzeNumericFields\(record\.file, missing/);
  assert.match(app, /WarResultsVisionEngine\.analyze\(record\.file/);
  assert.match(engineSource, /async function analyze\(/);
  assert.match(engineSource, /async function analyzeNumericFields\(/);
});

test("numeric lab invokes OCR only for selected numeric fields and no specialized engine", async () => {
  const calls = [];
  const zones = { localScore: { x: 100, y: 200, width: 120, height: 35 }, opponentScore: { x: 600, y: 200, width: 120, height: 35 } };
  const core = { locateZones: () => ({ zones, method: "proportional-layout-fallback", layout: "landscape", anchorsFound: {} }) };
  const worker = {
    async setParameters(parameters) { calls.push({ type: "parameters", parameters }); },
    async recognize() { calls.push({ type: "ocr" }); return { data: { text: "123456", confidence: 88 } }; },
    async terminate() {}
  };
  const context = {
    console,
    performance: { now: () => 100 },
    createImageBitmap: async () => ({ width: 1000, height: 500, close() {} }),
    document: { head: { appendChild() {} }, createElement(tag) {
      if (tag === "canvas") return { width: 1, height: 1, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} }), toDataURL: () => "data:image/jpeg;base64,preview" };
      return {};
    } },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    window: {
      WarResultRecognition: core,
      WarResultsIdentityEngine: { analyzeRegion() { throw new Error("identity engine called"); } },
      WarResultsResultEngine: { analyze() { throw new Error("result engine called"); } },
      Tesseract: { async createWorker() { return worker; } }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(engineSource, context);
  const result = await context.window.WarResultsVisionEngine.analyzeNumericFields({ size: 1 }, ["localScore", "opponentScore"]);
  assert.deepEqual(Object.keys(result.fields), ["localScore", "opponentScore"]);
  assert.equal(calls.filter((call) => call.type === "ocr").length, 2);
  assert.equal(result.metrics.calls.length, 2);
  assert.equal(result.metrics.anchors, "none");
  assert.equal(result.fields.localScore.value, "123456");
  assert.equal(result.fields.localScore.preprocessing.whitelist, "0123456789");
});

test("A/B comparator keeps five variants and can restrict trophy fields", () => {
  for (const variant of ["adaptive", "vertical-recovery", "vertical-recovery-edge-safe", "vertical-recovery-icon-aware", "vertical-recovery-combined"]) {
    assert.ok(html.includes(`value="${variant}"`), `variant ${variant} remains selectable`);
  }
  assert.match(engineSource, /requestedFields = Array\.isArray\(options\.fields\)/);
  assert.match(engineSource, /filter\(\(field\) => requestedFields\.includes\(field\.key\)\)/);
  assert.match(app, /fields:\s*selectedTrophies/);
  assert.match(app, /sessionStorage\.setItem\(LOCATOR_COMPARISON_KEY/);
  assert.match(app, /copyLocatorComparisonJson/);
  assert.match(app, /exportLocatorComparisonButton/);
});

