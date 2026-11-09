import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateApprovals,validateConsent,validateIndex,validateSnapshot}
  from "../scripts/publish-guest-evolution.mjs";

const fp="a".repeat(64);
const registry=[{key:"zeus",group:"losp"},
  {key:"new-guest",group:"new-guest",active:true},
  {key:"inactive-guest",group:"inactive-guest",active:false}];
const now=Date.parse("2026-11-09T12:00:00Z");
test("approved future alliance resolves dynamically from canonical registry",()=>{
  const result=validateApprovals({version:1,alliances:[{fingerprint:fp,
    allianceKey:"new-guest"}]},registry);
  assert.deepEqual(result,[{fingerprint:fp,key:"new-guest"}]);
});
test("LoSP, inactive, and unbound records are excluded",()=>{
  const result=validateApprovals({version:1,alliances:[
    {fingerprint:fp,allianceKey:"zeus"},
    {fingerprint:"b".repeat(64),allianceKey:"new-guest"},
    {fingerprint:"c".repeat(64)}]},registry);
  assert.deepEqual(result,[]);
});
test("absent and withdrawn rosterShare consent are never exportable",()=>{
  const base={version:1,kind:"alliance-infos-campaign",allianceFingerprint:fp,
    campaign:"2026-11-09-am",capturedAt:"2026-11-09T10:00:00Z",
    expiresAt:"2026-11-15T10:00:00Z"};
  assert.equal(validateConsent({...base,rows:[{name:"A"}]},fp,now),null);
  const revoked=validateConsent({...base,rows:[{name:"A",rosterShare:false}]},fp,now);
  assert.equal(revoked.sharers.size,0);
});
test("valid consent selects only sharing players",()=>{
  const source={version:1,kind:"alliance-infos-campaign",allianceFingerprint:fp,
    campaign:"2026-11-09-am",capturedAt:"2026-11-09T10:00:00Z",
    expiresAt:"2026-11-15T10:00:00Z",rows:[
      {name:"Share",rosterShare:true},{name:"Private",rosterShare:false}]};
  assert.deepEqual([...validateConsent(source,fp,now).sharers],["share"]);
});
test("cumulative index and archive integrity require exact real checkpoints",()=>{
  const index={version:1,fingerprint:fp,allianceKey:"new-guest",
    checkpoints:[{date:"2026-11-08",sourceCapturedAt:"2026-11-08T22:00:00Z",
      players:["Share"]}]};
  validateIndex(index,fp,"new-guest");
  const snapshot={version:1,fingerprint:fp,allianceKey:"new-guest",
    date:"2026-11-08",sourceCapturedAt:index.checkpoints[0].sourceCapturedAt,
    players:[{player:"Share",alliance:"new-guest",chars:{hero:{power:4}},iso:{}}]};
  assert.equal(validateSnapshot(snapshot,fp,"new-guest",index.checkpoints[0]),snapshot);
  assert.throws(()=>validateSnapshot({...snapshot,date:"2026-11-01"},fp,
    "new-guest",index.checkpoints[0]),/invalid/);
});
test("exporter does not reference Scopely or publish identifiers and credentials",async()=>{
  const source=await readFile(new URL("../scripts/publish-guest-evolution.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/discordId|discord_id|Authorization|Bearer /i);
  assert.match(source,/webapp-evolution\/v1/);
});
