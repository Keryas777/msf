#!/usr/bin/env node
// Synchronise uniquement les pseudos des invités approuvés dans joueurs.json.
// Ne contacte jamais Scopely. Les fiches Infos et les rosters restent privés.
import fs from "node:fs/promises";
import {createPrivateR2Reader} from "./lib/private-r2-read.mjs";
import {GUEST_APPROVAL_KEY,approvedGuestSources,newestGuestMembers,
        mergeGuestPlayers} from "./lib/guest-player-directory.mjs";

const argv=process.argv.slice(2);
if(argv.some(arg=>arg!=="--write"))throw Error("Only --write is supported");
const write=argv.includes("--write");
const file="docs/data/joueurs.json";
const stateFile=".github/guest-joueurs-publication-state.json";
const json=async file=>JSON.parse(await fs.readFile(file,"utf8"));
const reader=createPrivateR2Reader();
const approval=await reader.getJSON(GUEST_APPROVAL_KEY,200000);
if(!approval)throw Error("Guest approval registry unavailable: directory unchanged");
const registry=await json("docs/data/alliances.json");
const {approved}=approvedGuestSources(registry,approval);
const prior=await json(file);
let state={version:1,alliances:{}};
try{state=await json(stateFile);}
catch(error){if(error.code!=="ENOENT")throw error;}
const received=new Map();
for(const [key,fp] of approved){
  try{
    const latest=await newestGuestMembers(reader,fp,key);
    if(latest){
      received.set(key,latest);
      console.log(key+": "+latest.players.length+" validated members");
    }else console.warn(key+": no current complete Info campaign; retain recent directory");
  }catch(error){
    // An unavailable alliance must not delete other alliances' valid members.
    console.warn(key+": Info campaign invalid/unavailable ("+error.message+"); retaining recent directory");
  }
}
const result=mergeGuestPlayers(prior,registry,approval,received,state);
const output=JSON.stringify(result.players,null,2)+"\n";
const stateOutput=JSON.stringify(result.state,null,2)+"\n";
console.log("Player directory: "+prior.length+" -> "+result.players.length+
  " ("+received.size+" guest alliances refreshed)");
if(!write){
  console.log("Dry run; no files changed");
}else{
  await fs.writeFile(file,output,"utf8");
  await fs.mkdir(".github",{recursive:true});
  await fs.writeFile(stateFile,stateOutput,"utf8");
}
