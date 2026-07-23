import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  sendCapabilitiesUpdate,
  UPDATE_ENDPOINT,
  WorkerUpdateError
} from "../worker-client.mjs";

const validRequest = {
  gameVersion: "10_3_0",
  gameBuild: "1654625",
  databaseBase64: "U1FMaXRlIGZvcm1hdCAzAA==",
  uploadPassword: "secret local"
};

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });

test("envoie uniquement le contrat fermé au Worker", async () => {
  let capturedUrl;
  let capturedOptions;

  const result = await sendCapabilitiesUpdate(validRequest, async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;

    return jsonResponse(
      {
        ok: true,
        status: "queued",
        gameVersion: "10_3_0",
        gameBuild: "1654625",
        githubRequestId: "TEST-123"
      },
      202
    );
  });

  assert.equal(capturedUrl, UPDATE_ENDPOINT);
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers["x-upload-password"], "secret local");
  assert.equal(capturedOptions.headers["Content-Type"], "application/json");
  assert.equal(capturedOptions.credentials, "omit");
  assert.equal(capturedOptions.cache, "no-store");
  assert.equal(capturedOptions.redirect, "error");
  assert.equal(capturedOptions.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    gameVersion: "10_3_0",
    databaseBase64: "U1FMaXRlIGZvcm1hdCAzAA==",
    gameBuild: "1654625"
  });
  assert.equal(result.githubRequestId, "TEST-123");
});

test("omet le build lorsqu’il n’a pas été détecté", async () => {
  let capturedPayload;

  await sendCapabilitiesUpdate(
    {
      ...validRequest,
      gameBuild: null
    },
    async (_url, options) => {
      capturedPayload = JSON.parse(options.body);

      return jsonResponse(
        {
          ok: true,
          status: "queued",
          gameVersion: "10_3_0",
          gameBuild: null,
          githubRequestId: null
        },
        202
      );
    }
  );

  assert.deepEqual(capturedPayload, {
    gameVersion: "10_3_0",
    databaseBase64: "U1FMaXRlIGZvcm1hdCAzAA=="
  });
});

test("remonte le message sécurisé du Worker", async () => {
  await assert.rejects(
    sendCapabilitiesUpdate(validRequest, async () =>
      jsonResponse(
        {
          ok: false,
          error: "UNAUTHORIZED",
          message: "Mot de passe d’upload incorrect."
        },
        401
      )
    ),
    error => {
      assert.ok(error instanceof WorkerUpdateError);
      assert.equal(error.status, 401);
      assert.equal(error.code, "UNAUTHORIZED");
      assert.equal(error.message, "Mot de passe d’upload incorrect.");
      return true;
    }
  );
});

test("refuse une réponse 202 qui ne confirme pas la mise en file", async () => {
  await assert.rejects(
    sendCapabilitiesUpdate(validRequest, async () =>
      jsonResponse({ ok: true, status: "unknown" }, 202)
    ),
    error => {
      assert.ok(error instanceof WorkerUpdateError);
      assert.equal(error.code, "UNEXPECTED_RESPONSE");
      return true;
    }
  );
});

test("ne reprend pas le détail d’une erreur réseau potentiellement sensible", async () => {
  await assert.rejects(
    sendCapabilitiesUpdate(validRequest, async () => {
      throw new Error("secret local");
    }),
    error => {
      assert.ok(error instanceof WorkerUpdateError);
      assert.equal(error.code, "NETWORK_ERROR");
      assert.doesNotMatch(error.message, /secret local/);
      return true;
    }
  );
});

test("le manifeste limite les permissions aux deux hôtes nécessaires", async () => {
  const manifestUrl = new URL("../manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, "0.2.0");
  assert.deepEqual(manifest.permissions.sort(), [
    "scripting",
    "storage",
    "webNavigation"
  ]);
  assert.deepEqual(manifest.host_permissions.sort(), [
    "https://losp-msf-capabilities.deliriousfan7.workers.dev/*",
    "https://webplayable.m3.scopelypv.com/*"
  ]);
  assert.equal(manifest.permissions.includes("cookies"), false);
});

test("le popup limite la base et protège le stockage des contextes non fiables", async () => {
  const popupUrl = new URL("../popup.js", import.meta.url);
  const popupSource = await readFile(popupUrl, "utf8");

  assert.match(popupSource, /const MAX_DATABASE_BYTES = 45 \* 1024;/);
  assert.match(popupSource, /accessLevel: "TRUSTED_CONTEXTS"/);
});

test("le popup HTML expose tous les éléments utilisés par le module", async () => {
  const [popupSource, popupHtml] = await Promise.all([
    readFile(new URL("../popup.js", import.meta.url), "utf8"),
    readFile(new URL("../popup.html", import.meta.url), "utf8")
  ]);
  const queriedIds = [
    ...popupSource.matchAll(/querySelector\("#([^"]+)"\)/g)
  ].map(match => match[1]);

  assert.ok(queriedIds.length > 0);

  for (const id of queriedIds) {
    assert.match(popupHtml, new RegExp(`id="${id}"`));
  }

  assert.match(
    popupHtml,
    /<script src="popup\.js" type="module"><\/script>/
  );
});
