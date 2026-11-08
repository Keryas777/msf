/* LoSP événements : fichier GitHub Pages publié depuis les sources R2 vérifiées.
   Une seule source publique : docs/data/evenements-snapshot.json (canonique).
   Pas de second fichier de secours, et aucun appel direct à Scopely. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const TIMEZONE='Europe/Paris';
  const TYPES={milestone:'Jalons',episodic:'Campagne / événement',raid:'Raid',blitz:'Blitz',battlePass:'Passe de combat',strikePass:'Passe S.T.R.I.K.E.',pickYourPoison:'Épreuve',info:'Informations',raidSeason:'Saison de raid',warSeason:'Saison de guerre',donation:'Dons'};
  const EMOJI={milestone:'🏆',episodic:'⚔️',raid:'🛡️',blitz:'⚡',battlePass:'🎖️',strikePass:'🎫',pickYourPoison:'🔥',info:'✦',raidSeason:'🛡️',warSeason:'⚔️',donation:'🤝'};
  const GAME_GROUPS=[
    {key:'phases',label:'Phases',icon:'📋'},
    {key:'command',label:'Poste de commandement',icon:'🛡️'},
    {key:'events',label:'Événements',icon:'⚔️'}
  ];
  const SECTIONS={current:'En cours',past:'Passés'};
  const TABS=['objectives','current','past'];
  const state={events:[],metadata:{},sourceError:false,date:null,manualDate:false,search:'',type:'',lastButton:null,
    teams:[],characters:[],characterAliases:[]};
  const fmtDate=new Intl.DateTimeFormat('fr-FR',{timeZone:TIMEZONE,day:'numeric',month:'short',year:'numeric'});
  const fmtNumber=new Intl.NumberFormat('fr-FR');
  const objectiveCount=count=>fmtNumber.format(count)+' objectif'+(count===1?'':'s');
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
  // L'API ne fournit pas de champ indiquant l'emplacement exact dans le
  // menu du jeu. Ces règles sont conservatrices, indépendantes de la langue.
  const NON_EVENT_TYPES=new Set(['raid','raidSeason','warSeason','strikePass','battlePass','blitz','donation','info']);
  const MAX_TEMPORARY_CAMPAIGN_DAYS=35;
  function eventNameKey(value){
    return strip(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[’‘]/g,"'").toLocaleLowerCase('fr');
  }
  const ONBOARDING_MILESTONES=new Set([
    'first s.t.r.i.k.e.','second s.t.r.i.k.e.',
    'third s.t.r.i.k.e.','s.t.r.i.k.e. back',
    's.t.r.i.k.e. : premier assaut','deuxieme s.t.r.i.k.e.',
    's.t.r.i.k.e. : troisieme assaut','coup du s.t.r.i.k.e.'
  ]);
  function isCalendarEvent(e){
    if(NON_EVENT_TYPES.has(e.type))return false;
    if(e.type==='episodic')return e.episodic?.type==='eventCampaign';
    if(e.type==='pickYourPoison')return true;
    if(e.type!=='milestone')return false;
    const name=eventNameKey(e.name);
    if(ONBOARDING_MILESTONES.has(name))return false;
    return !/(?:battle\s*pass|strike\s*pass|s\.t\.r\.i\.k\.e\.\s*pass)/i.test(e.name||'');
  }
  function isTierCollection(e){
    if(e.type!=='milestone')return false;
    const key=calendarTierKey(e);
    const family=state.events.filter(other=>other.type==='milestone'&&
      calendarTierKey(other)===key);
    // Les déclinaisons d'un même palier ne représentent pas des phases
    // autonomes du menu (ex. onze variantes d'équipement).
    return family.length>=3&&family.some(other=>/:\s*[ivxlcdm]+$/i.test(strip(other.name)));
  }
  function isLegacyTrial(e){
    const brackets=e.pickYourPoison?.brackets;
    if(Array.isArray(brackets)&&brackets.length>1)return true;
    // Pas de signal "affiché dans Événements" dans le JSON :
    // les familles d'illustrations distinguent ici les Trials légendaires
    // récurrents de l'événement Briseur à durée limitée.
    const image=cleanImage(e.cardArt).split('/').pop()||'';
    return /(?:^Scourge_|_Scourge_)/i.test(image)&&!/Breaker/i.test(image);
  }
  function calendarGroup(e){
    if(e.type==='milestone'){
      const hints=Array.isArray(e.locationHints)?e.locationHints:[];
      if(hints.includes('lohub_wrapper'))return 'command';
      if(hints.includes('lohub_feeder'))return null;
      if(hints.length||!strip(e.name)||isTierCollection(e))return null;
      return cleanImage(e.cardArt)&&cleanImage(e.popupArt)?'phases':null;
    }
    if(e.type==='pickYourPoison')
      return cleanImage(e.cardArt)&&!isLegacyTrial(e)?'events':null;
    if(e.type==='episodic'&&e.episodic?.type==='eventCampaign'&&
      Array.isArray(e.episodic.ids)&&e.episodic.ids.length&&
      e.endTime-e.startTime<=MAX_TEMPORARY_CAMPAIGN_DAYS*86400&&
      strip(e.name))return 'events';
    return null;
  }
  function objectiveGroup(e){
    if(e.type!=='milestone')return null;
    const group=calendarGroup(e);
    if(group==='phases'||group==='command')return group;
    if(!e.locationHints?.includes('lohub_feeder'))return null;
    const parent=state.events.find(candidate=>{
      const parentGroup=calendarGroup(candidate);
      return (parentGroup==='phases'||parentGroup==='command')&&
        eventNameKey(candidate.name)===eventNameKey(e.name)&&
        candidate.startTime<e.endTime&&candidate.endTime>e.startTime;
    });
    return parent?calendarGroup(parent):null;
  }
  function calendarTierKey(e){
    const family=eventNameKey(e.name).replace(/\s*:\s*[ivxlcdm]+$/,'');
    return [e.type,e.startTime,e.endTime,eventNameKey(e.subName),family].join('|');
  }
  function collapseCurrentEvents(items){
    // Les niveaux I-XI d'un même jalon sont des variantes, pas onze événements.
    // L'édition canonique (sans suffixe romain) est préférée pour la carte.
    const tierKeys=new Set(items.filter(e=>e.type==='milestone'&&!secondary(e)&&
      /:\s*[ivxlcdm]+$/i.test(strip(e.name))).map(calendarTierKey));
    const groups=new Map();
    for(const event of items){
      let kind='',key='id:'+event.id;
      if(event.type==='milestone'&&!secondary(event)&&tierKeys.has(calendarTierKey(event))){
        kind='tiers';key='tiers:'+calendarTierKey(event);
      }else if(event.type==='episodic'&&Array.isArray(event.episodic?.ids)&&event.episodic.ids.length){
        // Deux fenêtres de publication d'une même campagne peuvent se chevaucher.
        kind='editions';
        key='campaign:'+JSON.stringify([eventNameKey(event.name),eventNameKey(event.subName),
          event.episodic.type,[...event.episodic.ids].sort()]);
      }
      let group=groups.get(key);
      if(!group){group={event,kind,variants:[event]};groups.set(key,group);continue;}
      group.variants.push(event);
      if((kind==='tiers'&&!/:\s*[ivxlcdm]+$/i.test(strip(event.name)))||
        (kind==='editions'&&event.startTime>group.event.startTime))group.event=event;
    }
    return [...groups.values()].map(group=>group.variants.length>1?
      {...group.event,calendarVariantKind:group.kind,calendarVariants:group.variants}:group.event);
  }
  function artwork(e){
    // Le Poste de commandement fournit une icône transparente dédiée.
    // Ne pas l'empiler sur d'autres illustrations ou images de secours.
    const command=e.type==='milestone'&&e.locationHints?.includes('lohub_wrapper');
    const sources=command?[e.icon]:
      [e.cardArt,e.popupArt,...(Array.isArray(e.hubArt)?e.hubArt:[]),e.icon];
    for(const source of sources){const url=cleanImage(source);if(url)return url;}
    return '';
  }
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
      const group=calendarGroup(e);
      if(!group)return false;
      if(state.type&&group!==state.type)return false;
      return !match||[e.name,e.subName,e.details,e.id].some(v=>strip(v).toLocaleLowerCase('fr').includes(match));
    });
  }
  function groupEvents(){
    const reference=timestamp();const grouped={current:[],past:[]};
    for(const e of filterEvents()){
      const status=category(e,reference);
      if(status!=='future')grouped[status].push(e);
    }
    grouped.current=collapseCurrentEvents(grouped.current);
    grouped.past=collapseCurrentEvents(grouped.past);
    const rank=e=>GAME_GROUPS.findIndex(group=>group.key===calendarGroup(e));
    grouped.current.sort((a,b)=>rank(a)-rank(b)||a.endTime-b.endTime||
      eventTitle(a).localeCompare(eventTitle(b),'fr'));
    grouped.past.sort((a,b)=>rank(a)-rank(b)||b.endTime-a.endTime||
      eventTitle(a).localeCompare(eventTitle(b),'fr'));
    return {grouped,reference};
  }
  function cover(e){
    const command=e.type==='milestone'&&e.locationHints?.includes('lohub_wrapper');
    const image=artwork(e);
    const wrap=create('div','ev-cover'+(command?' ev-cover--command':'')+
      (!image?' ev-cover--placeholder':''));
    // Jamais de symbole sous les pixels transparents d'une illustration.
    const fallback=create('span','ev-cover-fallback',EMOJI[e.type]||'✦');
    fallback.hidden=Boolean(image);
    wrap.append(fallback);
    if(image){
      const img=create('img',command?'ev-command-icon':image.includes('/imgs/')?'ev-icon-img':'');
      img.alt='';img.loading='lazy';img.decoding='async';img.src=image;
      img.addEventListener('error',()=>{
        img.remove();
        fallback.hidden=false;
        wrap.className+=' ev-cover--placeholder';
      },{once:true});
      wrap.append(img);
    }
    return wrap;
  }
  function makeCard(e,group,reference){
    const card=create('article','ev-card');card.append(cover(e));
    const body=create('div','ev-card-copy'),top=create('div','ev-card-top');
    const menu=GAME_GROUPS.find(item=>item.key===calendarGroup(e));
    top.append(create('span','ev-category',menu?.label||TYPES[e.type]||e.type));
    if(e.type==='milestone')top.append(create('span','ev-scope',
      e.milestone?.type==='alliance'?'Alliance':'Solo'));
    if(secondary(e))top.append(create('span','ev-tech-tag','Secondaire'));
    if(e.calendarVariantKind==='tiers')top.append(create('span','ev-tier-tag',
      fmtNumber.format(e.calendarVariants.length)+' paliers'));
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
    if(state.search||state.type)message='Modifie les filtres ou la date de référence pour afficher d’autres événements.';
    holder.append(create('p','',message));return holder;
  }

  // Vue transversale des objectifs : seules les méthodes de scoring archivées
  // sont utilisées. Les "feeders" sont inclus même lorsqu'ils sont cachés du calendrier.
  const OBJECTIVE_MODES=[
    ['raid','🛡️','RAID'],['war','⚔️','GUERRE'],['arena','🏟️','ARÈNE'],
    ['blitz','⚡','CHOC'],['crucible','🔷','ÉPREUVE COSMIQUE'],
    ['campaign','📖','CAMPAGNE'],['battleworld','🌌','BATTLEWORLD'],
    ['divers','📋','DIVERS']
  ];
  const MODE_BY_KEY=new Map(OBJECTIVE_MODES.map(([key,emoji,label])=>[key,{emoji,label}]));
  function objectiveMode(description){
    const text=strip(description).toLocaleLowerCase('fr');
    const modes=[];
    if(/\braids?\b/.test(text))modes.push('raid');
    if(/\b(?:alliance war|battle in war|in war|en guerre|guerre d.alliance)\b|^play war\b|\bwar or\b/.test(text))modes.push('war');
    if(/\b(?:arena|arène)\b/.test(text))modes.push('arena');
    if(/\b(?:blitz|choc)\b/.test(text))modes.push('blitz');
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
      .replace(/^an /i,'un ').replace(/^a /i,'un ')
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

    if((m=description.match(/^Play Arena, Blitz, Crucible, or Alliance War with (.+)$/i)))
      return 'Jouer en arène, Blitz, Épreuve cosmique ou guerre avec '+requirement(m[1]);
    if((m=description.match(/^Play War or Cosmic Crucible with (.+)$/i)))
      return 'Jouer en guerre ou en Épreuve cosmique avec '+requirement(m[1]);
    if(/^Play War$/i.test(description))return 'Faire un combat en guerre';
    if(/^Play Raids$/i.test(description))return 'Faire des combats en raid';
    if(/^Play Crucible$/i.test(description))return 'Faire un combat en Épreuve cosmique';
    if((m=description.match(/^Play (the )?(.+ Campaigns?)$/i)))return 'Jouer '+(m[1]?'la ':'une ')+m[2];
    if(/^Clear Waves in Battleworld$/i.test(description))return 'Terminer des vagues en Battleworld';
    if((m=description.match(/^Upgrade any character(?: to Level| Level to) (\d+)$/i)))
      return 'Améliorer un personnage au niveau '+m[1];
    if((m=description.match(/^Upgrade (.+) to (?:Tier |T)([234]) Level (\d+) Iso-8$/i))){
      const subject=requirement(m[1]).replace(/^any character$/i,'un personnage')
        .replace(/^any City character$/i,'un personnage Ville')
        .replace(/^any Global character$/i,'un personnage Global')
        .replace(/^any Cosmic character$/i,'un personnage Cosmique');
      return 'Améliorer '+subject+' en ISO-8 T'+m[2]+' niveau '+m[3];
    }
    if((m=description.match(/^Spend (\d+) (?:Tier |T)([234]) Level (\d+) Ion$/i)))
      return 'Dépenser '+m[1]+' ion(s) ISO-8 (palier '+m[2]+', niveau '+m[3]+')';
    if(/^Spend Gold$/i.test(description))return 'Dépenser de l’or';
    if((m=description.match(/^Spend (\d+) Gold$/i)))return 'Dépenser '+m[1]+' or';
    if(/^Spend L4 Training Modules$/i.test(description))return 'Dépenser des modules d’entraînement L4';
    if((m=description.match(/^Earn (.+) Milestone Points in select Offers$/i)))
      return 'Obtenir des points de jalon « '+m[1]+' » via certaines offres';
    if((m=description.match(/^Get points by completing the (.+)$/i)))
      return 'Gagner des points en terminant '+m[1];
    if(/^Make a purchase from the Web Store\.?$/i.test(description))return 'Effectuer un achat dans la boutique Web';
    if(/^Make a Strike Store purchase\.?$/i.test(description))return 'Effectuer un achat dans la boutique S.T.R.I.K.E.';
    if(/^Login to Web Playable\.?$/i.test(description))return 'Se connecter sur la version Web du jeu';
    if(/^Use 1 Power Core$/i.test(description))return 'Utiliser 1 noyau d’énergie';
    if((m=description.match(/^Upgrade characters to Gear Tier (\d+) or higher$/i)))
      return 'Améliorer des personnages au palier G'+m[1]+' ou supérieur';
    return description;
  }
  // Les équipes sont décrites par teams.json (Google Sheets) et les portraits
  // par msf-characters.json. Aucun nom de personnage ou d'équipe codé en dur.
  function characterAliases(characters){
    const aliases=[];
    for(const character of characters){
      if(!character||typeof character.id!=='string')continue;
      const names=new Set([character.nameKey,character.nameFr,character.nameEn,character.id]
        .filter(value=>typeof value==='string'&&strip(value))
        .flatMap(value=>{
          const name=eventNameKey(value);
          return [name,name.replace(/^(?:la |le |les |l'|un |une |the )/,'')];
        }));
      for(const alias of names)if(alias.length>=3)aliases.push({character,alias});
    }
    return aliases.sort((a,b)=>b.alias.length-a.alias.length||
      a.character.id.localeCompare(b.character.id));
  }
  function objectiveCharacter(description){
    if(!state.characterAliases.length)return null;
    const text=eventNameKey(description);
    const markers=/\b(?:avec|with)\s+/g;
    let marker;
    while((marker=markers.exec(text))){
      const remaining=text.slice(marker.index+marker[0].length);
      const possibilities=[remaining,remaining.replace(/^(?:la |le |les |l'|un |une |a |an |the )/,'')];
      for(const {character,alias} of state.characterAliases){
        if(possibilities.some(part=>part.startsWith(alias)&&
          !/[a-z0-9]/.test(part.charAt(alias.length))))return character;
      }
    }
    return null;
  }
  // Une cible peut être un personnage OU l'équipe entière. Les identifiants
  // proviennent exclusivement des catalogues, les variantes FR/EN étant
  // normalisées sans associer arbitrairement deux équipes différentes.
  function objectiveTeamKey(value){
    return eventNameKey(value).replace(/(?:\b[a-z]\.){2,}/g,word=>word.replace(/\./g,''))
      .replace(/[^a-z0-9 ]/g,' ')
      .split(/\s+/).filter(Boolean).map(word=>word.length>3?word.replace(/s$/,''):word)
      .join(' ');
  }
  function objectiveTeam(description){
    if(!/\b(?:avec|with)\b/i.test(description))return null;
    const normalized=' '+objectiveTeamKey(description)+' ';
    const found=state.teams.filter(team=>team&&typeof team.team==='string'&&
      Array.isArray(team.characters)&&
      normalized.includes(' '+objectiveTeamKey(team.team)+' '));
    // Ne jamais choisir une équipe au hasard si plusieurs noms s'emboîtent.
    return found.length===1?found[0]:null;
  }
  function isBattleObjective(description){
    return /^(?:combattre\b|faire un combat\b|jouer n[’']?importe quel combat\b|battle\b|play (?:any battle|alliance |raid|war|blitz|arena|crucible|with ))/i
      .test(strip(description));
  }
  function isFullTeamObjective(description){
    return /\b(?:tous les membres|all (?:members|characters))\b/i.test(description);
  }
  function battleCompatible(general,specific){
    if(!general.isBattle||!specific.isBattle)return false;
    if(general.character){
      if(specific.character)return general.character.id===specific.character.id;
      return Boolean(specific.team?.characters.includes(general.character.id));
    }
    if(general.team){
      if(specific.team)return general.team.team===specific.team.team;
      return Boolean(specific.character&&
        general.team.characters.includes(specific.character.id));
    }
    // « Jouer n'importe quel combat » englobe toute bataille, mais jamais
    // une connexion, un achat, une amélioration ou une dépense d'énergie.
    return !general.character&&!general.team;
  }
  function routeBattleObjectives(items){
    const specific=items.filter(item=>item.isBattle&&item.mode!=='divers');
    for(const item of items){
      item.originalMode=item.mode;
      item.relatedModes=[];
      if(item.mode!=='divers'||!item.isBattle)continue;
      const scores=new Map();
      for(const candidate of specific){
        if(!battleCompatible(item,candidate))continue;
        scores.set(candidate.mode,(scores.get(candidate.mode)||0)+1);
      }
      if(!scores.size)continue;
      const ranked=[...scores].sort((a,b)=>b[1]-a[1]||
        a[0].localeCompare(b[0],'fr'));
      // Une méthode générale est montrée UNE seule fois, dans le contexte
      // le plus pertinent. Elle reste valable dans tous les modes autorisés.
      item.mode=ranked[0][0];
      item.relatedModes=ranked.map(([mode])=>mode);
    }
    return items;
  }
  function objectiveTeams(entries){
    const members=new Map(),other=[],teamGoals=new Map();
    for(const item of entries){
      if(item.team){
        if(!teamGoals.has(item.team.team))teamGoals.set(item.team.team,[]);
        teamGoals.get(item.team.team).push(item);
        continue;
      }
      const character=item.character;
      if(!character){other.push(item);continue;}
      if(!members.has(character.id))members.set(character.id,{character,items:[]});
      members.get(character.id).items.push(item);
    }
    const candidates=state.teams.filter(team=>team&&typeof team.team==='string'&&
      Array.isArray(team.characters)).map(team=>({
        team,matched:[...new Set(team.characters)].filter(id=>members.has(id)),
        goals:teamGoals.get(team.team)||[]
      })).filter(group=>group.matched.length>=2||group.goals.length)
      .sort((a,b)=>b.matched.length-a.matched.length||
        a.team.team.localeCompare(b.team.team,'fr'));
    const assigned=new Set(),teams=[];
    for(const candidate of candidates){
      const chars=candidate.matched.filter(id=>!assigned.has(id));
      if(chars.length<2&&!candidate.goals.length)continue;
      for(const id of chars)assigned.add(id);
      teams.push({name:candidate.team.team,
        characters:chars.map(id=>members.get(id)),goals:candidate.goals});
    }
    const individual=[...members.values()].filter(member=>!assigned.has(member.character.id));
    teams.sort((a,b)=>a.name.localeCompare(b.name,'fr'));
    individual.sort((a,b)=>(a.character.nameKey||a.character.id)
      .localeCompare(b.character.nameKey||b.character.id,'fr'));
    return {teams,individual,other};
  }
  function objectiveCondition(item){
    const label=item.label;
    const stars=label.match(/\b(\d+)\s+étoiles?\s+jaunes\b/i);
    if(stars)return stars[1]+' étoiles jaunes';
    const gear=label.match(/\bpalier d[’']équipement\s+(\d+)\b/i);
    if(gear)return 'Palier d’équipement '+gear[1];
    if(/^(?:combattre|jouer|battle|play)\b/i.test(label))return 'Combat';
    return label;
  }
  // Une action identique peut créditer plusieurs jalons indépendants.
  // Les variantes verbales simples d'un combat désignent la même action,
  // mais une restriction ou une condition supplémentaire reste distincte.
  function objectiveActionLabel(item){
    if(!item.isBattle||item.character||item.team)return item.label;
    const simple={
      raid:/^(?:combattre|faire (?:un |des )?combats?) en raid$/i,
      war:/^(?:combattre|faire (?:un |des )?combats?) en guerre$/i,
      arena:/^(?:combattre|faire (?:un |des )?combats?) en arène$/i,
      crucible:/^(?:combattre|faire (?:un |des )?combats?) en épreuve cosmique$/i
    };
    const names={
      raid:'Combattre en raid',war:'Combattre en guerre',
      arena:'Combattre en arène',crucible:'Combattre en Épreuve cosmique'
    };
    return simple[item.mode]?.test(item.label)?names[item.mode]:item.label;
  }
  // Résumer uniquement les plafonds solo. Les plafonds d'alliance sont
  // conservés dans les détails de leur événement, jamais assimilés au joueur.
  // La durée est celle de la fiche source : elle ne prouve pas une récurrence.
  function objectiveActionHints(items){
    const solo=items.filter(item=>item.event.milestone?.type!=='alliance');
    const noun=solo.every(item=>item.isBattle)?'combat':'action';
    const groups=new Map(),uncapped=solo.some(item=>item.cap===null);
    for(const item of solo){
      if(item.sharedCap||!(item.cap>0)||!(item.points>0))continue;
      const count=item.cap/item.points;
      if(!Number.isInteger(count)||count<1)continue;
      const seconds=Number(item.event.endTime)-Number(item.event.startTime);
      const days=Number.isFinite(seconds)&&seconds>0?
        Math.ceil(seconds/86400):null;
      const key=String(days??'');
      if(!groups.has(key))groups.set(key,{days,counts:new Set()});
      groups.get(key).counts.add(count);
    }
    const hints=[];
    for(const group of [...groups.values()].sort((a,b)=>
      (a.days??Infinity)-(b.days??Infinity))){
      const counts=[...group.counts].sort((a,b)=>a-b);
      const label=counts.map(count=>fmtNumber.format(count)).join(' et ');
      const plural=counts.length!==1||counts[0]!==1;
      const period=group.days===1?' sur 24 h':
        group.days!==null?' sur '+fmtNumber.format(group.days)+' jours':'';
      hints.push('Solo : '+label+' '+noun+(plural?'s':'')+
        ' comptabilisé'+(plural?'s':'')+period);
    }
    if(uncapped)hints.push('Solo : aucun plafond indiqué');
    return hints;
  }
  function objectiveRow(item,short=false,hideAction=false){
    const li=create('li','ev-objective-item');
    const label=short?objectiveCondition(item):item.label;
    const action=create('p','ev-objective-action',label);
    if(label!==item.label)action.title=item.label;
    if(hideAction)action.hidden=true;
    li.append(action);
    const row=create('div','ev-objective-footer');
    if(item.points!==null)row.append(create('span','ev-objective-score',
      '+'+fmtNumber.format(item.points)+' pt(s) / action'));
    if(item.cap!==null){
      const repeat=item.points&&item.cap/item.points;
      const explicitCount=/\b(?:times?|days?|fois|jours)\b/i.test(item.description);
      let limit=(item.sharedCap?'Plafond partagé ':'Plafond ')+
        fmtNumber.format(item.cap)+' pts';
      if(!item.sharedCap&&!explicitCount&&Number.isInteger(repeat)&&repeat>1&&repeat<=200)
        limit+=' · Jusqu’à '+fmtNumber.format(repeat)+' actions comptabilisées';
      row.append(create('span','ev-objective-cap',limit));
    }
    if(item.premium)row.append(create('span','ev-objective-premium','Premium'));
    if(item.originalMode==='divers'&&item.mode!=='divers'&&item.isBattle){
      row.append(create('span','ev-objective-general','Tous modes · regroupé ici'));
    }
    if(!hideAction)row.append(create('span','ev-objective-origin',eventTitle(item.event)));
    li.append(row);return li;
  }
  function objectiveList(items,short=false,hideAction=false){
    const list=create('ul','ev-objective-list');
    for(const item of items)list.append(objectiveRow(item,short,hideAction));
    return list;
  }
  function objectiveCharacterCard(member){
    const card=create('details','ev-objective-character');
    const heading=create('summary','ev-objective-character-summary');
    const url=cleanImage(member.character.portraitUrl);
    if(url){
      const img=create('img','ev-objective-portrait');img.src=url;img.alt='';
      img.loading='lazy';img.decoding='async';
      img.addEventListener('error',()=>img.remove(),{once:true});
      heading.append(img);
    }
    heading.append(create('strong','',strip(member.character.nameKey||
      member.character.nameFr||member.character.nameEn||member.character.id)));
    heading.append(create('span','ev-objective-mini-count',
      fmtNumber.format(member.items.length)+' condition(s)'));
    card.append(heading,objectiveList(member.items,true));return card;
  }
  function objectiveEntries(reference){
    const active=state.events.filter(e=>category(e,reference)==='current'&&
      objectiveGroup(e)&&(!state.type||objectiveGroup(e)===state.type));
    const dedup=new Set(),items=[];
    for(const event of active){
      const scoring=event.milestone?.scoring;
      if(!scoring)continue;
      const add=(method,cap,premium,sharedCap)=>{
        const description=strip(method?.description);
        if(!description)return;
        const label=objectiveLabel(description);
        const character=objectiveCharacter(description);
        const team=objectiveTeam(description);
        const mode=objectiveMode(description);
        const points=Number(method.points);
        const score=Number.isFinite(points)&&points>0?points:null;
        const ceiling=Number.isFinite(cap)&&cap>0?cap:null;
        const key=[eventTitle(event).toLocaleLowerCase('fr'),description.toLocaleLowerCase('fr'),mode,score,ceiling,Boolean(premium)].join('|');
        if(dedup.has(key))return;
        dedup.add(key);
        items.push({event,label,mode,description,points:score,cap:ceiling,
          premium:Boolean(premium),sharedCap:Boolean(sharedCap),
          character,team,isBattle:isBattleObjective(description),
          teamComplete:Boolean(team&&isFullTeamObjective(description))});
      };
      for(const method of Array.isArray(scoring.methods)?scoring.methods:[])add(method,null,false,false);
      for(const capped of Array.isArray(scoring.cappedScorings)?scoring.cappedScorings:[]){
        const methods=Array.isArray(capped.methods)?capped.methods:[];
        for(const method of methods)add(method,Number(capped.cap),capped.isPremium,methods.length>1);
      }
    }
    routeBattleObjectives(items);
    const match=state.search.trim().toLocaleLowerCase('fr');
    if(!match)return items;
    return items.filter(item=>{
      const characterTeams=item.character?state.teams.filter(team=>
        Array.isArray(team.characters)&&team.characters.includes(item.character.id))
        .map(team=>team.team):[];
      return [item.event.name,item.event.subName,item.event.details,item.event.id,
        item.description,item.label,item.character?.nameKey,item.team?.team,
        ...characterTeams,item.mode,MODE_BY_KEY.get(item.mode)?.label]
        .some(value=>strip(value).toLocaleLowerCase('fr').includes(match));
    });
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
      holder.append(create('p','','Aucun objectif de score n’est disponible pour cette date ou ces filtres.'));
      host.append(holder);return;
    }
    host.append(create('p','ev-objectives-note',
      objectiveCount(items.length)+', regroupés par action et combats compatibles. '+
      '« Tous modes » indique un objectif général, non limité au mode affiché. '+
      'Points et plafonds distincts ; progression personnelle non synchronisée.'));
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
      const modeSection=create('section','ev-objective-mode');
      const meta=key.split('+').map(part=>MODE_BY_KEY.get(part)||MODE_BY_KEY.get('divers'));
      const heading=create('h3','ev-objective-heading',
        meta[0].emoji+' '+meta.map(x=>x.label).join(' / '));
      heading.append(create('span','ev-objective-count',
        objectiveCount(entries.length)));
      const eventList=create('div','ev-objective-events');
      // On groupe d'abord les exigences d'équipe et leurs personnages,
      // même lorsqu'elles proviennent d'événements différents.
      const {teams,individual,other}=objectiveTeams(entries);
      for(const team of teams){
        const teamBlock=create('details','ev-objective-team');
        const summary=create('summary','ev-objective-team-summary');
        summary.append(create('strong','',team.name));
        const total=team.goals.length+
          team.characters.reduce((sum,member)=>sum+member.items.length,0);
        summary.append(create('span','ev-objective-mini-count',
          fmtNumber.format(team.characters.length)+' personnages · '+
          objectiveCount(total)));
        const people=create('div','ev-objective-people');
        if(team.goals.length){
          people.append(create('h4','ev-objective-subhead',
            team.goals.some(item=>item.teamComplete)?
              'Conditions d’équipe complète / collectives':'Conditions d’équipe'));
          people.append(objectiveList(team.goals));
        }
        for(const member of team.characters)people.append(objectiveCharacterCard(member));
        teamBlock.append(summary,people);eventList.append(teamBlock);
      }
      if(individual.length){
        const singles=create('div','ev-objective-singles');
        singles.append(create('h4','ev-objective-subhead','Personnages'));
        const people=create('div','ev-objective-people');
        for(const member of individual)people.append(objectiveCharacterCard(member));
        singles.append(people);eventList.append(singles);
      }
      // Les méthodes sans équipe ni personnage sont regroupées par action,
      // et non par événement : un combat peut faire progresser plusieurs
      // jalons, chacun conservant ses propres points et plafonds.
      const byAction=new Map();
      for(const item of other){
        const label=objectiveActionLabel(item);
        const key=item.mode+'|'+eventNameKey(label);
        if(!byAction.has(key))byAction.set(key,{label,items:[]});
        byAction.get(key).items.push(item);
      }
      for(const {label,items:methods} of byAction.values()){
        const actionBlock=create('details','ev-objective-event-group');
        actionBlock.open=byAction.size===1;
        const actionTitle=create('summary','ev-objective-event-summary');
        actionTitle.append(create('strong','',label));
        actionTitle.append(create('span','ev-objective-mini-count',
          objectiveCount(methods.length)));
        for(const hint of objectiveActionHints(methods))
          actionTitle.append(create('span','ev-objective-limit',hint));
        const body=create('div','ev-objective-event-content');
        const bySource=new Map();
        for(const item of methods){
          const parent=state.events.find(candidate=>
            (calendarGroup(candidate)==='phases'||calendarGroup(candidate)==='command')&&
            eventNameKey(candidate.name)===eventNameKey(item.event.name)&&
            candidate.startTime<item.event.endTime&&
            candidate.endTime>item.event.startTime)||item.event;
          const sourceKey=parent.id||objectiveGroup(parent)+'|'+eventNameKey(parent.name);
          if(!bySource.has(sourceKey))bySource.set(sourceKey,{event:parent,items:[]});
          bySource.get(sourceKey).items.push(item);
        }
        for(const {event,items:scorings} of bySource.values()){
          const source=create('div','ev-objective-source');
          const sourceHead=create('div','ev-objective-source-head');
          const link=create('button','ev-objective-event',eventTitle(event));
          link.type='button';link.title='Détails de l’événement';
          link.addEventListener('click',()=>openDetail(event,link));
          sourceHead.append(link);
          sourceHead.append(create('span','ev-objective-scope',
            event.milestone?.type==='alliance'?'Alliance':'Solo'));
          source.append(sourceHead,objectiveList(scorings,false,true));
          body.append(source);
        }
        actionBlock.append(actionTitle,body);eventList.append(actionBlock);
      }
      modeSection.append(heading,eventList);host.append(modeSection);
    }
  }

  function activateTab(key,focus=false){
    for(const name of TABS){
      const tab=$('tab-'+name),active=name===key;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      $('section-'+name).hidden=!active;
    }
    if(focus)$('tab-'+key).focus();
  }

  function render(){
    if(state.sourceError){
      for(const key of ['current','past']){
        $('events-'+key).replaceChildren(create('p','ev-empty',
          'Événements temporairement indisponibles : données non vérifiées.'));
        $('count-'+key).textContent='—';
        $('stat-'+key).textContent='—';
      }
      $('events-objectives').replaceChildren(create('p','ev-empty',
        'Objectifs temporairement indisponibles : données non vérifiées.'));
      $('count-objectives').textContent='—';
      $('stat-objectives').textContent='—';
      return;
    }
    const {grouped,reference}=groupEvents();
    renderObjectives(reference);
    for(const key of Object.keys(SECTIONS)){
      const items=grouped[key],host=$(`events-${key}`);host.replaceChildren();
      $(`count-${key}`).textContent=fmtNumber.format(items.length);
      $(`stat-${key}`).textContent=fmtNumber.format(items.length);
      if(!items.length)host.append(emptyState(key));
      for(const category of GAME_GROUPS){
        const entries=items.filter(item=>
          calendarGroup(item)===category.key);
        if(!entries.length)continue;
        const section=create('section','ev-calendar-group');
        const head=create('div','ev-calendar-group-head');
        head.append(create('h3','ev-calendar-group-title',category.icon+' '+category.label));
        head.append(create('span','ev-calendar-group-count',
          fmtNumber.format(items.filter(item=>
            calendarGroup(item)===category.key).length)));
        const grid=create('div','ev-grid');
        for(const item of entries)grid.append(makeCard(item,key,reference));
        section.append(head,grid);host.append(section);
      }
    }
    $('filter-context').textContent=state.manualDate?'Simulation au '+state.date.split('-').reverse().join('/'):'Classement selon les dates archivées, à l’instant présent.';
  }
  function listFor(parent,rows){const ul=create('ul','ev-detail-list');for(const row of rows){const li=create('li','');li.textContent=row;ul.append(li);}parent.append(ul);}
  function detailSection(parent,title){const section=create('section','ev-dialog-section');section.append(create('h3','',title));parent.append(section);return section;}
  function openDetail(e,trigger){
    state.lastButton=trigger;const dialog=$('event-dialog'),host=$('event-dialog-content');host.replaceChildren();
    const hero=create('div','ev-dialog-header'),art=artwork(e);
    if(art){const img=create('img');img.src=art;img.alt='';img.loading='lazy';hero.append(img);}
    const head=create('div','ev-dialog-headcopy');
    const group=GAME_GROUPS.find(item=>item.key===calendarGroup(e));
    head.append(create('span','ev-category',group?.label||TYPES[e.type]||e.type),
      create('h2','',eventTitle(e)));hero.append(head);
    const close=create('button','ev-dialog-close','×');close.type='button';close.setAttribute('aria-label','Fermer');close.addEventListener('click',()=>dialog.close());hero.append(close);host.append(hero);
    const body=create('div','ev-dialog-body');const info=create('div','ev-dialog-data');
    const fields=[['Début',dateLabel(e.startTime)],['Fin',dateLabel(e.endTime)]];
    if(e.type==='milestone')fields.push(['Progression',
      e.milestone?.type==='alliance'?'Alliance':'Solo']);
    for(const [label,value] of fields){
      const box=create('div');
      box.append(create('span','ev-dialog-label',label),create('strong','',value));info.append(box);
    }
    body.append(info);
    const description=strip(e.details||e.subName);if(description){const sec=detailSection(body,'Présentation');sec.append(create('p','',description));}
    const scoring=e.milestone?.scoring;const methods=Array.isArray(scoring?.methods)?scoring.methods:[];
    const caps=Array.isArray(scoring?.cappedScorings)?scoring.cappedScorings:[];
    if(methods.length){const sec=detailSection(body,'Comment gagner des points');listFor(sec,methods.map(x=>`${strip(x.description)||'Action'} : ${fmtNumber.format(x.points||0)} point(s)`));}
    if(caps.length){const sec=detailSection(body,'Objectifs plafonnés / sous-étapes');const rows=caps.flatMap(c=>(c.methods||[]).map(m=>`${strip(m.description)||'Action'} · ${fmtNumber.format(m.points||0)} pt(s) / action · plafond ${fmtNumber.format(c.cap||0)}${c.rewardTier?' · palier '+c.rewardTier:''}`));listFor(sec,rows);}
    const linked=state.events.filter(other=>other.id!==e.id&&eventTitle(other)===eventTitle(e)&&secondary(other)&&e.locationHints?.includes('lohub_wrapper'));
    if(linked.length){const sec=detailSection(body,'Événements secondaires du même nom');sec.append(create('p','ev-dialog-disclaimer','Rapprochement par nom et type de localisation, sans supposer que tous les identifiants « feeders » du JSON correspondent à cet événement.'));
      const rows=linked.flatMap(item=>(item.milestone?.scoring?.cappedScorings||[]).flatMap(c=>(c.methods||[]).map(m=>strip(m.description))));
      if(rows.length)listFor(sec,[...new Set(rows)].slice(0,20));else sec.append(create('p','','Aucune règle détaillée disponible dans cet extrait.'));
    }
    if(e.calendarVariantKind==='tiers'&&e.calendarVariants?.length>1){
      const sec=detailSection(body,'Autres paliers de la même phase');
      const rows=e.calendarVariants.filter(variant=>variant.id!==e.id).map(variant=>{
        const methods=variant.milestone?.scoring?.methods||[];
        return eventTitle(variant)+' : '+(methods.length?
          methods.map(method=>strip(method.description)+' (+'+fmtNumber.format(method.points||0)+' pts)').join(' · '):
          'Détails de score non disponibles');
      });
      listFor(sec,rows);
    }
    if(e.episodic){const sec=detailSection(body,'Campagnes associées');const ids=e.episodic.ids||[e.episodic.id].filter(Boolean);if(ids.length)listFor(sec,ids);else sec.append(create('p','','Identifiants des campagnes non disponibles dans cet extrait.'));}
    body.append(create('p','ev-dialog-disclaimer','Données archivées : elles ne prouvent pas l’état actuel des événements. Les récompenses détaillées sont encore incomplètes pour de nombreuses fiches.'));
    host.append(body);if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  const EVENTS_API='./data/evenements-snapshot.json';
  function validCatalog(events){
    return Array.isArray(events)&&events.length>0&&events.length<=1000&&
      new Set(events.map(e=>e?.id)).size===events.length&&
      events.every(e=>e&&typeof e.id==="string"&&
        Number.isFinite(e.startTime)&&Number.isFinite(e.endTime)&&
        e.endTime>e.startTime&&typeof e.type==="string");
  }
  function installCatalog(data){
    if(!validCatalog(data.events))throw new Error('Catalogue invalide');
    // The verified GitHub Pages JSON is the sole browser source.
    state.events=data.events.filter(isCalendarEvent);
    state.sourceError=false;
    state.metadata={liveSource:true,updatedAt:data.updatedAt};
    const groups=GAME_GROUPS.filter(group=>
      state.events.some(event=>calendarGroup(event)===group.key));
    const selected=state.type,type=$('type-filter');
    type.replaceChildren();
    const all=create('option','','Toutes les rubriques');all.value='';type.append(all);
    for(const group of groups){
      const option=create('option','',group.label);
      option.value=group.key;type.append(option);
    }
    state.type=groups.some(group=>group.key===selected)?selected:'';
    type.value=state.type;
    const time=Date.parse(data.updatedAt||'');
    const dated=Number.isFinite(time)?fmtDate.format(new Date(time)):'date inconnue';
    $('source-line').textContent='Catalogue GitHub vérifié · '+data.events.length+
      ' fiches récupérées · '+data.pages+
      ' page(s) · dernière vérification '+dated+'.';
    const frenchVerified=data.locale==='fr'&&data.localizationStatus==='verified';
    $('source-provenance').textContent=(frenchVerified?
      'Textes officiels français disponibles. ':
      data.localizationStatus==='no-translated-text'?
        'Source française vérifiée, mais aucun texte traduit détecté ; anglais conservé. ':
        'Textes anglais : traduction française non disponible pour cette collecte. ')+
      'Import automatique des données R2 vérifiées ; aucun appel Scopely depuis cette page.';
    render();
  }
  async function loadObjectiveReferences(){
    // Catalogues déjà publiés par LoSP ; facultatifs et indépendants du flux
    // vérifié des événements. Une erreur n'empêche jamais les objectifs bruts.
    const sources=['./data/teams.json','./data/msf-characters.json'];
    const results=await Promise.allSettled(sources.map(async url=>{
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      return response.json();
    }));
    const teams=results[0].status==='fulfilled'?results[0].value:null;
    const characters=results[1].status==='fulfilled'?results[1].value:null;
    state.teams=Array.isArray(teams)?teams.filter(team=>team&&
      typeof team.team==='string'&&Array.isArray(team.characters)):[];
    state.characters=Array.isArray(characters)?characters.filter(character=>
      character&&typeof character.id==='string'):[];
    state.characterAliases=characterAliases(state.characters);
    if(!state.sourceError)renderObjectives(timestamp());
  }
  async function load(){
    try{
      const response=await fetch(EVENTS_API,{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const live=await response.json();
      const checkedAt=Date.parse(live?.updatedAt||'');
      if(live?.schemaVersion!==1||live.status!=='ok'||
        live.source!=='verified-daily-game-events'||
        !Number.isSafeInteger(live.total)||live.total!==live.count||
        live.events?.length!==live.total||!validCatalog(live.events)||
        !Number.isFinite(checkedAt)||checkedAt>Date.now()+300000||
        Date.now()-checkedAt>=48*3600000)
        throw new Error('Catalogue incomplet ou périmé');
      installCatalog(live);
      await loadObjectiveReferences();
    }catch{
      // Fail closed: never use an outdated GitHub JSON or claim there are
      // no events when the provider's verified R2 projection is unavailable.
      $('source-line').textContent='Catalogue GitHub indisponible ou trop ancien.';
      $('source-provenance').textContent=
        'Aucune ancienne version n’est affichée. Réessayez après la prochaine publication GitHub.';
      state.sourceError=true;
      render();
    }
  }
  function init(){
    const initial=new URLSearchParams(location.search).get('date');
    if(initial&&/^\d{4}-\d{2}-\d{2}$/.test(initial)&&!Number.isNaN(new Date(initial+'T12:00:00').getTime())){state.manualDate=true;state.date=initial;}else{state.date=localToday();}
    $('date-filter').value=state.date;
    for(const [index,key] of TABS.entries()){
      const tab=$('tab-'+key);
      tab.addEventListener('click',()=>{userChangedTab=true;activateTab(key);});
      tab.addEventListener('keydown',event=>{
        let next;
        if(event.key==='ArrowRight')next=(index+1)%TABS.length;
        else if(event.key==='ArrowLeft')next=(index+TABS.length-1)%TABS.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=TABS.length-1;
        else return;
        event.preventDefault();
        userChangedTab=true;activateTab(TABS[next],true);
      });
    }
    // Les anciennes versions utilisaient des liens #section-past / #section-current.
    // Safari conserve parfois ce fragment lors des rafraîchissements :
    // ne plus le laisser imposer l'onglet Passés à l'ouverture.
    const removeLegacyTabHash=()=>{
      if(!/^#section-(?:objectives|current|past)$/.test(location.hash||''))return;
      if(typeof window.history?.replaceState==='function')
        window.history.replaceState(window.history.state,null,
          location.pathname+location.search);
    };
    const scrollToTop=()=>{
      if(typeof window.scrollTo!=='function')return;
      window.scrollTo(0,0);
      if(typeof window.requestAnimationFrame==='function')
        window.requestAnimationFrame(()=>window.scrollTo(0,0));
    };
    let userChangedTab=false;
    const showEntryTab=()=>{
      removeLegacyTabHash();
      userChangedTab=false;
      activateTab('objectives');
      if(window.history&&'scrollRestoration' in window.history)
        window.history.scrollRestoration='manual';
      scrollToTop();
    };
    window.addEventListener('pageshow',showEntryTab);
    showEntryTab();
    $('date-filter').addEventListener('change',e=>{state.date=e.target.value||localToday();state.manualDate=true;render();});
    $('reset-date').addEventListener('click',()=>{state.date=localToday();state.manualDate=false;$('date-filter').value=state.date;render();});
    $('search-filter').addEventListener('input',e=>{state.search=e.target.value;render();});
    $('type-filter').addEventListener('change',e=>{state.type=e.target.value;render();});
    const dialog=$('event-dialog');dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>state.lastButton?.focus());
    load().then(()=>{if(!userChangedTab)scrollToTop();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
