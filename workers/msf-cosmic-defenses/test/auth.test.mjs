import test from "node:test";
import assert from "node:assert/strict";
import auth from "../../losp-auth/worker.js";

const secret="a-long-random-signing-secret-at-least-32-chars";
const id="300305626926415874";
const apiFetch=async(url)=>{
  const path=new URL(url).pathname;
  if(path.includes("/oauth2/token"))return Response.json({access_token:"oauth"});
  if(path.includes("/users/@me/guilds"))return Response.json([{id:"758717819923333191"}]);
  if(path.includes("/users/@me"))return Response.json({id,username:"Keryas"});
  if(path.includes("/guilds/"))return Response.json({
    nick:"Keryas",roles:["758722419128401992"]
  });
  throw Error("Unexpected Discord URL "+url);
};
test("OAuth délivre un jeton HMAC ; signé-me refuse la modification de l'identité",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=apiFetch;
  try {
    const env={SESSION_SIGNING_SECRET:secret,DISCORD_BOT_TOKEN:"bot",
      DISCORD_CLIENT_SECRET:"oauth-secret"};
    const callback=await auth.fetch(new Request("https://losp-auth.test/callback?code=testing&state=cosmic-defense-propose.html"),env);
    assert.equal(callback.status,302);
    const session=new URL(callback.headers.get("Location")).hash.slice("#session=".length);
    const token=decodeURIComponent(session);
    assert.match(token,/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const me=await auth.fetch(new Request("https://losp-auth.test/signed-me",{
      headers:{Authorization:"Bearer "+token}
    }),env);
    assert.equal(me.status,200);
    assert.equal((await me.json()).signedSession,true);
    const pieces=token.split(".");
    const forged="v1."+Buffer.from(JSON.stringify({
      id:"999999999999999999",iat:1,exp:9000000000
    })).toString("base64url")+"."+pieces[2];
    const invalid=await auth.fetch(new Request("https://losp-auth.test/signed-me",{
      headers:{Authorization:"Bearer "+forged}
    }),env);
    assert.equal(invalid.status,401);
    const legacy=Buffer.from(JSON.stringify({id})).toString("base64url");
    const old=await auth.fetch(new Request("https://losp-auth.test/signed-me",{
      headers:{Authorization:"Bearer "+legacy}
    }),env);
    assert.equal(old.status,401);
  }finally {globalThis.fetch=original;}
});
