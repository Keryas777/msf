import test from 'node:test';
import assert from 'node:assert/strict';
import {signatureDistance,rankPortraitSignatures,prefilterMetrics} from '../docs/war-counter-prefilter.js';

const sig=(value)=>({g:Array(256).fill(value),c:Array(48).fill(value),e:Array(256).fill(value)});

test('distance nulle pour deux signatures identiques',()=>assert.equal(signatureDistance(sig(42),sig(42)),0));

test('classe le candidat visuellement le plus proche en premier',()=>{
  const ranked=rankPortraitSignatures([sig(20),sig(25)],[{id:'Far',n:'Far',...sig(220)},{id:'Near',n:'Near',...sig(24)}],20);
  assert.equal(ranked[0].id,'Near');
  assert.ok(ranked[0].score<ranked[1].score);
});

test('mesure la présence de la vérité terrain dans le Top N',()=>{
  const result=prefilterMetrics([{slot:'left-1',localCandidates:[{id:'Knull'}]},{slot:'left-2',localCandidates:[{id:'Venom'}]}],[{slot:'left-1',characterId:'Knull'},{slot:'left-2',characterId:'Toxin'}],20);
  assert.deepEqual(result,{evaluated:2,hits:1,topN:20});
});
