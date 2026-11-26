const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
function loadScript(path) { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path, 'utf8'), { module, performance }); return module.exports; }
const locator = loadScript(require.resolve('../../../docs/war-results-score-locator-experiment.js'));

function image(width = 480, height = 240, bg = [24, 30, 44]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([...bg, 255], p * 4);
  return { width, height, data };
}
function paint(img, x, y, w, h, color = [244, 205, 79]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data.set([...color, 255], (yy * img.width + xx) * 4);
}
function score(img, x, y, widths, gap = 5, h = 14, color = [244, 205, 79]) {
  for (const [index, w] of widths.entries()) { paint(img, x, y + (index % 2), w, h, color); x += w + gap; }
}
function zone(x, y = 90, width = 100, height = 30) { return { x, y, width, height }; }

test('score locator detects variable lengths and thousand-separator gaps without an OCR digit count', () => {
  for (const [widths, gap] of [[[8, 10, 8], 5], [[8, 10, 9, 8], 5], [[8, 10, 9, 8, 6], 5], [[8, 10, 9, 8, 8, 6], 11]]) {
    const img = image(); score(img, 120, 100, widths, gap);
    const result = locator.locate(img, 'localScore', zone(112, 90, 100));
    assert.equal(result.localized, true, JSON.stringify(widths));
    assert.equal(result.glyphCount, widths.length);
    assert.ok(result.finalRect.x <= 120);
    assert.ok(result.finalRect.x + result.finalRect.width >= 120 + widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1));
  }
});

test('side-specific search ignores the opposite score group and reports source geometry', () => {
  const img = image(); score(img, 100, 100, [8, 10, 9, 8]); score(img, 350, 100, [7, 10, 8, 8, 6]);
  const both = locator.compare(img, ['localScore', 'opponentScore'], { localScore: zone(90), opponentScore: zone(345) });
  assert.equal(both.dimensions.width, 480);
  assert.equal(both.fields.localScore.localized, true);
  assert.equal(both.fields.opponentScore.localized, true);
  assert.ok(both.fields.localScore.finalRect.x + both.fields.localScore.finalRect.width < 240);
  assert.ok(both.fields.opponentScore.finalRect.x >= 240);
});

test('yellow antialias shades and dark/light backgrounds retain connected glyph pixels', () => {
  for (const bg of [[15, 19, 30], [95, 83, 62], [218, 220, 225]]) {
    const img = image(480, 240, bg);
    score(img, 120, 100, [8, 10, 9, 8], 5, 14, [230, 188, 75]);
    // Low-coverage yellow edge pixels simulate antialiasing on a dark background.
    paint(img, 119, 106, 1, 4, [155, 130, 75]);
    const result = locator.locate(img, 'localScore', zone(112));
    assert.equal(result.localized, true, JSON.stringify(bg));
  }
});

test('search retries on the original image when a proportional zone clips the first glyph', () => {
  const img = image(); score(img, 118, 100, [8, 10, 9, 8]);
  const result = locator.locate(img, 'localScore', zone(124, 90, 75), { searchXFraction: 0 });
  assert.equal(result.localized, true);
  assert.ok(result.extensions.length > 0);
  assert.ok(result.finalRect.x <= 118);
  assert.ok(result.diagnostics.includes('recovered-from-original-capture'));
});

test('last glyph extension is recovered from original image when initial search region ends early', () => {
  const img = image(); score(img, 120, 100, [8, 10, 9, 8, 9]);
  const result = locator.locate(img, 'localScore', zone(115, 90, 72));
  assert.equal(result.localized, true);
  assert.equal(result.glyphCount, 5);
  assert.ok(result.finalRect.x + result.finalRect.width >= 120 + 8 + 5 + 10 + 5 + 9 + 5 + 8 + 5 + 9);
});

test('vertical recovery searches the original image when the initial band clips the top of a score', () => {
  const img = image(); score(img, 120, 65, [8, 10, 9, 8]);
  const result = locator.locate(img, 'localScore', zone(110, 100, 100, 25));
  assert.equal(result.localized, true);
  assert.ok(result.finalRect.y <= 65);
  assert.ok(result.extensions.some((step) => step.recovered));
  assert.ok(result.diagnostics.includes('recovered-from-original-capture'));
});

test('two equally plausible rows are reported as ambiguous instead of choosing a crop', () => {
  const img = image(); score(img, 120, 95, [8, 10, 9, 8]); score(img, 120, 117, [8, 10, 9, 8]);
  const result = locator.locate(img, 'localScore', zone(110, 90, 100, 40));
  assert.equal(result.localized, false);
  assert.ok(result.warnings.includes('multiple-plausible-groups'));
});

test('italic-like glyphs with slanted edges stay inside an appropriately padded native crop', () => {
  const img = image();
  // Slanted pixel columns emulate an italic run and preserve nonuniform advances.
  const widths = [8, 10, 8, 9]; let x = 120;
  widths.forEach((w, n) => {
    for (let y = 0; y < 16; y++) for (let xx = 0; xx < w; xx++) {
      const sx = x + xx + Math.floor(y * .12);
      img.data.set([244, 205, 79, 255], ((100 + y) * img.width + sx) * 4);
    }
    x += w + (n === 1 ? 10 : 5);
  });
  const result = locator.locate(img, 'localScore', zone(110));
  assert.equal(result.localized, true);
  assert.ok(result.finalRect.x <= 120);
  assert.ok(result.finalRect.x + result.finalRect.width >= x - 5);
  assert.ok(result.glyphs.every((g) => g.x >= result.finalRect.x && g.x + g.width <= result.finalRect.x + result.finalRect.width));
});

test('relative layout and crop geometry scale across wide and compact image resolutions', () => {
  for (const [width, height] of [[900, 360], [320, 640], [1600, 900]]) {
    const img = image(width, height), scale = Math.min(width / 480, height / 240);
    const x = Math.round(width * .25), y = Math.round(height * .42), glyphWidths = [8, 10, 9, 8].map((v) => Math.max(3, Math.round(v * scale)));
    score(img, x, y, glyphWidths, Math.max(2, Math.round(5 * scale)), Math.max(6, Math.round(14 * scale)));
    const result = locator.locate(img, 'localScore', zone(x - 8 * scale, y - 10 * scale, 100 * scale, 30 * scale));
    assert.equal(result.localized, true, `${width}x${height}`);
    assert.ok(result.finalRect.x <= x);
  }
});

test('letters, distant decorations, absence, and ambiguity are surfaced without forcing a read', () => {
  const blank = image();
  assert.equal(locator.locate(blank, 'localScore', zone(90)).localized, false);
  const noisy = image();
  // A text-like yellow stripe is non-numeric geometry and remains a diagnostic candidate only.
  paint(noisy, 118, 100, 45, 3, [244, 205, 79]);
  paint(noisy, 175, 100, 35, 3, [244, 205, 79]);
  const result = locator.locate(noisy, 'localScore', zone(110, 90, 95));
  assert.equal(result.localized, false);
  assert.ok(result.warnings.includes('incoherent-component-dimensions'));
});

test('final crop contains all significant detected glyph pixels and parameters/time are exported', () => {
  const img = image(); score(img, 120, 98, [8, 10, 9, 8, 6], 7, 15);
  const result = locator.locate(img, 'localScore', zone(110));
  assert.equal(result.localized, true);
  for (const glyph of result.glyphs) {
    assert.ok(glyph.x >= result.finalRect.x);
    assert.ok(glyph.y >= result.finalRect.y);
    assert.ok(glyph.x + glyph.width <= result.finalRect.x + result.finalRect.width);
    assert.ok(glyph.y + glyph.height <= result.finalRect.y + result.finalRect.height);
  }
  assert.equal(result.parameters.minimumChroma, 16);
  assert.ok(Number.isFinite(result.elapsedMs));
});

test('source color measurement reports RGB/HSV distributions, V0.1 mask rejects and a renderable mask without changing localization', () => {
  const img = image(32, 24, [180, 40, 35]);
  score(img, 8, 8, [5, 6, 5], 2, 8, [238, 218, 164]);
  paint(img, 20, 8, 5, 6, [244, 205, 79]);
  const stableResult = (value) => { const { elapsedMs, ...stable } = value; return JSON.stringify(stable); };
  const before = stableResult(locator.locate(img, 'localScore', zone(4, 5, 24, 14)));
  const measured = locator.analyzeColorRegion(img, { x: 4, y: 4, width: 24, height: 16 });
  assert.equal(measured.region.x, 4);
  assert.equal(measured.pixelCount, 384);
  assert.equal(measured.accepted + measured.rejected, measured.pixelCount);
  assert.equal(measured.pixelClasses.accepted.count, measured.accepted);
  assert.equal(measured.pixelClasses.rejected.count, measured.rejected);
  assert.ok(measured.pixelClasses.accepted.rgb[0].median > measured.pixelClasses.rejected.rgb[0].median);
  assert.ok(Object.keys(measured.pixelClasses.rejectedByReason).length > 0);
  assert.ok(measured.distributions.red.median > 0);
  assert.ok(measured.distributions.hueDegrees.median >= 0);
  assert.equal(measured.maskNeighborhood.interior.count + measured.maskNeighborhood.antialiasOrBoundary.count, measured.accepted);
  assert.equal(measured.rejectionReasons.accepted, measured.accepted);
  const preview = locator.renderDiagnosticMask(measured);
  assert.equal(preview.width, 24); assert.equal(preview.height, 16); assert.equal(preview.data.length, 24 * 16 * 4);
  const stages = locator.diagnoseSearch(img, { x: 4, y: 4, width: 24, height: 16 });
  assert.equal(stages.stages.map((item) => item.stage).join(","), "search-region,color-mask,connected-components,component-filter,grouping,candidate-ranking");
  assert.equal(stages.stages[1].pixelCount, 384);
  assert.equal(stableResult(locator.locate(img, 'localScore', zone(4, 5, 24, 14))), before, 'diagnostic API must not alter V0.1 behavior');
});

test('existing trophy pixel locator and digit reader remain unchanged', () => {
  const trophy = fs.readFileSync(require.resolve('../../../docs/war-results-numeric-locator-experiment.js'), 'utf8');
  const reader = fs.readFileSync(require.resolve('../../../docs/war-results-digit-reader.js'), 'utf8');
  assert.match(trophy, /const EXPECTED = Object\.freeze\(\{ localScore: 6/);
  assert.match(reader, /function segment\(imageData, category, count, options = \{\}\)/);
});
