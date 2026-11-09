#!/usr/bin/env node
// Read-only diagnostic. No raw R2 identities, player data or ranks in logs.
import fs from "node:fs/promises";
import {createPrivateR2Reader} from "./lib/private-r2-read.mjs";
import {approvedGuestSources} from "./lib/guest-player-directory.mjs";
import {GUEST_APPROVAL_SOURCE,GUEST_SEASON_SOURCE,seasonForObservation}
  from "./lib/guest-season-history.mjs";

export const TARGET_KEY="endgame-revolution-red";
export const TARGET_SEASON="2026-10-25/2026-11-08";
const validDate=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const validRank=x=>Number.isSafeInteger(x)&&x>=0;

export function diagnoseGuestSeason({registry,approval,source,history,calendar,now=Date.now()}){
  const result={target:TARGET_KEY,season:TARGET_SEASON,
    archived:false,authorization:"unverified",source:"unavailable",
    matchedRecords:0,eligibleRecords:0,reasons:[]};
  result.archived=Array.isArray(history?.results)&&history.results.some(
    r=>r.allianceKey===TARGET_KEY&&r.seasonId===TARGET_SEASON);
  if(!approval){result.reasons.push("approval-registry-unavailable");return result;}
  let fp;
  try{fp=approvedGuestSources(registry,approval).approved.get(TARGET_KEY);}
  catch{result.reasons.push("approval-registry-invalid");return result;}
  result.authorization=fp?"approved":"not-approved-or-unbound";
  if(!fp){result.reasons.push("no-authorized-binding");return result;}
  if(!source){result.reasons.push("rolling-source-unavailable");return result;}
  if(source.version!==1||source.kind!=="guest-season-ranks-rolling"||
     !Array.isArray(source.snapshots)){
    result.reasons.push("rolling-source-invalid");return result;
  }
  result.source="available";
  const reasons=new Set();
  for(const snap of source.snapshots){
    if(!Array.isArray(snap?.alliances)){reasons.add("invalid-snapshot");continue;}
    for(const item of snap.alliances){
      if(item?.fingerprint!==fp)continue;
      result.matchedRecords++;
      if(!validDate(item.capturedAt)||!validRank(item.warRank)||
         !validRank(item.raidRank)){
        reasons.add("incomplete-or-invalid-ranks");continue;
      }
      const timestamp=Date.parse(item.capturedAt);
      if(timestamp>now+60000||timestamp<now-30*86400000){
        reasons.add("capture-outside-30-day-window");continue;
      }
      if(item.capturedAt.slice(0,10)!==snap.collectionDayUtc){
        reasons.add("capture-day-mismatch");continue;
      }
      const season=seasonForObservation(item.capturedAt,calendar);
      if(!season){reasons.add("ambiguous-season-window");continue;}
      if(season.seasonId!==TARGET_SEASON){
        reasons.add("capture-belongs-to-other-season");continue;
      }
      if(item.manualSeasonId!==undefined&&
         (item.seasonConfirmation!=="admin-in-game"||
          item.manualSeasonId!==season.seasonId)){
        reasons.add("manual-season-confirmation-mismatch");continue;
      }
      result.eligibleRecords++;
    }
  }
  if(!result.matchedRecords)reasons.add("no-capture-for-authorized-alliance");
  if(result.matchedRecords&&!result.eligibleRecords&&!reasons.size)
    reasons.add("no-eligible-capture");
  result.reasons=[...reasons].sort();
  return result;
}

async function main(){
  if(process.argv.length!==2)throw Error("Usage: no arguments");
  const json=async p=>JSON.parse(await fs.readFile(p,"utf8"));
  const [registry,config,history]=await Promise.all([
    json("docs/data/alliances.json"),
    json("docs/data/alliance-standings/config.json"),
    json("docs/data/alliance-standings/guest-season-history.json")]);
  const reader=createPrivateR2Reader();
  const [approval,source]=await Promise.all([
    reader.getJSON(GUEST_APPROVAL_SOURCE,200000),
    reader.getJSON(GUEST_SEASON_SOURCE,250000)]);
  const result=diagnoseGuestSeason({registry,approval,source,history,
    calendar:config.rankingSeasons});
  console.log("Read-only guest season diagnostic:",JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)
  main().catch(error=>{
    console.error("Guest season diagnostic failed:",error.message);
    process.exitCode=1;
  });
