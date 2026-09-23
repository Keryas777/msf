import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LOCAL_SESSION_KEY,
  buildWriteAuthRepairUrl,
  ensureWarCounterWriteBearer,
  sanitizeWarCounterReturn,
  validateBearerToken,
  validateWriteWorkerBearer
} from "../docs/war-counter-write-auth.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    has(key) {
      return data.has(key);
    }
  };
}

test("valide le bearer local sans envoyer le cookie LoSP", async () => {
  let seenInit = null;
  const result = await validateBearerToken("session-locale", {
    fetchImpl: async (_url, init) => {
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, role: "admin" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(seenInit.credentials, "omit");
  assert.equal(seenInit.headers.Authorization, "Bearer session-locale");
});

test("le bearer est aussi vérifié par le Worker d'écriture avant toute capture", async () => {
  let seenUrl = "";
  let seenInit = null;
  const result = await validateWriteWorkerBearer("session-locale", {
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, role: "admin", authStatus: 200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(result.ok, true);
  assert.match(seenUrl, /\/api\/war-counter-write\/auth-check$/);
  assert.equal(seenInit.credentials, "omit");
  assert.equal(seenInit.headers.Authorization, "Bearer session-locale");
});

test("une session locale invalide est supprimée et redirige uniquement War Counter", async () => {
  const storage = memoryStorage({ [LOCAL_SESSION_KEY]: "ancienne-session" });
  let redirectedTo = "";

  const result = await ensureWarCounterWriteBearer({
    storage,
    location: {
      replace(value) {
        redirectedTo = value;
      }
    },
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      reason: "invalid_session"
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(storage.has(LOCAL_SESSION_KEY), false);
  assert.equal(redirectedTo, "./war-counter-auth.html?return=war-counter-lab.html");
});

test("une session valide de bout en bout ne provoque aucune redirection", async () => {
  const storage = memoryStorage({ [LOCAL_SESSION_KEY]: "session-valide" });
  let redirected = false;
  let callCount = 0;

  const result = await ensureWarCounterWriteBearer({
    storage,
    location: {
      replace() {
        redirected = true;
      }
    },
    fetchImpl: async () => {
      callCount += 1;
      return new Response(JSON.stringify({ ok: true, role: "admin", authStatus: 200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, "ready");
  assert.equal(callCount, 2);
  assert.equal(redirected, false);
  assert.equal(storage.getItem(LOCAL_SESSION_KEY), "session-valide");
});

test("un refus uniquement côté Worker d'écriture bloque sans effacer la session ni relancer Discord", async () => {
  const storage = memoryStorage({ [LOCAL_SESSION_KEY]: "session-valide" });
  let redirected = false;
  let callCount = 0;

  const result = await ensureWarCounterWriteBearer({
    storage,
    location: {
      replace() {
        redirected = true;
      }
    },
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ ok: true, role: "admin" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        ok: false,
        reason: "not_connected",
        authStatus: 401
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, "write-worker");
  assert.equal(result.reason, "not_connected");
  assert.equal(redirected, false);
  assert.equal(storage.getItem(LOCAL_SESSION_KEY), "session-valide");
});

test("la page de réparation reste enfermée sur War Counter Vision", () => {
  assert.equal(sanitizeWarCounterReturn("war-counter-lab.html"), "war-counter-lab.html");
  assert.equal(sanitizeWarCounterReturn("home.html"), "war-counter-lab.html");
  assert.equal(sanitizeWarCounterReturn("https://example.com"), "war-counter-lab.html");
  assert.equal(buildWriteAuthRepairUrl("home.html"), "./war-counter-auth.html?return=war-counter-lab.html");
});

test("le préflight est exécuté avant le chargement du moteur Vision et la réparation force un vrai OAuth", () => {
  const entry = fs.readFileSync(new URL("../docs/war-counter-lab-entry.js", import.meta.url), "utf8");
  const helper = fs.readFileSync(new URL("../docs/war-counter-auth.html", import.meta.url), "utf8");

  const authIndex = entry.indexOf("ensureWarCounterWriteBearer");
  const visionIndex = entry.indexOf('import("./war-counter-lab.js?v=r7-entry-8")');
  assert.ok(authIndex >= 0 && visionIndex > authIndex);
  assert.match(entry, /N’analyse aucune capture/);
  assert.match(helper, /LOSP_AUTH_WORKER/);
  assert.match(helper, /\/login\?next=/);
  assert.match(helper, /attempt=1/);
  assert.match(helper, /war-counter-write-auth\.js\?v=2/);
});
