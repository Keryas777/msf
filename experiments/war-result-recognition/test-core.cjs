const assert = require("node:assert/strict");
const core = require("../../docs/war-result-recognition-core.js");

const word = (value, x, y, confidence = 94) => ({ text: value, confidence, bbox: { x0: x, y0: y, x1: x + 50, y1: y + 20 } });
const words = [
  word("LoSP", 100, 70), word("Kronos", 180, 70), word("Opponent's", 650, 70), word("Guild", 760, 70),
  word("2500", 200, 115), word("+75", 315, 115), word("2400", 650, 115), word("-75", 750, 115),
  word("123456", 200, 245), word("POINTS", 420, 245), word("DE", 475, 245), word("GUERRE", 510, 245), word("654321", 650, 245)
];
const fields = core.extract(words, 1000, 500, { colorResult: "loss" });
assert.equal(fields.fields.localAlliance.value, "Kronos");
assert.equal(fields.fields.opponentAlliance.value, "Opponent's Guild");
assert.equal(fields.fields.localScore.value, "123456");
assert.equal(fields.fields.opponentScore.value, "654321");
assert.equal(fields.fields.localTrophies.value, "2500");
assert.equal(fields.fields.opponentTrophies.value, "2400");
assert.equal(fields.fields.result.value, "loss");
assert.equal(fields.opponentName.original, "Opponent's Guild");
assert.equal(fields.opponentName.matchKey, "opponent s guild");
assert.equal(fields.needsManualReview, true);

const tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t2\t3\t4\t5\t90\tWORD\n";
assert.equal(core.parseTsv(tsv).length, 1);
assert.equal(core.parseTsv(tsv.slice(tsv.indexOf("5\t"))).length, 1, "headerless Tesseract.js TSV is supported");
assert.equal(core.firstDigitGroup("2627751", 4), "2627");
assert.equal(core.firstDigitGroup("561", 4), "", "short trophy reads stay unresolved");
assert.equal(core.firstDigitGroup("2 627", 4), "", "separate numeric groups are not concatenated");
const located = core.locateZones(words, 1000, 500);
assert.equal(located.anchorsFound.losp, true);
assert.equal(located.anchorsFound.opponentName, true);
assert.ok(located.zones.opponentTrophies.width > 0 && located.zones.opponentTrophies.height > 0);
assert.ok(located.zones.localScore.x < located.zones.opponentScore.x);

const invalid = core.validate({ localAlliance: "Kronos", opponentAlliance: "", localScore: "1234", opponentScore: "987654", localTrophies: "2500", opponentTrophies: "2400", result: "win" }, 1000, 500);
assert.equal(invalid.valid, false);
assert.ok(invalid.problems.includes("opponentAlliance:missing_or_uncertain"));
assert.ok(invalid.problems.includes("localScore:invalid"));
assert.ok(invalid.problems.includes("result:score_conflict"));
console.log("field-attribution core tests passed");
