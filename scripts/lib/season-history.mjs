// Permanent rank-only archive shared by every registered alliance.
// Pure projection: no Scopely calls, R2 access or private fingerprints.
const DAY=86400000;
const rank=value=>Number.isSafeInteger(value)&&value>=0;
const valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const identity=row=>row.seasonId+'\u0000'+row.allianceKey;
export const HISTORY_FILE='docs/data/alliance-standings/season-history.json';
export const HISTORY_KIND='losp-season-history';

export function validateHistory(history){
  if(history?.version!==1||history.kind!==HISTORY_KIND||
     !Array.isArray(history.results))throw Error('Invalid unified season history');
  const seen=new Set();
  for(const row of history.results){
    if(!/^\\d{4}-\\d\\d-\\d\\d\\/\\d{4}-\\d\\d-\\d\\d$/.test(row?.seasonId||'')||
       !/^[a-z][a-z0-9-]{1,63}$/.test(row?.allianceKey||'')||
       !valid(row.startAt)||!valid(row.endExclusiveAt)||!valid(row.capturedAt)||
       !rank(row.warRank)||!rank(row.raidRank)||
       row.seasonId!==row.startAt.slice(0,10)+'/'+row.endExclusiveAt.slice(0,10)||
       Date.parse(row.endExclusiveAt)-Date.parse(row.startAt)<7*DAY||
       Date.parse(row.endExclusiveAt)-Date.parse(row.startAt)>60*DAY||
       Date.parse(row.capturedAt)<Date.parse(row.endExclusiveAt)||
       seen.has(identity(row)))throw Error('Invalid or duplicate season rank');
    seen.add(identity(row));
  }
  return seen;
}

export function mergeSeasonHistory(history,observations){
  const seen=validateHistory(history);
  if(!Array.isArray(observations))throw Error('Invalid observations');
  const next=[];
  for(const row of observations){
    const id=identity(row);
    if(seen.has(id))continue;
    // Validate each new row using the same permanent archive contract.
    validateHistory({version:1,kind:HISTORY_KIND,results:[row]});
    seen.add(id);
    next.push({...row});
  }
  return {history:{...history,results:[...history.results,...next]
    .sort((a,b)=>a.seasonId.localeCompare(b.seasonId)||
      a.allianceKey.localeCompare(b.allianceKey))},added:next.length};
}

export function projectRankSnapshots(index,snapshots,calendar){
  if(!Array.isArray(index?.snapshots)||!Array.isArray(snapshots))
    throw Error('Invalid season snapshot index');
  const anchor=Date.parse(calendar?.referenceEndExclusiveAt);
  const cycle=calendar?.cycleDays,delay=calendar?.publicationDelayMinutes;
  if(!Number.isFinite(anchor)||!Number.isSafeInteger(cycle)||cycle<7||
     !Number.isSafeInteger(delay)||delay<0)throw Error('Invalid season calendar');
  const candidates=new Map();
  for(const snapshot of snapshots){
    if(!Array.isArray(snapshot?.alliances)||!valid(snapshot.capturedAt))continue;
    // Historical season-ranks are eligible only after a completed boundary.
    const observed=Date.parse(snapshot.capturedAt);
    const end=anchor+Math.floor((observed-anchor-delay*60000)/(cycle*DAY))*cycle*DAY;
    if(observed<end+delay*60000||observed>=end+cycle*DAY)continue;
    if(snapshot.captureType==='war-trophies')continue;
    if(snapshot.captureType!=='season-ranks'&&snapshot.seasonVerified!==true)continue;
    const seasonId=new Date(end-cycle*DAY).toISOString().slice(0,10)+'/'+
      new Date(end).toISOString().slice(0,10);
    if(snapshot.seasonId&&snapshot.seasonId!==seasonId)continue;
    if(snapshot.rankingSeason?.endExclusiveAt&&
       snapshot.rankingSeason.endExclusiveAt!==new Date(end).toISOString())continue;
    const startAt=new Date(end-cycle*DAY).toISOString();
    const endExclusiveAt=new Date(end).toISOString();
    for(const a of snapshot.alliances){
      if(typeof a?.key!=='string'||!rank(a.warRank)||!rank(a.raidRank))continue;
      const row={seasonId,allianceKey:a.key,startAt,endExclusiveAt,
        capturedAt:snapshot.capturedAt,warRank:a.warRank,raidRank:a.raidRank};
      const id=identity(row),old=candidates.get(id);
      if(!old||row.capturedAt<old.capturedAt)candidates.set(id,row);
    }
  }
  return [...candidates.values()];
}
