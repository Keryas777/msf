import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {guestRosterFingerprint} from "../scripts/lib/roster-guest-r2-map.mjs";

const fp="a".repeat(64),losp="b".repeat(64),red="c".repeat(64);
const known=JSON.parse(readFileSync(new URL("../docs/data/alliances.json",import.meta.url),"utf8"));
const approvals={version:1,alliances:[
  {fingerprint:fp,allianceKey:"marines"},
  {fingerprint:red,allianceKey:"endgame-revolution-red"}
]};
test("approved, bound MARINES and ENDGAME import their private source only",()=>{
  const map={zeus:losp};
  assert.equal(guestRosterFingerprint(known,approvals,"marines",map),fp);
  assert.equal(guestRosterFingerprint(known,approvals,"endgame-revolution-red",map),red);
});
test("LoSP, unknown and unbound guest keys cannot be imported",()=>{
  const map={zeus:losp};
  for(const key of ["zeus","unknown","endgame-revolution-orange"]){
    assert.throws(()=>guestRosterFingerprint(known,approvals,key,map));
  }
});
test("approval revoked or fingerprint already LoSP fail closed",()=>{
  assert.throws(()=>guestRosterFingerprint(known,
    {version:1,alliances:[]},"marines"));
  assert.throws(()=>guestRosterFingerprint(known,approvals,"marines",{zeus:fp}));
});
test("duplicate fingerprints or two keys bound to one fingerprint are rejected",()=>{
  assert.throws(()=>guestRosterFingerprint(known,{version:1,alliances:[
    {fingerprint:fp,allianceKey:"marines"},
    {fingerprint:fp,allianceKey:"endgame-revolution-red"}
  ]},"marines"));
  assert.throws(()=>guestRosterFingerprint(known,{version:1,alliances:[
    {fingerprint:fp,allianceKey:"marines"},
    {fingerprint:red,allianceKey:"marines"}
  ]},"marines"));
});
test("the importer requires a verified R2 guest map, never a browser key or public fingerprint",()=>{
  const script=readFileSync(new URL("../scripts/pull-rosters-r2.mjs",import.meta.url),"utf8");
  assert.match(script,/guestRosterFingerprint\(allAlliances/);
  assert.match(script,/roster-sync\/v1\/approved-guest-alliances\.json/);
  assert.match(script,/--guest-alliance=/);
  assert.match(script,/if\(!guestAlliance\|\|error\.code!=='ENOENT'\)throw error/);
  const workflow=readFileSync(
    new URL("../.github/workflows/pull-rosters-r2.yml",import.meta.url),"utf8");
  assert.match(workflow,/INPUT_GUEST_ALLIANCE/);
});
