import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mondaySeason,scheduledMonday,alreadyImported,
  publicSeasonSnapshot,addSeasonToIndex} from '../scripts/lib/alliance-season-ranks-r2.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const config=read('docs/data/alliance-standings/config.json');
const registry=read('docs/data/alliances.json');
const index=read('docs/data/alliance-standings/index.json');
const active=registry.filter(a=>a.active!==false);
const mapping=Object.fromEntries(active.map((a,i)=>[a.key,(i+1).toString(16).padStart(64,'0')]));
function source(time='2026-11-09T03:15:00.000Z'){
  return {version:1,source:'/player/v1/alliance/card',capturedAt:time,
    seasonId:null,seasonVerified:false,truncated:false,
    scannedSessions:active.length,validSessions:active.length,
    unavailableSessions:0,connectedAlliances:active.length,
    completeSessionScan:true,
    alliances:active.map((a,i)=>({
      allianceFingerprint:mapping[a.key],name:'LoSP '+a.name,
      warRank:101+i,raidRank:201+i,warTrophies:3000+i,
      connectedSessions:1}))};
}
test('alternating Mondays use the official JSON anchor; winter and summer unchanged',()=>{
  const early=mondaySeason('2026-10-26',config);
  assert.equal(early.seasonId,'2026-10-11/2026-10-25');
  assert.equal(early.endAt,'2026-10-25T20:00:00.000Z');
  assert.equal(early.availableAfter,'2026-10-25T21:00:00.000Z');
  assert.equal(mondaySeason('2026-11-02',config),null);
  assert.equal(mondaySeason('2026-11-09',config).seasonId,'2026-10-25/2026-11-08');
  assert.equal(mondaySeason('2027-03-29',config),null);
  assert.throws(()=>mondaySeason('2026-02-30',config));
  assert.equal(scheduledMonday('40 4 * * 1',new Date('2026-10-26T04:42:00Z')),'2026-10-26');
  assert.equal(scheduledMonday('17 6 * * 1',new Date('2026-10-26T08:00:00Z')),'2026-10-26');
  assert.throws(()=>scheduledMonday('40 4 * * 4',new Date()));
});
test('manual first season capture prevents the next Monday automation from duplicating',()=>{
  assert.equal(index.snapshots.length,4);
  assert.equal(alreadyImported(index,'2026-10-11/2026-10-25'),true);
  assert.equal(alreadyImported(index,'2026-10-25/2026-11-08'),false);
});
test('fresh complete approved R2 capture produces ranks only, without private fingerprints',()=>{
  const season=mondaySeason('2026-11-09',config);
  const snap=publicSeasonSnapshot(source(),registry,mapping,season);
  assert.equal(snap.captureType,'season-ranks');
  assert.equal(snap.alliances.length,active.length);
  assert.equal(snap.seasonId,null);
  assert.equal(snap.seasonVerified,false);
  assert.equal(snap.alliances[0].warTrophies,null);
  assert.deepEqual(snap.alliances.map(a=>a.key),active.map(a=>a.key));
  assert.equal(snap.alliances[0].warRank,101);
  assert.doesNotMatch(JSON.stringify(snap),/allianceFingerprint|connectedSessions/);
  const result=addSeasonToIndex(index,snap,season);
  assert.equal(result.updated,true);
  assert.equal(result.file,'snapshots/2026-11-09T031500000Z.json');
  assert.equal(result.index.snapshots.length,5);
  assert.equal(addSeasonToIndex(result.index,snap,season).updated,false);
});
test('bad dates, missing alliance, partial OAuth, repeated fingerprint and other-group data are refused',()=>{
  const season=mondaySeason('2026-11-09',config);
  const bad=[
    {...source(),capturedAt:'2026-11-08T18:00:00.000Z'},
    {...source(),unavailableSessions:1,completeSessionScan:false},
    {...source(),alliances:source().alliances.slice(1)},
    {...source(),alliances:[...source().alliances.slice(0,-1),
      source().alliances[0]]},
    {...source(),alliances:source().alliances.map((a,i)=>i===0?
      {...a,allianceFingerprint:'f'.repeat(64)}:a)},
    {...source(),alliances:source().alliances.map((a,i)=>i===0?
      {...a,raidRank:null}:a)}
  ];
  for(const invalid of bad)assert.throws(()=>
    publicSeasonSnapshot(invalid,registry,mapping,season));
});
test('workflow uses existing R2 credentials and a Monday cron, with no new Scopely endpoint',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/pull-alliance-season-ranks-r2.yml',import.meta.url),'utf8');
  assert.match(workflow,/cron: "40 4 \* \* 1"/);
  assert.match(workflow,/LOSP_R2_ALLIANCE_MAP_JSON/);
  assert.match(workflow,/LOSP_R2_HISTORY_PUBLICATION_APPROVED/);
  assert.doesNotMatch(workflow,/SCOPELY_CLIENT_SECRET|api\.marvelstrikeforce\.com/);
});
