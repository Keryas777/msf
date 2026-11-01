// Import contract for completed private R2 Info campaigns, WITHOUT Scopely GETs.
// All field names used by current static pages remain unchanged.
import {keyOf} from "./roster-r2-import.mjs";
const FP=/^[a-f0-9]{64}$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const optionalInts=["stp","charactersCollected","daysInAlliance",
  "charactersAtMaxStarRank","bestArena","latestArena","latestBlitz","blitzWins","wwPoints"];
const optionalKeys=new Set(["rank","rosterShare","level","profileStatus","aid",
  "qualifications",...optionalInts]);
export const INFO_IMPORT_STATE_PATH=".github/infos-r2-import-state.json";
export function infoCampaign(day,period){
  if(!DAY.test(day)||new Date(day+"T00:00:00Z").toISOString().slice(0,10)!==day||
     !["am","pm"].includes(period))throw Error("Invalid infos campaign");
  return day+"-"+period;
}
export function validateInfoSnapshot(snapshot,fp,campaign,alliance,now=Date.now()){
  if(!FP.test(fp)||!object(snapshot)||snapshot.version!==1||
     snapshot.kind!=="alliance-infos-campaign"||
     snapshot.allianceFingerprint!==fp||snapshot.campaign!==campaign||
     typeof snapshot.allianceName!=="string"||!snapshot.allianceName.trim()||
     !Array.isArray(snapshot.rows)||snapshot.rows.length<1||
     snapshot.rows.length>100)throw Error("Invalid infos campaign receipt");
  const day=campaign.slice(0,10),period=campaign.slice(11);
  const start=Date.parse(day+(period==="am"?"T02:00:00Z":"T14:00:00Z"));
  const end=start+2*3600000;
  const captured=Date.parse(snapshot.capturedAt||"");
  if(!Number.isFinite(captured)||captured<start||captured>=end||
     captured>now||!(Date.parse(snapshot.expiresAt||"")>now))
    throw Error("Expired or out-of-window infos receipt");
  const names=new Set();
  return snapshot.rows.map(row=>{
    if(!object(row)||typeof row.name!=="string"||!row.name.trim()||
       row.name.length>140||!keyOf(row.name)||names.has(keyOf(row.name))||
       row.alliance!==snapshot.allianceName||!integer(row.tcp)||
       !integer(row.war_mvp)||typeof row.icon!=="string"||
       typeof row.frame!=="string"||row.icon.length>1000||row.frame.length>1000)
      throw Error("Invalid or duplicate infos member");
    names.add(keyOf(row.name));
    if(Object.keys(row).some(k=>!new Set(["name","alliance","tcp","war_mvp",
      "icon","frame",...optionalKeys]).has(k)))
      throw Error("Unexpected infos property");
    for(const k of optionalInts)if(k in row&&!integer(row[k]))
      throw Error("Invalid infos numeric field "+k);
    if("rosterShare" in row&&typeof row.rosterShare!=="boolean")
      throw Error("Invalid rosterShare");
    if("rank" in row&&!["leader","captain","member"].includes(row.rank))
      throw Error("Invalid rank");
    if("profileStatus" in row&&row.profileStatus!=="unavailable")
      throw Error("Invalid profile status");
    if("aid" in row&&!(typeof row.aid==="string"&&row.aid.length<=256)&&!integer(row.aid))
      throw Error("Invalid aid");
    if("level" in row&&(!object(row.level)||JSON.stringify(row.level).length>1000))
      throw Error("Invalid level");
    if("qualifications" in row&&(!object(row.qualifications)||
      JSON.stringify(row.qualifications).length>4000))
      throw Error("Invalid qualifications");
    const result={name:row.name,alliance,tcp:row.tcp,
      war_mvp:row.war_mvp,icon:row.icon,frame:row.frame};
    for(const key of optionalKeys)if(Object.hasOwn(row,key))result[key]=row[key];
    return result;
  });
}
export function assertNoAmbiguousPlayers(byAlliance){
  // Avoid a transfer appearing in two alliances when one R2 snapshot is stale.
  const players=new Map();
  for(const [alliance,rows] of byAlliance){
    for(const row of rows){
      const key=keyOf(row.name),before=players.get(key);
      if(before&&before!==alliance)
        throw Error("Player listed in multiple alliances: "+key);
      players.set(key,alliance);
    }
  }
}
