const assert = require("node:assert/strict");
const loaded = require("../../../docs/war-result-recognition-core.js");
const core = loaded.locateZones ? loaded : globalThis.WarResultRecognition;

const w = (text, x, y, width = 50, height = 20) => ({ text, confidence: 90, bbox: { x0: x, y0: y, x1: x + width, y1: y + height } });
const words = [
  w("LoSP", 180, 75, 70), w("Kronos", 255, 75, 110), w("Opponent", 670, 75, 130),
  w("2778", 210, 130, 65), w("2627", 700, 130, 65),
  w("411597", 170, 245, 110), w("POINTS", 415, 245, 80), w("DE", 500, 245, 25), w("GUERRE", 530, 245, 90), w("257149", 680, 245, 110)
];
const result = core.locateZones(words, 1000, 500);
for (const field of ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "resultBand"]) {
  const rect = result.zones[field];
  assert.ok(rect && rect.width > 0 && rect.height > 0, `${field} has a non-empty crop`);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1000 && rect.y + rect.height <= 500, `${field} stays inside source pixels`);
}
assert.equal(result.anchorsFound.losp, true);
assert.equal(result.anchorsFound.scoreLabel, true);
assert.ok(result.panel && result.panel.width > 0 && result.panel.height > 0, "result panel bounds are exposed for diagnostics");
assert.equal(result.panelMethod, "anchor-union");

const point = core.displayPointToImage(260, 140, { left: 10, top: 20, width: 500, height: 250 }, 1000, 500);
assert.deepEqual(point, { x: 500, y: 240 });
assert.deepEqual(core.adjustZoneRect({ x: 100, y: 80, width: 60, height: 30 }, 20, -10, "move", 500, 300), { x: 120, y: 70, width: 60, height: 30 });
assert.deepEqual(core.adjustZoneRect({ x: 100, y: 80, width: 60, height: 30 }, 25, 12, "resize", 500, 300), { x: 100, y: 80, width: 85, height: 42 });
assert.deepEqual(core.adjustZoneRect({ x: 460, y: 280, width: 60, height: 30 }, 50, 50, "move", 500, 300), { x: 440, y: 270, width: 60, height: 30 });

const fallback = core.locateZones([], 1800, 800);
assert.equal(fallback.zones.geometryConfidence, "fallback");
assert.equal(fallback.panelMethod, "proportional-fallback");
for (const key of ["localAlliance", "opponentAlliance", "localScore", "opponentScore", "localTrophies", "opponentTrophies", "resultBand"]) assert.ok(fallback.zones[key]?.width > 0, `fallback ${key}`);
console.log("War Results Vision field zones and touch geometry: OK");
