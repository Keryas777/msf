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
  function mappedKey(name,registry){
    const needle=normalize(name);
    if(!needle)return null;
    const matches=registry.filter(entry=>{
      const aliases=[entry.key,entry.name,entry.displayName,
        ...(Array.isArray(entry.aliases)?entry.aliases:[])];
      if(Array.isArray(entry.displayParts))
        aliases.push(entry.displayParts.join(""));
      return aliases.some(alias=>normalize(alias)===needle);
    });
    // The two ENDGAME alliances share a displayed name. An ambiguous name
    // is never silently attributed to either of their charts.
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
        const key=mappedKey(record.nameAtCapture,registry);
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
    for(const row of published){
      const day=dayOf(row);
      if(row.captureType==="season-ranks"||!day){others.push(row);continue;}
      if(!byDay.has(day)||(row.alliances?.length||0)>
         (byDay.get(day).alliances?.length||0))byDay.set(day,row);
    }
    for(const row of fromCloudflare(payload,registry,allowed)){
      const current=byDay.get(row.collectionDayUtc);
      if(!current||(row.alliances?.length||0)>=(current.alliances?.length||0))
        byDay.set(row.collectionDayUtc,row);
    }
    return [...others,...byDay.values()].sort((a,b)=>
      a.capturedAt.localeCompare(b.capturedAt));
  }
  root.LoSPTrophyLive=Object.freeze({merge,fromCloudflare,mappedKey});
})(window);
