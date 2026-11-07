// Pure adapter for the consented Cloudflare trophy projection. All chart and
// access-control behavior remains in alliance-history.js and the shared selectors.
(function(root){
  "use strict";
  // Scopely alliance names can contain in-game colour markup and
  // lookalike letters (Greek, Cyrillic, etc). These are display characters,
  // not part of the stable alliance name. Never execute the markup.
  const inGameLetters=Object.freeze({
    "Α":"a","α":"a","Λ":"a","Β":"b","β":"b","С":"c","с":"c",
    "Δ":"d","δ":"d","Ε":"e","ε":"e","Σ":"e","ϵ":"e",
    "Ζ":"z","ζ":"z","Η":"h","η":"n","Ι":"i","ι":"i",
    "Κ":"k","κ":"k","Μ":"m","μ":"m","Ν":"n","ν":"n","Π":"n","π":"n",
    "Ο":"o","ο":"o","σ":"o","Ω":"w","ω":"w",
    "Ρ":"p","ρ":"p","Τ":"t","τ":"t","Υ":"u","υ":"u",
    "Χ":"x","χ":"x","γ":"y","Я":"r","я":"r","Ƨ":"s","ƨ":"s","Ѕ":"s","ѕ":"s"
  });
  const normalize=value=>String(value??"")
    .replace(/<#[a-f0-9]{6}>|<\/?color(?:=[^<>]{1,32})?>/gi,"")
    .replace(/[Α-ωϵА-яƧƨЅѕ]/g,char=>inGameLetters[char]||char)
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]/g,"");
  const safeNum=value=>Number.isSafeInteger(value)&&value>=0;
  const validDate=value=>typeof value==="string"&&
    Number.isFinite(Date.parse(value));
  const dayOf=s=>s.collectionDayUtc||
    (s.captureType==="season-ranks"?"":s.capturedAt?.slice(0,10));
  // Stable within the Worker's rolling archive. This public, non-provider ID
  // is optional registry metadata; never treat a display name as identity
  // when an explicitly registered public ID is available.
  const validPublicId=value=>typeof value==="string"&&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const validAllianceKey=value=>typeof value==="string"&&
    /^[a-z][a-z0-9-]{1,63}$/.test(value);
  function mappedKey(name,registry,publicId,allianceKey){
    if(allianceKey!==undefined){
      // Keys emitted by Cloudflare come from the CURRENT approved R2 guest
      // binding. Do not infer identity from an identical name or a colour.
      if(!validAllianceKey(allianceKey)||!validPublicId(publicId))return null;
      const bound=registry.filter(entry=>entry?.key===allianceKey);
      if(bound.length!==1||!bound[0].group||bound[0].group==="losp")
        return null;
      // A previously registered public UUID must never be allowed to
      // identify a different alliance than the approved canonical key.
      const identified=registry.filter(entry=>entry?.trophyPublicId===publicId);
      if(identified.length>1||
         (identified.length===1&&identified[0].key!==allianceKey))
        return null;
      return bound[0].key;
    }
    if(validPublicId(publicId)){
      const identified=registry.filter(entry=>entry?.trophyPublicId===publicId);
      if(identified.length>1)return null; // Fail closed on conflicting registry IDs.
      if(identified.length===1)return identified[0].key;
    }
    const needle=normalize(name);
    if(!needle)return null;
    const matches=registry.filter(entry=>{
      const aliases=[entry.key,entry.name,entry.displayName,
        ...(Array.isArray(entry.aliases)?entry.aliases:[])];
      if(Array.isArray(entry.displayParts))
        aliases.push(entry.displayParts.join(""));
      return aliases.some(alias=>normalize(alias)===needle);
    });
    // Any number of alliances may share a displayed name. Without a bound
    // key or unique public ID, never guess which tenant owns the reading.
    return matches.length===1?matches[0].key:null;
  }
  function fromCloudflare(payload,registry,allowed){
    if(payload?.status!=="ok"||payload.kind!=="connected-alliance-trophy-history"||
       !Array.isArray(payload.snapshots)||payload.snapshots.length>30)
      return [];
    const result=[];
    for(const s of payload.snapshots){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s?.collectionDayUtc||"")||
         !validDate(s.capturedAt)||!Array.isArray(s.alliances)||s.alliances.length>30)
        continue;
      const alliances=[],seen=new Set();
      for(const record of s.alliances){
        if(!record||!safeNum(record.warTrophies)||
           !validDate(record.capturedAt)||typeof record.nameAtCapture!=="string")
          continue;
        const key=mappedKey(record.nameAtCapture,registry,record.publicId,
          record.allianceKey);
        if(!key||seen.has(key)||!allowed(key))continue;
        seen.add(key);
        alliances.push({key,nameAtCapture:record.nameAtCapture,
          capturedAt:record.capturedAt,warTrophies:record.warTrophies});
      }
      if(!alliances.length)continue;
      result.push({version:1,kind:"losp-alliance-standings-snapshot",
        collectionDayUtc:s.collectionDayUtc,capturedAt:s.capturedAt,
        captureType:"war-trophies",source:"/player/v1/alliance/card",
        seasonId:null,seasonVerified:false,
        coverage:{completeSessionScan:s.coverage?.complete===true,
          source:"cloudflare-connected-alliances",
          observed:s.coverage?.observed??alliances.length,
          expected:s.coverage?.expected??null},
        alliances});
    }
    return result;
  }
  function merge(published,payload,registry,allowed){
    const byDay=new Map(),others=[];
    const add=row=>{
      const day=dayOf(row);
      if(row.captureType==="season-ranks"||!day){others.push(row);return;}
      const current=byDay.get(day);
      if(!current){byDay.set(day,row);return;}
      // Merge each alliance's real observation, not the size of a
      // permission-filtered Cloudflare snapshot versus a LoSP snapshot.
      const byKey=new Map();
      for(const alliance of current.alliances||[])
        if(typeof alliance?.key==="string")byKey.set(alliance.key,alliance);
      for(const alliance of row.alliances||[]){
        if(typeof alliance?.key!=="string")continue;
        const previous=byKey.get(alliance.key);
        if(!previous){byKey.set(alliance.key,alliance);continue;}
        const previousAt=Date.parse(previous.capturedAt||current.capturedAt);
        const incomingAt=Date.parse(alliance.capturedAt||row.capturedAt);
        const incomingIsNewer=Number.isFinite(incomingAt)&&
          (!Number.isFinite(previousAt)||incomingAt>=previousAt);
        // Retain rank fields from static AllianceCards when the live
        // projection provides only warTrophies.
        byKey.set(alliance.key,incomingIsNewer?
          {...previous,...alliance}:{...alliance,...previous});
      }
      // Preserve the static snapshot's seasonal eligibility if it exists:
      // live-only days must remain trophy-only.
      const base=current.captureType==="war-trophies"&&
        row.captureType!=="war-trophies"?row:current;
      byDay.set(day,{...base,collectionDayUtc:day,
        capturedAt:row.capturedAt>current.capturedAt?
          row.capturedAt:current.capturedAt,
        alliances:[...byKey.values()]});
    };
    for(const row of published)add(row);
    for(const row of fromCloudflare(payload,registry,allowed))add(row);
    return [...others,...byDay.values()].sort((a,b)=>
      a.capturedAt.localeCompare(b.capturedAt));
  }
  root.LoSPTrophyLive=Object.freeze({merge,fromCloudflare,mappedKey});
})(window);
