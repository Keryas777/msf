// Pure validation and calendar selection for PRIVATE completed-season rank captures.
// No Scopely requests, hardcoded alliance names, or permanent private identifiers.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const FINGERPRINT=/^[a-f0-9]{64}$/;
const DAY_MS=86400000;
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const validRank=value=>Number.isSafeInteger(value)&&value>=0;

export function mondaySeason(day,config){
  if(!DAY.test(day)||!validTime(day+'T00:00:00.000Z')||
      new Date(day+'T00:00:00.000Z').toISOString().slice(0,10)!==day)
    throw Error('Invalid season collection UTC day');
  const anchor=Date.parse(config?.rankingSeasons?.referenceEndExclusiveAt);
  const cycle=config?.rankingSeasons?.cycleDays;
  const delay=config?.rankingSeasons?.publicationDelayMinutes;
  if(!Number.isFinite(anchor)||!Number.isSafeInteger(cycle)||cycle<7||
     !Number.isSafeInteger(delay)||delay<0||delay>2880)
    throw Error('Invalid ranking season calendar');
  const date=Date.parse(day+'T00:00:00.000Z');
  if(new Date(date).getUTCDay()!==1)return null;
  const endReferenceDay=Date.UTC(new Date(anchor).getUTCFullYear(),
    new Date(anchor).getUTCMonth(),new Date(anchor).getUTCDate()+1);
  const diff=(date-endReferenceDay)/DAY_MS;
  if(diff<0||!Number.isInteger(diff)||diff%cycle!==0)return null;
  const endAt=new Date(anchor+diff*DAY_MS).toISOString();
  const startAt=new Date(Date.parse(endAt)-cycle*DAY_MS).toISOString();
  return {day,seasonId:startAt.slice(0,10)+'/'+endAt.slice(0,10),
    startAt,endAt,availableAfter:new Date(Date.parse(endAt)+delay*60000).toISOString()};
}

// Cron runs every Monday because standard GitHub Actions cron cannot express
// the 14-day cycle. Derive the correct Monday from the calendar, even if the
// runner launches hours later (or early Tuesday).
export function scheduledMonday(cron,now=new Date()){
  const hours={'40 4 * * 1':[4,40],'17 6 * * 1':[6,17]};
  const slot=hours[cron];
  if(!slot||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error('Unknown scheduled season ranks run');
  let date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),
    now.getUTCDate(),slot[0],slot[1]));
  while(date.getUTCDay()!==1||date>now)date=new Date(date.getTime()-DAY_MS);
  if(now-date>30*3600000)throw Error('Season-ranks cron too delayed');
  return date.toISOString().slice(0,10);
}

export function alreadyImported(index,seasonId){
  return Array.isArray(index?.snapshots)&&index.snapshots.some(s=>
    s.captureType==='season-ranks'&&s.rankingSeasonId===seasonId);
}

export function publicSeasonSnapshot(privateCapture,registry,mapping,season){
  if(privateCapture?.version!==1||
     privateCapture.source!=='/player/v1/alliance/card'||
     !validTime(privateCapture.capturedAt)||
     Date.parse(privateCapture.capturedAt)<Date.parse(season.availableAfter)||
     privateCapture.capturedAt.slice(0,10)!==season.day||
     privateCapture.truncated!==false||
     privateCapture.completeSessionScan!==true||
     privateCapture.unavailableSessions!==0||
     !Array.isArray(privateCapture.alliances)||
     !Number.isSafeInteger(privateCapture.scannedSessions)||
     !Number.isSafeInteger(privateCapture.validSessions)||
     privateCapture.validSessions>privateCapture.scannedSessions)
    throw Error('Incomplete or mistimed private rank capture');
  const active=registry.filter(a=>a&&a.active!==false);
  if(!active.length||privateCapture.alliances.length!==active.length||
    privateCapture.connectedAlliances!==active.length)
    throw Error('Rank capture does not cover all active LoSP alliances');
  const byFingerprint=new Map();
  for(const row of privateCapture.alliances){
    if(!FINGERPRINT.test(row?.allianceFingerprint||'')||
       byFingerprint.has(row.allianceFingerprint)||
       typeof row.name!=='string'||!row.name.trim()||row.name.length>140||
       !validRank(row.warRank)||!validRank(row.raidRank))
      throw Error('Invalid rank values or duplicate/private identity');
    byFingerprint.set(row.allianceFingerprint,row);
  }
  const alliances=active.map(a=>{
    const row=byFingerprint.get(mapping[a.key]);
    if(!row)throw Error('Rank capture missing approved alliance '+a.key);
    return {key:a.key,nameAtCapture:row.name,
      warRank:row.warRank,raidRank:row.raidRank,
      // Rank-only data must never create a trophy point.
      warTrophies:null};
  });
  return {
    version:1,kind:'losp-alliance-standings-snapshot',
    capturedAt:privateCapture.capturedAt,
    source:'/player/v1/alliance/card',
    seasonId:null,seasonVerified:false,captureType:'season-ranks',
    coverage:{scannedSessions:privateCapture.scannedSessions,
      validSessions:privateCapture.validSessions,unavailableSessions:0,
      truncated:false,connectedAlliances:alliances.length,completeSessionScan:true},
    collection:{method:'private-r2-season-ranks',purpose:'season-ranks',
      sourceDayUtc:season.day},
    alliances,
    note:'Rangs officiels observes apres la fin de saison, attribues par calendrier LoSP. Scopely ne fournit pas l’identifiant de saison. Aucun nouveau point de trophees de guerre.'
  };
}

export function addSeasonToIndex(index,snapshot,season){
  if(index?.kind!=='losp-alliance-standings-index'||!Array.isArray(index.snapshots))
    throw Error('Invalid standings index');
  if(alreadyImported(index,season.seasonId))return {updated:false,index};
  if(index.snapshots.some(row=>row.capturedAt===snapshot.capturedAt))
    throw Error('Duplicate timestamp with another capture');
  const file='snapshots/'+snapshot.capturedAt.replace(/[-:.]/g,'')
    .replace(/^(\d{8})T(\d{9})Z$/,(all,d,t)=>
      d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T'+t+'Z')+'.json';
  if(!/^snapshots\/\d{4}-\d\d-\d\dT\d{9}Z\.json$/.test(file))
    throw Error('Invalid season-ranks filename');
  const row={capturedAt:snapshot.capturedAt,file,
    allianceCount:snapshot.alliances.length,
    completeSessionScan:true,seasonVerified:false,seasonId:null,
    captureType:'season-ranks',rankingSeasonId:season.seasonId};
  const snapshots=[...index.snapshots,row].sort((a,b)=>
    a.capturedAt.localeCompare(b.capturedAt));
  return {updated:true,file,index:{...index,snapshots}};
}
