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

test("adaptive padding scales from glyph height and honors each selected margin", () => {
  const image = syntheticImage(1);
  const band = { x: 96, y: 160, width: 456, height: 60 };
  const crop = locator.cropImageData(image, band);
  for (const [margin, expectedPad] of [[0, 0], [18, 6], [30, 10]]) {
    const result = locator.locateBand(crop, band, image.width, image.height, reader, {
      paddingByGlyphHeight: margin / 100,
      minimumPaddingPixels: margin === 0 ? 0 : 2
    });
    assert.equal(result.reason, null);
    assert.deepEqual(result.rect, { x: 220 - expectedPad, y: 170 - expectedPad, width: 97 + expectedPad * 2, height: 32 + expectedPad * 2 });
  }
});

test("coherent trophy glyph run excludes separate icon and bracketed change", () => {
  const image = syntheticImage(1);
  const paint = (x, y, w, h) => {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) image.data.set([218, 210, 202, 255], (py * image.width + px) * 4);
  };
  paint(170, 170, 14, 32); // isolated icon-sized component
  paint(360, 168, 2, 36); // opening bracket
  paint(390, 176, 14, 24); // two smaller change digits
  paint(417, 176, 14, 24);
  paint(442, 168, 2, 36); // closing bracket
  const band = { x: 96, y: 160, width: 456, height: 60 };
  const result = locator.locateBand(locator.cropImageData(image, band), band, image.width, image.height, reader, {
    paddingByGlyphHeight: .18, minimumPaddingPixels: 2
  });
  assert.equal(result.reason, null);
  assert.equal(result.segmented.bounds.length, 4);
  assert.equal(result.rect.x, 214);
  assert.equal(result.rect.x + result.rect.width, 323);
});

test("invalid sides and vertical bands are rejected", () => {
  assert.equal(locator.proportionalBand(1200, 400, { x: 0, y: 2, width: 5, height: 50 }, "center"), null);
  assert.equal(locator.proportionalBand(1200, 400, { x: 0, y: 2, width: 5, height: 0 }, "left"), null);
});

test("vertical recovery uses proportional offsets only after too-few-components", () => {
  for (const scale of [1, 2]) {
    const image = syntheticImage(scale);
    const wrongRow = { x: 0, y: 225 * scale, width: 1, height: 60 * scale };
    const readBand = (rect) => locator.cropImageData(image, rect);
    const result = locator.locateWithVerticalRecovery(readBand, image.width, image.height, wrongRow, "left", reader);
    assert.equal(result.reason, null);
    assert.equal(result.segmented.bounds.length, 4);
    assert.equal(result.recovery.method, "proportional-vertical-search");
    assert.ok(result.rect.y < 170 * scale);
    assert.ok(result.rect.y + result.rect.height > 202 * scale);
    assert.deepEqual(result.segmented.warnings, []);
  }
});

test("vertical recovery does not replace a valid primary segmentation", () => {
  const image = syntheticImage(1);
  const primaryRow = { x: 0, y: 160, width: 1, height: 60 };
  const result = locator.locateWithVerticalRecovery((rect) => locator.cropImageData(image, rect), image.width, image.height, primaryRow, "left", reader);
  assert.equal(result.reason, null);
  assert.equal(result.recovery, null);
  assert.equal(result.bandRect.y, 160);
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

