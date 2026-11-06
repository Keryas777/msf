// Shared Infos / joueurs / rosters access for the static WebApp.
// L'annuaire public joueurs.json est commun aux alliances LoSP et invitées.
// Les Infos détaillées et les rosters absents des fichiers publiés continuent
// de passer par les routes R2 signées et contrôlées côté Worker.
(()=>{
  "use strict";
  const API="https://losp-roster-service.deliriousfan7.workers.dev/api/secure/";
  const SLUG=/^[a-z][a-z0-9-]{1,63}$/;
  const SIGNED=/^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/;
  const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
  const normalized=s=>String(s??"").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const registry=()=>window.LoSPAlliances?.getKnownAlliances?.()||[];
  const meta=value=>window.LoSPAlliances?.getAllianceMeta?.(value)||null;
  const allowed=value=>window.LoSPAccess?.isAllianceAllowed(value)===true;
  const canonical=value=>meta(value)?.key||
    (SLUG.test(String(value||""))?String(value):"");
  const sourceKey=value=>meta(value)?.sourceKey||meta(value)?.key||
    (SLUG.test(String(value||""))?String(value):"");
  const losp=value=>meta(value)?.group==="losp";
  const guest=value=>{
    const m=meta(value);
    return m&&m.group&&m.group!=="losp";
  };
  function signedSession(){
    try{
      const token=localStorage.getItem("losp_session")||"";
      return SIGNED.test(token)?token:"";
    }catch{return "";}
  }
  function guestKeys(){
    return [...new Set(registry()
      .filter(a=>guest(a.key)&&allowed(a.key)&&SLUG.test(sourceKey(a.key)))
      .map(a=>sourceKey(a.key)))].sort();
  }
  async function publicJson(file){
    const res=await fetch("./data/"+file+".json?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw Error(file+".json : HTTP "+res.status);
    const rows=await res.json();
    if(!Array.isArray(rows))throw Error(file+".json : format invalide");
    return rows;
  }
  async function requestGuest(path,token){
    const response=await fetch(API+path,{mode:"cors",cache:"no-store",
      headers:{"Authorization":"Bearer "+token}});
    if(!response.ok){
      const reason=response.status===401?"session Discord expirée":
        response.status===403?"accès refusé":
        response.status===409?"alliance non liée ou non approuvée":
        response.status===404?"API non déployée":
        "HTTP "+response.status;
      throw Error(reason);
    }
    return response.json();
  }
  function validInfo(p,key){
    return isObject(p)&&p.alliance===key&&typeof p.name==="string"&&
      p.name.trim()&&Number.isSafeInteger(p.tcp)&&p.tcp>=0&&
      Number.isSafeInteger(p.war_mvp)&&p.war_mvp>=0&&
      typeof p.icon==="string"&&typeof p.frame==="string";
  }
  function validRoster(r,key){
    return isObject(r)&&r.alliance===key&&
      typeof r.player==="string"&&r.player.trim()&&
      isObject(r.chars)&&isObject(r.iso);
  }
  async function guestInfos(token,keys,isAdmin,warnings){
    if(!keys.length)return [];
    try{
      const query=isAdmin?"approved":keys.join(",");
      const body=await requestGuest("guest-infos?alliances="+
        encodeURIComponent(query),token);
      if(body?.status!=="ok"||body?.kind!=="authorized-guest-infos"||
         !Array.isArray(body.alliances))throw Error("réponse Infos invalide");
      const rows=[],seen=new Set(),permitted=new Set(keys);
      for(const group of body.alliances){
        const key=group?.alliance;
        if(!SLUG.test(key)||!permitted.has(key)||seen.has(key)||
           !Array.isArray(group.players))
          throw Error("périmètre Infos invalide");
        seen.add(key);
        if(group.state!=="complete"){
          warnings.push(key+" : aucune collecte Infos complète récente.");
          continue;
        }
        if(!group.players.every(p=>validInfo(p,key)))
          throw Error(key+" : données Infos invalides");
        rows.push(...group.players);
      }
      return rows;
    }catch(error){
      warnings.push("Infos invitées : "+String(error?.message||"indisponibles"));
      return [];
    }
  }
  async function guestRosters(token,keys,warnings){
    const result=await Promise.all(keys.map(async key=>{
      try{
        const body=await requestGuest("guest-rosters?alliance="+
          encodeURIComponent(key),token);
        if(body?.status!=="ok"||body.kind!=="authorized-guest-rosters"||
           body.alliance!==key||!Array.isArray(body.rosters)||
           !["complete","not-collected","no-valid-snapshot"].includes(body.state))
          throw Error("réponse roster invalide");
        if(body.state!=="complete"){
          warnings.push(key+" : aucune collecte roster complète récente.");
          return [];
        }
        if(!body.rosters.every(r=>validRoster(r,key)))
          throw Error("données roster invalides");
        return body.rosters;
      }catch(error){
        warnings.push(key+" : roster invité "+String(error?.message||"indisponible"));
        return [];
      }
    }));
    return result.flat();
  }
  function unique(rows,identity){
    const indexed=new Map();
    for(const row of rows){
      const id=identity(row);
      if(id)indexed.set(id,row);
    }
    return [...indexed.values()];
  }
  function rowIdentity(alliance,player){
    const key=canonical(alliance);
    return key&&normalized(player)?key+"\u0000"+normalized(player):"";
  }
  async function load({infos=false,joueurs=false,rosters=false}={}){
    if(window.LoSP_AUTH_READY)await window.LoSP_AUTH_READY;
    if(window.LoSP_SESSION?.ok!==true)
      throw Error("Connexion Discord nécessaire.");
    await window.LoSPAlliances?.loadAlliances?.();
    const admin=window.LoSP_SESSION.role==="admin";
    const isGuest=window.LoSP_SESSION.role==="guest";
    const keys=guestKeys();
    const warnings=[];
    const needInfos=infos||joueurs;
    const readPublic=true;
    const tasks=[
      readPublic&&needInfos?publicJson("infos").catch(e=>{
        warnings.push(String(e.message));return [];}):Promise.resolve([]),
      readPublic&&joueurs?publicJson("joueurs").catch(e=>{
        warnings.push(String(e.message));return [];}):Promise.resolve([]),
      readPublic&&rosters?publicJson("rosters").catch(e=>{
        warnings.push(String(e.message));return [];}):Promise.resolve([]),
    ];
    const [infosPublic,joueursPublic,rostersPublic]=await Promise.all(tasks);
    // A complete GitHub roster is the primary data source for EVERY alliance.
    // Only alliances with no published roster use the signed R2 projection.
    const publicGuestKeys=new Set(rostersPublic
      .filter(r=>guest(r?.alliance)&&allowed(r.alliance)&&
        validRoster(r,sourceKey(r.alliance)))
      .map(r=>sourceKey(r.alliance)));
    const privateRosterKeys=rosters?
      keys.filter(key=>!publicGuestKeys.has(key)):[];
    const needPrivate=needInfos||privateRosterKeys.length>0;
    const token=needPrivate?signedSession():"";
    if(needPrivate&&!token)
      warnings.push("Session Discord signée nécessaire pour les données invitées.");
    const [infosPrivate,rostersPrivate]=await Promise.all([
      token&&needInfos?guestInfos(token,keys,admin,warnings):Promise.resolve([]),
      token&&privateRosterKeys.length?
        guestRosters(token,privateRosterKeys,warnings):Promise.resolve([])
    ]);
    const filteredInfos=infosPublic.filter(p=>allowed(p?.alliance)&&
      losp(p?.alliance));
    // L'annuaire public est désormais commun à toutes les alliances.
    // Les autorisations filtrent l'affichage, pas le contenu du JSON public.
    const filteredJoueurs=joueursPublic.filter(p=>allowed(p?.alliance));
    const filteredRosters=rostersPublic.filter(p=>
      p?.alliance?allowed(p.alliance):!isGuest);
    const combinedInfos=unique([...filteredInfos,...infosPrivate],
      p=>rowIdentity(p.alliance,p.name));
    // Infos includes members without rosterShare; this does NOT grant roster
    // permission. Add roster-only members if a valid Info campaign is delayed.
    const guestDirectory=[
      ...infosPrivate.map(p=>({player:p.name,alliance:p.alliance})),
      ...filteredRosters.filter(p=>guest(p.alliance))
        .map(p=>({player:p.player,alliance:p.alliance})),
      ...rostersPrivate.map(p=>({player:p.player,alliance:p.alliance}))
    ];
    const combinedJoueurs=unique([...filteredJoueurs,...guestDirectory],
      p=>rowIdentity(p.alliance,p.player));
    const combinedRosters=unique([...filteredRosters,...rostersPrivate],
      p=>rowIdentity(p.alliance,p.player||p.playerKey));
    return {infos:combinedInfos,joueurs:combinedJoueurs,
      rosters:combinedRosters,warnings};
  }
  function showWarnings(warnings){
    if(!warnings?.length)return;
    let node=document.getElementById("guestDataWarning");
    if(!node){
      node=document.createElement("p");
      node.id="guestDataWarning";
      node.setAttribute("role","status");
      node.style.cssText="margin:10px auto;padding:12px;border:1px solid #a06d35;border-radius:10px;color:#f5d4ab;background:#1b1820;max-width:920px;font-size:14px;";
      (document.querySelector("main")||document.body).prepend(node);
    }
    node.textContent=warnings.join(" ");
  }
  window.LoSPAllianceData=Object.freeze({load,showWarnings});
})();
