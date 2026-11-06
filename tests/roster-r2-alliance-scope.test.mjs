import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectLoSPRosterAlliances} from "../scripts/lib/roster-r2-alliance-scope.mjs";
import {readMapping} from "../scripts/lib/alliance-r2-history.mjs";

const registry=JSON.parse(readFileSync(
  new URL("../docs/data/alliances.json", import.meta.url),"utf8"));
test("public LoSP R2 importer only requires existing LoSP files",()=>{
  const selected=selectLoSPRosterAlliances(registry);
  assert.equal(selected.length,6);
  assert.ok(selected.every(a=>a.group==="losp"));
  assert.ok(!selected.some(a=>a.key==="marines"||
    a.key.startsWith("endgame-revolution")));
});
test("LoSP private mapping need not contain guest fingerprints",()=>{
  const selected=selectLoSPRosterAlliances(registry);
  const map=Object.fromEntries(selected.map((a,i)=>[
    a.key,String(i+1).repeat(64)]));
  assert.equal(Object.keys(readMapping(JSON.stringify(map),selected)).length,6);
  assert.throws(()=>readMapping(JSON.stringify(map),registry),
    /Incomplete private alliance fingerprint mapping/);
});
test("new LoSP alliances are dynamic and disabled ones are skipped",()=>{
  const selected=selectLoSPRosterAlliances([
    {key:"new-losp",group:"losp"},
    {key:"nope",group:"losp",active:false},
    {key:"invited",group:"guest"},
  ]);
  assert.deepEqual(selected.map(a=>a.key),["new-losp"]);
});
test("malformed duplicate LoSP aliases do not create ambiguous publication",()=>{
  assert.throws(()=>selectLoSPRosterAlliances(
    [{key:"zeus",group:"losp"},{key:"zeus",group:"losp"}]),
    /duplicate/);
  assert.throws(()=>selectLoSPRosterAlliances(
    [{key:"marines",group:"marines"}]),
    /No approved LoSP/);
});
test("production importer selects LoSP scope before private mapping and JSON lookup",()=>{
  const source=readFileSync(
    new URL("../scripts/pull-rosters-r2.mjs",import.meta.url),"utf8");
  assert.match(source,/selectLoSPRosterAlliances\(/);
  assert.ok(source.indexOf("selectLoSPRosterAlliances(")<
    source.indexOf("readMapping(secret,registry)"));
  assert.ok(source.indexOf("selectLoSPRosterAlliances(")<
    source.indexOf("for(const alliance of registry)"));
});
