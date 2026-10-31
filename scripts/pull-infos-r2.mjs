#!/usr/bin/env node
// Import completed private AM/PM member-card campaigns into existing infos_*.json.
// Runs ONLY in GitHub Actions with R2 read credentials. Never calls Scopely.
import fs from "node:fs/promises";
import {createPrivateR2Reader} from "./lib/private-r2-read.mjs";
import {readMapping} from "./lib/alliance-r2-history.mjs";
import {infoCampaign,validateInfoSnapshot,assertNoAmbiguousPlayers,
  INFO_IMPORT_STATE_PATH} from "./lib/infos-r2-import.mjs";

async function json(path){return JSON.parse(await fs.readFile(path,"utf8"));}
const day=process.env.INPUT_DAY||new Date().toISOString().slice(0,10);
const period=process.env.INPUT_PERIOD&&process.env.INPUT_PERIOD!=="auto"
  ?process.env.INPUT_PERIOD
  :(new Date().getUTCHours()<12?"am":"pm");
const campaign=infoCampaign(day,period);
const write=process.argv.includes("--write");
if(process.argv.some(a=>a!=="--write"))
  throw Error("Only --write is supported");
const registry=(await json("docs/data/alliances.json"))
  .filter(a=>a&&a.active!==false);
const mapping=readMapping(process.env.LOSP_R2_ALLIANCE_MAP_JSON||"",registry);
let state={version:1,alliances:{}};
try{state=await json(INFO_IMPORT_STATE_PATH);}
catch(e){if(e.code!=="ENOENT")throw e;}
if(state.version!==1||!state.alliances||Array.isArray(state.alliances)||
   typeof state.alliances!=="object")
  throw Error("Invalid infos import checkpoint");
const r2=createPrivateR2Reader();
const updates=new Map(),all=new Map();
for(const alliance of registry){
  const path="docs/data/infos_"+alliance.key+".json";
  const previous=await json(path);
  if(!Array.isArray(previous))throw Error("Invalid previous Infos "+path);
  const latest=state.alliances[alliance.key]||"";
  if(latest&&latest>=campaign){
    all.set(alliance.key,previous);
    console.log(alliance.key+": already imported "+latest);
    continue;
  }
  const key="roster-batches/v1/"+mapping[alliance.key]+
    "/campaigns/"+campaign+"-infos.json";
  const snapshot=await r2.getJSON(key,200000);
  if(!snapshot){
    all.set(alliance.key,previous);
    console.log(alliance.key+": no complete member-info snapshot; keeping previous");
    continue;
  }
  const rows=validateInfoSnapshot(snapshot,mapping[alliance.key],
    campaign,alliance.name);
  updates.set(alliance.key,rows);all.set(alliance.key,rows);
  console.log(alliance.key+": "+rows.length+" verified members");
}
// A failed or delayed alliance must never create an ambiguous cross-alliance
// selector from the mixed old/new data. Refuse the entire update instead.
assertNoAmbiguousPlayers(all);
if(!updates.size){
  console.log("No new verified member-info snapshots");
  process.exit(0);
}
if(!write){
  console.log("Dry run: "+updates.size+" alliances validated; no write");
  process.exit(0);
}
for(const [key,rows] of updates){
  await fs.writeFile("docs/data/infos_"+key+".json",
    JSON.stringify(rows,null,2)+"\n","utf8");
  state.alliances[key]=campaign;
}
await fs.mkdir(".github",{recursive:true});
await fs.writeFile(INFO_IMPORT_STATE_PATH,JSON.stringify(state,null,2)+"\n");
console.log("Published infos snapshots: "+updates.size+" / "+registry.length+
  " (merged infos + joueurs by existing merge-infos.mjs)");
