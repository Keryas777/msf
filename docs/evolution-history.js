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
    (view==="index"?"index.json":view+"/"+date+(view==="player"?"/"+encodeURIComponent(playerKey):"")+".json");
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
  function publicIndex(raw){
    const players={};
    for(const [id,entry] of Object.entries(raw?.players||{})){
      if(entry?.currentAlliance&&allowed(entry.currentAlliance)&&
         losp(entry.currentAlliance))players[id]=entry;
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
  function mergeIndices(lospIndex,guestIndices){
    const players={...lospIndex.players},dates=new Map(
      lospIndex.checkpoints.map(c=>[c.date,c.players]));
    for(const [key,idx] of guestIndices){
      for(const [id,row] of Object.entries(idx.players)){
        if(Object.hasOwn(players,id))throw Error("Identités historiques en collision.");
        players[id]=row;
      }
      for(const c of idx.checkpoints)dates.set(c.date,(dates.get(c.date)||0)+c.players);
    }
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
    const lospData=isGuest?{version:1,players:{},checkpoints:[]}:
      publicIndex(await staticJson("./data/roster-history/index.json"));
    const results=await Promise.all(guests.map(async a=>{
      try{return [a.key,validateGuestIndex(a.key,await staticJson(guestPath(a.key,"index")))];}
      catch(error){
        // Missing files mean this approved alliance has not produced a publishable checkpoint.
        if(error?.status!==404)warnings.push(a.key+" : "+String(error?.message||"données indisponibles"));
        return null;
      }
    }));
    for(const result of results)if(result)guestIndex.set(...result);
    return {historyIndex:mergeIndices(lospData,guestIndex),warnings,
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
    const isGuest=window.LoSP_SESSION?.role==="guest";
    const tasks=[];
    if(!isGuest)tasks.push(staticJson("./data/roster-history/group/"+date+".json")
      .then(data=>(data?.players||[]).filter(p=>allowed(p.alliance)&&losp(p.alliance)))
      .catch(error=>{
        if(error?.status===404)return [];
        throw error;
      }));
    else tasks.push(Promise.resolve([]));
    for(const [key,idx] of guestIndex){
      if(!idx.checkpoints.some(c=>c.date===date))continue;
      tasks.push(staticJson(guestPath(key,"group",date)).then(data=>{
        if(data?.version!==1||data.checkpoint!==date||!Array.isArray(data.players)||
           data.players.some(p=>p.alliance!==key||!PLAYER.test(p.playerKey||"")))
          throw Error("Classement invité invalide.");
        return data.players.filter(p=>allowed(p.alliance));
      }));
    }
    return {version:1,checkpoint:date,players:(await Promise.all(tasks)).flat()};
  }
  async function player(alliance,playerKey,date){
    if(!DAY.test(date||""))throw Error("Date de comparaison invalide.");
    if(guest(alliance)){
      if(!allowed(alliance)||!PLAYER.test(playerKey||"")||
         !playerKey.startsWith("g_"+alliance+"__"))
        throw Error("Historique invité non autorisé.");
      const snapshot=await staticJson(guestPath(alliance,"player",date,playerKey));
      if(snapshot?.alliance!==alliance||snapshot.playerKey!==playerKey||
         snapshot.checkpoint!==date)throw Error("Historique invité incohérent.");
      return snapshot;
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
