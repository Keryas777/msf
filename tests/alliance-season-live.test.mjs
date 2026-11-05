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
test("ordinary midseason captures retain the last completed season; unknown ENDGAME remains hidden",()=>{
  const midseason=adapter.fromCloudflare(make("2026-11-16T03:15:00.000Z"),
    registry,()=>true,config.rankingSeasons);
  assert.equal(midseason.length,1);
  assert.equal(midseason[0].seasonId,"2026-10-25/2026-11-08");
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
  const recalculated=adapter.fromCloudflare(make(),registry,()=>true,shifted);
  assert.equal(recalculated.length,1);
  assert.equal(recalculated[0].seasonId,"2026-10-18/2026-11-01");
  assert.equal(adapter.fromCloudflare(make(),registry,()=>true,null).length,0);
});

test("NOV 5 confirmed MARINES war and raid ranks are attributed to OCT 11–25",()=>{
  const capturedAt="2026-11-05T15:15:00.000Z";
  const payload=make(capturedAt);
  const marine=payload.snapshots[0].alliances[0];
  marine.manualSeasonId="2026-10-11/2026-10-25";
  marine.seasonConfirmation="admin-in-game";
  const snapshots=adapter.fromCloudflare(payload,registry,key=>key==="marines",
    config.rankingSeasons);
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0].captureType,"season-ranks");
  assert.equal(snapshots[0].capturedAt,capturedAt,"do not backdate actual measurement");
  assert.equal(snapshots[0].seasonId,"2026-10-11/2026-10-25");
  assert.equal(snapshots[0].rankingSeason.identification,"admin-in-game");
  const charts=config.charts;
  const war=prepare(snapshots,registry,charts.find(c=>c.id==="war-season-rank"),
    config.rankingSeasons);
  const raid=prepare(snapshots,registry,charts.find(c=>c.id==="raid-season-rank"),
    config.rankingSeasons);
  assert.equal(war.series[0].points[0].value,300);
  assert.equal(raid.series[0].points[0].value,80);
  assert.equal(war.series[0].points[0].seasonId,"2026-10-11/2026-10-25");
  assert.equal(prepare(snapshots,registry,charts[0],config.rankingSeasons)
    .rows.length,0,"no fabricated trophy measurement");
});
test("manual MARINES Oct 11–25 attaches to existing LoSP season for admin without erasing LoSP",()=>{
  const actualLoSP=JSON.parse(read(
    "docs/data/alliance-standings/snapshots/2026-10-25T230738867Z.json"));
  const observed="2026-11-05T15:15:00.000Z",payload=make(observed);
  payload.snapshots[0].alliances[0].manualSeasonId="2026-10-11/2026-10-25";
  payload.snapshots[0].alliances[0].seasonConfirmation="admin-in-game";
  const data=adapter.fromCloudflare(payload,registry,()=>true,config.rankingSeasons);
  const chart=config.charts.find(c=>c.id==="raid-season-rank");
  const prepared=prepare([actualLoSP,...data],registry,chart,config.rankingSeasons);
  assert.equal(prepared.rows.length,1,"two captures, one completed season");
  const old=prepared.series.find(x=>x.key==="zeus");
  const marine=prepared.series.find(x=>x.key==="marines");
  assert.ok(old&&old.points[0].value===31);
  assert.ok(marine&&marine.points[0].value===80);
});
test("wrong, unconfirmed and unsupported historical labels are discarded",()=>{
  const observed="2026-11-05T15:15:00.000Z",payload=make(observed);
  const marine=payload.snapshots[0].alliances[0];
  const inferred=adapter.fromCloudflare(payload,registry,key=>key==="marines",
    config.rankingSeasons);
  assert.equal(inferred.length,1,"a real Thursday capture can show a finished season");
  assert.equal(inferred[0].seasonId,"2026-10-11/2026-10-25");
  marine.manualSeasonId="2026-09-27/2026-10-11";
  marine.seasonConfirmation="admin-in-game";
  assert.equal(adapter.fromCloudflare(payload,registry,key=>key==="marines",
    config.rankingSeasons).length,0,"wrong previous season rejected");
  marine.manualSeasonId="2026-10-11/2026-10-25";
  marine.seasonConfirmation="user-claimed";
  assert.equal(adapter.fromCloudflare(payload,registry,key=>key==="marines",
    config.rankingSeasons).length,0,"unconfirmed marker rejected");
  marine.seasonConfirmation="admin-in-game";
  const shifted={...config.rankingSeasons,
    referenceEndExclusiveAt:"2026-10-18T20:00:00.000Z"};
  assert.equal(adapter.fromCloudflare(payload,registry,key=>key==="marines",
    shifted).length,0,"JSON calendar change invalidates a stale claim");
});

test("MARINES 5 November real ranks 5/12 publish automatically with no manual label",()=>{
  const observed="2026-11-05T15:15:23.000Z";
  const payload=make(observed);
  payload.snapshots[0].alliances[0].warRank=5;
  payload.snapshots[0].alliances[0].raidRank=12;
  const selected=adapter.fromCloudflare(payload,registry,key=>key==="marines",
    config.rankingSeasons);
  assert.equal(selected.length,1);
  assert.equal(selected[0].seasonId,"2026-10-11/2026-10-25");
  assert.equal(selected[0].rankingSeason.identification,"schedule-derived");
  assert.equal(selected[0].capturedAt,observed);
  const war=prepare(selected,registry,config.charts[2],config.rankingSeasons);
  const raid=prepare(selected,registry,config.charts[1],config.rankingSeasons);
  assert.equal(war.series[0].points[0].value,5);
  assert.equal(raid.series[0].points[0].value,12);
  assert.equal(prepare(selected,registry,config.charts[0],
    config.rankingSeasons).rows.length,0);
});
test("only one true rank per alliance/season despite successive valid snapshots",()=>{
  const a=make("2026-11-05T03:15:00.000Z");
  const b=make("2026-11-06T15:15:00.000Z");
  a.snapshots[0].alliances[0].warRank=5;
  b.snapshots[0].alliances[0].warRank=5;
  const readings=adapter.fromCloudflare({status:"ok",
    kind:"connected-guest-season-ranks",
    snapshots:[...a.snapshots,...b.snapshots]},
    registry,key=>key==="marines",config.rankingSeasons);
  assert.equal(readings.length,2,"retain real capture provenance");
  const model=prepare(readings,registry,config.charts[2],
    config.rankingSeasons);
  assert.equal(model.rows.length,1,"one point per completed season");
  assert.equal(model.series[0].points.length,1);
  assert.equal(model.series[0].points[0].value,5);
});
test("rollover delay never attributes ranks to a two-seasons-old result",()=>{
  const before=make("2026-11-08T20:15:00.000Z");
  assert.equal(adapter.fromCloudflare(before,registry,()=>true,
    config.rankingSeasons).length,0);
  const after=make("2026-11-08T21:10:00.000Z");
  const data=adapter.fromCloudflare(after,registry,key=>key==="marines",
    config.rankingSeasons);
  assert.equal(data.length,1);
  assert.equal(data[0].seasonId,"2026-10-25/2026-11-08");
});
