import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  buildGroqPayload,
  buildPowerPayload,
  buildPowerPrompt,
  buildVisionPrompt,
  callGroqVision,
  parseJsonContent,
  validateVisionResult,
  validateRawVisionResult,
  validateCatalog,
  resolveVisionResult,
  getVisionModel,
  isMockMode,
  normalizePowerValue,
  validatePowerResult,
  ROUTE,
  POWER_ROUTE,
  GROQ_ENDPOINT,
  STRATEGIES
} from "../workers/msf-war-counter-vision/worker.js";

const catalog = [{ id: "AgentVenom", names: ["Agent Venom", "AgentVenom"] }];
const ids = new Set(["AgentVenom"]);
const rawResult = {
  schemaVersion: "2.1.0",
  slots: ["left-1","left-2","left-3","left-4","left-5","right-1","right-2","right-3","right-4","right-5"].map((slot) => ({
    slot,
    barred: false,
    candidates: [{ name: "Agent Venom", confidence: 0.5 }]
  }))
};
const validResult = {
  schemaVersion: "2.0.0",
  slots: rawResult.slots.map((slot) => ({ slot: slot.slot, barred: slot.barred, candidates: [{ characterId: "AgentVenom", confidence: 0.5 }] }))
};

test("payload Vision utilise la planche de portraits", () => {
  assert.equal(getVisionModel({}), "qwen/qwen3.6-27b");
  assert.deepEqual(STRATEGIES, ["grouped_wide_crops"]);
  const prompt = buildVisionPrompt("grouped_wide_crops");
  assert.match(prompt, /2 rangées de 5 cases/);
  assert.match(prompt, /left-1,left-2,left-3,left-4,left-5/);
  const payload = buildGroqPayload({ env: { GROQ_VISION_MODEL: "custom/vision" }, imageDataUrl: "data:image/jpeg;base64,AA==", strategy: "grouped_wide_crops" });
  assert.equal(payload.model, "custom/vision");
  assert.equal(payload.messages[0].content[1].type, "image_url");
  assert.deepEqual(payload.response_format, { type: "json_object" });
  assert.equal(payload.reasoning_effort, "none");
  assert.equal(payload.temperature, 0.2);
  assert.equal(payload.max_completion_tokens, 1200);
  assert.doesNotMatch(payload.messages[0].content[0].text, /AgentVenom/);
});

test("payload puissance lit uniquement les deux nombres jaunes", () => {
  const prompt = buildPowerPrompt();
  assert.match(prompt, /nombre jaune/);
  assert.match(prompt, /Ignore totalement le pseudo/);
  assert.match(prompt, /score de guerre/);
  const payload = buildPowerPayload({
    env: { GROQ_VISION_MODEL: "custom/vision" },
    leftImageDataUrl: "data:image/jpeg;base64,AA==",
    rightImageDataUrl: "data:image/jpeg;base64,AQ=="
  });
  assert.equal(payload.model, "custom/vision");
  assert.equal(payload.temperature, 0);
  assert.equal(payload.max_completion_tokens, 180);
  assert.equal(payload.messages[0].content.filter((item) => item.type === "image_url").length, 2);
});

test("normalisation et validation des puissances restent strictes", () => {
  assert.equal(normalizePowerValue("14 376 435"), "14376435");
  assert.equal(normalizePowerValue("5.876.484"), "5876484");
  assert.equal(normalizePowerValue(18040836), "18040836");
  assert.equal(normalizePowerValue(null), null);
  assert.throws(() => normalizePowerValue("12M"), /Puissance invalide/);
  assert.deepEqual(
    validatePowerResult({
      schemaVersion: "1.0.0",
      leftPower: "5 876 484",
      rightPower: "14376435"
    }),
    {
      schemaVersion: "1.0.0",
      leftPower: "5876484",
      rightPower: "14376435"
    }
  );
});

test("parse le JSON brut, entouré de markdown ou de texte", () => {
  const json = JSON.stringify(rawResult);
  assert.deepEqual(parseJsonContent(json), rawResult);
  assert.deepEqual(parseJsonContent("```json\n" + json + "\n```"), rawResult);
  assert.deepEqual(parseJsonContent("Résultat:\n" + json + "\nFin"), rawResult);
  assert.throws(() => parseJsonContent("pas de json"), /JSON Groq invalide/);
});

test("verrou R1 explicite", () => {
  assert.equal(isMockMode({ R1_MOCK_ONLY: "true" }), true);
  assert.equal(isMockMode({ R1_MOCK_ONLY: "false" }), false);
});

test("catalogue, réponse brute et résolution locale", () => {
  const validatedCatalog = validateCatalog([{ id: "AgentVenom", name: "Agent Venom", aliases: ["AgentVenom"] }]);
  assert.deepEqual(validatedCatalog, catalog);
  assert.equal(validateRawVisionResult(rawResult), true);
  assert.deepEqual(resolveVisionResult(rawResult, catalog), validResult);
  assert.equal(validateVisionResult(validResult, ids), true);
});

test("nom inconnu conservé comme non résolu", () => {
  const result = structuredClone(rawResult);
  result.slots[0].candidates[0].name = "Batman";
  const resolved = resolveVisionResult(result, catalog);
  assert.deepEqual(resolved.slots[0].candidates, []);
});

test("JSON invalide simulé", async () => {
  await assert.rejects(() => callGroqVision({ env: { GROQ_API_KEY: "x" }, payload: {}, fetchImpl: async () => Response.json({ choices: [{ message: { content: "pas de json" } }] }) }), /JSON Groq invalide/);
});

function powerFormRequest() {
  const form = new FormData();
  form.set("leftImage", new File(["left"], "left.jpg", { type: "image/jpeg" }));
  form.set("rightImage", new File(["right"], "right.jpg", { type: "image/jpeg" }));
  return new Request(`https://x${POWER_ROUTE}`, {
    method: "POST",
    headers: { Origin: "https://keryas777.github.io" },
    body: form
  });
}

function formRequest({ confirmed = true, strategy = "grouped_wide_crops" } = {}) {
  const form = new FormData();
  form.set("image", new File(["x"], "x.jpg", { type: "image/jpeg" }));
  form.set("strategy", strategy);
  form.set("layout", "war-result-ultrawide-v1");
  form.set("catalog", JSON.stringify([{ id: "AgentVenom", name: "Agent Venom", aliases: ["AgentVenom"] }]));
  if (confirmed) form.set("confirmed", "one-real-call");
  return new Request(`https://x${ROUTE}`, { method: "POST", headers: { Origin: "https://keryas777.github.io" }, body: form });
}

test("ancienne stratégie full_capture refusée", async () => {
  const response = await worker.fetch(formRequest({ strategy: "full_capture" }), { R1_MOCK_ONLY: "false" });
  assert.equal(response.status, 400);
});

test("confirmation explicite requise", async () => {
  const response = await worker.fetch(formRequest({ confirmed: false }), { R1_MOCK_ONLY: "false" });
  assert.equal(response.status, 400);
});

test("verrou R1 bloque R3 sans appel", async () => {
  const response = await worker.fetch(formRequest(), { R1_MOCK_ONLY: "true" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).groqRealCalls, 0);
});

test("R3 effectue exactement un appel simulé sur la planche", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: JSON.stringify(rawResult) } }], usage: { total_tokens: 42 } });
  };
  try {
    const response = await worker.fetch(formRequest(), { R1_MOCK_ONLY: "false", GROQ_API_KEY: "secret" });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.provider, "groq");
    assert.equal(body.result.strategy, "grouped_wide_crops");
    assert.equal(body.result.groqRealCalls, 1);
    assert.equal(body.result.slots[0].candidates[0].characterId, "AgentVenom");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("route puissance effectue un seul appel Groq et renvoie les deux valeurs", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            schemaVersion: "1.0.0",
            leftPower: "5 876 484",
            rightPower: "14376435"
          })
        }
      }],
      usage: { total_tokens: 24 }
    });
  };

  try {
    const response = await worker.fetch(powerFormRequest(), {
      R1_MOCK_ONLY: "false",
      GROQ_API_KEY: "secret"
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.leftPower, "5876484");
    assert.equal(body.result.rightPower, "14376435");
    assert.equal(body.result.groqRealCalls, 1);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("route puissance refuse un crop manquant", async () => {
  const form = new FormData();
  form.set("leftImage", new File(["left"], "left.jpg", { type: "image/jpeg" }));
  const request = new Request(`https://x${POWER_ROUTE}`, {
    method: "POST",
    headers: { Origin: "https://keryas777.github.io" },
    body: form
  });
  const response = await worker.fetch(request, { R1_MOCK_ONLY: "false" });
  assert.equal(response.status, 400);
});

test("endpoint dédié", () => assert.match(GROQ_ENDPOINT, /api\.groq\.com/));
