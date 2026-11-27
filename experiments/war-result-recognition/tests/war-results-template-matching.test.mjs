import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
await import('../../../docs/war-results-template-matching.js');
await import('../../../docs/war-results-numeric-library.js');
const tm = globalThis.WarResultsTemplateMatching;
function rgba(mask, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i++) { const p = i * 4; out[p] = out[p + 1] = out[p + 2] = mask[i] ? 0 : 255; out[p + 3] = 255; }
  return out;
}
function ref(digit, captureId, mask, width, height, fieldType = 'score') {
  return { id: `${captureId}-${digit}`, digit: String(digit), native: { width, height, rgba: rgba(mask, width, height), mask: Uint8Array.from(mask) },
    normalized: { width, height, rgba: rgba(mask, width, height) }, sheared: { width, height, rgba: rgba(mask, width, height) },
    source: { captureId, fieldType, field: fieldType === 'score' ? 'localScore' : 'localTrophies', side: 'losp', position: 0 } };
}
const pattern = (kind, size = 12) => { const m = new Uint8Array(size * size); for (let y = 2; y < size - 2; y++) for (let x = 2; x < size - 2; x++) {
  const on = kind === 0 ? x === 2 || x === size - 3 || y === 2 || y === size - 3 : kind === 1 ? x === size - 3 || y === 2 || (y > size / 2 && x > 2) : x === 2 || y === 2 || y === size / 2 || y === size - 3;
  if (on) m[y * size + x] = 1;
} return m; };
test('permanent source corpus has the declared coverage and lossless representations', async () => {
  const lib = JSON.parse(await readFile(new URL('../../../docs/data/numeric-references/library-v1.json', import.meta.url)));
  const manifest = JSON.parse(await readFile(new URL('../../../docs/data/numeric-references/manifest.json', import.meta.url)));
  const raw = await readFile(new URL('../../../docs/data/numeric-references/library-v1.json', import.meta.url));
  assert.equal(manifest.sizeBytes, raw.length);
  assert.equal(manifest.sha256, createHash('sha256').update(raw).digest('hex'));
  const valid = globalThis.WarResultsNumericLibrary.validateLibrary(lib);
  assert.equal(valid.references.length, 88);
  assert.equal(valid.references.filter(r => r.source.fieldType === 'score').length, 48);
  assert.equal(valid.references.filter(r => r.source.fieldType === 'trophy').length, 40);
  assert.equal(new Set(valid.references.map(r => r.source.captureId)).size, 5);
  assert.deepEqual([...new Set(valid.references.map(r => r.digit))].sort(), [...'0123456789']);
  assert.ok(valid.references.every(r => r.native.mask && r.native.rgba && r.normalized.rgba && r.sheared.rgba));
});
test('laboratory integration uses selected fields and shared locators without invoking Tesseract', async () => {
  const html = await readFile(new URL('../../../docs/war-results-vision.html', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../../../docs/war-results-template-matching-ui.js', import.meta.url), 'utf8');
  assert.match(html, /id="templateMatchingPanel"/); assert.match(html, /Comparer le Template Matching/);
  assert.match(html, /data-tm-representation="native"/); assert.match(html, /data-tm-corpus="mixed"/);
  assert.match(ui, /input\[data-lab-field\]:checked/); assert.match(ui, /locateNumericFields\(file, \[field\]\)/);
  assert.doesNotMatch(ui, /analyzeField\(|\.analyze\(/);
});
test('matcher recognizes identical masks and provides class ranking and non-probability scores', () => {
  const refs = [...'0123456789'].map((d) => ref(d, `capture-${d}`, pattern(Number(d) === 0 ? 0 : 1), 12, 12));
  const result = tm.rank({ mask: pattern(0), width: 12, height: 12 }, refs, { representation: 'native', shiftTolerance: 1 });
  assert.equal(result.proposedDigit, '0'); assert.ok(result.best.similarity > result.second.similarity);
  assert.match(result.scoreMeaning, /not a probability/); assert.equal(result.classes.length, 10);
});
test('alignment tolerates a one-pixel shift and native dimension differences without stretching', () => {
  const q = pattern(0, 12), r = pattern(1, 16), refs = [ref(0, 'a', q, 12, 12), ref(1, 'b', r, 16, 16)];
  const moved = new Uint8Array(14 * 14); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) moved[(y + 1) * 14 + x + 1] = q[y * 12 + x];
  const fit = tm.fitMask(moved, 14, 14); assert.equal(fit.width, 48); assert.equal(fit.height, 48);
  const scores = tm.rank({ mask: moved, width: 14, height: 14 }, refs, { representation: 'native', shiftTolerance: 2 });
  assert.equal(scores.classes[0].digit, '0');
});
test('normalized and sheared masks are letterboxed into equal comparison dimensions', () => {
  const refs = tm.prepareReferences([ref(0, 'a', pattern(0, 12), 12, 12), ref(1, 'b', pattern(1, 16), 16, 16)]);
  assert.equal(refs[0].matcherMasks.normalized.mask.length, 48 * 48);
  assert.equal(refs[1].matcherMasks.sheared.mask.length, 48 * 48);
  const result = tm.rank({ mask: pattern(0), width: 12, height: 12 }, refs, { representation: 'normalized', shiftTolerance: 1 });
  assert.equal(result.classes[0].digit, '0');
});
test('leave-one-capture-out removes every reference from the source and reports missing classes', () => {
  const refs = [...'0123456789'].map((d) => ref(d, `capture-${d}`, pattern(Number(d) % 3), 12, 12));
  const result = tm.rank({ mask: pattern(0), width: 12, height: 12 }, refs, { representation: 'native', excludeCaptureIds: ['capture-0'] });
  assert.equal(result.referenceCount, 9); assert.ok(result.missingClasses.includes('0')); assert.equal(result.proposedDigit, null);
  assert.deepEqual(result.excludedCaptureIds, ['capture-0']);
});
test('class scores are capped to three references so larger classes do not gain an unbounded max advantage', () => {
  const refs = [ref(0, 'c1', pattern(0), 12, 12), ref(1, 'c2', pattern(1), 12, 12), ...Array.from({ length: 10 }, (_, i) => ref(1, `c${i+3}`, pattern(1), 12, 12))];
  const result = tm.rank({ mask: pattern(0), width: 12, height: 12 }, refs, { representation: 'native', shiftTolerance: 0 });
  assert.equal(result.classes.find(x => x.digit === '1').references.length, 3);
  assert.equal(result.classes.find(x => x.digit === '0').references.length, 1);
});
test('similar and unavailable class hypotheses abstain rather than claim certainty', () => {
  const refs = [...'0123456789'].map((d) => ref(d, `c${d}`, pattern(Number(d) < 5 ? 0 : 1), 12, 12));
  const result = tm.rank({ mask: pattern(0), width: 12, height: 12 }, refs, { representation: 'normalized', shiftTolerance: 0, abstentionGap: .2 });
  assert.equal(result.proposedDigit, null); assert.equal(result.ambiguity, 'insufficient-class-separation');
});
test('numeric reconstruction preserves abstentions and diagnostics JSON round-trips', () => {
  assert.equal(tm.reconstructDigits([{ proposedDigit: '2' }, { proposedDigit: null }, { proposedDigit: '0' }]), '2?0');
  const report = { schema: 'msf-template-matching-report', schemaVersion: 1, fields: [{ field: 'localTrophies', configurations: [{ glyphResults: [{ classes: [{ digit: '9', similarity: .9 }], proposedDigit: null, ambiguity: 'insufficient-class-separation' }] }] }] };
  assert.deepEqual(JSON.parse(tm.serializeReport(report)), report);
  assert.throws(() => tm.serializeReport({}), /Rapport/);
});
