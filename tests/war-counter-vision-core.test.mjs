import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_IMAGE_BYTES, SLOT_ORDER, createDraft, getLayoutSlots, validateDraft, calculateTopMetrics } from "../docs/war-counter-lab-core.js";
const catalog=JSON.parse(fs.readFileSync(new URL("../docs/data/msf-characters.json",import.meta.url)));
const truth=JSON.parse(fs.readFileSync(new URL("../docs/data/war-counter-vision/benchmark-ground-truth.json",import.meta.url)));

test("limite 12 Mo et ordre stable",()=>{assert.equal(MAX_IMAGE_BYTES,12582912);assert.equal(SLOT_ORDER.length,10);assert.deepEqual(getLayoutSlots().map(x=>x.slot),SLOT_ORDER);});
test("contrat déterministe de dix slots",()=>{const draft=createDraft();assert.equal(draft.groqRealCalls,0);assert.equal(validateDraft(draft,new Set(catalog.map(x=>x.id))),true);});
test("vérités terrain 20 slots, 13 barrés et IDs catalogue",()=>{const slots=truth.captures.flatMap(c=>c.slots);assert.equal(slots.length,20);assert.equal(slots.filter(x=>x.barred).length,13);const ids=new Set(catalog.map(x=>x.id));for(const slot of slots)assert.ok(ids.has(slot.characterId),slot.characterId);});
test("refus doublon",()=>{const draft=createDraft();draft.slots[1].slot=draft.slots[0].slot;assert.throws(()=>validateDraft(draft),/Slots/);});
test("top 1 top 3 top 5 local ou mock",()=>{const gt=truth.captures[0].slots;const slots=gt.map((x,i)=>({slot:x.slot,candidates:i===0?[{characterId:"Yondu"},{characterId:x.characterId}]:[{characterId:x.characterId}]}));assert.deepEqual(calculateTopMetrics(slots,gt),{evaluated:10,top1:9,top3:10,top5:10});});
