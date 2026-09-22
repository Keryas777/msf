import test from "node:test";
import assert from "node:assert/strict";

import {
  findExactDefenseMatches,
  normalizeDefenseVariants
} from "../docs/war-counters-vision-core.js";

const rows = [
  {
    def_family: "Conclave de l'Ombre",
    def_variant: "Classique",
    def_char1: "Executioner",
    def_char2: "Thanos",
    def_char3: "Sylvie",
    def_char4: "HighEvolutionary",
    def_char5: "Malekith"
  },
  {
    def_family: "Conclave de l'Ombre",
    def_variant: "Classique",
    def_char1: "Executioner",
    def_char2: "Thanos",
    def_char3: "Sylvie",
    def_char4: "HighEvolutionary",
    def_char5: "Malekith"
  },
  {
    def_family: "Autre",
    def_variant: "Variante",
    def_char1: "A",
    def_char2: "B",
    def_char3: "C",
    def_char4: "D",
    def_char5: "E"
  }
];

test("normalizeDefenseVariants deduplicates repeated counter rows", () => {
  const defenses = normalizeDefenseVariants(rows);
  assert.equal(defenses.length, 2);
  assert.deepEqual(defenses[0].characters, ["Executioner", "Thanos", "Sylvie", "HighEvolutionary", "Malekith"]);
});

test("findExactDefenseMatches is order-independent", () => {
  const defenses = normalizeDefenseVariants(rows);
  const matches = findExactDefenseMatches(defenses, ["Malekith", "Sylvie", "Executioner", "HighEvolutionary", "Thanos"]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].variant, "Classique");
});

test("findExactDefenseMatches never promotes a partial team", () => {
  const defenses = normalizeDefenseVariants(rows);
  const matches = findExactDefenseMatches(defenses, ["Executioner", "Thanos", "Sylvie", "HighEvolutionary"]);
  assert.deepEqual(matches, []);
});
