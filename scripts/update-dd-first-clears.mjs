// Persist verified first reward-threshold transitions from approved published rosters.
// A player already completed at their first observation has an unknown clear date.
import fs from "node:fs/promises";
import path from "node:path";
const dir=process.env.DATA_DIR||"docs/data";
const read=async file=>JSON.parse(await fs.readFile(path.join(dir,file),"utf8"));
const config=await read("dark-dimensions.json"),rosters=await read("rosters.json"),meta=await read("rosters-meta.json");
const dest=path.join(dir,"dd-first-clears.json");
const at=meta.updatedAt;
if(typeof at!=="string"||!Number.isFinite(Date.parse(at)))throw Error("Missing roster publication timestamp");
const norm=s=>String(s??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
let archive={version:1,observations:{}};
try{archive=JSON.parse(await fs.readFile(dest,"utf8"))}catch(e){if(e.code!=="ENOENT")throw e}
if(archive.version!==1||!archive.observations||typeof archive.observations!=="object")throw Error("Invalid DD observation archive");
let changed=false;
for(const dd of config.dimensions||[]){
 const rule=dd.completionRule;
 const tier=rule?.tiers?.find(t=>t.passages===1);
 if(!tier||!rule.characterId||!dd.key)continue;
 const group=archive.observations[dd.key]??(archive.observations[dd.key]={});
 for(const roster of Array.isArray(rosters)?rosters:[]){
  const alliance=norm(roster.alliance),player=norm(roster.playerKey||roster.player);
  if(!alliance||!player||!roster.chars||typeof roster.chars!=="object")continue;
  const progress=Object.entries(roster.chars).find(([key])=>norm(key)===norm(rule.characterId))?.[1];
  const key=alliance+":"+player;
  const old=group[key];
  // The published complete roster lacks the reward character before unlock.
  const complete=Number(progress?.yellowStars)>=tier.minYellowStars&&Number(progress?.redStars)>=tier.minRedStars;
  if(!old){group[key]=complete?{firstClearObservedAt:null,baseline:true}:{firstClearObservedAt:null,baseline:false,lastIncompleteObservedAt:at};changed=true;continue}
  if(!complete&&old.firstClearObservedAt===null&&!old.baseline){old.lastIncompleteObservedAt=at;changed=true}
  if(complete&&old.firstClearObservedAt===null&&!old.baseline&&old.lastIncompleteObservedAt&&Date.parse(at)>Date.parse(old.lastIncompleteObservedAt)){old.firstClearObservedAt=at;changed=true}
 }
}
if(changed)await fs.writeFile(dest,JSON.stringify(archive,null,2)+"\n");
console.log(changed?"DD observations updated":"DD observations unchanged");
