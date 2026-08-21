import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../docs/war-admin-report-calculator.js", import.meta.url),
  "utf8"
);

const context = vm.createContext({ console });
vm.runInContext(source, context, {
  filename: "war-admin-report-calculator.js"
});

const calculator = context.MsfWarReportCalculator;

function calculate(attackPoints, attacks = 14, damage = 1_400_000_000) {
  return JSON.parse(JSON.stringify(
    calculator.calculateReport({
      date: "2026-08-21",
      alliance: "zeus",
      captured_at: "2026-08-21T20:00:00.000Z",
      source: "test",
      players: [{
        rank: 1,
        name: "Test",
        attack_points: attackPoints,
        attacks,
        damage,
        defense_wins: 0,
        defense_bonus: 2
      }]
    }).report.players[0]
  ));
}

test("les points non alignés sont arrondis au palier de 200 supérieur pour réussites et ratés uniquement", () => {
  const defelgar = calculate(13_909);
  assert.equal(defelgar.attack_points, 13_909);
  assert.equal(defelgar.successful_attacks, 14);
  assert.equal(defelgar.misses, 0);
  assert.equal(defelgar.damage_attacks, 14);

  const partial = calculate(10_546);
  assert.equal(partial.attack_points, 10_546);
  assert.equal(partial.successful_attacks, 10);
  assert.equal(partial.misses, 4);
  assert.equal(partial.damage_attacks, 11);
});

test("les anciens paliers de 200 conservent exactement leur interprétation historique", () => {
  const historical = calculate(10_400);
  assert.equal(historical.attack_points, 10_400);
  assert.equal(historical.successful_attacks, 10);
  assert.equal(historical.misses, 4);
  assert.equal(historical.damage_attacks, 11);
});

test("les milliers ronds restent inchangés", () => {
  const exact = calculate(12_000);
  assert.equal(exact.attack_points, 12_000);
  assert.equal(exact.successful_attacks, 12);
  assert.equal(exact.misses, 2);
  assert.equal(exact.damage_attacks, 12);
});
