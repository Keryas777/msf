import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const head="a".repeat(40);
const next="b".repeat(40);
const origin="https://keryas777.github.io";
const bearer="Bearer v1.abc.def";
const json = (obj,status=200) => new Response(JSON.stringify(obj),{
  status,headers:{"Content-Type":"application/json"}
});
const b64 = obj => Buffer.from(JSON.stringify(obj),"utf8").toString("base64");
const make = (room=1) => ({
  room,characters:["Hulk","SpiderMan","Blade","Thor","Odin"],notes:"Equipe test"
});
const fixture = ({season="season-25",old=[],conflict=false}={}) => {
  const calls=[];
  let version=head;
  let current=old;
  let conflicts=0;
  const chars=["Hulk","SpiderMan","Blade","Thor","Odin"].map(id=>({
    id,player_Character:true
  }));
  const mockFetch=async (url,options={})=>{
    const path=new URL(url).pathname;
    calls.push({path,method:options.method||"GET",body:options.body?JSON.parse(options.body):null});
    if(path.endsWith("/git/ref/heads/main"))return json({object:{sha:version}});
    if(path.includes("/contents/docs/data/cosmic-config.json"))
      return json({encoding:"base64",content:b64({season:{id:season}})});
    if(path.includes("/contents/docs/data/cosmic-defenses.json"))
      return json({encoding:"base64",content:b64(current)});
    if(path.includes("/contents/docs/data/msf-characters.json"))
      return json({encoding:"base64",content:b64(chars)});
    if(path.includes("/git/commits/"+head))return json({tree:{sha:"c".repeat(40)}});
    if(path.endsWith("/git/trees"))return json({sha:"d".repeat(40)});
    if(path.endsWith("/git/commits"))return json({sha:next});
    if(path.endsWith("/git/refs/heads/main")){
      if(conflict&&!conflicts++){
        return json({message:"Head updated"},422);
      }
      version=next;
      const files=calls.findLast(x=>x.path.endsWith("/git/trees"));
      current=JSON.parse(files.body.tree[0].content);
      return json({object:{sha:next}});
    }
    throw Error("Unexpected HTTP "+path);
  };
  const env={
    GITHUB_TOKEN:"test-secret",
    LOSP_AUTH:{fetch:async()=>json({
      ok:true,signedSession:true,id:"300305626926415874",
      displayName:"Keryas"
    })}
  };
  return {env,calls,mockFetch,getRows:()=>current};
};
async function withMock(f,run) {
  const original=globalThis.fetch;
  globalThis.fetch=f;
  try {return await run();}
  finally {globalThis.fetch=original;}
}
const post=(rooms=[make()],extras={})=>new Request(
  "https://msf-cosmic-defenses.example/api/cosmic-defenses",{
    method:"POST",
    headers:{"Origin":origin,"Authorization":bearer,"Content-Type":"application/json"},
    body:JSON.stringify({season:"season-25",rooms,...extras})
  }
);
test("non authentifié, ancien jeton, requête sans origine : rien n'est écrit",async()=>{
  const x=fixture();
  await withMock(x.mockFetch,async()=>{
    const noOrigin=await worker.fetch(new Request("https://example.test/api/cosmic-defenses",{
      method:"POST",headers:{"Authorization":bearer,"Content-Type":"application/json"},
      body:JSON.stringify({season:"season-25",rooms:[make()]})
    }),x.env);
    assert.equal(noOrigin.status,403);
    const unsigned=new Request("https://example.test/api/cosmic-defenses",{
      method:"POST",headers:{"Origin":origin,"Authorization":"Bearer eyJpZCI6IjEyMyJ9",
        "Content-Type":"application/json"},
      body:JSON.stringify({season:"season-25",rooms:[make()]})
    });
    assert.equal((await worker.fetch(unsigned,x.env)).status,401);
    assert.equal(x.calls.length,0);
  });
});
test("publication directe : nom Discord vérifié, six salles maximum, données externes intouchées",async()=>{
  const external={season:"season-25",room:1,characters:make().characters,
    author:"Marvel Church",source:"Marvel Church",name:"Conseil"};
  const x=fixture({old:[external]});
  await withMock(x.mockFetch,async()=>{
    const res=await worker.fetch(post([make()],{
      author:"Faux nom",source:"Marvel Church",authorDiscordId:"000000000000000001"
    }),x.env);
    assert.equal(res.status,200);
    assert.equal((await res.json()).published,1);
    const rows=x.getRows();
    assert.equal(rows.length,2);
    assert.deepEqual(rows[0],external);
    assert.equal(rows[1].author,"Keryas");
    assert.equal(rows[1].authorDiscordId,"300305626926415874");
    assert.equal(rows[1].source,"Personnel");
    assert.equal(rows[1].season,"season-25");
  });
});
test("republication de sa salle remplace uniquement sa salle, sans doublon",async()=>{
  const mine={season:"season-25",room:1,characters:make().characters,
    authorDiscordId:"300305626926415874",author:"Ancien pseudo",source:"Personnel",
    notes:"Ancien",publishedAt:"2026-01-01T00:00:00.000Z"};
  const other={...mine,room:2,authorDiscordId:"900000000000000000"};
  const x=fixture({old:[mine,other]});
  await withMock(x.mockFetch,async()=>{
    const response=await worker.fetch(post([make()]),x.env);
    assert.equal(response.status,200);
    assert.equal(x.getRows().length,2);
    assert.equal(x.getRows()[0].authorDiscordId,other.authorDiscordId);
    assert.equal(x.getRows()[1].author,"Keryas");
  });
});
test("saison différente ou IDs non jouables : rejet sans commit",async()=>{
  const x=fixture({season:"season-26"});
  await withMock(x.mockFetch,async()=>{
    assert.equal((await worker.fetch(post([make()]),x.env)).status,400);
    assert.equal(x.calls.filter(c=>c.method!=="GET").length,0);
  });
  const y=fixture();
  await withMock(y.mockFetch,async()=>{
    const invalid={...make(),characters:["Hulk","SpiderMan","Blade","Thor","NPC"]};
    assert.equal((await worker.fetch(post([invalid]),y.env)).status,400);
    assert.equal(y.calls.filter(c=>c.method!=="GET").length,0);
  });
});
test("GET en direct affiche uniquement la saison active",async()=>{
  const row={season:"season-25",room:1,characters:make().characters};
  const x=fixture({old:[row,{...row,season:"season-24"}]});
  await withMock(x.mockFetch,async()=>{
    const res=await worker.fetch(new Request("https://host/api/cosmic-defenses",{
      headers:{"Origin":origin}
    }),x.env);
    assert.equal(res.status,200);
    const result=await res.json();
    assert.equal(result.entries.length,1);
    assert.equal(result.season,"season-25");
  });
});
test("GitHub changed HEAD : retry before writing again",async()=>{
  const x=fixture({conflict:true});
  await withMock(x.mockFetch,async()=>{
    const res=await worker.fetch(post([make()]),x.env);
    assert.equal(res.status,200);
    assert.equal(x.calls.filter(c=>c.path.endsWith("/git/ref/heads/main")).length,2);
  });
});
test("Worker unconfigured : publication disabled and no false success",async()=>{
  const x=fixture();
  await withMock(x.mockFetch,async()=>{
    const response=await worker.fetch(post([make()]),{LOSP_AUTH:x.env.LOSP_AUTH});
    assert.equal(response.status,503);
  });
});
