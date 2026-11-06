import test from "node:test";
import assert from "node:assert/strict";
import {approvedGuestSources,newestGuestMembers,mergeGuestPlayers}
  from "../scripts/lib/guest-player-directory.mjs";
const fp="a".repeat(64),other="b".repeat(64);
const registry=[
  {key:"zeus",group:"losp"},
  {key:"marines",group:"marines"},
  {key:"endgame-revolution-red",group:"endgame-revolution"},
  {key:"endgame-revolution-orange",group:"endgame-revolution"}
];
const approval={version:1,alliances:[
  {fingerprint:fp,allianceKey:"marines"},
  {fingerprint:other,allianceKey:"endgame-revolution-red"}
]};
const now=Date.parse("2026-11-06T17:00:00Z");
const receipt={version:1,kind:"alliance-infos-campaign",
  allianceFingerprint:fp,campaign:"2026-11-06-pm",
  allianceName:"MΛЯIΠΣƧ",capturedAt:"2026-11-06T14:30:00Z",
  expiresAt:"2026-11-13T14:30:00Z",rows:[
    {name:"Captain",alliance:"MΛЯIΠΣƧ",tcp:100,war_mvp:0,
      icon:"",frame:"",rosterShare:false},
    {name:"Shared",alliance:"MΛЯIΠΣƧ",tcp:200,war_mvp:1,
      icon:"",frame:"",rosterShare:true}
  ]};
const empty={version:1,alliances:{}};
const original=[{player:"Keryas I",alliance:"Zeus"}];
test("only bound, registered and active guest alliances are eligible",()=>{
  const {approved}=approvedGuestSources(registry,approval);
  assert.deepEqual([...approved.keys()],["marines","endgame-revolution-red"]);
  assert.throws(()=>approvedGuestSources(registry,{version:1,alliances:[
    {fingerprint:fp,allianceKey:"marines"},
    {fingerprint:fp,allianceKey:"endgame-revolution-red"}]}));
});
test("Infos receipt lists non-sharing members without publishing profile fields",async()=>{
  const files=[];
  const reader={getJSON:async key=>{
    files.push(key);
    return key.endsWith("/2026-11-06-pm-infos.json")?receipt:null;
  }};
  const received=await newestGuestMembers(reader,fp,"marines",now);
  assert.deepEqual(received.players,[
    {player:"Captain",alliance:"marines"},
    {player:"Shared",alliance:"marines"}]);
  assert.equal(received.players[0].rosterShare,undefined);
  assert.equal(files.length,1);
});
test("newest invalid receipt is not bypassed",async()=>{
  const bad={...receipt,rows:[...receipt.rows,receipt.rows[0]]};
  await assert.rejects(newestGuestMembers({
    getJSON:async()=>bad
  },fp,"marines",now));
});
test("unavailable guest retains last published directory up to 30 days",()=>{
  const prior=[...original,{player:"Old Marine",alliance:"marines"}];
  const state={version:1,alliances:{marines:{capturedAt:"2026-11-05T14:30:00Z"}}};
  const output=mergeGuestPlayers(prior,registry,approval,new Map(),state,now);
  assert.deepEqual(output.players,prior);
  assert.deepEqual(output.state.alliances.marines,state.alliances.marines);
  const stale=mergeGuestPlayers(prior,registry,approval,new Map(),state,
    now+31*86400000);
  assert.deepEqual(stale.players,original);
});
test("revoked guest is removed, other groups preserved",()=>{
  const before=[...original,{player:"Captain",alliance:"marines"},
    {player:"End",alliance:"endgame-revolution-red"}];
  const state={version:1,alliances:{
    marines:{capturedAt:"2026-11-06T14:30:00Z"},
    "endgame-revolution-red":{capturedAt:"2026-11-06T14:30:00Z"}}};
  const revoked={version:1,alliances:[approval.alliances[1]]};
  const out=mergeGuestPlayers(before,registry,revoked,new Map(),state,now);
  assert.deepEqual(out.players,[original[0],before[2]]);
  assert.equal(out.state.alliances.marines,undefined);
});
test("same pseudonym in different alliances remains distinct",()=>{
  const fresh=new Map([
    ["marines",{capturedAt:receipt.capturedAt,players:[
      {player:"Same",alliance:"marines"}]}],
    ["endgame-revolution-red",{capturedAt:receipt.capturedAt,players:[
      {player:"Same",alliance:"endgame-revolution-red"}]}]
  ]);
  const out=mergeGuestPlayers(original,registry,approval,fresh,empty,now);
  assert.equal(out.players.length,3);
  assert.deepEqual(out.players.map(p=>p.alliance),[
    "Zeus","marines","endgame-revolution-red"]);
});
test("an unknown guest binding cannot publish a private alliance",()=>{
  const guest=approvedGuestSources(registry,{version:1,alliances:[
    {fingerprint:fp,allianceKey:"unregistered"}]});
  assert.equal(guest.approved.size,0);
});
