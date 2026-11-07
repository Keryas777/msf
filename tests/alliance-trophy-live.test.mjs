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


test("5 November MARINES: bind official publicId even when decorative glyphs change",()=>{
  // Observed publicId in the real 7/7 Worker projection, not a provider ID.
  const publicId="83937048-ec30-47d3-8b56-cca351fca34b";
  const name="<color=red>MΛЯIΠΣꙅ</color>"; // Simulate another unhandled stylized glyph.
  assert.equal(adapter.mappedKey(name,registry),null);
  assert.equal(adapter.mappedKey(name,registry,publicId),"marines");
  const live=payload([sample("2026-11-05",[["Zeus",2941]])]);
  live.snapshots[0].alliances.push({
    publicId,nameAtCapture:name,warTrophies:3205,
    capturedAt:"2026-11-05T02:02:50.024Z"
  });
  const admin=adapter.fromCloudflare(live,registry,()=>true);
  assert.equal(admin.length,1);
  assert.equal(admin[0].alliances.find(x=>x.key==="marines").warTrophies,3205);
  const guest=adapter.fromCloudflare(live,registry,key=>key==="marines");
  assert.equal(guest.length,1);
  assert.deepEqual(Array.from(guest[0].alliances,x=>x.key),["marines"]);
  assert.equal(guest[0].alliances[0].warTrophies,3205);
  const forbidden=adapter.fromCloudflare(live,registry,key=>key==="zeus");
  assert.equal(forbidden[0].alliances.some(x=>x.key==="marines"),false);
  assert.equal(adapter.mappedKey(name,registry,"00000000-0000-0000-0000-000000000000"),null);
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry),null);
  const duplicate=registry.map(entry=>({...entry}));
  duplicate.find(entry=>entry.key==="endgame-revolution-red").trophyPublicId=publicId;
  assert.equal(adapter.mappedKey(name,duplicate,publicId),null);
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

test("5 November: merge LoSP and guest trophies by key before the Discord view filter",()=>{
  const published=JSON.parse(readFileSync(new URL(
    "../docs/data/alliance-standings/snapshots/2026-11-05T032350024Z.json",
    import.meta.url),"utf8"));
  const live=payload([sample("2026-11-05",[
    ["LoSP <#F8FF00>Zεμs",2940],
    ["<color=red>MΛЯIΠΣƨ</color>",3205]
  ])]);
  const guest=adapter.merge([published],live,registry,key=>key==="marines");
  assert.equal(guest.length,1,"one real daily checkpoint, not two");
  assert.equal(guest[0].alliances.length,7,
    "keep the six published alliances and add the approved guest");
  const preview=guest[0].alliances.filter(a=>a.key==="marines");
  assert.equal(preview.length,1);
  assert.equal(preview[0].warTrophies,3205);
  assert.equal(guest[0].captureType,undefined,
    "retain the published snapshot's eligibility for season ranks");
  const admin=adapter.merge([published],live,registry,()=>true);
  assert.equal(admin[0].alliances.length,7);
  assert.equal(admin[0].alliances.filter(a=>a.key==="marines").length,1);
  assert.equal(admin[0].alliances.find(a=>a.key==="zeus").warTrophies,2941,
    "the newer real static Zeus observation wins over older Cloudflare data");
  assert.equal(admin[0].alliances.find(a=>a.key==="zeus").warRank,55);
  const losp=admin[0].alliances.filter(a=>a.key==="zeus");
  assert.equal(losp.length,1,"never duplicate overlapping alliance keys");
});

test("same-day newer live trophy value keeps static rank fields",()=>{
  const published=JSON.parse(readFileSync(new URL(
    "../docs/data/alliance-standings/snapshots/2026-11-05T032350024Z.json",
    import.meta.url),"utf8"));
  const live=payload([sample("2026-11-05",[["Zeus",3000]])]);
  live.snapshots[0].capturedAt="2026-11-05T03:40:00Z";
  live.snapshots[0].alliances[0].capturedAt="2026-11-05T03:40:00Z";
  const rows=adapter.merge([published],live,registry,()=>true);
  assert.equal(rows.length,1);
  assert.equal(rows[0].capturedAt,"2026-11-05T03:40:00Z");
  assert.equal(rows[0].alliances.length,6);
  const zeus=rows[0].alliances.find(a=>a.key==="zeus");
  assert.equal(zeus.warTrophies,3000);
  assert.equal(zeus.warRank,55);
  assert.equal(zeus.raidRank,31);
  assert.equal(zeus.capturedAt,"2026-11-05T03:40:00Z");
  assert.equal(rows[0].captureType,undefined);
  const standalone=adapter.merge([],live,registry,()=>true);
  assert.equal(standalone[0].captureType,"war-trophies",
    "live-only days never become invented season-rank checkpoints");
});

test("7 November: actual orange ENDGAME trophies resolve through the approved key",()=>{
  const live=payload([{collectionDayUtc:"2026-11-07",
    capturedAt:"2026-11-07T02:12:50.024Z",coverage:{observed:8,expected:8,
      complete:true},
    alliances:[{publicId:"a2f70310-f183-42e0-987a-73764c07ae5d",
      allianceKey:"endgame-revolution-orange",
      nameAtCapture:"END<color=#f60>GAME R-évolution",
      capturedAt:"2026-11-07T02:00:50.024Z",warTrophies:2534}]}]);
  const guest=adapter.fromCloudflare(live,registry,
    key=>key==="endgame-revolution-orange");
  assert.equal(guest.length,1);
  assert.equal(guest[0].alliances.length,1);
  assert.equal(guest[0].alliances[0].key,"endgame-revolution-orange");
  assert.equal(guest[0].alliances[0].warTrophies,2534);
  assert.equal(guest[0].coverage.completeSessionScan,true);
  assert.equal(adapter.fromCloudflare(live,registry,
    key=>key==="endgame-revolution-red").length,0,
    "a red-group viewer must never see the orange alliance's trophies");
});
test("eight ENDGAME variants with the same name and different colours stay separate",()=>{
  const future=["blue","green","purple","yellow","white","black"];
  const variants=[
    ...registry.filter(a=>a.group==="endgame-revolution"),
    ...future.map((colour,i)=>({key:"endgame-revolution-"+colour,
      name:"ENDGAME R-évolution",group:"endgame-revolution",
      color:["#0073ff","#00a164","#9900cc","#ffff00",
        "#ffffff","#222222"][i]}))
  ];
  assert.equal(variants.length,8);
  const rows=variants.map((variant,i)=>({
    publicId:"10000000-0000-4000-8000-"+String(i+1).padStart(12,"0"),
    allianceKey:variant.key,
    nameAtCapture:"END<color="+variant.color+">GAME R-évolution",
    capturedAt:"2026-11-07T02:05:00Z",
    warTrophies:2500+i
  }));
  const live=payload([{collectionDayUtc:"2026-11-07",
    capturedAt:"2026-11-07T02:15:00Z",coverage:{observed:8,expected:8,
      complete:true},alliances:rows}]);
  const results=adapter.fromCloudflare(live,variants,()=>true);
  assert.equal(results.length,1);
  assert.equal(results[0].alliances.length,8);
  assert.deepEqual(new Set(results[0].alliances.map(a=>a.key)),
    new Set(variants.map(a=>a.key)));
  const white=adapter.fromCloudflare(live,variants,
    key=>key==="endgame-revolution-white");
  assert.deepEqual(Array.from(white[0].alliances,a=>a.key),
    ["endgame-revolution-white"]);
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",variants),null,
    "shared names must remain ambiguous without an approved key");
});
test("invalid, unknown or contradictory bindings fail closed",()=>{
  const id="a2f70310-f183-42e0-987a-73764c07ae5d";
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry,id,
    "endgame-revolution-unknown"),null);
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry,id,
    "endgame-revolution-orange/other"),null);
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry,undefined,
    "endgame-revolution-orange"),null);
  assert.equal(adapter.mappedKey("Zeus",registry,id,"zeus"),null,
    "a guest key must not silently override a LoSP identity");
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry,
    "83937048-ec30-47d3-8b56-cca351fca34b",
    "endgame-revolution-orange"),null,
    "a known MARINES public ID must not be rebound to ENDGAME");
  assert.equal(adapter.mappedKey("ENDGAME R-évolution",registry,id,
    "endgame-revolution-orange"),"endgame-revolution-orange");
  assert.equal(adapter.fromCloudflare(payload([{
    collectionDayUtc:"2026-11-07",capturedAt:"2026-11-07T02:15:00Z",
    alliances:[{publicId:id,allianceKey:"endgame-revolution-unknown",
      nameAtCapture:"ENDGAME R-évolution",
      capturedAt:"2026-11-07T02:05:00Z",warTrophies:2534}]
  }]),registry,()=>true).length,0);
});
