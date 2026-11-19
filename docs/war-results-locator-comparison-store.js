/* Temporary, browser-local storage helpers for the experimental A/B report. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsLocatorComparisonStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function fileKey(file) {
    return [String(file?.name || ""), Number(file?.size) || 0, Number(file?.lastModified) || 0].join("\u001f");
  }

  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/preview$/i.test(key))
      .map(([key, item]) => [key, clean(item)]));
  }

  function recordKey(record) { return `${record.sourceKey}\u001fmargin:${Number(record.marginPercent ?? 18)}\u001fvariant:${record.variantId || "adaptive"}`; }

  function mergeRecords(records, incoming) {
    const merged = [...(Array.isArray(records) ? records : [])];
    for (const record of Array.isArray(incoming) ? incoming : []) {
      if (!record?.sourceKey) continue;
      const normalized = { ...record, marginPercent: Number(record.marginPercent ?? 18), variantId: record.variantId || "adaptive" };
      const index = merged.findIndex((item) => recordKey(item) === recordKey(normalized));
      if (index < 0) merged.push(clean(normalized));
      else merged[index] = clean(normalized);
    }
    return merged;
  }

  function snapshot(records, updatedAt = new Date().toISOString()) {
    return { schemaVersion: "1.1.0", diagnostic: "local-tesseractjs-trophy-locator-ab", updatedAt, records: clean(records || []) };
  }

  function stringify(records, updatedAt) {
    return JSON.stringify(snapshot(records, updatedAt), null, 2);
  }

  return { fileKey, recordKey, mergeRecords, snapshot, stringify };
});

