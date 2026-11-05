import {test} from "node:test";
import assert from "node:assert/strict";
import {infoCampaign,validateInfoSnapshot,assertNoAmbiguousPlayers,publishedInfosAlliances}
  from "../scripts/lib/infos-r2-import.mjs";

const fp="a".repeat(64);
const campaign="2026-10-31-am";
const now=Date.parse("2026-10-31T05:00:00Z");
const row={name:"Edge",alliance:"LoSP Dionysos",tcp:200000000,war_mvp:4,
  icon:"https://assets.marvelstrikeforce.com/icon.png",
  frame:"https://assets.marvelstrikeforce.com/frame.png",
  rank:"captain",rosterShare:false,charactersCollected:360,
  level:{completedTier:110},latestArena:25,blitzWins:256,
  wwPoints:0,aid:42,qualifications:{type:"casual"}};
const receipt=()=>({version:1,kind:"alliance-infos-campaign",
  campaign,allianceFingerprint:fp,allianceName:"LoSP Dionysos",
  capturedAt:"2026-10-31T03:15:00Z",
  expiresAt:"2026-11-07T03:15:00Z",rows:[row]});

test("AM and PM campaigns reject invalid combinations",()=>{
  assert.equal(infoCampaign("2026-10-31","am"),campaign);
  assert.equal(infoCampaign("2026-10-31","pm"),"2026-10-31-pm");
  assert.throws(()=>infoCampaign("2026-10-32","am"));
});
test("full member card enrichment preserves the historical six-field contract",()=>{
  const result=validateInfoSnapshot(receipt(),fp,campaign,"Dionysos",now);
  assert.equal(result.length,1);
  assert.deepEqual(result[0],{...row,alliance:"Dionysos"});
  assert.equal(result[0].rosterShare,false); // Never exclude non-shared members.
});
test("missing optional profile statistics are not invented as zero",()=>{
  const r=receipt();r.rows=[{name:"Eki",alliance:"LoSP Dionysos",
    tcp:100,war_mvp:0,icon:"",frame:"",profileStatus:"unavailable"}];
  const result=validateInfoSnapshot(r,fp,campaign,"Dionysos",now);
  assert.equal(result[0].latestArena,undefined);
  assert.equal(result[0].war_mvp,0);
});
test("rejects stale, mismatched or duplicate campaign members",()=>{
  const r=receipt();r.rows.push({...row});
  assert.throws(()=>validateInfoSnapshot(r,fp,campaign,"Dionysos",now),/duplicate/);
  const expired=receipt();expired.expiresAt="2026-10-31T03:20:00Z";
  assert.throws(()=>validateInfoSnapshot(expired,fp,campaign,"Dionysos",now),/Expired/);
  assert.throws(()=>validateInfoSnapshot(receipt(),"b".repeat(64),campaign,"Dionysos",now));
});
test("fail closed on a transfer into one newly published alliance",()=>{
  assert.throws(()=>assertNoAmbiguousPlayers(new Map([
    ["kronos",[{name:"Edge"}]],["dionysos",[{name:"Edge"}]]
  ])),/multiple alliances/);
  assert.doesNotThrow(()=>assertNoAmbiguousPlayers(new Map([
    ["kronos",[{name:"Eki"}]],["dionysos",[{name:"Edge"}]]
  ])));
});

test("CLI accepts --write and reaches private configuration validation",async()=>{
  const {spawnSync}=await import("node:child_process");
  const {fileURLToPath}=await import("node:url");
  const script=fileURLToPath(new URL("../scripts/pull-infos-r2.mjs",import.meta.url));
  const env={...process.env,LOSP_R2_ALLIANCE_MAP_JSON:"",
    INPUT_DAY:"2026-11-01",INPUT_PERIOD:"am"};
  const run=spawnSync(process.execPath,[script,"--write"],{
    env,encoding:"utf8",timeout:15000
  });
  assert.equal(run.status,1);
  assert.match(run.stderr,/Invalid private alliance mapping JSON/);
  assert.doesNotMatch(run.stderr,/Only --write is supported/);
  const invalid=spawnSync(process.execPath,[script,"--unknown"],{
    env,encoding:"utf8",timeout:15000
  });
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/Only --write is supported/);
});

test("legacy Infos publisher ignores registered guests without their own source files",()=>{
  const registered=[
    {key:"zeus",group:"losp"},{key:"hades",group:"losp"},
    {key:"marines",group:"marines"},
    {key:"endgame-revolution-red",group:"endgame-revolution"},
    {key:"endgame-revolution-orange",group:"endgame-revolution"},
    {key:"retired",group:"losp",active:false}
  ];
  assert.deepEqual(publishedInfosAlliances(registered).map(a=>a.key),
    ["zeus","hades"]);
  assert.throws(()=>publishedInfosAlliances([{key:"marines",group:"marines"}]),
    /No valid published/);
  assert.throws(()=>publishedInfosAlliances(null),/Invalid Infos/);
});
