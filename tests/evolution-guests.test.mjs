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
    if(String(url).startsWith("./data/alliances.json"))
      return Response.json(catalog);
    if(String(url).startsWith("./data/infos.json"))
      return Response.json([{name:"LoSP",alliance:"zeus",icon:"",frame:""}]);
    if(String(url).startsWith("./data/"))
      return Response.json({version:1,checkpoints:[],players:{}});
    const params=new URL(url).searchParams;
    if(String(url).includes("/api/secure/guest-infos"))
      return Response.json({status:"ok",kind:"authorized-guest-infos",
        alliances:[{alliance:params.get("alliances"),state:"complete",
          players:[{alliance:params.get("alliances"),name:"Player",
            icon:"secure-icon",frame:"secure-frame"}]}]});
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
  assert.equal(calls.length,2);
  assert.match(calls[1].url,/guest-evolution/);
  assert.equal(calls[1].options.headers.Authorization,"Bearer "+token);
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
  assert.deepEqual(keys.sort(),[
    "g_endgame-revolution-orange__player",
    "g_endgame-revolution-red__player"]);
  assert.equal(Object.keys(data.historyIndex.players).every(
    id=>id.includes("endgame-revolution-")),true);
});
test("Evolution HTML pages include adapter before consumers",async()=>{
  for(const [page,file] of [["evolution","evolution.js"],
    ["evolution-classement","evolution-classement.js"]]){
    const html=await readFile(new URL("../docs/"+page+".html",import.meta.url),"utf8");
    assert.ok(html.indexOf("evolution-history.js")<html.indexOf(file));
  }
});

test("progression ranks keep two same-named guests distinct",async()=>{
  const src=await readFile(new URL("../docs/evolution-classement.js",
    import.meta.url),"utf8");
  const start=src.indexOf("  function buildRows(");
  const end=src.indexOf("  function clear(node)",start);
  assert.ok(start>=0&&end>start);
  const original=[
    {player:"Shared",playerKey:"g_marines__shared",
      alliance:"marines",totalPower:100},
    {player:"Shared",playerKey:"g_endgame-revolution-red__shared",
      alliance:"endgame-revolution-red",totalPower:200}
  ];
  const current=original.map(p=>({...p,totalPower:p.totalPower+90}));
  const rows=runInNewContext(src.slice(start,end)+
    "\nbuildRows({players:arguments[0]},{players:arguments[1]})",{
      arguments:[original,current],
      window:{LoSPAccess:{isAllianceAllowed:()=>true}}
    });
  assert.equal(rows.length,2);
  assert.notEqual(rows[0].playerKey,rows[1].playerKey);
  assert.ok(rows.every(row=>row.gain===90));
});
test("ranking portraits stay scoped to alliance plus player",async()=>{
  const src=await readFile(new URL("../docs/evolution-classement.js",
    import.meta.url),"utf8");
  const start=src.indexOf("  function infoIdentity(");
  const end=src.indexOf("  function buildRows(",start);
  assert.ok(start>=0&&end>start);
  const rows=runInNewContext(src.slice(start,end)+
    "\nbuildInfoMap(arguments[0]);"+
    "\n[playerInfo({player:'Shared',alliance:'marines'}),"+
    "playerInfo({player:'Shared',alliance:'endgame-revolution-red'})]",{
      arguments:[[{name:"Shared",alliance:"marines",icon:"M"},
        {name:"Shared",alliance:"endgame-revolution-red",icon:"E"}]],
      state:{infosByPlayer:new Map()},
      normalizeKey:s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,""),
      allianceKey:s=>String(s).toLowerCase(),
      window:{LoSPAlliances:{getAllianceKey:s=>s},
        LoSPAccess:{isAllianceAllowed:()=>true}}
    });
  assert.equal(rows[0].icon,"M");
  assert.equal(rows[1].icon,"E");
});

test("guest Infos use signed canonical hyphenated keys",async()=>{
  const x=setup("guest",["endgame-revolution-red"]);
  await x.app.loadIndex();
  const result=await x.app.infos();
  assert.equal(result.infos.length,1);
  assert.equal(result.infos[0].alliance,"endgame-revolution-red");
  const privateRead=x.calls.find(c=>c.url.includes("/guest-infos"));
  assert.ok(privateRead);
  assert.equal(new URL(privateRead.url).searchParams.get("alliances"),
    "endgame-revolution-red");
  assert.equal(privateRead.options.headers.Authorization,"Bearer "+token);
});
