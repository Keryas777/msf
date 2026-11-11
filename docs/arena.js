// LoSP Arène: static, mobile-first, no charting framework.
(()=>{
"use strict";
const API="https://losp-roster-service.deliriousfan7.workers.dev/api/public/arena-history";
const GUEST_API="https://losp-roster-service.deliriousfan7.workers.dev/api/secure/guest-arena-history";
// Only the official Discord HMAC session is accepted by the guest API.
// Preview group selection changes the VIEW, never the signed credentials.
const isGuestView=()=>window.LoSP_SESSION?.ok===true&&
  window.LoSP_SESSION.role==="guest";
function guestAllianceKeys(){
  const list=window.LoSP_SESSION?.allowedAlliances;
  if(!Array.isArray(list))return [];
  return [...new Set(list.filter(k=>typeof k==="string"&&
    /^[a-z][a-z0-9-]{1,63}$/.test(k)))].sort();
}
function signedSession(){
  try{
    const value=localStorage.getItem("losp_session")||"";
    return /^v1\.[A-Za-z0-9_-]{12,4096}\.[A-Za-z0-9_-]{40,80}$/.test(value)?
      value:"";
  }catch{return "";}
}
// The admin view combines two separately authorized sources. The public
// LoSP history stays public; guests always require real signed credentials.
const isAdminView=()=>window.LoSP_SESSION?.ok===true&&
  window.LoSP_SESSION.role==="admin";
function mergeArenaHistories(losp,guest){
  if(!Array.isArray(losp?.snapshots)||!Array.isArray(guest?.snapshots))
    throw Error("Historique Arène invalide.");
  const byDay=new Map();
  for(const source of [losp,guest]){
    for(const snap of source.snapshots){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(snap?.date||"")||
         !Array.isArray(snap.players))continue;
      if(!byDay.has(snap.date)){
        byDay.set(snap.date,{date:snap.date,sourceDay:snap.sourceDay,
          attribution:snap.attribution,players:[]});
      }
      const target=byDay.get(snap.date),seen=new Set(
        target.players.map(p=>p.alliance+"\u0000"+p.name));
      for(const p of snap.players){
        const identity=p?.alliance+"\u0000"+p?.name;
        if(!p||typeof p.name!=="string"||typeof p.alliance!=="string"||
           seen.has(identity))continue;
        seen.add(identity);target.players.push(p);
      }
    }
  }
  return {status:"ok",snapshots:[...byDay.values()]
    .sort((a,b)=>a.date.localeCompare(b.date))};
}
const HISTORY_INDEX="./data/arena-history/index.json";
const SNAPSHOT_BASE="./data/arena-history/";
const LIVE_API="https://losp-roster-service.deliriousfan7.workers.dev/api/public/arena-snapshot";
async function readJson(url){
  const response=await fetch(url,{mode:"cors",cache:"no-cache"});
  if(!response.ok)throw Error("Historique Arène indisponible (HTTP "+response.status+").");
  return response.json();
}
async function readArchiveIndex(){
  const index=await readJson(HISTORY_INDEX);
  if(index?.version!==1||!Array.isArray(index.snapshots))
    throw Error("Index permanent Arène invalide.");
  const days=new Set();
  for(const entry of index.snapshots){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(entry?.date||"")||
       entry.file!=="snapshots/"+entry.date+".json"||days.has(entry.date))
      throw Error("Index permanent Arène invalide.");
    days.add(entry.date);
  }
  S.archiveIndex=index;
  return index;
}
async function readArchivePoint(entry){
  const point=await readJson(SNAPSHOT_BASE+entry.file);
  if(point?.version!==1||point.date!==entry.date||
     !Array.isArray(point.players))throw Error("Relevé Arène invalide.");
  return point;
}
async function readLiveArena(day){
  try{
    const data=await readJson(LIVE_API+"?date="+encodeURIComponent(day));
    if(data?.status==="complete"&&data.snapshot?.date===day)return data.snapshot;
  }catch{/* A missing or incomplete live receipt never becomes an Arena point. */}
  return null;
}
async function readArenaAPI(all=false){
  const index=await readArchiveIndex(),entries=index.snapshots;
  const selected=all?entries:entries.slice(-2),snapshots=[];
  if(all){
    for(let i=0;i<selected.length;i+=8)
      snapshots.push(...await Promise.all(selected.slice(i,i+8).map(readArchivePoint)));
  }else snapshots.push(...await Promise.all(selected.map(readArchivePoint)));
  const today=new Date().toISOString().slice(0,10);
  const live=await readLiveArena(today);
  if(live&&!snapshots.some(point=>point.date===live.date))snapshots.push(live);
  return {kind:"permanent-arena-history",status:"ok",snapshots,
    archiveDates:entries.length};
}
function mapSourceAlliances(data){
  S.sourceAlliances.clear();
  const votes=new Map();
  for(const snap of data?.snapshots||[]){
    for(const player of snap?.players||[]){
      const raw=norm(player?.alliance);
      if(!raw||knownKey(player.alliance))continue;
      const info=S.infos.get(norm(canonical(player.name)));
      const real=knownKey(info?.alliance);
      if(!real)continue;
      if(!votes.has(raw))votes.set(raw,new Map());
      const count=votes.get(raw);
      count.set(real,(count.get(real)||0)+1);
    }
  }
  for(const [raw,count] of votes){
    const ordered=[...count].sort((a,b)=>b[1]-a[1]);
    // Require two matching names and a unique majority. No guesses based
    // on color strings, icon codes, or hardcoded alliance fingerprint lists.
    if(ordered[0]?.[1]>=2&&ordered[0][1]>(ordered[1]?.[1]||0))
      S.sourceAlliances.set(raw,ordered[0][0]);
  }
}
// The secure Worker returns only media for explicitly approved tenants.
// Keep profiles keyed by alliance + player, never by name alone: different
// invited groups (or LoSP) may contain a player with the same name.
function loadGuestProfiles(data){
  S.guestProfiles.clear();
  S.guestKeys.clear();
  const names=Array.isArray(data?.guestAlliances)?data.guestAlliances:
    Array.isArray(data?.alliances)?data.alliances:[];
  for(const k of names){
    if(typeof k==="string"&&/^[a-z][a-z0-9-]{1,63}$/.test(k))
      S.guestKeys.add(k);
  }
  const rows=Array.isArray(data?.guestProfiles)?data.guestProfiles:
    Array.isArray(data?.profiles)?data.profiles:[];
  for(const item of rows){
    const alliance=item?.alliance,name=item?.name;
    if(!S.guestKeys.has(alliance)||typeof name!=="string"||!name.trim())continue;
    const normalized=norm(canonical(name));
    const icon=safeAsset(item.icon),frame=safeAsset(item.frame);
    if(normalized&&(icon||frame))S.guestProfiles.set(alliance+":"+normalized,
      {icon,frame});
  }
}
function avatar(profile){
  const icon=safeAsset(profile?.icon),frame=safeAsset(profile?.frame);
  const wrap=document.createElement("div");wrap.className="arenaAvatar";
  if(frame){
    const image=document.createElement("img");image.src=frame;
    image.className="arenaAvatarFrame";image.alt="";
    image.loading="lazy";image.decoding="async";wrap.append(image);
  }
  if(icon){
    const image=document.createElement("img");image.src=icon;
    image.className="arenaAvatarIcon";image.alt="";
    image.loading="lazy";image.decoding="async";wrap.append(image);
  }
  if(!frame&&!icon)wrap.append(make("span","?", "arenaAvatarFallback"));
  wrap.setAttribute("aria-hidden","true");
  return wrap;
}
const date=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)?
  s.slice(8)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"Date inconnue";
function make(tag,value,cls){
  const el=document.createElement(tag);el.textContent=value;
  if(cls)el.className=cls;return el;
}
function opt(value,labelText){
  const el=make("option",labelText);el.value=value;return el;
}
function canonical(s){
  let current=plainName(s),seen=new Set();
  for(let i=0;i<12;i++){
    const n=norm(current);
    if(!n||seen.has(n))break;
    seen.add(n);if(!S.aliases[n])break;
    current=S.aliases[n];
  }
  return current;
}
function readSnapshots(data){
  if(!Array.isArray(data?.snapshots))throw Error("historique invalide");
  const sources=data.snapshots.filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||"")&&Array.isArray(x.players));
  const identityByName=new Map(),ambiguous=new Set();
  for(const source of sources)for(const p of source.players){
    if(typeof p?.playerId!=="string"||!/^p_[a-f0-9]{64}$/.test(p.playerId))continue;
    const name=canonical(p.name),alliance=resolveAlliance(p.allianceKey||p.alliance,name),
      key=alliance+"\u0000"+norm(name);
    if(!name||!alliance||ambiguous.has(key))continue;
    const previous=identityByName.get(key);
    if(previous&&previous!==p.playerId){identityByName.delete(key);ambiguous.add(key);}
    else identityByName.set(key,p.playerId);
  }
  return sources.map(source=>{
      const seen=new Set(),players=[];
      for(const p of source.players){
        const name=canonical(p?.name),a=resolveAlliance(p?.allianceKey||p?.alliance,name),
          r=p?.arenaRank,baseId=norm(name),guest=S.guestKeys.has(a);
        if(!name||!a||!baseId||!Number.isSafeInteger(r)||r<1||
           (!S.publicArchive&&!window.LoSPAccess?.isAllianceAllowed(a)))continue;
        const unique=a+":"+baseId,legacy=a+"\u0000"+baseId,
          id=typeof p?.playerId==="string"?p.playerId:
            identityByName.get(legacy)||p?.playerKey||(guest?unique:baseId);
        if(seen.has(id))continue;
        seen.add(id);
        const inline=guest?{
          icon:safeAsset(p.icon),frame:safeAsset(p.frame)}:null;
        const profile=guest?(
          S.guestProfiles.get(unique)||
          (inline.icon||inline.frame?inline:null)):
          S.infos.get(baseId)||null;
        players.push({id,name,alliance:a,arenaRank:r,
          observedAt:p.observedAt||null,profile,playerKey:id});
      }
      return {date:source.date,sourceDay:source.sourceDay,
        sourceCampaign:source.sourceCampaign||null,campaignId:source.campaignId||null,
        sourceKind:source.sourceKind||null,provenance:Array.isArray(source.provenance)?
          source.provenance:[],attribution:source.attribution,players};
    }).filter(s=>s.players.length).sort((a,b)=>a.date.localeCompare(b.date));
}
function newest(){return S.snapshots.at(-1)||null;}
function rebuildPeople(){
  S.people.clear();
  for(const snap of S.snapshots)
    for(const p of snap.players)S.people.set(p.id,p);
}
function knownAlliances(){
  const declared=window.LoSPAlliances?.getKnownAlliances()||[];
  const allowed=x=>S.publicArchive||window.LoSPAccess?.isAllianceAllowed(x);
  const used=new Set([...S.people.values()].map(x=>x.alliance));
  return [...declared.filter(x=>allowed(x.key)&&used.delete(x.key)),
    ...[...used].filter(allowed).map(k=>({key:k,name:k}))];
}
function updateRankingFilterSummary(){
  const enabled=[...rankingFilters].filter(([,input])=>input.checked);
  const summary=$("rankingAllianceSummaryText");
  summary.textContent=enabled.length===rankingFilters.size?"Toutes les alliances":
    enabled.length===0?"Aucune alliance sélectionnée":
    enabled.length===1?label(enabled[0][0]):
    enabled.length+" alliances sélectionnées";
}
function setupFilters(){
  const alliances=knownAlliances();
  const host=$("rankingAllianceFilters");
  host.replaceChildren();
  rankingFilters.clear();
  for(const alliance of alliances){
    const meta=window.LoSPAlliances?.getAllianceMeta(alliance.key);
    const toggle=document.createElement("label");
    toggle.className="filterToggle";
    const input=document.createElement("input");
    input.type="checkbox";
    input.checked=true;
    input.dataset.allianceKey=alliance.key;
    const stack=document.createElement("span");
    stack.className="fStack";
    const name=make("span",meta?.name||alliance.name||"Alliance non identifiée","fName");
    window.LoSPAlliances?.renderAllianceName?.(name, alliance.key);
    stack.append(make("span",meta?.emoji||"","fEmoji"), name);
    toggle.append(input,stack);
    host.append(toggle);
    rankingFilters.set(alliance.key,input);
    input.addEventListener("change",()=>{
      updateRankingFilterSummary();
      fillRanking();
    });
  }
  updateRankingFilterSummary();
  $("historyAlliance").replaceChildren(opt("all","Toutes les alliances"),
    ...alliances.map(a=>opt(a.key,label(a.key))));
  setupPeople();
}
function setupPeople(){
  const choices=[...S.people.values()].filter(p=>
    ($("historyAlliance").value==="all"||p.alliance===$("historyAlliance").value)&&
    !S.selected.includes(p.id)).sort((a,b)=>cmp.compare(a.name,b.name));
  const select=$("historyPlayer"),before=select.value;
  select.replaceChildren(opt("","Choisir un joueur"),...choices.map(p=>
    opt(p.id,p.name)));
  if(choices.some(p=>p.id===before))select.value=before;
  $("addPlayer").disabled=!select.value||S.selected.length>=4;
}
function fillSummary(){
  const current=newest();$("arenaSummary").hidden=!current;
  if(!current)return;
  $("arenaLatestDate").textContent=S.fallback?"Date non vérifiée":date(current.date);
  $("arenaPlayerCount").textContent=String(current.players.length);
  $("arenaDateCount").textContent=S.fallback?"Indisponible":S.snapshots.length+" date(s)";
  const captured=(current.provenance||[]).map(x=>Date.parse(x.capturedAt))
    .filter(Number.isFinite);
  const first=captured.length?new Date(Math.min(...captured)).toISOString().slice(11,16):null;
  const last=captured.length?new Date(Math.max(...captured)).toISOString().slice(11,16):null;
  $("rankingSource").textContent=S.fallback?
    "Classement actuel — date non vérifiée":
    current.attribution==="backdated-from-first-next-day-collection"?
    "Classement initial du "+date(current.date):
    current.attribution==="cloudflare-arena-reward-collection"?
      "Collecte Cloudflare le "+date(current.date)+" après 16h01 UTC"+
        (last?" · "+(first===last?last:first+"–"+last)+" UTC":""):
      "Classement du "+date(current.date)+
        (S.snapshots.length>1?" et comparatif avec le relevé précédent":"");
}
function fillRanking(){
  const host=$("rankingList");host.replaceChildren();
  const current=newest();if(!current)return;
  const rows=current.players.filter(p=>rankingFilters.get(p.alliance)?.checked!==false)
    .sort((a,b)=>a.arenaRank-b.arenaRank||cmp.compare(a.name,b.name));
  const previousSnapshot=S.fallback?null:S.snapshots.at(-2);
  const previous=new Map((previousSnapshot?.players||[])
    .map(p=>[p.id,p.arenaRank]));
  if(!rows.length)host.append(make("p","Aucun joueur classé.","arenaHint"));
  let lastRank=null;
  for(const p of rows){
    const line=document.createElement("article");line.className="arenaRankRow";
    const rankText=p.arenaRank===lastRank?"—":"#"+p.arenaRank;
    lastRank=p.arenaRank;
    line.append(make("strong",rankText,"arenaPosition"));
    line.append(avatar(p.profile));
    const info=document.createElement("div");info.className="arenaRankIdentity";
    info.append(make("strong",p.name,"arenaRankName"));
    const sub=make("small",label(p.alliance),"arenaRankAlliance");
    const meta=window.LoSPAlliances?.getAllianceMeta?.(p.alliance);
    if(meta?.nameColor||meta?.displayParts?.length===2)
      window.LoSPAlliances?.renderAllianceName?.(sub,p.alliance);
    sub.style.setProperty("--alliance-color",color(p.alliance));info.append(sub);
    line.append(info);
    const prior=previous.get(p.id),delta=make("span","—","arenaDelta");
    if(prior){
      const diff=prior-p.arenaRank;
      delta.textContent=diff>0?"▲ "+diff:diff<0?"▼ "+(-diff):"—";
      delta.classList.add(diff>0?"arenaBetter":diff<0?"arenaWorse":"arenaNeutral");
      delta.title=previousSnapshot?.attribution==="backdated-from-first-next-day-collection"?
        "Écart depuis le relevé réel du "+date(previousSnapshot.sourceDay)+" matin":
        "Écart depuis le relevé du "+date(previousSnapshot?.date);
    }
    line.append(delta);host.append(line);
  }
}
async function switchTab(tab){
  const ranking=tab==="rank";
  $("panelRanking").hidden=!ranking;$("panelHistory").hidden=ranking;
  $("tabRanking").classList.toggle("isActive",ranking);
  $("tabHistory").classList.toggle("isActive",!ranking);
  $("tabRanking").setAttribute("aria-selected",String(ranking));
  $("tabHistory").setAttribute("aria-selected",String(!ranking));
  if(!ranking&&!S.historyLoaded){
    $("arenaStatus").hidden=false;
    $("arenaStatus").textContent="Chargement de l’historique complet…";
    try{
      const data=await readArenaAPI(true);
      S.snapshots=readSnapshots(data);S.historyLoaded=true;
      rebuildPeople();setupFilters();fillSummary();fillRanking();fillSelected();
      $("arenaStatus").hidden=true;
    }catch(error){
      $("arenaStatus").hidden=false;
      $("arenaStatus").textContent=error instanceof Error?
        error.message:"Historique Arène indisponible.";
    }
  }
  if(!ranking)fillChart();
}
function fillSelected(){
  const target=$("selectedPlayers");target.replaceChildren();
  S.selected.forEach((id,i)=>{
    const p=S.people.get(id);if(!p)return;
    const chip=make("span",p.name,"arenaSelectedChip");
    chip.style.setProperty("--series-color",COLORS[i]);
    const remove=make("button","×","arenaRemove");remove.type="button";
    remove.setAttribute("aria-label","Retirer "+p.name);
    remove.addEventListener("click",()=>{
      S.selected=S.selected.filter(x=>x!==id);
      fillSelected();fillChart();
    });
    chip.append(remove);target.append(chip);
  });
  setupPeople();
}
function sv(tag,attrs,textValue){
  const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
  for(const [k,v] of Object.entries(attrs||{}))el.setAttribute(k,String(v));
  if(textValue!==undefined)el.textContent=textValue;return el;
}
function fillChart(){
  const chart=$("arenaChart"),leg=$("chartLegend"),details=$("historyDetails");
  chart.replaceChildren();leg.replaceChildren();details.replaceChildren();
  const snaps=S.fallback?[]:S.snapshots;
  $("chartEmpty").hidden=snaps.length>0&&S.selected.length>0;
  if(!snaps.length||!S.selected.length)return;
  const height=320,left=52,right=34,top=20,bottom=54;
  // Fit all dates into the visible mobile card while they remain readable.
  // Only a long history creates a scrollable horizontal chart.
  const viewport=Math.ceil(chart.parentElement?.clientWidth||0);
  const minWidth=snaps.length<=7?0:
    left+right+(snaps.length-1)*40+8;
  const width=Math.max(viewport||320,minWidth);
  const plot=width-left-right,vertical=height-top-bottom;
  chart.setAttribute("viewBox","0 0 "+width+" "+height);chart.style.width=width+"px";
  const values=snaps.flatMap(s=>s.players.filter(p=>S.selected.includes(p.id))
    .map(p=>p.arenaRank));
  const max=Math.max(20,Math.ceil(Math.max(1,...values)*1.08/10)*10);
  const x=i=>left+(snaps.length===1?plot/2:i*plot/(snaps.length-1));
  const y=rank=>top+(rank-1)/(max-1)*vertical;
  for(let i=0;i<=4;i++){
    const value=1+(max-1)*i/4,yy=y(value);
    chart.append(sv("line",{x1:left,y1:yy,x2:width-right,y2:yy,
      stroke:"#667087","stroke-opacity":.55,"stroke-dasharray":"4 5"}));
    chart.append(sv("text",{x:left-9,y:yy+4,fill:"#ccd4e6",
      "text-anchor":"end","font-size":13},String(Math.round(value))));
  }
  const dateFontSize=snaps.length>1&&plot/(snaps.length-1)<36?11:13;
  snaps.forEach((s,i)=>chart.append(sv("text",{x:x(i),y:height-25,
    fill:"#cdd7eb","text-anchor":"middle","font-size":dateFontSize},date(s.date).slice(0,5))));
  S.selected.forEach((id,i)=>{
    const p=S.people.get(id);if(!p)return;
    const records=snaps.map((s,n)=>({n,p:s.players.find(q=>q.id===id)}))
      .filter(r=>r.p),tone=COLORS[i];
    const segments=[];let group=[],last=-2;
    for(const r of records){
      if(r.n!==last+1&&group.length){segments.push(group);group=[];}
      group.push(r);last=r.n;
    }
    if(group.length)segments.push(group);
    for(const segment of segments){
      if(segment.length>1)chart.append(sv("polyline",{
        points:segment.map(r=>x(r.n)+","+y(r.p.arenaRank)).join(" "),
        fill:"none",stroke:tone,"stroke-width":3.5,
        "stroke-linecap":"round","stroke-linejoin":"round"}));
    }
    for(const r of records){
      const circle=sv("circle",{cx:x(r.n),cy:y(r.p.arenaRank),r:6,
        stroke:"#091527","stroke-width":2,fill:tone});
      circle.append(sv("title",{},p.name+" : rang "+r.p.arenaRank+
        " le "+date(snaps[r.n].date)));
      chart.append(circle);
    }
    const item=make("span",p.name,"arenaLegendItem");
    item.style.setProperty("--series-color",tone);leg.append(item);
  });
  details.append(make("h3","Rangs par date","arenaBlockTitle"));
  for(const s of snaps){
    const row=document.createElement("div");row.className="arenaHistoryLine";
    const captured=(s.provenance||[]).map(x=>Date.parse(x.capturedAt))
      .filter(Number.isFinite);
    const first=captured.length?new Date(Math.min(...captured)).toISOString().slice(11,16):null;
    const last=captured.length?new Date(Math.max(...captured)).toISOString().slice(11,16):null;
    row.append(make("strong",date(s.date)));
    if(s.attribution==="cloudflare-arena-reward-collection")
      row.append(make("small",captured.length+" alliances · "+
        (first===last?first:first+"–"+last)+" UTC","arenaProvenance"));
    else if(s.sourceDay)
      row.append(make("small","Source "+date(s.sourceDay),"arenaProvenance"));
    const scores=S.selected.map(id=>{
      const p=s.players.find(q=>q.id===id);
      return p?(S.people.get(id)?.name||p.name)+" : #"+p.arenaRank:null;
    }).filter(Boolean);
    row.append(make("span",scores.join(" · ")||"Non relevé"));
    details.append(row);
  }
}
async function load(){
  // The Discord-auth guard has to resolve first, including admin preview.
  // Never guess guest permissions from the URL or the selected filter.
  try{await window.LoSP_AUTH_READY;}catch{/* Auth errors fail closed below. */}
  const guest=isGuestView();
  try{
    await window.LoSPAlliances?.loadAlliances();
    const res=await fetch("./data/player-aliases.json",{cache:"no-store"});
    if(res.ok){
      const entries=(await res.json()).aliases||{};
      for(const [from,to] of Object.entries(entries))S.aliases[norm(from)]=to;
    }
  }catch{/* Aliases are optional; ranks are not invented. */}
  // Share the exact Infos reader used by the rest of the WebApp.
  // It filters public LoSP rows and requests guest rows only through the
  // signed Discord session. Arena ranks still come exclusively from R2.
  let infoRows=null,sharedInfos=[];
  try{
    if(window.LoSPAllianceData?.load){
      const result=await window.LoSPAllianceData.load({infos:true});
      sharedInfos=result.infos||[];
      infoRows=sharedInfos.filter(row=>
        window.LoSPAlliances?.getAllianceMeta(row?.alliance)?.group==="losp");
    }else if(!guest){
      // Preserve the pre-existing public LoSP fallback if the shared
      // reader script cannot load.
      const infos=await fetch("./data/infos.json",{cache:"no-store"});
      if(infos.ok)infoRows=await infos.json();
      sharedInfos=Array.isArray(infoRows)?infoRows:[];
    }
    for(const row of sharedInfos){
      const alliance=knownKey(row?.alliance),id=norm(canonical(row?.name));
      if(!alliance||!id||!window.LoSPAccess?.isAllianceAllowed(alliance))continue;
      if(window.LoSPAlliances?.getAllianceMeta(alliance)?.group==="losp"&&
         !S.infos.has(id))S.infos.set(id,row);
    }
  }catch{/* Historical ranks remain available when Infos cannot be loaded. */}
  try{
    const data=await readArenaAPI(false);
    loadGuestProfiles(data);
    // Prefer the common authorized Infos source for guest portraits too.
    // Scope every identity to its alliance to avoid cross-tenant collisions.
    for(const row of sharedInfos){
      const alliance=knownKey(row?.alliance),id=norm(canonical(row?.name));
      if(!alliance||!id||!S.guestKeys.has(alliance)||
         !window.LoSPAccess?.isAllianceAllowed(alliance))continue;
      const icon=safeAsset(row.icon),frame=safeAsset(row.frame);
      if(icon||frame)S.guestProfiles.set(alliance+":"+id,{icon,frame});
    }
    if(data.guestWarning){
      $("arenaStatus").hidden=false;
      $("arenaStatus").textContent="Alliances invitées non chargées : "+
        data.guestWarning;
    }
    mapSourceAlliances(data);
    S.snapshots=readSnapshots(data);
    S.historyLoaded=(data?.archiveDates||0)<=2;
    if(!S.snapshots.length)throw Error("Aucun relevé permanent complet");
    // Le chargement réussi ne nécessite aucun bandeau permanent.
    // Conserver le même élément pour signaler un éventuel repli ou une erreur.
    if(!data.guestWarning)$("arenaStatus").hidden=true;
  }catch(error){
    $( "arenaStatus" ).hidden=false;
    $("arenaStatus").textContent=error instanceof Error?
      error.message:"Historique Arène indisponible.";
    return;
  }
  rebuildPeople();setupFilters();fillSummary();fillRanking();
  const top=[...(newest()?.players||[])].sort((a,b)=>a.arenaRank-b.arenaRank);
  S.selected=[...new Set(top.map(p=>p.id))].slice(0,2);
  fillSelected();fillChart();
}
$("tabRanking").addEventListener("click",()=>switchTab("rank"));
$("tabHistory").addEventListener("click",()=>switchTab("history"));
$("historyAlliance").addEventListener("change",setupPeople);
$("historyPlayer").addEventListener("change",setupPeople);
window.addEventListener("resize",()=>{
  if(!$("panelHistory").hidden)fillChart();
});
$("addPlayer").addEventListener("click",()=>{
  const id=$("historyPlayer").value;
  if(!id||!S.people.has(id)||S.selected.includes(id)||S.selected.length>=4)return;
  S.selected.push(id);fillSelected();fillChart();
});
void load();
})();
