import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const read=async file=>readFile(new URL("../docs/"+file,import.meta.url),"utf8");
test("both war tools load signed mapping helper without removing current selectors",async()=>{
  for(const [page,script] of [
    ["war-counters.html","war-counters.js"],
    ["war-attack-checker.html","war-attack-checker.js"]]){
    const [html,js]=await Promise.all([read(page),read(script)]);
    assert.ok(html.includes("./player-identity-links.js?v=1"),page);
    assert.ok(html.indexOf("./player-identity-links.js?v=1")<
      html.indexOf("./"+script+"?"),page);
    assert.ok(js.includes("linkedProfiles = await loadLinkedProfiles()"),script);
    assert.ok(js.includes("getStoredPlayerForAlliance(alliance)"),script);
    assert.ok(html.includes('id="playerSelect"'),page);
  }
});
test("shared helper accepts only server-verified current-tenant associations",async()=>{
  const code=await read("player-identity-links.js");
  const token="v1."+"A".repeat(64)+"."+"B".repeat(43);
  let requests=0;
  const win={LoSP_SESSION:{ok:true,allowedAlliances:["marines"]},
    LoSP_AUTH_READY:Promise.resolve()};
  const context={
    window:win,localStorage:{getItem:()=>token},
    fetch:async(url,init)=>{
      requests++;assert.equal(init.headers.Authorization,"Bearer "+token);
      return {ok:true,json:async()=>({status:"ok",links:[
        {alliance:"marines",player:"El_Prince"},
        {alliance:"zeus",player:"Not allowed"}]})};
    },String,Set,Promise,Object
  };
  runInNewContext(code,context);
  const links=await win.LoSPIdentityLinks.load();
  assert.deepEqual(JSON.parse(JSON.stringify(links)),
    [{alliance:"marines",player:"El_Prince"}]);
  assert.equal(requests,1);
  win.LoSP_SESSION.previewMode=true;
  assert.deepEqual(JSON.parse(JSON.stringify(
    await win.LoSPIdentityLinks.load())),[]);
  assert.equal(requests,1);
});
test("unsigned sessions are not used to retrieve private associations",async()=>{
  const code=await read("player-identity-links.js");
  const win={LoSP_SESSION:{ok:true,allowedAlliances:["marines"]},
    LoSP_AUTH_READY:Promise.resolve()};
  runInNewContext(code,{
    window:win,localStorage:{getItem:()=> "legacy-unsigned-token"},
    fetch:()=>{throw Error("Unexpected request");},
    String,Set,Promise,Object
  });
  assert.deepEqual(JSON.parse(JSON.stringify(
    await win.LoSPIdentityLinks.load())),[]);
});
