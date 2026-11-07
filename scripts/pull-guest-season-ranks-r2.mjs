#!/usr/bin/env node
// Publish only the season, tenant key and official rank values, never R2
// envelopes or fingerprints. GitHub Actions runs this; NO Scopely requests.
import fs from "node:fs/promises";
import {createPrivateR2Reader} from "./lib/private-r2-read.mjs";
import {GUEST_APPROVAL_SOURCE,GUEST_SEASON_SOURCE,GUEST_SEASON_HISTORY_FILE,
  mergeGuestSeasonHistory} from "./lib/guest-season-history.mjs";

async function main(){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=="--write"))throw Error("Usage: [--write]");
  const write=args.includes("--write");
  if(write&&process.env.LOSP_GUEST_SEASON_HISTORY_APPROVED!=="true")
    throw Error("Permanent guest ranking publication is not authorized");
  const json=async file=>JSON.parse(await fs.readFile(file,"utf8"));
  const [registry,config,old]=await Promise.all([
    json("docs/data/alliances.json"),json("docs/data/alliance-standings/config.json"),
    json(GUEST_SEASON_HISTORY_FILE)]);
  const reader=createPrivateR2Reader();
  const [approval,rolling]=await Promise.all([
    reader.getJSON(GUEST_APPROVAL_SOURCE,200000),
    reader.getJSON(GUEST_SEASON_SOURCE,250000)]);
  if(!approval)throw Error("Guest approval registry unavailable; archive untouched");
  if(!rolling){console.log("No recent guest season source; archive untouched");return;}
  const {history,added}=mergeGuestSeasonHistory(
    old,rolling,approval,registry,config.rankingSeasons);
  if(!added){console.log("Guest seasonal history is already up-to-date");return;}
  if(write){
    await fs.writeFile(GUEST_SEASON_HISTORY_FILE,
      JSON.stringify(history,null,2)+"\n");
    console.log("Archived",added,"new guest season results on GitHub");
  }else console.log("Dry run: would append",added,"guest season results");
}
main().catch(error=>{console.error("Guest season history:",error.message);
  process.exitCode=1;});
