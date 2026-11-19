const assert = require("node:assert/strict");
require("../../../docs/war-results-identity-engine.js");
const identity = globalThis.WarResultsIdentityEngine;

function image(width, height, fill = [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}
function rect(pixels, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels.data.set(color, (y * pixels.width + x) * 4);
}
const word = (text, x0, x1, confidence = 90) => ({ text, confidence, bbox: { x0, x1, y0: 3, y1: 17 } });

const mono = image(60, 22);
rect(mono, 2, 4, 57, 18, [245, 245, 250, 255]);
const monoRead = identity.colorSegments("Kronos", mono, [word("Kronos", 2, 57)]);
assert.equal(monoRead.segments.map((item) => item.text).join(""), "Kronos", "a monochrome name retains its exact recognized text");
assert.match(monoRead.segments[0].color, /^#[0-9a-f]{6}$/i, "monochrome names receive a valid richName color");
assert.ok(monoRead.colorCoverage > 0.5);

const multicolor = image(80, 22);
rect(multicolor, 2, 4, 37, 18, [247, 247, 250, 255]);
rect(multicolor, 42, 4, 78, 18, [120, 75, 245, 255]);
const multicolorRead = identity.colorSegments("LoSP Dionysos", multicolor, [word("LoSP", 2, 37), word("Dionysos", 42, 78)]);
assert.equal(multicolorRead.segments.map((item) => item.text).join(""), "LoSP Dionysos", "spaces and multiple words are preserved");
assert.ok(multicolorRead.segments.some((item) => item.color && item.color !== multicolorRead.segments[0].color), "color changes remain separate across name segments");

const accent = image(60, 22);
rect(accent, 2, 4, 58, 18, [50, 190, 245, 255]);
const accentRead = identity.colorSegments("Étoile", accent, [word("Étoile", 2, 58)]);
assert.equal(accentRead.segments.map((item) => item.text).join(""), "Étoile", "accents are not folded out of the displayed text");
assert.equal(identity.normalizeName("Étoile"), "etoile", "search normalization is separate from display text");

const symbol = image(80, 22);
rect(symbol, 2, 4, 54, 18, [245, 165, 40, 255]);
rect(symbol, 60, 4, 78, 18, [245, 165, 40, 255]);
const symbolRead = identity.colorSegments("Nova ⚔", symbol, [word("Nova", 2, 54), word("⚔", 60, 78)]);
assert.equal(symbolRead.symbols[0]?.text, "⚔", "a recognized Unicode symbol is retained as text and diagnostic data");
assert.equal(symbolRead.segments.map((item) => item.text).join(""), "Nova ⚔");

const special = image(100, 22);
rect(special, 2, 4, 98, 18, [235, 70, 80, 255]);
const specialRead = identity.colorSegments("St@n-Lee’s", special, [word("St@n-Lee’s", 2, 98)]);
assert.equal(specialRead.segments.map((item) => item.text).join(""), "St@n-Lee’s", "punctuation and apostrophes are preserved without a name whitelist");

const outlined = image(60, 22);
rect(outlined, 4, 5, 56, 17, [105, 35, 55, 255]);
rect(outlined, 8, 7, 52, 15, [255, 105, 125, 255]);
const outlinedRead = identity.colorSegments("Shade", outlined, [word("Shade", 4, 56)]);
assert.match(outlinedRead.segments[0].color, /^#[0-9a-f]{6}$/i, "a bright outline and darker shadow still produce a color sample");

const ambiguous = identity.arbitrateReads(
  { data: { text: "C0dεx", confidence: 38 } },
  { data: { text: "Codex", confidence: 72 } },
  "opponent"
);
assert.equal(ambiguous.text, "", "contradictory ambiguous characters are not silently rewritten");
assert.equal(ambiguous.uncertain, true);
assert.deepEqual(ambiguous.alternatives, ["C0dεx", "Codex"]);
const partial = identity.arbitrateReads({ data: { text: "Orion", confidence: 41 } }, null, "opponent");
assert.equal(partial.text, "Orion");
assert.equal(partial.uncertain, true, "low-confidence partial text remains available for correction but marked uncertain");

console.log("War Results Vision identity engine tests: OK");
