import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_CHECK_PATH,
  constantTimeEqual,
  hasValidWriteKey,
  verifyWriteAdminSession,
  WRITE_PATHS
} from "../index.js";

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
  assert.equal(AUTH_CHECK_PATH, "/api/war-counter-write/auth-check");
  assert.equal(WRITE_PATHS.has(AUTH_CHECK_PATH), false);
});

test("le préflight serveur transmet le bearer et l'origine LoSP au Worker d'auth", async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  let seenInit = null;

  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenInit = init;
    return new Response(JSON.stringify({ ok: true, role: "admin" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const result = await verifyWriteAdminSession(new Request("https://write.test/auth-check", {
      headers: { Authorization: "Bearer session-test" }
    }), {
      AUTH_BASE_URL: "https://auth.test",
      SITE_ORIGIN: "https://site.test"
    });

    assert.equal(result.ok, true);
    assert.equal(seenUrl, "https://auth.test/me");
    assert.equal(seenInit.headers.Authorization, "Bearer session-test");
    assert.equal(seenInit.headers.Origin, "https://site.test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("le préflight serveur conserve la raison précise d'un refus auth", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    reason: "discord_check_failed"
  }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });

  try {
    const result = await verifyWriteAdminSession(new Request("https://write.test/auth-check", {
      headers: { Authorization: "Bearer session-test" }
    }), {});

    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.reason, "discord_check_failed");
    assert.equal(result.authStatus, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
