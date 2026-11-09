import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {validateApprovals,validateConsent,validateIndex,validateSnapshot,publicAsset,
  publicInfos,assertOperationalResult,pruneLegacyGuestHistory,writeInfosOnly,
  auditRosterShareByStableId,collectLegacyGuestConsentAudit}
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
    {fingerprint:"b".repeat(64),allianceKey:"inactive-guest"},
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
test("portrait assets are limited to the official MSF image host",()=>{
  assert.equal(publicAsset("https://assets.marvelstrikeforce.com/imgs/avatar.png"),
    "https://assets.marvelstrikeforce.com/imgs/avatar.png");
  assert.equal(publicAsset("https://example.com/avatar.png"),"");
  assert.equal(publicAsset("https://assets.marvelstrikeforce.com.evil/imgs/a.png"),"");
});
test("exporter does not reference Scopely or publish identifiers and credentials",async()=>{
  const source=await readFile(new URL("../scripts/publish-guest-evolution.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/discordId|discord_id|Bearer /i);
  assert.match(source,/webapp-evolution\/v1/);
});

test("archive index matches the permanent R2 writer contract exactly",()=>{
  const writtenByWorker={version:1,fingerprint:fp,allianceKey:"new-guest",
    checkpoints:[{date:"2026-11-08",sourceCapturedAt:"2026-11-08T22:00:00Z",
      players:["Share"]}]};
  assert.equal(validateIndex(writtenByWorker,fp,"new-guest"),writtenByWorker);
  assert.throws(()=>validateIndex(null,fp,"new-guest"),/absent or not a JSON object/);
  assert.throws(()=>validateIndex({...writtenByWorker,fingerprint:"b".repeat(64)},
    fp,"new-guest"),/fingerprint does not match/);
  assert.throws(()=>validateIndex({...writtenByWorker,allianceKey:"other"},
    fp,"new-guest"),/allianceKey does not match/);
});
test("guest infos project approved portrait URLs without the removed profileValue helper",()=>{
  const consent={sharers:new Set(["share"])};
  const rows=[{name:"Share",icon:"https://assets.marvelstrikeforce.com/imgs/a.png",
    frame:"https://assets.marvelstrikeforce.com/imgs/f.png"},
    {name:"Private",icon:"https://assets.marvelstrikeforce.com/imgs/private.png"}];
  assert.deepEqual(publicInfos(rows,"new-guest",consent),[
    {name:"Share",alliance:"new-guest",
      icon:"https://assets.marvelstrikeforce.com/imgs/a.png",
      frame:"https://assets.marvelstrikeforce.com/imgs/f.png"}]);
});
test("a dry-run with approved but zero validated alliances is operational failure",()=>{
  assert.throws(()=>assertOperationalResult(4,0),/not operational/);
  assert.doesNotThrow(()=>assertOperationalResult(4,1));
  assert.doesNotThrow(()=>assertOperationalResult(0,0));
});

async function legacyFixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"guest-evolution-legacy-"));
  const history=path.join(root,"roster-history");
  const date="2026-11-08";
  const index={version:1,players:{
    losp:{name:"LoSP",currentAlliance:"zeus",checkpoints:[date]},
    shared:{name:"Shared",currentAlliance:"questionable-propriety",checkpoints:[date]},
    withdrawn:{name:"Withdrawn",currentAlliance:"questionable-propriety",checkpoints:[date]}
  },checkpoints:[{date,players:3}]};
  const group={version:1,checkpoint:date,players:[
    {player:"LoSP",playerKey:"losp",alliance:"zeus",totalPower:1},
    {player:"Shared",playerKey:"shared",alliance:"questionable-propriety",totalPower:2},
    {player:"Withdrawn",playerKey:"withdrawn",alliance:"questionable-propriety",totalPower:3}
  ]};
  await mkdir(path.join(history,"group"),{recursive:true});
  await mkdir(path.join(history,"players","losp"),{recursive:true});
  await mkdir(path.join(history,"players","shared"),{recursive:true});
  await mkdir(path.join(history,"players","withdrawn"),{recursive:true});
  await writeFile(path.join(history,"index.json"),JSON.stringify(index));
  await writeFile(path.join(history,"group",date+".json"),JSON.stringify(group));
  for(const [key,player,alliance] of [
    ["losp","LoSP","zeus"],["shared","Shared","questionable-propriety"],
    ["withdrawn","Withdrawn","questionable-propriety"]]){
    await writeFile(path.join(history,"players",key,date+".json"),
      JSON.stringify({player,playerKey:key,alliance,checkpoint:date,chars:{},iso:{}}));
  }
  return {root,history,date};
}
test("legacy guest consent pruning preserves LoSP and sharing players, removes withdrawn history",async()=>{
  const f=await legacyFixture();
  try{
    const result=await pruneLegacyGuestHistory(f.root,new Set(["questionable-propriety"]),
      new Map([["questionable-propriety",new Set(["shared"])]]));
    assert.deepEqual(result,{indexPlayers:1,groupRows:1,playerFiles:1});
    const index=JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"index.json"),"utf8"));
    const group=JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"group",f.date+".json"),"utf8"));
    assert.deepEqual(Object.keys(index.players).sort(),["losp","shared"]);
    assert.equal(index.checkpoints[0].players,2);
    assert.deepEqual(group.players.map(p=>p.player).sort(),["LoSP","Shared"]);
    await assert.rejects((await import("node:fs/promises")).readFile(
      path.join(f.history,"players","withdrawn",f.date+".json")));
    await (await import("node:fs/promises")).readFile(
      path.join(f.history,"players","shared",f.date+".json"),"utf8");
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test("unverifiable legacy guest consent preserves existing files until verified",async()=>{
  const f=await legacyFixture();
  try{
    const result=await pruneLegacyGuestHistory(f.root,new Set(["questionable-propriety"]),new Map());
    assert.deepEqual(result,{indexPlayers:0,groupRows:0,playerFiles:0});
    const index=JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"index.json"),"utf8"));
    assert.equal(Object.keys(index.players).length,3);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test("an unverified guest authorization preserves legacy history instead of treating missing R2 as revocation",async()=>{
  const f=await legacyFixture();
  try{
    const result=await pruneLegacyGuestHistory(f.root,new Set(["questionable-propriety"]),
      new Map([["questionable-propriety",null]]));
    assert.deepEqual(result,{indexPlayers:0,groupRows:0,playerFiles:0});
    const index=JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"index.json"),"utf8"));
    assert.deepEqual(Object.keys(index.players).sort(),["losp","shared","withdrawn"]);
    assert.equal(index.checkpoints[0].players,3);
    assert.equal(JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"group",f.date+".json"),"utf8")).players.length,3);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test("an explicit alliance revocation removes legacy guest files but preserves LoSP",async()=>{
  const f=await legacyFixture();
  try{
    const result=await pruneLegacyGuestHistory(f.root,new Set(["questionable-propriety"]),
      new Map([["questionable-propriety",false]]));
    assert.deepEqual(result,{indexPlayers:2,groupRows:2,playerFiles:2});
    const index=JSON.parse(await readFile(path.join(f.history,"index.json"),"utf8"));
    assert.deepEqual(Object.keys(index.players),["losp"]);
    assert.equal(index.checkpoints[0].players,1);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test("consented portrait metadata can be refreshed without replacing guest history files",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"guest-evolution-infos-"));
  try{
    const dir=path.join(root,"questionable-propriety");
    await mkdir(dir,{recursive:true});
    const indexFile=path.join(dir,"index.json");
    await writeFile(indexFile,'{"version":1,"players":{},"checkpoints":[]}');
    const infos=[{name:"Shared",alliance:"questionable-propriety",
      icon:"https://assets.marvelstrikeforce.com/imgs/a.png"}];
    assert.equal(await writeInfosOnly(root,"questionable-propriety",infos),true);
    assert.equal(await writeInfosOnly(root,"questionable-propriety",infos),false);
    assert.equal(await readFile(indexFile,"utf8"),
      '{"version":1,"players":{},"checkpoints":[]}');
    assert.deepEqual(JSON.parse(await readFile(path.join(dir,"infos.json"),"utf8")),infos);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("stable aid, not a nickname match, separates homonyms and classifies revocations",()=>{
  const players=[
    {player:"SameNick",aid:"account-1"},
    {player:"SameNick",aid:"account-2"},
    {player:"NoStableId"}
  ];
  const receipt=[
    {name:"SameNick",aid:"account-1",rosterShare:true},
    {name:"SameNick",aid:"account-2",rosterShare:false},
    {name:"NoStableId",rosterShare:true}
  ];
  assert.deepEqual(auditRosterShareByStableId(players,receipt),
    {valid:1,revoked:1,unverifiable:1});
});
test("matching pseudo names without stable IDs remains unverifiable",()=>{
  const players=Array.from({length:22},(_,i)=>({player:"PrivateNickname"+i}));
  const receipt=players.map(p=>({name:p.player,rosterShare:true}));
  const result=auditRosterShareByStableId(players,receipt);
  assert.deepEqual(result,{valid:0,revoked:0,unverifiable:22});
  assert.equal(Object.values(result).reduce((a,b)=>a+b,0),22);
  assert.doesNotMatch(JSON.stringify(result),/PrivateNickname/);
});
test("ambiguous or absent stable IDs never convert a false pseudo match into consent",()=>{
  const players=[{player:"Twin",aid:"duplicate"},{player:"Twin",aid:"duplicate"}];
  const receipt=[{name:"Twin",aid:"duplicate",rosterShare:true},
    {name:"Twin",aid:"duplicate",rosterShare:false}];
  assert.deepEqual(auditRosterShareByStableId(players,receipt),
    {valid:0,revoked:0,unverifiable:2});
  assert.deepEqual(auditRosterShareByStableId([{player:"Twin",aid:"one"}],
    [{name:"Twin",aid:"other",rosterShare:false}]),
    {valid:0,revoked:0,unverifiable:1});
});
test("legacy consent diagnostic selects latest guest checkpoint dynamically and emits aggregates only",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"guest-evolution-consent-audit-"));
  try{
    const history=path.join(root,"roster-history");
    const groupDir=path.join(history,"group");
    await mkdir(groupDir,{recursive:true});
    const older="2026-11-01",latest="2026-11-08";
    const writeGroup=async(date,players)=>writeFile(path.join(groupDir,date+".json"),
      JSON.stringify({version:1,checkpoint:date,players}));
    await writeGroup(older,[{player:"OlderOnly",playerKey:"olderonly",
      alliance:"future-guest",totalPower:1}]);
    await writeGroup(latest,[
      {player:"Private One",playerKey:"privateone",alliance:"future-guest",totalPower:2},
      {player:"Private Two",playerKey:"privatetwo",alliance:"future-guest",totalPower:3},
      {player:"LoSP",playerKey:"losp",alliance:"zeus",totalPower:4}
    ]);
    const consentByAlliance=new Map([["future-guest",{source:{rows:[
      {name:"Private One",rosterShare:true},{name:"Private Two",rosterShare:false}
    ]}}]]);
    const result=await collectLegacyGuestConsentAudit(root,new Set(["future-guest"]),
      consentByAlliance);
    assert.deepEqual(result,[{alliance:"future-guest",date:latest,
      counts:{valid:0,revoked:0,unverifiable:2},balanced:true}]);
    assert.doesNotMatch(JSON.stringify(result),/Private One|Private Two/);
    assert.equal(result[0].counts.valid+result[0].counts.revoked+
      result[0].counts.unverifiable,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
