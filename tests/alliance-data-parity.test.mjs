import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../docs/alliance-data.js",import.meta.url),"utf8");
const signed="v1."+"R".repeat(60)+"."+"T".repeat(43);
const registry=[
  {key:"zeus",name:"Zeus",group:"losp"},
  {key:"marines",name:"MARINES",group:"marines"},
  {key:"endgame-revolution-red",name:"ENDGAME R-évolution",group:"endgame"},
  {key:"endgame-revolution-orange",name:"ENDGAME R-évolution",group:"endgame"}
];
const info=(name,alliance)=>({name,alliance,tcp:500000000,
  war_mvp:30,icon:"https://assets.marvelstrikeforce.com/imgs/icon.png",
  frame:"",rank:"captain",rosterShare:false,stp:22000000,
  latestArena:12,charactersCollected:380});
const roster=(player,alliance,power)=>({player,alliance,
  chars:{blob:{power}},iso:{blob:{isoClass:"raider",isoColor:"purple"}}});
function setup(role,keys,{token=signed,missing=false}={}){
  const calls=[];
  const byKey=new Map(registry.map(x=>[x.key,x]));
  const window={LoSP_SESSION:{ok:true,role,allowedAlliances:keys},
    LoSP_AUTH_READY:Promise.resolve(),
    LoSPAlliances:{loadAlliances:async()=>registry,
      getKnownAlliances:()=>registry,
      getAllianceMeta:value=>byKey.get(value)||
        registry.find(a=>a.name===value)||null},
    LoSPAccess:{isAllianceAllowed:value=>keys.includes(
      byKey.has(value)?value:registry.find(a=>a.name===value)?.key)}
  };
  const fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.startsWith("./data/infos.json"))
      return Response.json([info("Zeus member","Zeus"),info("SECRET","marines")]);
    if(url.startsWith("./data/joueurs.json"))
      return Response.json([{player:"Zeus member",alliance:"Zeus"},
        {player:"SECRET",alliance:"marines"}]);
    if(url.startsWith("./data/rosters.json"))
      return Response.json([roster("Zeus member","Zeus",100),
        roster("SECRET","marines",9999)]);
    if(missing)return new Response(null,{status:503});
    if(url.includes("/guest-infos"))
      return Response.json({status:"ok",kind:"authorized-guest-infos",
        alliances:keys.filter(x=>x!=="zeus").map(key=>({
          alliance:key,state:"complete",
          players:[info("Shared Name",key),info("Not sharing",key)]
        }))});
    if(url.includes("/guest-rosters"))
      return Response.json({status:"ok",kind:"authorized-guest-rosters",
        alliance:new URL(url).searchParams.get("alliance"),
        state:"complete",rosters:[
          roster("Shared Name",new URL(url).searchParams.get("alliance"),200)
        ]});
    throw Error("unexpected request "+url);
  };
  runInNewContext(source,{window,localStorage:{getItem:()=>token},fetch,
    document:{},Date,URL,Set,Map,Number,Object,Array,String,RegExp,
    encodeURIComponent,console});
  return {window,calls};
}
const load=(x,options)=>x.window.LoSPAllianceData.load(options);
test("MARINES gets complete Infos, non-sharing membership and authorized rosters",async()=>{
  const x=setup("guest",["marines"]);
  const result=await load(x,{infos:true,joueurs:true,rosters:true});
  assert.equal(result.infos.length,2);
  assert.equal(result.infos[0].stp,22000000);
  assert.equal(result.infos[0].rosterShare,false);
  assert.equal(result.joueurs.length,2);
  assert.equal(result.rosters.length,1);
  assert.equal(result.rosters[0].chars.blob.power,200);
  assert.ok(x.calls.every(c=>c.url.includes("/api/secure/")));
  assert.ok(x.calls.every(c=>c.options.headers.Authorization==="Bearer "+signed));
  assert.equal(result.warnings.length,0);
});
test("LoSP members keep existing public sources without private calls",async()=>{
  const x=setup("member",["zeus"]);
  const r=await load(x,{infos:true,joueurs:true,rosters:true});
  assert.deepEqual(Array.from(r.infos,p=>p.name),["Zeus member"]);
  assert.deepEqual(Array.from(r.rosters,p=>p.player),["Zeus member"]);
  assert.deepEqual(Array.from(r.joueurs,p=>p.player),["Zeus member"]);
  assert.equal(x.calls.length,3);
  assert.ok(x.calls.every(c=>c.url.startsWith("./data/")));
});
test("admin combines LoSP and distinct same-named ENDGAME groups safely",async()=>{
  const keys=["zeus","endgame-revolution-red","endgame-revolution-orange"];
  const x=setup("admin",keys);
  const r=await load(x,{infos:true,joueurs:true,rosters:true});
  assert.equal(r.infos.length,5);
  assert.equal(r.rosters.length,3);
  assert.equal(r.joueurs.length,5);
  assert.deepEqual(Array.from(r.infos.filter(p=>p.name==="Shared Name"),
    p=>p.alliance),["endgame-revolution-red","endgame-revolution-orange"]);
  assert.ok(x.calls.some(c=>c.url.includes("alliances=approved")));
});
test("legacy unsigned guest session receives no LoSP data and no R2 calls",async()=>{
  const x=setup("guest",["marines"],{token:"legacy-unsigned"});
  const r=await load(x,{infos:true,joueurs:true,rosters:true});
  assert.equal(r.infos.length,0);
  assert.equal(r.joueurs.length,0);
  assert.equal(r.rosters.length,0);
  assert.equal(x.calls.length,0);
  assert.match(r.warnings.join(" "),/signée nécessaire/);
});
test("guest API failure never falls back to public data or fabricates rosters",async()=>{
  const x=setup("guest",["marines"],{missing:true});
  const r=await load(x,{infos:true,joueurs:true,rosters:true});
  assert.equal(r.infos.length,0);
  assert.equal(r.joueurs.length,0);
  assert.equal(r.rosters.length,0);
  assert.match(r.warnings.join(" "),/HTTP 503/);
});
test("alliance pages load shared data before their consuming scripts",async()=>{
  for(const [page,script] of [
    ["index","app"],["iso","iso"],["joueur","joueur"]]){
    const html=await readFile(new URL("../docs/"+page+".html",import.meta.url),"utf8");
    assert.match(html,/alliance-data.js/);
    assert.ok(html.indexOf("alliance-data.js")<html.indexOf(script+".js"));
  }
});

test("ISO and player pages scope same-named guest identities by alliance",async()=>{
  const iso=await readFile(new URL("../docs/iso.js",import.meta.url),"utf8");
  const player=await readFile(new URL("../docs/joueur.js",import.meta.url),"utf8");
  assert.match(iso,/const pKey = allianceK \+ ":" \+ normalizeKey\(player\)/);
  assert.match(iso,/ROSTER_ISO_MAP\.set\(pKey, out\)/);
  assert.match(player,/getSelectedInfo\(\) \{\s*return findInfoByPlayerKey\(state\.selectedPlayerKey\)/);
  assert.match(player,/sameAlliance\(i, allianceK\)/);
});
