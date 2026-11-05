import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, canonicalPlayer, normalizeKey, validDay, originalArenaAllianceKeys } from "../scripts/snapshot-arena.mjs";
import { earliestAllowedDay, mergeHistory } from "../scripts/publish-arena-r2.mjs";

function snapshot(day, rank = 4) {
  return buildSnapshot([{ name: "Test", alliance: "Zeus", latestArena: rank }], {
    day, sourceDay: day, sourceCampaigns: { zeus: day + "-pm" },
    attribution: "daily-observation-of-latest-imported-info", aliases: {}
  });
}

test("Arena is sorted with rank 1 best; tied arena ranks are retained", () => {
  const rows = [
    { name: "B", alliance: "Zeus", latestArena: 1 },
    { name: "A", alliance: "Kronos", latestArena: 1 },
    { name: "C", alliance: "Dionysos", latestArena: 9 },
    { name: "D", alliance: "Zeus", latestArena: 0 },
    { name: "E", alliance: "Zeus" }
  ];
  const result = buildSnapshot(rows, {
    day: "2026-11-01", sourceDay: "2026-11-01",
    sourceCampaigns: {}, attribution: "daily", aliases: {}
  });
  assert.equal(result.players.length, 3);
  assert.deepEqual(result.players.map(p => p.arenaRank).sort((a, b) => a - b), [1, 1, 9]);
  assert.ok(result.players.every(p => p.arenaRank > 0));
});

test("Player aliases are resolved before identity normalization", () => {
  assert.equal(canonicalPlayer("Améline87", { "Améline87": "Améline67" }), "Améline67");
  assert.equal(normalizeKey("<color=red>JAXX"), "jaxx");
});

test("Ambiguous player identity is rejected rather than merged", () => {
  assert.throws(() => buildSnapshot([
    { name: "Améline87", alliance: "Zeus", latestArena: 5 },
    { name: "Améline67", alliance: "Athéna", latestArena: 6 }
  ], { day: "2026-11-01", aliases: { "Améline87": "Améline67" } }), /Ambiguous/);
});

test("No fictitious calendar dates accepted", () => {
  assert.equal(validDay("2026-02-29"), false);
  assert.equal(validDay("2026-10-31"), true);
});

test("R2 rolling history preserves first observation, prunes older than 30 days", () => {
  const base = snapshot("2026-10-31", 1);
  const old = snapshot("2026-10-30", 10);
  const today = snapshot("2026-11-29", 5);
  const updatedBase = snapshot("2026-10-31", 99);
  const merged = mergeHistory({ snapshots: [old, base] }, [updatedBase, today], "2026-11-29");
  assert.deepEqual(merged.snapshots.map(x => x.date), ["2026-10-31", "2026-11-29"]);
  assert.equal(merged.snapshots[0].players[0].arenaRank, 1);
  assert.equal(earliestAllowedDay("2026-11-29"), "2026-10-31");
  const pruned = mergeHistory(merged, [], "2026-11-30");
  assert.deepEqual(pruned.snapshots.map(x => x.date), ["2026-11-29"]);
});

test("31 October arena baseline uses immutable original provenance, not later guests",()=>{
  const first={version:1,alliances:Object.fromEntries([
    "zeus","athena","kronos","dionysos","poseidon","hades"
  ].map(key=>[key,"2026-11-01-am"]))};
  assert.deepEqual(originalArenaAllianceKeys(first),[
    "zeus","athena","kronos","dionysos","poseidon","hades"
  ]);
  // A new connected MARINES does not exist in the original 1 November capture.
  const currentRegistry=[...Object.keys(first.alliances),"marines",
    "endgame-revolution-red","endgame-revolution-orange"];
  assert.ok(currentRegistry.length>originalArenaAllianceKeys(first).length);
  assert.throws(()=>originalArenaAllianceKeys({alliances:{...first.alliances,
    marines:"2026-11-05-am"}}),/First Infos provenance/);
  assert.throws(()=>originalArenaAllianceKeys({alliances:{}}),/First Infos provenance/);
});
