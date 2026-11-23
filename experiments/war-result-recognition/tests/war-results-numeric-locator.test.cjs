const assert = require("node:assert/strict");
require("../../../docs/war-results-numeric-locator-experiment.js");
const locator = globalThis.WarResultsNumericLocatorExperiment;

const DIGITS = {
  0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"], 3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"], 7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"], 9: ["111", "101", "111", "001", "111"]
};

function fixture(width = 1400, height = 1900, options = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, color, w = 2, h = 2) => {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const at = (py * width + px) * 4;
      data[at] = color[0]; data[at + 1] = color[1]; data[at + 2] = color[2]; data[at + 3] = 255;
    }
  };
  const write = (value, x, y, color) => {
    for (const digit of String(value)) {
      for (let row = 0; row < DIGITS[digit].length; row++) for (let col = 0; col < 3; col++) {
        if (DIGITS[digit][row][col] === "1") paint(x + col * 2, y + row * 3, color, 2, 3);
      }
      x += 11;
    }
  };
  const leftX = options.leftX ?? Math.round(width * .16), rightX = options.rightX ?? Math.round(width * .68);
  const trophyY = options.trophyY ?? Math.round(height * .28), scoreY = options.scoreY ?? Math.round(height * .69);
  const trophyInk = [170, 170, 230];
  const paintCup = (x, y) => {
    paint(x + 1, y, trophyInk, 16, 18);
  };
  if (options.trophyIcons) { paintCup(leftX - 20, trophyY); paintCup(rightX - 20, trophyY); }
  write("3014", leftX, trophyY, trophyInk);
  if (!options.missingOpponentTrophy) write("2789", rightX, trophyY, trophyInk);
  if (options.distractor) write("7227", leftX + 90, trophyY, trophyInk);
  write("411597", leftX, scoreY, [230, 200, 120]);
  write("257149", rightX, scoreY, [230, 200, 120]);
  return { width, height, data, expected: { leftX, rightX, trophyY, scoreY } };
}

function contains(rect, x, y) { return rect && x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height; }

for (const [name, width, height, trophyY, scoreY] of [
  ["portrait with letterbox margins", 1400, 1900, 760, 1470],
  ["wide cropped panel", 1800, 1100, 280, 720],
  ["tall screenshot with large top margin", 1000, 2400, 980, 1770],
  ["off-center panel whose two sides remain left of image midpoint", 1400, 1900, 760, 1470, 0]
]) {
  const image = fixture(width, height, { trophyY, scoreY, ...(name.startsWith("off-center") ? { leftX: 70, rightX: 520 } : {}) });
  const result = locator.locate(image);
  for (const field of ["localScore", "opponentScore", "localTrophies", "opponentTrophies"]) {
    assert.ok(result.fields[field], `${name}: ${field} is detected`);
    assert.equal(result.anchors[field].length, field.endsWith("Score") ? 6 : 4, `${name}: ${field} exposes each detected glyph as a visual anchor`);
  }
  assert.ok(contains(result.fields.localTrophies, image.expected.leftX + 10, trophyY + 6), `${name}: local trophy crop encloses the glyph group`);
  assert.ok(contains(result.fields.opponentTrophies, image.expected.rightX + 10, trophyY + 6), `${name}: opponent trophy crop encloses the glyph group`);
  assert.ok(contains(result.fields.localScore, image.expected.leftX + 10, scoreY + 6), `${name}: local score crop encloses the glyph group`);
  assert.ok(contains(result.fields.opponentScore, image.expected.rightX + 10, scoreY + 6), `${name}: opponent score crop encloses the glyph group`);
}

const partial = locator.locate(fixture(1400, 1900, { missingOpponentTrophy: true }));
assert.ok(partial.fields.localTrophies, "the intact side remains available when the other trophy field is absent");
assert.equal(partial.fields.opponentTrophies, null, "an absent field is refused rather than fabricated from image proportions");
assert.ok(partial.fields.localScore && partial.fields.opponentScore, "score localization is independent of trophy localization");

const blank = locator.locate({ width: 1200, height: 800, data: new Uint8ClampedArray(1200 * 800 * 4) });
assert.ok(blank.reason.startsWith("not-localized:"), "blank input reports an explicit safe failure");
assert.ok(Object.values(blank.fields).every((rect) => rect === null), "blank input does not return proportional guesses");

const iconEvidence = fixture(1400, 1900, { trophyIcons: true, distractor: true });
const anchored = locator.locate(iconEvidence);
for (const field of ["localTrophies", "opponentTrophies"]) {
  assert.ok(anchored.fields[field], `${field}: icon-adjacent glyph sequence is selected`);
  assert.ok(anchored.candidates[field].some((candidate) => candidate.selected && candidate.iconAnchor), `${field}: selected candidate records its trophy icon evidence`);
}
assert.ok(anchored.fields.localTrophies.x < iconEvidence.expected.leftX + 90, "a competing four-glyph run without a trophy icon does not displace the anchored value");
assert.ok(anchored.candidates.localTrophies.some((candidate) => !candidate.selected), "candidate diagnostics retain alternatives");
console.log("Experimental numeric pixel locator geometry: OK");
