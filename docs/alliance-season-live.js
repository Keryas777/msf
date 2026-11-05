// Guest-only read adapter for the Worker's approved, rank-only Monday capture.
// The existing JSON season calendar decides which Mondays represent a completed
// season. Never label a non-final reading or turn a rank into war trophies.
(function(root){
  "use strict";
  const validDate=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
  const validRank=value=>Number.isSafeInteger(value)&&value>=0;
  const DAY_MS=86400000;
  function completedSeason(capturedAt,day,calendar){
    if(!validDate(capturedAt)||!/^\d{4}-\d{2}-\d{2}$/.test(day||"")||
       capturedAt.slice(0,10)!==day||
       !validDate(calendar?.referenceEndExclusiveAt)||
       !Number.isSafeInteger(calendar?.cycleDays)||calendar.cycleDays<7||
       calendar.cycleDays>60||!Number.isSafeInteger(calendar?.publicationDelayMinutes)||
       calendar.publicationDelayMinutes<0||calendar.publicationDelayMinutes>2880)
      return null;
    const at=Date.parse(capturedAt),anchor=Date.parse(calendar.referenceEndExclusiveAt);
    const endDelay=calendar.publicationDelayMinutes*60000;
    const duration=calendar.cycleDays*DAY_MS;
    const n=Math.floor((at-anchor-endDelay)/duration);
    const end=anchor+n*duration,start=end-duration;
    // Only the real Monday 03:15 UTC after a completed season; never an
    // ordinary Monday within the season or a later, potentially reset rank.
    const observed=new Date(at);
    if(observed.getUTCDay()!==1||observed.getUTCHours()!==3||
       observed.getUTCMinutes()!==15||at<end+endDelay||
       at>=end+DAY_MS||!Number.isFinite(start))return null;
    return {seasonId:new Date(start).toISOString().slice(0,10)+"/"+
        new Date(end).toISOString().slice(0,10),
      startAt:new Date(start).toISOString(),
      endExclusiveAt:new Date(end).toISOString(),
      identification:"schedule-derived",
      timezone:calendar.timezone||"Europe/Paris"};
  }
  function mappedKey(record,registry){
    // A manually verified admin binding distinguishes the two same-name
    // ENDGAME alliances; the existing trophy public ID serves MARINES.
    const known=root.LoSPTrophyLive?.mappedKey?.(
      record.nameAtCapture,registry,record.publicId)||null;
    const explicit=typeof record.allianceKey==="string"?
      registry.filter(a=>a?.key===record.allianceKey):[];
    if(explicit.length>1)return null;
    if(explicit.length===1){
      if(known&&known!==explicit[0].key)return null;
      return explicit[0].key;
    }
    // A supplied, unrecognized key must never be guessed by display name.
    if(record.allianceKey!==undefined)return null;
    return known;
  }
  function fromCloudflare(payload,registry,allowed,calendar){
    if(payload?.status!=="ok"||payload.kind!=="connected-guest-season-ranks"||
       !Array.isArray(payload.snapshots)||payload.snapshots.length>35||
       !Array.isArray(registry))return [];
    const out=[];
    for(const row of payload.snapshots){
      const season=completedSeason(row?.capturedAt,row?.collectionDayUtc,calendar);
      if(!season||!Array.isArray(row.alliances)||row.alliances.length>30)continue;
      const alliances=[],seen=new Set();
      for(const entry of row.alliances){
        if(!entry||typeof entry.nameAtCapture!=="string"||
           !validDate(entry.capturedAt)||!validRank(entry.warRank)||
           !validRank(entry.raidRank))continue;
        const key=mappedKey(entry,registry);
        if(!key||seen.has(key)||!allowed(key))continue;
        seen.add(key);
        alliances.push({key,nameAtCapture:entry.nameAtCapture,
          warRank:entry.warRank,raidRank:entry.raidRank,warTrophies:null});
      }
      if(!alliances.length)continue;
      out.push({version:1,kind:"losp-alliance-standings-snapshot",
        capturedAt:row.capturedAt,collectionDayUtc:row.collectionDayUtc,
        captureType:"season-ranks",seasonId:season.seasonId,
        seasonVerified:false,seasonDerived:true,rankingSeason:{
          startAt:season.startAt,endExclusiveAt:season.endExclusiveAt,
          identification:season.identification,timezone:season.timezone},
        source:"/player/v1/alliance/card",
        coverage:{completeSessionScan:row.coverage?.complete===true,
          source:"cloudflare-approved-guest-season-ranks"},
        alliances});
    }
    return out.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
  }
  root.LoSPGuestSeasonLive=Object.freeze({fromCloudflare,completedSeason,mappedKey});
})(window);
