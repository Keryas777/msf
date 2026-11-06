// Publication minimale des pseudos d'alliances invitées à partir des reçus Infos R2.
// Aucun accès Scopely, aucun identifiant fournisseur ou champ de roster publié.
import {infoCampaign,validateInfoSnapshot} from "./infos-r2-import.mjs";

export const GUEST_APPROVAL_KEY="roster-sync/v1/approved-guest-alliances.json";
const FP=/^[a-f0-9]{64}$/;
const KEY=/^[a-z][a-z0-9-]{1,63}$/;
const DAY=86400000;
const MAX_STALE=30*DAY;

const identity=(row)=>String(row.player).trim().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

export function approvedGuestSources(registry,approval){
  if(!Array.isArray(registry)||!approval||approval.version!==1||
     !Array.isArray(approval.alliances))
    throw Error("Invalid guest approval registry");
  const guests=new Map();
  for(const entry of registry){
    if(entry?.active===false||entry?.group==="losp")continue;
    if(!KEY.test(entry?.key||"")||guests.has(entry.key))
      throw Error("Invalid guest alliance in registry");
    guests.set(entry.key,entry);
  }
  const approved=new Map(),fingerprints=new Set();
  for(const entry of approval.alliances){
    if(!entry||!FP.test(entry.fingerprint)||fingerprints.has(entry.fingerprint)||
       (entry.allianceKey!==undefined&&!KEY.test(entry.allianceKey)))
      throw Error("Invalid approved guest mapping");
    fingerprints.add(entry.fingerprint);
    if(!entry.allianceKey)continue; // approved but not yet bound to the WebApp
    if(approved.has(entry.allianceKey))throw Error("Duplicate guest binding");
    if(guests.has(entry.allianceKey))
      approved.set(entry.allianceKey,entry.fingerprint);
  }
  return {guests,approved};
}

export async function newestGuestMembers(reader,fp,key,now=Date.now()){
  if(!FP.test(fp)||!KEY.test(key)||!Number.isFinite(now))
    throw Error("Invalid guest campaign identity");
  const today=Date.parse(new Date(now).toISOString().slice(0,10)+"T00:00:00Z");
  for(let offset=0;offset<=7;offset++){
    const day=new Date(today-offset*DAY).toISOString().slice(0,10);
    for(const period of ["pm","am"]){
      const campaign=infoCampaign(day,period);
      const path="roster-batches/v1/"+fp+"/campaigns/"+campaign+"-infos.json";
      const snapshot=await reader.getJSON(path,200000);
      if(!snapshot)continue;
      // Do not bypass a newer invalid receipt by falling back to an older one.
      const rows=validateInfoSnapshot(snapshot,fp,campaign,key,now);
      return {capturedAt:snapshot.capturedAt,players:rows.map(r=>({
        player:r.name,alliance:key
      }))};
    }
  }
  return null;
}

export function mergeGuestPlayers(current,registry,approval,received,
                                  previousState,now=Date.now()){
  const {guests,approved}=approvedGuestSources(registry,approval);
  if(!Array.isArray(current)||!(received instanceof Map)||
     !Number.isFinite(now)||!previousState||
     previousState.version!==1||!previousState.alliances||
     Array.isArray(previousState.alliances))
    throw Error("Invalid player directory publication state");
  const oldState=previousState.alliances;
  const previouslyGuest=new Set([...guests.keys(),...Object.keys(oldState)]);
  const publicRows=[],oldGuest=new Map();
  for(const row of current){
    if(!row||typeof row.player!=="string"||!row.player.trim()||
       typeof row.alliance!=="string"||!row.alliance.trim()||!identity(row))
      throw Error("Invalid existing player directory");
    if(previouslyGuest.has(row.alliance)){
      if(!oldGuest.has(row.alliance))oldGuest.set(row.alliance,[]);
      oldGuest.get(row.alliance).push({player:row.player,alliance:row.alliance});
    }else publicRows.push(row); // LoSP retains its established display names.
  }
  const newState={version:1,alliances:{}};
  for(const [key] of guests){
    if(!approved.has(key))continue; // revoked/unbound guests disappear.
    const fresh=received.get(key);
    let players;
    if(fresh){
      const captured=Date.parse(fresh.capturedAt||"");
      if(!Number.isFinite(captured)||captured>now||
         now-captured>7*DAY||!Array.isArray(fresh.players))
        throw Error("Invalid guest directory receipt for "+key);
      players=fresh.players;
      newState.alliances[key]={capturedAt:fresh.capturedAt};
    }else{
      const captured=Date.parse(oldState[key]?.capturedAt||"");
      // Retain short-lived data through a temporary collection outage.
      if(!Number.isFinite(captured)||captured>now||
         now-captured>MAX_STALE)continue;
      players=oldGuest.get(key)||[];
      newState.alliances[key]={capturedAt:oldState[key].capturedAt};
    }
    const seen=new Set();
    for(const row of players){
      if(typeof row?.player!=="string"||!row.player.trim()||
         row.alliance!==key||!identity(row)||seen.has(identity(row)))
        throw Error("Invalid/duplicate guest player in "+key);
      seen.add(identity(row));
      publicRows.push({player:row.player,alliance:key});
    }
  }
  // Existing LoSP shapes are not re-encoded or stripped of information.
  return {players:publicRows,state:newState};
}
