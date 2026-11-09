import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {diagnoseGuestSeason,TARGET_SEASON}
  from "../scripts/diagnose-guest-season-r2.mjs";

const read=p=>JSON.parse(fs.readFileSync(new URL("../"+p,import.meta.url),"utf8"));
const registry=read("docs/data/alliances.json");
const calendar=read("docs/data/alliance-standings/config.json").rankingSeasons;
const fingerprint="a".repeat(64);
const approval={version:1,alliances:[
  {fingerprint,allianceKey:"endgame-revolution-red"}]};
const time="2026-11-09T15:15:00.000Z";
const now=Date.parse("2026-11-09T17:00:00.000Z");
const history={version:1,kind:"losp-guest-season-results",results:[]};
const record=(overrides={})=>({fingerprint,capturedAt:time,warRank:27,
  raidRank:14,...overrides});
const source=items=>({version:1,kind:"guest-season-ranks-rolling",
  snapshots:[{collectionDayUtc:"2026-11-09",capturedAt:time,
    alliances:items}]});
const run=(patch={})=>diagnoseGuestSeason({
  registry,approval,source:source([record()]),history,calendar,now,...patch});

test("eligible Red observation is detected without leaking private identifiers",()=>{
  const result=run();
  assert.equal(result.season,TARGET_SEASON);
  assert.equal(result.authorization,"approved");
  assert.equal(result.eligibleRecords,1);
  assert.deepEqual(result.reasons,[]);
  assert.ok(!JSON.stringify(result).includes(fingerprint));
  assert.ok(!JSON.stringify(result).includes("warRank"));
});
test("missing, revoked, and wrong-season observations have distinct outcomes",()=>{
  assert.deepEqual(run({source:source([])}).reasons,
    ["no-capture-for-authorized-alliance"]);
  assert.deepEqual(run({approval:{version:1,alliances:[]}}).reasons,
    ["no-authorized-binding"]);
  assert.deepEqual(run({source:source([record({
    capturedAt:"2026-10-29T15:15:00.000Z"})])}).reasons,
    ["capture-day-mismatch"]);
  const older={...source([record({capturedAt:"2026-10-29T15:15:00.000Z"})]),
    snapshots:[{collectionDayUtc:"2026-10-29",
      capturedAt:"2026-10-29T15:15:00.000Z",
      alliances:[record({capturedAt:"2026-10-29T15:15:00.000Z"})]}]};
  assert.deepEqual(run({source:older}).reasons,
    ["capture-belongs-to-other-season"]);
});
test("invalid ranks and mismatched manual season never qualify",()=>{
  assert.deepEqual(run({source:source([record({raidRank:null})])}).reasons,
    ["incomplete-or-invalid-ranks"]);
  assert.deepEqual(run({source:source([record({
    manualSeasonId:"2026-10-11/2026-10-25",
    seasonConfirmation:"admin-in-game"})])}).reasons,
    ["manual-season-confirmation-mismatch"]);
});
test("archived status is reported but never modified",()=>{
  const row={seasonId:TARGET_SEASON,allianceKey:"endgame-revolution-red"};
  const original=JSON.stringify(history);
  const result=run({history:{...history,results:[row]}});
  assert.equal(result.archived,true);
  assert.equal(JSON.stringify(history),original);
});
