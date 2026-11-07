// Pure, append-only promotion of verified guest rank observations from private R2.
// No provider calls, fingerprints, player data, or R2 paths in published output.
import {approvedGuestSources} from "./guest-player-directory.mjs";

export const GUEST_SEASON_HISTORY_FILE=
  "docs/data/alliance-standings/guest-season-history.json";
export const GUEST_SEASON_SOURCE=
  "roster-batches/v1/guest-season-ranks/rolling.json";
export const GUEST_APPROVAL_SOURCE=
  "roster-sync/v1/approved-guest-alliances.json";
export const GUEST_SEASON_HISTORY_KIND="losp-guest-season-results";
const DAY=86400000, FP=/^[a-f0-9]{64}$/,KEY=/^[a-z][a-z0-9-]{1,63}$/;
const SEASON=/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/;
const validDate=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const rank=value=>Number.isSafeInteger(value)&&value>=0;
const asDay=ms=>new Date(ms).toISOString().slice(0,10);
const identity=row=>row.seasonId+"\u0000"+row.allianceKey;

export function seasonForObservation(observedAt,calendar){
  if(!validDate(observedAt)||!validDate(calendar?.referenceEndExclusiveAt)||
     !Number.isSafeInteger(calendar?.cycleDays)||
     calendar.cycleDays<7||calendar.cycleDays>60||
     !Number.isSafeInteger(calendar?.publicationDelayMinutes)||
     calendar.publicationDelayMinutes<0||calendar.publicationDelayMinutes>2880)
    return null;
  const observed=Date.parse(observedAt);
  const anchor=Date.parse(calendar.referenceEndExclusiveAt);
  const cycle=calendar.cycleDays*DAY;
  const delay=calendar.publicationDelayMinutes*60000;
  // The provider returns the LAST completed season, not the current one.
  // Refuse the short ambiguous interval immediately after a rollover.
  const end=anchor+Math.floor((observed-anchor-delay)/cycle)*cycle;
  if(observed<end+delay||observed>=end+cycle||end<anchor-cycle)
    return null;
  return {seasonId:asDay(end-cycle)+"/"+asDay(end),
    startAt:new Date(end-cycle).toISOString(),
    endExclusiveAt:new Date(end).toISOString()};
}

export function validatePublishedGuestHistory(history,registry,calendar){
  if(history?.version!==1||history.kind!==GUEST_SEASON_HISTORY_KIND||
     !Array.isArray(history.results)||!Array.isArray(registry))
    throw Error("Invalid permanent guest-season history");
  // Retired alliances must keep their historical results; do not require
  // old tenant keys to remain registered forever.
  const seen=new Set();
  for(const item of history.results){
    if(!SEASON.test(item?.seasonId||"")||!KEY.test(item?.allianceKey||"")||
       !validDate(item.capturedAt)||
       !rank(item.warRank)||!rank(item.raidRank)||
       identity(item)==="\u0000"||seen.has(identity(item))||
       seasonForObservation(item.capturedAt,calendar)?.seasonId!==item.seasonId)
      throw Error("Invalid, duplicate or inconsistent archived guest season");
    seen.add(identity(item));
  }
  return seen;
}

export function mergeGuestSeasonHistory(history,source,approval,registry,calendar,
                                        now=Date.now()){
  if(!Number.isFinite(now))throw Error("Invalid current time");
  const seen=validatePublishedGuestHistory(history,registry,calendar);
  const {approved}=approvedGuestSources(registry,approval);
  const byFingerprint=new Map([...approved].map(([key,fp])=>[fp,key]));
  if(!byFingerprint.size)return {history,added:0};
  if(source?.version!==1||source.kind!=="guest-season-ranks-rolling"||
     !Array.isArray(source.snapshots)||source.snapshots.length>35)
    throw Error("Invalid private guest season source");
  const candidates=new Map();
  for(const snap of source.snapshots){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(snap?.collectionDayUtc||"")||
       !validDate(snap.capturedAt)||!Array.isArray(snap.alliances)||
       snap.alliances.length>30)
      throw Error("Invalid R2 guest season envelope");
    for(const item of snap.alliances){
      if(!FP.test(item?.fingerprint||"")||!validDate(item?.capturedAt)||
         !rank(item.warRank)||!rank(item.raidRank)||
         asDay(Date.parse(item.capturedAt))!==snap.collectionDayUtc||
         Date.parse(item.capturedAt)>now+60000)
        throw Error("Invalid R2 guest ranking record");
      const allianceKey=byFingerprint.get(item.fingerprint);
      if(!allianceKey)continue; // Revoked or unbound: never publish.
      const observed=Date.parse(item.capturedAt);
      // Original projection is deliberately short-lived. Do not resuscitate
      // an obsolete source even if the R2 lifecycle is misconfigured.
      if(observed<now-30*DAY)continue;
      const season=seasonForObservation(item.capturedAt,calendar);
      if(!season)continue;
      if(item.manualSeasonId!==undefined&&
         (item.seasonConfirmation!=="admin-in-game"||
          item.manualSeasonId!==season.seasonId))
        continue; // Never reinterpret a manually qualified record.
      const row={seasonId:season.seasonId,allianceKey,
        capturedAt:item.capturedAt,warRank:item.warRank,raidRank:item.raidRank};
      const id=identity(row);
      if(seen.has(id))continue;
      // Earliest eligible observed rank is immutable once published.
      // Prefer an explicitly confirmed reading when it exists.
      const previous=candidates.get(id);
      const confirmed=item.seasonConfirmation==="admin-in-game";
      if(!previous||(confirmed&&!previous.confirmed)||
         (confirmed===previous.confirmed&&
          row.capturedAt<previous.row.capturedAt))
        candidates.set(id,{row,confirmed});
    }
  }
  const newRows=[...candidates.values()].map(value=>value.row)
    .sort((a,b)=>a.seasonId.localeCompare(b.seasonId)||
      a.allianceKey.localeCompare(b.allianceKey));
  if(!newRows.length)return {history,added:0};
  // No deletion, expiry, rolling window, or rewriting of earlier results.
  return {history:{...history,results:[...history.results,...newRows]},added:newRows.length};
}
