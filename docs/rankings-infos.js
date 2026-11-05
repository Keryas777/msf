// Shared signed Infos source for TCP and MVP. Static WebApp: no guest
// personal data is committed to GitHub Pages or cached in localStorage.
(()=>{
  "use strict";
  const PUBLIC="./data/infos.json";
  const GUEST="https://losp-roster-service.deliriousfan7.workers.dev/api/secure/guest-infos";
  const KEY=/^[a-z][a-z0-9-]{1,63}$/;
  function signedSession(){
    try{
      const value=localStorage.getItem("losp_session")||"";
      return /^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/.test(value)
        ?value:"";
    }catch{return "";}
  }
  function guestKeys(){
    const rows=window.LoSP_SESSION?.allowedAlliances;
    if(!Array.isArray(rows))return [];
    return [...new Set(rows.filter(k=>typeof k==="string"&&KEY.test(k)&&
      window.LoSPAccess?.isAllianceAllowed(k)))].sort();
  }
  async function localInfos(){
    const res=await fetch(PUBLIC+"?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw Error("Impossible de charger les joueurs LoSP (HTTP "+res.status+").");
    const data=await res.json();
    if(!Array.isArray(data))throw Error("Données joueurs LoSP invalides.");
    return data.filter(p=>window.LoSPAccess?.isAllianceAllowed(p?.alliance));
  }
  async function privateInfos(keys){
    const token=signedSession();
    if(!token)throw Error("Session Discord signée nécessaire. Reconnecte-toi.");
    const res=await fetch(GUEST+"?alliances="+encodeURIComponent(keys),{
      mode:"cors",cache:"no-store",headers:{Authorization:"Bearer "+token}
    });
    if(!res.ok){
      if(res.status===401)throw Error("Session Discord expirée. Reconnecte-toi.");
      if(res.status===403)throw Error("Accès aux classements invités refusé.");
      if(res.status===409)throw Error("Alliance invitée non liée ou non approuvée.");
      if(res.status===404)throw Error("API des classements invités non déployée (HTTP 404).");
      // Do not display provider payloads or secrets in the browser.
      throw Error("Classements invités indisponibles (HTTP "+res.status+").");
    }
    const payload=await res.json();
    if(payload?.status!=="ok"||payload?.kind!=="authorized-guest-infos"||
       !Array.isArray(payload.alliances))
      throw Error("Réponse des classements invités invalide.");
    const rows=[],pending=[];
    const used=new Set();
    for(const record of payload.alliances){
      const key=record?.alliance;
      if(typeof key!=="string"||!KEY.test(key)||
         used.has(key)||!window.LoSPAccess?.isAllianceAllowed(key)||
         !Array.isArray(record.players))
        throw Error("Périmètre des classements invités invalide.");
      used.add(key);
      if(record.state!=="complete"){
        pending.push(key);
        continue;
      }
      for(const p of record.players){
        if(p?.alliance!==key||typeof p.name!=="string"||
           !Number.isSafeInteger(p.tcp)||p.tcp<0||
           !Number.isSafeInteger(p.war_mvp)||p.war_mvp<0)
          throw Error("Données de classement invité invalides.");
        rows.push(p);
      }
    }
    return {rows,pending};
  }
  async function load(){
    if(window.LoSP_AUTH_READY)await window.LoSP_AUTH_READY;
    const session=window.LoSP_SESSION;
    if(session?.ok!==true)throw Error("Connexion Discord nécessaire.");
    const isGuest=session.role==="guest",isAdmin=session.role==="admin";
    const summary=document.querySelector(".rankingsSummaryNote");
    if(summary)summary.textContent=isGuest?"Alliance invitée":
      isAdmin?"Groupement et invités":"Groupement LoSP";
    if(isGuest){
      const keys=guestKeys();
      if(!keys.length||keys.length>20)
        throw Error("Aucune alliance invitée autorisée.");
      const {rows,pending}=await privateInfos(keys.join(","));
      return {rows,warning:pending.length?
        "Données TCP/MVP non encore collectées pour : "+pending.join(", ")+".":""};
    }
    const rows=await localInfos();
    if(!isAdmin)return {rows,warning:""};
    try{
      const guest=await privateInfos("approved");
      return {rows:rows.concat(guest.rows),warning:guest.pending.length?
        "Données TCP/MVP invitées non disponibles pour : "+guest.pending.join(", ")+".":""};
    }catch(error){
      return {rows,warning:error?.message||"Classements invités indisponibles."};
    }
  }
  window.LoSPRankingInfos=Object.freeze({load});
})();
