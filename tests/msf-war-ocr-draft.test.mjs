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
  alliance: "zeus",
  attack_points: index === 0 ? "13 000" : 12000 - index,
  attacks: 14,
  damage: 1_000_000_000 + index,
  defense_wins: index % 3,
  defense_bonus: index % 2
}));

const rawGeminiText = JSON.stringify({
  ok: true,
  alliance: "zeus",
  players: geminiPlayers
});

function createRequest(route, overrides = {}) {
  const options = {
    alliance: "zeus",
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
  if (options.origin !== null) {
    headers.Origin = options.origin;
  }

  return new Request(`https://worker.test${route}`, {
    method: "POST",
    headers,
    body: formData
  });
}

function createFetchMock({ allowGitHub = false } = {}) {
  const calls = [];

  async function fetchMock(url, options = {}) {
    const href = String(url);
    const method = options.method || "GET";
    calls.push({ href, method, options });

    if (href.startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: rawGeminiText }]
            }
          }
        ]
      });
    }

    if (href.startsWith("https://api.github.com/")) {
      assert.equal(allowGitHub, true, "la route brouillon ne doit jamais joindre GitHub");

      if (method === "GET") {
        return new Response("Not found", { status: 404 });
      }

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

test("la route historique publie toujours après un OCR réussi", async () => {
  const { response, data, calls } = await runRoute(
    PUBLISH_ROUTE,
    {},
    { allowGitHub: true }
  );

  assert.equal(response.status, 200);
  assert.equal(networkCalls(calls, "https://generativelanguage.googleapis.com/").length, 1);
  assert.deepEqual(
    networkCalls(calls, "https://api.github.com/").map(({ method }) => method),
    ["GET", "PUT"]
  );
  assert.equal(data.github.committed, true);
  assert.equal(data.github.commit_sha, "test-commit-sha");
  assert.equal("published" in data, false);

  const publishingHandler = workerSource.slice(
    workerSource.indexOf("async function handleWarParseGemini(request, env, options)"),
    workerSource.length
  );
  assert.match(publishingHandler, /await upsertFileToGitHub\(/);
});

test("la route brouillon n’appelle jamais GitHub et retourne published false", async () => {
  const { response, data, calls } = await runRoute(DRAFT_ROUTE);

  assert.equal(response.status, 200);
  assert.equal(networkCalls(calls, "https://generativelanguage.googleapis.com/").length, 1);
  assert.equal(networkCalls(calls, "https://api.github.com/").length, 0);
  assert.equal(data.ok, true);
  assert.equal(data.published, false);
  assert.equal("github" in data, false);
  assert.equal("export_payload" in data, false);
  assert.equal(data.draft.date, TEST_DATE);
  assert.equal(data.draft.alliance, "zeus");
  assert.equal(data.draft.source, TEST_MODEL);
  assert.equal(data.draft.players.length, 24);

  const draftRoute = workerSource.slice(
    workerSource.indexOf(
      'if (request.method === "POST" && url.pathname === "/api/war/parse-gemini-draft")'
    ),
    workerSource.indexOf('return new Response("Worker OK')
  );
  assert.match(
    draftRoute,
    /handleWarParseGemini\(request, env, \{ publish: false \}\)/
  );
  assert.doesNotMatch(draftRoute, /upsertFileToGitHub/);

  const sharedHandler = workerSource.slice(
    workerSource.indexOf("async function handleWarParseGemini(request, env, options)"),
    workerSource.length
  );
  assert.ok(
    sharedHandler.indexOf("if (!shouldPublish)") <
      sharedHandler.indexOf("await upsertFileToGitHub(")
  );
});

test("les deux routes retournent le même OCR normalisé avant publication", async () => {
  const published = await runRoute(PUBLISH_ROUTE, {}, { allowGitHub: true });
  const draft = await runRoute(DRAFT_ROUTE);
  const sharedKeys = [
    "ok",
    "model",
    "alliance",
    "alliance_label",
    "war_date",
    "counts",
    "players",
    "raw_gemini_text"
  ];

  for (const key of sharedKeys) {
    assert.deepEqual(draft.data[key], published.data[key], key);
  }

  assert.deepEqual(
    draft.data.draft.players,
    published.data.export_payload.json.players
  );
  assert.equal(draft.data.players[0].name, "Joueur 1");
  assert.equal(draft.data.players[0].attack_points, 13000);
});

test("les validations alliance, date et image restent identiques", async () => {
  const cases = [
    { name: "alliance manquante", options: { alliance: null } },
    { name: "alliance invalide", options: { alliance: "inconnue" } },
    { name: "date manquante", options: { warDate: null } },
    { name: "date invalide", options: { warDate: "02/08/2026" } },
    { name: "image manquante", options: { includeImage: false } }
  ];

  for (const validationCase of cases) {
    const published = await runRoute(PUBLISH_ROUTE, validationCase.options);
    const draft = await runRoute(DRAFT_ROUTE, validationCase.options);
    const draftWithoutPublished = { ...draft.data };
    delete draftWithoutPublished.published;

    assert.equal(published.response.status, 400, validationCase.name);
    assert.equal(draft.response.status, published.response.status, validationCase.name);
    assert.deepEqual(draftWithoutPublished, published.data, validationCase.name);
    assert.equal(draft.data.published, false, validationCase.name);
    assert.equal(published.calls.length, 0, validationCase.name);
    assert.equal(draft.calls.length, 0, validationCase.name);
  }
});

test("le CORS brouillon autorise uniquement l’origine GitHub Pages", async () => {
  const allowed = await runRoute(DRAFT_ROUTE);
  const denied = await runRoute(DRAFT_ROUTE, {
    origin: "https://example.com"
  });

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
