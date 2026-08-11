import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import worker from "../workers/msf-war-ocr/worker.js";

const workerSource = await readFile(
  new URL("../workers/msf-war-ocr/worker.js", import.meta.url),
  "utf8"
);

const PUBLISH_ROUTE = "/api/war/parse-gemini";
const DRAFT_ROUTE = "/api/war/parse-gemini-draft";
const ALLOWED_ORIGIN = "https://keryas777.github.io";
const TEST_DATE = "2026-08-02";
const TEST_MODEL = "gemini-test-model";

const geminiPlayers = Array.from({ length: 24 }, (_, index) => ({
  row_index: index + 1,
  name: index === 0 ? "Joueur 1 [MOI]" : `Joueur ${index + 1}`,
  alliance: null,
  attack_points: index === 0 ? "13 000" : 12000 - index,
  attacks: 14,
  damage: 1_000_000_000 + index,
  defense_wins: index % 3,
  defense_bonus: index % 2
}));

const publishGeminiText = JSON.stringify({
  ok: true,
  alliance: "zeus",
  players: geminiPlayers
});

function buildDraftGeminiText(detection = {}) {
  return JSON.stringify({
    ok: true,
    detected_alliance: detection.value === undefined ? "LoSP Kronos" : detection.value,
    detected_alliance_label: detection.label === undefined ? "Kronos" : detection.label,
    detection_confident: detection.confident === undefined ? true : detection.confident,
    players: geminiPlayers
  });
}

function createRequest(route, overrides = {}) {
  const options = {
    alliance: route === PUBLISH_ROUTE ? "zeus" : null,
    warDate: TEST_DATE,
    includeImage: true,
    origin: ALLOWED_ORIGIN,
    ...overrides
  };
  const formData = new FormData();

  if (options.alliance !== null) {
    formData.append("alliance", options.alliance);
  }

  if (options.warDate !== null) {
    formData.append("war_date", options.warDate);
  }

  if (options.includeImage) {
    formData.append(
      "image",
      new File(["fake-image"], "war.png", { type: "image/png" })
    );
  }

  const headers = {};
  if (options.origin !== null) headers.Origin = options.origin;

  return new Request(`https://worker.test${route}`, {
    method: "POST",
    headers,
    body: formData
  });
}

function createFetchMock({ allowGitHub = false, detection } = {}) {
  const calls = [];

  async function fetchMock(url, options = {}) {
    const href = String(url);
    const method = options.method || "GET";
    const call = { href, method, options, prompt: "" };
    calls.push(call);

    if (href.startsWith("https://generativelanguage.googleapis.com/")) {
      const payload = JSON.parse(options.body);
      call.prompt = payload.contents[0].parts.find((part) => part.text)?.text || "";
      const autoDetection = call.prompt.includes('"detected_alliance"');

      return Response.json({
        candidates: [
          {
            content: {
              parts: [{
                text: autoDetection
                  ? buildDraftGeminiText(detection)
                  : publishGeminiText
              }]
            }
          }
        ]
      });
    }

    if (href.startsWith("https://api.github.com/")) {
      assert.equal(allowGitHub, true, "la route brouillon ne doit jamais joindre GitHub");

      if (method === "GET") return new Response("Not found", { status: 404 });
      if (method === "PUT") {
        return Response.json({ commit: { sha: "test-commit-sha" } });
      }
    }

    throw new Error(`Appel réseau inattendu dans le test : ${method} ${href}`);
  }

  return { calls, fetchMock };
}

async function runRoute(route, requestOptions = {}, fetchOptions = {}) {
  const originalFetch = globalThis.fetch;
  const { calls, fetchMock } = createFetchMock(fetchOptions);
  globalThis.fetch = fetchMock;

  try {
    const response = await worker.fetch(
      createRequest(route, requestOptions),
      {
        GEMINI_API_KEY: "test-only",
        GEMINI_MODEL: TEST_MODEL,
        GITHUB_OWNER: "test-owner",
        GITHUB_REPO: "test-repo",
        GITHUB_BRANCH: "main",
        GITHUB_TOKEN: "test-only"
      }
    );
    const data = await response.json();

    return { response, data, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function networkCalls(calls, prefix) {
  return calls.filter(({ href }) => href.startsWith(prefix));
}

test("la route historique conserve son prompt, son alliance obligatoire et sa publication", async () => {
  const { response, data, calls } = await runRoute(
    PUBLISH_ROUTE,
    {},
    { allowGitHub: true }
  );
  const geminiCall = networkCalls(calls, "https://generativelanguage.googleapis.com/")[0];

  assert.equal(response.status, 200);
  assert.match(geminiCall.prompt, /Alliance attendue : Zeus\./);
  assert.doesNotMatch(geminiCall.prompt, /detected_alliance/);
  assert.deepEqual(
    networkCalls(calls, "https://api.github.com/").map(({ method }) => method),
    ["GET", "PUT"]
  );
  assert.equal(data.alliance, "zeus");
  assert.equal(data.github.committed, true);
  assert.equal(data.github.commit_sha, "test-commit-sha");
  assert.equal("published" in data, false);

  const missingAlliance = await runRoute(PUBLISH_ROUTE, { alliance: null });
  assert.equal(missingAlliance.response.status, 400);
  assert.equal(missingAlliance.data.error, "Alliance manquante");
  assert.equal(missingAlliance.calls.length, 0);

  const publishingHandler = workerSource.slice(
    workerSource.indexOf("async function handleWarParseGemini(request, env, options)"),
    workerSource.length
  );
  assert.match(publishingHandler, /await upsertFileToGitHub\(/);
});

test("les prompts OCR gardent la correction des dégâts tronqués locale à chaque ligne", async () => {
  const publish = await runRoute(PUBLISH_ROUTE, {}, { allowGitHub: true });
  const draft = await runRoute(DRAFT_ROUTE);
  const prompts = [publish, draft].map(({ calls }) =>
    networkCalls(calls, "https://generativelanguage.googleapis.com/")[0].prompt
  );

  for (const prompt of prompts) {
    assert.match(prompt, /décision ligne par ligne/);
    assert.match(prompt, /tronquée ne doit JAMAIS influencer les autres lignes/);
    assert.match(prompt, /N'ajoute jamais un 0 par cohérence avec une autre ligne/);
    assert.match(prompt, /inférieure à 1 000 000 000 ne doit JAMAIS recevoir un 0 final/);
    assert.match(prompt, /666 581 432 -> 666581432/);
    assert.match(prompt, /652 410 282 -> 652410282/);
    assert.match(prompt, /1 003 207 03 -> 1003207030/);
    assert.match(prompt, /1 380 357 878 -> 1380357878 sans rien ajouter/);
  }
});

test("la route brouillon détecte et normalise l’alliance sans champ alliance", async () => {
  const { response, data, calls } = await runRoute(DRAFT_ROUTE);
  const geminiCalls = networkCalls(calls, "https://generativelanguage.googleapis.com/");

  assert.equal(response.status, 200);
  assert.equal(geminiCalls.length, 1);
  assert.match(geminiCalls[0].prompt, /Zeus.*"zeus"/);
  assert.match(geminiCalls[0].prompt, /Athéna ou Athena.*"athena"/);
  assert.match(geminiCalls[0].prompt, /Kronos, Cronos, Chronos ou LoSP Kronos.*"kronos"/);
  assert.match(geminiCalls[0].prompt, /Dionysos.*"dionysos"/);
  assert.match(geminiCalls[0].prompt, /Poséidon ou Poseidon.*"poseidon"/);
  assert.match(geminiCalls[0].prompt, /Hadès ou Hades.*"hades"/);
  assert.equal(networkCalls(calls, "https://api.github.com/").length, 0);
  assert.equal(data.ok, true);
  assert.equal(data.published, false);
  assert.equal(data.detected_alliance, "kronos");
  assert.equal(data.detected_alliance_label, "Kronos");
  assert.equal(data.detection_confident, true);
  assert.equal(data.requires_alliance_confirmation, false);
  assert.equal(data.alliance, "kronos");
  assert.equal(data.draft.alliance, "kronos");
  assert.equal(data.draft.date, TEST_DATE);
  assert.equal(data.draft.source, TEST_MODEL);
  assert.equal(data.draft.players.length, 24);
  assert.equal(data.players[0].alliance, "kronos");
  assert.equal(data.players[0].name, "Joueur 1");
  assert.equal(data.players[0].attack_points, 13000);
  assert.equal("github" in data, false);
  assert.equal("export_payload" in data, false);

  const draftRoute = workerSource.slice(
    workerSource.indexOf(
      'if (request.method === "POST" && url.pathname === "/api/war/parse-gemini-draft")'
    ),
    workerSource.indexOf('return new Response("Worker OK')
  );
  assert.match(draftRoute, /publish: false,\s*detectAlliance: true/);
  assert.doesNotMatch(draftRoute, /upsertFileToGitHub/);
});

test("une détection incertaine retourne le brouillon complet à confirmer manuellement", async () => {
  const { response, data, calls } = await runRoute(
    DRAFT_ROUTE,
    {},
    {
      detection: {
        value: null,
        label: null,
        confident: false
      }
    }
  );

  assert.equal(response.status, 200);
  assert.equal(networkCalls(calls, "https://api.github.com/").length, 0);
  assert.equal(data.ok, true);
  assert.equal(data.published, false);
  assert.equal(data.detected_alliance, null);
  assert.equal(data.detected_alliance_label, null);
  assert.equal(data.detection_confident, false);
  assert.equal(data.requires_alliance_confirmation, true);
  assert.equal(data.alliance, null);
  assert.equal(data.draft.alliance, null);
  assert.equal(data.draft.players.length, 24);
  assert.equal(data.players[0].alliance, null);
});

test("la détection réutilise toutes les variantes de normalizeAlliance", async () => {
  const cases = [
    ["ZEUS", "zeus", "Zeus"],
    ["Athéna", "athena", "Athéna"],
    ["Cronos", "kronos", "Kronos"],
    ["Chronos", "kronos", "Kronos"],
    ["LoSP Kronos", "kronos", "Kronos"],
    ["DIONYSOS", "dionysos", "Dionysos"],
    ["Poséidon", "poseidon", "Poséidon"],
    ["Hadès", "hades", "Hadès"]
  ];

  for (const [input, key, label] of cases) {
    const { data } = await runRoute(DRAFT_ROUTE, {}, {
      detection: { value: input, label: input, confident: true }
    });
    assert.equal(data.detected_alliance, key, input);
    assert.equal(data.detected_alliance_label, label, input);
  }
});

test("la route brouillon conserve les validations de date et d’image sans exiger l’alliance", async () => {
  const withoutAlliance = await runRoute(DRAFT_ROUTE, { alliance: null });
  assert.equal(withoutAlliance.response.status, 200);
  assert.equal(withoutAlliance.data.published, false);

  const cases = [
    { name: "date manquante", options: { warDate: null } },
    { name: "date invalide", options: { warDate: "02/08/2026" } },
    { name: "image manquante", options: { includeImage: false } }
  ];

  for (const validationCase of cases) {
    const draft = await runRoute(DRAFT_ROUTE, validationCase.options);
    assert.equal(draft.response.status, 400, validationCase.name);
    assert.equal(draft.data.published, false, validationCase.name);
    assert.equal(draft.calls.length, 0, validationCase.name);
  }
});

test("le CORS brouillon autorise uniquement l’origine GitHub Pages", async () => {
  const allowed = await runRoute(DRAFT_ROUTE);
  const denied = await runRoute(DRAFT_ROUTE, { origin: "https://example.com" });

  assert.equal(allowed.response.status, 200);
  assert.equal(denied.response.status, 200);
  assert.equal(
    allowed.response.headers.get("Access-Control-Allow-Origin"),
    ALLOWED_ORIGIN
  );
  assert.equal(allowed.response.headers.get("Vary"), "Origin");
  assert.equal(allowed.response.headers.has("Access-Control-Allow-Credentials"), false);
  assert.equal(denied.response.headers.has("Access-Control-Allow-Origin"), false);
  assert.equal(denied.response.headers.has("Vary"), false);
  assert.equal(denied.response.headers.has("Access-Control-Allow-Credentials"), false);
});

test("la page historique conserve sa route de publication", () => {
  const uploadPage = workerSource.slice(
    workerSource.indexOf("function getUploadPage()"),
    workerSource.indexOf("function arrayBufferToBase64")
  );

  assert.match(uploadPage, /fetch\("\/api\/war\/parse-gemini"/);
  assert.doesNotMatch(uploadPage, /parse-gemini-draft/);
});
