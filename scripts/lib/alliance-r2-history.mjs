// Pure, testable selection of existing PRIVATE R2 AllianceCard source records.
// The browser never loads R2 and no source identity is published.
import {createHash} from 'node:crypto';

const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
const HEX=/^[a-f0-9]{64}$/;
const MS_DAY=86400000;
const validDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const validInteger=x=>Number.isSafeInteger(x)&&x>=0;

// Anchor delayed GitHub Actions to the actual scheduled Thursday/Saturday,
// never to the runner's execution date (which might be Sunday).
const STANDINGS_SCHEDULES=Object.freeze({
  '40 6 * * 4,6':{hour:6,minute:40},
  '47 7 * * 4,6':{hour:7,minute:47},
  '17 9 * * 4,6':{hour:9,minute:17}
});
export function resolveStandingsSchedule(cron,now=new Date()){
  const slot=Object.hasOwn(STANDINGS_SCHEDULES,cron)?
    STANDINGS_SCHEDULES[cron]:null;
  if(!slot||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error('Invalid or unknown standings scheduled event');
  const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),
    now.getUTCDate(),slot.hour,slot.minute));
  for(let i=0;i<8;i++){
    if((date.getUTCDay()===4||date.getUTCDay()===6)&&date<=now)break;
    date.setUTCDate(date.getUTCDate()-1);
  }
  if(now.getTime()-date.getTime()>36*3600000)
    throw Error('Standings scheduled event too stale for reliable backfill');
  return date.toISOString().slice(0,10);
}

export function collectionWindow(day,config){
  if(!ISO_DAY.test(day)||new Date(day+'T00:00:00.000Z').toISOString().slice(0,10)!==day)
    throw Error('Invalid UTC collection day');
  const date=Date.parse(day+'T00:00:00.000Z');
  const weekday=new Date(date).getUTCDay();
  if(weekday!==4&&weekday!==6)throw Error('Collection day must be Thursday or Saturday UTC');
  const trophy=config?.capture?.trophies;
  const sampling=trophy?.sourceSampling;
  if(!sampling||sampling.dayOffsetFromWar!==1||
    !/^\d\d:\d\d$/.test(sampling.startAtUtc)||
    !/^\d\d:\d\d$/.test(sampling.endExclusiveAtUtc))
    throw Error('Missing source sampling configuration');
  const minute=value=>{
    const [h,m]=value.split(':').map(Number);
    if(h>23||m>59)throw Error('Invalid UTC clock time');
    return h*60+m;
  };
  const from=minute(sampling.startAtUtc),to=minute(sampling.endExclusiveAtUtc);
  if(from>=to)throw Error('Empty R2 source window');
  const warWindow=trophy.window;
  const warEnd=minute(warWindow.warEndsAtUtc)+warWindow.marginAfterWarEndMinutes;
  const preparation=minute(warWindow.nextPreparationStartsAtUtc)+
    warWindow.preparationDayOffset*1440-warWindow.marginBeforePreparationMinutes;
  if(1440+from<warEnd||1440+to>preparation)
    throw Error('Sampling outside the configured post-war trophy window');
  const warDay=new Date(date-MS_DAY).toISOString().slice(0,10);
  return {day,warDay,start:new Date(date+from*60000).toISOString(),
    endExclusive:new Date(date+to*60000).toISOString()};
}
export function readMapping(json,registry){
  let map;
  try{map=JSON.parse(json);}catch{throw Error('Invalid private alliance mapping JSON');}
  if(!map||Array.isArray(map)||typeof map!=='object')
    throw Error('Invalid private alliance mapping');
  const active=registry.filter(a=>a&&a.active!==false).map(a=>a.key);
  if(!active.length||new Set(active).size!==active.length)throw Error('Invalid alliance registry');
  for(const key of active){
    if(typeof key!=='string'||!HEX.test(map[key]||''))
      throw Error('Incomplete private alliance fingerprint mapping for '+key);
  }
  if(new Set(active.map(key=>map[key])).size!==active.length)
    throw Error('Duplicate private alliance fingerprints');
  return Object.fromEntries(active.map(key=>[key,map[key]]));
}
export function extractAllianceSource(record,expectedFingerprint,window){
  if(record?.version!==1||record?.kind!=='private-provider-source'||
    record?.endpoint!=='/player/v1/alliance/card'||record?.httpStatus!==200||
    record?.allianceFingerprint!==expectedFingerprint||
    !validDate(record?.capturedAt))throw Error('Invalid private R2 source record');
  const when=Date.parse(record.capturedAt);
  if(when<Date.parse(window.start)||when>=Date.parse(window.endExclusive))
    throw Error('Source record outside UTC sampling window');
  const data=record.providerResponse?.data;
  if(!data||typeof data!=='object'||Array.isArray(data)||
    typeof data.id!=='string'||typeof data.name!=='string'||!data.name.trim()||
    data.name.length>140)throw Error('Invalid official AllianceCard payload');
  const id=/^([^:\s]{1,128}):([^:\s]{1,128})$/.exec(data.id);
  if(!id||createHash('sha256').update(id[1]).digest('hex')!==expectedFingerprint)
    throw Error('Alliance identity did not match the private registry');
  for(const field of ['warTrophies','warRank','raidRank'])
    if(!validInteger(data[field]))throw Error('Missing or invalid '+field);
  const league=data.warLeague;
  return {capturedAt:record.capturedAt,nameAtCapture:data.name,
    warTrophies:data.warTrophies,warRank:data.warRank,raidRank:data.raidRank,
    warLeague:{
      id:typeof league?.id==='string'?league.id:null,
      name:typeof league?.name==='string'?league.name:null
    }};
}
export function createR2Snapshot({window,registry,map,sources}){
  // sources: Map keyed by stable registry key; contains privately validated
  // candidate source records and their actual timestamps.
  const alliances=[];
  for(const alliance of registry.filter(a=>a.active!==false)){
    const candidates=sources.get(alliance.key)||[];
    const valid=[];
    for(const candidate of candidates){
      try{valid.push(extractAllianceSource(candidate,map[alliance.key],window));}
      catch{/* Ignore stale/bad records, but never invent missing measurements. */}
    }
    valid.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
    const last=valid.at(-1);
    if(!last)throw Error('No validated AllianceCard within window for '+alliance.key);
    alliances.push({key:alliance.key,nameAtCapture:last.nameAtCapture,
      capturedAt:last.capturedAt,warTrophies:last.warTrophies,
      warRank:last.warRank,raidRank:last.raidRank,warLeague:last.warLeague});
  }
  const latest=alliances.reduce((m,x)=>x.capturedAt>m?x.capturedAt:m,window.start);
  return {
    version:1,kind:'losp-alliance-standings-snapshot',capturedAt:latest,
    source:'/player/v1/alliance/card',
    seasonId:null,seasonVerified:false,
    coverage:{scannedSessions:null,validSessions:null,unavailableSessions:null,
      truncated:false,connectedAlliances:alliances.length,
      completeSessionScan:false,source:'existing-private-roster-r2',
      allActiveAlliancesSampled:true},
    collection:{method:'r2-pull',sourceDayUtc:window.day,warDayUtc:window.warDay,
      selectionStartAt:window.start,selectionEndExclusiveAt:window.endExclusive},
    alliances,
    note:'Fiches d’alliance déjà collectées par le Roster Service durant les micro-lots de rosters. Horodatages propres à chaque alliance ; aucune lecture Scopely supplémentaire. Saison déduite séparément par la WebApp et non vérifiée par l’API.'
  };
}
export function addSnapshotToIndex(index,snapshot){
  if(index?.kind!=='losp-alliance-standings-index'||!Array.isArray(index.snapshots))
    throw Error('Invalid public standings index');
  if(index.snapshots.some(x=>x.collectionDayUtc===snapshot.collection.sourceDayUtc ||
    x.capturedAt===snapshot.capturedAt))
    return {updated:false,index};
  const file='snapshots/'+snapshot.capturedAt.replace(/[-:.]/g,'').replace(
    /^(\d{8})T(\d{9})Z$/,(full,d,t)=>d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T'+t+'Z')+'.json';
  if(!/^snapshots\/\d{4}-\d\d-\d\dT\d{9}Z\.json$/.test(file))
    throw Error('Invalid snapshot filename');
  const snapshots=[...index.snapshots,{
    capturedAt:snapshot.capturedAt,file,allianceCount:snapshot.alliances.length,
    completeSessionScan:false,seasonVerified:false,seasonId:null,
    collectionDayUtc:snapshot.collection.sourceDayUtc
  }].sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
  return {updated:true,index:{...index,snapshots},file};
}
