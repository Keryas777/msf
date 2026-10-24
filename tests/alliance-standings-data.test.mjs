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

test('future collection configuration is UTC-based and disabled until collector integration',()=>{
  assert.deepEqual(config.capture.trophies.scheduledWeekdaysUtc,
    ['thursday','saturday']);
  assert.equal(config.capture.trophies.scheduledAtUtc,'06:40');
  assert.deepEqual(config.capture.trophies.sourceSampling,{
    dayOffsetFromWar:1,startAtUtc:'02:00',endExclusiveAtUtc:'06:00'
  });
  assert.equal(config.capture.trophies.collectionTimezone,'UTC');
  const window=config.capture.trophies.window;
  assert.equal(window.warEndsAtUtc,'18:00');
  assert.equal(window.nextPreparationStartsAtUtc,'15:00');
  assert.equal(window.preparationDayOffset,1);
  assert.equal(window.marginAfterWarEndMinutes,120);
  assert.equal(window.marginBeforePreparationMinutes,120);
  assert.equal(Object.hasOwn(config.capture.trophies,'zone4WarEndsAtUtc'),false);
  assert.equal(Object.hasOwn(config.capture.trophies,'nextZone1WarStartsAtUtc'),false);
  assert.equal(config.capture.trophies.requireCompleteSessionScan,true);
  assert.equal(config.rankingSeasons.cycleDays,14);
  assert.equal(config.rankingSeasons.referenceEndExclusiveAt,'2026-10-11T20:00:00.000Z');
  assert.equal(config.rankingSeasons.publicationDelayMinutes,60);
  assert.equal(config.rankingSeasons.identification,'schedule-derived');
});

test("22 October manual trophy snapshot is genuine, complete and changes all five values",()=>{
  const after=data("snapshots/2026-10-22T120208591Z.json");
  assert.ok(index.snapshots.some(x=>x.capturedAt===after.capturedAt),
    'Keep the real 22 October capture even after later automatic imports');
  assert.equal(after.capturedAt,"2026-10-22T12:02:08.591Z");
  assert.equal(after.source,"/player/v1/alliance/card");
  assert.equal(after.coverage.scannedSessions,9);
  assert.equal(after.coverage.validSessions,9);
  assert.equal(after.coverage.unavailableSessions,0);
  assert.equal(after.coverage.completeSessionScan,true);
  assert.equal(after.seasonVerified,false);
  assert.equal(after.seasonId,null);
  const expected={zeus:2806,athena:2604,kronos:2684,dionysos:2663,poseidon:2264};
  assert.deepEqual(Object.fromEntries(after.alliances.map(a=>[a.key,a.warTrophies])),expected);
  const first=data(index.snapshots[0].file);
  for(const now of after.alliances){
    const previous=first.alliances.find(a=>a.key===now.key);
    assert.ok(previous,"missing previous alliance");
    assert.notEqual(now.warTrophies,previous.warTrophies);
    assert.equal(now.warRank,previous.warRank);
    assert.equal(now.raidRank,previous.raidRank);
    assert.equal(Object.hasOwn(now,"allianceFingerprint"),false);
  }
});

test('trophy post-war window has margins and includes the 22 October capture',()=>{
  const cfg=config.capture.trophies;
  const w=cfg.window;
  const minutes=s=>{
    assert.match(s,/^\d{2}:\d{2}$/);
    const [hour,minute]=s.split(':').map(Number);
    assert.ok(hour<24&&minute<60);
    return hour*60+minute;
  };
  const start=minutes(w.warEndsAtUtc)+w.marginAfterWarEndMinutes;
  const end=minutes(w.nextPreparationStartsAtUtc)+
    1440*w.preparationDayOffset-w.marginBeforePreparationMinutes;
  const scheduled=1440+minutes(cfg.scheduledAtUtc);
  const sampleStart=1440+minutes(cfg.sourceSampling.startAtUtc);
  const sampleEnd=1440+minutes(cfg.sourceSampling.endExclusiveAtUtc);
  assert.equal(start,20*60);
  assert.equal(end,24*60+13*60);
  assert.ok(sampleStart>=start && sampleEnd<=end);
  assert.ok(scheduled>sampleEnd && scheduled<end);
  const wednesday=Date.parse('2026-10-21T00:00:00.000Z');
  const observed=Date.parse('2026-10-22T12:02:08.591Z');
  assert.ok(observed>=wednesday+start*60000);
  assert.ok(observed<wednesday+end*60000);
});

test('24 October has one complete six-alliance reading, replacing same-value morning point',()=>{
  assert.equal(index.snapshots.length,3,'Only one reading per represented day');
  assert.equal(index.snapshots.filter(x=>x.capturedAt.startsWith('2026-10-24')).length,1);
  assert.equal(index.snapshots.some(x=>x.file.includes('042033728')),false);
  const observed=data(index.snapshots.at(-1).file);
  assert.equal(observed.capturedAt,'2026-10-24T21:31:12.523Z');
  assert.equal(observed.coverage.completeSessionScan,true);
  assert.equal(observed.alliances.length,6);
  const scores=Object.fromEntries(observed.alliances.map(a=>[a.key,a.warTrophies]));
  assert.deepEqual(scores,{kronos:2759,poseidon:2339,hades:1651,
    dionysos:2588,athena:2679,zeus:2881});
});

test("24 October evening administrator capture adds Hadès without private fingerprints",()=>{
  const latest=index.snapshots.at(-1);
  assert.equal(latest.capturedAt,"2026-10-24T21:31:12.523Z");
  assert.equal(latest.allianceCount,6);
  assert.equal(latest.completeSessionScan,true);
  assert.equal(latest.seasonVerified,false);
  assert.equal(latest.collectionDayUtc,undefined,
    "A manual reading must not claim the automated R2 collection day");
  const snapshot=data(latest.file);
  assert.equal(snapshot.coverage.scannedSessions,10);
  assert.equal(snapshot.coverage.validSessions,10);
  assert.equal(snapshot.coverage.connectedAlliances,6);
  assert.deepEqual(snapshot.alliances.map(a=>a.key),
    ['kronos','poseidon','hades','dionysos','athena','zeus']);
  const hades=snapshot.alliances.find(a=>a.key==="hades");
  assert.deepEqual([hades.warTrophies,hades.warRank,hades.raidRank],
    [1651,12228,6998]);
  assert.equal(hades.warLeague.name,"PLATINUM II");
  assert.equal(registry.find(a=>a.key==="hades").emoji,"🔥");
});
