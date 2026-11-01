// LoSP Arène: static, mobile-first, no charting framework.
(()=>{
"use strict";
const API="https://losp-roster-service.deliriousfan7.workers.dev/api/public/arena-history";
const COLORS=["#65b8ff","#f9a44e","#b29aff","#53dfaa"];
const $=id=>document.getElementById(id);
const S={snapshots:[],aliases:{},people:new Map(),selected:[],fallback:false};
const cmp=new Intl.Collator("fr",{numeric:true,sensitivity:"base"});
const norm=s=>String(s||"").replace(/<[^>]*>/g,"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const key=s=>window.LoSPAlliances?.getAllianceKey(s)||norm(s);
const label=s=>window.LoSPAlliances?.getAllianceLabel(s)||s;
const color=s=>window.LoSPAlliances?.getAllianceMeta(s)?.color||"#84beff";
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
  let current=String(s||"").trim(),seen=new Set();
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
  return data.snapshots.filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||"")&&Array.isArray(x.players))
    .map(source=>{
      const seen=new Set(),players=[];
      for(const p of source.players){
        const name=canonical(p?.name),a=key(p?.alliance),r=p?.arenaRank,id=norm(name);
        if(!name||!a||!id||!Number.isSafeInteger(r)||r<1)continue;
        const unique=a+":"+id;if(seen.has(unique))continue;
        seen.add(unique);
        players.push({id,name,alliance:a,arenaRank:r,observedAt:p.observedAt||null});
      }
      return {date:source.date,sourceDay:source.sourceDay,
        attribution:source.attribution,players};
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
  const used=new Set([...S.people.values()].map(x=>x.alliance));
  return [...declared.filter(x=>used.delete(x.key)),
    ...[...used].map(k=>({key:k,name:k}))];
}
function setupFilters(){
  const alliances=knownAlliances();
  $("rankingAlliance").replaceChildren(opt("all","Toutes les alliances"),
    ...alliances.map(a=>opt(a.key,a.name)));
  $("historyAlliance").replaceChildren(opt("all","Toutes les alliances"),
    ...alliances.map(a=>opt(a.key,a.name)));
  setupPeople();
}
function setupPeople(){
  const choices=[...S.people.values()].filter(p=>
    ($("historyAlliance").value==="all"||p.alliance===$("historyAlliance").value)&&
    !S.selected.includes(p.id)).sort((a,b)=>cmp.compare(a.name,b.name));
  const select=$("historyPlayer"),before=select.value;
  select.replaceChildren(opt("","Choisir un joueur"),...choices.map(p=>
    opt(p.id,p.name+" — "+label(p.alliance))));
  if(choices.some(p=>p.id===before))select.value=before;
  $("addPlayer").disabled=!select.value||S.selected.length>=4;
}
function fillSummary(){
  const current=newest();$("arenaSummary").hidden=!current;
  if(!current)return;
  $("arenaLatestDate").textContent=S.fallback?"Date non vérifiée":date(current.date);
  $("arenaPlayerCount").textContent=String(current.players.length);
  $("arenaDateCount").textContent=S.fallback?"Indisponible":S.snapshots.length+" date(s)";
  $("rankingSource").textContent=S.fallback?
    "Aperçu non daté depuis infos.json : la collecte après récompenses n'est pas vérifiée.":
    current.attribution==="backdated-from-first-next-day-collection"?
    "Point initial réattribué : source réelle du "+date(current.sourceDay)+" matin.":
    "Relevé après récompenses du "+date(current.date)+" ; source R2 vérifiée.";
}
function fillRanking(){
  const host=$("rankingList");host.replaceChildren();
  const current=newest();if(!current)return;
  const alliance=$("rankingAlliance").value;
  const rows=current.players.filter(p=>alliance==="all"||p.alliance===alliance)
    .sort((a,b)=>a.arenaRank-b.arenaRank||cmp.compare(a.name,b.name));
  const previous=new Map((S.fallback?[]:(S.snapshots.at(-2)?.players||[]))
    .map(p=>[p.id,p.arenaRank]));
  if(!rows.length)host.append(make("p","Aucun joueur classé.","arenaHint"));
  for(const p of rows){
    const line=document.createElement("article");line.className="arenaRankRow";
    line.append(make("strong","#"+p.arenaRank,"arenaPosition"));
    const info=document.createElement("div");info.className="arenaRankIdentity";
    info.append(make("strong",p.name,"arenaRankName"));
    const sub=make("small",label(p.alliance),"arenaRankAlliance");
    sub.style.setProperty("--alliance-color",color(p.alliance));info.append(sub);
    line.append(info);
    const prior=previous.get(p.id),delta=make("span","—","arenaDelta");
    if(prior){
      const diff=prior-p.arenaRank;
      delta.textContent=diff>0?"▲ "+diff:diff<0?"▼ "+(-diff):"—";
      delta.classList.add(diff>0?"arenaBetter":diff<0?"arenaWorse":"arenaNeutral");
      delta.title="Évolution depuis le point précédent";
    }
    line.append(delta);host.append(line);
  }
}
function switchTab(tab){
  const ranking=tab==="rank";
  $("panelRanking").hidden=!ranking;$("panelHistory").hidden=ranking;
  $("tabRanking").classList.toggle("isActive",ranking);
  $("tabHistory").classList.toggle("isActive",!ranking);
  $("tabRanking").setAttribute("aria-selected",String(ranking));
  $("tabHistory").setAttribute("aria-selected",String(!ranking));
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
  const width=Math.max(640,75*snaps.length+80),height=320,
    left=52,right=22,top=20,bottom=54,plot=width-left-right,vertical=height-top-bottom;
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
  snaps.forEach((s,i)=>chart.append(sv("text",{x:x(i),y:height-25,
    fill:"#cdd7eb","text-anchor":"middle","font-size":13},date(s.date).slice(0,5))));
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
    row.append(make("strong",date(s.date)));
    const scores=S.selected.map(id=>{
      const p=s.players.find(q=>q.id===id);
      return p?(S.people.get(id)?.name||p.name)+" : #"+p.arenaRank:null;
    }).filter(Boolean);
    row.append(make("span",scores.join(" · ")||"Non relevé"));
    if(s.attribution==="backdated-from-first-next-day-collection")
      row.append(make("small","Mesuré le "+date(s.sourceDay)+" matin"));
    details.append(row);
  }
}
async function load(){
  try{
    await window.LoSPAlliances?.loadAlliances();
    const res=await fetch("./data/player-aliases.json",{cache:"no-store"});
    if(res.ok){
      const entries=(await res.json()).aliases||{};
      for(const [from,to] of Object.entries(entries))S.aliases[norm(from)]=to;
    }
  }catch{/* Aliases are optional; ranks are not invented. */}
  try{
    const r=await fetch(API,{mode:"cors",cache:"no-store"});
    if(!r.ok)throw Error("R2 indisponible");
    S.snapshots=readSnapshots(await r.json());
    if(!S.snapshots.length)throw Error("Aucun relevé complet");
    $("arenaStatus").textContent="Relevés vérifiés — historique glissant de 30 jours.";
    $("arenaStatus").classList.add("arenaReady");
  }catch{
    // Fallback is visibly UNDATED and never contributes to a historical line.
    try{
      const r=await fetch("./data/infos.json",{cache:"no-store"});
      if(!r.ok)throw Error("Infos indisponibles");
      const rows=await r.json();
      S.snapshots=readSnapshots({snapshots:[{
        date:"2026-11-01",attribution:"fallback-unverified",
        players:rows.map(p=>({name:p.name,alliance:p.alliance,arenaRank:p.latestArena}))
      }]});
      S.fallback=true;
      $("arenaStatus").textContent="Historique R2 inaccessible : aperçu des derniers Infos publiés (date non vérifiée).";
    }catch{
      $("arenaStatus").textContent="Données Arène indisponibles.";return;
    }
  }
  rebuildPeople();setupFilters();fillSummary();fillRanking();
  const top=[...(newest()?.players||[])].sort((a,b)=>a.arenaRank-b.arenaRank);
  S.selected=[...new Set(top.map(p=>p.id))].slice(0,2);
  fillSelected();fillChart();
}
$("tabRanking").addEventListener("click",()=>switchTab("rank"));
$("tabHistory").addEventListener("click",()=>switchTab("history"));
$("rankingAlliance").addEventListener("change",fillRanking);
$("historyAlliance").addEventListener("change",setupPeople);
$("historyPlayer").addEventListener("change",setupPeople);
$("addPlayer").addEventListener("click",()=>{
  const id=$("historyPlayer").value;
  if(!id||!S.people.has(id)||S.selected.includes(id)||S.selected.length>=4)return;
  S.selected.push(id);fillSelected();fillChart();
});
void load();
})();
