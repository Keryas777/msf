import test from "node:test";
import assert from "node:assert/strict";
import {mergeOfficialCodexTraits} from "../docs/dd-character-traits.mjs";
import {evaluateDimension, rankResults} from "../docs/dd-ranking-engine.mjs";

const manifest={currentPayloadSetChecksum:"sha256:current"};
const traits=Object.fromEntries(Array.from({length:300},(_,i)=>["Hero"+i,["Global","Hero"]]));
traits.Hero0=["City","Hero"];
traits.Hero1=["Cosmic","Villain"];
traits.Hero2=["Global","Mythic"];
const file={schemaVersion:1,sourcePayloadSetChecksum:"sha256:current",characters:traits};
const characters=Object.keys(traits).map(id=>({id,nameKey:id,player_Character:true}));

test("merge only full, checksum-matched official Codex traits",()=>{
  const merged=mergeOfficialCodexTraits(characters,file,manifest);
  assert.deepEqual(merged[0].tags,["City","Hero"]);
  assert.deepEqual(merged[1].tags,["Cosmic","Villain"]);
  assert.equal(characters[0].tags,undefined);
});

test("stale, partial and absent traits fail closed",()=>{
  assert.throws(()=>mergeOfficialCodexTraits(characters,{...file,sourcePayloadSetChecksum:"old"},manifest),/obsolète/);
  assert.throws(()=>mergeOfficialCodexTraits(characters,{...file,characters:{Hero0:["City"]}},manifest),/incomplet/);
  assert.throws(()=>mergeOfficialCodexTraits(characters,null,manifest),/absent/);
});

test("official DD9 origin and exclusion filters can be evaluated",()=>{
  const catalog=mergeOfficialCodexTraits(characters,file,manifest);
  const req=(filter)=>({minCharacters:1,alternatives:[{minGear:21,tagIds:filter.any||[],
    allTagIds:filter.all||[],excludeTagIds:filter.except||[]}]});
  const dimension={nodes:[
    {id:"A2",order:1,requirement:req({})},
    {id:"A5",order:2,requirement:req({any:["City"],except:["Mythic","Legendary","Epic"]})},
    {id:"B9",order:3,requirement:req({any:["Cosmic"]})},
  ]};
  const eligible=evaluateDimension({dimension,roster:{chars:{Hero0:{gear:21},Hero1:{gear:21}}},catalog});
  assert.equal(eligible.status,"theoretical");
  assert.equal(eligible.consecutive,3);
  assert.equal(eligible.prepared,3);
  const insufficient=evaluateDimension({dimension,roster:{chars:{Hero2:{gear:21}}},catalog});
  assert.equal(insufficient.consecutive,1);
  assert.equal(insufficient.nodeStates[1].state,"false");
  const ranks=rankResults([{result:insufficient},{result:eligible}]);
  assert.equal(ranks.ranked[0].result.consecutive,3);
});
