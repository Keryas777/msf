import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../docs/data/alliance-standings/",import.meta.url));
const data=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const index=data("index.json");
const config=data("config.json");
const registry=JSON.parse(fs.readFileSync(path.join(root,"../alliances.json"),"utf8"));
const keys=new Set(registry.map(a=>a.key));

test("index is ordered, references real snapshots and has unique capture timestamps",()=>{
  assert.equal(index.version,1);
  assert.equal(index.kind,"losp-alliance-standings-index");
  assert.ok(Array.isArray(index.snapshots)&&index.snapshots.length>=1);
  const dates=index.snapshots.map(x=>x.capturedAt);
  assert.deepEqual(dates,[...dates].sort());
  assert.equal(new Set(dates).size,dates.length);
  for(const item of index.snapshots){
    assert.match(item.file,/^snapshots\/\d{4}-\d\d-\d\dT\d{9}Z\.json$/);
    const snapshot=data(item.file);
    assert.equal(snapshot.version,1);
    assert.equal(snapshot.kind,"losp-alliance-standings-snapshot");
    assert.equal(snapshot.capturedAt,item.capturedAt);
    assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)));
    assert.equal(item.allianceCount,snapshot.alliances.length);
    assert.equal(item.completeSessionScan,snapshot.coverage.completeSessionScan);
    assert.equal(item.seasonVerified,snapshot.seasonVerified);
    assert.equal(snapshot.coverage.connectedAlliances,snapshot.alliances.length);
    assert.ok(snapshot.coverage.validSessions<=snapshot.coverage.scannedSessions);
    assert.ok(!snapshot.seasonVerified||snapshot.seasonId);
    const encountered=new Set();
    for(const row of snapshot.alliances){
      assert.ok(keys.has(row.key),`Unregistered alliance key: ${row.key}`);
      assert.ok(!encountered.has(row.key),`Duplicate alliance: ${row.key}`);
      encountered.add(row.key);
      assert.equal(typeof row.nameAtCapture,"string");
      for(const field of ["warTrophies","raidRank","warRank"])
        assert.ok(row[field]===null||
          Number.isSafeInteger(row[field])&&row[field]>=0,
          `Invalid ${field} for ${row.key}`);
      assert.ok(!Object.hasOwn(row,"allianceFingerprint"),
        "Internal AllianceCard fingerprints must not be public");
    }
  }
});
test("three charts use one capture source; ranks use one point per completed season",()=>{
  assert.equal(config.version,1);
  assert.equal(config.allianceRegistry,"../alliances.json");
  assert.equal(config.capture.targetPerWeek,2);
  assert.deepEqual(config.capture.metrics,["warTrophies","raidRank","warRank"]);
  const fields=config.charts.map(x=>x.field);
  assert.deepEqual(fields,["warTrophies","raidRank","warRank"]);
  assert.equal(new Set(config.charts.map(x=>x.id)).size,3);
  for(const [i,chart] of config.charts.entries()){
    assert.equal(chart.higherIsBetter,i===0);
    assert.equal(chart.frequency,i===0?"all-snapshots":"per-season");
    if(i>0){
      assert.equal(Object.hasOwn(chart,"intervalDays"),false);
      assert.equal(chart.requiresSeasonQualification,true);
    }
    assert.equal(Object.hasOwn(chart,"alliances"),false);
  }
});
test("the 21 October source capture matches user-confirmed Zeus values",()=>{
  const first=data(index.snapshots[0].file);
  assert.equal(first.capturedAt,"2026-10-21T10:55:00.466Z");
  assert.equal(first.source,"/player/v1/alliance/card");
  assert.equal(first.seasonId,"2026-09-27/2026-10-11");
  assert.equal(first.seasonVerified,true);
  assert.equal(first.rankingSeason.identification,"user-confirmed");
  assert.equal(first.rankingSeason.startAt,"2026-09-27T20:00:00.000Z");
  assert.equal(first.rankingSeason.endExclusiveAt,"2026-10-11T20:00:00.000Z");
  assert.equal(index.snapshots[0].seasonId,first.seasonId);
  assert.equal(first.alliances.length,5);
  const zeus=first.alliances.find(x=>x.key==="zeus");
  assert.equal(zeus.warTrophies,2875);
  assert.equal(zeus.warRank,322);
  assert.equal(zeus.raidRank,77);
  assert.equal(zeus.warLeague.name,"DIAMOND III");
  assert.equal(first.coverage.scannedSessions,9);
  assert.equal(first.coverage.validSessions,9);
  assert.equal(first.coverage.unavailableSessions,0);
});
