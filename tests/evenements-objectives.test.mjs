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
  teams=realTeams,characters=realCharacters,failReferences=false,hash=''}={}){
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
  const location={search:'',hash,pathname:'/msf/evenements.html'};
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
        localizationStatus:'no-translated-text',events
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
  assert.ok(notes.some(x=>x.includes('Plafond 8 pts')));
  assert.ok(notes.some(x=>x.includes('Jusqu’à 8 actions comptabilisées')));
  const login=objectiveNodes(nodes).find(row=>row.children[0].textContent.includes('7 jours'));
  const loginNotes=login.children[1].children.map(x=>x.textContent);
  assert.ok(loginNotes.some(x=>x.includes('Plafond 7 pts')));
  assert.ok(!loginNotes.some(x=>x.includes('7 fois')));
});

test('La recherche trouve aussi le texte des objectifs secondaires',async()=>{
  const nodes=await makePage();
  nodes.get('search-filter').handlers.get('input')({target:{value:'Iron Raider'}});
  assert.equal(nodes.get('stat-objectives').textContent,'1');
  assert.equal(actions(nodes).length,1);
  assert.ok(actions(nodes)[0].includes('Iron Raider'));
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

  // La recherche retrouve aussi les membres de l'équipe sélectionnée.
  nodes.get('search-filter').handlers.get('input')({target:{value:'Avengers IA'}});
  assert.equal(nodes.get('stat-objectives').textContent,'15');
  assert.equal(objectiveDetails(nodes,'ev-objective-team').length,1);
  assert.equal(objectiveDetails(nodes,'ev-objective-character').length,5);
  assert.equal(objectiveNodes(nodes).length,15);
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
    assert.ok(row.children[1].children.some(c=>c.textContent?.includes('Plafond 1 pts')));
  }
  assert.ok(objectiveNodes(nodes).some(row=>row.children[1].children.some(c=>
    c.textContent?.includes('1000')||c.textContent?.includes('1 000')||
    c.textContent?.includes('1 000'))));
  assert.equal(objectiveNodes(nodes).length,Number(nodes.get('stat-objectives').textContent));
});

test('Les objectifs Raid et Guerre absorbent leurs combats généraux, sans inclure les non-combats',async()=>{
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
    ['🛡️ RAID','⚔️ GUERRE','📋 DIVERS']);
  assert.equal(sections(nodes)[0].children[1].children.length,1);
  assert.equal(sections(nodes)[1].children[1].children.length,1);
  assert.equal(sections(nodes)[2].children[1].children.length,1);
  const general=objectiveNodes(nodes).filter(row=>
    row.children[1].children.some(c=>c.textContent?.includes('Tous modes')));
  assert.equal(general.length,2);
  assert.ok(!sections(nodes)[2].children[1].children.some(group=>
    group.textContent?.includes('Combattre')));
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
  assert.equal(raid[0].children[0].children[1].textContent,'3 méthodes');
  assert.equal(war[0].children[0].children[1].textContent,'2 méthodes');
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
  for(const cap of [24,6,5,144000,384000])
    assert.ok(normalized.includes('Plafond'+cap+'pts'),cap+' points conservés');
  assert.ok(normalized.includes('+125pt(s)/action'));
  assert.ok(normalized.includes('+800pt(s)/action'));
});

test('Les actions montrent les plafonds réels et distinguent le rythme conseillé',async()=>{
  const now=Math.floor(Date.now()/1000);
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
  assert.ok(raid.includes('Solo : 6 et 24 combats pris en compte sur 7 j'));
  assert.ok(raid.includes('Alliance : 1 152 combats pris en compte collectivement sur 7 j'));
  assert.ok(raid.includes('Pour atteindre 24 : ≈ 4 combats/j conseillés (pas un plafond quotidien)'));
  assert.ok(war.includes('Solo : 5 combats pris en compte sur 7 j'));
  assert.ok(war.includes('Alliance : 480 combats pris en compte collectivement sur 7 j'));
  assert.ok(!war.some(x=>x.includes('/j')));
  assert.ok(arena.includes('Solo : 3 combats pris en compte sur 28 j'));
  assert.ok(!arena.some(x=>x.includes('/j')));
  assert.equal(nodes.get('stat-objectives').textContent,'6');
  assert.equal(objectiveNodes(nodes).length,6);
});

test('Une action sans plafond explicite ne devient pas artificiellement illimitée',async()=>{
  const nodes=await makePage({includeBase:false,extraEvents:[
    ['Raid sans plafond','milestone',{milestone:{type:'solo',scoring:{
      methods:[{description:'Combattre en raid',points:1}],cappedScorings:[]}}}]
  ]});
  const summary=sections(nodes)[0].children[1].children[0].children[0];
  const hints=summary.children.filter(child=>child.className==='ev-objective-limit')
    .map(child=>child.textContent);
  assert.deepEqual(hints,['Autre méthode : aucun plafond indiqué']);
});

test('La page Événements reprend le fond, l’en-tête et les panneaux LoSP communs',()=>{
  assert.match(commonCss,/background-image:\s*url\("\.\/Background\.webp"\)/);
  assert.match(html,/class="app ev-page"/);
  assert.match(html,/class="header ev-header"/);
  assert.match(html,/class="homeBtn" href="\.\/home\.html"/);
  assert.match(html,/href="\.\/style\.css\?v=4"/);
  assert.match(html,/href="\.\/evenements\.css\?v=12"/);
  assert.match(css,/\.ev-toolbar\{[^}]*background:var\(--panel\)/);
  assert.match(css,/\.ev-card\{[^}]*background:var\(--panel\)/);
  assert.doesNotMatch(css,/\.ev-body::before|\.ev-hero(?:\{|::after)/);
  assert.doesNotMatch(css,/body\.ev-body\{[^}]*background(?:-image|-color)?:/);
  for(const id of ['tab-objectives','tab-current','tab-past','events-objectives','events-current','events-past']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
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
  assert.match(html,/evenements\.js\?v=23/);
});

test('Les compteurs sont trois onglets exclusifs, utilisables aussi au clavier',async()=>{
  const nodes=await makePage();
  const tabs=['objectives','current','past'];
  const visible=()=>tabs.filter(key=>!nodes.get('section-'+key).hidden);
  assert.match(html,/role="tablist"/);
  assert.doesNotMatch(html,/href="#section-(?:objectives|current|past)"/);
  assert.deepEqual(visible(),['objectives']);
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.get('tab-current')['aria-selected'],'false');

  const count=nodes.get('stat-objectives').textContent;
  nodes.get('tab-objectives').handlers.get('click')();
  assert.deepEqual(visible(),['objectives']);
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.get('tab-current')['aria-selected'],'false');
  assert.equal(nodes.get('tab-objectives').tabIndex,0);

  let prevented=false;
  nodes.get('tab-objectives').handlers.get('keydown')({
    key:'ArrowRight',preventDefault(){prevented=true;}
  });
  assert.equal(prevented,true);
  assert.deepEqual(visible(),['current']);
  assert.equal(nodes.get('tab-current').focused,true);
  nodes.get('tab-current').handlers.get('keydown')({key:'End',preventDefault(){}});
  assert.deepEqual(visible(),['past']);
  assert.equal(nodes.get('stat-objectives').textContent,count);
});

test('Retour Safari BFCache : Objectifs et haut de page rétablis, même après Passés',async()=>{
  const nodes=await makePage();
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.browser.history.scrollRestoration,'manual');
  nodes.get('tab-past').handlers.get('click')();
  assert.equal(nodes.get('section-past').hidden,false);
  nodes.browser.windowHandlers.get('pageshow')({persisted:true});
  assert.equal(nodes.get('section-objectives').hidden,false);
  assert.equal(nodes.get('section-past').hidden,true);
  assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
  assert.equal(nodes.get('tab-past')['aria-selected'],'false');
  assert.ok(nodes.browser.scrollCalls.length>=2);
  nodes.browser.runFrames();
  assert.deepEqual(nodes.browser.scrollCalls.at(-1),[0,0]);
});

test('Ancres historiques Passés / En cours : Objectifs gagne même après rafraîchissement',async()=>{
  for(const hash of ['#section-past','#section-current']){
    const nodes=await makePage({hash});
    assert.equal(nodes.get('section-objectives').hidden,false);
    assert.equal(nodes.get('section-past').hidden,true);
    assert.equal(nodes.get('section-current').hidden,true);
    assert.equal(nodes.get('tab-objectives')['aria-selected'],'true');
    assert.equal(nodes.browser.history.scrollRestoration,'manual');
    assert.deepEqual(nodes.browser.history.replacedUrls,['/msf/evenements.html']);
    assert.ok(nodes.browser.scrollCalls.length>=2);
    nodes.get('tab-past').handlers.get('click')();
    assert.equal(nodes.get('section-past').hidden,false);
    nodes.browser.windowHandlers.get('pageshow')({persisted:true});
    assert.equal(nodes.get('section-objectives').hidden,false);
    assert.equal(nodes.get('section-past').hidden,true);
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
  const filter=nodes.get('type-filter');
  assert.deepEqual(filter.children.map(option=>option.value),['','phases','command','events']);
  filter.handlers.get('change')({target:{value:'command'}});
  assert.equal(nodes.get('stat-current').textContent,'2');
  assert.equal(nodes.get('stat-objectives').textContent,'2');
  filter.handlers.get('change')({target:{value:'events'}});
  assert.equal(nodes.get('stat-current').textContent,'4');
  assert.equal(nodes.get('stat-objectives').textContent,'0');
  filter.handlers.get('change')({target:{value:''}});
  nodes.get('search-filter').handlers.get('input')({target:{value:'Fête de l’équipement'}});
  assert.equal(nodes.get('stat-current').textContent,'0');
  assert.equal(nodes.get('stat-objectives').textContent,'0');
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

test('Les événements courts passés restent listés ; ni déblocages ni modes Blitz',async()=>{
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
    ['Rixe rapide','blitz',{startTime:now-3*day,endTime:now-day}],
    ['ÉPREUVES','info',{startTime:now-400*day,endTime:now-2*day}],
    ['FAMINE','pickYourPoison',{
      cardArt:'https://assets.marvelstrikeforce.com/key_art/Scourge_Famine_Card.jpg',
      pickYourPoison:{typeName:'Fléau',brackets:[{id:'victor'},{id:'default'}]},
      startTime:now-8*day,endTime:now-day
    }]
  ];
  const nodes=await makePage({includeBase:false,extraEvents});
  assert.equal(nodes.get('stat-past').textContent,'2');
  assert.deepEqual(groupTitles(nodes,'past'),['⚔️ Événements']);
  assert.deepEqual(titles(nodes,'past'),['KYLN : CODE FLAMMES','PRISE DE CONTRÔLE DE L’IA']);
  assert.equal(nodes.get('stat-current').textContent,'0');
  assert.equal(nodes.get('stat-objectives').textContent,'0');
});

test('Tous les événements sont rendus directement, même au-delà des anciens seuils',async()=>{
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
  assert.equal(nodes.get('stat-past').textContent,'18');
  assert.equal(cards(nodes).length,29);
  assert.equal(cards(nodes,'past').length,18);
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
  nodes.get('search-filter').handlers.get('input')({target:{value:'raid'}});
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
