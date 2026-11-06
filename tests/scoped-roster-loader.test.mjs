import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const script=await readFile(new URL("../docs/roster-loader.js",import.meta.url),"utf8");
const meta=[
  {key:"zeus",sourceKey:"zeus",group:"losp"},
  {key:"marines",sourceKey:"marines",group:"marines"},
  {key:"endgamerevolutionred",sourceKey:"endgame-revolution-red",group:"endgame"},
  {key:"endgamerevolutionorange",sourceKey:"endgame-revolution-orange",group:"endgame"},
];
const token="v1."+"A".repeat(60)+"."+"B".repeat(43);
const roster=(key,power)=>({player:"Shared",alliance:key,
  chars:{blob:{power}},iso:{}});
const byKey=new Map(meta.map(row=>[row.key,row]));
const keyFromValue=value=>{
  const compact=String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  return byKey.has(compact)?compact:"";
};
function setup({allowed=["marines"],sessionToken=token,read}={}){
  const requests=[],granted=new Set(allowed);
  const window={LoSP_SESSION:{ok:true,role:"guest"},
    LoSP_AUTH_READY:Promise.resolve(),
    LoSPAlliances:{
      loadAlliances:async()=>{},
      getAllianceMeta:value=>byKey.get(keyFromValue(value))||null,
      getAllianceKey:keyFromValue
    },
    LoSPAccess:{isAllianceAllowed:value=>granted.has(keyFromValue(value))}};
  const fetch=async (url,options)=>{
    requests.push({url:String(url),options});
    if(read)return read(String(url),options);
    const key=String(url).match(/rosters_([^/]+)\.json$/)?.[1];
    return key ? Response.json([roster(key,11)]):new Response(null,{status:404});
  };
  runInNewContext(script,{window,fetch,localStorage:{getItem:()=>sessionToken},
    console,URL,encodeURIComponent,Promise,Map,Set,RegExp,Array,String});
  return {window,requests,granted,load:window.LoSPRosterLoader};
}
test("guest downloads one MARINES shard only, including in concurrent calls",async()=>{
  const x=setup(),a=x.load.load("marines"),b=x.load.load("marines");
  assert.equal((await a)[0].chars.blob.power,11);
  assert.equal((await b)[0].player,"Shared");
  assert.equal(x.requests.length,1);
  assert.match(x.requests[0].url,/^\.\/data\/rosters_marines\.json$/);
  assert.ok(!x.requests[0].url.endsWith("/rosters.json"));
});
test("ENDGAME uses exact registered hyphenated file names and preserves tenants",async()=>{
  const x=setup({allowed:["endgamerevolutionred","endgamerevolutionorange"]});
  const result=await x.load.loadMany(["endgamerevolutionred","endgamerevolutionorange"]);
  assert.equal(result.rosters.length,2);
  assert.deepEqual(x.requests.map(x=>x.url),[
    "./data/rosters_endgame-revolution-red.json",
    "./data/rosters_endgame-revolution-orange.json"]);
  assert.equal(result.rosters[0].alliance,"endgame-revolution-red");
});
test("refuses unauthorized alliances before making any network call",async()=>{
  const x=setup({allowed:["marines"]});
  await assert.rejects(x.load.load("zeus"),/non autorisée/);
  await assert.rejects(x.load.load("not-existing"),/non autorisée/);
  assert.equal(x.requests.length,0);
});
test("rejects mislabeled cross-alliance roster data",async()=>{
  const x=setup({read:async()=>Response.json([roster("zeus",9000)])});
  await assert.rejects(x.load.load("marines"),/incohérent/);
  await assert.rejects(x.load.load("marines"),/incohérent/);
  assert.equal(x.requests.length,2,"errors are not cached");
});
test("guest first-publication 404 falls back only to signed private API",async()=>{
  const x=setup({read:async(url)=>{
    if(url.includes("rosters_marines.json"))return new Response(null,{status:404});
    return Response.json({status:"ok",kind:"authorized-guest-rosters",
      state:"complete",alliance:"marines",rosters:[roster("marines",22)]});
  }});
  assert.equal((await x.load.load("marines"))[0].chars.blob.power,22);
  assert.equal(x.requests.length,2);
  assert.match(x.requests[1].url,/\/api\/secure\/guest-rosters\?alliance=marines$/);
  assert.equal(x.requests[1].options.headers.Authorization,"Bearer "+token);
});
test("unsigned session blocks private fallback; HTTP 503 is never hidden by fallback",async()=>{
  const x=setup({sessionToken:"legacy",read:async()=>new Response(null,{status:404})});
  await assert.rejects(x.load.load("marines"),/signée/);
  assert.equal(x.requests.length,1);
  const y=setup({read:async()=>new Response(null,{status:503})});
  await assert.rejects(y.load.load("marines"),/503/);
  assert.equal(y.requests.length,1);
});
test("user losing Discord permission while a download is in flight receives no rows",async()=>{
  let deliver;
  const x=setup({read:()=>new Promise(resolve=>{deliver=resolve;})});
  const pending=x.load.load("marines");
  await new Promise(resolve=>setImmediate(resolve));
  x.granted.clear();
  deliver(Response.json([roster("marines",500)]));
  await assert.rejects(pending,/non autorisée/);
});
test("only requested alliances are loaded for partial multi-alliance rankings",async()=>{
  const x=setup({allowed:["zeus","marines","endgamerevolutionred"]});
  const data=await x.load.loadMany(["marines"]);
  assert.equal(data.rosters.length,1);
  assert.equal(x.requests.length,1);
  assert.ok(x.requests[0].url.includes("marines"));
});
