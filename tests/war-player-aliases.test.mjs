import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(new URL("../docs/war-player-aliases.js", import.meta.url), "utf8");
const aliasData = JSON.parse(await readFile(new URL("../docs/data/player-aliases.json", import.meta.url), "utf8"));

function createApi(fetcher = async () => Response.json(aliasData)) {
  const sandbox = vm.createContext({ fetch: fetcher, console });
  vm.runInContext(script, sandbox, { filename: "war-player-aliases.js" });
  return sandbox.MsfWarPlayerAliases;
}

test("la résolution utilise player-aliases.json et conserve les noms inconnus", () => {
  const api = createApi();
  const aliases = api.createMap(aliasData);
  assert.equal(api.canonicalName("T8K", aliases), "T6K");
  assert.equal(api.canonicalName("MeGa5tOrM", aliases), "MeGaStOrM");
  assert.equal(api.canonicalName("⚔️Zabuza⚔️", aliases), "Zabuza");
  assert.equal(api.canonicalName("Inconnu", aliases), "Inconnu");
});

test("le brouillon dérivé corrige les pseudos sans modifier les statistiques ni la source OCR", () => {
  const api = createApi();
  const aliases = api.createMap(aliasData);
  const draft = {
    alliance: "dionysos",
    players: [
      { name: "T8K", rank: 1, attacks: 14, damage: 12345 },
      { name: "Autre joueur", rank: 2, attacks: 12, damage: 6789 }
    ]
  };
  const normalized = api.normalizeDraft(draft, aliases);
  assert.equal(normalized.players[0].name, "T6K");
  assert.equal(normalized.players[0].damage, 12345);
  assert.equal(normalized.players[0].attacks, 14);
  assert.equal(draft.players[0].name, "T8K");
  assert.equal(normalized.players[1].name, "Autre joueur");
});

test("deux lignes aboutissant au même pseudo bloquent le calcul au lieu d'être fusionnées", () => {
  const api = createApi();
  const aliases = api.createMap(aliasData);
  assert.throws(() => api.normalizeDraft({
    players: [{ name: "T8K" }, { name: "T6K" }]
  }, aliases), /Collision de pseudos/);
});

test("le texte remplace seulement le pseudo entier du joueur concerné", () => {
  const api = createApi();
  assert.equal(
    api.correctAnalysis("T8K a joué. IT8K, T8K_2 et T8K sont distincts.", "T8K", "T6K"),
    "T6K a joué. IT8K, T8K_2 et T6K sont distincts."
  );
  assert.equal(
    api.correctAnalysis("Iolodomi et Iolo.", "Iolo", "lolo"),
    "Iolodomi et lolo."
  );
  assert.equal(
    api.correctAnalysis("Keryas !!! est actif.", "Keryas !!!", "Keryas III"),
    "Keryas III est actif."
  );
});

test("l'historique d'une vraie GA corrige les noms et analyses sans modifier les JSON ni les scores", async () => {
  const api = createApi();
  const aliases = api.createMap(aliasData);
  const war = JSON.parse(await readFile(
    new URL("../docs/data/war/2026-07-14/dionysos.json", import.meta.url), "utf8"
  ));
  const savedJson = JSON.stringify(war);
  const before = war.report.players.find((p) => p.name === "T8K");
  assert.ok(before, "la guerre témoin doit toujours contenir le pseudo OCR T8K");
  const result = api.normalizeWarData(war, aliases);
  const after = result.report.players.find((p) => p.name === "T6K");
  assert.ok(after);
  assert.match(after.analysis, /^T6K a montré/);
  assert.equal(after.score_total, before.score_total);
  assert.equal(after.damage, before.damage);
  assert.ok(result.players.some((p) => p.name === "T6K"));
  assert.ok(result.report.ranking.some((p) => p.name === "T6K"));
  assert.equal(JSON.stringify(war), savedJson, "aucune mutation des archives sources");
});

test("une erreur réseau reste réessayable, avec chargement sans cache", async () => {
  let attempts = 0;
  const api = createApi(async (_url, options) => {
    assert.equal(options.cache, "no-store");
    attempts += 1;
    if (attempts === 1) throw new Error("Réseau indisponible");
    return Response.json(aliasData);
  });
  await assert.rejects(api.load(), /Réseau indisponible/);
  assert.equal(api.canonicalName("T8K", await api.load()), "T6K");
  assert.equal(attempts, 2);
});
