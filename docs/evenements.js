/* LoSP événements : affichage uniquement de l'archive locale, aucun appel Scopely.
   Source : GET /api/public/events, avec recours temporaire au snapshot local.
   Page autonome et sans bibliothèque externe. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const TIMEZONE='Europe/Paris';
  const TYPES={milestone:'Jalons',episodic:'Campagne / événement',raid:'Raid',blitz:'Blitz',battlePass:'Passe de combat',strikePass:'Passe S.T.R.I.K.E.',pickYourPoison:'Épreuve',info:'Informations',raidSeason:'Saison de raid',warSeason:'Saison de guerre',donation:'Dons'};
  const EMOJI={milestone:'🏆',episodic:'⚔️',raid:'🛡️',blitz:'⚡',battlePass:'🎖️',strikePass:'🎫',pickYourPoison:'🔥',info:'✦',raidSeason:'🛡️',warSeason:'⚔️',donation:'🤝'};
  const LIMIT={current:8,past:8};
  const SECTIONS={current:'En cours',past:'Passés'};
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
  const NON_EVENT_TYPES=new Set(['raid','raidSeason','warSeason','strikePass','battlePass']);
  const ONBOARDING_MILESTONES=new Set([
    'first s.t.r.i.k.e.','second s.t.r.i.k.e.',
    'third s.t.r.i.k.e.','s.t.r.i.k.e. back'
  ]);
  // Not all pickYourPoison entries are permanent legendary trials:
  // KYLN and Breaker Scorpion are kept as ordinary temporary events.
  const LEGENDARY_TRIALS=new Set([
    'shadow king','old man logan','nova','black cat','green goblin (classic)',
    'pestilence','famine','war','death'
  ]);
  function isCalendarEvent(e){
    if(NON_EVENT_TYPES.has(e.type))return false;
    // Multi-year endpoints represent permanent sagas/unlocks, not calendar events.
    // Use the scheduled duration rather than a list of character names.
    if(e.endTime-e.startTime>=730*86400)return false;
    const name=(e.name||'').trim().toLowerCase();
    // Danger Room is a recurring game mode, not a calendar event.
    if(name==='danger room')return false;
    if(e.type==='pickYourPoison'&&
      (String(e.pickYourPoison?.typeName||'').toLowerCase()==='scourge'||
       LEGENDARY_TRIALS.has(name)))return false;
    // Onboarding/returning-player milestones are not general calendar events.
    if(e.type==='milestone'&&ONBOARDING_MILESTONES.has(name))return false;
    // Some Battle Pass objectives are exposed as milestone feeder entries.
    return !(e.type==='milestone'&&
      /(?:battle\s*pass|strike\s*pass|s\.t\.r\.i\.k\.e\.\s*pass)/i.test(e.name||''));
  }
  function artwork(e){for(const img of [e.cardArt,e.popupArt,e.icon,...(Array.isArray(e.hubArt)?e.hubArt:[])]){const url=cleanImage(img);if(url)return url;}return '';}
  function eventTitle(e){return strip(e.name)||'Événement sans titre';}
  function eventSub(e){return strip(e.subName||e.details||'');}
  function durationDays(ms){return Math.max(0,Math.ceil(ms/86400000));}
  function relative(e,group,reference){
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
    const reference=timestamp();const grouped={current:[],past:[]};
    for(const e of filterEvents()){
      const status=category(e,reference);
      if(status!=='future')grouped[status].push(e);
    }
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
    holder.append(create('p','ev-empty-emoji',group==='current'?'🪐':'📚'));
    holder.append(create('h3','',group==='current'?'Aucun événement en cours':'Aucun événement passé'));
    let message='Essaie un autre filtre ou une autre date de référence.';
    if(state.search||state.type||state.includeSecondary)message='Modifie les filtres ou la date de référence pour afficher d’autres événements.';
    holder.append(create('p','',message));return holder;
  }

  // Vue transversale des objectifs : seules les méthodes de scoring archivées
  // sont utilisées. Les "feeders" sont inclus même lorsqu'ils sont cachés du calendrier.
  const OBJECTIVE_MODES=[
    ['raid','🛡️','RAID'],['war','⚔️','GUERRE'],['arena','🏟️','ARÈNE'],
    ['blitz','⚡','BLITZ'],['crucible','🔷','ÉPREUVE COSMIQUE'],
    ['campaign','📖','CAMPAGNE'],['battleworld','🌌','BATTLEWORLD'],
    ['divers','📋','DIVERS']
  ];
  const MODE_BY_KEY=new Map(OBJECTIVE_MODES.map(([key,emoji,label])=>[key,{emoji,label}]));
  function objectiveMode(description){
    const text=strip(description).toLocaleLowerCase('fr');
    const modes=[];
    if(/\braids?\b/.test(text))modes.push('raid');
    if(/\b(?:alliance war|battle in war|in war|en guerre|guerre d.alliance)\b/.test(text))modes.push('war');
    if(/\b(?:arena|arène)\b/.test(text))modes.push('arena');
    if(/\bblitz\b/.test(text))modes.push('blitz');
    if(/\b(?:cosmic crucible|crucible|épreuve cosmique)\b/.test(text))modes.push('crucible');
    if(/\b(?:campaign|campagne)\b/.test(text))modes.push('campaign');
    if(/\bbattleworld\b/.test(text))modes.push('battleworld');
    return modes.length?modes.join('+'):'divers';
  }
  function objectiveLabel(raw){
    const description=strip(raw);
    // Conserver les noms de personnages/équipes de la source et ne traduire
    // que des constructions anglophones identifiables sans ambiguïté.
    const requirement=value=>value
      .replace(/\bat (\d+) Yellow Stars\b/gi,'avec $1 étoiles jaunes')
      .replace(/\bat Gear Tier (\d+)\b/gi,'au palier G$1')
      .replace(/\bat GT(\d+)\b/gi,'au palier G$1')
      .replace(/\band GT(\d+)\b/gi,'et au palier G$1');
    let m;
    if((m=description.match(/^Play Alliance Raid with (.+)$/i)))return 'Utiliser '+requirement(m[1])+' en raid';
    if((m=description.match(/^Play Alliance War with (.+)$/i)))return 'Utiliser '+requirement(m[1])+' en guerre';
    if((m=description.match(/^Play Blitz or Crucible with (.+)$/i)))return 'Jouer en Blitz ou en Épreuve cosmique avec '+requirement(m[1]);
    if((m=description.match(/^Play Blitz with (.+)$/i)))return 'Utiliser '+requirement(m[1])+' en Blitz';
    if((m=description.match(/^Battle with (.+)$/i)))return 'Faire un combat avec '+requirement(m[1]);
    if((m=description.match(/^Play with (.+)$/i)))return 'Jouer avec '+requirement(m[1]);
    if((m=description.match(/^Battle in Raid(?: \((.+)\))?$/i)))return 'Faire un combat en raid'+(m[1]?' ('+m[1]+')':'');
    if((m=description.match(/^Battle in War(?: \((.+)\))?$/i)))return 'Faire un combat en guerre'+(m[1]?' ('+m[1]+')':'');
    if((m=description.match(/^Battle in Arena(?: \((.+)\))?$/i)))return 'Faire un combat en arène'+(m[1]?' ('+m[1]+')':'');
    if(/^Battle in Cosmic Crucible$/i.test(description))return 'Faire un combat en Épreuve cosmique';
    if(/^Play Arena$/i.test(description))return 'Faire un combat en arène';
    if(/^Play any Battle$/i.test(description))return 'Faire un combat';
    if((m=description.match(/^Log In for (\d+) Days$/i)))return 'Se connecter au jeu pendant '+m[1]+' jours';
    if(/^Log ?In$/i.test(description))return 'Se connecter au jeu';
    if(/^Daily Login$/i.test(description))return 'Se connecter quotidiennement';
    if((m=description.match(/^Complete "([^"]+)" Daily Mission (\d+) times$/i)))return 'Terminer '+m[2]+' fois la mission quotidienne « '+m[1]+' »';
    if((m=description.match(/^Complete "([^"]+)" Daily Mission$/i)))return 'Terminer la mission quotidienne « '+m[1]+' »';
    if((m=description.match(/^Upgrade (.+) to Gear Tier (\d+)$/i)))return 'Améliorer '+m[1].replace(/^any character$/i,'un personnage')+' au palier G'+m[2];
    if((m=description.match(/^Spend (\d+) Campaign Energy$/i)))return 'Dépenser '+m[1]+' énergie de campagne';
    if((m=description.match(/^Spend (\d+) Iso-8 Campaign Energy$/i)))return 'Dépenser '+m[1]+' énergie de campagne ISO-8';
    if(/^Spend Power Cores$/i.test(description))return 'Dépenser des noyaux d’énergie';
    if((m=description.match(/^Spend (\d+) Power Cores?$/i)))return 'Dépenser '+m[1]+' noyau(x) d’énergie';
    if(/^Claim a free offer\.?$/i.test(description))return 'Récupérer une offre gratuite';
    return description;
  }
  function objectiveEntries(reference){
    const match=state.search.trim().toLocaleLowerCase('fr');
    const active=state.events.filter(e=>category(e,reference)==='current'&&(!state.type||e.type===state.type));
    const parents=new Map();
    for(const e of active)if(!secondary(e)&&!parents.has(eventTitle(e)))parents.set(eventTitle(e),e);
    const dedup=new Set(),items=[];
    for(const event of active){
      const scoring=event.milestone?.scoring;
      if(!scoring)continue;
      const add=(method,cap,premium)=>{
        const description=strip(method?.description);
        if(!description)return;
        const label=objectiveLabel(description);
        if(match&&![event.name,event.subName,event.details,event.id,description,label]
          .some(value=>strip(value).toLocaleLowerCase('fr').includes(match)))return;
        const mode=objectiveMode(description);
        const points=Number(method.points);
        const score=Number.isFinite(points)&&points>0?points:null;
        const ceiling=Number.isFinite(cap)&&cap>0?cap:null;
        const key=[eventTitle(event).toLocaleLowerCase('fr'),description.toLocaleLowerCase('fr'),mode,score,ceiling,Boolean(premium)].join('|');
        if(dedup.has(key))return;
        dedup.add(key);
        items.push({event:parents.get(eventTitle(event))||event,label,mode,description,points:score,cap:ceiling,premium:Boolean(premium)});
      };
      for(const method of Array.isArray(scoring.methods)?scoring.methods:[])add(method,null,false);
      for(const capped of Array.isArray(scoring.cappedScorings)?scoring.cappedScorings:[]){
        for(const method of Array.isArray(capped.methods)?capped.methods:[])add(method,Number(capped.cap),capped.isPremium);
      }
    }
    return items;
  }
  function renderObjectives(reference){
    const host=$('events-objectives');host.replaceChildren();
    const items=objectiveEntries(reference);
    $('stat-objectives').textContent=fmtNumber.format(items.length);
    $('count-objectives').textContent=fmtNumber.format(items.length);
    if(!items.length){
      const holder=create('div','ev-empty');
      holder.append(create('p','ev-empty-emoji','📋'));
      holder.append(create('h3','','Aucun objectif de score disponible'));
      holder.append(create('p','','Les événements en cours ne fournissent pas de méthode de progression exploitable pour cette date ou ces filtres.'));
      host.append(holder);
      return;
    }
    host.append(create('p','ev-objectives-note',
      'Méthodes de progression des événements actifs'+(state.metadata.liveSource?' (catalogue R2).':' (archive de secours, non actualisée).')+
      ' La progression personnelle n’est pas synchronisée.'));
    const grouped=new Map();
    for(const item of items){
      if(!grouped.has(item.mode))grouped.set(item.mode,[]);
      grouped.get(item.mode).push(item);
    }
    const order=new Map(OBJECTIVE_MODES.map(([mode],index)=>[mode,index]));
    const keys=[...grouped.keys()].sort((a,b)=>{
      const rank=mode=>Math.min(...mode.split('+').map(part=>order.get(part)??99));
      return rank(a)-rank(b)||a.localeCompare(b,'fr');
    });
    for(const key of keys){
      const entries=grouped.get(key);
      entries.sort((a,b)=>a.event.endTime-b.event.endTime||
        eventTitle(a.event).localeCompare(eventTitle(b.event),'fr')||
        a.label.localeCompare(b.label,'fr'));
      const group=create('section','ev-objective-mode');
      const meta=key.split('+').map(part=>MODE_BY_KEY.get(part)||MODE_BY_KEY.get('divers'));
      const heading=create('h3','ev-objective-heading',meta[0].emoji+' '+meta.map(x=>x.label).join(' / '));
      heading.append(create('span','ev-objective-count',fmtNumber.format(entries.length)));
      const list=create('ul','ev-objective-list');
      for(const item of entries){
        const li=create('li','ev-objective-item');
        li.append(create('p','ev-objective-action',item.label));
        const row=create('div','ev-objective-footer');
        const trigger=create('button','ev-objective-event',eventTitle(item.event));
        trigger.type='button';trigger.addEventListener('click',()=>openDetail(item.event,trigger));
        row.append(trigger);
        if(item.points!==null)row.append(create('span','ev-objective-score','+'+fmtNumber.format(item.points)+' pt(s) / action'));
        if(item.cap!==null){
          const repeat=item.points&&item.cap/item.points;
          const explicitCount=/\b(?:times?|days?|fois|jours)\b/i.test(item.description);
          const label=!explicitCount&&Number.isInteger(repeat)&&repeat>1&&repeat<=200?
            'Jusqu’à '+fmtNumber.format(repeat)+' fois comptabilisées':'Plafond '+fmtNumber.format(item.cap)+' pts';
          row.append(create('span','ev-objective-cap',label));
        }
        if(item.premium)row.append(create('span','ev-objective-premium','Premium'));
        li.append(row);list.append(li);
      }
      group.append(heading,list);host.append(group);
    }
  }

  function render(){
    const {grouped,reference}=groupEvents();
    renderObjectives(reference);
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
    const extra=state.verifiedDetails[e.id];if(extra){const sec=detailSection(body,state.metadata?.liveSource?'Paliers historiques (archive d’octobre, non actualisés)':'Paliers et récompenses archivés');sec.append(create('p','',`${extra.tiers} paliers · objectif final : ${extra.maxGoal} points.`));listFor(sec,extra.highlights);}
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
  const EVENTS_API="https://losp-roster-service.deliriousfan7.workers.dev/api/public/events";
  const FALLBACK_MAX_AGE=30*86400000;
  function validCatalog(events){
    return Array.isArray(events)&&events.length>0&&events.length<=1000&&
      new Set(events.map(e=>e?.id)).size===events.length&&
      events.every(e=>e&&typeof e.id==="string"&&
        Number.isFinite(e.startTime)&&Number.isFinite(e.endTime)&&
        e.endTime>e.startTime&&typeof e.type==="string");
  }
  function installCatalog(data,isLive){
    if(!validCatalog(data.events))throw new Error('Catalogue invalide');
    // Keep recurring seasons, raids and paid passes out of the calendar.
    // The official R2 data and fallback snapshot are left unchanged.
    state.events=data.events.filter(isCalendarEvent);
    state.metadata={...(data.metadata||{}),liveSource:isLive};
    // Historical reward details must not be presented as freshly verified.
    state.verifiedDetails=isLive?data.historicalDetails||{}:data.verifiedDetails||{};
    const types=[...new Set(state.events.map(x=>x.type))]
      .sort((a,b)=>(TYPES[a]||a).localeCompare(TYPES[b]||b,'fr'));
    const selected=state.type,type=$('type-filter');
    type.replaceChildren();
    const all=create('option','','Tous les types');all.value='';type.append(all);
    for(const value of types){
      const option=create('option','',TYPES[value]||value);
      option.value=value;type.append(option);
    }
    state.type=types.includes(selected)?selected:'';
    type.value=state.type;
    state.expanded.clear();
    if(isLive){
      const time=Date.parse(data.updatedAt||'');
      const dated=Number.isFinite(time)?fmtDate.format(new Date(time)):'date inconnue';
      $('source-line').textContent='Catalogue synchronisé via R2 · '+state.events.length+
        ' événements affichables ('+data.events.length+' récupérés) · '+data.pages+
        ' page(s) · dernière vérification '+dated+'.';
      const frenchVerified=data.locale==='fr'&&data.localizationStatus==='verified';
      $('source-provenance').textContent=(frenchVerified?
        'Textes officiels français disponibles. ':
        data.localizationStatus==='no-translated-text'?
          'Source française vérifiée, mais aucun texte traduit détecté ; anglais conservé. ':
          'Textes anglais : français en attente d’une collecte hebdomadaire complète. ')+
        'Reçus et SHA-256 vérifiés ; aucun appel Scopely depuis cette page.';
    }else{
      const time=Date.parse(data.metadata?.snapshotUploadedAt||'');
      const dated=Number.isFinite(time)?fmtDate.format(new Date(time)):'date inconnue';
      $('source-line').textContent='Archive locale de secours du '+dated+
        ' · '+state.events.length+' événements affichables · synchronisation momentanément indisponible.';
      $('source-provenance').textContent=
        'Cet instantané historique ne prouve pas la disponibilité actuelle des événements. La page réessaiera la source R2 lors du prochain chargement.';
    }
    render();
  }
  async function load(){
    let fallback=null,hasUsableFallback=false;
    try{
      const embedded=$('embedded-events');
      if(embedded)fallback=JSON.parse(embedded.textContent);
      else{
        const response=await fetch('./data/evenements-snapshot.json',{cache:'no-store'});
        if(response.ok)fallback=await response.json();
      }
      const captured=Date.parse(fallback?.metadata?.snapshotUploadedAt||'');
      hasUsableFallback=validCatalog(fallback?.events)&&Number.isFinite(captured)&&
        Date.now()>=captured&&Date.now()-captured<FALLBACK_MAX_AGE;
      if(hasUsableFallback)installCatalog(fallback,false);
    }catch{fallback=null;}
    try{
      const response=await fetch(EVENTS_API,{mode:'cors'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const live=await response.json();
      if(live?.schemaVersion!==1||live.status!=='ok'||
        !Number.isSafeInteger(live.total)||live.total!==live.count||
        live.events?.length!==live.total||!validCatalog(live.events))
        throw new Error('Catalogue incomplet');
      installCatalog({...live,historicalDetails:hasUsableFallback?fallback.verifiedDetails||{}:{}},true);
    }catch{
      if(!hasUsableFallback){
        $('source-line').textContent=
          'Catalogue indisponible : aucune archive locale encore valide.';
        $('source-provenance').textContent=
          'La publication attend des pages R2 complètes et vérifiées. Réessayer après la prochaine collecte.';
      }
    }
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
