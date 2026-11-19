import test from "node:test";
import assert from "node:assert/strict";
import store from "../docs/war-results-locator-comparison-store.js";

test("comparison storage keeps margin and vertical-recovery variants separate", () => {
  const sourceKey = "synthetic-image\u001f123\u001f1";
  const records = store.mergeRecords([], [
    { sourceKey, marginPercent: 18, variantId: "adaptive", fields: [{ value: "1234" }] },
    { sourceKey, marginPercent: 18, variantId: "adaptive-vertical-recovery", fields: [{ value: "1235" }] },
    { sourceKey, marginPercent: 30, variantId: "adaptive-vertical-recovery", fields: [{ value: "1234" }] }
  ]);
  assert.equal(records.length, 3);
  assert.deepEqual(records.map(store.recordKey), [
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive`,
    `${sourceKey}\u001fmargin:18\u001fvariant:adaptive-vertical-recovery`,
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
