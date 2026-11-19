import test from "node:test";
import assert from "node:assert/strict";
await import("../docs/war-results-locator-comparison-store.js");
const store = globalThis.WarResultsLocatorComparisonStore;

test("comparison storage keeps margin and experimental locator variants separate", () => {
  const sourceKey = "synthetic-image\u001f123\u001f1";
  const records = store.mergeRecords([], [
    { sourceKey, marginPercent: 18, variantId: "adaptive", fields: [{ value: "1234" }] },
    { sourceKey, marginPercent: 18, variantId: "adaptive-vertical-recovery", fields: [{ value: "1235" }] },
    { sourceKey, marginPercent: 18, variantId: "adaptive-vertical-recovery-edge-safe", fields: [{ value: "1234" }] },
    { sourceKey, marginPercent: 18, variantId: "adaptive-vertical-recovery-icon-aware", fields: [{ value: "1236" }] },
    { sourceKey, marginPercent: 18, variantId: "adaptive-vertical-recovery-combined", fields: [{ value: "1234" }] },
    { sourceKey, marginPercent: 30, variantId: "adaptive-vertical-recovery", fields: [{ value: "1234" }] }
  ]);
  assert.equal(records.length, 6);
  assert.deepEqual(records.map(store.recordKey), [
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive`,
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive-vertical-recovery`,
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive-vertical-recovery-edge-safe`,
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive-vertical-recovery-icon-aware`,
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive-vertical-recovery-combined`,
    `${sourceKey}\u001fmargin:30\u001fvariant:adaptive-vertical-recovery`
  ]);
});

test("legacy comparisons migrate to the no-recovery variant and remain replaceable", () => {
  const sourceKey = "synthetic-image\u001f123\u001f1";
  const migrated = store.mergeRecords([], [{ sourceKey, marginPercent: 18, fields: [{ value: "1234" }] }]);
  assert.equal(migrated[0].variantId, "adaptive");
  const updated = store.mergeRecords(migrated, [{ sourceKey, marginPercent: 18, fields: [{ value: "1235" }] }]);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].fields[0].value, "1235");
});

test("combined-variant diagnostics survive JSON export and keep images out", () => {
  const sourceKey = "synthetic-combined-image\u001f123\u001f1";
  const record = store.mergeRecords([], [{ sourceKey, marginPercent: 18, variantId: "adaptive-vertical-recovery-combined", fields: [{ adaptive: {
    initialRect: { x: 1, y: 2, width: 30, height: 12 }, finalRect: { x: 3, y: 2, width: 31, height: 15 },
    requestedMarginPercent: 18, appliedMarginPercent: 30, componentsDetected: 5, edgeWarning: true,
    iconRejection: { requested: true, applied: true, excludedComponentCount: 1, reason: "synthetic geometry" },
    verticalRecovery: { method: "proportional-vertical-search", offset: -.375 },
    raw: "2791", value: "2791", confidence: 87, ms: 14,
    preview: "data:image/jpeg;base64,synthetic", sourcePreview: "data:image/jpeg;base64,synthetic"
  } }] }]);
  const exported = JSON.parse(store.stringify(record));
  const adaptive = exported.records[0].fields[0].adaptive;
  assert.equal(exported.records[0].variantId, "adaptive-vertical-recovery-combined");
  assert.equal(adaptive.iconRejection.applied, true);
  assert.equal(adaptive.appliedMarginPercent, 30);
  assert.equal(adaptive.verticalRecovery.method, "proportional-vertical-search");
  assert.equal(adaptive.raw, "2791");
  assert.equal(adaptive.preview, undefined);
  assert.equal(adaptive.sourcePreview, undefined);
});

test("laboratory records persist independently by engine, field, variant and margin", () => {
  const sourceKey = "private-local-image\u001f123\u001f1";
  const oldAb = [{ sourceKey, marginPercent: 18, variantId: "adaptive", fields: [{ value: "1234" }] }];
  const records = store.mergeLaboratoryRecords([], [
    { sourceKey, engine: "numeric", field: "localScore", variantId: "score-proportional", marginPercent: 0, diagnostic: { value: "123456", preview: "data:image/jpeg;base64,private" } },
    { sourceKey, engine: "numeric", field: "localTrophies", variantId: "vertical-recovery", marginPercent: 18, diagnostic: { value: "1234" } }
  ]);
  assert.equal(records.length, 2);
  assert.notEqual(store.laboratoryRecordKey(records[0]), store.laboratoryRecordKey(records[1]));
  const replaced = store.mergeLaboratoryRecords(records, [{ ...records[1], diagnostic: { value: "2345" } }]);
  assert.equal(replaced.length, 2);
  const exported = JSON.parse(JSON.stringify(store.laboratorySnapshot(replaced)));
  assert.equal(exported.diagnostic, "local-war-results-recognition-laboratory");
  assert.equal(exported.records[0].diagnostic.preview, undefined);
  assert.deepEqual(oldAb[0].fields, [{ value: "1234" }], "existing A/B payload remains separate and unchanged");
});
