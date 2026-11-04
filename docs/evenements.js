/* LoSP événements : affichage uniquement de l'archive locale, aucun appel Scopely.
   Source actuelle : ./data/evenements-snapshot.json, pages 1 et 2 (150 entrées).
   Page autonome et sans bibliothèque externe. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const TIMEZONE='Europe/Paris';
  const TYPES={milestone:'Jalons',episodic:'Campagne / événement',raid:'Raid',blitz:'Blitz',battlePass:'Passe de combat',strikePass:'Passe S.T.R.I.K.E.',pickYourPoison:'Épreuve',info:'Informations',raidSeason:'Saison de raid',warSeason:'Saison de guerre',donation:'Dons'};
  const EMOJI={milestone:'🏆',episodic:'⚔️',raid:'🛡️',blitz:'⚡',battlePass:'🎖️',strikePass:'🎫',pickYourPoison:'🔥',info:'✦',raidSeason:'🛡️',warSeason:'⚔️',donation:'🤝'};
  const LIMIT={future:6,current:8,past:8};
  const SECTIONS={future:'À venir',current:'En cours',past:'Passés'};
  const state={events:[],metadata:{},verifiedDetails:{},date:null,manualDate:false,search:'',type:'',includeSecondary:false,expanded:new Set(),lastButton:null};
  const fmtDate=new Intl.DateTimeFormat('fr-FR',{timeZone:TIMEZONE,day:'numeric',month:'short',year:'numeric'});
  const fmtNumber=new Intl.NumberFormat('fr-FR');
  const now=()=>Date.now();
  function create(tag,className,content){const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;}
  function strip(value){return String(value??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();}
  function cleanImage(url){return typeof url==='string'&&/^https:\/\/assets\.marvelstrikeforce\.com\/(?:key_art|imgs)\/[\w.%-]+\.(?:png|jpg|jpeg|webp)$/i.test(url)?url:'';}
  function dateLabel(ts){return Number.isFinite(ts)?fmtDate.format(new Date(ts*1000)):'Date inconnue';}
  function timestamp(){if(!state.manualDate)return now();const d=state.date;return new Date(d+'T12:00:00').getTime();}
  function localToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function dayLabel(t){return new Intl.DateTimeFormat('fr-FR',{timeZone:TIMEZONE,day:'2-digit',month:'short'}).format(new Date(t*1000));}
  function category(e,t){return e.startTime*1000>t?'future':e.endTime*1000<=t?'past':'current';}
  function secondary(e){return Array.isArray(e.locationHints)&&(e.locationHints.includes('lohub_feeder')||e.locationHints.includes('mercy_orb'));}
  function artwork(e){for(const img of [e.cardArt,e.popupArt,e.icon,...(Array.isArray(e.hubArt)?e.hubArt:[])]){const url=cleanImage(img);if(url)return url;}return '';}
  function eventTitle(e){return strip(e.name)||'Événement sans titre';}
  function eventSub(e){return strip(e.subName||e.details||'');}
  function durationDays(ms){return Math.max(0,Math.ceil(ms/86400000));}
  function relative(e,group,reference){
    if(group==='future')return `Débute dans ${durationDays(e.startTime*1000-reference)} j`;
    if(group==='current')return `Fin dans ${durationDays(e.endTime*1000-reference)} j`;
    return 'Terminé';
  }
  function filterEvents(){
    const match=state.search.trim().toLocaleLowerCase('fr');
    return state.events.filter(e=>{
      if(!state.includeSecondary&&secondary(e))return false;
      if(state.type&&e.type!==state.type)return false;
      return !match||[e.name,e.subName,e.details,e.id].some(v=>strip(v).toLocaleLowerCase('fr').includes(match));
    });
  }
  function groupEvents(){
    const reference=timestamp();const grouped={future:[],current:[],past:[]};
    for(const e of filterEvents())grouped[category(e,reference)].push(e);
    grouped.future.sort((a,b)=>a.startTime-b.startTime||eventTitle(a).localeCompare(eventTitle(b),'fr'));
    grouped.current.sort((a,b)=>a.endTime-b.endTime||eventTitle(a).localeCompare(eventTitle(b),'fr'));
    grouped.past.sort((a,b)=>b.endTime-a.endTime||eventTitle(a).localeCompare(eventTitle(b),'fr'));
    return {grouped,reference};
  }
  function cover(e){
    const wrap=create('div','ev-cover');const image=artwork(e);
    wrap.append(create('span','ev-cover-fallback',EMOJI[e.type]||'✦'));
    if(image){const img=create('img',image.includes('/imgs/')?'ev-icon-img':'');img.alt='';img.loading='lazy';img.decoding='async';img.src=image;img.addEventListener('error',()=>img.remove(),{once:true});wrap.append(img);}
    return wrap;
  }
  function makeCard(e,group,reference){
    const card=create('article','ev-card');card.append(cover(e));
    const body=create('div','ev-card-copy'),top=create('div','ev-card-top');
    top.append(create('span','ev-category',TYPES[e.type]||e.type));
    if(secondary(e))top.append(create('span','ev-tech-tag','Secondaire'));
    body.append(top,create('h3','',eventTitle(e)));
    const sub=eventSub(e);if(sub)body.append(create('p','ev-sub',sub));
    const dates=create('div','ev-dates');
    dates.append(create('span','',`${dayLabel(e.startTime)} → ${dayLabel(e.endTime)}`));body.append(dates);
    const bottom=create('div','ev-card-actions'),cta=create('button','ev-detail-btn','Détails  ›');
    cta.type='button';cta.addEventListener('click',()=>openDetail(e,cta));
    bottom.append(create('span','ev-relative',relative(e,group,reference)),cta);body.append(bottom);
    card.append(body);return card;
  }
  function emptyState(group){
    const holder=create('div','ev-empty');
    holder.append(create('p','ev-empty-emoji',group==='future'?'🌙':group==='current'?'🪐':'📚'));
    holder.append(create('h3','',group==='future'?'Aucun événement à venir dans cet extrait':group==='current'?'Aucun événement en cours':'Aucun événement passé'));
    let message=group==='future'?'Ce catalogue est un instantané historique : l’absence d’événements à venir dans ce fichier ne signifie pas qu’aucun n’est annoncé dans MSF.':'Essaie un autre filtre ou une autre date de référence.';
    if(state.search||state.type||state.includeSecondary)message='Modifie les filtres ou la date de référence pour afficher d’autres événements.';
    holder.append(create('p','',message));return holder;
  }
  function render(){
    const {grouped,reference}=groupEvents();
    for(const key of Object.keys(SECTIONS)){
      const items=grouped[key],host=$(`events-${key}`);host.replaceChildren();
      $(`count-${key}`).textContent=fmtNumber.format(items.length);
      $(`stat-${key}`).textContent=fmtNumber.format(items.length);
      const limit=state.expanded.has(key)?items.length:LIMIT[key];
      if(!items.length)host.append(emptyState(key));
      for(const item of items.slice(0,limit))host.append(makeCard(item,key,reference));
      const more=$(`more-${key}`);more.hidden=items.length<=LIMIT[key];
      more.textContent=state.expanded.has(key)?'Afficher moins':`Voir les ${fmtNumber.format(items.length-LIMIT[key])} autres`;
    }
    $('filter-context').textContent=state.manualDate?'Simulation au '+state.date.split('-').reverse().join('/'):'Classement selon les dates archivées, à l’instant présent.';
  }
  function listFor(parent,rows){const ul=create('ul','ev-detail-list');for(const row of rows){const li=create('li','');li.textContent=row;ul.append(li);}parent.append(ul);}
  function detailSection(parent,title){const section=create('section','ev-dialog-section');section.append(create('h3','',title));parent.append(section);return section;}
  function openDetail(e,trigger){
    state.lastButton=trigger;const dialog=$('event-dialog'),host=$('event-dialog-content');host.replaceChildren();
    const hero=create('div','ev-dialog-header'),art=artwork(e);
    if(art){const img=create('img');img.src=art;img.alt='';img.loading='lazy';hero.append(img);}
    const head=create('div','ev-dialog-headcopy');head.append(create('span','ev-category',TYPES[e.type]||e.type),create('h2','',eventTitle(e)));hero.append(head);
    const close=create('button','ev-dialog-close','×');close.type='button';close.setAttribute('aria-label','Fermer');close.addEventListener('click',()=>dialog.close());hero.append(close);host.append(hero);
    const body=create('div','ev-dialog-body');const info=create('div','ev-dialog-data');
    for(const [label,value] of [['Début',dateLabel(e.startTime)],['Fin',dateLabel(e.endTime)]]){const box=create('div');box.append(create('span','ev-dialog-label',label),create('strong','',value));info.append(box);}body.append(info);
    const description=strip(e.details||e.subName);if(description){const sec=detailSection(body,'Présentation');sec.append(create('p','',description));}
    const extra=state.verifiedDetails[e.id];if(extra){const sec=detailSection(body,'Paliers et récompenses vérifiés');sec.append(create('p','',`${extra.tiers} paliers · objectif final : ${extra.maxGoal} points.`));listFor(sec,extra.highlights);}
    const scoring=e.milestone?.scoring;const methods=Array.isArray(scoring?.methods)?scoring.methods:[];
    const caps=Array.isArray(scoring?.cappedScorings)?scoring.cappedScorings:[];
    if(methods.length){const sec=detailSection(body,'Méthodes de progression');listFor(sec,methods.map(x=>`${strip(x.description)||'Action'} : ${fmtNumber.format(x.points||0)} point(s)`));}
    if(caps.length){const sec=detailSection(body,'Objectifs plafonnés / sous-étapes');const rows=caps.flatMap(c=>(c.methods||[]).map(m=>`${strip(m.description)||'Action'} · ${fmtNumber.format(m.points||0)} pt(s) / action · plafond ${fmtNumber.format(c.cap||0)}${c.rewardTier?' · palier '+c.rewardTier:''}`));listFor(sec,rows);}
    const linked=state.events.filter(other=>other.id!==e.id&&eventTitle(other)===eventTitle(e)&&secondary(other)&&e.locationHints?.includes('lohub_wrapper'));
    if(linked.length){const sec=detailSection(body,'Événements secondaires du même nom');sec.append(create('p','ev-dialog-disclaimer','Rapprochement par nom et type de localisation, sans supposer que tous les identifiants « feeders » du JSON correspondent à cet événement.'));
      const rows=linked.flatMap(item=>(item.milestone?.scoring?.cappedScorings||[]).flatMap(c=>(c.methods||[]).map(m=>strip(m.description))));
      if(rows.length)listFor(sec,[...new Set(rows)].slice(0,20));else sec.append(create('p','','Aucune règle détaillée disponible dans cet extrait.'));
    }
    if(e.episodic){const sec=detailSection(body,'Campagnes associées');const ids=e.episodic.ids||[e.episodic.id].filter(Boolean);if(ids.length)listFor(sec,ids);else sec.append(create('p','','Identifiants des campagnes non disponibles dans cet extrait.'));}
    body.append(create('p','ev-dialog-disclaimer','Données archivées : elles ne prouvent pas l’état actuel des événements. Les récompenses détaillées sont encore incomplètes pour de nombreuses fiches.'));
    host.append(body);if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  async function load(){
    try{
      const embedded=$('embedded-events');
      let data;if(embedded){data=JSON.parse(embedded.textContent);}else{
        const response=await fetch('./data/evenements-snapshot.json',{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);data=await response.json();
      }
      if(!Array.isArray(data.events))throw new Error('Archive invalide');
      state.events=data.events.filter(e=>e&&Number.isFinite(e.startTime)&&Number.isFinite(e.endTime)&&e.id);
      state.metadata=data.metadata||{};state.verifiedDetails=data.verifiedDetails||{};
      const stamp=new Date(state.metadata.snapshotUploadedAt);const pretty=Number.isFinite(stamp.getTime())?fmtDate.format(stamp):'date inconnue';
      $('source-line').textContent=`Catalogue historique R2 (page 1 du ${pretty}, page 2 fournie) · ${state.events.length} événements sur ${data.metadata?.perTotal??'?' } annoncés · Aucune actualisation automatique.`;
      $('source-provenance').textContent='Dates et fiches issues d’une archive historique. SHA-256 vérifié ; URL d’origine des objets non prouvée.';
      const values=[...new Set(state.events.map(x=>x.type))].sort((a,b)=>(TYPES[a]||a).localeCompare(TYPES[b]||b,'fr'));
      const type=$('type-filter');for(const value of values){const option=create('option','',TYPES[value]||value);option.value=value;type.append(option);}
      render();
    }catch(error){$('source-line').textContent='Impossible de lire le fichier local des événements : '+error.message;$('source-provenance').textContent='Vérifie que ./data/evenements-snapshot.json est présent à côté des fichiers de la page.';}
  }
  function init(){
    const initial=new URLSearchParams(location.search).get('date');
    if(initial&&/^\d{4}-\d{2}-\d{2}$/.test(initial)&&!Number.isNaN(new Date(initial+'T12:00:00').getTime())){state.manualDate=true;state.date=initial;}else{state.date=localToday();}
    $('date-filter').value=state.date;
    $('date-filter').addEventListener('change',e=>{state.date=e.target.value||localToday();state.manualDate=true;state.expanded.clear();render();});
    $('reset-date').addEventListener('click',()=>{state.date=localToday();state.manualDate=false;$('date-filter').value=state.date;state.expanded.clear();render();});
    $('search-filter').addEventListener('input',e=>{state.search=e.target.value;state.expanded.clear();render();});
    $('type-filter').addEventListener('change',e=>{state.type=e.target.value;state.expanded.clear();render();});
    $('secondary-filter').addEventListener('change',e=>{state.includeSecondary=e.target.checked;state.expanded.clear();render();});
    for(const key of Object.keys(SECTIONS))$('more-'+key).addEventListener('click',()=>{if(state.expanded.has(key))state.expanded.delete(key);else state.expanded.add(key);render();});
    const dialog=$('event-dialog');dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>state.lastButton?.focus());
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
