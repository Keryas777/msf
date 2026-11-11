// Fetch complete, rank-only Arena history from Cloudflare's validated R2 export.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const validDay=value=>DAY.test(value||"")&&
  Number.isFinite(Date.parse(value+"T00:00:00Z"))&&
  new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
function args(argv){
  const value=argv.find(x=>x.startsWith("--date="))?.slice(7);
  if(!validDay(value))throw Error("Expected --date=YYYY-MM-DD");
  return value;
}
export function validateArenaCampaign(data,day){
  const source=data?.snapshot;
  if(data?.status!=="complete"||source?.version!==1||
     source.date!==day||source.sourceDay!==day||
     source.sourceCampaign!==day+"-reward"||
     source.campaignId!==day+"-reward"||
     source.attribution!=="cloudflare-arena-reward-collection"||
     source.sourceKind!=="reward"||
     !Number.isSafeInteger(source.alliancesExpected)||
     source.alliancesExpected<1||
     source.alliancesComplete!==source.alliancesExpected||
     !Array.isArray(source.provenance)||source.provenance.length!==source.alliancesExpected||
     !Array.isArray(source.players)||!source.players.length||source.players.length>500)
    throw Error("Cloudflare Arena campaign is incomplete or has invalid provenance");
  const cutoff=Date.parse(day+"T16:01:00Z"),seen=new Set();
  const provenance=source.provenance.map(row=>{
    if(typeof row?.alliance!=="string"||!row.alliance.trim()||
       !Number.isFinite(Date.parse(row.capturedAt))||Date.parse(row.capturedAt)<cutoff||
       row.capturedAt.slice(0,10)!==day)
      throw Error("Cloudflare Arena campaign contains a stale alliance receipt");
    return {alliance:row.alliance.trim(),capturedAt:row.capturedAt};
  });
  const players=source.players.map(row=>{
    if(typeof row?.playerId!=="string"||!/^p_[a-f0-9]{64}$/.test(row.playerId)||
       typeof row.name!=="string"||!row.name.trim()||row.name.length>140||
       typeof row.alliance!=="string"||!row.alliance.trim()||
       !Number.isSafeInteger(row.arenaRank)||row.arenaRank<1)
      throw Error("Cloudflare Arena campaign contains an invalid player row");
    const playerKey=row.playerId,unique=playerKey+"\u0000"+row.alliance;
    if(seen.has(unique))throw Error("Duplicate Arena player identity");
    seen.add(unique);
    return {playerKey,playerId:row.playerId,name:row.name.trim(),
      alliance:row.alliance.trim(),arenaRank:row.arenaRank,
      ...(typeof row.allianceKey==="string"&&/^[a-z][a-z0-9-]{1,63}$/.test(row.allianceKey)?
        {allianceKey:row.allianceKey}:{}),
      ...(typeof row.observedAt==="string"&&Number.isFinite(Date.parse(row.observedAt))?
        {observedAt:row.observedAt}:{})};
  }).sort((a,b)=>a.playerKey.localeCompare(b.playerKey));
  return {version:1,date:day,sourceDay:day,sourceCampaign:day+"-reward",
    campaignId:day+"-reward",attribution:source.attribution,sourceKind:"reward",
    alliancesExpected:source.alliancesExpected,
    alliancesComplete:source.alliancesComplete,provenance,
    recordedAt:new Date().toISOString(),players};
}
export function validateArenaExport(data,day){
  const fresh=validateArenaCampaign(data,day),entries=data.history;
  if(!Array.isArray(entries)||!entries.length)
    throw Error("Cloudflare Arena history export is missing");
  const snapshots=new Map();
  for(const source of entries){
    if(!validDay(source?.date)||source.date>day||!Array.isArray(source.players)||
       source.players.length<1||source.players.length>500)
      throw Error("Cloudflare Arena history contains an invalid snapshot");
    if(source.date===day){snapshots.set(day,fresh);continue;}
    const seen=new Set(),players=[];
    for(const row of source.players){
      const playerId=row?.playerId;
      if(typeof playerId!=="string"||!/^p_[a-f0-9]{64}$/.test(playerId)||
         typeof row.name!=="string"||!row.name.trim()||row.name.length>140||
         typeof row.alliance!=="string"||!row.alliance.trim()||
         !Number.isSafeInteger(row.arenaRank)||row.arenaRank<1)
        throw Error("Cloudflare Arena history contains an invalid player row");
      const unique=playerId+"\u0000"+row.alliance;
      if(seen.has(unique))continue;
      seen.add(unique);
      players.push({playerKey:playerId,playerId,name:row.name.trim(),
        alliance:row.alliance.trim(),arenaRank:row.arenaRank,
        ...(typeof row.allianceKey==="string"&&/^[a-z][a-z0-9-]{1,63}$/.test(row.allianceKey)?
          {allianceKey:row.allianceKey}:{}),
        ...(typeof row.observedAt==="string"&&Number.isFinite(Date.parse(row.observedAt))?
          {observedAt:row.observedAt}:{})});
    }
    const provenance=Array.isArray(source.provenance)?source.provenance
      .filter(x=>typeof x?.alliance==="string"&&x.alliance.length<=140&&
        Number.isFinite(Date.parse(x.capturedAt)))
      .map(x=>({alliance:x.alliance,capturedAt:x.capturedAt})):[];
    snapshots.set(source.date,{version:1,date:source.date,
      sourceDay:validDay(source.sourceDay)?source.sourceDay:source.date,
      ...(typeof source.sourceCampaign==="string"&&source.sourceCampaign.length<=80?
        {sourceCampaign:source.sourceCampaign}:{}),
      ...(typeof source.campaignId==="string"&&source.campaignId.length<=80?
        {campaignId:source.campaignId}:{}),
      attribution:typeof source.attribution==="string"&&
        /^[a-z0-9-]{1,100}$/.test(source.attribution)?
        source.attribution:"legacy-r2-arena-history",
      sourceKind:typeof source.sourceKind==="string"&&
        /^[a-z0-9-]{1,40}$/.test(source.sourceKind)?source.sourceKind:"legacy-r2",
      ...(typeof source.capturedAt==="string"&&Number.isFinite(Date.parse(source.capturedAt))?
        {capturedAt:source.capturedAt}:{}),
      ...(provenance.length?{provenance}:{}),players});
  }
  if(!snapshots.has(day))snapshots.set(day,fresh);
  return [...snapshots.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
async function main(){
  const day=args(process.argv.slice(2));
  const url="https://losp-roster-service.deliriousfan7.workers.dev/api/public/arena-snapshot?date="+day;
  let response;
  for(let attempt=0;attempt<5;attempt++){
    try{
      response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});
      if(response.ok)break;
      const body=await response.text();
      if(response.status===409)throw Error("Campaign incomplete: "+body.slice(0,160));
      throw Error("Cloudflare Arena API HTTP "+response.status);
    }catch(error){
      if(attempt===4)throw error;
      await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
    }
  }
  const snapshots=validateArenaExport(await response.json(),day);
  const outdir=".tmp/arena-snapshots";
  await fs.mkdir(outdir,{recursive:true});
  for(const snapshot of snapshots){
    const file=path.join(outdir,snapshot.date+".json");
    await fs.writeFile(file,JSON.stringify(snapshot,null,2)+"\n");
  }
  console.log("[arena] Validated "+snapshots.length+
    " permanent Arena dates through "+day);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error("[arena] "+error.message);process.exitCode=1;});
