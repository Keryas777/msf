import test from "node:test";
import assert from "node:assert/strict";
import {progressSections,progressFills} from "../docs/dd-progress-sections.mjs";
import {readFileSync} from "node:fs";

const config=JSON.parse(readFileSync(new URL("../docs/data/dark-dimensions.json",import.meta.url),"utf8"));
const nodes=config.dimensions.find(d=>d.key==="dd9").nodes;

test("official DD9 requirements form seven consecutive sections",()=>{
  assert.deepEqual(progressSections(nodes),[2,3,3,3,2,2,1]);
});

test("11 of 16 fills four groups and leaves the remaining three empty",()=>{
  assert.deepEqual(progressFills(progressSections(nodes),11),[100,100,100,100,0,0,0]);
});

test("partial section uses proportional fill; completion fills every section",()=>{
  assert.deepEqual(progressFills([2,3,3],4),[100,200/3,0].map(v=>Math.round(v*100)/100));
  assert.deepEqual(progressFills([2,3,3],0,true),[100,100,100]);
});

test("section grouping changes with requirement JSON, not fixed indices",()=>{
  assert.deepEqual(progressSections([
    {order:1,requirement:{minCharacters:5}},
    {order:2,requirement:{minCharacters:5}},
    {order:3,requirement:{minCharacters:4}},
  ]),[2,1]);
});
