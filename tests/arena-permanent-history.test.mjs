import test from "node:test";
import assert from "node:assert/strict";
import {appendArenaIndex} from "../scripts/archive-arena-history.mjs";
const empty={version:1,kind:"losp-arena-history-index",snapshots:[]};
const snap=(date,rank)=>({version:1,date,sourceDay:date,
  attribution:"daily-observation-of-latest-imported-info",
  players:[{playerKey:"a",name:"A",alliance:"Zeus",arenaRank:rank}]});
test("Arena history never expires older observations",()=>{
  const first=appendArenaIndex(empty,snap("2026-10-31",2));
  const next=appendArenaIndex(first.index,snap("2027-12-31",4));
  assert.deepEqual(next.index.snapshots.map(s=>s.date),["2026-10-31","2027-12-31"]);
});
test("Arena history does not overwrite existing date",()=>{
  const first=appendArenaIndex(empty,snap("2026-11-01",2));
  const duplicate=appendArenaIndex(first.index,snap("2026-11-01",99));
  assert.equal(duplicate.added,false);
  assert.deepEqual(duplicate.index,first.index);
});
test("Arena archive rejects invalid day and empty players",()=>{
  assert.throws(()=>appendArenaIndex(empty,snap("2026-02-29",3)));
  assert.throws(()=>appendArenaIndex(empty,{...snap("2026-11-01",3),players:[]}));
});
