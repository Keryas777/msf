const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function loadScript(file, context = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, performance, ...context });
  return module.exports;
}
const reference = loadScript(path.resolve(__dirname, "../../../docs/war-results-score-locator-experiment.js"));
const locator = loadScript(path.resolve(__dirname, "../../../docs/war-results-score-locator-v020-experiment.js"),
  { WarResultsScoreLocatorExperiment: reference });

function image(width = 900, height = 400, bg = [40, 45, 55]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([...bg, 255], p * 4);
  return { width, height, data };
}
function paint(img, x, y, w, h, color = [244, 226, 160]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
    img.data.set([...color, 255], (yy * img.width + xx) * 4);
}
function drawRow(img, x, y, widths = [17, 20, 15, 19, 20, 17], height = 32, gap = 6) {
  const boxes = [];
  widths.forEach((width, index) => {
    const top = y + index % 2, shear = Math.floor(height * .08);
    for (let yy = 0; yy < height; yy++) {
      const left = x + Math.floor(yy / Math.max(1, height / Math.max(1, shear)));
      for (let xx = 0; xx < width; xx++) img.data.set([244, 226, 160, 255], ((top + yy) * img.width + left + xx) * 4);
    }
    boxes.push({ x, y: top, width, height, area: width * height, touchesSearchEdge: false });
    x += width + gap;
  });
  return boxes;
}
function crop(x, y, width, height) { return { x, y, width, height }; }
const actualAthenaDigits = [
  { x: 1037, y: 492, width: 48, height: 52, area: 1300 },
  { x: 1080, y: 492, width: 46, height: 52, area: 1183 },
  { x: 1120, y: 492, width: 48, height: 52, area: 1138 },
  { x: 1179, y: 492, width: 47, height: 52, area: 1162 },
  { x: 1226, y: 492, width: 38, height: 52, area: 1180 },
  { x: 1264, y: 492, width: 47, height: 52, area: 1501 }
].map((component) => ({ ...component, touchesSearchEdge: false }));
const athenaSpecks = [
  { x: 1056, y: 509, width: 3, height: 1, area: 3, touchesSearchEdge: false },
  { x: 1204, y: 526, width: 3, height: 2, area: 3, touchesSearchEdge: false }
];

test("Athena export geometry reproduces the V0.1 grouping rejection; V0.2 isolates six glyph components", () => {
  // Component geometry is transcribed from the original Safari diagnostics; no screenshot pixels are stored.
  const components = [...actualAthenaDigits, ...athenaSpecks];
  const v01 = reference.groupComponents(components, crop(530, 410, 1078, 273));
  assert.equal(v01.length, 0, "the two tiny same-row specks push V0.1 baselineSpread above its 0.48-height limit");
  const v02 = locator.groupComponents(components, crop(530, 410, 1078, 273), crop(771, 489, 611, 115), "anchored");
  assert.equal(v02.candidates[0].count, 6);
  assert.equal(v02.candidates[0].baselineSpread, 0);
  assert.equal(Array.from(v02.candidates[0].glyphs, (g) => g.x).join(","), actualAthenaDigits.map((g) => g.x).join(","));
});

test("Athena opponent export geometry reproduces the same baseline-spread rejection before candidate ranking", () => {
  const digits = [
    [2067, 45, 1285], [2112, 40, 1210], [2151, 46, 1455],
    [2209, 47, 1453], [2252, 47, 1297], [2293, 48, 1222]
  ].map(([x, width, area]) => ({ x, y: 492, width, height: 52, area, touchesSearchEdge: false }));
  const speck = { x: 2258, y: 514, width: 1, height: 3, area: 3, touchesSearchEdge: false };
  const components = [...digits, speck];
  assert.equal(reference.groupComponents(components, crop(1608, 410, 1141, 273)).length, 0);
  const groups = locator.groupComponents(components, crop(1608, 410, 1141, 273), crop(1833, 489, 675, 115), "anchored");
  assert.ok(groups.candidates.some((candidate) => candidate.count === 6));
});

test("large and many tiny yellow parasites cannot set the score-row height family", () => {
  const parasites = [
    { x: 700, y: 512, width: 157, height: 171, area: 14012, touchesSearchEdge: true },
    { x: 680, y: 524, width: 39, height: 159, area: 1490, touchesSearchEdge: true },
    ...Array.from({ length: 18 }, (_, i) => ({ x: 1010 + i * 7, y: 506 + i % 5, width: 1, height: 1, area: 3, touchesSearchEdge: false }))
  ];
  const groups = locator.groupComponents([...actualAthenaDigits, ...parasites], crop(530, 410, 1078, 273),
    crop(771, 489, 611, 115), "anchored");
  assert.ok(groups.candidates.some((candidate) => candidate.count === 6));
  assert.ok(groups.families.length > 1);
});

test("family formation is independent of input traversal order and keeps separate score rows", () => {
  const first = drawFixture(110, 100, 6, 22), second = drawFixture(110, 160, 6, 22);
  const shuffled = [...first, ...second].reverse();
  const groups = locator.groupComponents(shuffled, crop(60, 70, 250, 170), crop(90, 90, 170, 60), "anchored");
  assert.equal(groups.families.filter((family) => family.componentCount === 6).length, 2);
  assert.equal(Array.from(groups.candidates.filter((candidate) => candidate.count === 6), (c) => c.rect.y).sort((a, b) => a - b).join(","), "100,160");
});

function drawFixture(x, y, count, height) {
  return Array.from({ length: count }, (_, i) => ({ x: x + i * 27, y: y + i % 2,
    width: i === 1 ? 11 : 18, height, area: 420, touchesSearchEdge: false }));
}

test("overlapping italic bounding boxes remain in one row, including a thousand separator gap", () => {
  const glyphs = [
    [100, 100, 35], [127, 101, 31], [154, 100, 34],
    [208, 101, 30], [235, 100, 36], [263, 101, 32]
  ].map(([x, y, width]) => ({ x, y, width, height: 40, area: width * 24, touchesSearchEdge: false }));
  const result = locator.groupComponents(glyphs, crop(60, 70, 310, 100), crop(90, 90, 220, 65), "anchored");
  assert.equal(result.candidates[0].count, 6);
  assert.equal(result.candidates[0].rect.width, 195);
});

test("short and long scores are retained without a fixed digit count or equal glyph widths", () => {
  const short = drawFixture(100, 100, 2, 24), long = drawFixture(100, 150, 11, 24);
  const groups = locator.groupComponents([...short, ...long], crop(50, 70, 400, 160), crop(80, 90, 240, 100), "anchored");
  assert.ok(groups.candidates.some((candidate) => candidate.count === 2));
  assert.ok(groups.candidates.some((candidate) => candidate.count === 11));
  assert.ok(groups.candidates.some((candidate) => candidate.glyphs.some((g) => g.width === 11)));
});

test("an isolated portrait-like component is diagnostic only and does not receive a high rank", () => {
  const img = image();
  paint(img, 760, 160, 18, 40);
  const result = locator.locate(img, "opponentScore", crop(500, 100, 180, 60), "anchored");
  assert.equal(result.localized, false);
  assert.equal(result.status, "uncertain-candidate");
  assert.equal(result.finalRect, null);
  assert.ok(result.candidates[0].score < .66);
  assert.ok(result.candidates[0].reasons.includes("single-component-needs-independent-evidence"));
});

test("priority search expands from original pixels when the proportional zone cuts the first glyph", () => {
  const img = image();
  drawRow(img, 190, 120, [17, 20, 14, 19, 20, 17], 32, 6);
  const result = locator.locate(img, "localScore", crop(205, 108, 150, 60), "anchored");
  assert.equal(result.localized, true);
  assert.ok(result.finalRect.x <= 190);
  assert.ok(result.extensions.some((step) => step.reason === "anchor-incomplete-or-uncertain"));
  assert.equal(result.finalRect.y > 0, true);
});

test("geometry ablation starts at the V0.1 expanded region; anchored variants start at the tighter proportional priority region", () => {
  const img = image();
  drawRow(img, 190, 120, [17, 20, 14, 19, 20, 17], 32, 6);
  const proportional = crop(205, 108, 150, 60);
  const geometry = locator.locate(img, "localScore", proportional, "geometry");
  const anchored = locator.locate(img, "localScore", proportional, "anchored");
  assert.equal(geometry.regions[0].stage, "anchor-expanded");
  assert.equal(anchored.regions[0].stage, "anchor-priority");
  assert.ok(geometry.regions[0].rect.width > proportional.width);
  assert.ok(anchored.regions[0].rect.width < geometry.regions[0].rect.width);
});

test("horizontal recovery re-reads the original pixels when the final glyph is clipped by the priority region", () => {
  const img = image();
  const boxes = drawRow(img, 180, 120, [17, 20, 14, 19, 20, 17], 32, 6);
  const rightmost = boxes.at(-1).x + boxes.at(-1).width + 2;
  const result = locator.locate(img, "localScore", crop(170, 108, rightmost - 170 - 25, 60), "anchored");
  assert.equal(result.localized, true);
  assert.ok(result.finalRect.x + result.finalRect.width >= rightmost);
  assert.ok(result.stages.some((stage) => stage.stage !== "anchor-priority"));
});

test("absolute source coordinates are preserved when the crop and search areas have offsets", () => {
  const img = image();
  drawRow(img, 142, 122, [16, 18, 14, 17], 28, 5);
  const result = locator.locate(img, "localScore", crop(130, 112, 120, 48), "anchored");
  assert.equal(result.localized, true);
  assert.ok(result.finalRect.x >= 130);
  assert.ok(result.finalRect.y >= 122 - 4);
});

test("joint localization accepts aligned coherent score rows on both sides", () => {
  const img = image();
  drawRow(img, 130, 125, [17, 20, 14, 19, 20], 32, 6);
  drawRow(img, 555, 125, [18, 16, 20, 13, 18, 17], 32, 6);
  const result = locator.compare(img, ["localScore", "opponentScore"], {
    localScore: crop(115, 112, 190, 58), opponentScore: crop(540, 112, 200, 58)
  }, ["joint"]);
  assert.equal(result.variants.joint.fields.localScore.localized, true);
  assert.equal(result.variants.joint.fields.opponentScore.localized, true);
  assert.equal(result.variants.joint.fields.localScore.joint.evaluatedBothSides, true);
  assert.ok(result.variants.joint.fields.localScore.joint.heightAgreement > .9);
});

test("a reliable score is preserved when the opposite field has only one uncertain component", () => {
  const img = image();
  drawRow(img, 130, 125, [17, 20, 14, 19, 20], 32, 6);
  paint(img, 560, 155, 22, 31);
  const result = locator.compare(img, ["localScore", "opponentScore"], {
    localScore: crop(115, 112, 190, 58), opponentScore: crop(540, 112, 200, 58)
  }, ["joint"]);
  assert.equal(result.variants.joint.fields.localScore.localized, true);
  assert.equal(result.variants.joint.fields.opponentScore.localized, false);
  assert.ok(result.variants.joint.fields.opponentScore.warnings.includes("joint-localization-abstained"));
});

test("a one-component score can be localized only when the opposite coherent score anchors the pair", () => {
  const img = image();
  paint(img, 160, 126, 11, 31);
  drawRow(img, 555, 125, [18, 16, 20, 13, 18], 32, 6);
  const result = locator.compare(img, ["localScore", "opponentScore"], {
    localScore: crop(145, 112, 120, 58), opponentScore: crop(540, 112, 180, 58)
  }, ["joint"]);
  assert.equal(result.variants.joint.fields.localScore.localized, true);
  assert.equal(result.variants.joint.fields.localScore.glyphCount, 1);
  assert.equal(result.variants.joint.fields.opponentScore.localized, true);
});

test("two aligned single-component parasites do not become a score pair", () => {
  const img = image();
  paint(img, 160, 126, 20, 31); paint(img, 580, 126, 20, 31);
  const result = locator.compare(img, ["localScore", "opponentScore"], {
    localScore: crop(145, 112, 120, 58), opponentScore: crop(565, 112, 120, 58)
  }, ["joint"]);
  assert.equal(result.variants.joint.fields.localScore.localized, false);
  assert.equal(result.variants.joint.fields.opponentScore.localized, false);
  assert.equal(result.variants.joint.fields.localScore.joint.pairCount, 0);
});

test("multiple plausible coherent rows remain ambiguous when their anchor evidence is equal", () => {
  const img = image();
  drawRow(img, 130, 110, [17, 20, 14, 19, 20], 32, 6);
  drawRow(img, 130, 151, [17, 20, 14, 19, 20], 32, 6);
  const result = locator.locate(img, "localScore", crop(118, 98, 190, 95), "anchored");
  assert.equal(result.localized, false);
  assert.ok(result.warnings.includes("multiple-plausible-groups") || result.status === "uncertain-candidate");
});

test("measurement and reference masks stay separate from V0.2 geometry decisions", () => {
  const yellow = [244, 226, 160], blue = [70, 90, 130];
  assert.equal(reference.isYellowPixel(...yellow), true);
  assert.equal(reference.isYellowPixel(...blue), false);
  assert.equal(locator.defaults.colorThresholds, undefined);
  const img = image(400, 220, [160, 30, 38]);
  drawRow(img, 145, 110, [17, 20, 14, 19], 28, 5);
  const stable = (value) => { const { elapsedMs, ...rest } = value; return JSON.stringify(rest); };
  const first = stable(reference.locate(img, "localScore", crop(138, 100, 160, 50)));
  locator.locate(img, "localScore", crop(138, 100, 160, 50), "anchored");
  const second = stable(reference.locate(img, "localScore", crop(138, 100, 160, 50)));
  assert.equal(first, second, "V0.2 cannot mutate V0.1 state or outputs");
});
