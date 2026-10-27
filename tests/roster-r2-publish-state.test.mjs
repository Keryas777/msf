import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRosterImportState,rosterCampaignIsNewer,advanceRosterImportState}
  from '../scripts/lib/roster-r2-publish-state.mjs';

test('no publication checkpoint is a valid one-time bootstrap',()=>{
  assert.deepEqual(parseRosterImportState(null),{version:1,alliances:{}});
});
test('AM, PM and following-day ordering is monotonic for each alliance',()=>{
  let state=parseRosterImportState(null);
  state=advanceRosterImportState(state,['zeus','athena'],'2026-10-27-am');
  assert.equal(rosterCampaignIsNewer(state,'zeus','2026-10-27-am'),false);
  assert.equal(rosterCampaignIsNewer(state,'zeus','2026-10-27-pm'),true);
  state=advanceRosterImportState(state,['zeus'],'2026-10-27-pm');
  assert.equal(rosterCampaignIsNewer(state,'zeus','2026-10-27-am'),false);
  assert.equal(rosterCampaignIsNewer(state,'zeus','2026-10-27-pm'),false);
  assert.equal(rosterCampaignIsNewer(state,'athena','2026-10-27-pm'),true);
  assert.equal(rosterCampaignIsNewer(state,'zeus','2026-10-28-am'),true);
  assert.throws(()=>advanceRosterImportState(state,['zeus'],'2026-10-27-am'),
    /cannot move backwards/);
});
test('checkpoint rejects corrupt days and invalid format instead of silently resetting',()=>{
  for(const value of [{},{version:0,alliances:{}},{version:1,alliances:null},
    {version:1,alliances:{zeus:'2026-02-30-am'}},
    {version:1,alliances:{zeus:'2026-10-27-invalid'}},
    {version:1,alliances:{'../private':'2026-10-27-am'}}])
    assert.throws(()=>parseRosterImportState(value),/Invalid/);
});
test('existing alliance checkpoints remain intact after other alliance updates',()=>{
  const before=parseRosterImportState({version:1,alliances:{
    zeus:'2026-10-27-pm',athena:'2026-10-27-am'
  }});
  const after=advanceRosterImportState(before,['athena'],'2026-10-27-pm');
  assert.equal(before.alliances.athena,'2026-10-27-am');
  assert.equal(after.alliances.athena,'2026-10-27-pm');
  assert.equal(after.alliances.zeus,'2026-10-27-pm');
});
