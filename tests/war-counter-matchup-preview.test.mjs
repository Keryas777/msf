import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamLabels,
  canonicalTeamKey,
  ceilRatioToHundredth,
  findMatchingCounters,
  resolveTeamFromDefinitions,
  summarizeCounterComparison
} from "../docs/war-counter-matchup-preview.js";

const teams = [
  {
    team: "4F (MCU)",
    mode: "Arène",
    characters: ["InvisibleWomanMCU", "MrFantasticMCU", "FranklinRichards", "Thing", "HumanTorch"]
  },
  {
    team: "4F (MCU)",
    mode: "Guerre",
    characters: ["InvisibleWomanMCU", "MrFantasticMCU", "FranklinRichards", "Thing", "HumanTorch"]
  },
  {
    team: "Eternels Intemporels",
    mode: "Guerre",
    characters: ["Gilgamesh", "Kingo", "Thena", "Ikaris", "Sersi"]
  }
];

test("ratio Vision est toujours arrondi au centième supérieur", () => {
  assert.equal(ceilRatioToHundredth(0.640418), 0.65);
  assert.equal(ceilRatioToHundredth(1.062361), 1.07);
  assert.equal(ceilRatioToHundredth(0.65), 0.65);
  assert.equal(ceilRatioToHundredth(0.6500000000000001), 0.65);
  assert.equal(ceilRatioToHundredth(0.650000001), 0.66);
});

test("composition canonique ignore ordre, doublons et cases vides", () => {
  assert.equal(
    canonicalTeamKey(["B", "", "A", "B", null, "C"]),
    "A|B|C"
  );
});

test("équipe complète utilise le nom teams.json suivi de classique", () => {
  const labels = buildTeamLabels(
    ["FranklinRichards", "HumanTorch", "Thing", "MrFantasticMCU", "InvisibleWomanMCU"],
    teams
  );
  assert.equal(labels.status, "resolved");
  assert.equal(labels.exact, true);
  assert.equal(labels.family, "4F (MCU)");
  assert.equal(labels.variant, '4F (MCU) "classique"');
  assert.equal(labels.candidates[0].mode, "Guerre");
});

test("équipe partielle à au moins 3 membres ajoute seulement les personnages extérieurs", () => {
  const labels = buildTeamLabels(
    ["InvisibleWomanMCU", "MrFantasticMCU", "FranklinRichards", "Xavier", "Quasar"],
    teams,
    (id) => ({ Xavier: "Professeur X", Quasar: "Quasar" }[id] || id)
  );
  assert.equal(labels.status, "resolved");
  assert.equal(labels.exact, false);
  assert.equal(labels.family, "4F (MCU)");
  assert.deepEqual(labels.extraIds, ["Xavier", "Quasar"]);
  assert.equal(labels.variant, "4F (MCU) + Professeur X + Quasar");
});

test("moins de 3 membres d'une équipe ne permet pas d'inventer un nom", () => {
  const resolved = resolveTeamFromDefinitions(
    ["InvisibleWomanMCU", "MrFantasticMCU", "Xavier", "Quasar", "Knull"],
    teams
  );
  assert.equal(resolved.status, "unresolved");
});

test("matching des contres ignore l'ordre des personnages", () => {
  const rows = [{
    def_char1: "D2", def_char2: "D1", def_char3: "D3",
    atk_char1: "A3", atk_char2: "A1", atk_char3: "A2",
    min_ratio_hard: "0.8"
  }];
  const matches = findMatchingCounters(rows, ["A1", "A2", "A3"], ["D1", "D2", "D3"]);
  assert.equal(matches.length, 1);
});

test("plusieurs classifications avec le même ratio restent un seul matchup cohérent", () => {
  const matches = [
    { index: 39, row: { def_family: "Annihilateurs", atk_family: "Justiciers", min_ratio_hard: "1.19" } },
    { index: 121, row: { def_family: "Force Phénix", atk_family: "Justiciers", min_ratio_hard: "1.19" } }
  ];
  const comparison = summarizeCounterComparison(matches, 1.181);
  assert.equal(comparison.status, "improves");
  assert.equal(comparison.ratio, 1.19);
  assert.equal(comparison.existingRatio, 1.19);
  assert.equal(comparison.matches.length, 2);
});

test("ratios divergents pour les mêmes compositions sont bloqués comme conflit", () => {
  const matches = [
    { index: 1, row: { min_ratio_hard: "0.8" } },
    { index: 2, row: { min_ratio_hard: "1.11" } }
  ];
  assert.equal(summarizeCounterComparison(matches, 0.7).status, "conflict");
});

test("comparaison distingue nouveau, amélioration, identique et moins bon", () => {
  assert.equal(summarizeCounterComparison([], 0.641).status, "new");

  const matches = [{ index: 0, row: { min_ratio_hard: "0.75" } }];
  assert.equal(summarizeCounterComparison(matches, 0.641).status, "improves");
  assert.equal(summarizeCounterComparison(matches, 0.75).status, "same");
  assert.equal(summarizeCounterComparison(matches, 0.751).status, "worse");
});
