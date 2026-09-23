import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeExisting,
  canonicalTeamKey,
  ceilRatioToHundredth,
  matchingRows,
  ratioFromPowers,
  rowsAsObjects
} from "../worker.js";

const header = [
  "def_family", "def_variant", "def_key",
  "def_char1", "def_char2", "def_char3", "def_char4", "def_char5",
  "atk_family", "atk_team", "atk_key",
  "atk_char1", "atk_char2", "atk_char3", "atk_char4", "atk_char5",
  "min_ratio_hard", "min_ratio_ok", "min_ratio_safe", "min_ratio_overkill", "min_ratio_overkill_plus",
  "notes"
];

test("ratio serveur applique le même plafond au centième que Vision", () => {
  assert.equal(ratioFromPowers(13_505_260, 12_702_649), 1.07);
  assert.equal(ceilRatioToHundredth(0.640418), 0.65);
  assert.equal(ceilRatioToHundredth(0.65), 0.65);
});

test("matching serveur ignore l'ordre mais pas le camp", () => {
  const values = [
    header,
    ["Def", "Def classique", "def", "D1", "D2", "D3", "D4", "D5", "Atk", "Atk classique", "atk", "A1", "A2", "A3", "A4", "A5", "0.9", "1.05", "1.2", "2.2", "2.7", ""]
  ];
  const rows = rowsAsObjects(values);
  assert.equal(matchingRows(rows, ["A5", "A2", "A1", "A4", "A3"], ["D3", "D5", "D1", "D4", "D2"]).length, 1);
  assert.equal(matchingRows(rows, ["D1", "D2", "D3", "D4", "D5"], ["A1", "A2", "A3", "A4", "A5"]).length, 0);
  assert.equal(canonicalTeamKey(["B", "A", "", "B"]), "A|B");
});

test("plusieurs classifications au même ratio sont cohérentes et améliorées ensemble", () => {
  const matches = [
    { __sheetRow: 41, min_ratio_hard: "1.19" },
    { __sheetRow: 123, min_ratio_hard: "1.19" }
  ];
  const result = analyzeExisting(matches, 1.18);
  assert.equal(result.status, "improves");
  assert.equal(result.existingRatio, 1.19);
  assert.equal(result.matches.length, 2);
});

test("ratios divergents sur un même matchup bloquent l'écriture", () => {
  const result = analyzeExisting([
    { __sheetRow: 10, min_ratio_hard: "0.8" },
    { __sheetRow: 20, min_ratio_hard: "1.11" }
  ], 0.7);
  assert.equal(result.status, "conflict");
});

test("serveur distingue nouveau, identique et moins bon", () => {
  assert.equal(analyzeExisting([], 0.65).status, "new");
  assert.equal(analyzeExisting([{ min_ratio_hard: "0.65" }], 0.65).status, "same");
  assert.equal(analyzeExisting([{ min_ratio_hard: "0.65" }], 0.66).status, "worse");
});
