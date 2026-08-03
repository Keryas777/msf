import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../docs/war-admin-analysis.js", import.meta.url), "utf8");
const context = vm.createContext({ globalThis: {} });
vm.runInContext(source, context, { filename: "war-admin-analysis.js" });
const { buildAnalysisPayload, mergeAnalyses, validateAnalysesResponse } = context.globalThis.MsfWarAnalysis;
const plain = (value) => JSON.parse(JSON.stringify(value));

function report() {
  return {
    date: "2026-08-03",
    alliance: "zeus",
    source: "validated-draft",
    report: {
      summary: { total_damage: 123456789, player_count: 2 },
      ranking: [{ rank: 1, name: "Alpha", score: 91 }, { rank: 2, name: "Beta", score: 75.5 }],
      players: [
        { rank: 1, name: "Alpha", score_total: 91, damage: 100000001 },
        { rank: 2, name: "Beta", score_total: 75.5, damage: 99999999 }
      ]
    }
  };
}

function response() {
  return { analyses: [
    { rank: 1, name: "Alpha", analysis: "Très bon impact sur cette guerre." },
    { rank: 2, name: "Beta", analysis: "Contribution solide, malgré une efficacité plus limitée." }
  ] };
}

test("le payload Gemini contient uniquement l’alliance, la date et le rapport classé nécessaire", () => {
  const payload = plain(buildAnalysisPayload(report()));
  assert.deepEqual(Object.keys(payload), ["alliance", "date", "report"]);
  assert.deepEqual(Object.keys(payload.report), ["summary", "ranking", "players"]);
  assert.equal("source" in payload, false);
});

test("la fusion ajoute uniquement analysis aux joueurs sans muter ni modifier un nombre", () => {
  const input = report();
  const before = structuredClone(input);
  const merged = plain(mergeAnalyses(input, response()));
  assert.deepEqual(input, before);
  assert.deepEqual(merged.report.summary, before.report.summary);
  assert.deepEqual(merged.report.ranking, before.report.ranking);
  merged.report.players.forEach((player, index) => {
    const { analysis, ...withoutAnalysis } = player;
    assert.deepEqual(withoutAnalysis, before.report.players[index]);
    assert.ok(analysis.length > 0);
    assert.equal("tags" in player, false);
  });
});

test("le contrat rejette entièrement tailles, inconnus, doublons, vides et clés supplémentaires", () => {
  const invalid = [
    { analyses: [response().analyses[0]] },
    { analyses: [{ rank: 3, name: "Inconnu", analysis: "Texte" }, response().analyses[1]] },
    { analyses: [response().analyses[0], { rank: 1, name: "Alpha", analysis: "Encore" }] },
    { analyses: [response().analyses[0], { rank: 2, name: "Beta", analysis: " " }] },
    { analyses: [{ ...response().analyses[0], score: 91 }, response().analyses[1]] },
    { analyses: response().analyses, tags: [] }
  ];
  for (const value of invalid) assert.throws(() => validateAnalysesResponse(value, report()));
});

test("le module local ne fait aucun appel réseau et ne génère aucun tag", () => {
  assert.equal((source.match(/\bfetch\(/g) || []).length, 0);
  assert.doesNotMatch(source, /github/i);
  assert.doesNotMatch(source, /\btags\b/i);
});
