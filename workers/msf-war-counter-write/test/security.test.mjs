import test from "node:test";
import assert from "node:assert/strict";
import entryWorker, {
  constantTimeEqual,
  hasValidWriteKey,
  INTERNAL_KEY_AUTH_ME_PATH,
  WRITE_PATHS
} from "../index.js";

const WRITE_WORKER_ORIGIN = "https://msf-war-counter-write.deliriousfan7.workers.dev";
const AUTH_WORKER_ORIGIN = "https://losp-auth.deliriousfan7.workers.dev";

function batchRequest({ key = "secret-test", bearer = "stale-session" } = {}) {
  return new Request(`${WRITE_WORKER_ORIGIN}/api/war-counter-write/apply-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      "X-War-Counter-Write-Key": key
    },
    body: JSON.stringify({
      items: [{
        attackIds: ["A1"],
        defenseIds: ["D1"],
        attackPower: 100,
        defensePower: 100,
        metadata: {
          def_family: "Def",
          def_variant: "Def classique",
          def_key: "def",
          atk_family: "Atk",
          atk_team: "Atk classique",
          atk_key: "atk",
          notes: ""
        }
      }]
    })
  });
}

test("compare correctement la clé d'écriture", async () => {
  assert.equal(await constantTimeEqual("abc", "abc"), true);
  assert.equal(await constantTimeEqual("abc", "abd"), false);
});

test("refuse une requête sans clé ou avec une mauvaise clé", async () => {
  const env = { WRITE_ADMIN_SECRET: "secret-test" };
  assert.equal(await hasValidWriteKey(new Request("https://example.test/apply"), env), false);
  assert.equal(await hasValidWriteKey(new Request("https://example.test/apply", {
    headers: { "X-War-Counter-Write-Key": "wrong" }
  }), env), false);
  assert.equal(await hasValidWriteKey(new Request("https://example.test/apply", {
    headers: { "X-War-Counter-Write-Key": "secret-test" }
  }), env), true);
});

test("la clé protège l'écriture individuelle et l'écriture groupée", () => {
  assert.equal(WRITE_PATHS.has("/api/war-counter-write/apply"), true);
  assert.equal(WRITE_PATHS.has("/api/war-counter-write/apply-batch"), true);
});

test("le relais interne refuse un appel direct depuis un navigateur", async () => {
  const env = { WRITE_ADMIN_SECRET: "secret-test" };
  const response = await entryWorker.fetch(new Request(
    `${WRITE_WORKER_ORIGIN}${INTERNAL_KEY_AUTH_ME_PATH}`,
    {
      headers: {
        Origin: "https://example.test",
        Authorization: "Bearer secret-test"
      }
    }
  ), env, {});
  assert.equal(response.status, 404);
});

test("une clé valide peut secourir uniquement un bearer LoSP expiré", async () => {
  const env = { WRITE_ADMIN_SECRET: "secret-test" };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (url.origin === AUTH_WORKER_ORIGIN && url.pathname === "/me") {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.origin === WRITE_WORKER_ORIGIN && url.pathname === INTERNAL_KEY_AUTH_ME_PATH) {
      return entryWorker.fetch(request, env, {});
    }

    throw new Error(`fetch inattendu: ${url}`);
  };

  try {
    const response = await entryWorker.fetch(batchRequest(), env, {});
    const data = await response.json();

    // Le 401 de session n'est plus le blocage : le Worker a franchi l'authentification
    // et atteint ensuite la configuration Google absente de ce test unitaire.
    assert.equal(response.status, 503);
    assert.match(data.error, /Secrets Google Sheets non configurés/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("une mauvaise clé reste refusée avant tout secours de session", async () => {
  const env = { WRITE_ADMIN_SECRET: "secret-test" };
  const response = await entryWorker.fetch(batchRequest({ key: "wrong" }), env, {});
  const data = await response.json();
  assert.equal(response.status, 403);
  assert.match(data.error, /Clé d’écriture administrateur absente ou invalide/);
});
