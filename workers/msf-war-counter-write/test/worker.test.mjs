import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeExisting,
  buildBatchPlan,
  canonicalTeamKey,
  ceilRatioToHundredth,
  matchingRows,
  matchupKey,
  normalizeBatchItems,
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

test("le lot regroupe les doublons et conserve le meilleur ratio", () => {
  const metadata = {
    def_family: "Def",
    def_variant: "Def classique",
    def_key: "def",
    atk_family: "Atk",
    atk_team: "Atk classique",
    atk_key: "atk",
    notes: ""
  };
  const normalized = normalizeBatchItems([
    {
      attackIds: ["A1", "A2", "A3", "A4", "A5"],
      defenseIds: ["D1", "D2", "D3", "D4", "D5"],
      attackPower: 118,
      defensePower: 100,
      metadata
    },
    {
      attackIds: ["A5", "A4", "A3", "A2", "A1"],
      defenseIds: ["D5", "D4", "D3", "D2", "D1"],
      attackPower: 107,
      defensePower: 100,
      metadata
    }
  ]);

  assert.equal(normalized.inputCount, 2);
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.duplicateCount, 1);
  assert.equal(normalized.items[0].ratio, 1.07);
  assert.deepEqual(normalized.items[0].sourceIndexes, [0, 1]);
  assert.equal(normalized.items[0].key, matchupKey(["A1", "A2", "A3", "A4", "A5"], ["D1", "D2", "D3", "D4", "D5"]));
});

test("le plan batch décide toutes les actions depuis une seule vue du Sheet", () => {
  const values = [
    header,
    ["Def", "Def classique", "def", "D1", "D2", "D3", "D4", "D5", "Atk", "Atk classique", "atk", "A1", "A2", "A3", "A4", "A5", "1.19", "1.34", "1.49", "2.49", "2.99", ""]
  ];
  const rows = rowsAsObjects(values);
  const metadata = {
    def_family: "Def 2",
    def_variant: "Def 2 classique",
    def_key: "def2",
    atk_family: "Atk 2",
    atk_team: "Atk 2 classique",
    atk_key: "atk2",
    notes: ""
  };
  const normalized = normalizeBatchItems([
    {
      attackIds: ["A1", "A2", "A3", "A4", "A5"],
      defenseIds: ["D1", "D2", "D3", "D4", "D5"],
      attackPower: 118,
      defensePower: 100,
      metadata: null
    },
    {
      attackIds: ["B1", "B2", "B3", "B4", "B5"],
      defenseIds: ["E1", "E2", "E3", "E4", "E5"],
      attackPower: 107,
      defensePower: 100,
      metadata
    }
  ]);
  const plan = buildBatchPlan(rows, normalized.items);

  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].previousRatio, 1.19);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].metadata.atk_key, "atk2");
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.conflicts.length, 0);
});
