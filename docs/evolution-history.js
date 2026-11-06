// Shared Evolution history source for both pages; no framework or public guest JSON.
// Existing LoSP checkpoints stay on GitHub Pages. Guest history is signed,
// tenant-scoped and read-only from the roster service. No browser persistence.
(()=>{
  "use strict";
  const API="https://losp-roster-service.deliriousfan7.workers.dev/api/secure/guest-evolution";
  const TOKEN=/^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/;
  const SLUG=/^[a-z][a-z0-9-]{1,63}$/;
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const PLAYER=/^g_[a-z][a-z0-9-]{1,63}__[a-z0-9]{1,140}$/;
  const guestIndex=new Map();
  const norm=s=>String(s??"").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
  const meta=s=>window.LoSPAlliances?.getAllianceMeta?.(s);
  const guest=s=>{
    const m=meta(s);return Boolean(m?.group&&m.group!=="losp");
  };
  const losp=s=>meta(s)?.group==="losp";
  const allowed=s=>window.LoSPAccess?.isAllianceAllowed(s)===true;
  function signed(){
    try{
      const s=localStorage.getItem("losp_session")||"";
      return TOKEN.test(s)?s:"";
    }catch{return "";}
  }
  function keys(){
    return [...new Set((window.LoSPAlliances?.getKnownAlliances?.()||[])
      .filter(a=>SLUG.test(a?.key||"")&&guest(a.key)&&allowed(a.key))
      .map(a=>a.key))].sort();
  }
  async function staticJson(url){
    const response=await fetch(url+"?v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw Error("Historique LoSP indisponible (HTTP "+
      response.status+").");
    return response.json();
  }
  async function readPrivate(alliance,view,{date,playerKey}={}){
    if(!SLUG.test(alliance)||!allowed(alliance)||!guest(alliance))
      throw Error("Alliance invitée non autorisée.");
    if(!["index","group","player"].includes(view)||
       (view!=="index"&&!DAY.test(date||""))||
       (view==="player"&&!PLAYER.test(playerKey||"")))
      throw Error("Paramètres historiques invalides.");
    const token=signed();
    if(!token)throw Error("Session Discord signée nécessaire. Reconnecte-toi.");
    const params=new URLSearchParams({alliance,view});
    if(date)params.set("date",date);
    if(playerKey)params.set("playerKey",playerKey);
    const response=await fetch(API+"?"+params.toString(),{
      cache:"no-store",mode:"cors",headers:{Authorization:"Bearer "+token}});
    if(!response.ok){
      const reason=response.status===401?"session expirée":
        response.status===403?"droits refusés":
        response.status===409?"alliance non liée ou autorisation révoquée":
        response.status===404?"API non déployée":
        "HTTP "+response.status;
      throw Error("Historique invité : "+reason+".");
    }
    const result=await response.json();
    if(result?.kind!=="authorized-guest-evolution"||
       result?.status!=="ok"||result.alliance!==alliance||
       result.view!==view)throw Error("Réponse privée incorrecte.");
    return result;
  }
  function publicIndex(raw){
    const players={};
    for(const [id,entry] of Object.entries(raw?.players||{})){
      if(entry?.currentAlliance&&allowed(entry.currentAlliance)&&
         losp(entry.currentAlliance))players[id]=entry;
    }
    const byDate=new Map();
    for(const entry of Object.values(players))
      for(const date of entry.checkpoints||[])
        if(DAY.test(date))byDate.set(date,(byDate.get(date)||0)+1);
    return {version:1,
      checkpoints:[...byDate].map(([date,count])=>({date,players:count}))
        .sort((a,b)=>a.date.localeCompare(b.date)),players};
  }
  function mergeIndices(lospIndex,guestIndices){
    const players={...lospIndex.players},dates=new Map(
      lospIndex.checkpoints.map(c=>[c.date,c.players]));
    for(const [key,idx] of guestIndices){
      for(const [id,record] of Object.entries(idx.players)){
        if(!PLAYER.test(id)||record?.currentAlliance!==key||
           Object.hasOwn(players,id)||!Array.isArray(record.checkpoints))
          throw Error("Identités historiques invitées incohérentes.");
        players[id]=record;
      }
      for(const c of idx.checkpoints){
        if(!DAY.test(c?.date||"")||!Number.isSafeInteger(c.players))
          throw Error("Checkpoints invités invalides.");
        dates.set(c.date,(dates.get(c.date)||0)+c.players);
      }
    }
    return {version:1,players,
      checkpoints:[...dates].map(([date,count])=>({date,players:count}))
        .sort((a,b)=>a.date.localeCompare(b.date))};
  }
  async function loadIndex(){
    if(window.LoSP_AUTH_READY)await window.LoSP_AUTH_READY;
    if(window.LoSP_SESSION?.ok!==true)throw Error("Connexion Discord nécessaire.");
    await window.LoSPAlliances?.loadAlliances?.();
    guestIndex.clear();
    const isGuest=window.LoSP_SESSION.role==="guest";
    const warnings=[];
    const wanted=keys();
    if(isGuest&&!wanted.length)throw Error("Aucune alliance invitée autorisée.");
    // Guests never load the public LoSP index. Admins only merge information
    // actually approved by the server and scoped in alliances.json.
    const publicData=isGuest?{version:1,players:{},checkpoints:[]}:
      publicIndex(await staticJson("./data/roster-history/index.json"));
    const results=await Promise.all(wanted.map(async alliance=>{
      try{
        const result=await readPrivate(alliance,"index");
        if(!result.index||!Array.isArray(result.index.checkpoints)||
           !result.index.players||Array.isArray(result.index.players))
          throw Error("index invalide");
        return [alliance,result.index];
      }catch(e){
        warnings.push(alliance+" : "+String(e?.message||"indisponible"));
        return null;
      }
    }));
    for(const item of results)if(item)guestIndex.set(...item);
    return {historyIndex:mergeIndices(publicData,guestIndex),
      warnings,guestAlliances:wanted,
      retentionDays:29};
  }
  async function group(date){
    if(!DAY.test(date||""))throw Error("Date de comparaison invalide.");
    const isGuest=window.LoSP_SESSION?.role==="guest";
    let publicData={version:1,checkpoint:date,players:[]};
    if(!isGuest){
      try{
        publicData=await staticJson("./data/roster-history/group/"+date+".json");
      }catch(error){
        const guestAvailable=[...guestIndex.values()].some(index=>
          index.checkpoints.some(c=>c.date===date));
        // An invited checkpoint can exist before a LoSP static export;
        // a network or non-404 error still fails visibly.
        if(!guestAvailable||!String(error?.message||"").includes("HTTP 404"))
          throw error;
      }
    }
    const players=(publicData?.players||[]).filter(p=>allowed(p.alliance)&&
      losp(p.alliance));
    const requests=[...guestIndex].filter(([,index])=>
      index.checkpoints.some(c=>c.date===date)).map(async([key])=>{
      const result=await readPrivate(key,"group",{date});
      if(!Array.isArray(result.group?.players)||
         result.group.players.some(p=>p.alliance!==key||
           !PLAYER.test(p.playerKey||"")))
        throw Error("Classement invité invalide.");
      return result.group.players;
    });
    const guestRows=(await Promise.all(requests)).flat();
    return {version:1,checkpoint:date,players:[...players,...guestRows]};
  }
  async function player(alliance,playerKey,date){
    if(!DAY.test(date||""))throw Error("Date de comparaison invalide.");
    if(guest(alliance)){
      const result=await readPrivate(alliance,"player",{date,playerKey});
      if(!result.snapshot||result.snapshot.alliance!==alliance||
         result.snapshot.playerKey!==playerKey||
         result.snapshot.checkpoint!==date)
        throw Error("Aucun roster invité partagé pour ce checkpoint.");
      return result.snapshot;
    }
    if(!allowed(alliance)||!losp(alliance))
      throw Error("Historique LoSP non autorisé.");
    return staticJson("./data/roster-history/players/"+
      encodeURIComponent(playerKey)+"/"+date+".json");
  }
  const playerKey=(alliance,name)=>{
    const n=norm(name);
    return SLUG.test(alliance)&&n?"g_"+alliance+"__"+n:"";
  };
  window.LoSPEvolutionHistory=Object.freeze({
    loadIndex,group,player,playerKey,isGuestAlliance:guest
  });
})();
