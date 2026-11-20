import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../docs/evenements.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/evenements.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../docs/evenements.css',import.meta.url),'utf8');
const commonCss=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
const realTeams=JSON.parse(readFileSync(new URL('../docs/data/teams.json',import.meta.url),'utf8'));
const realCharacters=JSON.parse(readFileSync(new URL('../docs/data/msf-characters.json',import.meta.url),'utf8'));

function node(tag='div'){
  const handlers=new Map();
  return {
    tag,children:[],textContent:'',value:'',checked:false,hidden:false,handlers,
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=[...children];},
    addEventListener(type,handler){handlers.set(type,handler);},
    setAttribute(name,value){this[name]=value;},
    remove(){this.removed=true;},
    showModal(){this.open=true;},
    close(){this.open=false;handlers.get('close')?.();},
    focus(){this.focused=true;}
  };
}
async function makePage({failure=false,stale=false,extraEvents=[],includeBase=true,
  teams=realTeams,characters=realCharacters,failReferences=false,hash='',search='',eligibleIds=null}={}){
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const elements=new Map(ids.map(id=>[id,node()]));
  const now=Math.floor(Date.now()/1000),day=86400;
  let sequence=0;
  const event=(name,description,{secondary=false,cap=null,points=1,dates=null}={})=>({
    id:'fixture-'+(++sequence),name,type:'milestone',
    startTime:now-day,endTime:now+day*2,
    cardArt:'https://assets.marvelstrikeforce.com/key_art/FixtureCard.jpg',
    popupArt:'https://assets.marvelstrikeforce.com/key_art/FixtureBanner.jpg',
    milestoneType:'solo',
    ...(secondary?{locationHints:['lohub_feeder']}:{}),
    milestone:{scoring:{
      methods:cap===null&&description?[{description,points}]:[],
      cappedScorings:cap!==null?[{cap,methods:[{description,points}]}]:[]
    }},
    ...(dates||{})
  });
  const events=includeBase?[
    event('Raid Event',''),
    event('Raid Event','Play Alliance Raid with an Iron Raider at Gear Tier 21',{secondary:true,cap:8}),
    event('Raid Event','Play Alliance Raid with an Iron Raider at Gear Tier 21',{secondary:true,cap:8}),
    event('War Event','Play Alliance War with an Eternal at GT21'),
    event('Daily Event','Log In for 7 Days',{cap:7}),
    event('Future Event','Battle in Raid',{dates:{startTime:now+day,endTime:now+day*5}}),
    event('Past Event','Battle in War',{dates:{startTime:now-day*5,endTime:now-day}})
  ]:[];
  for(const [name,type,more] of extraEvents){
    events.push({
      id:'fixture-'+(++sequence),name,type,
      startTime:now-day,endTime:now+day*2,
      ...(type==='milestone'?{
        cardArt:'https://assets.marvelstrikeforce.com/key_art/FixtureCard.jpg',
        popupArt:'https://assets.marvelstrikeforce.com/key_art/FixtureBanner.jpg',
        milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
      }:{}),
      ...more
    });
  }
  let onReady;
  const document={
    readyState:'loading',
    getElementById:id=>elements.get(id)||null,
    createElement:node,
    addEventListener:(type,handler)=>{if(type==='DOMContentLoaded')onReady=handler;}
  };
  // The canonical GitHub Pages JSON is mocked. No real external request.
  const fetchCalls=[],scrollCalls=[],frames=[],windowHandlers=new Map();
  const location={search,hash,pathname:'/msf/evenements.html'};
  const history={
    scrollRestoration:'auto',state:null,replacedUrls:[],
    replaceState(state,title,url){
      this.state=state;this.replacedUrls.push(url);location.hash='';
    }
  };
  const window={
    history,
    addEventListener:(event,handler)=>windowHandlers.set(event,handler),
    scrollTo:(...coordinates)=>scrollCalls.push(coordinates),
    requestAnimationFrame:callback=>{frames.push(callback);return frames.length;}
  };
  runInNewContext(script,{
    document,window,location,URLSearchParams,Intl,Date,
    fetch:async url=>{
      fetchCalls.push(url);
      if(url==='./data/teams.json')
        return failReferences?{ok:false,status:503}:{ok:true,json:async()=>teams};
      if(url==='./data/msf-characters.json')
        return failReferences?{ok:false,status:503}:{ok:true,json:async()=>characters};
      if(failure)return {ok:false,status:503};
      return {ok:true,json:async()=>({
        status:'ok',source:'verified-daily-game-events',schemaVersion:1,
        total:events.length,count:events.length,
        pages:1,updatedAt:new Date(Date.now()-(stale?3*86400000:0)).toISOString(),locale:'en',
        localizationStatus:'no-translated-text',events,
        ...(eligibleIds?{objectiveEligibility:{
          source:'scopely-player-level110-reference',
          bracket:'85_and_up',
          observedAt:new Date().toISOString(),
          eligibleEventIds:eligibleIds
        }}:{})
      })};
    }
  });
  assert.equal(typeof onReady,'function');
  onReady();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(fetchCalls,failure||stale?
    ['./data/evenements-snapshot.json']:
    ['./data/evenements-snapshot.json','./data/teams.json',
      './data/msf-characters.json']);
  elements.browser={history,windowHandlers,scrollCalls,runFrames(){
    while(frames.length)frames.shift()();
  }};
  return elements;
}
const sections=nodes=>nodes.get('events-objectives').children.filter(x=>x.tag==='section');
const objectiveNodes=nodes=>{
  const rows=[];
  const visit=element=>{
    if(element.className==='ev-objective-item')rows.push(element);
    for(const child of element.children||[])visit(child);
  };
  visit(nodes.get('events-objectives'));
  return rows;
};
const actions=nodes=>objectiveNodes(nodes).map(item=>item.children[0].textContent);
const objectiveDetails=(nodes,cssClass)=>{
  const details=[];
  const visit=element=>{
    if(element.tag==='details'&&element.className===cssClass)details.push(element);
    for(const child of element.children||[])visit(child);
  };
  visit(nodes.get('events-objectives'));return details;
};
const calendarGroups=(nodes,key='current')=>nodes.get('events-'+key).children.filter(child=>child.tag==='section');
const cards=(nodes,key='current')=>calendarGroups(nodes,key).flatMap(group=>group.children[1].children);
const titles=(nodes,key='current')=>cards(nodes,key).map(card=>card.children[1].children[1].textContent);
const groupTitles=(nodes,key='current')=>calendarGroups(nodes,key).map(group=>group.children[0].children[0].textContent);


test('Le profil niveau 110 affiche seulement les feeders autorisés par ID Scopely',async()=>{
  const extra=[
    ['Briseur','milestone',{locationHints:['lohub_wrapper']}],
    ['Briseur','milestone',{locationHints:['lohub_feeder'],milestone:{
      type:'solo',scoring:{methods:[{description:'Combattre en raid',points:1}],cappedScorings:[]}}}],
    ['Briseur','milestone',{locationHints:['lohub_feeder'],milestone:{
      type:'solo',scoring:{methods:[{description:'Combattre en guerre',points:1}],cappedScorings:[]}}}]
  ];
  const unfiltered=await makePage({includeBase:false,extraEvents:extra});
  assert.equal(unfiltered.get('stat-objectives').textContent,'2');
  const selected=await makePage({includeBase:false,extraEvents:extra,
    eligibleIds:['fixture-1','fixture-2']});
  assert.equal(selected.get('stat-objectives').textContent,'1');
  assert.ok(actions(selected).some(x=>x.includes('raid')));
  assert.ok(!actions(selected).some(x=>x.includes('guerre')));
  assert.ok(selected.get('events-objectives').children[0].textContent.includes(
    'Référence niveau 110 vérifiée'));
  const invalid=await makePage({includeBase:false,extraEvents:extra,
    eligibleIds:['unknown-event-id']});
  assert.equal(invalid.get('stat-objectives').textContent,'2');
  assert.ok(invalid.get('events-objectives').children[0].textContent.includes(
    'éligibilité personnelle des missions n’est pas vérifiée'));
});

test('Le résumé rassemble les objectifs actifs, y compris les feeders, sans doublons',async()=>{
  const nodes=await makePage();
  assert.equal(nodes.get('stat-objectives').textContent,'3');
  assert.equal(nodes.get('count-objectives').textContent,'3');
  assert.deepEqual(sections(nodes).map(x=>x.children[0].textContent),[
    '🛡️ RAID','⚔️ GUERRE','📋 DIVERS'
  ]);
  assert.equal(actions(nodes).filter(x=>x.includes('Iron Raider')).length,1);
  assert.ok(actions(nodes).some(x=>x.includes('palier G21')));
  assert.ok(actions(nodes).some(x=>x.includes('7 jours')));
  assert.ok(!actions(nodes).some(x=>x.includes('Future')));
});

test('Un plafond de scoring reste un maximum, pas un objectif obligatoire',async()=>{
  const nodes=await makePage();
  const raid=objectiveNodes(nodes).find(row=>row.children[0].textContent.includes('Iron Raider'));
  const notes=raid.children[1].children.map(x=>x.textContent);
  assert.ok(notes.some(x=>x.includes('(plafond 8 pts de progression)')));
  assert.ok(notes.some(x=>x.includes('8 actions comptabilisées en 3 jours')));
  const login=objectiveNodes(nodes).find(row=>row.children[0].textContent.includes('7 jours'));
  const loginNotes=login.children[1].children.map(x=>x.textContent);
  assert.ok(loginNotes.some(x=>x.includes('(plafond 7 pts)')));
  assert.ok(!loginNotes.some(x=>x.includes('7 fois')));
});

test('Le détail distingue pt et pts, la journée et la période de sept jours',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const week={startTime:now-day,endTime:now+6*day};
  const daily={startTime:now-3600,endTime:now+23*3600};
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Raid de la semaine','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:6,methods:[{description:'Combattre en raid',points:1}]},
        {cap:24,methods:[{description:'Combattre en raid',points:1}]}
      ]}}
    }],
    ['Raid quotidien','milestone',{
      ...daily,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:1,methods:[{description:'Combattre en raid',points:1}]}
      ]}}
    }],
    ['Raid alliance','milestone',{
      ...week,milestone:{type:'alliance',scoring:{methods:[],cappedScorings:[
        {cap:144000,methods:[{description:'Faire un combat en raid',points:125}]}
      ]}}
    }],
    ['Guerre à plafond partagé','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:10,methods:[
          {description:'Combattre en guerre',points:1},
          {description:'Faire un combat en guerre',points:2}
        ]}
      ]}}
    }]
  ]});
  const allRows=objectiveNodes(nodes);
  assert.equal(allRows.length,6);
  const field=(row,name)=>row.children[1].children
    .find(el=>el.className===name)?.textContent;
  const rowForCap=cap=>allRows.find(row=>
    field(row,'ev-objective-cap')===cap);
  for(const [cap,count] of [['(plafond 6 pts)',6],['(plafond 24 pts)',24]]){
    const row=rowForCap(cap);
    assert.ok(row,cap);
    assert.equal(field(row,'ev-objective-score'),'+ 1 pt par action');
    assert.equal(field(row,'ev-objective-quantity'),
      count+' actions comptabilisées en 7 jours');
  }
  const dayRow=rowForCap('(plafond 1 pt)');
  assert.ok(dayRow);
  assert.equal(field(dayRow,'ev-objective-score'),'+ 1 pt par action');
  assert.equal(field(dayRow,'ev-objective-quantity'),
    '1 action comptabilisée par jour');
  const alliance=allRows.find(row=>field(row,'ev-objective-quantity')===
    'Plafond d’alliance : '+new Intl.NumberFormat('fr-FR').format(144000)+' pts sur 7 jours');
  assert.ok(alliance);
  assert.equal(field(alliance,'ev-objective-score'),'+ 125 pts par action');
  assert.equal(field(alliance,'ev-objective-cap'),undefined);
  const shared=allRows.filter(row=>
    (field(row,'ev-objective-cap')||'').includes('plafond partagé'));
  assert.equal(shared.length,2);
  assert.ok(shared.every(row=>field(row,'ev-objective-quantity')==='Période : 7 jours'));
  assert.ok(allRows.every(row=>
    !row.children[1].children.some(child=>/pt\(s\)|\/ action|Jusqu’à/.test(child.textContent))));
});

test('Le plafond alliance indique sa portée collective et sa période sur une ligne dédiée',async()=>{
  const day=86400,now=Math.floor(Date.now()/1000);
  const week={startTime:now-day,endTime:now+6*day};
  const daily={startTime:now-3600,endTime:now+23*3600};
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Zone de guerre du raid','milestone',{
      ...week,milestone:{type:'alliance',scoring:{methods:[],cappedScorings:[
        {cap:384000,methods:[{description:'Combattre en guerre',points:800}]}
      ]}}
    }],
    ['Alliance quotidienne','milestone',{
      ...daily,milestone:{type:'alliance',scoring:{methods:[],cappedScorings:[
        {cap:1,methods:[{description:'Combattre en raid',points:1}]}
      ]}}
    }],
    ['Objectif solo','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:6,methods:[{description:'Combattre en raid',points:1}]}
      ]}}
    }]
  ]});
  const rows=objectiveNodes(nodes);
  assert.equal(rows.length,3);
  const value=(row,cls)=>row.children[1].children.find(c=>c.className===cls)?.textContent;
  const alliance=rows.find(row=>value(row,'ev-objective-score')==='+ 800 pts par action');
  assert.ok(alliance);
  assert.equal(value(alliance,'ev-objective-quantity'),
    'Plafond d’alliance : '+new Intl.NumberFormat('fr-FR').format(384000)+' pts sur 7 jours');
  assert.equal(value(alliance,'ev-objective-cap'),undefined);
  assert.ok(!alliance.children[1].children.some(x=>x.textContent.includes('Période :')));
  const today=rows.find(row=>value(row,'ev-objective-quantity')==='Plafond d’alliance : 1 pt sur 24 h');
  assert.ok(today);
  assert.equal(value(today,'ev-objective-score'),'+ 1 pt par action');
  const solo=rows.find(row=>value(row,'ev-objective-cap')==='(plafond 6 pts)');
  assert.ok(solo);
  assert.equal(value(solo,'ev-objective-quantity'),'6 actions comptabilisées en 7 jours');
  assert.ok(!solo.children[1].children.some(x=>x.textContent.includes('Plafond d’alliance')));
});

test('Les points internes sont distincts des points d’événement gagnés',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Plan de bataille','milestone',{
      locationHints:['lohub_wrapper'],milestone:{type:'solo',scoring:{
        methods:[],cappedScorings:[]}}}],
    ['Plan de bataille','milestone',{
      locationHints:['lohub_feeder'],milestone:{type:'solo',scoring:{
        methods:[],cappedScorings:[
          {cap:1,rewardTier:8,isPremium:true,eventPoints:5,
            methods:[{description:'Combattre avec Ultron au palier d’équipement 21',points:1}]},
          {cap:3,rewardTier:2,eventPoints:20,
            methods:[{description:'Combattre avec Cyclope (Puissant)',points:1}]}
        ]}}}],
    ['Plan de bataille','milestone',{
      locationHints:['lohub_feeder'],milestone:{type:'solo',scoring:{
        methods:[],cappedScorings:[
          {cap:2,rewardTier:2,methods:[{description:'Combattre dans l’arène',points:1}]}
        ]}}}]
  ]});
  const rows=objectiveNodes(nodes);
  assert.equal(rows.length,3);
  const field=(row,cls)=>row.children[1].children.find(c=>c.className===cls)?.textContent;
  // Les fiches de personnage affichent une condition courte dans la ligne ;
  // sélectionner par récompense, pas par le nom porté par la fiche parent.
  const ultron=rows.find(row=>field(row,'ev-objective-reward')==='Récompense : 5 pts d’événement');
  const cyclops=rows.find(row=>field(row,'ev-objective-reward')==='Récompense : 20 pts d’événement');
  const missing=rows.find(row=>!field(row,'ev-objective-reward'));
  assert.ok(ultron);
  assert.ok(cyclops);
  assert.ok(missing);
  assert.equal(field(ultron,'ev-objective-score'),'+ 1 pt de progression par action');
  assert.equal(field(ultron,'ev-objective-cap'),'(plafond 1 pt de progression)');
  assert.equal(field(ultron,'ev-objective-reward'),'Récompense : 5 pts d’événement');
  assert.equal(field(ultron,'ev-objective-premium'),'Objectif supérieur');
  assert.equal(field(cyclops,'ev-objective-reward'),'Récompense : 20 pts d’événement');
  assert.equal(field(missing,'ev-objective-reward'),undefined);
  assert.equal(field(missing,'ev-objective-score'),'+ 1 pt de progression par action');
});

test('Des objectifs avec mêmes conditions mais récompenses distinctes restent visibles',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Plan de bataille','milestone',{
      locationHints:['lohub_wrapper'],milestone:{type:'solo',scoring:{
        methods:[],cappedScorings:[]}}}],
    ['Plan de bataille','milestone',{
      locationHints:['lohub_feeder'],milestone:{type:'solo',scoring:{
        methods:[],cappedScorings:[
          {cap:1,rewardTier:2,eventPoints:10,
            methods:[{description:'Combattre en raid',points:1}]},
          {cap:1,rewardTier:3,eventPoints:30,
            methods:[{description:'Combattre en raid',points:1}]}
        ]}}}]
  ]});
  const rows=objectiveNodes(nodes);
  assert.equal(rows.length,2);
  const earned=rows.map(row=>row.children[1].children
    .find(c=>c.className==='ev-objective-reward')?.textContent);
  assert.ok(earned.includes('Récompense : 10 pts d’événement'));
  assert.ok(earned.includes('Récompense : 30 pts d’événement'));
});

test('Les objectifs secondaires restent présents sans barre de recherche',async()=>{
  const nodes=await makePage();
  assert.equal(nodes.get('stat-objectives').textContent,'3');
  assert.ok(actions(nodes).some(x=>x.includes('Iron Raider')));
  assert.equal(nodes.get('search-filter'),undefined);
  assert.equal(nodes.get('type-filter'),undefined);
  assert.equal(nodes.get('date-filter'),undefined);
  assert.equal(nodes.get('reset-date'),undefined);
  assert.equal(nodes.get('filter-context'),undefined);
  assert.doesNotMatch(html,/class="ev-toolbar"|Filtres du calendrier/);
  assert.doesNotMatch(script,/state\.search|state\.type|manualDate|localToday/);
});

test('Faille cybernétique : 30 conditions réparties sur 2 équipes et 10 portraits',async()=>{
  const targets=realTeams.filter(team=>['Avengers IA','Fantassin de fer'].includes(team.team));
  assert.equal(targets.length,2);
  const characters=targets.flatMap(team=>team.characters.map(id=>{
    const character=realCharacters.find(c=>c.id===id);
    assert.ok(character,'Personnage manquant dans le catalogue : '+id);
    return character;
  }));
  const cappedScorings=characters.flatMap(character=>[
    {cap:13000,methods:[{description:'Combattre en choc avec '+character.nameKey,points:1000}]},
    {cap:30000,methods:[{description:'Combattre en choc avec '+character.nameKey+' à 7 étoiles jaunes',points:6000}]},
    {cap:50000,methods:[{description:'Combattre en choc avec '+character.nameKey+' au palier d’équipement 21',points:10000}]}
  ]);
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Faille cybernétique','milestone',{
      milestone:{type:'solo',scoring:{
        methods:[{description:'Dépenser 1 noyau d’énergie',points:20}],
        cappedScorings
      }}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'31');
  assert.deepEqual(sections(nodes).map(m=>m.children[0].textContent),['⚡ CHOC','📋 DIVERS']);
  const teams=objectiveDetails(nodes,'ev-objective-team');
  assert.deepEqual(teams.map(team=>team.children[0].children[0].textContent),
    ['Avengers IA','Fantassin de fer']);
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,10);
  assert.equal(objectiveNodes(nodes).length,31);
  const names=objectiveDetails(nodes,'ev-objective-character').map(card=>
    card.children[0].children.find(child=>child.tag==='strong').textContent);
  for(const character of characters)assert.ok(names.includes(character.nameKey));
  for(const card of objectiveDetails(nodes,'ev-objective-character')){
    assert.ok(card.children[0].children.some(child=>child.tag==='img'&&
      child.src?.startsWith('https://assets.marvelstrikeforce.com/imgs/Portrait_')));
    assert.equal(card.children[1].children.length,3);
  }
  const ch=objectiveDetails(nodes,'ev-objective-character')[0];
  assert.deepEqual(ch.children[1].children.map(row=>row.children[0].textContent),
    ['Combat','7 étoiles jaunes','Palier d’équipement 21']);
  const caps=ch.children[1].children.map(row=>row.children[1].children.map(x=>x.textContent).join(' '));
  assert.ok(caps.some(x=>x.includes('13 000 pts')||x.includes('13 000 pts')));
  assert.ok(caps.some(x=>x.includes('30 000 pts')||x.includes('30 000 pts')));
  assert.ok(caps.some(x=>x.includes('50 000 pts')||x.includes('50 000 pts')));
  assert.doesNotMatch(script,/Avengers IA|Fantassin de fer|IronMonger|HawkeyeRobot/);

  // Le regroupement des deux équipes reste intact sans filtre de catégorie.
  assert.equal(nodes.get('stat-objectives').textContent,'31');
  assert.equal(objectiveDetails(nodes,'ev-objective-team').length,2);
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,10);
  assert.equal(objectiveNodes(nodes).length,31);
});

test('Conclave de l’Ombre : les 5 membres sont visibles même sans objectifs individuels',async()=>{
  const team=realTeams.find(entry=>entry.team==="Conclave de l'Ombre"&&entry.mode==='Guerre');
  assert.ok(team);
  assert.equal(team.characters.length,5);
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['L’essor de l’ombre','milestone',{
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:200,methods:[{
          description:"Combattre en guerre avec le Conclave de l'Ombre",
          points:25
        }]}
      ]}}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'1');
  const teams=objectiveDetails(nodes,'ev-objective-team');
  assert.equal(teams.length,1);
  assert.equal(teams[0].children[0].children[0].textContent,"Conclave de l'Ombre");
  assert.equal(teams[0].children[0].children[1].textContent,'5 personnages · 1 objectif');
  const summary=teams[0].children[0];
  const people=teams[0].children[1];
  const roster=summary.children.find(node=>node.className==='ev-objective-team-roster');
  assert.ok(roster,'La composition reste visible dans le summary fermé');
  assert.equal(roster.tag,'span');
  assert.ok(!teams[0].open);
  assert.equal(roster.children.length,5);
  assert.ok(!people.children.some(node=>node.className==='ev-objective-team-roster'),
    'Ne pas répéter les portraits dans le contenu ouvert');
  assert.deepEqual(roster.children.map(member=>
    member.children.find(child=>child.tag==='span')?.textContent),
    team.characters.map(id=>realCharacters.find(character=>character.id===id).nameKey));
  assert.equal(roster.children.filter(member=>
    member.children.some(child=>child.tag==='img')).length,5);
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,0);
  assert.equal(objectiveNodes(nodes).length,1);
  const details=objectiveNodes(nodes)[0].children[1].children.map(child=>child.textContent);
  assert.ok(details.some(value=>value.includes('25')));
  assert.ok(details.some(value=>value.includes('200')));
  assert.match(css,/\.ev-objective-team-summary>\.ev-objective-team-roster\{/);
  assert.match(css,/\.ev-objective-heading\{[^}]*font-size:20px/);
  assert.match(css,/\.ev-objective-team-member\{[^}]*clamp\(32px,10\.5vw,44px\)/);
  assert.match(css,/\.ev-objective-team-member \.ev-objective-portrait\{[^}]*object-fit:contain/);
  assert.match(css,/flex-wrap:nowrap/);
  assert.match(css,/order:1;flex:0 0 100%/);
  assert.match(css,/\.ev-objective-team-member-name\{position:absolute/);
});

test('Avengers IA et Fantassin de fer affichent chacun leurs 5 portraits sur le panneau fermé',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Objectifs d’équipe','milestone',{milestone:{type:'solo',scoring:{
      methods:[
        {description:'Combattre en choc avec tous les membres des Avengers I.A.',points:10},
        {description:'Combattre en choc avec tous les membres des Fantassins de fer',points:10}
      ],cappedScorings:[]
    }}}]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  const groups=objectiveDetails(nodes,'ev-objective-team');
  assert.deepEqual(groups.map(group=>group.children[0].children[0].textContent),
    ['Avengers IA','Fantassin de fer']);
  for(const group of groups){
    const summary=group.children[0];
    const roster=summary.children.find(child=>child.className==='ev-objective-team-roster');
    assert.ok(roster);
    assert.equal(roster.children.length,5);
    assert.ok(!group.open);
    assert.ok(roster.children.every(member=>
      member.children.some(child=>child.tag==='img')));
    assert.ok(!group.children[1].children.some(child=>
      child.className==='ev-objective-team-roster'));
  }
});

test('Une équipe avec 2 bonus individuels montre 5 membres sans inventer de méthodes',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Objectif Guerre','milestone',{
      milestone:{type:'solo',scoring:{methods:[
        {description:"Combattre en guerre avec le Conclave de l'Ombre",points:25},
        {description:'Combattre en guerre avec Thanos',points:10},
        {description:'Combattre en guerre avec Sylvie',points:10}
      ],cappedScorings:[]}}
    }]
  ]});
  const team=objectiveDetails(nodes,'ev-objective-team')[0];
  assert.ok(team);
  assert.equal(team.children[0].children[1].textContent,'5 personnages · 3 objectifs');
  assert.equal(team.children[0].children.find(child=>
    child.className==='ev-objective-team-roster').children.length,5);
  assert.ok(!team.children[1].children.some(child=>
    child.className==='ev-objective-team-roster'));
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,2);
  assert.equal(objectiveNodes(nodes).length,3);
  assert.equal(nodes.get('stat-objectives').textContent,'3');
});

test('Événements distincts : conditions avec mode imposé et combats généraux restent séparés',async()=>{
  const scenarios=[
    {
      team:"Combattre en guerre avec tous les membres du Conclave de l'Ombre",
      thanos:'Combattre avec Thanos',
      sylvie:'Combattre avec Sylvie'
    },
    {
      team:"Combattre avec tous les membres du Conclave de l'Ombre",
      thanos:'Combattre en guerre avec Thanos',
      sylvie:'Combattre en guerre avec Sylvie'
    }
  ];
  for(const scenario of scenarios){
    // Trois événements indépendants, dont deux méthodes sans mode précisé
    // selon le scénario. Les points et leurs provenances restent indépendants.
    const nodes=await makePage({includeBase:false,extraEvents:[
      ['Événement Équipe','milestone',{milestone:{type:'solo',scoring:{
        methods:[],cappedScorings:[{cap:200,methods:[
          {description:scenario.team,points:25}
        ]}]
      }}}],
      ['Événement Thanos','milestone',{milestone:{type:'solo',scoring:{
        methods:[{description:scenario.thanos,points:10}],
        cappedScorings:[]
      }}}],
      ['Événement Sylvie','milestone',{milestone:{type:'solo',scoring:{
        methods:[{description:scenario.sylvie,points:15}],
        cappedScorings:[]
      }}}]
    ]});
    assert.equal(nodes.get('stat-objectives').textContent,'3');
    assert.equal(objectiveNodes(nodes).length,3);
    assert.deepEqual(sections(nodes).map(section=>section.children[0].textContent),
      ['⚔️ GUERRE','⚡ CHOC']);
    const groups=objectiveDetails(nodes,'ev-objective-team');
    assert.equal(groups.length,2);
    for(const group of groups){
      assert.equal(group.children[0].children[0].textContent,"Conclave de l'Ombre");
      const roster=group.children[0].children.find(child=>
        child.className==='ev-objective-team-roster');
      assert.equal(roster.children.length,5);
      assert.ok(!group.children[1].children.some(child=>
        child.className==='ev-objective-team-roster'));
    }
    const explicitTeam=scenario.team.includes('en guerre');
    assert.deepEqual(groups.map(group=>group.children[0].children[1].textContent),
      explicitTeam?['5 personnages · 1 objectif','5 personnages · 2 objectifs']:
        ['5 personnages · 2 objectifs','5 personnages · 1 objectif']);
    const members=objectiveDetails(nodes,'ev-objective-character');
    assert.equal(members.length,2);
    const names=members.map(member=>
      member.children[0].children.find(part=>part.tag==='strong').textContent);
    assert.deepEqual(names.sort(),['Sylvie','Thanos']);
    assert.equal(objectiveDetails(nodes,'ev-objective-event-group').length,0);
    const sources=objectiveNodes(nodes).map(row=>row.children[1].children
      .map(part=>part.textContent).join(' ')).join(' | ');
    for(const title of ['Événement Équipe','Événement Thanos','Événement Sylvie'])
      assert.ok(sources.includes(title),'Source manquante : '+title);
    assert.ok(sources.includes('200'),'Le plafond officiel doit être conservé');
    assert.ok(sources.includes('25'),'Les points de l’équipe doivent être conservés');
  }
});

test('Personnage isolé ou équipes qui se chevauchent : aucune méthode dupliquée',async()=>{
  const names=['Vision','Ultron'].map(id=>realCharacters.find(c=>c.id===id));
  const extraEvents=[['Objectif test','milestone',{
    milestone:{type:'solo',scoring:{
      methods:names.map(c=>({description:'Combattre en choc avec '+c.nameKey,points:1000})),
      cappedScorings:[]
    }}
  }]];
  const overlapTeams=[
    {team:'Équipe Alpha',characters:['Vision','Ultron']},
    {team:'Équipe Bêta',characters:['Vision','Ultron']}
  ];
  const nodes=await makePage({includeBase:false,extraEvents,teams:overlapTeams});
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  assert.equal(objectiveDetails(nodes,'ev-objective-team').length,1);
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,2);
  assert.equal(objectiveNodes(nodes).length,2);
  const solo=await makePage({includeBase:false,teams:realTeams,extraEvents:[
    ['Solo test','milestone',{
      milestone:{type:'solo',scoring:{methods:[
        {description:'Combattre en choc avec Vision',points:1000}
      ],cappedScorings:[]}}
    }]
  ]});
  assert.equal(objectiveDetails(solo,'ev-objective-team').length,0);
  assert.equal(objectiveDetails(solo,'ev-objective-character').length,1);
  assert.equal(objectiveNodes(solo).length,1);
});

test('Catalogues complémentaires indisponibles : méthodes et plafonds restent visibles',async()=>{
  const nodes=await makePage({includeBase:false,failReferences:true,extraEvents:[
    ['Phase test','milestone',{
      milestone:{type:'solo',scoring:{methods:[],
        cappedScorings:[{cap:13000,methods:[
          {description:'Combattre en choc avec Vision',points:1000}
        ]}]
      }}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'1');
  assert.equal(objectiveDetails(nodes,'ev-objective-team').length,0);
  assert.equal(objectiveNodes(nodes).length,1);
  assert.ok(actions(nodes)[0].includes('Vision'));
  assert.ok(objectiveNodes(nodes)[0].children[1].children
    .some(x=>x.textContent.includes('13')));
  assert.ok(!nodes.get('source-line').textContent.includes('indisponible'));
  assert.match(css,/\.ev-objective-portrait/);
  assert.match(css,/\.ev-objective-character-summary/);
});

test('Objectifs généraux : équipe complète, personnages et Choc se retrouvent dans un seul groupe',async()=>{
  const fixture=[
    ['Faille cybernétique','milestone',{
      milestone:{type:'solo',scoring:{
        methods:[
          {description:'Combattre en choc avec Vision',points:1000},
          {description:'Combattre en choc avec Ultron à 7 étoiles jaunes',points:6000},
          {description:'Combattre en choc avec Crossbones',points:1000},
          {description:'Combattre en choc avec Whiplash',points:1000}
        ],cappedScorings:[]
      }}
    }],
    ['Briseur de volontés - Plan de bataille du mois 1','milestone',{
      locationHints:['lohub_wrapper'],
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
    }],
    ['Briseur de volontés - Plan de bataille du mois 1','milestone',{
      locationHints:['lohub_feeder'],
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:1,methods:[{description:'Combattre avec tous les membres des Avengers I.A.',points:1}]},
        {cap:1,methods:[{description:'Combattre avec tous les membres des Fantassins de fer',points:1}]},
        {cap:1,methods:[{description:'Combattre avec Vision au palier d’équipement 19',points:1}]},
        {cap:1,methods:[{description:'Combattre avec Crossbones au palier d’équipement 19',points:1}]}
      ]}}
    }]
  ];
  const nodes=await makePage({includeBase:false,extraEvents:fixture});
  assert.equal(nodes.get('stat-objectives').textContent,'8');
  assert.equal(objectiveNodes(nodes).length,8);
  assert.deepEqual(sections(nodes).map(s=>s.children[0].textContent),['⚡ CHOC']);
  const teams=objectiveDetails(nodes,'ev-objective-team');
  assert.deepEqual(teams.map(team=>team.children[0].children[0].textContent),
    ['Avengers IA','Fantassin de fer']);
  const teamGoals=teams.map(team=>team.children[1].children.find(c=>c.className==='ev-objective-list'));
  assert.ok(teamGoals.every(Boolean));
  assert.ok(teamGoals[0].children[0].children[0].textContent.includes('tous les membres des Avengers'));
  assert.ok(teamGoals[1].children[0].children[0].textContent.includes('tous les membres des Fantassins'));
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,4);
  assert.equal(objectiveDetails(nodes,'ev-objective-event-group').length,0);
  const vision=objectiveDetails(nodes,'ev-objective-character').find(card=>
    card.children[0].children.some(c=>c.tag==='strong'&&c.textContent==='Vision'));
  assert.equal(vision.children[1].children.length,2);
  assert.ok(vision.children[1].children.some(row=>row.children[0].textContent==='Palier d’équipement 19'));
  const general=objectiveNodes(nodes).filter(row=>
    row.children[1].children.some(c=>c.textContent?.includes('Tous modes')));
  assert.equal(general.length,4);
  for(const row of general){
    assert.ok(row.children[1].children.some(c=>c.textContent?.includes('Briseur de volontés')));
    assert.ok(row.children[1].children.some(c=>c.textContent?.includes('(plafond 1 pt de progression)')));
  }
  assert.ok(objectiveNodes(nodes).some(row=>row.children[1].children.some(c=>
    c.textContent?.includes('1000')||c.textContent?.includes('1 000')||
    c.textContent?.includes('1 000'))));
  assert.equal(objectiveNodes(nodes).length,Number(nodes.get('stat-objectives').textContent));
});

test('Raid et Guerre gardent les combats imposés ; les combats généraux vont dans Choc',async()=>{
  const fixture=[
    ['Objectifs Raid','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en raid avec Crossbones',points:100}],
      cappedScorings:[]}}}],
    ['Objectifs Guerre','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en guerre avec Vision',points:200}],
      cappedScorings:[]}}}],
    ['Objectifs généraux','milestone',{milestone:{type:'solo',scoring:{
      methods:[
        {description:'Combattre avec Crossbones',points:1},
        {description:'Combattre avec Vision',points:1},
        {description:'Dépenser des noyaux d’énergie',points:5}
      ],cappedScorings:[]}}}]
  ];
  const nodes=await makePage({includeBase:false,extraEvents:fixture});
  assert.equal(nodes.get('stat-objectives').textContent,'5');
  assert.equal(objectiveNodes(nodes).length,5);
  assert.deepEqual(sections(nodes).map(s=>s.children[0].textContent),
    ['🛡️ RAID','⚔️ GUERRE','⚡ CHOC','📋 DIVERS']);
  assert.equal(sections(nodes)[0].children[0].children[0].textContent,'1 objectif');
  assert.equal(sections(nodes)[1].children[0].children[0].textContent,'1 objectif');
  assert.equal(sections(nodes)[2].children[0].children[0].textContent,'2 objectifs');
  assert.equal(sections(nodes)[3].children[0].children[0].textContent,'1 objectif');
  const general=objectiveNodes(nodes).filter(row=>
    row.children[1].children.some(c=>c.textContent?.includes('Tous modes')));
  assert.equal(general.length,2);
  const walk=(node)=>[node,...node.children.flatMap(walk)];
  assert.ok(general.every(row=>walk(sections(nodes)[2]).includes(row)));
  assert.ok(actions(nodes).includes('Dépenser des noyaux d’énergie'));
});

test('Les combats généraux actifs vont dans Choc même sans combat Choc explicite',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const active={startTime:now-day,endTime:now+day};
  const expired={startTime:now-2*day,endTime:now};
  const future={startTime:now+day,endTime:now+2*day};
  const combat=(description)=>({type:'solo',scoring:{
    methods:[{description,points:1}],cappedScorings:[]}});
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Plan de bataille','milestone',{...active,locationHints:['lohub_wrapper']}],
    ['Plan de bataille','milestone',{...active,locationHints:['lohub_feeder'],
      milestone:combat('Combattre avec tous les membres des Avengers I.A.')}],
    ['Plan de bataille','milestone',{...active,locationHints:['lohub_feeder'],
      milestone:combat('Combattre avec tous les membres des Fantassins de fer')}],
    ['Plan de bataille','milestone',{...expired,locationHints:['lohub_feeder'],
      milestone:combat('Combattre avec tous les membres de Menace')}],
    ['Plan de bataille','milestone',{...future,locationHints:['lohub_feeder'],
      milestone:combat('Combattre avec tous les membres de Nightreaver')}],
    ['Prêt au combat','milestone',{...active,
      milestone:combat('Jouer avec Cyclope (Puissant)')}],
    ['Divers','milestone',{...active,milestone:combat('Se connecter')}],
    ['Épreuve','milestone',{...active,
      milestone:combat('Combattre dans l’Épreuve cosmique avec les Guerriers audacieux')}]
  ],eligibleIds:['fixture-1','fixture-2','fixture-4','fixture-5']});
  assert.equal(nodes.get('stat-objectives').textContent,'4');
  assert.equal(objectiveNodes(nodes).length,4);
  assert.deepEqual(sections(nodes).map(section=>section.children[0].textContent),
    ['⚡ CHOC','🔷 ÉPREUVE COSMIQUE','📋 DIVERS']);
  assert.equal(sections(nodes)[0].children[0].children[0].textContent,'2 objectifs');
  const walk=node=>[node,...node.children.flatMap(walk)];
  const choc=walk(sections(nodes)[0]).filter(node=>node.className==='ev-objective-item');
  assert.equal(choc.length,2);
  assert.ok(choc.every(row=>row.children[1].children.some(c=>c.textContent?.includes('Tous modes'))));
  assert.ok(actions(nodes).some(label=>label.includes('Avengers')));
  assert.ok(!actions(nodes).some(label=>/Fantassins|Menace|Nightreaver/.test(label)));
});

test('Un combat transversal est compté une fois même si plusieurs modes lui conviennent',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Tests Choc','milestone',{milestone:{type:'solo',scoring:{
      methods:[
        {description:'Combattre en choc avec Vision',points:100},
        {description:'Combattre en choc avec Ultron',points:100}
      ],cappedScorings:[]}}}],
    ['Tests Raid','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en raid avec Crossbones',points:100}],
      cappedScorings:[]}}}],
    ['Tests transversaux','milestone',{milestone:{type:'solo',scoring:{
      methods:[
        {description:'Jouer n’importe quel combat',points:1},
        {description:'Se connecter',points:1}
      ],cappedScorings:[]}}}]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'5');
  assert.equal(objectiveNodes(nodes).length,5);
  const modes=sections(nodes).map(s=>s.children[0].textContent);
  assert.deepEqual(modes,['🛡️ RAID','⚡ CHOC','📋 DIVERS']);
  const generic=objectiveNodes(nodes).filter(row=>row.children[0].textContent.includes('n’importe quel combat'));
  assert.equal(generic.length,1);
  assert.ok(generic[0].children[1].children.some(c=>c.textContent?.includes('Tous modes')));
  assert.ok(actions(nodes).includes('Se connecter'));
});

test('Toutes les ouvertures d’orbes et méga-orbes partagent une fiche, sans perdre leurs libellés',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Faille cybernétique','milestone',{milestone:{type:'solo',scoring:{
      methods:[
        {description:'Ouvrir un méga orbe orange',points:200000},
        {description:'Ouvrir un méga orbe des Avengers I.A.',points:200000},
        {description:'Ouvrir un méga orbe des Fantassins de fer',points:200000}
      ],cappedScorings:[]
    }}}],
    ['Rayonnement de l’ombre','milestone',{milestone:{type:'solo',scoring:{
      methods:[],cappedScorings:[{cap:300,methods:[
        {description:'Ouvrir 1 orbe de losange de l’ombre',points:100}
      ]}]
    }}}],
    ['L’essor de l’ombre','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Ouvrir 1 orbe L’essor de l’ombre',points:100}],
      cappedScorings:[]
    }}}],
    ['Orbes du Raid','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Open 1 Raid Orb',points:50}],
      cappedScorings:[]
    }}}],
    ['Fragments','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:"Obtenir 1 fragment d'orbe de ravitaillement allié XIII",points:1}],
      cappedScorings:[]
    }}}],
    ['Récompenses','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Obtenir un méga orbe orange',points:500}],
      cappedScorings:[]
    }}}]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'8');
  assert.equal(objectiveNodes(nodes).length,8);
  assert.deepEqual(sections(nodes).map(section=>section.children[0].textContent),
    ['📋 DIVERS']);
  const groups=objectiveDetails(nodes,'ev-objective-event-group');
  const orbGroups=groups.filter(group=>
    group.children[0].children[0].textContent==='Ouverture d’orbes');
  assert.equal(orbGroups.length,1);
  const orb=orbGroups[0];
  assert.equal(orb.children[0].children[1].textContent,'6 objectifs');
  // Tous les types d'orbes restent visibles avec leur événement, sans
  // mélanger leurs plafonds ni ajouter un plafond commun fictif.
  assert.equal(orb.children[0].children.filter(child=>
    child.className==='ev-objective-limit').length,0);
  const sources=orb.children[1].children;
  assert.deepEqual(sources.map(source=>source.children[0].children[0].textContent)
    .sort(),['Faille cybernétique','Rayonnement de l’ombre','L’essor de l’ombre',
      'Orbes du Raid'].sort());
  const rows=sources.flatMap(source=>source.children[1].children);
  assert.equal(rows.length,6);
  assert.ok(rows.every(row=>row.children[0].hidden===false));
  const labels=rows.map(row=>row.children[0].textContent);
  assert.deepEqual(labels.sort(),[
    'Ouvrir un méga orbe orange',
    'Ouvrir un méga orbe des Avengers I.A.',
    'Ouvrir un méga orbe des Fantassins de fer',
    'Ouvrir 1 orbe de losange de l’ombre',
    'Ouvrir 1 orbe L’essor de l’ombre',
    'Open 1 Raid Orb'
  ].sort());
  const capped=rows.find(row=>row.children[0].textContent.includes('losange'));
  assert.ok(capped.children[1].children.some(x=>x.textContent.includes('(plafond 300 pts)')));
  assert.ok(capped.children[1].children.some(x=>x.textContent.includes('100 pts par action')));
  assert.ok(rows[0].children[1].children.some(x=>x.textContent.includes('200')));
  assert.equal(groups.filter(group=>group!==orb).length,2);
  assert.ok(groups.some(group=>group.children[0].children[0].textContent.includes('fragment')));
  assert.ok(groups.some(group=>group.children[0].children[0].textContent.includes('Obtenir un méga orbe')));

  assert.equal(nodes.get('stat-objectives').textContent,'8');
  assert.equal(objectiveDetails(nodes,'ev-objective-event-group').length,3);
  assert.equal(objectiveNodes(nodes).length,8);
  assert.equal(nodes.get('search-filter'),undefined);
});

test('Une même action Raid ou Guerre rassemble les événements et conserve chaque barème',async()=>{
  const title='Briseur de volontés - Plan de bataille du mois 1';
  const nodes=await makePage({includeBase:false,extraEvents:[
    [title,'milestone',{
      locationHints:['lohub_wrapper'],
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
    }],
    [title,'milestone',{
      locationHints:['lohub_feeder'],
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:24,methods:[{description:'Combattre en raid',points:1}]},
        {cap:6,methods:[{description:'Combattre en raid',points:1}]},
        {cap:5,methods:[{description:'Combattre en guerre',points:1}]}
      ]}}
    }],
    ['Zone de guerre du raid','milestone',{
      milestone:{type:'alliance',scoring:{methods:[],cappedScorings:[
        {cap:144000,methods:[{description:'Faire un combat en raid',points:125}]},
        {cap:384000,methods:[{description:'Combattre en guerre',points:800}]}
      ]}}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'5');
  assert.deepEqual(sections(nodes).map(section=>section.children[0].textContent),
    ['🛡️ RAID','⚔️ GUERRE']);
  const raid=sections(nodes)[0].children[1].children;
  const war=sections(nodes)[1].children[1].children;
  assert.equal(raid.length,1);
  assert.equal(war.length,1);
  assert.equal(raid[0].children[0].children[0].textContent,'Combattre en raid');
  assert.equal(war[0].children[0].children[0].textContent,'Combattre en guerre');
  assert.equal(raid[0].children[0].children[1].textContent,'3 objectifs');
  assert.equal(war[0].children[0].children[1].textContent,'2 objectifs');
  for(const group of [raid[0],war[0]]){
    const sources=group.children[1].children;
    assert.equal(sources.length,2);
    assert.deepEqual(sources.map(source=>source.children[0].children[0].textContent),
      [title,'Zone de guerre du raid']);
    for(const source of sources){
      assert.equal(source.children[0].children[0].handlers.has('click'),true);
    }
  }
  const items=objectiveNodes(nodes);
  assert.equal(items.length,5);
  assert.ok(items.every(row=>row.children[0].hidden===true));
  const scoring=items.map(row=>row.children[1].children.map(part=>part.textContent).join(' '));
  const normalized=scoring.join(' / ').replace(/\s/g,'');
  for(const cap of [24,6,5])
    assert.ok(normalized.includes('(plafond'+cap+'ptsdeprogression)'),cap+' progression conservée');
  for(const cap of [144000,384000])
    assert.ok(normalized.includes('Plafondd’alliance:'+cap+'ptssur3jours'),
      cap+' plafond collectif conservé');
  assert.ok(normalized.includes('+125ptsparaction'));
  assert.ok(normalized.includes('+800ptsparaction'));
});

test('Jouer et combattre en guerre forment une seule action, sans fusionner les conditions',async()=>{
  const day=86400,now=Math.floor(Date.now()/1000);
  const week={startTime:now-day,endTime:now+6*day};
  const tenDays={startTime:now-day,endTime:now+9*day};
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Plan de bataille','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:5,methods:[{description:'Combattre en guerre',points:1}]}
      ]}}
    }],
    ["L'arme vivante",'milestone',{
      ...tenDays,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:3,methods:[{description:'Jouer en guerre',points:1}]},
        {cap:5,methods:[{description:'Jouer en guerre',points:1}]},
        {cap:10,methods:[{description:'Jouer en guerre',points:1}]}
      ]}}
    }],
    ['Zone de guerre du raid','milestone',{
      ...week,milestone:{type:'alliance',scoring:{methods:[],cappedScorings:[
        {cap:384000,methods:[{description:'Combattre en guerre',points:800}]}
      ]}}
    }],
    ['Mission avec condition','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[
        {description:"Combattre en guerre (niveau d'alliance 20)",points:250}
      ],cappedScorings:[]}}
    }],
    ['Objectifs arène','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:20,methods:[{description:'Jouer 1 combat d’arène',points:1}]},
        {cap:3,methods:[{description:'Combattre dans l’arène',points:1}]}
      ]}}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'8');
  const war=sections(nodes).find(s=>s.children[0].textContent==='⚔️ GUERRE');
  const arena=sections(nodes).find(s=>s.children[0].textContent==='🏟️ ARÈNE');
  assert.ok(war);
  assert.ok(arena);
  const warActions=war.children[1].children;
  assert.equal(warActions.length,2);
  const merged=warActions.find(card=>
    card.children[0].children[0].textContent==='Combattre en guerre');
  assert.ok(merged);
  assert.equal(merged.children[0].children[1].textContent,'5 objectifs');
  assert.equal(merged.children[1].children.length,3);
  assert.equal(merged.children[1].children.reduce((n,source)=>
    n+source.children[1].children.length,0),5);
  const hints=merged.children[0].children.filter(child=>
    child.className==='ev-objective-limit').map(child=>child.textContent);
  assert.ok(hints.includes('Solo : 5 combats comptabilisés sur 7 jours'));
  assert.ok(hints.includes('Solo : 3 et 5 et 10 combats comptabilisés sur 10 jours'));
  assert.ok(!hints.some(text=>text.includes('384 000')));
  assert.ok(warActions.some(card=>card.children[0].children[0].textContent.includes(
    "niveau d'alliance 20")));
  assert.equal(arena.children[1].children.length,1);
  assert.equal(arena.children[1].children[0].children[0].children[0].textContent,
    'Combattre en arène');
  assert.equal(arena.children[1].children[0].children[0].children[1].textContent,
    '2 objectifs');
});

test('Les Guerriers audacieux multimodes sont une seule équipe par rubrique avec cinq portraits',async()=>{
  const teamName='Guerriers Audacieux';
  const source=realTeams.filter(team=>team.team===teamName);
  assert.ok(source.length>=2);
  const teams=[...realTeams,{...source[0],characters:[...source[0].characters].reverse()}];
  const nodes=await makePage({includeBase:false,teams,extraEvents:[
    ['Avènement des Guerriers audacieux','milestone',{
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:50,methods:[{description:"Combattre dans l'Épreuve cosmique avec les Guerriers audacieux",points:5}]},
        {cap:50,methods:[{description:'Combattre en choc avec les Guerriers audacieux',points:2}]}
      ]}}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  assert.equal(objectiveNodes(nodes).length,2);
  assert.deepEqual(sections(nodes).map(section=>section.children[0].textContent),
    ['⚡ CHOC','🔷 ÉPREUVE COSMIQUE']);
  const cards=objectiveDetails(nodes,'ev-objective-team');
  assert.equal(cards.length,2);
  for(const card of cards){
    const summary=card.children[0];
    assert.equal(summary.children[0].textContent,teamName);
    assert.equal(summary.children[1].textContent,'5 personnages · 1 objectif');
    const roster=summary.children.find(c=>c.className==='ev-objective-team-roster');
    assert.equal(roster.children.length,5);
    const expected=source[0].characters.map(id=>realCharacters.find(c=>c.id===id).portraitUrl);
    assert.deepEqual(roster.children.map(member=>member.children.find(c=>c.tag==='img')?.src),expected);
  }
  assert.equal(objectiveDetails(nodes,'ev-objective-event-group').length,0);
  const rows=objectiveNodes(nodes);
  assert.ok(rows[0].children[1].children.some(c=>c.textContent==='25 actions comptabilisées en 3 jours'));
  assert.ok(rows[1].children[1].children.some(c=>c.textContent==='10 actions comptabilisées en 3 jours'));
});

test('Deux compositions différentes portant le même nom restent ambiguës',async()=>{
  const nodes=await makePage({includeBase:false,teams:[
    {team:'Équipe Alpha',mode:'Guerre',characters:['Vision','Ultron']},
    {team:'Équipe Alpha',mode:'Raid',characters:['Crossbones','Whiplash']}
  ],extraEvents:[
    ['Événement ambigu','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre avec Équipe Alpha',points:1}],cappedScorings:[]
    }}}]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'1');
  assert.equal(objectiveNodes(nodes).length,1);
  assert.equal(objectiveDetails(nodes,'ev-objective-team').length,0);
  assert.ok(actions(nodes).includes('Combattre avec Équipe Alpha'));
});

test('Les combats explicites en Épreuve cosmique avec une équipe ne sont jamais routés vers Choc',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const week={startTime:now-day,endTime:now+6*day};
  const labels=[
    "Combattre dans l'Épreuve cosmique avec les Guerriers audacieux",
    'Combattre en choc avec les Guerriers audacieux',
    'Combattre en Épreuve cosmique avec Vision',
    'Combattre dans l’Epreuve cosmique avec Vision',
    'Combattre en choc ou en Épreuve cosmique avec Vision'
  ];
  const nodes=await makePage({includeBase:false,teams:[],characters:[],extraEvents:[
    ['Avènement des Guerriers audacieux','milestone',{
      ...week,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:50,methods:[{description:labels[0],points:5}]},
        {cap:50,methods:[{description:labels[1],points:2}]}
      ]}}
    }],
    ['Variantes','milestone',{
      ...week,milestone:{type:'solo',scoring:{
        methods:labels.slice(2).map(description=>({description,points:1})),
        cappedScorings:[]
      }}
    }]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'5');
  const sectionFor=title=>sections(nodes).find(s=>s.children[0].textContent===title);
  const rows=section=>{
    const results=[];
    const walk=node=>{
      if(node.className==='ev-objective-item')results.push(node);
      for(const child of node.children||[])walk(child);
    };
    walk(section);
    return results;
  };
  const choc=rows(sectionFor('⚡ CHOC'));
  const crucible=rows(sectionFor('🔷 ÉPREUVE COSMIQUE'));
  const mixed=rows(sectionFor('⚡ CHOC / ÉPREUVE COSMIQUE'));
  assert.deepEqual(choc.map(row=>row.children[0].textContent),[labels[1]]);
  assert.deepEqual(crucible.map(row=>row.children[0].textContent).sort(),
    [labels[0],labels[2],labels[3]].sort());
  assert.deepEqual(mixed.map(row=>row.children[0].textContent),[labels[4]]);
  assert.ok(crucible.find(row=>row.children[0].textContent===labels[0])
    .children[1].children.some(c=>c.textContent==='10 actions comptabilisées en 7 jours'));
  assert.ok(choc[0].children[1].children.some(c=>c.textContent==='25 actions comptabilisées en 7 jours'));
});

test('Épreuve abrégée : classement en Épreuve cosmique, jamais sous Choc',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Choc','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en choc',points:1},
        {description:'Gagner un combat en choc',points:1}],
      cappedScorings:[]}}}],
    ['Épreuve cosmique','milestone',{milestone:{type:'solo',scoring:{
      methods:[],
      cappedScorings:[
        {cap:3,methods:[{description:"Combattre dans l'Épreuve",points:1}]},
        {cap:6,methods:[{description:"Combattre dans l'Épreuve cosmique",points:1}]},
        {cap:1000,methods:[{description:"Combattez dans l'Épreuve cosmique (niveau 60)",points:1000}]}
      ]}}}],
    ['Objectif multimode','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Jouer dans l’arène, en guerre, en arène en temps réel ou dans l’Épreuve',points:1}],
      cappedScorings:[]}}}],
    ['Épreuve sans rapport','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:"Récupérer une récompense dans l'épreuve de force",points:1}],
      cappedScorings:[]}}}]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'7');
  assert.equal(objectiveNodes(nodes).length,7);
  const modes=sections(nodes).map(section=>section.children[0].textContent);
  assert.deepEqual(modes,[
    '⚔️ GUERRE / ARÈNE / ÉPREUVE COSMIQUE',
    '⚡ CHOC','🔷 ÉPREUVE COSMIQUE','📋 DIVERS'
  ]);
  const choc=sections(nodes).find(section=>section.children[0].textContent==='⚡ CHOC');
  const crucible=sections(nodes).find(section=>
    section.children[0].textContent==='🔷 ÉPREUVE COSMIQUE');
  assert.equal(choc.children[0].children[0].textContent,'2 objectifs');
  assert.equal(crucible.children[0].children[0].textContent,'3 objectifs');
  const labels=crucible.children[1].children.map(card=>
    card.children[0].children[0].textContent);
  assert.ok(labels.includes('Combattre en Épreuve cosmique'));
  assert.ok(labels.includes("Combattez dans l'Épreuve cosmique (niveau 60)"));
  const merged=crucible.children[1].children.find(card=>
    card.children[0].children[0].textContent==='Combattre en Épreuve cosmique');
  assert.equal(merged.children[0].children[1].textContent,'2 objectifs');
  assert.equal(merged.children[1].children[0].children[1].children.length,2);
  assert.ok(!choc.children[1].children.some(card=>
    card.children[0].children[0].textContent?.includes('Épreuve')));
  const bounds=objectiveNodes(nodes).flatMap(row=>row.children[1].children
    .map(part=>part.textContent)).join(' ');
  assert.ok(bounds.includes('(plafond 3 pts)'));
  assert.ok(bounds.includes('(plafond 6 pts)'));
  assert.ok(bounds.includes('(plafond 1 000 pts)')||bounds.includes('(plafond 1 000 pts)'));
});

test('Les dépenses d’énergie vont dans Campagne sauf mode explicite ou monnaie',async()=>{
  const campaign=[
    "Dépenser de l'énergie de Doomsday dans Doomsday : Incursion",
    'Dépenser de l’énergie',
    'Dépensez 1 énergie',
    'Dépenser 10 points d’énergie préhistorique',
    'Spend Doomsday Energy',
    'Dépenser de l’énergie ISO-8',
    'Dépenser de l’énergie (campagne, iso ou incursion)'
  ];
  const raid=['Dépenser de l’énergie de raid','Spend Raid Energy'];
  const war=['Dépenser de l’énergie de guerre','Spend War Energy'];
  const other=['Dépenser 1 noyau d’énergie','Dépensez des noyaux d’énergie',
    'Utiliser 1 noyau d’énergie','Spend Power Cores','Obtenir de l’énergie de Doomsday'];
  const labels=[...campaign,...raid,...war,...other];
  const nodes=await makePage({includeBase:false,extraEvents:labels.map((description,i)=>
    ['Événement '+i,'milestone',{milestone:{type:'solo',scoring:{
      methods:[],cappedScorings:[{cap:10,methods:[{description,points:1}]}]
    }}}])});
  assert.equal(nodes.get('stat-objectives').textContent,String(labels.length));
  assert.equal(objectiveNodes(nodes).length,labels.length);
  const rows=section=>{
    const walk=node=>[node,...node.children.flatMap(walk)];
    return walk(sections(nodes).find(s=>s.children[0].textContent===section))
      .filter(node=>node.className==='ev-objective-item')
      .map(row=>row.children[0].textContent).sort();
  };
  assert.deepEqual(rows('📖 CAMPAGNE'),campaign.slice().sort());
  assert.deepEqual(rows('🛡️ RAID'),raid.slice().sort());
  assert.deepEqual(rows('⚔️ GUERRE'),war.slice().sort());
  assert.deepEqual(rows('📋 DIVERS'),other.slice().sort());
});

test('Dépenser 1 point ou dépenser de l’énergie de campagne partage une seule action',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Sauvez le monde !','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Dépensez 1 point d’énergie de campagne',points:5}],
      cappedScorings:[]}}}],
    ['Briseur de volontés','milestone',{milestone:{type:'solo',scoring:{
      methods:[],cappedScorings:[{cap:50,methods:[
        {description:"Dépenser de l'énergie de campagne",points:1}
      ]}]}}}],
    ['S.T.R.I.K.E.','milestone',{milestone:{type:'solo',scoring:{
      methods:[],cappedScorings:[{cap:100,methods:[
        {description:"Dépenser 1 point d'énergie de campagne",points:2}
      ]}]}}}],
    ['Terre Sauvage','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:"Dépenser de l'énergie préhistorique dans la campagne Terre Sauvage",points:1}],
      cappedScorings:[]}}}],
    ['Iso-8','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:"Dépenser 1 point d'énergie de campagne Iso-8 (joueur de niveau 55)",points:20}],
      cappedScorings:[]}}}],
    ['Iso-8 2','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:"Dépenser 1 point d'énergie de campagne d'iso-8",points:3}],
      cappedScorings:[]}}}]
  ]});
  assert.equal(nodes.get('stat-objectives').textContent,'6');
  assert.equal(objectiveNodes(nodes).length,6);
  const campaign=sections(nodes).find(section=>
    section.children[0].textContent==='📖 CAMPAGNE');
  assert.ok(campaign);
  const cards=campaign.children[1].children;
  assert.equal(cards.length,4);
  const action=cards.find(card=>
    card.children[0].children[0].textContent==='Dépenser de l’énergie de campagne');
  assert.ok(action);
  assert.equal(action.children[0].children[1].textContent,'3 objectifs');
  assert.equal(action.children[1].children.length,3);
  const rows=action.children[1].children.flatMap(source=>source.children[1].children);
  assert.equal(rows.length,3);
  const details=rows.map(row=>row.children[1].children.map(span=>span.textContent).join(' ')).join(' | ');
  assert.ok(details.includes('+ 5 pts par action'));
  assert.ok(details.includes('+ 1 pt par action'));
  assert.ok(details.includes('+ 2 pts par action'));
  assert.ok(details.includes('(plafond 50 pts)'));
  assert.ok(details.includes('(plafond 100 pts)'));
  const otherLabels=cards.filter(card=>card!==action).map(card=>
    card.children[0].children[0].textContent);
  assert.ok(otherLabels.some(label=>label.includes('énergie préhistorique')));
  assert.equal(otherLabels.filter(label=>/iso-8/i.test(label)).length,2);
});

test('Les actions composées ou avec personnage ne sont pas fusionnées aux combats simples',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Guerre simple','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Jouer en guerre',points:1}],cappedScorings:[]}}}],
    ['Guerre avec personnage','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en guerre avec Vision',points:2}],cappedScorings:[]}}}],
    ['Événement multimode','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Jouer dans l’arène, en guerre, en arène en temps réel ou dans l’Épreuve',points:1}],
      cappedScorings:[]}}}]
  ]});
  const war=sections(nodes).find(s=>s.children[0].textContent==='⚔️ GUERRE');
  const actions=war.children[1].children.filter(card=>
    card.className==='ev-objective-event-group');
  assert.equal(actions.length,1);
  assert.equal(actions[0].children[0].children[0].textContent,'Combattre en guerre');
  assert.equal(actions[0].children[0].children[1].textContent,'1 objectif');
  assert.ok(objectiveDetails(nodes,'ev-objective-character').some(card=>
    card.children[0].children.some(child=>child.tag==='strong'&&child.textContent==='Vision')));
  assert.ok(sections(nodes).some(s=>s.children[0].textContent.includes('/')));
});

test('Les actions montrent les plafonds réels et distinguent le rythme conseillé',async()=>{
  const now=Math.floor(Date.now()/1000);
  const oneDay={startTime:now-3600,endTime:now+23*3600};
  const sevenDays={startTime:now-86400,endTime:now+6*86400};
  const twentyEightDays={startTime:now-86400,endTime:now+27*86400};
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Plan de bataille','milestone',{
      ...sevenDays,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:24,methods:[{description:'Combattre en raid',points:1}]},
        {cap:6,methods:[{description:'Combattre en raid',points:1}]},
        {cap:5,methods:[{description:'Combattre en guerre',points:1}]}
      ]}}
    }],
    ['Zone de guerre','milestone',{
      ...sevenDays,milestone:{type:'alliance',scoring:{methods:[],cappedScorings:[
        {cap:144000,methods:[{description:'Faire un combat en raid',points:125}]},
        {cap:384000,methods:[{description:'Combattre en guerre',points:800}]}
      ]}}
    }],
    ['Raid journalier','milestone',{
      ...oneDay,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:2,methods:[{description:'Combattre en raid',points:1}]}
      ]}}
    }],
    ['Arène mensuelle','milestone',{
      ...twentyEightDays,milestone:{type:'solo',scoring:{methods:[],cappedScorings:[
        {cap:3,methods:[{description:'Combattre dans l’arène',points:1}]}
      ]}}
    }]
  ]});
  const heading=(mode)=>sections(nodes).find(section=>
    section.children[0].textContent.includes(mode)).children[1].children[0].children[0];
  const hints=(mode)=>heading(mode).children.filter(child=>
    child.className==='ev-objective-limit').map(child=>child.textContent);
  const raid=hints('RAID'),war=hints('GUERRE'),arena=hints('ARÈNE');
  assert.ok(raid.includes('Solo : 6 et 24 combats comptabilisés sur 7 jours'));
  assert.ok(raid.includes('Solo : 2 combats comptabilisés sur 24 h'));
  assert.ok(!raid.some(x=>x.includes('Alliance')||x.includes('1 152')));
  assert.ok(!raid.some(x=>x.includes('/j conseillés')));
  assert.ok(war.includes('Solo : 5 combats comptabilisés sur 7 jours'));
  assert.ok(!war.some(x=>x.includes('Alliance')||x.includes('480')));
  assert.ok(!war.some(x=>x.includes('/j')));
  assert.ok(arena.includes('Solo : 3 combats comptabilisés sur 28 jours'));
  assert.ok(!arena.some(x=>x.includes('/j')));
  assert.equal(nodes.get('stat-objectives').textContent,'7');
  assert.equal(objectiveNodes(nodes).length,7);
});

test('Une action sans plafond explicite ne devient pas artificiellement illimitée',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Raid sans plafond','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en raid',points:1}],cappedScorings:[]}}}]
  ]});
  const summary=sections(nodes)[0].children[1].children[0].children[0];
  const hints=summary.children.filter(child=>child.className==='ev-objective-limit')
    .map(child=>child.textContent);
  assert.deepEqual(hints,['Solo : aucun plafond indiqué']);
});

test('Un objectif uniquement alliance n’ajoute aucune limite solo',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Guerre d’alliance','milestone',{milestone:{type:'alliance',scoring:{
      methods:[],cappedScorings:[
        {cap:384000,methods:[{description:'Combattre en guerre',points:800}]}
      ]}}}]
  ]});
  const summary=sections(nodes)[0].children[1].children[0].children[0];
  const hints=summary.children.filter(child=>child.className==='ev-objective-limit');
  assert.equal(hints.length,0);
  assert.ok(objectiveNodes(nodes)[0].children[1].children.some(child=>
    child.textContent?.includes('384')));
});

test('Les libellés affichés utilisent objectif(s), y compris au singulier',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Mission Raid','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en raid',points:1}],
      cappedScorings:[]}}}],
    ['Mission Guerre','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en guerre',points:1}],
      cappedScorings:[]}}}]
  ]});
  const visit=(entry)=>{
    const result=[entry.textContent||''];
    for(const child of entry.children||[])result.push(...visit(child));
    return result;
  };
  const shown=visit(nodes.get('events-objectives')).join(' | ');
  assert.ok(shown.includes('2 objectifs, regroupés par action'));
  assert.equal(nodes.get('count-objectives').textContent,'2');
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  assert.deepEqual(sections(nodes).map(section=>section.children[0].textContent),
    ['🛡️ RAID','⚔️ GUERRE']);
  for(const section of sections(nodes)){
    assert.equal(section.children[0].children[0].textContent,'1 objectif');
    assert.equal(section.children[1].children[0].children[0].children[1].textContent,'1 objectif');
  }
  assert.doesNotMatch(shown,/méthodes?/i);
});

test('Les textes essentiels des objectifs restent lisibles sans modifier le zoom',()=>{
  assert.ok(css.includes('.ev-objectives-note{font-size:15px;'));
  assert.ok(css.includes('.ev-objective-event-summary>.ev-objective-limit{order:1;flex:0 0 100%;font-size:15px;'));
  assert.ok(css.includes('.ev-objective-mini-count{font-size:14px;'));
  assert.ok(css.includes('.ev-objective-score,.ev-objective-cap,.ev-objective-premium{font-size:14px;'));
  assert.ok(css.includes('.ev-objective-team-summary strong{font-size:16px;'));
  assert.ok(html.includes('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'));
});

test('La page Événements reprend le fond, l’en-tête et les panneaux LoSP communs',()=>{
  assert.match(commonCss,/background-image:\s*url\("\.\/Background\.webp"\)/);
  assert.match(html,/class="app ev-page"/);
  assert.match(html,/class="header ev-header"/);
  assert.match(html,/class="homeBtn" href="\.\/home\.html"/);
  assert.match(html,/href="\.\/style\.css\?v=4"/);
  assert.match(html,/href="\.\/evenements\.css\?v=20"/);
  assert.doesNotMatch(css,/\.ev-toolbar\{|\.ev-filters\{|\.ev-date-controls\{/);
  assert.match(css,/\.ev-card\{[^}]*background:var\(--panel\)/);
  assert.doesNotMatch(css,/\.ev-body::before|\.ev-hero(?:\{|::after)/);
  assert.doesNotMatch(css,/body\.ev-body\{[^}]*background(?:-image|-color)?:/);
  for(const id of ['tab-objectives','tab-current','events-objectives','events-current']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html,/id="(?:tab|section|events|count|stat)-past"/);
  assert.match(css,/\.ev-overview\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('Le bandeau technique du catalogue est masqué sans supprimer le diagnostic interne',()=>{
  assert.doesNotMatch(html,/class="ev-source"|Catalogue des événements MSF/);
  assert.match(html,/<div hidden aria-hidden="true"><span id="source-line"><\/span><span id="source-provenance"><\/span><\/div>/);
});

test('Les identifiants obligatoires de la vue Objectifs existent dans le HTML',()=>{
  for(const id of ['section-objectives','events-objectives','stat-objectives','count-objectives']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html,/section-future|events-future|stat-future/);
});

test('Objectifs est sélectionné au premier affichage, même avant chargement JS',()=>{
  assert.match(html,/id="tab-objectives"[^>]*aria-selected="true" tabindex="0"/);
  assert.match(html,/id="tab-current"[^>]*aria-selected="false" tabindex="-1"/);
  assert.match(html,/id="section-objectives"[^>]*aria-labelledby="tab-objectives"(?! hidden)/);
  assert.match(html,/id="section-current"[^>]*hidden>/);
  assert.match(html,/evenements\.js\?v=42/);
});

test('Tous les menus d’objectifs sont fermés au chargement et au retour Safari',async()=>{
  const options={includeBase:false,extraEvents:[
    ['Objectifs en cours','milestone',{
      milestone:{type:'solo',scoring:{methods:[
        {description:"Combattre en guerre avec tous les membres du Conclave de l'Ombre",points:25},
        {description:'Combattre en guerre avec Thanos',points:10},
        {description:'Combattre en raid',points:2},
        {description:'Se connecter quotidiennement',points:1}
      ],cappedScorings:[]}}
    }]
  ]};
  const getMenus=nodes=>[
    ...objectiveDetails(nodes,'ev-objective-team'),
    ...objectiveDetails(nodes,'ev-objective-character'),
    ...objectiveDetails(nodes,'ev-objective-event-group')
  ];
  const nodes=await makePage(options);
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.get('stat-objectives').textContent,'4');
  assert.equal(getMenus(nodes).length,4);
  assert.ok(getMenus(nodes).every(menu=>!menu.open),
    'Toutes les équipes, personnages et actions doivent être repliés');
  // L'utilisateur peut toujours ouvrir les menus pendant sa visite.
  for(const menu of getMenus(nodes))menu.open=true;
  assert.ok(getMenus(nodes).every(menu=>menu.open));
  // Safari réutilise parfois l'ancienne page au lieu de la recharger.
  nodes.browser.windowHandlers.get('pageshow')({persisted:true});
  assert.equal(nodes.get('stat-objectives').textContent,'4');
  assert.equal(getMenus(nodes).length,4);
  assert.ok(getMenus(nodes).every(menu=>!menu.open),
    'Une page restaurée depuis le cache Safari doit être repliée');
  // Rechargement complet : pas de persistance implicite des ouvertures.
  const reloaded=await makePage(options);
  assert.equal(getMenus(reloaded).length,4);
  assert.ok(getMenus(reloaded).every(menu=>!menu.open));
});

test('Les compteurs sont deux onglets exclusifs, accessibles au clavier',async()=>{
  const nodes=await makePage();
  const tabs=['objectives','current'];
  const visible=()=>tabs.filter(key=>!nodes.get('section-'+key).hidden);
  assert.match(html,/role="tablist"/);
  assert.doesNotMatch(html,/href="#section-(?:objectives|current|past)"/);
  assert.equal(nodes.get('tab-past'),undefined);
  assert.equal(nodes.get('section-past'),undefined);
  assert.deepEqual(visible(),['objectives']);
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.get('tab-current')['aria-selected'],'false');
  const count=nodes.get('stat-objectives').textContent;
  nodes.get('tab-current').handlers.get('click')();
  assert.deepEqual(visible(),['current']);
  assert.equal(nodes.get('tab-current')['aria-selected'],'true');
  let prevented=false;
  nodes.get('tab-current').handlers.get('keydown')({
    key:'ArrowRight',preventDefault(){prevented=true;}
  });
  assert.equal(prevented,true);
  assert.deepEqual(visible(),['objectives']);
  assert.equal(nodes.get('tab-objectives').focused,true);
  nodes.get('tab-objectives').handlers.get('keydown')({key:'End',preventDefault(){}});
  assert.deepEqual(visible(),['current']);
  nodes.get('tab-current').handlers.get('keydown')({key:'Home',preventDefault(){}});
  assert.deepEqual(visible(),['objectives']);
  assert.equal(nodes.get('stat-objectives').textContent,count);
});

test('Retour Safari BFCache : Objectifs et haut de page rétablis depuis En cours',async()=>{
  const nodes=await makePage();
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.browser.history.scrollRestoration,'manual');
  nodes.get('tab-current').handlers.get('click')();
  assert.equal(nodes.get('section-current').hidden,false);
  nodes.browser.windowHandlers.get('pageshow')({persisted:true});
  assert.equal(nodes.get('section-objectives').hidden,false);
  assert.equal(nodes.get('section-current').hidden,true);
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.get('tab-current')['aria-selected'],'false');
  assert.ok(nodes.browser.scrollCalls.length>=2);
  nodes.browser.runFrames();
  assert.deepEqual(nodes.browser.scrollCalls.at(-1),[0,0]);
});

test('Les anciennes ancres Passés / En cours sont nettoyées sans restaurer un troisième onglet',async()=>{
  for(const hash of ['#section-past','#section-current']){
    const nodes=await makePage({hash});
    assert.equal(nodes.get('section-objectives').hidden,false);
    assert.equal(nodes.get('section-past'),undefined);
    assert.equal(nodes.get('tab-past'),undefined);
    assert.equal(nodes.get('section-current').hidden,true);
    assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
    assert.equal(nodes.browser.history.scrollRestoration,'manual');
    assert.deepEqual(nodes.browser.history.replacedUrls,['/msf/evenements.html']);
    assert.ok(nodes.browser.scrollCalls.length>=2);
    nodes.get('tab-current').handlers.get('click')();
    assert.equal(nodes.get('section-current').hidden,false);
    nodes.browser.windowHandlers.get('pageshow')({persisted:true});
    assert.equal(nodes.get('section-objectives').hidden,false);
    assert.equal(nodes.get('section-current').hidden,true);
  }
});
test('Le nettoyage des anciennes ancres se fait dans le HEAD avant le rendu Safari',()=>{
  const earlyScript=html.slice(0,html.indexOf('</head>'));
  assert.match(earlyScript,/scrollRestoration\s*=\s*'manual'/);
  assert.match(earlyScript,/history\.replaceState\(history\.state/);
  assert.match(earlyScript,/#section-\(\?:objectives\|current\|past\)/);
});

test('La liste des événements reproduit les 6 Phases, 2 Postes et 4 Événements des captures',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const art=(name)=>'https://assets.marvelstrikeforce.com/key_art/'+name+'.jpg';
  const phase=(name,description,type='solo')=>[name,'milestone',{
    cardArt:art('Fixture_Phase'),popupArt:art('Fixture_PhaseBanner'),
    milestone:{type,scoring:{methods:[{description,points:100}],cappedScorings:[]}}
  }];
  const command=name=>[name,'milestone',{
    locationHints:['lohub_wrapper'],
    milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
  }];
  const feeder=(name,description)=>[name,'milestone',{
    locationHints:['lohub_feeder'],
    milestone:{type:'solo',scoring:{methods:[{description,points:20}],cappedScorings:[]}}
  }];
  const trial=(name,image,brackets=[{id:'default'}])=>[name,'pickYourPoison',{
    cardArt:art(image),pickYourPoison:{typeName:'Fléau',brackets}
  }];
  const earth=['LA TERRE SAUVAGE','episodic',{
    endTime:now+27*day,
    episodic:{type:'eventCampaign',typeName:'Personnage',ids:['ECM_SAVAGELANDS_A']}
  }];
  const sameWindow={startTime:now-day,endTime:now+3*day,subName:'Équipez votre effectif'};
  const gear=['Fête de l’équipement',...Array.from({length:10},(_,i)=>
    'Fête de l’équipement : '+['II','III','IV','V','VI','VII','VIII','IX','X','XI'][i])];
  const extraEvents=[
    phase('Faille cybernétique','Combattre en choc avec Vision'),
    phase('Faite pour piquer','Utiliser des noyaux'),
    phase('Force fondatrice','Dépenser de l’énergie'),
    phase('Prêt au combat : Dents-de-sabre (Briseur)','Combattre avec Dents-de-sabre'),
    phase('Zone de guerre du raid','Combattre en guerre','alliance'),
    phase('Sauvez le monde !','Dépensez 1 point d’énergie de campagne'),
    command('Nuit des Sentinelles'),
    command('Briseur de volontés - Plan de bataille du mois 1'),
    feeder('Nuit des Sentinelles','Gagner un combat en choc'),
    feeder('Briseur de volontés - Plan de bataille du mois 1','Jouer un raid'),
    trial('SALLE DES DANGERS','Event_HalloweenDangerRoom_Card'),
    trial('ÉCHOS DE DYSTOPIA','BW_Maestro_Card'),
    trial('ÉVÉNEMENT BRISEUR : DENTS-DE-SABRE','Scourge_SabertoothBreaker_TopCard'),
    earth,
    ...gear.map(name=>phase(name,'Améliorer un équipement').map((v,i)=>
      i===2?{...v,...sameWindow}:v)),
    trial('ROI D’OMBRE','Scourge_ShadowKing_Card'),
    trial('OLD MAN LOGAN','OldManLogan_Scourge_Card'),
    trial('MORT','Scourge_Death_Card',
      [{id:'victor'},{id:'6star'},{id:'5star'},{id:'4star'},{id:'default'}]),
    ['ÈRE DE LA PEUR','info',{endTime:now+362*day}],
    ['ÉCLIPSE TROUVÉE','episodic',{endTime:now+370*day,
      episodic:{type:'unlockEvent',id:'CHASE_ECLIPSE_FOUND',ids:[]}}],
    ['Fils à retordre','episodic',{endTime:now+65*day,
      episodic:{type:'eventCampaign',ids:['SSE_SPIDERSOCIETY_A']}}],
    ['Récompense Web','milestone',{
      locationHints:['web_exclusive'],
      milestone:{type:'solo',scoring:{methods:[{description:'Récupérer une offre',points:1}],cappedScorings:[]}}
    }],
    ['Justicier enragé','blitz',{}],
    ['S.T.R.I.K.E. : premier assaut','milestone',{}]
  ];
  const nodes=await makePage({includeBase:false,extraEvents});
  assert.equal(nodes.get('stat-current').textContent,'12');
  assert.equal(cards(nodes).length,12);
  assert.deepEqual(groupTitles(nodes),[
    '📋 Phases','🛡️ Poste de commandement','⚔️ Événements'
  ]);
  assert.deepEqual(calendarGroups(nodes).map(group=>group.children[1].children.length),[6,2,4]);
  assert.equal(nodes.get('stat-objectives').textContent,'8');
  assert.ok(objectiveDetails(nodes,'ev-objective-character').some(card=>
    card.children[0].children.some(part=>part.tag==='strong'&&part.textContent==='Vision')));
  assert.ok(actions(nodes).includes('Combat'));
  assert.ok(actions(nodes).includes('Gagner un combat en choc'));
  assert.ok(actions(nodes).includes('Jouer un raid'));
  assert.ok(!actions(nodes).includes('Améliorer un équipement'));
  assert.ok(!titles(nodes).includes('Fête de l’équipement'));
  assert.ok(!titles(nodes).includes('ROI D’OMBRE'));
  assert.ok(!titles(nodes).includes('OLD MAN LOGAN'));
  assert.ok(!titles(nodes).includes('ÈRE DE LA PEUR'));
  assert.ok(!titles(nodes).includes('ÉCLIPSE TROUVÉE'));
  assert.ok(!titles(nodes).includes('Fils à retordre'));
  assert.ok(!titles(nodes).includes('Justicier enragé'));
  const alliance=cards(nodes).find(card=>card.children[1].children[1].textContent==='Zone de guerre du raid');
  assert.equal(alliance.children[1].children[0].children[1].textContent,'Alliance');
  assert.ok(sections(nodes).some(section=>section.children[0].textContent.startsWith('⚡ CHOC')));
  assert.ok(sections(nodes).some(section=>section.children[0].textContent.startsWith('⚔️ GUERRE')));
  // Sans sélecteurs, toutes les rubriques actives restent visibles.
  assert.equal(nodes.get('type-filter'),undefined);
  assert.equal(nodes.get('search-filter'),undefined);
  assert.equal(nodes.get('stat-current').textContent,'12');
  assert.equal(nodes.get('stat-objectives').textContent,'8');
});

test('Une ancienne date en URL ne modifie pas les événements et objectifs actifs',async()=>{
  const defaultNodes=await makePage();
  const nodes=await makePage({search:'?date=2020-01-01'});
  assert.equal(nodes.get('stat-objectives').textContent,
    defaultNodes.get('stat-objectives').textContent);
  assert.equal(nodes.get('stat-current').textContent,
    defaultNodes.get('stat-current').textContent);
  assert.equal(nodes.get('date-filter'),undefined);
  assert.equal(nodes.get('reset-date'),undefined);
  assert.doesNotMatch(script,/new URLSearchParams\(location\.search\)/);
  assert.doesNotMatch(script,/get\('date'\)/);
});

test('Les phases quotidiennes et les feeders sont traités séparément',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const extraEvents=[
    ['Sauvez le monde !','milestone',{
      cardArt:'https://assets.marvelstrikeforce.com/key_art/DailyCard.jpg',
      popupArt:'https://assets.marvelstrikeforce.com/key_art/DailyBanner.jpg',
      endTime:now+6*3600,
      milestone:{type:'solo',scoring:{methods:[{description:'Dépensez 1 énergie',points:5}],cappedScorings:[]}}
    }],
    ['Sauvez le monde !','milestone',{
      cardArt:'https://assets.marvelstrikeforce.com/key_art/DailyCard.jpg',
      popupArt:'https://assets.marvelstrikeforce.com/key_art/DailyBanner.jpg',
      startTime:now-day-3600,endTime:now-day+6*3600,
      milestone:{type:'solo',scoring:{methods:[{description:'Dépensez 1 énergie',points:5}],cappedScorings:[]}}
    }],
    ['Poste mensuel','milestone',{
      locationHints:['lohub_wrapper'],
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
    }],
    ['Poste mensuel','milestone',{
      locationHints:['lohub_feeder'],
      milestone:{type:'solo',scoring:{methods:[{description:'Combattre en raid',points:10}],cappedScorings:[]}}
    }]
  ];
  const nodes=await makePage({includeBase:false,extraEvents});
  assert.equal(nodes.get('stat-current').textContent,'2');
  assert.deepEqual(groupTitles(nodes),['📋 Phases','🛡️ Poste de commandement']);
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  assert.ok(actions(nodes).includes('Combattre en raid'));
  assert.equal(nodes.get('secondary-filter'),undefined);
  assert.equal(cards(nodes).length,2);
  assert.equal(nodes.get('stat-current').textContent,'2');
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  assert.doesNotMatch(html,/Afficher aussi les fiches secondaires|secondary-filter/);
  assert.doesNotMatch(script,/includeSecondary|secondary-filter/);
  assert.doesNotMatch(css,/\.ev-checkbox/);
});

test('Les événements terminés ne sont plus rendus dans les deux onglets',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const extraEvents=[
    ['KYLN : CODE FLAMMES','pickYourPoison',{
      cardArt:'https://assets.marvelstrikeforce.com/key_art/KylnTower_HumanTorchJim_Card.jpg',
      pickYourPoison:{typeName:'Fléau',brackets:[{id:'default'}]},
      startTime:now-29*day,endTime:now-day
    }],
    ['PRISE DE CONTRÔLE DE L’IA','episodic',{
      episodic:{type:'eventCampaign',ids:['ECM_AIAVENGERS_A']},
      startTime:now-30*day,endTime:now-2*day
    }],
    ['Ancien objectif','milestone',{
      startTime:now-10*day,endTime:now-day,
      milestone:{type:'solo',scoring:{methods:[
        {description:'Combattre en raid',points:20}
      ],cappedScorings:[]}}
    }]
  ];
  const nodes=await makePage({includeBase:false,extraEvents});
  assert.equal(nodes.get('stat-current').textContent,'0');
  assert.equal(nodes.get('stat-objectives').textContent,'0');
  assert.equal(nodes.get('stat-past'),undefined);
  assert.equal(nodes.get('events-past'),undefined);
  assert.equal(cards(nodes).length,0);
});

test('Tous les événements en cours sont rendus directement, même avec des archives',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const art='https://assets.marvelstrikeforce.com/key_art/Fixture.jpg';
  const extraEvents=[
    ...Array.from({length:29},(_,i)=>['Phase '+i,'milestone',{
      cardArt:art,popupArt:art,
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
    }]),
    ...Array.from({length:18},(_,i)=>['Phase terminée '+i,'milestone',{
      cardArt:art,popupArt:art,
      startTime:now-day*8,endTime:now-day*2,
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
    }])
  ];
  const nodes=await makePage({includeBase:false,extraEvents});
  assert.equal(nodes.get('stat-current').textContent,'29');
  assert.equal(cards(nodes).length,29);
  assert.equal(nodes.get('stat-past'),undefined);
  assert.equal(nodes.get('events-past'),undefined);
  assert.doesNotMatch(html,/id="more-(?:current|past)"|Voir plus/);
  assert.doesNotMatch(script,/LIMIT=\{current:|state\.expanded|items\.slice\(0,limit\)/);
});

test('Poste de commandement : icône transparente seule, de taille adaptée, sans symbole sous-jacent',async()=>{
  const icon='https://assets.marvelstrikeforce.com/key_art/CommandIcon.png';
  const hub='https://assets.marvelstrikeforce.com/key_art/CommandBackground.jpg';
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Poste avec image','milestone',{
      locationHints:['lohub_wrapper'],
      cardArt:'https://assets.marvelstrikeforce.com/key_art/OtherImage.jpg',
      icon,hubArt:[hub],
      milestone:{type:'solo',scoring:{methods:[],cappedScorings:[]}}
    }]
  ]});
  const cover=cards(nodes)[0].children[0];
  assert.match(cover.className,/ev-cover--command/);
  assert.equal(cover.children.length,2);
  const [fallback,image]=cover.children;
  assert.equal(fallback.hidden,true);
  assert.equal(image.src,icon);
  assert.equal(image.className,'ev-command-icon');
  assert.match(css,/\.ev-cover-fallback\[hidden\]\{display:none\}/);
  assert.match(css,/\.ev-cover img\.ev-command-icon\{[^}]*object-fit:contain;[^}]*padding:/);
  image.handlers.get('error')();
  assert.equal(image.removed,true);
  assert.equal(fallback.hidden,false);
  assert.match(cover.className,/ev-cover--placeholder/);
});

test('Campagnes sans illustration : fond de remplacement, sans URL d’image inventée',async()=>{
  const now=Math.floor(Date.now()/1000);
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['LA TERRE SAUVAGE','episodic',{
      endTime:now+27*86400,
      episodic:{type:'eventCampaign',ids:['ECM_SAVAGELANDS_A']}
    }]
  ]});
  assert.equal(nodes.get('stat-current').textContent,'1');
  const cover=cards(nodes)[0].children[0];
  assert.match(cover.className,/ev-cover--placeholder/);
  assert.equal(cover.children.length,1);
  assert.equal(cover.children[0].hidden,false);
  assert.match(css,/\.ev-cover--placeholder\{/);
  assert.doesNotMatch(script,/cdn\.example|placeholder\.com/);
});

test('Une panne du JSON GitHub n’utilise aucune autre source et affiche une indisponibilité',async()=>{
  const nodes=await makePage({failure:true});
  assert.match(nodes.get('source-line').textContent,/indisponible/);
  assert.equal(nodes.get('events-current').children.length,1);
  assert.match(nodes.get('events-current').children[0].textContent,
    /temporairement indisponibles/);
  assert.equal(nodes.get('stat-current').textContent,'—');
  assert.equal(nodes.get('search-filter'),undefined);
  assert.match(nodes.get('events-current').children[0].textContent,
    /temporairement indisponibles/);
  assert.ok(script.includes('evenements-snapshot.json'));
  assert.ok(!script.includes('api/public/events'));
  assert.ok(!script.includes('embedded-events'));
});

test('Un fichier GitHub de plus de 48h est refusé, même si la requête fonctionne',async()=>{
  const nodes=await makePage({stale:true});
  assert.match(nodes.get('source-line').textContent,/trop ancien/);
  assert.equal(nodes.get('stat-current').textContent,'—');
  assert.match(nodes.get('events-objectives').children[0].textContent,
    /temporairement indisponibles/);
});
