import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../docs/war-admin-validation.js", import.meta.url),
  "utf8"
);
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: "war-admin-validation.js" });

const validation = context.MsfWarDraftValidation;

function player(overrides = {}) {
  return {
    rank: 1,
    name: "Joueur",
    attack_points: 12000,
    attacks: 12,
    damage: 1234567890,
    defense_wins: 2,
    defense_bonus: 1,
    ...overrides
  };
}

function vacant(rank = 24) {
  return player({
    rank,
    name: "",
    attack_points: null,
    attacks: null,
    damage: null,
    defense_wins: null,
    defense_bonus: null
  });
}

function draft(players) {
  return {
    date: "2026-08-02",
    alliance: "zeus",
    captured_at: "2026-08-02T12:00:00.000Z",
    source: "gemini-test",
    players
  };
}

test("les quatre classifications OCR sont strictement distinguées", () => {
  assert.equal(validation.classifyRow(player()).type, "active");
  assert.equal(validation.classifyRow(player({
    name: "Joueur inactif",
    attack_points: 0,
    attacks: 0,
    damage: 0,
    defense_wins: 0,
    defense_bonus: 0
  })).type, "inactive");
  assert.equal(validation.classifyRow(vacant()).type, "vacant");
  assert.equal(validation.classifyRow(player({ damage: null })).type, "invalid");
});

test("les combinaisons incohérentes, valeurs non entières, négatives et hors limites sont invalides", () => {
  const cases = [
    player({ damage: null }),
    vacant(2),
    player({ rank: 2, name: "", attack_points: 0 }),
    player({ rank: 3, attacks: 1.5 }),
    player({ rank: 4, defense_wins: -1 }),
    player({ rank: 5, attack_points: 15001 }),
    player({ rank: 6, attacks: 15 }),
    player({ rank: 7, damage: 30000000001 }),
    player({ rank: 8, defense_wins: 21 }),
    player({ rank: 9, defense_bonus: 11 })
  ];

  cases[1].defense_bonus = 1;
  for (const value of cases) {
    assert.equal(validation.classifyRow(value).type, "invalid", JSON.stringify(value));
  }
});

test("la saisie accepte explicitement 0 sans convertir une chaîne vide en 0", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(validation.parseIntegerInput("damage", "0"))),
    { value: 0, error: "" }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(validation.parseIntegerInput("damage", ""))),
    { value: null, error: "" }
  );
  assert.match(validation.parseIntegerInput("damage", "1.5").error, /entier/);
  assert.match(validation.parseIntegerInput("damage", "-1").error, /entier/);
  assert.match(validation.parseIntegerInput("damage", "30000000001").error, /compris entre/);
});

test("un joueur à zéro est conservé et seule la place vacante est exclue du validatedDraft", () => {
  const players = Array.from({ length: 24 }, (_, index) => player({
    rank: index + 1,
    name: `Joueur ${index + 1}`
  }));
  players[4] = player({
    rank: 5,
    name: "Joueur inactif",
    attack_points: 0,
    attacks: 0,
    damage: 0,
    defense_wins: 0,
    defense_bonus: 0
  });
  players[11] = vacant(12);

  const validated = validation.buildValidatedDraft(draft(players));

  assert.deepEqual(Array.from(Object.keys(validated)), [
    "date",
    "alliance",
    "captured_at",
    "source",
    "players"
  ]);
  assert.deepEqual(Array.from(Object.keys(validated.players[0])), [
    "rank",
    "name",
    "attack_points",
    "attacks",
    "damage",
    "defense_wins",
    "defense_bonus"
  ]);
  assert.equal(validated.players.length, 23);
  assert.equal(validated.players.some(({ name }) => name === "Joueur inactif"), true);
  assert.equal(validated.players.some(({ rank }) => rank === 12), false);
  assert.deepEqual(
    Array.from(validated.players.slice(0, 6), ({ rank }) => rank),
    [1, 2, 3, 4, 5, 6]
  );
  assert.equal(validated.players[4].rank, 5);
  assert.equal("report" in validated, false);
});

test("une ligne invalide bloque la validation et l’ordre source n’est jamais recalculé", () => {
  const players = Array.from({ length: 24 }, (_, index) => player({
    rank: 100 - index,
    name: `Joueur ${index + 1}`
  }));
  players[3] = player({ rank: 97, damage: null });

  const summary = validation.classifyDraft(draft(players));
  assert.equal(summary.counts.invalid, 1);
  assert.equal(summary.canValidate, false);
  assert.throws(() => validation.buildValidatedDraft(draft(players)), /lignes invalides/);

  players[3].damage = 999;
  const validated = validation.buildValidatedDraft(draft(players));
  assert.deepEqual(
    Array.from(validated.players.slice(0, 5), ({ rank }) => rank),
    [100, 99, 98, 97, 96]
  );
});

test("les modifications sont détectées champ par champ et la copie OCR reste indépendante", () => {
  const original = draft(Array.from({ length: 24 }, (_, index) => player({
    rank: index + 1,
    name: `Joueur ${index + 1}`
  })));
  const editable = validation.cloneJson(original);

  editable.players[0].name = "Nom corrigé";
  editable.players[0].damage = 987654321;

  assert.equal(validation.isRowModified(original.players[0], editable.players[0]), true);
  assert.equal(validation.countModifiedFields(original, editable), 2);
  assert.equal(original.players[0].name, "Joueur 1");
  assert.equal(original.players[0].damage, 1234567890);

  editable.players[0] = validation.cloneJson(original.players[0]);
  assert.equal(validation.isRowModified(original.players[0], editable.players[0]), false);
  assert.equal(validation.countModifiedFields(original, editable), 0);
});

test("les seuls signaux dégâts ajoutés sont certains et n’appliquent aucune correction", () => {
  const zeroDamage = player({ attacks: 3, attack_points: 2000, damage: 0 });
  const classified = validation.classifyRow(zeroDamage);

  assert.equal(classified.type, "active");
  assert.equal(classified.warnings.length, 2);
  assert.equal(zeroDamage.damage, 0);
  assert.doesNotMatch(source, /médiane|\*\s*10|×10|suggestion automatique/i);
});
