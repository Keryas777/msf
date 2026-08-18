import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  CLOUDFLARE_GEMMA_MODEL,
  CLOUDFLARE_GLM_MODEL,
  CLOUDFLARE_LLAMA4_SCOUT_MODEL,
  CLOUDFLARE_ANALYSES_RESPONSE_FORMAT,
  GROQ_MODEL,
  getBenchmarkConfig,
  inspectOutput,
  runBenchmark,
  validateReport
} from "../experiments/war-analysis-provider-benchmark/benchmark.mjs";
import { GROQ_ANALYSES_RESPONSE_FORMAT } from "../workers/msf-war-ocr/worker.js";

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

test("les identifiants Workers AI officiels sont les valeurs par défaut", () => {
  assert.equal(CLOUDFLARE_GLM_MODEL, "@cf/zai-org/glm-4.7-flash");
  assert.equal(CLOUDFLARE_GEMMA_MODEL, "@cf/google/gemma-4-26b-a4b-it");
  assert.equal(CLOUDFLARE_LLAMA4_SCOUT_MODEL, "@cf/meta/llama-4-scout-17b-16e-instruct");
  const config = getBenchmarkConfig({});
  assert.equal(config.cloudflareGlmModel, CLOUDFLARE_GLM_MODEL);
  assert.equal(config.cloudflareGemmaModel, CLOUDFLARE_GEMMA_MODEL);
  assert.equal(config.cloudflareLlama4ScoutModel, CLOUDFLARE_LLAMA4_SCOUT_MODEL);
});

test("les variables d'environnement surchargent les modèles Workers AI", () => {
  const config = getBenchmarkConfig({
    CLOUDFLARE_GLM_MODEL: "@cf/future/glm",
    CLOUDFLARE_GEMMA_MODEL: "@cf/future/gemma"
  });
  assert.equal(config.cloudflareGlmModel, "@cf/future/glm");
  assert.equal(config.cloudflareGemmaModel, "@cf/future/gemma");
});

test("le benchmark lit uniquement le token Workers AI dédié", () => {
  const deploymentTokenName = ["CLOUDFLARE", "API", "TOKEN"].join("_");
  const config = getBenchmarkConfig({
    CLOUDFLARE_WORKERS_AI_TOKEN: "workers-ai-token",
    [deploymentTokenName]: "deployment-token"
  });
  assert.equal(config.cloudflareWorkersAiToken, "workers-ai-token");
  assert.equal("cloudflareApiToken" in config, false);
});

function benchmarkConfig() {
  return { groqApiKey: "fake", cloudflareAccountId: "fake", cloudflareWorkersAiToken: "workers-ai-token", cloudflareGlmModel: CLOUDFLARE_GLM_MODEL, cloudflareGemmaModel: CLOUDFLARE_GEMMA_MODEL, cloudflareLlama4ScoutModel: CLOUDFLARE_LLAMA4_SCOUT_MODEL };
}

function recordingFetch(report, calls) {
  const analyses = report.report.players.map(({ rank, name }) => ({ rank, name, analysis: `${name} signe une performance solide.` }));
  return async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    const cloudflare = url.includes("cloudflare.com");
    return new Response(JSON.stringify(cloudflare ? { result: { response: { analyses }, usage: { tokens: 10 } } } : { choices: [{ message: { content: JSON.stringify({ analyses }) } }], usage: { total_tokens: 10 } }), { status: 200, headers: { "x-ratelimit-remaining-requests": "9" } });
  };
}

test("provider=all effectue exactement les quatre appels mockés avec le même prompt", async () => {
  const report = fixture(85);
  const calls = [];
  const run = await runBenchmark({ report, fetchImpl: recordingFetch(report, calls), config: benchmarkConfig() });
  assert.equal(calls.length, 4);
  assert.deepEqual(run.results.map(({ calls }) => calls), [1, 1, 1, 1]);
  assert.equal(run.results.every((result) => result.analyses_accepted === 24), true);
  assert.equal(calls[0].body.model, GROQ_MODEL);
  assert.equal(calls[0].body.temperature, 0.55);
  assert.equal(calls[0].body.reasoning_effort, "low");
  assert.equal(calls[0].body.max_completion_tokens, 6000);
  const prompts = calls.map(({ body }) => body.messages[0].content);
  assert.equal(new Set(prompts).size, 1);
  assert.deepEqual(calls[0].body.response_format, GROQ_ANALYSES_RESPONSE_FORMAT);
  assert.deepEqual(calls[1].body.response_format, CLOUDFLARE_ANALYSES_RESPONSE_FORMAT);
  assert.equal("strict" in calls[1].body.response_format, false);
  assert.equal("strict" in calls[1].body.response_format.json_schema, false);
  assert.equal("response_format" in calls[2].body, false);
  assert.deepEqual(calls[3].body.response_format, CLOUDFLARE_ANALYSES_RESPONSE_FORMAT);
  assert.equal(calls[3].body.temperature, 0.55);
  assert.equal("strict" in calls[3].body.response_format, false);
  assert.equal("strict" in calls[3].body.response_format.json_schema, false);
  assert.equal(calls[1].headers.authorization, "Bearer workers-ai-token");
  assert.equal(calls[2].headers.authorization, "Bearer workers-ai-token");
  assert.equal(calls[3].headers.authorization, "Bearer workers-ai-token");
  assert.match(calls[1].url, /\/ai\/run\/@cf\/zai-org\/glm-4\.7-flash$/);
  assert.match(calls[2].url, /\/ai\/run\/@cf\/google\/gemma-4-26b-a4b-it$/);
  assert.match(calls[3].url, /\/ai\/run\/@cf\/meta\/llama-4-scout-17b-16e-instruct$/);
});

test("le schéma GLM impose l'enveloppe analyses et les trois champs sans strict Groq", () => {
  assert.equal(CLOUDFLARE_ANALYSES_RESPONSE_FORMAT.type, "json_schema");
  const schema = CLOUDFLARE_ANALYSES_RESPONSE_FORMAT.json_schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["analyses"]);
  assert.equal(schema.properties.analyses.type, "array");
  assert.deepEqual(schema.properties.analyses.items.required, ["rank", "name", "analysis"]);
  assert.deepEqual(schema.properties.analyses.items.properties, {
    rank: { type: "integer" }, name: { type: "string" }, analysis: { type: "string" }
  });
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.analyses.items.additionalProperties, false);
  assert.equal("strict" in CLOUDFLARE_ANALYSES_RESPONSE_FORMAT, false);
  assert.equal("strict" in schema, false);
});

test("provider=cloudflare-glm effectue un seul appel GLM sans Groq ni Gemma et sans retry", async () => {
  const report = fixture(85);
  const calls = [];
  const run = await runBenchmark({ report, provider: "cloudflare-glm", fetchImpl: recordingFetch(report, calls), config: benchmarkConfig() });
  assert.equal(calls.length, 1);
  assert.deepEqual(run.results.map(({ provider, calls }) => [provider, calls]), [["cloudflare-glm", 1]]);
  assert.match(calls[0].url, /glm-4\.7-flash$/);
  assert.doesNotMatch(calls[0].url, /groq|gemma/);
});

test("provider=cloudflare-llama4-scout effectue un seul appel Scout structuré sans autre fournisseur ni retry", async () => {
  const report = fixture(85);
  const calls = [];
  const config = {
    cloudflareAccountId: "fake",
    cloudflareWorkersAiToken: "workers-ai-token",
    cloudflareLlama4ScoutModel: CLOUDFLARE_LLAMA4_SCOUT_MODEL
  };
  const run = await runBenchmark({ report, provider: "cloudflare-llama4-scout", fetchImpl: recordingFetch(report, calls), config });
  assert.equal(calls.length, 1);
  assert.deepEqual(run.results.map(({ provider, calls }) => [provider, calls]), [["cloudflare-llama4-scout", 1]]);
  assert.match(calls[0].url, /\/ai\/run\/@cf\/meta\/llama-4-scout-17b-16e-instruct$/);
  assert.doesNotMatch(calls[0].url, /groq|glm|gemma/);
  assert.equal(calls[0].body.temperature, 0.55);
  assert.equal(calls[0].body.max_tokens, 10000);
  assert.deepEqual(calls[0].body.response_format, CLOUDFLARE_ANALYSES_RESPONSE_FORMAT);
  assert.equal("strict" in calls[0].body.response_format, false);
  assert.equal("strict" in calls[0].body.response_format.json_schema, false);
  assert.equal(calls[0].headers.authorization, "Bearer workers-ai-token");
});

test("provider=groq effectue un seul appel Groq sans Cloudflare et conserve son schéma exact", async () => {
  const report = fixture(85);
  const calls = [];
  const run = await runBenchmark({ report, provider: "groq", fetchImpl: recordingFetch(report, calls), config: { groqApiKey: "fake" } });
  assert.equal(calls.length, 1);
  assert.deepEqual(run.results.map(({ provider, calls }) => [provider, calls]), [["groq", 1]]);
  assert.match(calls[0].url, /api\.groq\.com/);
  assert.deepEqual(calls[0].body.response_format, GROQ_ANALYSES_RESPONSE_FORMAT);
});

test("le lanceur sans --execute ne peut effectuer aucun appel réseau", () => {
  const result = spawnSync(process.execPath, ["experiments/war-analysis-provider-benchmark/run.mjs"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Aucun appel effectué/);
});

test("aucun appel ne part si une configuration réelle manque", async () => {
  let calls = 0;
  await assert.rejects(() => runBenchmark({ report: fixture(), config: {}, fetchImpl: async () => { calls += 1; } }), /Configuration absente/);
  assert.equal(calls, 0);
});
