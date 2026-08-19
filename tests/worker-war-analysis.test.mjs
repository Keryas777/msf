import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker, {
  WAR_ANALYSIS_MODEL,
  WORKERS_AI_ANALYSES_RESPONSE_FORMAT,
  buildAnalysisPrompt,
  getGlobalPerformanceSentence,
  getGlobalToneCeiling
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

function workersAiResult(analyses) {
  return { analyses };
}

async function callWorker(body, responders, envOverride = {}) {
  const calls = [];
  const AI = {
    async run(model, payload) {
      calls.push({ model, ...payload });
      const responder = responders[calls.length - 1];
      if (responder instanceof Error) throw responder;
      return typeof responder === "function" ? responder(calls.at(-1)) : responder;
    }
  };
  const response = await worker.fetch(new Request("https://worker.test/api/war/write-analyses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }), { AI, ...envOverride });
  return { response, calls };
}

test("le preflight War Admin autorise les trois routes sans exécuter leur métier", async () => {
  const aiCalls = [];
  const networkCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    networkCalls.push(args);
    throw new Error("Aucun appel réseau attendu pendant un preflight");
  };

  try {
    for (const path of [
      "/api/war/parse-gemini-draft",
      "/api/war/write-analyses",
      "/api/war/publish-report"
    ]) {
      const response = await worker.fetch(new Request(`https://worker.test${path}`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://keryas777.github.io",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type"
        }
      }), {
        AI: { run: async (...args) => aiCalls.push(args) }
      });

      assert.equal(response.status, 204, path);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://keryas777.github.io", path);
      assert.deepEqual(response.headers.get("Access-Control-Allow-Methods").split(/,\s*/), ["POST", "OPTIONS"], path);
      assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type", path);
      assert.equal(response.headers.get("Vary"), "Origin", path);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(aiCalls.length, 0);
  assert.equal(networkCalls.length, 0);
});

test("un POST write-analyses conserve son comportement après un preflight valide", async () => {
  const body = requestBody(1);
  const preflight = await worker.fetch(new Request("https://worker.test/api/war/write-analyses", {
    method: "OPTIONS",
    headers: {
      Origin: "https://keryas777.github.io",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  }), {});
  const { response, calls } = await callWorker(body, [workersAiResult(entriesFor(body))]);

  assert.equal(preflight.status, 204);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(await response.json(), { analyses: entriesFor(body) });
});

function promptBody(call) {
  return JSON.parse(call.messages[0].content.split("\n\n").at(-1));
}

function assertWorkersAiAnalysisResponseFormat(responseFormat) {
  assert.equal(responseFormat.type, "json_schema");
  assert.equal("strict" in responseFormat, false);
  assert.equal("strict" in responseFormat.json_schema, false);

  const schema = responseFormat.json_schema.schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["analyses"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.analyses.type, "array");

  const itemSchema = schema.properties.analyses.items;
  assert.equal(itemSchema.type, "object");
  assert.deepEqual(itemSchema.required, ["rank", "name", "analysis"]);
  assert.equal(itemSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(itemSchema.properties).sort(), ["analysis", "name", "rank"]);
  assert.equal(itemSchema.properties.rank.type, "integer");
  assert.equal(itemSchema.properties.name.type, "string");
  assert.equal(itemSchema.properties.analysis.type, "string");
}

test("24 analyses valides utilisent un seul appel et conservent le contrat", async () => {
  const body = requestBody();
  const { response, calls } = await callWorker(body, [workersAiResult(entriesFor(body))]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(await response.clone().json()), ["analyses"]);
  assert.equal((await response.json()).analyses.length, 24);
  assert.equal(calls[0].model, WAR_ANALYSIS_MODEL);
  assert.equal(calls[0].model, "@cf/meta/llama-4-scout-17b-16e-instruct");
  assert.equal(calls[0].temperature, 0.55);
  assert.equal(calls[0].max_tokens, 10000);
  assertWorkersAiAnalysisResponseFormat(calls[0].response_format);
});

test("les traces de diagnostic n’exposent ni payload, ni prompt, ni secret", async () => {
  const secret = "SECRET_TOKEN_NE_DOIT_PAS_ETRE_LOGGE";
  const body = requestBody(1, { 1: secret });
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => logs.push(values);
  console.error = (...values) => logs.push(values);

  try {
    const { response, calls } = await callWorker(body, [workersAiResult(entriesFor(body))], {
      API_TOKEN: secret
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(secret), false);
  assert.equal(serializedLogs.includes("messages"), false);
  assert.equal(serializedLogs.includes("Authorization"), false);
  assert.match(serializedLogs, /WAR_ANALYSIS_REQUEST_START/);
  assert.match(serializedLogs, /WAR_ANALYSIS_AI_SUCCESS/);
  assert.match(serializedLogs, /WAR_ANALYSIS_RESPONSE/);
});

test("23 valides et 1 manquante complètent uniquement le rang absent", async () => {
  const body = requestBody();
  const initialRanks = body.report.players.map(({ rank }) => rank).filter((rank) => rank !== 17);
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, initialRanks)),
    workersAiResult(entriesFor(body, [17]))
  ]);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.analyses.map(({ rank }) => rank), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [17]);
  assert.deepEqual(promptBody(calls[1]).report.ranking.map(({ rank }) => rank), [17]);
  assert.equal(promptBody(calls[1]).report.summary.player_count, 1);
  assert.equal(calls[1].messages[0].content.includes('"name":"Joueur 1"'), false);
  assert.match(calls[1].messages[0].content, /requête de complétion, et aucun autre joueur/);
  assertWorkersAiAnalysisResponseFormat(calls[1].response_format);
  assert.deepEqual(calls[1].response_format, calls[0].response_format);
});

test("le chemin Workers AI ne contient pas l’ancien JSON Object Mode", async () => {
  const source = await readFile(new URL("../workers/msf-war-ocr/worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /type:\s*["']json_object["']/);
});

test("20 valides et 4 manquantes n’envoient que ces quatre joueurs", async () => {
  const body = requestBody();
  const missing = [3, 8, 19, 24];
  const kept = body.report.players.map(({ rank }) => rank).filter((rank) => !missing.includes(rank));
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, kept)),
    workersAiResult(entriesFor(body, missing))
  ]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), missing);
  assert.equal(promptBody(calls[1]).report.summary.player_count, 4);
  assert.equal(calls[1].messages[0].content.includes('"name":"Joueur 1"'), false);
});

test("un mauvais pseudo invalide seulement son rang", async () => {
  const body = requestBody(3);
  const first = entriesFor(body, undefined, { 2: { name: "Intrus" } });
  const { response, calls } = await callWorker(body, [workersAiResult(first), workersAiResult(entriesFor(body, [2]))]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
});

test("une analyse vide est demandée en complétion", async () => {
  const body = requestBody(3);
  const first = entriesFor(body, undefined, { 2: { analysis: "   " } });
  const { response, calls } = await callWorker(body, [workersAiResult(first), workersAiResult(entriesFor(body, [2]))]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
});

test("des clés incorrectes invalident seulement leur rang", async () => {
  const body = requestBody(3);
  const malformed = entriesFor(body);
  malformed[1] = { ...malformed[1], extra: true };
  const { response, calls } = await callWorker(body, [
    workersAiResult(malformed),
    workersAiResult(entriesFor(body, [2]))
  ]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
});

test("un rang inconnu est ignoré sans invalider les rangs valides", async () => {
  const body = requestBody(3);
  const initial = [...entriesFor(body, [1, 2]), { rank: 99, name: "Intrus", analysis: COMMENT }];
  const { response, calls } = await callWorker(body, [
    workersAiResult(initial),
    workersAiResult(entriesFor(body, [3]))
  ]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [3]);
});

test("un doublon de nom invalide seulement les deux entrées ambiguës", async () => {
  const body = requestBody(3);
  const initial = entriesFor(body);
  initial[1] = { ...initial[1], name: initial[0].name };
  const { response, calls } = await callWorker(body, [
    workersAiResult(initial),
    workersAiResult(entriesFor(body, [1, 2]))
  ]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [1, 2]);
  assert.equal(calls[1].messages[0].content.includes('"name":"Joueur 3"'), false);
});

test("le texte GPT-OSS validé est retourné exactement, sans préfixe automatique", async () => {
  const body = requestBody(1);
  const comment = `Il a réalisé une très bonne performance. ${COMMENT}`;
  const { response, calls } = await callWorker(body, [workersAiResult(entriesFor(body, [1], { 1: { analysis: comment } }))]);
  assert.equal(calls.length, 1);
  assert.equal((await response.json()).analyses[0].analysis, comment);
});

test("une mention interdite non nettoyable entraîne la complétion du rang", async () => {
  const body = requestBody(2);
  const forbidden = "Son score total reflète dix attaques victorieuses et une forte activité.";
  const first = entriesFor(body, undefined, { 1: { analysis: forbidden } });
  const { response, calls } = await callWorker(body, [workersAiResult(first), workersAiResult(entriesFor(body, [1]))]);
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [1]);
});

test("un doublon de rang est écarté sans perdre les autres rangs", async () => {
  const body = requestBody(3);
  const initial = [...entriesFor(body), { ...entriesFor(body, [2])[0], analysis: "Avec neuf attaques réussies, son impact offensif est resté important." }];
  const { response, calls } = await callWorker(body, [workersAiResult(initial), workersAiResult(entriesFor(body, [2]))]);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [2]);
  assert.deepEqual(result.analyses.map(({ rank }) => rank), [1, 2, 3]);
});

test("la fusion réussie reste triée et sans doublon", async () => {
  const body = requestBody(4);
  const { response } = await callWorker(body, [
    workersAiResult(entriesFor(body, [4, 2])),
    workersAiResult(entriesFor(body, [3, 1]))
  ]);
  const analyses = (await response.json()).analyses;
  assert.deepEqual(analyses.map(({ rank }) => rank), [1, 2, 3, 4]);
  assert.equal(new Set(analyses.map(({ name }) => name)).size, 4);
});

test("une complétion incomplète liste précisément les rangs encore absents", async () => {
  const body = requestBody(4);
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, [1])),
    workersAiResult(entriesFor(body, [2]))
  ]);
  assert.equal(calls.length, 2);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /rangs 3, 4\.$/);
});

function workersAiError(code, message = `Workers AI error ${code}`, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

for (const code of [3007, 3008, 3040]) {
  test(`Workers AI ${code} est temporaire et retryable`, async () => {
    const { response, calls } = await callWorker(requestBody(1), [workersAiError(code)]);
    const data = await response.json();
    assert.equal(calls.length, 1);
    assert.equal(response.status, 503);
    assert.equal(data.code, "WORKERS_AI_TEMPORARY");
    assert.equal(data.provider_code, code);
    assert.equal(data.retry_after_seconds, 60);
  });
}

test("Workers AI respecte un retry_after_seconds fournisseur exploitable", async () => {
  const { response } = await callWorker(requestBody(1), [workersAiError(3040, "capacity", { retryAfterSeconds: 17.2 })]);
  assert.equal((await response.json()).retry_after_seconds, 18);
});

test("Workers AI 3036 expose la limite quotidienne sans faux délai", async () => {
  const { response } = await callWorker(requestBody(1), [workersAiError(3036)]);
  const data = await response.json();
  assert.equal(response.status, 429);
  assert.equal(data.code, "WORKERS_AI_DAILY_LIMIT");
  assert.equal("retry_after_seconds" in data, false);
});

for (const code of [400, 403]) {
  test(`Workers AI ${code} reste non retryable`, async () => {
    const { response } = await callWorker(requestBody(1), [workersAiError(code)]);
    assert.equal((await response.json()).code, "WORKERS_AI_ERROR");
  });
}

test("un binding Workers AI absent est une erreur non retryable", async () => {
  const body = requestBody(1);
  const response = await worker.fetch(new Request("https://worker.test/api/war/write-analyses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }), {});
  assert.equal((await response.json()).code, "WORKERS_AI_ERROR");
});

test("une réponse Workers AI vide est une erreur non retryable", async () => {
  const { response } = await callWorker(requestBody(1), [null]);
  assert.equal((await response.json()).code, "WORKERS_AI_ERROR");
});

test("une réponse Workers AI JSON invalide est une erreur non retryable", async () => {
  const { response } = await callWorker(requestBody(1), [{ response: "pas du JSON" }]);
  assert.equal((await response.json()).code, "WORKERS_AI_ERROR");
});

test("le prompt transmis est exactement le prompt partagé de production", async () => {
  const body = requestBody(1);
  const { calls } = await callWorker(body, [workersAiResult(entriesFor(body))]);
  assert.equal(calls[0].messages[0].content, buildAnalysisPrompt(body, false));
  assert.deepEqual(calls[0].messages.map(({ role }) => role), ["user"]);
});

test("la production ne dépend plus de Groq pour la rédaction", async () => {
  const source = await readFile(new URL("../workers/msf-war-ocr/worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /api\.groq\.com|GROQ_API_KEY|GROQ_MODEL|requestGroqAnalyses|GROQ_RATE_LIMIT|GROQ_GENERATION_RETRY/);
  assert.match(source, /env\.AI/);
});

test("la ponctuation du pseudo reste ignorée dans le comptage des phrases", async () => {
  const body = requestBody(1, { 1: "Tt!!Le Fléau !!" });
  const analysis = `Tt!!Le Fléau !! signe une très bonne guerre. ${COMMENT} Sa défense est restée solide.`;
  const { response } = await callWorker(body, [workersAiResult(entriesFor(body, [1], { 1: { analysis } }))]);
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
  const { response } = await callWorker(body, [workersAiResult(entriesFor(body, [1], { 1: { analysis: comment } }))]);
  const analysis = (await response.json()).analyses[0].analysis;
  assert.equal(response.status, 200);
  assert.equal((analysis.match(/[.!?]+(?=\s|$)/g) || []).length, 3);
});

test("quatre phrases invalident le rang puis une seule complétion est tentée", async () => {
  const body = requestBody(1);
  const invalid = "Il signe une très bonne guerre. Il a remporté dix attaques. Son efficacité a été maximale. Son impact offensif a été important.";
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, [1], { 1: { analysis: invalid } })),
    workersAiResult(entriesFor(body))
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
  const { calls } = await callWorker(body, [workersAiResult(entriesFor(body))]);
  assert.match(calls[0].messages[0].content, /"score_total":71,"global_tone_ceiling":"VERY_GOOD"/);
  assert.match(calls[0].messages[0].content, /plafond maximal et la tonalité globale cible/);
});

test("le prompt impose la cible exacte, préserve les sous-aspects et détaille l’auto-vérification", async () => {
  const body = requestBody(1);
  const { calls } = await callWorker(body, [workersAiResult(entriesFor(body))]);
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
  "Son score_total reflète son activité.",
  "Son score total reflète son activité.",
  "Il obtient un score de 71.",
  "Son score est élevé.",
  "Un score faible résume sa guerre.",
  "Sa note est excellente.",
  "Il reçoit une note de 71."
]) {
  test(`la mention directe « ${analysis} » invalide uniquement le rang`, async () => {
    const body = requestBody(2);
    const { response, calls } = await callWorker(body, [
      workersAiResult(entriesFor(body, undefined, { 1: { analysis } })),
      workersAiResult(entriesFor(body, [1]))
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
    workersAiResult(entriesFor(body, [1], { 1: { analysis } }))
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
      workersAiResult(entriesFor(body, [1], { 1: { analysis } })),
      workersAiResult(entriesFor(body, [1], { 1: { analysis: fallback } }))
    ]);
    assert.equal(response.status, 200);
    assert.equal(calls.length, accepted ? 1 : 2);
    assert.equal((await response.json()).analyses[0].analysis, accepted ? analysis : fallback);
  });
}

test("BeLZéBuT à 72 conserve la distinction entre guerre globale et efficacité", async () => {
  const body = requestBody(1, { 1: "BeLZéBuT" });
  body.report.players[0].score_total = 72;
  body.report.ranking[0].score = 72;
  const analysis = "BeLZéBuT réalise une très bonne guerre avec une efficacité exceptionnelle.";
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, [1], { 1: { analysis } }))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("Clo à 49 peut avoir une guerre mitigée avec une efficacité excellente", async () => {
  const body = requestBody(1, { 1: "Clo" });
  body.report.players[0].score_total = 49;
  body.report.ranking[0].score = 49;
  const analysis = "La guerre de Clo est mitigée avec une efficacité excellente.";
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, [1], { 1: { analysis } }))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("une analyse complète d’une phrase est acceptée", async () => {
  const body = requestBody(1);
  const analysis = "Une guerre très bonne et maîtrisée sur le plan offensif.";
  const { response, calls } = await callWorker(body, [workersAiResult(entriesFor(body, [1], { 1: { analysis } }))]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("une analyse de exactement 700 caractères est acceptée", async () => {
  const body = requestBody(1);
  const analysis = "Son activité offensive est restée régulière et maîtrisée ".repeat(13).slice(0, 699) + ".";
  assert.equal(analysis.length, 700);
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, [1], { 1: { analysis } }))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await response.json()).analyses[0].analysis.length, 700);
});

test("une analyse de plus de 700 caractères est rejetée individuellement", async () => {
  const body = requestBody(1);
  const invalid = `${"Une activité offensive régulière, ".repeat(22)}sans baisse notable.`;
  assert.ok(invalid.length > 700);
  const { response, calls } = await callWorker(body, [
    workersAiResult(entriesFor(body, [1], { 1: { analysis: invalid } })),
    workersAiResult(entriesFor(body))
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(promptBody(calls[1]).report.players.map(({ rank }) => rank), [1]);
});

test("23 analyses restent conservées et seule la tonalité trop forte est complétée", async () => {
  const body = requestBody();
  const initial = entriesFor(body, undefined, { 1: { analysis: "Excellente performance." } });
  const replacement = "Il a réalisé une très bonne guerre.";
  const { response, calls } = await callWorker(body, [
    workersAiResult(initial),
    workersAiResult(entriesFor(body, [1], { 1: { analysis: replacement } }))
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
    workersAiResult(entriesFor(body, undefined, { 1: { analysis: invalid } })),
    workersAiResult(entriesFor(body, [1], { 1: { analysis: invalid } }))
  ]);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /rangs 1\.$/);
});
