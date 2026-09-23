import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTACK_GREEN_DOMINANCE,
  ATTACK_GREEN_MIN_RATIO,
  HEADER_REGIONS,
  PANEL_DIVIDER_TARGET_Y,
  greenMarkerRatio,
  inferAttackSide,
  inferVerticalPanelAlignment,
  mapPanelRegion
} from "../docs/war-counter-header-vision.js";

test("header regions stay inside normalized capture coordinates", () => {
  for (const group of Object.values(HEADER_REGIONS)) {
    for (const region of Object.values(group)) {
      assert.ok(region.x >= 0);
      assert.ok(region.y >= 0);
      assert.ok(region.width > 0);
      assert.ok(region.height > 0);
      assert.ok(region.x + region.width <= 1);
      assert.ok(region.y + region.height <= 1);
    }
  }
});

test("panel mapping applies horizontal and guarded vertical realignment independently", () => {
  const region = { x: 0.20, y: 0.10, width: 0.10, height: 0.15 };

  assert.deepEqual(mapPanelRegion(region, { used: false }, 1000), region);

  assert.deepEqual(
    mapPanelRegion(
      region,
      { used: true, left: 100, right: 900, verticalUsed: true, yShift: 0.03 },
      1000
    ),
    {
      x: 0.26,
      y: 0.13,
      width: 0.08,
      height: 0.15
    }
  );

  assert.deepEqual(
    mapPanelRegion(region, { used: false, verticalUsed: true, yShift: -0.02 }, 1000),
    {
      x: 0.20,
      y: 0.08,
      width: 0.10,
      height: 0.15
    }
  );
});

function measuredAlignment({ width, height, dividerY, dividerPixels }) {
  const yOffset = Math.floor(height * 0.47);
  const rowCounts = new Uint16Array(Math.ceil(height * 0.93) - yOffset);
  rowCounts[dividerY - yOffset] = dividerPixels;
  return inferVerticalPanelAlignment(rowCounts, {
    imageHeight: height,
    yOffset,
    scanWidth: width
  });
}

test("field baseline remains untouched while vertically cropped captures are realigned", () => {
  const baseline = measuredAlignment({
    width: 2125,
    height: 541,
    dividerY: 284,
    dividerPixels: 2072
  });
  assert.equal(baseline.verticalUsed, false);
  assert.equal(baseline.yShift, 0);
  assert.ok(Math.abs(baseline.dividerYRatio - PANEL_DIVIDER_TARGET_Y) < 0.002);

  const samples = [
    { id: "IMG_1700", width: 1449, height: 380, dividerY: 213, dividerPixels: 1379, minShift: 0.034, maxShift: 0.037 },
    { id: "IMG_1702", width: 1443, height: 361, dividerY: 200, dividerPixels: 1380, minShift: 0.028, maxShift: 0.031 },
    { id: "IMG_1703", width: 1406, height: 385, dividerY: 213, dividerPixels: 1380, minShift: 0.027, maxShift: 0.030 }
  ];

  for (const sample of samples) {
    const result = measuredAlignment(sample);
    assert.equal(result.verticalUsed, true, sample.id);
    assert.ok(result.yShift >= sample.minShift, `${sample.id} shift too small`);
    assert.ok(result.yShift <= sample.maxShift, `${sample.id} shift too large`);
    assert.ok(result.dividerCoverage > 0.95, sample.id);
  }
});

test("vertical alignment falls back safely when the separator is weak", () => {
  const result = measuredAlignment({
    width: 1400,
    height: 380,
    dividerY: 213,
    dividerPixels: 300
  });

  assert.equal(result.verticalUsed, false);
  assert.equal(result.yShift, 0);
  assert.match(result.verticalReason, /insuffisante/);
});

test("green marker scoring keeps only the bright MSF points green", () => {
  const pixels = new Uint8ClampedArray([
    80, 220, 70, 255,
    90, 205, 80, 255,
    240, 220, 40, 255,
    80, 90, 100, 255
  ]);

  assert.equal(greenMarkerRatio({ data: pixels }), 0.5);
});

test("attack side inference requires both a minimum signal and clear dominance", () => {
  assert.equal(inferAttackSide(0.041, 0), "left");
  assert.equal(inferAttackSide(0, 0.033), "right");
  assert.equal(inferAttackSide(ATTACK_GREEN_MIN_RATIO / 2, 0), null);
  assert.equal(inferAttackSide(0.02, 0.02 / ATTACK_GREEN_DOMINANCE * 1.01), null);
});


test("current six field captures keep an unambiguous local attack-side signal", () => {
  const samples = [
    { id: "field-06", left: 0, right: 0.0366300366, expected: "right" },
    { id: "field-05", left: 0, right: 0.0328811813, expected: "right" },
    { id: "field-04", left: 0, right: 0.0135004822, expected: "right" },
    { id: "field-03", left: 0, right: 0.0267224971, expected: "right" },
    { id: "field-01", left: 0.0402328368, right: 0, expected: "left" },
    { id: "field-02", left: 0.0422161644, right: 0, expected: "left" }
  ];

  for (const sample of samples) {
    assert.equal(inferAttackSide(sample.left, sample.right), sample.expected, sample.id);
  }
});
