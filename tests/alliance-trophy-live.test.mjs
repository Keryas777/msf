import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../docs/alliance-trophy-live.js",import.meta.url),"utf8");
const context=vm.createContext({window:{}});
vm.runInContext(source,context);
const adapter=context.window.LoSPTrophyLive;
const registry=JSON.parse(readFileSync(new URL("../docs/data/alliances.json",import.meta.url),"utf8"));
const sample=(day,allianceRows)=>({collectionDayUtc:day,
  capturedAt:day+"T02:15:00Z",coverage:{observed:allianceRows.length,
    expected:7,complete:false},alliances:allianceRows.map(([name,n])=>({
    nameAtCapture:name,warTrophies:n,capturedAt:day+"T02:05:00Z"
  }))});
const payload=snapshots=>({status:"ok",kind:"connected-alliance-trophy-history",snapshots});
const allowed=key=>["zeus","marines"].includes(key);

test("actual connected MARINES is added, unconnected ENDGAME is not invented",()=>{
  const records=adapter.fromCloudflare(payload([sample("2026-11-05",[
    ["Zeus",3040],["MARINES",2400]])]),registry,allowed);
  assert.equal(records.length,1);
  assert.deepEqual([...records[0].alliances].map(a=>a.key).sort().join(","),
    "marines,zeus");
  assert.equal(records[0].alliances[1].warTrophies,2400);
  assert.equal(records[0].coverage.completeSessionScan,false);
});

test("same-name ENDGAME alliances are never guessed from an ambiguous public name",()=>{
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry),null);
  assert.equal(adapter.mappedKey("MΛЯIΠΣƧ",registry),"marines");
  assert.equal(adapter.mappedKey("LoSP Zευs",registry),"zeus");
  assert.equal(adapter.mappedKey("LoSP Zεμs",registry),"zeus");
});

test("group permissions filter guest data even if the API returns other alliances",()=>{
  const records=adapter.fromCloudflare(payload([sample("2026-11-05",[
    ["MARINES",2250],["Zeus",3000]])]),registry,key=>key==="marines");
  assert.equal(records.length,1);
  assert.equal(records[0].alliances.length,1);
  assert.equal(records[0].alliances[0].key,"marines");
});

test("static fallback, one checkpoint per day, seasons remain untouched",()=>{
  const local={kind:"losp-alliance-standings-snapshot",
    capturedAt:"2026-11-05T03:00:00Z",collectionDayUtc:"2026-11-05",
    alliances:[{key:"zeus",warTrophies:3010}]};
  const season={kind:"losp-alliance-standings-snapshot",captureType:"season-ranks",
    capturedAt:"2026-11-05T04:00:00Z",alliances:[]};
  const remote=payload([sample("2026-11-05",[
    ["Zeus",3040],["MARINES",2400]])]);
  const result=adapter.merge([local,season],remote,registry,allowed);
  assert.equal(result.length,2);
  assert.ok(result.includes(season));
  assert.equal(result.find(x=>x.collectionDayUtc==="2026-11-05").alliances.length,2);
  const fallback=adapter.merge([local,season],null,registry,allowed);
  assert.equal(fallback.length,2);
  assert.ok(fallback.includes(local));
});


test("real MARINES U+01A8 glyph is visible to admin and MARINES preview",()=>{
  // The official capture can use lowercase ƨ rather than uppercase Ƨ.
  // The two glyphs look almost identical but were matched differently.
  const realName="<color=red>MΛЯIΠΣƨ</color>";
  assert.equal(adapter.mappedKey(realName,registry),"marines");
  const live=payload([sample("2026-11-05",[
    ["LoSP <#F8FF00>Zεμs",2941],[realName,3205]])]);
  const admin=adapter.fromCloudflare(live,registry,()=>true);
  assert.equal(admin.length,1);
  assert.equal(admin[0].alliances.length,2);
  const guest=adapter.fromCloudflare(live,registry,key=>key==="marines");
  assert.equal(guest.length,1);
  assert.equal(guest[0].alliances.length,1);
  assert.equal(guest[0].alliances[0].key,"marines");
  assert.equal(guest[0].alliances[0].warTrophies,3205);
  // An invited alliance must not count unrelated historical LoSP snapshots.
  const older=[{kind:"losp-alliance-standings-snapshot",
    capturedAt:"2026-10-31T02:02:50.024Z",
    alliances:[{key:"zeus",warTrophies:2900}]}];
  const scoped=adapter.merge(older,live,registry,key=>key==="marines")
    .map(row=>({...row,
      alliances:row.alliances.filter(a=>a.key==="marines")}))
    .filter(row=>row.alliances.length);
  assert.equal(scoped.length,1);
  assert.equal(scoped[0].collectionDayUtc,"2026-11-05");
});

test("real 5 November Scopely formatted names resolve all seven alliances",()=>{
  const names=[
    ["LoSP <#F8FF00>Zεμs","zeus"],
    ["LoSP <#93328E>Diσπγsσs","dionysos"],
    ["<#FFFFFF>LoSP <#E10D17>Kronos","kronos"],
    ["<color=red>MΛЯIΠΣƧ</color>","marines"],
    ["LoSP <#F28C28>Athεηα","athena"],
    ["LoSP <#0000FF>Posειδoη","poseidon"],
    ["LoSP <#1EA164>Hαδεs","hades"]
  ];
  for(const [realName,key] of names){
    assert.equal(adapter.mappedKey(realName,registry),key,realName);
  }
  const records=adapter.fromCloudflare(payload([sample("2026-11-05",
    names.map(([name],i)=>[name,2800+i]))]),registry,()=>true);
  assert.equal(records[0].alliances.length,7);
  assert.equal(new Set(records[0].alliances.map(a=>a.key)).size,7);
});
