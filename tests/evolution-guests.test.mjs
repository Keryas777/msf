import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../docs/evolution-history.js",import.meta.url),"utf8");
const catalog=[{key:"zeus",group:"losp"},{key:"marines",group:"marines"},
  {key:"endgame-revolution-red",group:"endgame-revolution"},
  {key:"endgame-revolution-orange",group:"endgame-revolution"},
  {key:"questionable-propriety",group:"questionable-propriety"}];
const one={version:1,players:{"g_marines__shared":{name:"Shared",
  currentAlliance:"marines",checkpoints:["2026-11-08"]}},
  checkpoints:[{date:"2026-11-08",players:1}]};
function setup(role,allowed,extraData=[]){
  const calls=[],data=new Map([
    ["./data/alliances.json",catalog],
    ["./data/roster-history/index.json",{version:1,players:{},checkpoints:[]}],
    ["./data/roster-history/guests/marines/index.json",one],
    ["./data/roster-history/guests/endgame-revolution-red/index.json",
      {version:1,players:{"g_endgame-revolution-red__shared":{name:"Shared",
        currentAlliance:"endgame-revolution-red",checkpoints:["2026-11-08"]}},
       checkpoints:[{date:"2026-11-08",players:1}]}],
    ["./data/roster-history/guests/endgame-revolution-red/group/2026-11-08.json",
      {version:1,checkpoint:"2026-11-08",players:[{player:"Shared",
        playerKey:"g_endgame-revolution-red__shared",alliance:"endgame-revolution-red",totalPower:456}]}],
    ["./data/roster-history/guests/marines/group/2026-11-08.json",
      {version:1,checkpoint:"2026-11-08",players:[{player:"Shared",
        playerKey:"g_marines__shared",alliance:"marines",totalPower:123}]}],
    ["./data/roster-history/guests/marines/players/g_marines__shared/2026-11-08.json",
      {player:"Shared",playerKey:"g_marines__shared",alliance:"marines",
        checkpoint:"2026-11-08",chars:{blob:{power:123}},iso:{}}],
    ["./data/infos.json",[{name:"LoSP",alliance:"zeus"}]],
    ["./data/roster-history/guests/marines/infos.json",
      [{name:"Shared",alliance:"marines",icon:"avatar"}]]
  ]);
  for(const [key,value] of extraData)data.set(key,value);
  const window={LoSP_SESSION:{ok:true,role},LoSP_AUTH_READY:Promise.resolve(),
    LoSPAlliances:{loadAlliances:async()=>{},
      getAllianceMeta:k=>catalog.find(a=>a.key===k)},
    LoSPAccess:{isAllianceAllowed:k=>allowed.includes(k)}};
  const fetch=async url=>{
    const key=String(url).split("?")[0];calls.push(key);
    if(!data.has(key))return new Response("",{status:404});
    return Response.json(data.get(key));
  };
  runInNewContext(source,{window,fetch,URL,URLSearchParams,Date,Map,Set,Object,
    Array,Number,String,Promise,Error,TypeError});
  return {app:window.LoSPEvolutionHistory,calls};
}
test("guest history uses static GitHub Pages without a signed token",async()=>{
  const {app,calls}=setup("guest",["marines"]);
  const result=await app.loadIndex();
  assert.deepEqual(Object.keys(result.historyIndex.players),["g_marines__shared"]);
  assert.equal(result.historyIndex.checkpoints[0].players,1);
  assert.equal(calls.some(url=>url.includes("/api/secure/")),false);
  assert.equal((await app.group("2026-11-08")).players[0].totalPower,123);
  assert.equal((await app.player("marines","g_marines__shared","2026-11-08"))
    .chars.blob.power,123);
});
test("administrator may merge multiple allowed guest alliances without homonym collisions",async()=>{
  const {app}=setup("admin",["zeus","marines","endgame-revolution-red"]);
  const result=await app.loadIndex();
  const ids=Object.keys(result.historyIndex.players).sort();
  assert.deepEqual(ids,["g_endgame-revolution-red__shared","g_marines__shared"]);
  assert.equal((await app.group("2026-11-08")).players.length,2);
});
test("unapproved alliances are not fetched",async()=>{
  const {app,calls}=setup("guest",["marines"]);
  await app.loadIndex();
  assert.equal(calls.some(url=>url.includes("endgame-revolution-red")),false);
});
test("optional Infos failure does not prevent a valid history index",async()=>{
  const {app}=setup("admin",["marines"]);
  const result=await app.loadIndex();
  assert.equal(Object.keys(result.historyIndex.players).length,1);
  const infos=await app.infos();
  assert.ok(Array.isArray(infos.infos));
});
test("Evolution HTML pages load shared adapter before their consumers",async()=>{
  for(const [page,consumer] of [["evolution","evolution.js"],
    ["evolution-classement","evolution-classement.js"]]){
    const html=await readFile(new URL("../docs/"+page+".html",import.meta.url),"utf8");
    assert.ok(html.indexOf("evolution-history.js")<html.indexOf(consumer));
  }
});
test("browser reader has no dependency on private guest APIs or localStorage",()=>{
  assert.doesNotMatch(source,/api\/secure\/guest-evolution|api\/secure\/guest-infos/);
  assert.doesNotMatch(source,/localStorage/);
});

test("ranking progress remains alliance-scoped for homonymous guests",async()=>{
  const src=await readFile(new URL("../docs/evolution-classement.js",import.meta.url),"utf8");
  const start=src.indexOf("  function buildRows(");
  const end=src.indexOf("  function clear(node)",start);
  assert.ok(start>=0&&end>start);
  const before=[{player:"Shared",playerKey:"g_marines__shared",alliance:"marines",totalPower:100},
    {player:"Shared",playerKey:"g_endgame-revolution-red__shared",
      alliance:"endgame-revolution-red",totalPower:200}];
  const after=before.map(row=>({...row,totalPower:row.totalPower+90}));
  const rows=runInNewContext(src.slice(start,end)+
    "\nbuildRows({players:arguments[0]},{players:arguments[1]})",{
      arguments:[before,after],window:{LoSPAccess:{isAllianceAllowed:()=>true}}
    });
  assert.equal(rows.length,2);
  assert.notEqual(rows[0].playerKey,rows[1].playerKey);
  assert.ok(rows.every(row=>row.gain===90));
});
test("ranking portrait lookup stays scoped to alliance and player",async()=>{
  const src=await readFile(new URL("../docs/evolution-classement.js",import.meta.url),"utf8");
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

test("legacy QP Nov 8 checkpoint is read from the shared archive without an R2 guest index",async()=>{
  const date="2026-11-08",players={},rows=[];
  for(let i=1;i<=22;i++){
    const name=i===1?"Ada":"QP Player "+i,key=name.toLowerCase().replace(/[^a-z0-9]/g,"");
    players[key]={name,currentAlliance:"questionable-propriety",checkpoints:[date]};
    rows.push({player:name,playerKey:key,alliance:"questionable-propriety",totalPower:i*100});
  }
  const legacyIndex={version:1,players,checkpoints:[{date,players:22}]};
  const legacyGroup={version:1,checkpoint:date,players:rows};
  const legacyPlayer={player:"Ada",playerKey:"ada",alliance:"questionable-propriety",
    checkpoint:date,source:{lateBackfill:true},chars:{hero:{power:321}},iso:{}};
  const {app,calls}=setup("admin",["questionable-propriety"],[
    ["./data/roster-history/index.json",legacyIndex],
    ["./data/roster-history/group/"+date+".json",legacyGroup],
    ["./data/roster-history/players/ada/"+date+".json",legacyPlayer]
  ]);
  const loaded=await app.loadIndex();
  assert.equal(loaded.historyIndex.checkpoints.find(c=>c.date===date).players,22);
  assert.equal(Object.keys(loaded.historyIndex.players).filter(id=>
    id.startsWith("g_questionable-propriety__")).length,22);
  const group=await app.group(date);
  assert.equal(group.players.length,22);
  assert.ok(group.players.every(row=>row.playerKey.startsWith("g_questionable-propriety__")));
  const player=await app.player("questionable-propriety",
    "g_questionable-propriety__ada",date);
  assert.equal(player.chars.hero.power,321);
  assert.equal(player.playerKey,"g_questionable-propriety__ada");
  assert.ok(calls.includes("./data/roster-history/players/ada/"+date+".json"));
});
test("legacy and R2 guest representations of the same checkpoint do not duplicate rank rows",async()=>{
  const date="2026-11-08",legacyIndex={version:1,players:{
    ada:{name:"Ada",currentAlliance:"questionable-propriety",checkpoints:[date]}
  },checkpoints:[{date,players:1}]};
  const guestIndex={version:1,players:{
    "g_questionable-propriety__ada":{name:"Ada",
      currentAlliance:"questionable-propriety",checkpoints:[date]}
  },checkpoints:[{date,players:1}]};
  const {app}=setup("admin",["questionable-propriety"],[
    ["./data/roster-history/index.json",legacyIndex],
    ["./data/roster-history/group/"+date+".json",{version:1,checkpoint:date,
      players:[{player:"Ada",playerKey:"ada",alliance:"questionable-propriety",
        totalPower:100}]}],
    ["./data/roster-history/guests/questionable-propriety/index.json",guestIndex],
    ["./data/roster-history/guests/questionable-propriety/group/"+date+".json",
      {version:1,checkpoint:date,players:[{player:"Ada",
        playerKey:"g_questionable-propriety__ada",
        alliance:"questionable-propriety",totalPower:125}]}]
  ]);
  const loaded=await app.loadIndex();
  assert.equal(Object.keys(loaded.historyIndex.players).filter(id=>
    id==="g_questionable-propriety__ada").length,1);
  assert.equal(loaded.historyIndex.checkpoints.find(c=>c.date===date).players,1);
  const group=await app.group(date);
  assert.equal(group.players.length,1);
  assert.equal(group.players[0].totalPower,125);
});
