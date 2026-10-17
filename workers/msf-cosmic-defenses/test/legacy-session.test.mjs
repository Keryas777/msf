import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import auth from "../../losp-auth/worker.js";

// Fixture locale : aucun jeton utilisateur ni secret réel n'est employé.
const id = "300305626926415874";
const legacy = Buffer.from(JSON.stringify({
  id, username: "Keryas", global_name: "Keryas",
  role: "member", alliances: ["zeus"], primaryAlliance: "zeus"
}), "utf8").toString("base64url");
const env = {
  SESSION_SIGNING_SECRET: "synthetic-local-test-secret-longer-than-32-characters",
  DISCORD_BOT_TOKEN: "synthetic-bot-token",
  DISCORD_CLIENT_SECRET: "synthetic-client-secret"
};
const memberEndpoint = "https://discord.com/api/v10/guilds/758717819923333191/members/" + id;
async function mockDiscord(url, options = {}) {
  assert.equal(String(url), memberEndpoint);
  assert.equal(options.headers.Authorization, "Bot synthetic-bot-token");
  return Response.json({ nick:"Pseudo LoSP", roles:["758722419128401992"] });
}
async function withMock(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mockDiscord;
  try { return await fn(); } finally { globalThis.fetch = original; }
}
const authUrl = path => "https://losp-auth.example" + path;

test("ancien jeton localStorage : /me autorise l'accès sans relancer OAuth", () =>
  withMock(async () => {
    const response = await auth.fetch(new Request(authUrl("/me"), {
      headers:{Authorization:"Bearer " + legacy}
    }), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.id, id);
    assert.equal(data.displayName, "Pseudo LoSP");
    assert.deepEqual(data.alliances, ["zeus"]);
    assert.equal(data.signedSession, false);
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie?.startsWith("session="));
    assert.doesNotMatch(cookie, /session=v1\./);
    assert.equal(JSON.parse(Buffer.from(cookie.split(";")[0].split("=")[1],"base64url").toString("utf8")).id,id);
  }));

test("ancien cookie httpOnly : /me reste compatible si localStorage est absent", () =>
  withMock(async () => {
    const response = await auth.fetch(new Request(authUrl("/me"), {
      headers:{Cookie:"session=" + legacy}
    }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).signedSession, false);
  }));

test("l'ancien jeton n'autorise PAS /signed-me pour publier", async () => {
  const response = await auth.fetch(new Request(authUrl("/signed-me"),{
    headers:{Authorization:"Bearer " + legacy}
  }),env);
  assert.equal(response.status,401);
  assert.equal((await response.json()).reason,"signed_session_required");
});

test("identité ancienne : vérification des rôles toujours effectuée", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ nick:"Aucun rôle", roles:[] });
  try {
    const response = await auth.fetch(new Request(authUrl("/me"),{
      headers:{Authorization:"Bearer " + legacy}
    }),env);
    assert.equal(response.status,401);
    assert.equal((await response.json()).reason,"no_authorized_alliance");
  } finally { globalThis.fetch = original; }
});

test("le front LoSP garde le jeton existant et ne redirige pas si /me répond 200", async () => {
  const script = await readFile(new URL("../../../docs/auth-guard.js",import.meta.url),"utf8");
  const calls = [];
  const storage = new Map([["losp_session",legacy]]);
  const page = {
    location:{
      pathname:"/msf/home.html",search:"",hash:"",
      replace(url){calls.push(["redirect",url]);}
    },
    dispatchEvent(event){calls.push(["session",event.detail]);}
  };
  const doc={
    addEventListener(){},
    documentElement:{classList:{remove(value){calls.push(["unblock",value]);}}}
  };
  const context={
    window:page, document:doc,
    localStorage:{
      getItem:key=>storage.get(key)||null,
      removeItem:key=>{calls.push(["remove",key]);storage.delete(key);}
    },
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    fetch:async (url, options) => {
      assert.match(url,/\/me$/);
      assert.equal(options.headers.Authorization,"Bearer "+legacy);
      assert.equal(options.credentials,"include");
      return Response.json({ok:true,id,displayName:"Pseudo LoSP",signedSession:false});
    }
  };
  runInNewContext(script,context,{filename:"docs/auth-guard.js"});
  // checkAuth est appelé sans await par le script du navigateur.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(([name])=>name==="redirect").length,0);
  assert.equal(calls.filter(([name])=>name==="remove").length,0);
  assert.equal(calls.find(([name])=>name==="session")?.[1]?.ok,true);
  assert.equal(storage.get("losp_session"),legacy);
  assert.ok(calls.some(([name])=>name==="unblock"));
});
