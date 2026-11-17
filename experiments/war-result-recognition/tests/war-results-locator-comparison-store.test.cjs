const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const helperModule = { exports: {} };
const helperSource = fs.readFileSync(path.resolve(__dirname, "../../../docs/war-results-locator-comparison-store.js"), "utf8");
new Function("module", helperSource)(helperModule);
const store = helperModule.exports;

const file = { name: "war-01.png", size: 1234, lastModified: 456 };
const key = store.fileKey(file);
assert.equal(key, "war-01.png\u001f1234\u001f456");
assert.notEqual(key, store.fileKey({ ...file, size: 1235 }), "different files must not reuse a completed result");

const first = { file: file.name, sourceKey: key, metrics: { totalMs: 10 }, fields: [{ current: { value: "1234", preview: "data:image/jpeg;base64,private" }, adaptive: { value: "1234" } }] };
const snapshot = store.snapshot([first], "2026-11-17T10:00:00.000Z");
assert.equal(snapshot.schemaVersion, "1.1.0");
assert.equal(snapshot.records[0].fields[0].current.preview, undefined, "temporary storage excludes crop previews");
assert.match(store.stringify([first]), /local-tesseractjs-trophy-locator-ab/);

const updated = { ...first, metrics: { totalMs: 11 } };
const merged = store.mergeRecords([first], [updated]);
assert.equal(merged.length, 1, "resuming replaces the record for the same source file");
assert.equal(merged[0].metrics.totalMs, 11);
assert.equal(store.mergeRecords(merged, [{ file: "no-key.png" }]).length, 1, "records without a source key cannot block a retry");

console.log("War Results A/B comparison storage tests: OK");
