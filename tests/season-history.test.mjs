import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mergeSeasonHistory,validateHistory,projectRankSnapshots,HISTORY_KIND}
  from '../scripts/lib/season-history.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const base='docs/data/alliance-standings/';
const history=read(base+'season-history.json');
const index=read(base+'index.json');
const config=read(base+'config.json');
const snapshots=index.snapshots.map(e=>read(base+e.file));

test('one immutable archive covers all registered alliance identities',()=>{
  validateHistory(history);
  const projected=projectRankSnapshots(index,snapshots,config.rankingSeasons);
  assert.ok(projected.length>0);
  const first=mergeSeasonHistory({version:1,kind:HISTORY_KIND,results:[]},projected);
  assert.ok(first.added>0);
  const repeat=mergeSeasonHistory(first.history,projected);
  assert.equal(repeat.added,0);
  assert.deepEqual(repeat.history,first.history);
});
test('new approved guest rank joins a published LoSP season without overwriting it',()=>{
  const row=history.results[0];
  const guest={...row,allianceKey:'marines',warRank:101,raidRank:90};
  const merged=mergeSeasonHistory(history,[guest]);
  assert.equal(merged.added,1);
  assert.deepEqual(merged.history.results.find(x=>x.allianceKey===row.allianceKey&&
    x.seasonId===row.seasonId),row);
  assert.equal(mergeSeasonHistory(merged.history,[guest]).added,0);
});
test('missing and invented rank values are rejected',()=>{
  const row=history.results[0];
  assert.throws(()=>mergeSeasonHistory(history,[{...row,allianceKey:'new-guest',
    raidRank:null}]));
});
