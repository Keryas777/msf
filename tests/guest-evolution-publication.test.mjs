import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {validateApprovals,validateConsent,validateIndex,validateSnapshot,publicAsset,
  publicInfos,assertOperationalResult,pruneLegacyGuestHistory}
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
test("revoked guest approval removes its current public history without changing LoSP",async()=>{
  const f=await legacyFixture();
  try{
    const result=await pruneLegacyGuestHistory(f.root,new Set(["questionable-propriety"]),
      new Map([["questionable-propriety",null]]));
    assert.deepEqual(result,{indexPlayers:2,groupRows:2,playerFiles:2});
    const index=JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"index.json"),"utf8"));
    assert.deepEqual(Object.keys(index.players),["losp"]);
    assert.equal(index.checkpoints[0].players,1);
    assert.equal(JSON.parse(await (await import("node:fs/promises")).readFile(
      path.join(f.history,"group",f.date+".json"),"utf8")).players.length,1);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
