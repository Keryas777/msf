import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  buildGroqPayload,
  callGroqVision,
  validateVisionResult,
  validateCatalog,
  getVisionModel,
  isMockMode,
  ROUTE,
  GROQ_ENDPOINT
} from "../workers/msf-war-counter-vision/worker.js";

const catalog = [{ id: "AgentVenom", name: "Agent Venom" }];
const ids = new Set(["AgentVenom"]);
const validResult = {
  schemaVersion: "2.0.0",
  slots: ["left-1","left-2","left-3","left-4","left-5","right-1","right-2","right-3","right-4","right-5"].map((slot) => ({
    slot,
    barred: false,
    candidates: [{ characterId: "AgentVenom", confidence: 0.5 }]
  }))
};

test("payload Vision image et modèle configurable", () => {
  assert.equal(getVisionModel({}), "qwen/qwen3.6-27b");
  const payload = buildGroqPayload({ env: { GROQ_VISION_MODEL: "custom/vision" }, imageDataUrl: "data:image/jpeg;base64,AA==", catalog });
  assert.equal(payload.model, "custom/vision");
  assert.equal(payload.messages[0].content[1].type, "image_url");
  assert.equal(payload.response_format.type, "json_object");
});

test("verrou R1 explicite", () => {
  assert.equal(isMockMode({ R1_MOCK_ONLY: "true" }), true);
  assert.equal(isMockMode({ R1_MOCK_ONLY: "false" }), false);
});

test("catalogue et réponse stricts", () => {
  assert.deepEqual(validateCatalog(catalog), catalog);
  assert.equal(validateVisionResult(validResult, ids), true);
});

test("hors catalogue refusé", () => {
  const result = structuredClone(validResult);
  result.slots[0].candidates[0].characterId = "Batman";
  assert.throws(() => validateVisionResult(result, ids), /hors catalogue/);
});

test("JSON invalide simulé", async () => {
  await assert.rejects(() => callGroqVision({
    env: { GROQ_API_KEY: "x" },
    payload: {},
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
  }), /vide/);
});

function formRequest({ confirmed = true } = {}) {
  const form = new FormData();
  form.set("image", new File(["x"], "x.jpg", { type: "image/jpeg" }));
  form.set("strategy", "full_capture");
  form.set("layout", "war-result-ultrawide-v1");
  form.set("catalog", JSON.stringify(catalog));
  if (confirmed) form.set("confirmed", "one-real-call");
  return new Request(`https://x${ROUTE}`, { method: "POST", headers: { Origin: "https://keryas777.github.io" }, body: form });
}

test("confirmation explicite requise", async () => {
  const response = await worker.fetch(formRequest({ confirmed: false }), { R1_MOCK_ONLY: "false" });
  assert.equal(response.status, 400);
});

test("verrou R1 bloque R3 sans appel", async () => {
  const response = await worker.fetch(formRequest(), { R1_MOCK_ONLY: "true" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).groqRealCalls, 0);
});

test("R3 effectue exactement un appel simulé", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: JSON.stringify(validResult) } }], usage: { total_tokens: 42 } });
  };
  try {
    const response = await worker.fetch(formRequest(), { R1_MOCK_ONLY: "false", GROQ_API_KEY: "secret" });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.provider, "groq");
    assert.equal(body.result.groqRealCalls, 1);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("endpoint dédié", () => assert.match(GROQ_ENDPOINT, /api\.groq\.com/));
