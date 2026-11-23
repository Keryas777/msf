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

test("experimental pixel geometry is isolated, recorded, and safely refuses missing fields", async () => {
  const calls = [];
  const worker = {
    async setParameters() {},
    async recognize() { calls.push("ocr"); return { data: { text: "123456", confidence: 91 } }; },
    async terminate() {}
  };
  const core = { locateZones: () => ({ zones: { localScore: { x: 90, y: 80, width: 120, height: 30 } }, method: "proportional-layout-fallback" }) };
  const canvasContext = { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {} };
  const makeContext = (locatorResult) => {
    const context = {
      console, performance: { now: () => 100 },
      createImageBitmap: async () => ({ width: 1000, height: 700, close() {} }),
      document: { head: { appendChild() {} }, createElement(tag) {
        if (tag === "canvas") return { width: 1, height: 1, getContext: () => canvasContext, toDataURL: () => "data:image/jpeg;base64,preview" };
        return {};
      } },
      URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
      window: {
        WarResultRecognition: core,
        WarResultsNumericLocatorExperiment: { locate(_image, fields) {
          calls.push(`locate:${fields.join(",")}`);
          return { method: "full-image-color-components", fields: locatorResult,
            anchors: { localScore: [{ x: 200, y: 300, width: 4, height: 12 }] },
            candidates: { localScore: [{ rect: { x: 190, y: 290, width: 70, height: 22 }, selected: true,
              score: 1.4, iconAnchor: { x: 170, y: 290, width: 16, height: 18 }, reason: "trophy-icon-adjacency-and-four-glyph-run" }] },
            reasons: { localScore: null } };
        } },
        WarResultsTrophyLocatorExperiment: null,
        WarResultsDigitReader: null,
        WarResultsIdentityEngine: { analyzeRegion() { throw new Error("identity engine called"); } },
        WarResultsResultEngine: { analyze() { throw new Error("result engine called"); } },
        Tesseract: { async createWorker() { calls.push("worker"); return worker; } }
      }
    };
    context.globalThis = context;
    vm.runInNewContext(engineSource, context);
    return context.window.WarResultsVisionEngine;
  };

  const engine = makeContext({ localScore: { x: 190, y: 290, width: 70, height: 22 } });
  const result = await engine.analyzeNumericFields({ size: 1 }, ["localScore"], () => {}, { geometryMode: "pixel-content" });
  assert.deepEqual(calls.slice(0, 2), ["locate:localScore", "worker"]);
  assert.equal(result.metrics.geometryMode, "pixel-content");
  assert.equal(result.fields.localScore.initialRect.x, 90);
  assert.equal(result.fields.localScore.correctedRect.x, 190);
  assert.equal(result.fields.localScore.locator.anchors.length, 1);
  assert.equal(result.fields.localScore.locator.candidates[0].rect.x, 190, "candidate rectangles stay in source-image coordinates");
  assert.equal(result.fields.localScore.locator.selectedCandidate.reason, "trophy-icon-adjacency-and-four-glyph-run");
  assert.equal(result.fields.localScore.value, "123456");

  calls.length = 0;
  const missingEngine = makeContext({ localScore: null });
  const missing = await missingEngine.analyzeNumericFields({ size: 1 }, ["localScore"], () => {}, { geometryMode: "pixel-content" });
  assert.equal(missing.fields.localScore.ocrSkipped, true);
  assert.equal(missing.fields.localScore.value, "");
  assert.ok(!calls.includes("worker"), "failed pixel localization does not initialize OCR");
});

test("the selected trophy candidate is the rectangle passed into refinement and OCR", async () => {
  let refinementBand = null;
  let refinedX = 190;
  const worker = { async setParameters() {}, async recognize() { return { data: { text: "2738", confidence: 28 } }; }, async terminate() {} };
  const context = {
    console, performance: { now: () => 100 },
    createImageBitmap: async () => ({ width: 1000, height: 700, close() {} }),
    document: { head: { appendChild() {} }, createElement(tag) {
      if (tag === "canvas") return { width: 1, height: 1, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} }), toDataURL: () => "data:image/jpeg;base64,preview" };
      return {};
    } },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    window: {
      WarResultRecognition: { locateZones: () => ({ zones: { localTrophies: { x: 100, y: 80, width: 130, height: 34 } }, method: "proportional" }) },
      WarResultsNumericLocatorExperiment: { locate: () => ({ method: "icon-anchored-glyph-run", fields: { localTrophies: { x: 190, y: 290, width: 70, height: 22 } },
        anchors: { localTrophies: [{ x: 190, y: 290, width: 14, height: 18 }] },
        candidates: { localTrophies: [{ rect: { x: 190, y: 290, width: 70, height: 22 }, score: 1.5, selected: true, reason: "icon" }] }, reasons: { localTrophies: null } }) },
      WarResultsTrophyLocatorExperiment: {
        proportionalBand(_width, _height, rect) { refinementBand = rect; return { x: 80, y: rect.y, width: 300, height: rect.height }; },
        locateWithVerticalRecovery(_read, _width, _height, rect) { refinementBand = rect; return { rect: { x: refinedX, y: rect.y, width: 70, height: 22 }, reason: null, recovery: null }; }
      },
      WarResultsDigitReader: {}, WarResultsIdentityEngine: { analyzeRegion() { throw new Error("identity engine called"); } },
      WarResultsResultEngine: { analyze() { throw new Error("result engine called"); } },
      Tesseract: { async createWorker() { return worker; } }
    }
  };
  context.globalThis = context; vm.runInNewContext(engineSource, context);
  const result = await context.window.WarResultsVisionEngine.analyzeNumericFields({ size: 1 }, ["localTrophies"], () => {}, { geometryMode: "pixel-content", variantId: "adaptive-vertical-recovery-combined", marginPercent: 18 });
  const diagnostic = result.fields.localTrophies;
  assert.equal(refinementBand.y, diagnostic.correctedRect.y);
  assert.equal(diagnostic.locator.selectedRect.x, diagnostic.correctedRect.x);
  assert.equal(diagnostic.locator.refinementAccepted, true);
  assert.equal(diagnostic.rect.x, diagnostic.correctedRect.x);
  assert.equal(diagnostic.value, "2738");

  refinedX = 700;
  const rejectedJump = await context.window.WarResultsVisionEngine.analyzeNumericFields({ size: 1 }, ["localTrophies"], () => {}, { geometryMode: "pixel-content", variantId: "adaptive-vertical-recovery-combined", marginPercent: 18 });
  assert.equal(rejectedJump.fields.localTrophies.rect.x, 190, "a remote refinement cannot replace the selected numeric candidate");
  assert.equal(rejectedJump.fields.localTrophies.locator.refinementAccepted, false);
  assert.equal(rejectedJump.fields.localTrophies.locator.reason, "refinement-rejected-outside-selected-candidate");
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

