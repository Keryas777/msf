import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const window={};
const ctx=vm.createContext({window});
for(const file of ["docs/alliance-trophy-live.js","docs/alliance-season-live.js",
  "docs/alliance-history-data.js"])vm.runInContext(read(file),ctx);
const adapter=window.LoSPGuestSeasonLive;
const prepare=window.LoSPStandingsSeries.prepare;
const registry=JSON.parse(read("docs/data/alliances.json"));
const config=JSON.parse(read("docs/data/alliance-standings/config.json"));
const monday="2026-11-09T03:15:00.000Z";
const marineId=registry.find(a=>a.key==="marines").trophyPublicId;
function make(capturedAt=monday){
  return {status:"ok",version:1,kind:"connected-guest-season-ranks",
    snapshots:[{collectionDayUtc:capturedAt.slice(0,10),capturedAt,
      coverage:{complete:true},alliances:[
        {nameAtCapture:"<color=red>MΛЯIΠΣƨ</color>",
          publicId:marineId,warRank:300,raidRank:80,capturedAt},
        {nameAtCapture:"ENDGAME R-évolution",
          allianceKey:"endgame-revolution-red",warRank:900,raidRank:201,capturedAt},
        {nameAtCapture:"ENDGAME R-évolution",
          allianceKey:"endgame-revolution-orange",warRank:1234,raidRank:405,capturedAt}
      ]}]};
}
test("MARINES guest sees its actual war and raid ranks, never LoSP or fake trophies",()=>{
  const snapshots=adapter.fromCloudflare(make(),registry,key=>key==="marines",
    config.rankingSeasons);
  assert.equal(snapshots.length,1);
  assert.deepEqual(Array.from(snapshots[0].alliances,x=>x.key),["marines"]);
  assert.equal(snapshots[0].seasonId,"2026-10-25/2026-11-08");
  assert.equal(snapshots[0].alliances[0].warRank,300);
  assert.equal(snapshots[0].alliances[0].raidRank,80);
  assert.equal(snapshots[0].alliances[0].warTrophies,null);
  const war=prepare(snapshots,registry,config.charts.find(x=>x.id==="war-season-rank"),
    config.rankingSeasons);
  const raid=prepare(snapshots,registry,config.charts.find(x=>x.id==="raid-season-rank"),
    config.rankingSeasons);
  assert.equal(war.series.find(s=>s.key==="marines").points[0].value,300);
  assert.equal(raid.series.find(s=>s.key==="marines").points[0].value,80);
  assert.equal(prepare(snapshots,registry,config.charts[0],
    config.rankingSeasons).rows.length,0,"rank samples cannot create trophies");
});
test("ENDGAME same-name identities remain separated by verified administrative key",()=>{
  const snapshots=adapter.fromCloudflare(make(),registry,
    key=>key.startsWith("endgame-revolution-"),config.rankingSeasons);
  assert.equal(snapshots.length,1);
  assert.deepEqual(Array.from(snapshots[0].alliances,x=>x.key),[
    "endgame-revolution-red","endgame-revolution-orange"]);
  const war=prepare(snapshots,registry,config.charts[2],config.rankingSeasons);
  assert.equal(war.series.find(x=>x.key==="endgame-revolution-red").points[0].value,900);
  assert.equal(war.series.find(x=>x.key==="endgame-revolution-orange").points[0].value,1234);
});
test("ordinary Mondays and same-name guests without binding never acquire a rank",()=>{
  assert.equal(adapter.fromCloudflare(make("2026-11-16T03:15:00.000Z"),
    registry,()=>true,config.rankingSeasons).length,0);
  const unsigned=make();for(const a of unsigned.snapshots[0].alliances)
    if(a.allianceKey)delete a.allianceKey;
  const onlyMarines=adapter.fromCloudflare(unsigned,registry,()=>true,
    config.rankingSeasons);
  assert.deepEqual(Array.from(onlyMarines[0].alliances,x=>x.key),["marines"]);
  const invalid=make();
  invalid.snapshots[0].alliances[1].allianceKey="zeus";
  assert.equal(adapter.fromCloudflare(invalid,registry,
    key=>key.startsWith("endgame-"),config.rankingSeasons)
    [0].alliances.length,1);
});
test("calendar changes are respected, no hardcoded season schedule",()=>{
  const shifted={...config.rankingSeasons,
    referenceEndExclusiveAt:"2026-10-18T20:00:00.000Z"};
  assert.equal(adapter.fromCloudflare(make(),registry,()=>true,shifted).length,0);
  assert.equal(adapter.fromCloudflare(make(),registry,()=>true,null).length,0);
});
