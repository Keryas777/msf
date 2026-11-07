import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../docs/evenements.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/evenements.html',import.meta.url),'utf8');

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
async function makePage({failure=false,stale=false,extraEvents=[]}={}){
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const elements=new Map(ids.map(id=>[id,node()]));
  const now=Math.floor(Date.now()/1000),day=86400;
  let sequence=0;
  const event=(name,description,{secondary=false,cap=null,points=1,dates=null}={})=>({
    id:'fixture-'+(++sequence),name,type:'milestone',
    startTime:now-day,endTime:now+day*2,
    ...(secondary?{locationHints:['lohub_feeder']}:{}),
    milestone:{scoring:{
      methods:cap===null&&description?[{description,points}]:[],
      cappedScorings:cap!==null?[{cap,methods:[{description,points}]}]:[]
    }},
    ...(dates||{})
  });
  const events=[
    event('Raid Event',''),
    event('Raid Event','Play Alliance Raid with an Iron Raider at Gear Tier 21',{secondary:true,cap:8}),
    event('Raid Event','Play Alliance Raid with an Iron Raider at Gear Tier 21',{secondary:true,cap:8}),
    event('War Event','Play Alliance War with an Eternal at GT21'),
    event('Daily Event','Log In for 7 Days',{cap:7}),
    event('Future Event','Battle in Raid',{dates:{startTime:now+day,endTime:now+day*5}}),
    event('Past Event','Battle in War',{dates:{startTime:now-day*5,endTime:now-day}})
  ];
  for(const [name,type,more] of extraEvents){
    events.push({
      id:'fixture-'+(++sequence),name,type,
      startTime:now-day,endTime:now+day*2,
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
  const fetchCalls=[];
  runInNewContext(script,{
    document,location:{search:''},URLSearchParams,Intl,Date,
    fetch:async url=>{
      fetchCalls.push(url);
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
  assert.deepEqual(fetchCalls,[
    './data/evenements-snapshot.json'
  ]);
  return elements;
}
const sections=nodes=>nodes.get('events-objectives').children.filter(x=>x.tag==='section');
const actions=nodes=>sections(nodes).flatMap(x=>x.children[1].children.map(item=>item.children[0].textContent));

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
  const raid=sections(nodes)[0].children[1].children[0];
  const notes=raid.children[1].children.map(x=>x.textContent);
  assert.ok(notes.includes('Jusqu’à 8 actions comptabilisées'));
  const login=sections(nodes)[2].children[1].children[0];
  const loginNotes=login.children[1].children.map(x=>x.textContent);
  assert.ok(loginNotes.includes('Plafond 7 pts'));
  assert.ok(!loginNotes.some(x=>x.includes('7 fois')));
});

test('La recherche trouve aussi le texte des objectifs secondaires',async()=>{
  const nodes=await makePage();
  nodes.get('search-filter').handlers.get('input')({target:{value:'Iron Raider'}});
  assert.equal(nodes.get('stat-objectives').textContent,'1');
  assert.equal(actions(nodes).length,1);
  assert.ok(actions(nodes)[0].includes('Iron Raider'));
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

test('Les compteurs sont trois onglets exclusifs, utilisables aussi au clavier',async()=>{
  const nodes=await makePage();
  const tabs=['objectives','current','past'];
  const visible=()=>tabs.filter(key=>!nodes.get('section-'+key).hidden);
  assert.match(html,/role="tablist"/);
  assert.doesNotMatch(html,/href="#section-(?:objectives|current|past)"/);
  assert.deepEqual(visible(),['current']);
  assert.equal(nodes.get('tab-current')['aria-selected'],'true');

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

test('La localisation FR ne réintroduit pas les épreuves légendaires et jalons S.T.R.I.K.E.',async()=>{
  const trial=name=>[name,'pickYourPoison',{pickYourPoison:{typeName:'Fléau'}}];
  const milestone=name=>[name,'milestone',{milestone:{scoring:{methods:[],cappedScorings:[]}}}];
  const extraEvents=[
    trial('MORT'),trial('GUERRE'),trial('ROI D’OMBRE'),
    trial('Death'),trial('Shadow King'),trial('SALLE DES DANGERS'),
    milestone('S.T.R.I.K.E. : premier assaut'),
    milestone('Deuxième S.T.R.I.K.E.'),
    milestone('S.T.R.I.K.E. : troisième assaut'),
    milestone('Coup du S.T.R.I.K.E.'),
    milestone('First S.T.R.I.K.E.'),milestone('S.T.R.I.K.E. Back'),
    trial('KYLN : CODE FLAMMES'),
    trial('ÉVÉNEMENT BRISEUR : DENTS-DE-SABRE'),
    milestone('S.T.R.I.K.E. : raid spécial')
  ];
  const nodes=await makePage({extraEvents});
  const visible=nodes.get('events-current').children;
  assert.equal(nodes.get('stat-current').textContent,'6');
  assert.equal(visible.length,6);
  const shown=visible.map(card=>card.children[1].children[1].textContent);
  assert.ok(shown.includes('KYLN : CODE FLAMMES'));
  assert.ok(shown.includes('ÉVÉNEMENT BRISEUR : DENTS-DE-SABRE'));
  assert.ok(shown.includes('S.T.R.I.K.E. : raid spécial'));
  for(const [name] of extraEvents.slice(0,12))assert.ok(!shown.includes(name),name);
  assert.equal(nodes.get('stat-objectives').textContent,'3');
});

test('Le calendrier regroupe les paliers et éditions, sans perdre leurs méthodes dans Objectifs',async()=>{
  const now=Math.floor(Date.now()/1000),day=86400;
  const festival=(name,description)=>[name,'milestone',{
    subName:'Équipez votre effectif',
    startTime:now-day,endTime:now+3*day,
    milestone:{scoring:{methods:[{description,points:50}],cappedScorings:[]}}
  }];
  const campaign=(start,end)=>['Fils à retordre','episodic',{
    subName:'Société des araignées',startTime:start,endTime:end,
    episodic:{type:'eventCampaign',ids:['TEAM_SPIDERS_A','TEAM_SPIDERS_B']}
  }];
  const daily=(start,end)=>['Sauvez le monde !','milestone',{
    startTime:start,endTime:end,
    milestone:{scoring:{methods:[{description:'Dépensez 1 énergie de campagne',points:5}],cappedScorings:[]}}
  }];
  const extraEvents=[
    festival('Fête de l’équipement','Atteindre le palier G3'),
    festival('Fête de l’équipement : II','Atteindre le palier G4'),
    festival('Fête de l’équipement : III','Atteindre le palier G5'),
    campaign(now-day*2,now+day*9),
    campaign(now-day,now+day*10),
    daily(now-day*2,now-day),
    daily(now-day,now+60*60),
    ['Récompense Web','milestone',{
      locationHints:['web_exclusive'],
      milestone:{scoring:{methods:[{description:'Récupérer une offre Web',points:1}],cappedScorings:[]}}
    }],
    ['Dons du jour','donation',{}],
    ['Saga permanente','episodic',{
      endTime:now+360*day,episodic:{type:'eventCampaign',ids:['SAGA']}
    }],
    ['Contexte de saga','info',{endTime:now+360*day}],
    ['Épreuve Briseur temporaire','pickYourPoison',{
      pickYourPoison:{typeName:'Fléau'},endTime:now+14*day
    }]
  ];
  const nodes=await makePage({extraEvents});
  assert.equal(nodes.get('stat-current').textContent,'6');
  assert.equal(nodes.get('events-current').children.length,6);
  assert.equal(nodes.get('stat-objectives').textContent,'8');
  const titles=nodes.get('events-current').children.map(card=>card.children[1].children[1].textContent);
  assert.equal(titles.filter(title=>title==='Fête de l’équipement').length,1);
  assert.equal(titles.filter(title=>title==='Fils à retordre').length,1);
  assert.ok(titles.includes('Épreuve Briseur temporaire'));
  assert.ok(!titles.includes('Récompense Web'));
  assert.ok(!titles.includes('Sauvez le monde !'));
  assert.ok(!titles.includes('Dons du jour'));
  assert.ok(!titles.includes('Saga permanente'));
  assert.ok(!titles.includes('Contexte de saga'));
  assert.ok(actions(nodes).some(text=>text.includes('palier G3')));
  assert.ok(actions(nodes).some(text=>text.includes('palier G4')));
  assert.ok(actions(nodes).some(text=>text.includes('palier G5')));
  assert.ok(actions(nodes).some(text=>text.includes('offre Web')));
  nodes.get('search-filter').handlers.get('input')({target:{value:'Fête de l’équipement'}});
  assert.equal(nodes.get('stat-current').textContent,'1');
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
