import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { constantTimeEqual, hasValidWriteKey, AUTH_CHECK_PATH, verifyWriteAdminSession, WRITE_PATHS } from "../index.js";
import { requireAdmin } from "../worker.js";

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

test("Wrangler relie le Worker d'écriture à losp-auth par Service Binding", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.services, [{ binding: "LOSP_AUTH", service: "losp-auth" }]);
  assert.equal(Object.hasOwn(config.vars || {}, "AUTH_BASE_URL"), false);
});

test("le préflight serveur utilise le Service Binding avec le bearer et l'origine LoSP", async () => {
  let seenRequest = null;
  const env = {
    SITE_ORIGIN: "https://site.test",
    LOSP_AUTH: {
      async fetch(request) {
        seenRequest = request;
        return new Response(JSON.stringify({ ok: true, role: "admin" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  };

  const result = await verifyWriteAdminSession(new Request("https://write.test/auth-check", {
    headers: { Authorization: "Bearer session-test" }
  }), env);

  assert.equal(result.ok, true);
  assert.equal(seenRequest.url, "https://losp-auth.internal/me");
  assert.equal(seenRequest.headers.get("Authorization"), "Bearer session-test");
  assert.equal(seenRequest.headers.get("Origin"), "https://site.test");
});

test("le préflight serveur conserve la raison précise d'un refus auth", async () => {
  const env = {
    LOSP_AUTH: {
      async fetch() {
        return new Response(JSON.stringify({
          ok: false,
          reason: "discord_check_failed"
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  };

  const result = await verifyWriteAdminSession(new Request("https://write.test/auth-check", {
    headers: { Authorization: "Bearer session-test" }
  }), env);

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.reason, "discord_check_failed");
  assert.equal(result.authStatus, 401);
});

test("le préflight refuse explicitement l'absence du Service Binding", async () => {
  const result = await verifyWriteAdminSession(new Request("https://write.test/auth-check", {
    headers: { Authorization: "Bearer session-test" }
  }), {});

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.reason, "auth_binding_missing");
  assert.equal(result.authStatus, 0);
});

test("l'écriture réelle réutilise le même Service Binding pour valider l'admin", async () => {
  let seenRequest = null;
  const admin = await requireAdmin(new Request("https://write.test/apply", {
    headers: { Authorization: "Bearer session-test" }
  }), {
    LOSP_AUTH: {
      async fetch(request) {
        seenRequest = request;
        return new Response(JSON.stringify({
          ok: true,
          role: "admin",
          id: "admin-1",
          displayName: "Admin"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  });

  assert.equal(admin.id, "admin-1");
  assert.equal(seenRequest.url, "https://losp-auth.internal/me");
  assert.equal(seenRequest.headers.get("Authorization"), "Bearer session-test");
});
