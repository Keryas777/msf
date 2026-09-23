import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LOCAL_SESSION_KEY,
  buildWriteAuthRepairUrl,
  ensureWarCounterWriteBearer,
  sanitizeWarCounterReturn,
  validateBearerToken
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

test("une session locale valide ne provoque aucune redirection", async () => {
  const storage = memoryStorage({ [LOCAL_SESSION_KEY]: "session-valide" });
  let redirected = false;

  const result = await ensureWarCounterWriteBearer({
    storage,
    location: {
      replace() {
        redirected = true;
      }
    },
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  });

  assert.equal(result.ok, true);
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
  assert.match(helper, /LOSP_AUTH_WORKER/);
  assert.match(helper, /\/login\?next=/);
  assert.match(helper, /attempt=1/);
  assert.match(helper, /war-counter-write-auth\.js\?v=1/);
});
