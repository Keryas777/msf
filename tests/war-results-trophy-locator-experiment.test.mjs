import test from "node:test";
import assert from "node:assert/strict";
await import("../docs/war-results-trophy-locator-experiment.js");
await import("../docs/war-results-digit-reader.js");
const locator = globalThis.WarResultsTrophyLocatorExperiment;
const reader = globalThis.WarResultsDigitReader;

function syntheticImage(scale = 1, offset = { x: 0, y: 0 }, count = 4) {
  const width = 1200 * scale, height = 400 * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  const color = [218, 210, 202, 255];
  const sideX = 220 * scale + offset.x;
  const top = 170 * scale + offset.y;
  for (let n = 0; n < count; n++) {
    const left = sideX + n * 27 * scale;
    for (let y = top; y < top + 32 * scale; y++) {
      for (let x = left; x < left + 16 * scale; x++) {
        const i = (y * width + x) * 4;
        data.set(color, i);
      }
    }
  }
  return { width, height, data };
}

test("proportional side bands scale with image resolution and ignore x-anchor", () => {
  const small = locator.proportionalBand(1200, 400, { x: 400, y: 170, width: 20, height: 80 }, "left");
  const large = locator.proportionalBand(2400, 800, { x: 900, y: 340, width: 40, height: 160 }, "left");
  assert.deepEqual(large, { x: small.x * 2, y: small.y * 2, width: small.width * 2, height: small.height * 2 });
});

test("refinement finds component bounds in original-image coordinates at multiple scales", () => {
  for (const scale of [1, 1.5, 2]) {
    const image = syntheticImage(scale);
    const result = locator.locate(image, "left", { x: 0, y: 160 * scale, width: 20, height: 60 * scale }, reader);
    assert.equal(result.reason, null);
    assert.equal(result.segmented.bounds.length, 4);
    assert.ok(result.rect.x > 200 * scale);
    assert.ok(result.rect.y < 170 * scale);
    assert.ok(result.rect.x + result.rect.width > 310 * scale);
    assert.ok(result.rect.y + result.rect.height > 202 * scale);
  }
});

test("refinement refuses missing glyphs instead of returning an arbitrary crop", () => {
  const image = syntheticImage(1, { x: 0, y: 0 }, 3);
  const result = locator.locate(image, "left", { x: 0, y: 160, width: 20, height: 60 }, reader);
  assert.equal(result.rect, null);
  assert.ok(result.reason);
});

test("invalid sides and vertical bands are rejected", () => {
  assert.equal(locator.proportionalBand(1200, 400, { x: 0, y: 2, width: 5, height: 50 }, "center"), null);
  assert.equal(locator.proportionalBand(1200, 400, { x: 0, y: 2, width: 5, height: 0 }, "left"), null);
});

test("glyph rectangles convert from local crop to original-image coordinates", () => {
  const local = [{ x: 8, y: 11, width: 12, height: 27 }, { x: 29, y: 11, width: 13, height: 27 }];
  assert.deepEqual(locator.translateBoundsToSource(local, { x: 500, y: 240 }), [
    { x: 508, y: 251, width: 12, height: 27 },
    { x: 529, y: 251, width: 13, height: 27 }
  ]);
  assert.deepEqual(locator.translateBoundsToSource(local, { x: 500.5, y: 240 }), [
    { x: 508.5, y: 251, width: 12, height: 27 },
    { x: 529.5, y: 251, width: 13, height: 27 }
  ]);
});

