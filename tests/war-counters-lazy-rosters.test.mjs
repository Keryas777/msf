import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("docs/war-counters.js");
const from=source.indexOf("  const GUEST_ROSTERS_API =");
const to=source.indexOf("  function renderAllianceOptions() {",from);
assert.ok(from>=0&&to>from,"the on-demand roster loader must exist");
const lazyLoader=source.slice(from,to);

const normalized=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const registry={
  zeus:{key:"zeus",sourceKey:"zeus",group:"losp",name:"Zeus"},
  marines:{key:"marines",sourceKey:"marines",group:"marines",name:"MARINES"},
  endgamerevolutionred:{key:"endgamerevolutionred",
    sourceKey:"endgame-revolution-red",group:"endgame-revolution",name:"ENDGAME Red"},
  endgamerevolutionorange:{key:"endgamerevolutionorange",
    sourceKey:"endgame-revolution-orange",group:"endgame-revolution",name:"ENDGAME Orange"}
};
const roster=(key,name,power)=>({alliance:registry[key].sourceKey,player:name,
  chars:{blob:{power}},iso:{}});
function loader({permitted=["marines"],staticRead,guestRead,token}={}){
  const calls=[],selected={value:permitted[0]||""},
    cache=new Map(),rows=new Map(),mapCalls=[],rendered=[];
  const allowed=new Set(permitted);
  const context={
    ROSTER_CACHE:cache,ROSTER_ROWS:rows,rosterRequestSerial:0,
    LOCAL_SESSION_KEY:"losp_session",
    allianceSelect:selected,playerSelect:{value:"",disabled:false,options:[]},
    resultsWrap:null,resultsCount:null,
    isAllianceAllowed:key=>allowed.has(key),
    getAllianceMeta:key=>registry[key]||null,
    getAllianceLabel:key=>registry[key]?.name||key,
    allianceKey:normalized,console,encodeURIComponent,URL,
    fetchJson:async path=>{
      calls.push({type:"static",path});
      if(staticRead)return staticRead(path);
      const name=Object.keys(registry).find(key=>
        path.includes("rosters_"+registry[key].sourceKey+".json"));
      return [roster(name,"Same",10)];
    },
    fetch:async(url,options)=>{
      calls.push({type:"private",url,options});
      return guestRead?guestRead(url,options):Response.json({status:"ok",
        kind:"authorized-guest-rosters",alliance:new URL(url).searchParams.get("alliance"),
        state:"complete",rosters:[roster(normalized(new URL(url).searchParams.get("alliance")),"Same",25)]});
    },
    localStorage:{getItem:()=>token??"v1."+"A".repeat(55)+"."+"B".repeat(43)},
    buildRosterMap:(value,key)=>mapCalls.push({key,rows:value}),
    buildPlayersByAlliance:()=>{},
    renderPlayerOptions:()=>rendered.push(selected.value),
    selectPlayerByName:()=>false,
    selectBestPlayerForCurrentAlliance:()=>false,
    renderAll:()=>{},
    clearNode:()=>{},
    document:{createElement:()=>({})}
  };
  const api=runInNewContext(lazyLoader+
    "\n({loadSelectedAllianceRoster,fetchAllianceRoster})",context);
  return {api,calls,selected,cache,rows,rendered,mapCalls,allowed,context};
}

test("both counter pages load roster files lazily, never combined rosters.json",()=>{
  assert.doesNotMatch(source,/fetchJson\(FILES\.rosters\)|\.\/data\/rosters\.json/);
  assert.match(source,/\.\/data\/rosters_" \+ meta\.sourceKey \+ "\.json"/);
  for(const page of ["war-counters","cosmic-counters"]){
    const html=read("docs/"+page+".html");
    assert.match(html,/war-counters\.js\?v=/);
  }
});
test("MARINES fetches only marines roster and caches it during that tab session",async()=>{
  const x=loader();
  await x.api.loadSelectedAllianceRoster();
  await x.api.loadSelectedAllianceRoster();
  assert.equal(x.calls.length,1);
  assert.match(x.calls[0].path,/rosters_marines\.json/);
  assert.equal(x.rows.get("marines")[0].player,"Same");
  assert.equal(x.mapCalls.length,1);
  assert.equal(x.rendered.length,2);
});
test("ENDGAME hyphenated slug stays intact; second alliance fetched only when selected",async()=>{
  const x=loader({permitted:["endgamerevolutionred","endgamerevolutionorange"]});
  await x.api.loadSelectedAllianceRoster();
  assert.match(x.calls[0].path,/rosters_endgame-revolution-red\.json/);
  x.selected.value="endgamerevolutionorange";
  await x.api.loadSelectedAllianceRoster();
  assert.match(x.calls[1].path,/rosters_endgame-revolution-orange\.json/);
  x.selected.value="endgamerevolutionred";
  await x.api.loadSelectedAllianceRoster();
  assert.equal(x.calls.length,2);
  assert.equal(x.rows.size,2);
});
test("a disabled/foreign alliance cannot cause a roster network call",async()=>{
  const x=loader({permitted:["marines"]});
  x.selected.value="zeus";
  await x.api.loadSelectedAllianceRoster();
  assert.equal(x.calls.length,0);
  await assert.rejects(x.api.fetchAllianceRoster("zeus"),/non autorisée/);
  assert.equal(x.calls.length,0);
});
test("guest with no published file can read its own signed R2 projection only",async()=>{
  const x=loader({staticRead:async()=>{throw Error("HTTP 404");}});
  await x.api.loadSelectedAllianceRoster();
  assert.deepEqual(x.calls.map(c=>c.type),["static","private"]);
  const request=x.calls[1];
  assert.equal(new URL(request.url).searchParams.get("alliance"),"marines");
  assert.match(request.options.headers.Authorization,/^Bearer v1\./);
  assert.equal(x.rows.get("marines")[0].chars.blob.power,25);
});
test("a guest without a signed Discord token cannot access the private fallback",async()=>{
  const x=loader({token:"legacy-unsigned",staticRead:async()=>{throw Error("HTTP 404");}});
  await x.api.loadSelectedAllianceRoster();
  assert.equal(x.calls.filter(c=>c.type==="private").length,0);
  assert.equal(x.cache.size,0,"a failed request remains retryable");
});
test("a mismatched roster alliance is rejected instead of leaking foreign players",async()=>{
  const x=loader({staticRead:async()=>[roster("zeus","Other",999)]});
  await x.api.loadSelectedAllianceRoster();
  assert.equal(x.rows.size,0);
  assert.equal(x.cache.size,0);
  assert.equal(x.mapCalls.length,0);
});
test("rapid alliance switching cannot render an outdated response",async()=>{
  const resolvers=new Map();
  const x=loader({permitted:["zeus","marines"],staticRead:path=>
    new Promise(resolve=>resolvers.set(path,resolve))});
  x.selected.value="zeus";
  const first=x.api.loadSelectedAllianceRoster();
  x.selected.value="marines";
  const second=x.api.loadSelectedAllianceRoster();
  const paths=[...resolvers.keys()];
  resolvers.get(paths.find(p=>p.includes("marines")))?.([roster("marines","Same",300)]);
  await second;
  resolvers.get(paths.find(p=>p.includes("zeus")))?.([roster("zeus","Same",100)]);
  await first;
  assert.deepEqual(x.rendered,["marines"]);
  assert.equal(x.rows.size,2);
});
test("same nickname in two alliances cannot merge character powers",()=>{
  const first=source.indexOf("  function rosterIdentity(");
  const last=source.indexOf("  function getMatchingSeasonRule(",first);
  assert.ok(first>0&&last>first);
  const map=new Map();
  const env={ROSTERS:map,allianceSelect:{value:"marines"},
    normalizeKey:normalized,allianceKey:normalized,console};
  const api=runInNewContext(source.slice(first,last)+
    "\n({rosterIdentity,buildRosterMap,getPlayerRawPower})",env);
  api.buildRosterMap([roster("marines","Same",300)],"marines");
  api.buildRosterMap([roster("zeus","Same",100)],"zeus");
  assert.equal(api.getPlayerRawPower("Same",["blob"]),300);
  env.allianceSelect.value="zeus";
  assert.equal(api.getPlayerRawPower("Same",["blob"]),100);
  assert.equal(map.size,2);
});
test("guest roster players populate the player selector without manual joueurs.json",()=>{
  const first=source.indexOf("  function buildPlayersByAlliance() {");
  const last=source.indexOf("  const GUEST_ROSTERS_API =",first);
  assert.ok(first>0&&last>first);
  const env={PLAYERS_BY_ALLIANCE:new Map(),JOUEURS:[
    {alliance:"zeus",player:"LoSP directory player"}],
    ROSTER_ROWS:new Map([["marines",[roster("marines","Marine One",1),
      roster("marines","Marine Two",2)]]]),
    rosterIdentity:(a,p)=>normalized(a)+":"+normalized(p),
    allianceKey:normalized,isAllianceAllowed:key=>key==="marines",
    getAllianceMeta:key=>registry[normalized(key)]||null};
  const build=runInNewContext(source.slice(first,last)+
    "\n(buildPlayersByAlliance)",env);
  build();
  assert.equal(env.PLAYERS_BY_ALLIANCE.get("marines").length,2);
  assert.equal(env.PLAYERS_BY_ALLIANCE.get("zeus"),undefined);
});

test("Discord scope is refreshed before building the initial LoSP directory",()=>{
  const boot=source.slice(source.indexOf("  async function boot() {"));
  const refresh=boot.indexOf("    refreshLoSPSession();");
  const directory=boot.indexOf("    buildPlayersByAlliance();");
  assert.ok(refresh>=0&&directory>refresh,
    "LoSP members without a shared roster must remain selectable on first boot");
});
