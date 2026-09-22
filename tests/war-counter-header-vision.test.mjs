import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTACK_GREEN_DOMINANCE,
  ATTACK_GREEN_MIN_RATIO,
  HEADER_REGIONS,
  greenMarkerRatio,
  inferAttackSide,
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

test("panel mapping only adjusts horizontal coordinates when global realignment is used", () => {
  const region = { x: 0.20, y: 0.10, width: 0.10, height: 0.15 };

  assert.deepEqual(mapPanelRegion(region, { used: false }, 1000), region);

  assert.deepEqual(
    mapPanelRegion(region, { used: true, left: 100, right: 900 }, 1000),
    {
      x: 0.26,
      y: 0.10,
      width: 0.08,
      height: 0.15
    }
  );
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
