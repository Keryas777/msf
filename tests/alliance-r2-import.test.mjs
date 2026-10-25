import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {
  collectionWindow,readMapping,extractAllianceSource,
  createR2Snapshot,addSnapshotToIndex,resolveStandingsSchedule,hasCollectionForDay
} from '../scripts/lib/alliance-r2-history.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const config=read('docs/data/alliance-standings/config.json');
const originalIndex=read('docs/data/alliance-standings/index.json');
const fingerprint=id=>createHash('sha256').update(id).digest('hex');
const registry=[
  {key:'team-a',name:'Alliance A',color:'#123456',order:1},
  {key:'team-b',name:'Alliance B',color:'#654321',order:2},
  {key:'retired',name:'Alliance C',color:'#abcdef',order:3,active:false}
];
const identities={'team-a':fingerprint('stable-a'),'team-b':fingerprint('stable-b')};
const window=collectionWindow('2026-10-22',config);
function record(key,clock,values=[2000,12,26]){
  const aid=key==='team-a'?'stable-a':'stable-b';
  return {
    version:1,kind:'private-provider-source',
    allianceFingerprint:identities[key],
    endpoint:'/player/v1/alliance/card',httpStatus:200,
    capturedAt:'2026-10-22T'+clock+'.000Z',
    providerResponse:{data:{id:aid+':number-v1',name:'MSF '+key,
      warTrophies:values[0],warRank:values[1],raidRank:values[2],
      warLeague:{id:null,name:'DIAMOND II'}}}
  };
}
test('delayed or backup standings cron selects original Thursday/Saturday UTC day',()=>{
  for(const [cron,time,expected] of [
    ['40 6 * * 4,6','2026-10-24T06:42:00Z','2026-10-24'],
    ['47 7 * * 4,6','2026-10-24T08:15:00Z','2026-10-24'],
    ['17 9 * * 4,6','2026-10-24T11:59:00Z','2026-10-24'],
    ['40 6 * * 4,6','2026-10-25T00:12:00Z','2026-10-24'],
    ['40 6 * * 4,6','2026-10-22T11:00:00Z','2026-10-22']
  ])assert.equal(resolveStandingsSchedule(cron,new Date(time)),expected);
  assert.throws(()=>resolveStandingsSchedule('40 6 * * *',new Date('2026-10-24T08:00:00Z')));
  assert.throws(()=>resolveStandingsSchedule('40 6 * * 4,6',new Date(NaN)));
  assert.throws(()=>resolveStandingsSchedule('40 6 * * 4,6',
    new Date('2026-10-26T18:00:00Z')),/stale/);
});

test('next-day R2 sampling fits the validated trophy postwar window',()=>{
  assert.equal(window.warDay,'2026-10-21');
  assert.equal(window.start,'2026-10-22T02:00:00.000Z');
  assert.equal(window.endExclusive,'2026-10-22T06:00:00.000Z');
  const saturday=collectionWindow('2026-10-24',config);
  assert.equal(saturday.warDay,'2026-10-23');
  assert.throws(()=>collectionWindow('2026-10-23',config),/Thursday or Saturday/);
  assert.throws(()=>collectionWindow('2026-02-30',config),/Invalid UTC collection day/);
});
test('private mapping is complete, dynamic and never depends on displayed names',()=>{
  assert.deepEqual(readMapping(JSON.stringify(identities),registry),identities);
  assert.throws(()=>readMapping('{}',registry),/Incomplete/);
  assert.throws(()=>readMapping('not-json',registry),/Invalid private alliance mapping/);
  const duplicate={...identities,'team-b':identities['team-a']};
  assert.throws(()=>readMapping(JSON.stringify(duplicate),registry),/Duplicate/);
});
test('private provider records require valid stable identities and sample timestamps',()=>{
  const data=extractAllianceSource(record('team-a','04:22:00'),identities['team-a'],window);
  assert.equal(data.warTrophies,2000);
  assert.equal(data.capturedAt,'2026-10-22T04:22:00.000Z');
  assert.throws(()=>extractAllianceSource(record('team-a','01:00:00'),
    identities['team-a'],window),/outside UTC/);
  assert.throws(()=>extractAllianceSource(record('team-a','04:00:00'),
    identities['team-b'],window),/Invalid private R2 source/);
  const altered=record('team-a','04:00:00');
  altered.providerResponse.data.id='different-a:number-v1';
  assert.throws(()=>extractAllianceSource(altered,identities['team-a'],window),
    /identity did not match/);
  const missing=record('team-a','04:00:00');
  missing.providerResponse.data.warTrophies=null;
  assert.throws(()=>extractAllianceSource(missing,identities['team-a'],window),
    /Missing or invalid/);
});
test('global snapshot uses latest REAL source per alliance and never leaks private keys',()=>{
  const sources=new Map([
    ['team-a',[record('team-a','02:02:00',[2010,12,26]),
      record('team-a','05:12:00',[2020,12,26])]],
    ['team-b',[record('team-b','03:20:00',[1500,41,98])]]
  ]);
  const snapshot=createR2Snapshot({window,registry,map:identities,sources});
  assert.equal(snapshot.alliances.length,2);
  assert.equal(snapshot.alliances[0].warTrophies,2020);
  assert.equal(snapshot.alliances[1].warTrophies,1500);
  assert.equal(snapshot.capturedAt,'2026-10-22T05:12:00.000Z');
  assert.equal(snapshot.alliances[1].capturedAt,'2026-10-22T03:20:00.000Z');
  assert.equal(snapshot.coverage.completeSessionScan,false);
  assert.equal(snapshot.coverage.scannedSessions,null);
  assert.equal(snapshot.seasonVerified,false);
  assert.equal(snapshot.seasonId,null);
  assert.doesNotMatch(JSON.stringify(snapshot),new RegExp(identities['team-a']));
  assert.doesNotMatch(JSON.stringify(snapshot),/number-v1/);
  const next=addSnapshotToIndex(originalIndex,snapshot);
  assert.equal(next.updated,true);
  assert.equal(next.file,'snapshots/2026-10-22T051200000Z.json');
  assert.equal(next.index.snapshots.length,originalIndex.snapshots.length+1);
  assert.equal(next.index.snapshots[1].collectionDayUtc,'2026-10-22');
  assert.equal(addSnapshotToIndex(next.index,snapshot).updated,false);
  sources.delete('team-b');
  assert.throws(()=>createR2Snapshot({window,registry,map:identities,sources}),
    /No validated AllianceCard/);
});

test('existing complete manual 24 October reading prevents a duplicate R2 import',()=>{
  const trophies=originalIndex.snapshots.filter(x=>x.captureType!=='season-ranks');
  assert.equal(trophies.length,3);
  assert.deepEqual(trophies.map(x=>x.capturedAt.slice(0,10)),
    ['2026-10-21','2026-10-22','2026-10-24']);
  assert.equal(hasCollectionForDay(originalIndex,'2026-10-24'),true);
  assert.equal(hasCollectionForDay(originalIndex,'2026-10-22'),true);
  assert.equal(hasCollectionForDay(originalIndex,'2026-10-29'),false);
  const automated={snapshots:[{
    capturedAt:'2026-10-29T04:20:00.000Z',collectionDayUtc:'2026-10-29'
  }]};
  assert.equal(hasCollectionForDay(automated,'2026-10-29'),true);
});
