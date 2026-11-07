import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {runInNewContext} from "node:vm";
import {GUEST_SEASON_HISTORY_KIND,seasonForObservation,
  mergeGuestSeasonHistory,validatePublishedGuestHistory}
  from "../scripts/lib/guest-season-history.mjs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const registry=JSON.parse(read("docs/data/alliances.json"));
const config=JSON.parse(read("docs/data/alliance-standings/config.json")).rankingSeasons;
const fp1="a".repeat(64),fp2="b".repeat(64),fp3="c".repeat(64);
const old=()=>({version:1,kind:GUEST_SEASON_HISTORY_KIND,results:[]});
const approval=(items=[
  {fingerprint:fp1,allianceKey:"endgame-revolution-red"},
  {fingerprint:fp2,allianceKey:"endgame-revolution-orange"},
  {fingerprint:fp3,allianceKey:"marines"}
])=>({version:1,alliances:items});
const snap=(capturedAt,entries)=>({
  collectionDayUtc:capturedAt.slice(0,10),capturedAt,
  completeSessionScan:false,
  alliances:entries.map(({fingerprint,warRank,raidRank,...others})=>({
    fingerprint,nameAtCapture:"ENDGAME R-évolution",warRank,raidRank,
    capturedAt,...others
  }))
});
const source=(snapshots)=>({version:1,kind:"guest-season-ranks-rolling",snapshots});
const before="2026-10-29T03:15:00.000Z";
const after="2026-11-09T03:15:00.000Z";
const now=Date.parse("2026-11-10T08:00:00.000Z");
const data=()=>source([
  snap(before,[{fingerprint:fp1,warRank:40,raidRank:100}]),
  snap(after,[{fingerprint:fp1,warRank:17,raidRank:88},
    {fingerprint:fp2,warRank:27,raidRank:120},
    {fingerprint:fp3,warRank:37,raidRank:130}])
]);

test("real post-rollover rank is attributed to the completed season only",()=>{
  assert.equal(seasonForObservation(before,config).seasonId,"2026-10-11/2026-10-25");
  assert.equal(seasonForObservation(after,config).seasonId,"2026-10-25/2026-11-08");
  assert.equal(seasonForObservation("2026-11-08T20:30:00.000Z",config),null);
  assert.equal(seasonForObservation("2026-11-08T21:00:00.000Z",config).seasonId,
    "2026-10-25/2026-11-08");
});
test("append-only archive preserves rank history indefinitely for distinct tenants",()=>{
  const first=mergeGuestSeasonHistory(old(),data(),approval(),registry,config,now);
  assert.equal(first.added,4);
  assert.equal(first.history.results.length,4);
  assert.equal(first.history.results[0].startAt,"2026-10-11T20:00:00.000Z");
  assert.equal(first.history.results[0].endExclusiveAt,"2026-10-25T20:00:00.000Z");
  const rows=first.history.results;
  assert.deepEqual(rows.filter(r=>r.seasonId==="2026-10-25/2026-11-08")
    .map(r=>r.allianceKey).sort(),[
      "endgame-revolution-orange","endgame-revolution-red","marines"]);
  assert.equal(rows.find(r=>r.allianceKey==="endgame-revolution-orange").warRank,27);
  assert.doesNotMatch(JSON.stringify(first.history),
    /fingerprint|nameAtCapture|oauth|sourceKey|allianceFingerprint/);
  assert.ok(!JSON.stringify(first.history).includes(fp1));
  assert.equal(validatePublishedGuestHistory(first.history,registry,config).size,4);
  const second=mergeGuestSeasonHistory(first.history,data(),approval(),
    registry,config,now);
  assert.equal(second.added,0);
  assert.deepEqual(second.history,first.history);
  // Revoking consent never manufactures records and never erases an old season.
  const revoked=mergeGuestSeasonHistory(first.history,data(),
    approval([{fingerprint:fp3,allianceKey:"marines"}]),registry,config,now);
  assert.equal(revoked.added,0);
  assert.deepEqual(revoked.history,first.history);
});
test("unapproved, unknown, unbound and LoSP fingerprints never enter GitHub",()=>{
  const restricted=approval([{fingerprint:fp1,allianceKey:"endgame-revolution-red"},
    {fingerprint:fp2},{fingerprint:fp3,allianceKey:"zeus"}]);
  const result=mergeGuestSeasonHistory(old(),data(),restricted,registry,config,now);
  assert.equal(result.added,2);
  assert.ok(result.history.results.every(x=>x.allianceKey==="endgame-revolution-red"));
  assert.throws(()=>mergeGuestSeasonHistory(old(),data(),approval([
    {fingerprint:fp1,allianceKey:"endgame-revolution-red"},
    {fingerprint:fp2,allianceKey:"endgame-revolution-red"}]),
    registry,config,now),/Duplicate guest binding/);
});
test("bad source records, duplicate archived season and corrupt calendar fail closed",()=>{
  const record=snap(after,[{fingerprint:fp1,warRank:1,raidRank:2}]);
  for(const mutated of [
    {...record,alliances:[{...record.alliances[0],raidRank:null}]},
    {...record,alliances:[{...record.alliances[0],fingerprint:"not-a-fingerprint"}]},
    {...record,alliances:[{...record.alliances[0],capturedAt:before}]}
  ])assert.throws(()=>mergeGuestSeasonHistory(old(),source([mutated]),
    approval(),registry,config,now));
  const valid=mergeGuestSeasonHistory(old(),source([record]),approval(),
    registry,config,now).history;
  assert.throws(()=>validatePublishedGuestHistory({
    ...valid,results:[...valid.results,...valid.results]
  },registry,config));
  assert.throws(()=>mergeGuestSeasonHistory(old(),data(),approval(),
    registry,{...config,cycleDays:0},now));
});
test("verified manual source cannot force a fabricated season",()=>{
  const valid=snap(after,[{fingerprint:fp1,warRank:1,raidRank:2,
    manualSeasonId:"2026-10-11/2026-10-25",seasonConfirmation:"admin-in-game"}]);
  assert.equal(mergeGuestSeasonHistory(old(),source([valid]),approval(),
    registry,config,now).added,0);
});
test("published historical keys remain valid if the alliance later leaves registry",()=>{
  const published=mergeGuestSeasonHistory(old(),data(),approval(),registry,config,now).history;
  const removed=registry.filter(a=>a.key!=="marines");
  assert.equal(validatePublishedGuestHistory(published,removed,config).size,4);
});
test("static graph merges durable historical guest seasons without private fetch",()=>{
  const ctx={window:{}};
  runInNewContext(read("docs/alliance-history-data.js"),ctx);
  runInNewContext(read("docs/alliance-season-live.js"),ctx);
  const archive=mergeGuestSeasonHistory(old(),data(),approval(),registry,config,now).history;
  const available=ctx.window.LoSPGuestSeasonLive.fromArchive(
    archive,registry,key=>key.startsWith("endgame-"),config);
  assert.equal(available.length,2);
  const chart={field:"raidRank",frequency:"per-season"};
  const model=ctx.window.LoSPStandingsSeries.prepare(
    available,registry.filter(a=>a.key.startsWith("endgame-")),chart,config);
  assert.equal(model.rows.length,2);
  assert.equal(model.series.length,2);
  const red=model.series.find(a=>a.key==="endgame-revolution-red");
  const orange=model.series.find(a=>a.key==="endgame-revolution-orange");
  assert.deepEqual(Array.from(red.points,p=>p.value),[100,88]);
  assert.deepEqual(Array.from(orange.points,p=>p.value),[null,120]);
  assert.equal(red.points[0].capturedAt,before);
  // A future calendar change cannot relabel or erase earlier GitHub results.
  const changedCalendar={...config,
    referenceEndExclusiveAt:"2026-10-18T20:00:00.000Z"};
  const stable=ctx.window.LoSPGuestSeasonLive.fromArchive(
    archive,registry,key=>key.startsWith("endgame-"),changedCalendar);
  const stableChart=ctx.window.LoSPStandingsSeries.prepare(stable,
    registry.filter(a=>a.key.startsWith("endgame-")),chart,changedCalendar);
  assert.deepEqual(Array.from(stableChart.rows,r=>r.seasonId),[
    "2026-10-11/2026-10-25","2026-10-25/2026-11-08"]);
  assert.deepEqual(Array.from(stableChart.series.find(
    s=>s.key==="endgame-revolution-red").points,p=>p.value),[100,88]);
  const trophies=ctx.window.LoSPStandingsSeries.prepare(available,
    registry, {field:"warTrophies",frequency:"all-snapshots"},config);
  assert.equal(trophies.rows.length,0,"guest season ranks must not add trophy points");
});
test("workflow has only R2 reads and no hardcoded guests or pruning",()=>{
  const workflow=read(".github/workflows/archive-guest-season-history.yml");
  const importer=read("scripts/pull-guest-season-ranks-r2.mjs");
  const pure=read("scripts/lib/guest-season-history.mjs");
  assert.match(workflow,/40 5 \* \* \*/);
  assert.match(workflow,/40 18 \* \* \*/);
  assert.match(workflow,/LOSP_GUEST_SEASON_HISTORY_APPROVED/);
  assert.match(importer,/GUEST_SEASON_SOURCE/);
  assert.doesNotMatch(workflow+importer,
    /api\.marvelstrikeforce\.com|SCOPELY_CLIENT_SECRET/);
  assert.doesNotMatch(pure,/results\.filter\(|results\.slice\(/);
});
