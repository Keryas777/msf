import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../docs/evolution-history.js",import.meta.url),"utf8");
const token="v1."+"A".repeat(55)+"."+"B".repeat(43);
const catalog=[{key:"zeus",group:"losp"},
  {key:"marines",group:"marines"},
  {key:"endgame-revolution-red",group:"endgame"},
  {key:"endgame-revolution-orange",group:"endgame"}];
function setup(role,keys){
  const calls=[];
  const window={LoSP_SESSION:{ok:true,role},LoSP_AUTH_READY:Promise.resolve(),
    LoSPAlliances:{loadAlliances:async()=>{},
      getKnownAlliances:()=>catalog,
      getAllianceMeta:k=>catalog.find(a=>a.key===k)},
    LoSPAccess:{isAllianceAllowed:k=>keys.includes(k)}};
  const fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).startsWith("./data/"))
      return Response.json({version:1,checkpoints:[],players:{}});
    const params=new URL(url).searchParams;
    const alliance=params.get("alliance"),view=params.get("view");
    const id="g_"+alliance+"__player";
    const data={kind:"authorized-guest-evolution",status:"ok",alliance,view};
    if(view==="index")data.index={version:1,
      checkpoints:[{date:"2026-11-08",players:1}],
      players:{[id]:{name:"Player",currentAlliance:alliance,
        checkpoints:["2026-11-08"]}}};
    if(view==="group")data.group={players:[{
      player:"Player",playerKey:id,alliance,totalPower:123}]};
    if(view==="player")data.snapshot={player:"Player",alliance,
      playerKey:id,checkpoint:"2026-11-08",chars:{blob:{power:123}},iso:{}};
    return Response.json(data);
  };
  runInNewContext(source,{window,fetch,
    localStorage:{getItem:()=>token},
    URL,URLSearchParams,encodeURIComponent,Date,Map,Set,Object,Array,Number,String});
  return {app:window.LoSPEvolutionHistory,calls};
}
test("guest sees only private, signed Evolution history",async()=>{
  const {app,calls}=setup("guest",["marines"]);
  const result=await app.loadIndex();
  assert.deepEqual(Object.keys(result.historyIndex.players),["g_marines__player"]);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/guest-evolution/);
  assert.equal(calls[0].options.headers.Authorization,"Bearer "+token);
  assert.equal((await app.group("2026-11-08")).players[0].totalPower,123);
  assert.equal((await app.player("marines","g_marines__player","2026-11-08"))
    .chars.blob.power,123);
});
test("admin isolates same-named guests by alliance",async()=>{
  const {app}=setup("admin",["zeus","endgame-revolution-red",
    "endgame-revolution-orange"]);
  const data=await app.loadIndex();
  const keys=Object.keys(data.historyIndex.players);
  assert.equal(keys.length,2);
  assert.notEqual(keys[0],keys[1]);
});
test("Evolution HTML pages include adapter before consumers",async()=>{
  for(const [page,file] of [["evolution","evolution.js"],
    ["evolution-classement","evolution-classement.js"]]){
    const html=await readFile(new URL("../docs/"+page+".html",import.meta.url),"utf8");
    assert.ok(html.indexOf("evolution-history.js")<html.indexOf(file));
  }
});
