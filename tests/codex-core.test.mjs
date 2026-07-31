import test from "node:test";
import assert from "node:assert/strict";

import {
  FILTER_DEFAULTS,
  buildCodexHref,
  compactSearch,
  filterMechanicResults,
  getSearchMatchMessage,
  highlightSegments,
  normalizeSearch,
  parseRoute,
  prepareSearchRecords,
  rankSearchRecords,
  routeBucket,
  sortMechanicResults,
  uniqueEvidence,
} from "../docs/codex-core.js";

const searchRecords = prepareSearchRecords([
  {
    id: "ability-block",
    label: "Blocage de capacité",
    aliases: ["capablock", "ability block"],
    sourceName: "AbilityBlock",
    resultGroup: "mechanics",
  },
  {
    id: "barrier",
    label: "Barrière",
    aliases: ["Barrier"],
    sourceName: "barrier",
    sourceTerms: ["barrier_remove"],
    resultGroup: "mechanics",
  },
  {
    id: "peggy",
    label: "Peggy Carter",
    sourceName: "CaptainCarter",
    resultGroup: "characters",
  },
  {
    id: "feu-croise",
    label: "Feu croisé",
    parentLabel: "Peggy Carter",
    sourceName: "special",
    resultGroup: "abilities",
  },
]);

test("la normalisation ignore casse, accents, espaces, apostrophes et tirets", () => {
  assert.equal(normalizeSearch("  L’Homme--Fourmi  "), "l homme fourmi");
  assert.equal(compactSearch("L' Homme-Fourmi"), "lhommefourmi");
  assert.equal(compactSearch("BLOCAGE de capacité"), "blocagedecapacite");
});

test("la recherche classe le nom exact avant les autres correspondances", () => {
  const results = rankSearchRecords(searchRecords, "Barrière");
  assert.equal(results[0].id, "barrier");
  assert.equal(results[0].match.kind, "name");
  assert.equal(results[0].searchScore, 1000);
});

test("la recherche retrouve alias, nom source et terme source avec leur preuve de correspondance", () => {
  const alias = rankSearchRecords(searchRecords, "capablock")[0];
  assert.equal(alias.id, "ability-block");
  assert.equal(getSearchMatchMessage(alias.match), "Trouvé via l’alias “capablock”");

  const source = rankSearchRecords(searchRecords, "CaptainCarter")[0];
  assert.equal(source.id, "peggy");
  assert.equal(getSearchMatchMessage(source.match), "Trouvé via le nom source “CaptainCarter”");

  const sourceTerm = rankSearchRecords(searchRecords, "barrier_remove")[0];
  assert.equal(sourceTerm.id, "barrier");
  assert.equal(getSearchMatchMessage(sourceTerm.match), "Trouvé via le terme source “barrier_remove”");
});

test("la recherche accepte les préfixes, les accents et le personnage parent", () => {
  assert.equal(rankSearchRecords(searchRecords, "blocage de capa")[0].id, "ability-block");
  assert.equal(rankSearchRecords(searchRecords, "barriere")[0].id, "barrier");
  const parent = rankSearchRecords(searchRecords, "Peggy").find((record) => record.id === "feu-croise");
  assert.equal(parent.match.kind, "parent");
});

test("la recherche commence à deux caractères et gère l’état vide", () => {
  assert.deepEqual(rankSearchRecords(searchRecords, "b"), []);
  assert.deepEqual(rankSearchRecords(searchRecords, "introuvable"), []);
  assert.ok(rankSearchRecords(searchRecords, "ba").length > 0);
});

test("la surbrillance respecte les caractères accentués", () => {
  assert.deepEqual(highlightSegments("Barrière", "barriere"), [
    { text: "Barrière", match: true },
  ]);
});

test("les routes profondes sérialisent les filtres sans paramètres par défaut", () => {
  const href = buildCodexHref({
    view: "effect",
    id: "ability-block",
    operation: "effect_apply",
    filters: {
      ...FILTER_DEFAULTS,
      playable: false,
      type: "passive",
      mode: "war",
      chance: "100",
      side: "defense",
      sort: "az",
    },
  });
  assert.equal(
    href,
    "./codex.html?view=effect&id=ability-block&operation=effect_apply&playable=0&type=passive&mode=war&chance=100&side=defense&sort=az"
  );
  const route = parseRoute(href.split("?")[1]);
  assert.equal(route.view, "effect");
  assert.equal(route.filters.playable, false);
  assert.equal(route.filters.side, "defense");
  assert.equal(buildCodexHref({ view: "home" }), "./codex.html");
});

test("une vue inconnue est signalée comme URL invalide", () => {
  const route = parseRoute("?view=obsolete&id=x");
  assert.equal(route.invalid, true);
  assert.equal(route.view, "home");
});

test("les buckets de routes sont déterministes", () => {
  assert.equal(routeBucket("abl_c5c0dec38fb62704"), "c");
  assert.equal(routeBucket("op_11a50273e9f79cfb"), "1");
  assert.equal(routeBucket("act_fabc"), "f");
  assert.equal(routeBucket("invalid"), "");
});

const mechanicRecords = [
  {
    abilityId: "a",
    characterName: "Zulu",
    abilityName: "Passive libre",
    abilityType: "passive",
    abilityTypeOrder: 40,
    playable: true,
    isEmpowered: false,
    hasUnrestrictedMode: true,
    modes: [],
    sides: [],
    chanceCategory: "less",
  },
  {
    abilityId: "b",
    characterName: "Alpha",
    abilityName: "Ultime de guerre",
    abilityType: "ultimate",
    abilityTypeOrder: 30,
    playable: true,
    isEmpowered: false,
    hasUnrestrictedMode: false,
    modes: ["Guerre"],
    sides: ["Défense"],
    chanceCategory: "100",
  },
  {
    abilityId: "c",
    characterName: "Bêta",
    abilityName: "Basique renforcée",
    abilityType: "basic_empower",
    abilityTypeOrder: 11,
    playable: false,
    isEmpowered: true,
    hasUnrestrictedMode: true,
    modes: [],
    sides: [],
    chanceCategory: "unspecified",
  },
];

test("les filtres gardent les personnages jouables par défaut et les versions renforcées séparées", () => {
  assert.deepEqual(
    filterMechanicResults(mechanicRecords, FILTER_DEFAULTS).map((record) => record.abilityId),
    ["a", "b"]
  );
  assert.deepEqual(
    filterMechanicResults(mechanicRecords, {
      ...FILTER_DEFAULTS,
      playable: false,
      type: "empowered",
    }).map((record) => record.abilityId),
    ["c"]
  );
});

test("un filtre de mode conserve les capacités explicites et sans restriction", () => {
  const filtered = filterMechanicResults(mechanicRecords, {
    ...FILTER_DEFAULTS,
    mode: "war",
  });
  assert.deepEqual(filtered.map((record) => record.abilityId), ["a", "b"]);
  const sorted = sortMechanicResults(filtered, { ...FILTER_DEFAULTS, mode: "war" });
  assert.deepEqual(sorted.map((record) => record.abilityId), ["b", "a"]);
});

test("la pertinence sans mode privilégie le contexte libre puis la chance", () => {
  const sorted = sortMechanicResults(mechanicRecords.slice(0, 2), FILTER_DEFAULTS);
  assert.deepEqual(sorted.map((record) => record.abilityId), ["a", "b"]);
});

test("le tri A–Z utilise l’ordre français puis le type de capacité", () => {
  const sorted = sortMechanicResults(mechanicRecords, {
    ...FILTER_DEFAULTS,
    playable: false,
    sort: "az",
  });
  assert.deepEqual(sorted.map((record) => record.abilityId), ["b", "c", "a"]);
});

test("l’ordre des niveaux de preuve reste stable", () => {
  assert.deepEqual(
    uniqueEvidence(["official_text_only", "normalized", "official_text_only", "preserved_uninterpreted"]),
    ["normalized", "preserved_uninterpreted", "official_text_only"]
  );
});
