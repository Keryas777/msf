import assert from 'node:assert/strict';
import { test } from 'node:test';
await import('../../../docs/war-results-digit-reader.js');
await import('../../../docs/war-results-score-locator-experiment.js');
await import('../../../docs/war-results-numeric-library.js');
const api = globalThis.WarResultsNumericLibrary, reader = globalThis.WarResultsDigitReader;
const scoreLocator = globalThis.WarResultsScoreLocatorExperiment;

const digitRows = {
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00001','01110']
};
function makeDigits(value, scale = 2, gap = 4) {
  const margin = 5, unit = scale, width = margin * 2 + [...value].length * 5 * unit + Math.max(0, [...value].length - 1) * gap;
  const height = margin * 2 + 7 * unit, data = new Uint8ClampedArray(width * height * 4);
  [...value].forEach((digit, n) => digitRows[digit].forEach((line, y) => [...line].forEach((bit, x) => {
    if (bit !== '1') return;
    for (let yy = 0; yy < unit; yy++) for (let xx = 0; xx < unit; xx++) {
      const px = margin + n * (5 * unit + gap) + x * unit + xx, py = margin + y * unit + yy, i = (py * width + px) * 4;
      data[i] = 220; data[i + 1] = 225; data[i + 2] = 245; data[i + 3] = 255;
    }
  })));
  return { width, height, data };
}

test('manual value is ground truth and reports digit/glyph count mismatch', () => {
  assert.deepEqual(api.validateManualValue('25 90', 4), { digits: '2590', valid: true, digitCount: 4, glyphCount: 4, warning: null });
  const mismatch = api.validateManualValue('25890', 4);
  assert.equal(mismatch.valid, false); assert.match(mismatch.warning, /5 chiffre.*4 glyphe/);
  assert.equal(api.validateManualValue('', 0).valid, false);
});

test('score glyph extraction reuses the score localizer color mask without changing its thresholds', () => {
  const image = makeDigits('25');
  for (let p = 0; p < image.width * image.height; p++) if (image.data[p * 4 + 3]) image.data.set([250, 220, 100, 255], p * 4);
  const rect = { x: 0, y: 0, width: image.width, height: image.height };
  const expected = scoreLocator.componentsInRegion(image, rect, { ...scoreLocator.defaults, minimumArea: 1 });
  const source = api.componentReaderForField('localScore', image);
  assert.equal(source.source, 'score-localizer-yellow-mask');
  assert.deepEqual(source.foreground(image, 'score'), expected.mask, 'the library uses the exact mask API and defaults used by the score locator');
  assert.equal(api.componentReaderForField('localTrophies', image).source, 'trophy-localizer-digit-reader-mask');
});

test('existing segmenter extracts original isolated color pixels and per-glyph masks for varying lengths', () => {
  for (const value of ['251','2590','278932']) {
    const extracted = api.extractGlyphs(makeDigits(value), 'trophy', value.length, reader);
    assert.equal(extracted.glyphs.length, value.length, value);
    for (const glyph of extracted.glyphs) {
      assert.equal(glyph.native.rgba.length, glyph.native.width * glyph.native.height * 4);
      assert.equal(glyph.native.mask.length, glyph.native.width * glyph.native.height);
      assert.ok(glyph.native.mask.some(Boolean));
      for (let p = 0; p < glyph.native.mask.length; p++) if (!glyph.native.mask[p]) assert.equal(glyph.native.rgba[p * 4 + 3], 0, 'neighbor/background pixels are transparent');
      assert.equal(glyph.normalized.width, 48); assert.equal(glyph.normalized.height, 64);
    }
  }
});

test('normalization preserves aspect ratio, cavity and open outline instead of stretching glyphs', () => {
  const rgba = new Uint8Array(8 * 16 * 4), mask = new Uint8Array(8 * 16);
  for (let y = 1; y < 15; y++) for (let x = 1; x < 7; x++) if (x === 1 || x === 6 || y === 1 || y === 14) {
    const p = y * 8 + x; mask[p] = 255; rgba.set([240, 180, 60, 255], p * 4);
  }
  const normalized = api.normalizeGlyph({ width: 8, height: 16, rgba, mask });
  assert.ok(normalized.fit.width / normalized.fit.height < .6, 'portrait ratio remains narrow');
  const cx = Math.floor(normalized.fit.x + normalized.fit.width / 2), cy = Math.floor(normalized.fit.y + normalized.fit.height / 2);
  assert.equal(normalized.rgba[(cy * 48 + cx) * 4 + 3], 0, 'the closed cavity remains open/empty');
});

test('italic shear is estimated from glyph rows and keeps every significant pixel in bounds', () => {
  const rgba = new Uint8Array(48 * 64 * 4);
  for (let y = 8; y < 56; y++) for (let x = 12 + Math.floor((y - 8) * .18); x < 24 + Math.floor((y - 8) * .18); x++) rgba.set([25, 25, 25, 255], (y * 48 + x) * 4);
  const normalized = { width: 48, height: 64, rgba }, estimate = api.estimateShear(normalized), sheared = api.shearGlyph(normalized, estimate);
  assert.ok(Math.abs(estimate.slope) > .05); assert.ok(estimate.confidence > .5);
  const before = rgba.filter((_, i) => i % 4 === 3 && rgba[i] > 0).length;
  const after = sheared.rgba.filter((_, i) => i % 4 === 3 && sheared.rgba[i] > 0).length;
  assert.equal(after, before); assert.ok(sheared.width >= 48);
});

test('component masks isolate disconnected italic-like glyph ink and do not include neighbors', () => {
  const mask = new Uint8Array(12 * 12);
  for (let y = 1; y < 5; y++) mask[y * 12 + (y + 1)] = 1;
  for (let y = 7; y < 11; y++) mask[y * 12 + (11 - y)] = 1;
  const { labels, boxes } = api.componentLabels(mask, 12, 12);
  assert.equal(boxes.length, 2);
  for (let p = 0; p < mask.length; p++) if (mask[p]) assert.ok(labels[p] === 1 || labels[p] === 2);
  assert.notEqual(labels[1 * 12 + 2], labels[7 * 12 + 4]);
});

test('mask ownership isolates italic glyphs even when their bounding boxes overlap horizontally', () => {
  const width = 16, height = 9, data = new Uint8ClampedArray(width * height * 4), mask = new Uint8Array(width * height);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 10; x++) { const p = y * width + x; mask[p] = 1; data.set([220,225,245,255], p * 4); }
  for (let y = 5; y < 8; y++) for (let x = 6; x < 15; x++) { const p = y * width + x; mask[p] = 1; data.set([220,225,245,255], p * 4); }
  const fixture = { width, height, data };
  const fakeReader = { foreground: () => mask, segment: () => ({ reason: null, bounds: [
    { x:1,y:1,width:9,height:3 }, { x:6,y:5,width:9,height:3 }
  ], glyphs: [], warnings: [] }) };
  const extracted = api.extractGlyphs(fixture, 'trophy', 2, fakeReader);
  assert.equal(extracted.glyphs.length, 2); assert.ok(extracted.warnings.includes('overlapping-bounds:0:1'));
  for (const glyph of extracted.glyphs) assert.equal(Array.from(glyph.native.mask).filter(Boolean).length, 27, 'each mask owns only its connected pixels');
});

test('shared-localizer groups drive extraction independently of OCR text length', () => {
  const width = 24, height = 12, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y < 10; y++) for (const [left, right] of [[2, 8], [9, 15], [16, 20], [21, 23]])
    for (let x = left; x < right; x++) data.set([220, 225, 245, 255], (y * width + x) * 4);
  const image = { width, height, data }, groups = [
    { x: 2, y: 2, width: 8, height: 8 }, { x: 7, y: 2, width: 8, height: 8 },
    { x: 14, y: 2, width: 6, height: 8 }, { x: 19, y: 2, width: 4, height: 8 }
  ];
  let segmentationCalls = 0;
  const readerWithoutSegmenter = { foreground: (pixels, category) => reader.foreground(pixels, category), segment() { segmentationCalls++; throw new Error('must not segment from OCR count'); } };
  const extraction = api.extractGlyphsFromBounds(image, 'trophy', groups, readerWithoutSegmenter);
  assert.equal(extraction.glyphs.length, 4, 'four localizer groups remain four despite a five-character OCR overread');
  assert.equal(segmentationCalls, 0);
  assert.ok(extraction.warnings.includes('overlapping-bounds:0:1'));
  assert.ok(extraction.glyphs.every(glyph => glyph.native?.mask.some(Boolean)));
  assert.equal(extraction.assignedComponentCount, 4);
  assert.equal(extraction.unassignedPixelCount, 0);
  const ownership = new Uint8Array(width * height);
  for (const glyph of extraction.glyphs) for (let y = 0; y < glyph.native.height; y++) for (let x = 0; x < glyph.native.width; x++) {
    if (glyph.native.mask[y * glyph.native.width + x]) ownership[(glyph.pixelBounds.y + y) * width + glyph.pixelBounds.x + x]++;
  }
  const sourceMask = reader.foreground(image, 'trophy');
  for (let pixel = 0; pixel < sourceMask.length; pixel++) assert.equal(ownership[pixel], sourceMask[pixel], 'each source-ink pixel is conserved exactly once');
});

test('overlapping italic boxes keep each whole component even when a pixel is nearer the neighboring glyph center', () => {
  const width = 22, height = 10, data = new Uint8ClampedArray(width * height * 4), mask = new Uint8Array(width * height);
  const paint = (x, y) => { mask[y * width + x] = 1; data.set([220, 225, 245, 255], (y * width + x) * 4); };
  for (let y = 1; y <= 7; y++) for (let x = y + 2; x <= y + 5; x++) paint(x, y); // italic component A, bbox x=3..12
  for (let y = 1; y <= 7; y++) paint(17, y); // separate component B; one-pixel gap from A
  const groups = [{ x: 3, y: 1, width: 10, height: 7, area: 28 }, { x: 8, y: 1, width: 10, height: 7, area: 7 }];
  const image = { width, height, data }, extraction = api.extractGlyphsFromBounds(image, 'trophy', groups, { foreground: () => mask });
  assert.deepEqual(extraction.glyphs.map(glyph => glyph.integrity.componentCount), [1, 1]);
  const disputedPixel = 7 * width + 12;
  const left = extraction.glyphs[0], right = extraction.glyphs[1];
  assert.ok(Math.abs(12.5 - 13) < Math.abs(12.5 - 8), 'the test pixel is closer to the right group center');
  assert.equal(left.native.mask[(7 - left.pixelBounds.y) * left.native.width + 12 - left.pixelBounds.x], 255);
  assert.equal(right.pixelBounds.x <= 12 && 12 < right.pixelBounds.x + right.pixelBounds.width ? right.native.mask[(7 - right.pixelBounds.y) * right.native.width + 12 - right.pixelBounds.x] : 0, 0);
  assert.equal(extraction.unassignedPixelCount, 0);
  assert.equal(mask[disputedPixel], 1);
  const ownership = new Uint8Array(mask.length);
  for (const glyph of extraction.glyphs) for (let y = 0; y < glyph.native.height; y++) for (let x = 0; x < glyph.native.width; x++) {
    if (glyph.native.mask[y * glyph.native.width + x]) ownership[(glyph.pixelBounds.y + y) * width + glyph.pixelBounds.x + x]++;
  }
  for (let pixel = 0; pixel < mask.length; pixel++) assert.equal(ownership[pixel], mask[pixel], 'italic source pixels are neither lost, duplicated, nor transferred');
});

test('ambiguous component ownership is withheld and cannot be validated', () => {
  const width = 10, height = 10, data = new Uint8ClampedArray(width * height * 4), mask = new Uint8Array(width * height);
  for (let y = 2; y < 8; y++) { mask[y * width + 4] = 1; data.set([220,225,245,255], (y * width + 4) * 4); }
  const group = { x: 4, y: 2, width: 1, height: 6, area: 6 };
  const extraction = api.extractGlyphsFromBounds({ width, height, data }, 'trophy', [group, group], { foreground: () => mask });
  assert.equal(extraction.unassignedPixelCount, 6);
  assert.ok(extraction.glyphs.every(glyph => glyph.integrity.status === 'ambiguous' && !glyph.native));
  assert.ok(extraction.warnings.includes('ambiguous-components-withheld-from-glyph-masks'));
  const selection = api.validateGlyphSelection(extraction.glyphs, ['4','4'], [], '44');
  assert.equal(selection.valid, false);
});

test('new shared-localizer masks retain cavities and produce derived forms from that exact mask', () => {
  const image = makeDigits('8', 3, 2), mask = reader.foreground(image, 'trophy'), component = api.componentLabels(mask, image.width, image.height).boxes[0];
  const extraction = api.extractGlyphsFromBounds(image, 'trophy', [{ ...component }], reader), glyph = extraction.glyphs[0];
  assert.equal(glyph.area, component.area);
  assert.equal(Array.from(glyph.native.mask).filter(Boolean).length, component.area);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const inNative = x >= glyph.pixelBounds.x && x < glyph.pixelBounds.x + glyph.native.width && y >= glyph.pixelBounds.y && y < glyph.pixelBounds.y + glyph.native.height
      ? glyph.native.mask[(y - glyph.pixelBounds.y) * glyph.native.width + x - glyph.pixelBounds.x] ? 1 : 0 : 0;
    assert.equal(inNative, mask[y * image.width + x], 'native mask exactly retains source contours and cavities');
  }
  const holeX = 5, holeY = 5;
  assert.equal(mask[(holeY + 5) * image.width + holeX + 5], 0, 'the 8 fixture retains its center cavity');
  assert.ok(glyph.normalized.rgba.some((value, index) => index % 4 === 3 && value === 0));
  const sourceInk = Array.from(glyph.normalized.rgba).filter((value, index) => index % 4 === 3 && value !== 0).length;
  const shearedInk = Array.from(glyph.sheared.rgba).filter((value, index) => index % 4 === 3 && value !== 0).length;
  assert.equal(shearedInk, sourceInk, 'the sheared representation retains all normalized ink');
});

test('partial validation preserves full confirmed value and original positions after excluding one group', () => {
  const glyphs = Array.from({ length: 6 }, (_, index) => ({ index, native: { width: 1, height: 1, rgba: new Uint8Array(4), mask: new Uint8Array([255]) } }));
  const selection = api.validateGlyphSelection(glyphs, [...'192659'], [2], '192659');
  assert.equal(selection.valid, true);
  assert.equal(selection.confirmedValue, '192659');
  assert.deepEqual(selection.selected.map(item => item.index), [0, 1, 3, 4, 5]);
  assert.deepEqual(selection.selected.map(item => item.digit), ['1', '9', '6', '5', '9']);
});

test('one identified physical glyph can be validated without a complete field value', () => {
  const glyph = { index: 0, native: { width: 1, height: 1, rgba: new Uint8Array(4), mask: new Uint8Array([255]) } };
  const selection = api.validateGlyphSelection([glyph], ['7'], [], '');
  assert.equal(selection.valid, true);
  assert.equal(selection.confirmedValue, '');
  assert.equal(selection.selected[0].index, 0);
});

test('one identified glyph can be saved while other physical groups remain pending', () => {
  const glyphs = Array.from({ length: 4 }, () => ({ native: { width: 1, height: 1, rgba: new Uint8Array(4), mask: new Uint8Array([255]) } }));
  const selection = api.validateGlyphSelection(glyphs, ['', '9', '', ''], [], '');
  assert.equal(selection.valid, true);
  assert.deepEqual(selection.selected.map(item => item.index), [1]);
  assert.deepEqual(selection.pendingIndices, [0, 2, 3]);
});

test('references retain capture provenance, native mask, normalized and redressed forms; synthetic data is rejected', async () => {
  const glyph = api.extractGlyphs(makeDigits('2'), 'trophy', 1, reader).glyphs[0];
  const reference = await api.createReference(glyph, '2', { captureId: 'capture-sha', captureHash: 'capture-sha', fileName: 'war.png', field: 'opponentTrophies', fieldType: 'trophy', side: 'opponent', captureWidth: 2266, captureHeight: 1488, position: 0 }, null);
  assert.equal(reference.source.captureId, 'capture-sha'); assert.equal(reference.source.fieldType, 'trophy');
  assert.equal(reference.native.width, glyph.native.width); assert.ok(reference.native.mask); assert.ok(reference.sheared.estimate.reason || reference.sheared.estimate.method);
  assert.equal(Buffer.from(reference.native.mask, 'base64').length, glyph.native.mask.length, 'JSON reference includes the individual native mask');
  await assert.rejects(() => api.createReference(glyph, '2', { ...reference.source, synthetic: true }, null), /synthétiques/);
  await assert.rejects(() => api.createReference(glyph, 'x', reference.source, null), /chiffre/);
});

test('JSON export/import validate schema and merge exact duplicates without collapsing independent captures', async () => {
  const glyph = api.extractGlyphs(makeDigits('2'), 'trophy', 1, reader).glyphs[0];
  const provenance = { captureId: 'capture-a', captureHash: 'sha-a', confirmedValue: '2', fileName: 'a.png', field: 'localTrophies', fieldType: 'trophy', side: 'losp', captureWidth: 100, captureHeight: 80, position: 0 };
  const first = await api.createReference(glyph, '2', provenance, null);
  const sameSource = { ...first, id: 'copy' };
  const otherCapture = await api.createReference(glyph, '2', { ...provenance, captureId: 'capture-b', captureHash: 'sha-b', fileName: 'b.png' }, null);
  const roundTrip = api.parseLibrary(api.exportLibrary([first]));
  assert.equal(roundTrip.references[0].source.captureId, 'capture-a');
  const merged = api.mergeLibraries(roundTrip, { ...api.emptyLibrary(), references: [sameSource, otherCapture] });
  assert.equal(merged.references.length, 2, 'same provenance duplicate is removed; another capture remains for leave-one-capture-out');
  assert.equal(api.summarize(merged.references).distinctCaptures, 2);
  assert.throws(() => api.parseLibrary('{"schema":"old","references":[]}'), /Format/);
  assert.throws(() => api.validateLibrary({ ...api.emptyLibrary(), references: [{ ...first, metadata: { ...first.metadata, synthetic: true } }] }), /incomplète/);
});

test('schema v1 accepts individual references without a full field value and remains import compatible', async () => {
  const glyph = api.extractGlyphs(makeDigits('2'), 'trophy', 1, reader).glyphs[0];
  const reference = await api.createReference(glyph, '2', { captureId: 'capture-single', captureHash: 'sha-single', confirmedValue: '', fileName: 'single.png', field: 'localTrophies', fieldType: 'trophy', side: 'losp', captureWidth: 80, captureHeight: 60, position: 3 }, null);
  const oldShape = { ...reference, source: { ...reference.source } };
  for (const key of ['locatorVersion', 'locatorMethod', 'localizationStatus', 'localizationWarnings', 'segmentation', 'glyphBounds']) delete oldShape.source[key];
  const roundTrip = api.parseLibrary(api.exportLibrary([oldShape]));
  assert.equal(roundTrip.schemaVersion, 1);
  assert.equal(roundTrip.references[0].source.confirmedValue, '');
  assert.equal(roundTrip.references[0].source.position, 3);
});

test('IndexedDB store abstraction persists list, delete, and clear across instances', async () => {
  const rows = new Map();
  const db = { objectStoreNames: { contains: () => true }, close() {}, transaction() {
    const tx = { objectStore() { return {
      put(value) { rows.set(value.id, value); queueMicrotask(() => tx.oncomplete?.()); return {} },
      delete(id) { rows.delete(id); queueMicrotask(() => tx.oncomplete?.()); return {} },
      clear() { rows.clear(); queueMicrotask(() => tx.oncomplete?.()); return {} },
      getAll() { const request = {}; queueMicrotask(() => { request.result = [...rows.values()]; request.onsuccess?.(); }); return request }
    }; } }; return tx;
  } };
  const idb = { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess?.()); return request; } };
  const store = await api.createStore(idb), ref = { id: 'persisted-ref' };
  await store.put(ref); assert.deepEqual(await store.list(), [ref]);
  const reopened = await api.createStore(idb); assert.deepEqual(await reopened.list(), [ref]);
  await reopened.delete(ref.id); assert.deepEqual(await store.list(), []);
  await store.put(ref); await store.clear(); assert.deepEqual(await store.list(), []);
});

test('static page exposes a single repliable library section without changing production engines', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../../docs/war-results-vision.html', import.meta.url), 'utf8');
  const library = await readFile(new URL('../../../docs/war-results-numeric-library.js', import.meta.url), 'utf8');
  assert.match(html, /<details id="numericGlyphLibrary"/); assert.match(html, /Bibliothèque numérique MSF/);
  assert.match(html, /war-results-numeric-library\.js\?v=2\.0\.1-component-ownership/);
  assert.match(html, /war-results-numeric-library\.css\?v=2\.1\.0-template-matching/);
  assert.match(html, /war-results-template-matching\.js\?v=1\.0\.0/);
  assert.match(html, /war-results-template-matching-ui\.js\?v=1\.0\.0/);
  assert.match(html, /numericLibraryOcrButton/);
  for (const field of ["localScore", "opponentScore", "localTrophies", "opponentTrophies"]) assert.match(html, new RegExp(`value="${field}"`));
  assert.match(library, /WarResultsVisionEngine\.locateNumericFields\(entry\.file, \[field\]\)/);
  assert.match(library, /extractGlyphsFromBounds\(imageData/);
  assert.match(library, /WarResultsVisionEngine\.analyzeField\(current\.entry\.file, current\.field, current\.rect\)/);
  assert.doesNotMatch(library, /numericLibraryScoreLocator/);
  assert.doesNotMatch(library, /extractGlyphs\(current\.imageData/);
  assert.match(library, /position: index, segmentIndex: index/);
  assert.match(library, /captureSelect\.addEventListener\("change", \(\) => \{ saveCurrentDraft\(\); updateCaptureOptions\(\); prepare\(\); \}\)/);
  assert.match(library, /<figcaption>Natif<\/figcaption>/);
  assert.match(library, /pendingIndices/);
  assert.equal((html.match(/id="numericGlyphLibrary"/g) || []).length, 1);
});
