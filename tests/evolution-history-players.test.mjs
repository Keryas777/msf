import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the exact function shipped to GitHub Pages without loading a browser.
// The live rosters represent consented, currently available observations;
// the history index independently records legitimate past checkpoints.
const script=readFileSync(new URL('../docs/evolution.js',import.meta.url),'utf8');
const start=script.indexOf('  function playersForAlliance(');
const end=script.indexOf('  function sessionPlayerNames(',start);
assert.ok(start>=0&&end>start,'Could not locate the real player-selector implementation');
const selectorSource=script.slice(start,end);

function select(state,alliance){
  const normalizeKey=s=>String(s??'').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const getRosterPlayerKey=row=>normalizeKey(row?.playerKey||row?.player);
  const canonicalPlayerName=s=>String(s??'').trim();
  return runInNewContext(selectorSource+'\nplayersForAlliance(arguments[0]);',{
    state,normalizeKey,getRosterPlayerKey,canonicalPlayerName,arguments:[alliance]
  });
}
test('historical players stay selectable when an authorized-only roster omits them',()=>{
  const state={
    rosters:[
      {alliance:'zeus',player:'Active Member',playerKey:'activemember'},
      {alliance:'poseidon',player:'Transferred',playerKey:'transferred'}
    ],
    historyIndex:{players:{
      activemember:{name:'Active Member',currentAlliance:'zeus',
        checkpoints:['2026-09-01','2026-10-01']},
      withheld:{name:'Archived Player',currentAlliance:'zeus',
        checkpoints:['2026-09-01','2026-10-01']},
      transferred:{name:'Transferred',currentAlliance:'zeus',
        checkpoints:['2026-09-01','2026-10-01']},
      poseidon:{name:'Poseidon Historical',currentAlliance:'poseidon',
        checkpoints:['2026-10-01']},
      empty:{name:'Empty Checkpoints',currentAlliance:'zeus',checkpoints:[]}
    }}
  };
  const zeus=Array.from(select(state,'zeus'));
  assert.deepEqual(zeus.map(x=>x.key),['activemember','withheld']);
  assert.equal(zeus[0].label,'Active Member');
  assert.equal(zeus[1].label,'Archived Player (historique)');
  assert.ok(!zeus.some(x=>x.key==='transferred'),
    'A player now in another alliance must not be duplicated in the old one');
  const poseidon=Array.from(select(state,'poseidon'));
  assert.deepEqual(poseidon.map(x=>x.key),['poseidon','transferred']);
  assert.equal(poseidon[1].label,'Transferred');
});
test('no past checkpoint means no fake historical player',()=>{
  const state={rosters:[],historyIndex:{players:{
    missing:{name:'No snapshot',currentAlliance:'zeus',checkpoints:[]}
  }}};
  assert.equal(select(state,'zeus').length,0);
});
