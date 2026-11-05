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
  // An exceptional in-game-verified reading can be observed on a weekday
  // after the last season ended. Recompute the ID from the dynamic calendar:
  // never trust the posted label by itself or invent a later season.
  function confirmedManualSeason(record,calendar){
    if(record?.seasonConfirmation!=="admin-in-game"||
      !/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(record.manualSeasonId||"")||
      !validDate(record.capturedAt))return null;
    const derived=root.LoSPStandingsSeries?.resolveRankingSeason?.(
      record.capturedAt,calendar);
    if(!derived||derived.seasonId!==record.manualSeasonId)return null;
    const observed=Date.parse(record.capturedAt),
      end=Date.parse(derived.endExclusiveAt);
    if(!Number.isSafeInteger(calendar?.cycleDays)||
      observed<end+calendar.publicationDelayMinutes*60000||
      observed>=end+calendar.cycleDays*DAY_MS)return null;
    return {seasonId:derived.seasonId,startAt:derived.startAt,
      endExclusiveAt:derived.endExclusiveAt,
      identification:"admin-in-game",timezone:derived.timezone};
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
      if(!Array.isArray(row?.alliances)||row.alliances.length>30)continue;
      const scheduled=completedSeason(row.capturedAt,row.collectionDayUtc,calendar);
      const grouped=new Map();
      for(const entry of row.alliances){
        if(!entry||typeof entry.nameAtCapture!=="string"||
           !validDate(entry.capturedAt)||!validRank(entry.warRank)||
           !validRank(entry.raidRank))continue;
        // A manual marker requires a genuinely confirmed completed season;
        // it must never fall back to guessing from another capture's date.
        const manual=entry.manualSeasonId!==undefined;
        const season=manual?confirmedManualSeason(entry,calendar):scheduled;
        if(!season||(!manual&&entry.capturedAt!==row.capturedAt))continue;
        const key=mappedKey(entry,registry);
        if(!key||!allowed(key))continue;
        if(!grouped.has(season.seasonId))
          grouped.set(season.seasonId,{season,alliances:[],seen:new Set(),
            capturedAt:entry.capturedAt});
        const group=grouped.get(season.seasonId);
        if(group.seen.has(key))continue;
        group.seen.add(key);
        if(entry.capturedAt>group.capturedAt)group.capturedAt=entry.capturedAt;
        group.alliances.push({key,nameAtCapture:entry.nameAtCapture,
          warRank:entry.warRank,raidRank:entry.raidRank,warTrophies:null});
      }
      for(const group of grouped.values()){
        const season=group.season;
        out.push({version:1,kind:"losp-alliance-standings-snapshot",
          capturedAt:group.capturedAt,
          collectionDayUtc:row.collectionDayUtc,
          captureType:"season-ranks",seasonId:season.seasonId,
          seasonVerified:false,seasonDerived:true,rankingSeason:{
            startAt:season.startAt,endExclusiveAt:season.endExclusiveAt,
            identification:season.identification,timezone:season.timezone},
          source:"/player/v1/alliance/card",
          coverage:{completeSessionScan:row.coverage?.complete===true,
            source:"cloudflare-approved-guest-season-ranks"},
          alliances:group.alliances});
      }
    }
    return out.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
  }
  root.LoSPGuestSeasonLive=Object.freeze({fromCloudflare,completedSeason,mappedKey});
})(window);
