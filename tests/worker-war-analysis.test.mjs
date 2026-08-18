import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker, {
  getGlobalPerformanceSentence,
  getGlobalToneCeiling,
  parseGroqDurationSeconds
} from "../workers/msf-war-ocr/worker.js";

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
    }), { GROQ_API_KEY: "test-api-key-never-return" });
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function promptBody(call) {
  return JSON.parse(call.messages[0].content.split("\n\n").at(-1));
}

function rateLimitResponse(headers = { "retry-after": "17.2" }) {
  return Response.json({ error: { message: "rate limited", type: "tokens", code: "rate_limit_exceeded" } }, {
    status: 429,
    headers
  });
}

function failedGenerationResponse(error = {}, headers = {}) {
  return Response.json({
    error: {
      message: "Erreur de génération Groq",
      ...error
    }
  }, { status: 400, headers });
}

function assertStrictAnalysisResponseFormat(responseFormat) {
  assert.equal(responseFormat.type, "json_schema");
  assert.equal(responseFormat.json_schema.strict, true);

  const schema = responseFormat.json_schema.schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["analyses"]);
  assert.equal(schema.additionalProperties, false);

  const itemSchema = schema.properties.analyses.items;
  assert.equal(itemSchema.type, "object");
  assert.deepEqual(itemSchema.required, ["rank", "name", "analysis"]);
  assert.equal(itemSchema.additionalProperties, false);
  assert.equal(itemSchema.properties.rank.type, "integer");
  assert.equal(itemSchema.properties.name.type, "string");
  assert.equal(itemSchema.properties.analysis.type, "string");
}

test("24 analyses valides utilisent un seul appel et conservent le contrat", async () => {
  const body = requestBody();
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body))]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(await response.clone().json()), ["analyses"]);
  assert.equal((await response.json()).analyses.length, 24);
  assert.equal(calls[0].model, "openai/gpt-oss-120b");
  assertStrictAnalysisResponseFormat(calls[0].response_format);
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
  assertStrictAnalysisResponseFormat(calls[1].response_format);
  assert.deepEqual(calls[1].response_format, calls[0].response_format);
});

test("le chemin de rédaction Groq ne contient plus l’ancien JSON Object Mode", async () => {
  const source = await readFile(new URL("../workers/msf-war-ocr/worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /type:\s*["']json_object["']/);
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

test("le texte GPT-OSS validé est retourné exactement, sans préfixe automatique", async () => {
  const body = requestBody(1);
  const comment = `Il a réalisé une très bonne performance. ${COMMENT}`;
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body, [1], { 1: { analysis: comment } }))]);
  assert.equal(calls.length, 1);
  assert.equal((await response.json()).analyses[0].analysis, comment);
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
    http_status: 429,
    model: "openai/gpt-oss-120b",
    retry_after_seconds: 18,
    detail: "rate limited",
    groq_error: {
      message: "rate limited",
      type: "tokens",
      code: "rate_limit_exceeded"
    },
    rate_limit: {
      retry_after: "17.2",
      limit_requests: null,
      remaining_requests: null,
      reset_requests: null,
      limit_tokens: null,
      remaining_tokens: null,
      reset_tokens: null
    }
  });
});

test("un 429 expose exactement les sept headers de quota Groq", async () => {
  const headers = {
    "retry-after": "12",
    "x-ratelimit-limit-requests": "1000",
    "x-ratelimit-remaining-requests": "999",
    "x-ratelimit-reset-requests": "1m",
    "x-ratelimit-limit-tokens": "8000",
    "x-ratelimit-remaining-tokens": "0",
    "x-ratelimit-reset-tokens": "12s"
  };
  const { response } = await callWorker(requestBody(1), [rateLimitResponse(headers)]);
  const data = await response.json();

  assert.deepEqual(data.rate_limit, {
    retry_after: "12",
    limit_requests: "1000",
    remaining_requests: "999",
    reset_requests: "1m",
    limit_tokens: "8000",
    remaining_tokens: "0",
    reset_tokens: "12s"
  });
  assert.equal(data.retry_after_seconds, 12);
  assert.equal(JSON.stringify(data).includes("test-api-key-never-return"), false);
});

test("un 429 pendant la complétion conserve le contrat GROQ_RATE_LIMIT", async () => {
  const body = requestBody(2);
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body, [1])), rateLimitResponse()]);
  assert.equal(calls.length, 2);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "GROQ_RATE_LIMIT");
});

test("le parseur de durée Groq accepte les secondes et minutes décimales", () => {
  assert.equal(parseGroqDurationSeconds("43"), 43);
  assert.equal(parseGroqDurationSeconds("43.2"), 44);
  assert.equal(parseGroqDurationSeconds("43s"), 43);
  assert.equal(parseGroqDurationSeconds("43.2s"), 44);
  assert.equal(parseGroqDurationSeconds("1m"), 60);
  assert.equal(parseGroqDurationSeconds("1m2s"), 62);
  assert.equal(parseGroqDurationSeconds("1m2.5s"), 63);
  assert.equal(parseGroqDurationSeconds("invalide"), null);
  assert.equal(parseGroqDurationSeconds(null), null);
});

test("un 429 privilégie retry-after lorsqu'il est exploitable", async () => {
  const { response } = await callWorker(requestBody(1), [rateLimitResponse({
    "retry-after": "43",
    "x-ratelimit-reset-tokens": "51.4s"
  })]);
  assert.equal((await response.json()).retry_after_seconds, 43);
});

test("un 429 utilise le reset TPM puis le fallback de sécurité", async () => {
  let result = await callWorker(requestBody(1), [rateLimitResponse({
    "x-ratelimit-reset-tokens": "43.2s"
  })]);
  assert.equal((await result.response.json()).retry_after_seconds, 44);

  result = await callWorker(requestBody(1), [rateLimitResponse({})]);
  assert.equal((await result.response.json()).retry_after_seconds, 60);
});

test("failed_generation est détecté par le code structuré", async () => {
  const { response } = await callWorker(requestBody(1), [failedGenerationResponse({
    code: "failed_generation"
  })]);
  assert.equal((await response.json()).code, "GROQ_GENERATION_RETRY");
});

test("failed_generation est détecté par le type structuré", async () => {
  const { response } = await callWorker(requestBody(1), [failedGenerationResponse({
    type: "failed_generation"
  })]);
  assert.equal((await response.json()).code, "GROQ_GENERATION_RETRY");
});

test("le message Failed to generate JSON reste un fallback retryable", async () => {
  const { response } = await callWorker(requestBody(1), [failedGenerationResponse({
    message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details."
  })]);
  assert.equal((await response.json()).code, "GROQ_GENERATION_RETRY");
});

test("le message Failed to validate JSON reste un fallback retryable", async () => {
  const { response } = await callWorker(requestBody(1), [failedGenerationResponse({
    message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details."
  })]);
  assert.equal((await response.json()).code, "GROQ_GENERATION_RETRY");
});

test("failed_generation utilise le reset TPM arrondi", async () => {
  const { response } = await callWorker(requestBody(1), [failedGenerationResponse({
    code: "failed_generation"
  }, {
    "x-ratelimit-reset-tokens": "43.2s"
  })]);
  const data = await response.json();
  assert.equal(data.code, "GROQ_GENERATION_RETRY");
  assert.equal(data.retry_after_seconds, 44);
});

test("failed_generation sans reset exploitable utilise le fallback de sécurité", async () => {
  let result = await callWorker(requestBody(1), [failedGenerationResponse({
    type: "failed_generation"
  }, {
    "x-ratelimit-reset-tokens": "invalide"
  })]);
  let data = await result.response.json();
  assert.equal(data.code, "GROQ_GENERATION_RETRY");
  assert.equal(data.retry_after_seconds, 60);

  result = await callWorker(requestBody(1), [failedGenerationResponse({
    code: "failed_generation"
  }, {
    "x-ratelimit-reset-tokens": "51.4s"
  })]);
  data = await result.response.json();
  assert.equal(data.code, "GROQ_GENERATION_RETRY");
  assert.equal(data.retry_after_seconds, 52);
});

test("une autre erreur Groq 400 conserve le comportement non retryable", async () => {
  const { response } = await callWorker(requestBody(1), [
    Response.json({ error: { message: "Requête Groq invalide" } }, { status: 400 })
  ]);
  const data = await response.json();
  assert.equal(response.status, 500);
  assert.equal(data.error, "Requête Groq invalide");
  assert.equal(data.code, undefined);
  assert.equal(data.retry_after_seconds, undefined);
});

test("la ponctuation du pseudo reste ignorée dans le comptage des phrases", async () => {
  const body = requestBody(1, { 1: "Tt!!Le Fléau !!" });
  const analysis = `Tt!!Le Fléau !! signe une très bonne guerre. ${COMMENT} Sa défense est restée solide.`;
  const { response } = await callWorker(body, [groqResponse(entriesFor(body, [1], { 1: { analysis } }))]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).analyses[0].analysis, analysis);
});

test("le score 71 conserve la qualification très bonne performance", () => {
  assert.equal(getGlobalPerformanceSentence(71, "Pelleas"), "Pelleas a réalisé une très bonne performance.");
});

test("getGlobalPerformanceSentence n’est plus appelée pour construire la réponse", async () => {
  const source = await readFile(new URL("../workers/msf-war-ocr/worker.js", import.meta.url), "utf8");
  assert.equal((source.match(/getGlobalPerformanceSentence\s*\(/g) || []).length, 1);
  assert.match(source, /export function getGlobalPerformanceSentence/);
});

test("trois phrases GPT-OSS complètes restent acceptées", async () => {
  const body = requestBody(1);
  const comment = "Il signe une très bonne guerre. Il a remporté ses dix attaques avec une efficacité maximale. Son impact offensif a été important.";
  const { response } = await callWorker(body, [groqResponse(entriesFor(body, [1], { 1: { analysis: comment } }))]);
  const analysis = (await response.json()).analyses[0].analysis;
  assert.equal(response.status, 200);
  assert.equal((analysis.match(/[.!?]+(?=\s|$)/g) || []).length, 3);
});

test("quatre phrases invalident le rang puis une seule complétion est tentée", async () => {
  const body = requestBody(1);
  const invalid = "Il signe une très bonne guerre. Il a remporté dix attaques. Son efficacité a été maximale. Son impact offensif a été important.";
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, [1], { 1: { analysis: invalid } })),
    groqResponse(entriesFor(body))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test("les plafonds déterministes suivent exactement le barème", () => {
  assert.deepEqual(
    [39, 40, 50, 60, 70, 80, 90].map(getGlobalToneCeiling),
    ["withdrawn", "mixed", "solid", "good", "very_good", "excellent", "exceptional"]
  );
});

test("le prompt transmet score_total et tonalité globale cible pour chaque joueur", async () => {
  const body = requestBody(1);
  const { calls } = await callWorker(body, [groqResponse(entriesFor(body))]);
  assert.match(calls[0].messages[0].content, /"score_total":71,"global_tone_ceiling":"VERY_GOOD"/);
  assert.match(calls[0].messages[0].content, /plafond maximal et la tonalité globale cible/);
});

test("le prompt impose la cible exacte, préserve les sous-aspects et détaille l’auto-vérification", async () => {
  const body = requestBody(1);
  const { calls } = await callWorker(body, [groqResponse(entriesFor(body))]);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /score_total est une donnée technique interne.*uniquement à définir la tonalité globale cible/s);
  assert.match(prompt, /« Il obtient un score de 71\. ».*« Son score est élevé\. ».*« Sa note est excellente\. »/s);
  assert.match(prompt, /AUTORISÉ.*« Son activité offensive a été régulière\. ».*« Son efficacité a été excellente\. »/s);
  assert.match(prompt, /jugement GLOBAL sur la guerre, la performance, la prestation, le bilan, le résultat global ou le joueur.*EXACTEMENT.*ni un niveau supérieur ni un niveau inférieur/s);
  assert.match(prompt, /EXCEPTIONAL → « exceptionnelle » ou « remarquable »/);
  assert.match(prompt, /EXCELLENT → « excellente »/);
  assert.match(prompt, /VERY_GOOD → « très bonne »/);
  assert.match(prompt, /GOOD → « bonne »/);
  assert.match(prompt, /SOLID → « solide »/);
  assert.match(prompt, /MIXED → « mitigée » ou « contrastée »/);
  assert.match(prompt, /WITHDRAWN → « en retrait ».*prestation difficile/);
  assert.match(prompt, /EXCELLENT.*« Il réalise une excellente guerre\. » est autorisé.*« Il réalise une guerre exceptionnelle\. ».*« Il réalise une très bonne guerre\. ».*interdits/s);
  assert.match(prompt, /VERY_GOOD.*« Il réalise une très bonne guerre\. » est autorisé.*« Il réalise une excellente guerre\. ».*« Il réalise une bonne guerre\. ».*interdits/s);
  assert.match(prompt, /Distinction global \/ sous-aspect.*« Son efficacité a été exceptionnelle\. ».*« Son impact a été remarquable\. »/s);
  assert.match(prompt, /ne commence pas systématiquement par le pseudo.*n’utilise pas systématiquement « signe une guerre ».*sans suivre un modèle de phrase fixe/s);
  assert.match(prompt, /Avant de produire le JSON, vérifie mentalement chaque analyse dans ce même appel/);
  assert.match(prompt, /jugement GLOBAL.*EXACTEMENT à global_tone_ceiling.*sous-aspects clairement identifiés.*entre 1 et 3 phrases.*700 caractères.*rank, name et analysis/s);
});

for (const analysis of [
  "Il obtient un score de 71.",
  "Son score est élevé.",
  "Un score faible résume sa guerre.",
  "Sa note est excellente.",
  "Il reçoit une note de 71."
]) {
  test(`la mention directe « ${analysis} » invalide uniquement le rang`, async () => {
    const body = requestBody(2);
    const { response, calls } = await callWorker(body, [
      groqResponse(entriesFor(body, undefined, { 1: { analysis } })),
      groqResponse(entriesFor(body, [1]))
    ]);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [1]);
  });
}

test("un emploi de note sans rapport avec l’évaluation n’est pas rejeté", async () => {
  const body = requestBody(1);
  const analysis = "La note de synthèse sur son activité offensive reste factuelle.";
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, [1], { 1: { analysis } }))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await response.json()).analyses[0].analysis, analysis);
});

const toneCases = [
  [88, "Il signe une guerre exceptionnelle.", true],
  [87, "Il signe une guerre exceptionnelle.", false],
  [88, "Il signe une excellente guerre.", true],
  [79, "Il réalise une excellente performance.", true],
  [78, "Il réalise une excellente performance.", true],
  [77, "Il réalise une excellente performance.", false],
  [77, "Il réalise une performance exceptionnelle.", false],
  [69, "Il réalise une très bonne guerre.", true],
  [67, "Il réalise une très bonne guerre.", false],
  [59, "Il réalise une bonne guerre.", true],
  [57, "Il réalise une bonne guerre.", false],
  [49, "Il réalise une prestation solide.", true],
  [47, "Il réalise une prestation solide.", false],
  [39, "Il réalise une prestation mitigée.", true],
  [37, "Il réalise une prestation mitigée.", false],
  [71, "Il réalise une excellente performance.", false],
  [71, "Il réalise une très bonne performance.", true],
  [71, "Très bonne performance.", true],
  [71, "Excellente performance.", false],
  [71, "Performance exceptionnelle.", false],
  [71, "Son efficacité a été exceptionnelle.", true],
  [71, "Son efficacité a été excellente. Globalement, sa guerre a été très bonne.", true],
  [71, "Son efficacité a été exceptionnelle. Sa guerre a été excellente.", false],
  [84, "Excellente performance.", true],
  [84, "Performance exceptionnelle.", false],
  [94, "Performance exceptionnelle.", true],
  [61, "Bonne guerre.", true],
  [61, "Très bonne guerre.", false],
  [71, "Il a réalisé une très bonne guerre.", true],
  [71, "Il a réalisé une excellente guerre.", false],
  [71, "Il a réalisé une performance exceptionnelle.", false],
  [72, "Il réalise une très bonne guerre.", true],
  [72, "Il réalise une excellente guerre.", false],
  [72, "Il réalise une très bonne guerre avec une excellente efficacité.", true],
  [72, "Sa guerre est très bonne et son impact exceptionnel.", true],
  [72, "Sa prestation est excellente avec une bonne efficacité.", false],
  [49, "Sa guerre est mitigée avec une bonne efficacité.", true],
  [49, "Sa guerre est mitigée avec une efficacité excellente.", true],
  [49, "Sa guerre est bonne avec une efficacité mitigée.", false],
  [71, "Sa guerre a été exceptionnelle.", false],
  [71, "Sa guerre a été très bonne avec une efficacité exceptionnelle.", true]
];

for (const [score, analysis, accepted] of toneCases) {
  test(`score ${score} : ${analysis} est ${accepted ? "accepté" : "rejeté individuellement"}`, async () => {
    const body = requestBody(1);
    body.report.players[0].score_total = score;
    body.report.ranking[0].score = score;
    const fallback = "Son efficacité offensive est restée solide.";
    const { response, calls } = await callWorker(body, [
      groqResponse(entriesFor(body, [1], { 1: { analysis } })),
      groqResponse(entriesFor(body, [1], { 1: { analysis: fallback } }))
    ]);
    assert.equal(response.status, 200);
    assert.equal(calls.length, accepted ? 1 : 2);
    assert.equal((await response.json()).analyses[0].analysis, accepted ? analysis : fallback);
  });
}

test("une analyse complète d’une phrase est acceptée", async () => {
  const body = requestBody(1);
  const analysis = "Une guerre très bonne et maîtrisée sur le plan offensif.";
  const { response, calls } = await callWorker(body, [groqResponse(entriesFor(body, [1], { 1: { analysis } }))]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("une analyse de plus de 700 caractères est rejetée individuellement", async () => {
  const body = requestBody(1);
  const invalid = `${"Une activité offensive régulière, ".repeat(22)}sans baisse notable.`;
  assert.ok(invalid.length > 700);
  const { response, calls } = await callWorker(body, [
    groqResponse(entriesFor(body, [1], { 1: { analysis: invalid } })),
    groqResponse(entriesFor(body))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test("23 analyses restent conservées et seule la tonalité trop forte est complétée", async () => {
  const body = requestBody();
  const initial = entriesFor(body, undefined, { 1: { analysis: "Excellente performance." } });
  const replacement = "Il a réalisé une très bonne guerre.";
  const { response, calls } = await callWorker(body, [
    groqResponse(initial),
    groqResponse(entriesFor(body, [1], { 1: { analysis: replacement } }))
  ]);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [1]);
  assert.equal(result.analyses[0].analysis, replacement);
  assert.equal(result.analyses[1].analysis, COMMENT);
});

test("une complétion encore trop forte liste précisément le rang", async () => {
  const body = requestBody(2);
  const invalid = "Performance exceptionnelle.";
  const { response } = await callWorker(body, [
    groqResponse(entriesFor(body, undefined, { 1: { analysis: invalid } })),
    groqResponse(entriesFor(body, [1], { 1: { analysis: invalid } }))
  ]);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /rangs 1\.$/);
});
