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
function makePage(){
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
  elements.set('embedded-events',{textContent:JSON.stringify({
    metadata:{snapshotUploadedAt:new Date().toISOString()},events
  })});
  let onReady;
  const document={
    readyState:'loading',
    getElementById:id=>elements.get(id)||null,
    createElement:node,
    addEventListener:(type,handler)=>{if(type==='DOMContentLoaded')onReady=handler;}
  };
  // Ne jamais contacter Scopely ni le Worker pendant ces tests.
  runInNewContext(script,{
    document,location:{search:''},URLSearchParams,Intl,Date,
    fetch:()=>new Promise(()=>{})
  });
  assert.equal(typeof onReady,'function');
  onReady();
  return elements;
}
const sections=nodes=>nodes.get('events-objectives').children.filter(x=>x.tag==='section');
const actions=nodes=>sections(nodes).flatMap(x=>x.children[1].children.map(item=>item.children[0].textContent));

test('Le résumé rassemble les objectifs actifs, y compris les feeders, sans doublons',()=>{
  const nodes=makePage();
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

test('Un plafond de scoring reste un maximum, pas un objectif obligatoire',()=>{
  const nodes=makePage();
  const raid=sections(nodes)[0].children[1].children[0];
  const notes=raid.children[1].children.map(x=>x.textContent);
  assert.ok(notes.includes('Jusqu’à 8 actions comptabilisées'));
  const login=sections(nodes)[2].children[1].children[0];
  const loginNotes=login.children[1].children.map(x=>x.textContent);
  assert.ok(loginNotes.includes('Plafond 7 pts'));
  assert.ok(!loginNotes.some(x=>x.includes('7 fois')));
});

test('La recherche trouve aussi le texte des objectifs secondaires',()=>{
  const nodes=makePage();
  nodes.get('search-filter').handlers.get('input')({target:{value:'Iron Raider'}});
  assert.equal(nodes.get('stat-objectives').textContent,'1');
  assert.equal(actions(nodes).length,1);
  assert.ok(actions(nodes)[0].includes('Iron Raider'));
});

test('Les identifiants obligatoires de la vue Objectifs existent dans le HTML',()=>{
  for(const id of ['section-objectives','events-objectives','stat-objectives','count-objectives']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html,/section-future|events-future|stat-future/);
});
