import assert from "node:assert/strict";
import test from "node:test";
import { GROQ_MODEL, inspectOutput, runBenchmark, validateReport } from "../experiments/war-analysis-provider-benchmark/benchmark.mjs";

function fixture(score = 71) {
  const players = Array.from({ length: 24 }, (_, index) => ({ rank: index + 1, original_rank: index + 1, name: `Joueur ${index + 1}`, score_total: score, attacks: 12 }));
  return { alliance: "zeus", date: "2026-08-18", report: { summary: { player_count: 24 }, players, ranking: players.map(({ rank, name, score_total }) => ({ rank, name, score: score_total })) } };
}

test("le rapport doit contenir exactement 24 joueurs cohérents", () => {
  assert.equal(validateReport(fixture()).report.players.length, 24);
  const short = fixture(); short.report.players.pop();
  assert.throws(() => validateReport(short), /exactement 24/);
});

test("le plafond importé de production rejette excellent pour un score de 71", () => {
  const report = fixture();
  const raw = JSON.stringify({ analyses: [{ rank: 1, name: "Joueur 1", analysis: "Joueur 1 a réalisé une excellente performance." }] });
  const result = inspectOutput(raw, report.report.players);
  assert.equal(result.analyses_accepted, 0);
  assert.equal(result.rejection_reasons.tone_ceiling, 1);
});

test("les trois réseaux sont mockés et reçoivent le même prompt", async () => {
  const report = fixture(85);
  const calls = [];
  const analyses = report.report.players.map(({ rank, name }) => ({ rank, name, analysis: `${name} signe une performance solide.` }));
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const cloudflare = url.includes("cloudflare.com");
    return new Response(JSON.stringify(cloudflare ? { result: { response: { analyses }, usage: { tokens: 10 } } } : { choices: [{ message: { content: JSON.stringify({ analyses }) } }], usage: { total_tokens: 10 } }), { status: 200, headers: { "x-ratelimit-remaining-requests": "9" } });
  };
  const run = await runBenchmark({ report, fetchImpl, config: { groqApiKey: "fake", cloudflareAccountId: "fake", cloudflareApiToken: "fake", cloudflareGlmModel: "@cf/verified/glm", cloudflareGemmaModel: "@cf/verified/gemma" } });
  assert.equal(calls.length, 3);
  assert.equal(run.results.every((result) => result.analyses_accepted === 24), true);
  assert.equal(calls[0].body.model, GROQ_MODEL);
  const prompts = calls.map(({ body }) => body.messages[0].content);
  assert.equal(new Set(prompts).size, 1);
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.equal("response_format" in calls[1].body, false);
});

test("aucun appel ne part si une configuration réelle manque", async () => {
  let calls = 0;
  await assert.rejects(() => runBenchmark({ report: fixture(), config: {}, fetchImpl: async () => { calls += 1; } }), /Configuration absente/);
  assert.equal(calls, 0);
});
