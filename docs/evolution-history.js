// Shared static Evolution history reader for LoSP and approved guest alliances.
(()=>{
  "use strict";
  const SLUG=/^[a-z][a-z0-9-]{1,63}$/;
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const PLAYER=/^g_[a-z][a-z0-9-]{1,63}__[a-z0-9]{1,140}$/;
  const guestIndex=new Map();
  let canonicalRegistry=[];
  const norm=s=>String(s??"").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
  const meta=s=>window.LoSPAlliances?.getAllianceMeta?.(s);
  const guest=s=>{const m=meta(s);return Boolean(m?.group&&m.group!=="losp");};
  const losp=s=>{
    const key=String(s??"").trim().toLowerCase();
    const record=canonicalRegistry.find(a=>a?.key===key);
    return record?record.group==="losp":meta(s)?.group==="losp";
  };
  const allowed=s=>window.LoSPAccess?.isAllianceAllowed(s)===true;
  const guestPath=(key,view,date,playerKey)=>
    "./data/roster-history/guests/"+encodeURIComponent(key)+"/"+
    (view==="index"?"index.json":view==="player"?"players/"+encodeURIComponent(playerKey)+"/"+date+".json":"group/"+date+".json");
  async function staticJson(url){
    let last;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const response=await fetch(url+(url.includes("?")?"&":"?")+"v="+Date.now(),
          {cache:"no-store"});
        if(!response.ok){
          const error=Error("Chargement historique impossible (HTTP "+response.status+").");
          error.status=response.status;
          if(attempt===0&&response.status>=500){last=error;continue;}
          throw error;
        }
        return await response.json();
      }catch(error){
        last=error;
        if(attempt||error?.status||!(error instanceof TypeError))throw error;
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    }
    throw last||Error("Chargement historique impossible.");
  }
  const scopedGuestId=(alliance,name)=>{
    const n=norm(name);
    return SLUG.test(alliance||"")&&n?"g_"+alliance+"__"+n:"";
  };
  function publicIndex(raw){
    const players={};
    for(const [id,entry] of Object.entries(raw?.players||{})){
      const alliance=entry?.currentAlliance;
      if(!alliance||!allowed(alliance))continue;
      if(losp(alliance))players[id]=entry;
      else if(guest(alliance)){
        const scoped=scopedGuestId(alliance,entry.name||id);
        if(scoped)players[scoped]={...entry,playerKey:scoped,legacyPlayerKey:id};
      }
    }
    const dates=new Map();
    for(const entry of Object.values(players))for(const date of entry.checkpoints||[])
      if(DAY.test(date))dates.set(date,(dates.get(date)||0)+1);
    return {version:1,players,checkpoints:[...dates]
      .map(([date,count])=>({date,players:count})).sort((a,b)=>a.date.localeCompare(b.date))};
  }
  function validateGuestIndex(key,idx){
    if(!idx||idx.version!==1||!idx.players||Array.isArray(idx.players)||
       !Array.isArray(idx.checkpoints))throw Error("Index historique invité invalide.");
    for(const [id,row] of Object.entries(idx.players)){
      if(!PLAYER.test(id)||row?.currentAlliance!==key||
         !Array.isArray(row.checkpoints)||row.checkpoints.some(d=>!DAY.test(d)))
        throw Error("Identité historique invitée incohérente.");
    }
    for(const c of idx.checkpoints)
      if(!DAY.test(c?.date||"")||!Number.isSafeInteger(c.players))
        throw Error("Checkpoint historique invité invalide.");
    return idx;
  }
  function mergeIndices(legacyIndex,guestIndices){
    const players={};
    const mergePlayer=(id,row)=>{
      const prior=players[id];
      if(!prior){players[id]=row;return;}
      if(prior.currentAlliance!==row.currentAlliance)
        throw Error("Identités historiques en collision.");
      players[id]={...prior,...row,checkpoints:[...new Set([
        ...(prior.checkpoints||[]),...(row.checkpoints||[])
      ])].sort()};
    };
    for(const [id,row] of Object.entries(legacyIndex.players))mergePlayer(id,row);
    for(const [alliance,idx] of guestIndices)
      for(const [id,row] of Object.entries(idx.players))mergePlayer(id,row);
    const dates=new Map();
    for(const idx of [legacyIndex,...[...guestIndices.values()]])
      for(const checkpoint of idx.checkpoints||[])
        if(DAY.test(checkpoint?.date||""))dates.set(checkpoint.date,0);
    for(const row of Object.values(players))
      for(const date of new Set(row.checkpoints||[]))
        if(DAY.test(date))dates.set(date,(dates.get(date)||0)+1);
    return {version:1,players,checkpoints:[...dates]
      .map(([date,count])=>({date,players:count})).sort((a,b)=>a.date.localeCompare(b.date))};
  }
  async function loadIndex(){
    if(window.LoSP_AUTH_READY)await window.LoSP_AUTH_READY;
    if(window.LoSP_SESSION?.ok!==true)throw Error("Connexion Discord nécessaire.");
    await window.LoSPAlliances?.loadAlliances?.();
    const registry=await staticJson("./data/alliances.json");
    if(!Array.isArray(registry))throw Error("Registre d'alliances invalide.");
    canonicalRegistry=registry;
    guestIndex.clear();
    const guests=registry.filter(a=>a?.active!==false&&SLUG.test(a?.key||"")&&
      a.group&&a.group!=="losp"&&allowed(a.key));
    const isGuest=window.LoSP_SESSION.role==="guest";
    if(isGuest&&!guests.length)throw Error("Aucune alliance invitée autorisée.");
    const warnings=[];
    const legacyData=publicIndex(await staticJson("./data/roster-history/index.json"));
    const results=await Promise.all(guests.map(async a=>{
      try{return [a.key,validateGuestIndex(a.key,await staticJson(guestPath(a.key,"index")))];}
      catch(error){
        // Missing files mean this approved alliance has not produced a publishable checkpoint.
        if(error?.status!==404)warnings.push(a.key+" : "+String(error?.message||"données indisponibles"));
        return null;
      }
    }));
    for(const result of results)if(result)guestIndex.set(...result);
    return {historyIndex:mergeIndices(legacyData,guestIndex),warnings,
      guestAlliances:guests.map(a=>a.key),historyPolicy:"checkpoint-archive"};
  }
  async function infos(){
    if(window.LoSP_AUTH_READY)await window.LoSP_AUTH_READY;
    if(window.LoSP_SESSION?.ok!==true)throw Error("Connexion Discord nécessaire.");
    if(!canonicalRegistry.length)await loadIndex();
    const warnings=[];
    let rows=[];
    if(window.LoSP_SESSION.role!=="guest"){
      try{rows=(await staticJson("./data/infos.json")).filter(p=>
        allowed(p?.alliance)&&losp(p?.alliance));}
      catch(error){warnings.push("Fiches Infos LoSP indisponibles.");}
    }
    const guests=canonicalRegistry.filter(a=>a?.active!==false&&a.group&&
      a.group!=="losp"&&allowed(a.key));
    const guestRows=await Promise.all(guests.map(async a=>{
      try{
        const data=await staticJson("./data/roster-history/guests/"+
          encodeURIComponent(a.key)+"/infos.json");
        if(!Array.isArray(data))throw Error("format invalide");
        return data.filter(p=>p?.alliance===a.key&&typeof p.name==="string");
      }catch(error){
        if(error?.status!==404)warnings.push(a.key+" : portraits facultatifs indisponibles.");
        return [];
      }
    }));
    return {infos:[...rows,...guestRows.flat()],warnings};
  }
  async function group(date){
    if(!DAY.test(date||""))throw Error("Date de comparaison invalide.");
    const tasks=[staticJson("./data/roster-history/group/"+date+".json")
      .then(data=>(data?.players||[])
        .filter(p=>allowed(p.alliance)&&(losp(p.alliance)||guest(p.alliance)))
        .map(p=>guest(p.alliance)?
          {...p,playerKey:scopedGuestId(p.alliance,p.player)}:p))
      .catch(error=>{
        if(error?.status===404)return [];
        throw error;
      })];
    for(const [key,idx] of guestIndex){
      if(!idx.checkpoints.some(c=>c.date===date))continue;
      tasks.push(staticJson(guestPath(key,"group",date)).then(data=>{
        if(data?.version!==1||data.checkpoint!==date||!Array.isArray(data.players)||
           data.players.some(p=>p.alliance!==key||!PLAYER.test(p.playerKey||"")))
          throw Error("Classement invité invalide.");
        return data.players.filter(p=>allowed(p.alliance));
      }));
    }
    const rows=(await Promise.all(tasks)).flat(),unique=new Map();
    for(const row of rows){
      const id=row?.playerKey||"";
      if(!id)continue;
      unique.set(row.alliance+"\u0000"+id,row);
    }
    return {version:1,checkpoint:date,players:[...unique.values()]};
  }
  async function player(alliance,playerKey,date){
    if(!DAY.test(date||""))throw Error("Date de comparaison invalide.");
    if(guest(alliance)){
      if(!allowed(alliance)||!PLAYER.test(playerKey||"")||
         !playerKey.startsWith("g_"+alliance+"__"))
        throw Error("Historique invité non autorisé.");
      const idx=guestIndex.get(alliance);
      const indexed=idx?.players?.[playerKey]?.checkpoints?.includes(date);
      if(indexed){
        const snapshot=await staticJson(guestPath(alliance,"player",date,playerKey));
        if(snapshot?.alliance!==alliance||snapshot.playerKey!==playerKey||
           snapshot.checkpoint!==date)throw Error("Historique invité incohérent.");
        return snapshot;
      }
      const legacyPlayerKey=playerKey.slice(("g_"+alliance+"__").length);
      const legacy=await staticJson("./data/roster-history/players/"+
        encodeURIComponent(legacyPlayerKey)+"/"+date+".json");
      if(legacy?.alliance!==alliance||norm(legacy.player)!==legacyPlayerKey||
         legacy.playerKey!==legacyPlayerKey||legacy.checkpoint!==date)
        throw Error("Ancien checkpoint invité incohérent.");
      return {...legacy,playerKey};
    }
    if(!allowed(alliance)||!losp(alliance))throw Error("Historique LoSP non autorisé.");
    return staticJson("./data/roster-history/players/"+
      encodeURIComponent(playerKey)+"/"+date+".json");
  }
  const playerKey=(alliance,name)=>{
    const n=norm(name);
    return SLUG.test(alliance)&&n?"g_"+alliance+"__"+n:"";
  };
  window.LoSPEvolutionHistory=Object.freeze({
    loadIndex,group,player,infos,playerKey,isGuestAlliance:guest
  });
})();
