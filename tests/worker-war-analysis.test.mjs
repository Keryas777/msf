import assert from "node:assert/strict";
import test from "node:test";
import worker, { getGlobalPerformanceSentence } from "../workers/msf-war-ocr/worker.js";

const COMMENT = "Avec dix attaques réussies, son efficacité offensive a été remarquable.";

function requestBody(count = 24, names = {}) {
  const players = Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    return {
      rank,
      original_rank: rank,
      name: names[rank] || `Joueur ${rank}`,
      score_total: rank === 1 ? 71 : 60
    };
  });
  return {
    alliance: "zeus",
    date: "2026-08-09",
    report: {
      summary: { player_count: count },
      ranking: players.map(({ rank, name, score_total }) => ({ rank, name, score: score_total })),
      players
    }
  };
}

function entriesFor(body, ranks = body.report.players.map(({ rank }) => rank), overrides = {}) {
  return ranks.map((rank) => {
    const player = body.report.players.find((candidate) => candidate.rank === rank);
    return { rank, name: player.name, analysis: COMMENT, ...overrides[rank] };
  });
}

function groqResponse(analyses) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify({ analyses }) } }]
  });
}

async function callWorker(body, responders) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const responder = responders[calls.length - 1];
    return typeof responder === "function" ? responder(calls.at(-1)) : responder;
  };

  try {
    const response = await worker.fetch(new Request("https://worker.test/api/war/write-analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }), { GROQ_API_KEY: "test" });
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function promptBody(call) {
  return JSON.parse(call.messages[0].content.split("\n\n").at(-1));
}

function rateLimitResponse() {
  return Response.json({ error: { message: "rate limited" } }, {
    status: 429,
    headers: { "retry-after": "17.2" }
  });
}

test("24 analyses valides utilisent un seul appel et conservent le contrat", async () => {
  const body = requestBody();
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body))]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(await response.clone().json()), ["analyses"]);
  assert.equal((await response.json()).analyses.length, 24);
  assert.equal(calls[0].model, "openai/gpt-oss-120b");
  assert.deepEqual(calls[0].response_format, { type: "json_object" });
});

test("23 valides et 1 manquante complètent uniquement le rang absent", async () => {
  const body = requestBody();
  const initialRanks = body.report.players.map(({ rank }) => rank).filter((rank) => rank !== 17);
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, initialRanks)),
    groqResponse(entriesFor(body, [17]))
  ]);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.analyses.map(({ rank }) => rank), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [17]);
  assert.deepEqual(promptBody(calls[1]).report.ranking.map(({ rank }) => rank), [17]);
  assert.match(calls[1].messages[0].content, /requête de complétion, et aucun autre joueur/);
});

test("20 valides et 4 manquantes n’envoient que ces quatre joueurs", async () => {
  const body = requestBody();
  const missing = [3, 8, 19, 24];
  const kept = body.report.players.map(({ rank }) => rank).filter((rank) => !missing.includes(rank));
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, kept)),
    groqResponse(entriesFor(body, missing))
  ]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), missing);
  assert.equal(promptBody(calls[1]).report.summary.player_count, 4);
  assert.equal(calls[1].messages[0].content.includes('"name":"Joueur 1"'), false);
});

test("un mauvais pseudo invalide seulement son rang", async () => {
  const body = requestBody(3);
  const first = entriesFor(body, undefined, { 2: { name: "Intrus" } });
  const { response, calls } = await callWorker(body, [groqResponse(first), groqResponse(entriesFor(body, [2]))]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
});

test("une analyse vide est demandée en complétion", async () => {
  const body = requestBody(3);
  const first = entriesFor(body, undefined, { 2: { analysis: "   " } });
  const { response, calls } = await callWorker(body, [groqResponse(first), groqResponse(entriesFor(body, [2]))]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
});

test("un jugement global nettoyable est supprimé sans appel complémentaire", async () => {
  const body = requestBody(1);
  const comment = `Il a réalisé une excellente performance. ${COMMENT}`;
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body, [1], { 1: { analysis: comment } }))]);
  assert.equal(calls.length, 1);
  assert.equal((await response.json()).analyses[0].analysis, `Joueur 1 a réalisé une très bonne performance. ${COMMENT}`);
});

test("une mention interdite non nettoyable entraîne la complétion du rang", async () => {
  const body = requestBody(2);
  const forbidden = "Son score total reflète dix attaques victorieuses et une forte activité.";
  const first = entriesFor(body, undefined, { 1: { analysis: forbidden } });
  const { response, calls } = await callWorker(body, [groqResponse(first), groqResponse(entriesFor(body, [1]))]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [1]);
});

test("un doublon de rang est écarté sans perdre les autres rangs", async () => {
  const body = requestBody(3);
  const initial = [...entriesFor(body), { ...entriesFor(body, [2])[0], analysis: "Avec neuf attaques réussies, son impact offensif est resté important." }];
  const { response, calls } = await callWorker(body, [groqResponse(initial), groqResponse(entriesFor(body, [2]))]);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
  assert.deepEqual(result.analyses.map(({ rank }) => rank), [1, 2, 3]);
});

test("la fusion réussie reste triée et sans doublon", async () => {
  const body = requestBody(4);
  const { response } = await callWorker(body, [
    groqResponse(entriesFor(body, [4, 2])),
    groqResponse(entriesFor(body, [3, 1]))
  ]);
  const analyses = (await response.json()).analyses;
  assert.deepEqual(analyses.map(({ rank }) => rank), [1, 2, 3, 4]);
  assert.equal(new Set(analyses.map(({ name }) => name)).size, 4);
});

test("une complétion incomplète liste précisément les rangs encore absents", async () => {
  const body = requestBody(4);
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, [1])),
    groqResponse(entriesFor(body, [2]))
  ]);
  assert.equal(calls.length, 2);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /rangs 3, 4\.$/);
});

test("un 429 au premier appel conserve le contrat GROQ_RATE_LIMIT", async () => {
  const { response, calls } = await callWorker(requestBody(1), [rateLimitResponse()]);
  assert.equal(calls.length, 1);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "Quota Groq temporairement atteint.",
    code: "GROQ_RATE_LIMIT",
    model: "openai/gpt-oss-120b",
    retry_after_seconds: 18,
    detail: "rate limited"
  });
});

test("un 429 pendant la complétion conserve le contrat GROQ_RATE_LIMIT", async () => {
  const body = requestBody(2);
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body, [1])), rateLimitResponse()]);
  assert.equal(calls.length, 2);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "GROQ_RATE_LIMIT");
});

test("la ponctuation du pseudo reste ignorée dans le comptage des phrases", async () => {
  const body = requestBody(1, { 1: "Tt!!Le Fléau !!" });
  const { response } = await callWorker(body, [groqResponse(entriesFor(body))]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).analyses[0].analysis, `Tt!!Le Fléau !! a réalisé une très bonne performance. ${COMMENT}`);
});

test("le score 71 conserve la qualification très bonne performance", () => {
  assert.equal(getGlobalPerformanceSentence(71, "Pelleas"), "Pelleas a réalisé une très bonne performance.");
});

test("deux phrases Groq et trois phrases finales restent acceptées", async () => {
  const body = requestBody(1);
  const comment = "Il a remporté ses dix attaques avec une efficacité maximale. Son impact offensif a été important.";
  const { response } = await callWorker(body, [groqResponse(entriesFor(body, [1], { 1: { analysis: comment } }))]);
  const analysis = (await response.json()).analyses[0].analysis;
  assert.equal(response.status, 200);
  assert.equal((analysis.match(/[.!?]+(?=\s|$)/g) || []).length, 3);
});

test("trois phrases Groq invalident le rang puis une seule complétion est tentée", async () => {
  const body = requestBody(1);
  const invalid = "Il a remporté dix attaques. Son efficacité a été maximale. Son impact offensif a été important.";
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, [1], { 1: { analysis: invalid } })),
    groqResponse(entriesFor(body))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});
