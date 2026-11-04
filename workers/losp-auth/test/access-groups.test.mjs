import test from "node:test";
import assert from "node:assert/strict";
import auth from "../worker.js";

const env = { DISCORD_BOT_TOKEN: "test-bot", SESSION_SIGNING_SECRET: "test-signing-secret-with-at-least-32-characters" };
const BASE_URL = "https://losp-auth.test";
const marineRole = "1567463791543717979";
const endgameRole = "1567461415495667823";
const zeusRole = "758722419128401992";

async function sessionFor(id, roles) {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).includes("/guilds/758717819923333191/members/"));
    assert.equal(options.headers.Authorization, "Bot test-bot");
    return Response.json({ nick: "Test", roles });
  };
  try {
    const token = Buffer.from(JSON.stringify({ id, username: "Test" }), "utf8").toString("base64url");
    const response = await auth.fetch(new Request(BASE_URL + "/me", {
      headers: { Authorization: "Bearer " + token }
    }), env);
    return { status: response.status, data: await response.json() };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

test("Marines: une seule alliance, sans visibilité LoSP ou Endgame", async () => {
  const { status, data } = await sessionFor("123456789012345678", [marineRole]);
  assert.equal(status, 200);
  assert.equal(data.role, "guest");
  assert.equal(data.groupKey, "marines");
  assert.deepEqual(data.allowedAlliances, ["marines"]);
  assert.deepEqual(data.alliances, []);
});

test("Endgame: les deux couleurs sont accessibles avec le même rôle", async () => {
  const { status, data } = await sessionFor("123456789012345678", [endgameRole]);
  assert.equal(status, 200);
  assert.equal(data.groupKey, "endgame-revolution");
  assert.deepEqual(data.allowedAlliances, [
    "endgame-revolution-red", "endgame-revolution-orange"
  ]);
});

test("LoSP: les six alliances sont autorisées indépendamment du rôle d'alliance individuel", async () => {
  const { status, data } = await sessionFor("123456789012345678", [zeusRole]);
  assert.equal(status, 200);
  assert.equal(data.role, "member");
  assert.equal(data.groupKey, "losp");
  assert.equal(data.allowedAlliances.length, 6);
  assert.ok(data.allowedAlliances.includes("hades"));
  assert.ok(!data.allowedAlliances.includes("marines"));
  assert.deepEqual(data.alliances, ["zeus"]);
});

test("Admin LoSP: toutes les neuf alliances sans cumul de rôles", async () => {
  const { status, data } = await sessionFor("300305626926415874", [zeusRole]);
  assert.equal(status, 200);
  assert.equal(data.role, "admin");
  assert.equal(data.groupKey, "all");
  assert.equal(data.allowedAlliances.length, 9);
  assert.ok(data.allowedAlliances.includes("marines"));
  assert.ok(data.allowedAlliances.includes("endgame-revolution-orange"));
});

test("Rôles incompatibles et compte sans rôle sont refusés", async () => {
  assert.equal((await sessionFor("123456789012345678", [zeusRole, endgameRole])).data.reason, "conflicting_group_roles");
  assert.equal((await sessionFor("123456789012345678", [marineRole, endgameRole])).status, 401);
  assert.equal((await sessionFor("123456789012345678", [])).data.reason, "no_authorized_alliance");
});

test("Aucun invité ne peut publier avec signed-me, même avec un jeton signé", async () => {
  // Le contrôle de publication est redondant avec le Worker de publication.
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/guilds/")) return Response.json({ nick: "Test", roles: [marineRole] });
    if (String(url).includes("/oauth2/token")) return Response.json({ access_token: "oauth-test" });
    if (String(url).includes("/users/@me/guilds")) return Response.json([{ id: "758717819923333191" }]);
    if (String(url).includes("/users/@me")) return Response.json({ id: "123456789012345678", username: "Test" });
    throw Error("Unknown mocked URL " + url);
  };
  try {
    const callback = await auth.fetch(new Request(BASE_URL + "/callback?code=fake&state=home.html"), {
      ...env, DISCORD_CLIENT_SECRET: "test-oauth-secret"
    });
    assert.equal(callback.status, 302);
    const token = new URL(callback.headers.get("location")).hash.slice("#session=".length);
    const signedAccess = await auth.fetch(new Request(BASE_URL + "/signed-access", {
      headers: { Authorization: "Bearer " + decodeURIComponent(token) }
    }), env);
    assert.equal(signedAccess.status, 200);
    assert.deepEqual((await signedAccess.json()).allowedAlliances, ["marines"]);
    const response = await auth.fetch(new Request(BASE_URL + "/signed-me", {
      headers: { Authorization: "Bearer " + decodeURIComponent(token) }
    }), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).reason, "guest_publish_forbidden");
  } finally {
    globalThis.fetch = oldFetch;
  }
});
