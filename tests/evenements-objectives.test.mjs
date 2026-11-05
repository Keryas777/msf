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
async function makePage({failure=false}={}){
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
  let onReady;
  const document={
    readyState:'loading',
    getElementById:id=>elements.get(id)||null,
    createElement:node,
    addEventListener:(type,handler)=>{if(type==='DOMContentLoaded')onReady=handler;}
  };
  // Only the live R2 endpoint is mocked. No real external request.
  const fetchCalls=[];
  runInNewContext(script,{
    document,location:{search:''},URLSearchParams,Intl,Date,
    fetch:async url=>{
      fetchCalls.push(url);
      if(failure)return {ok:false,status:503};
      return {ok:true,json:async()=>({
        status:'ok',schemaVersion:1,total:events.length,count:events.length,
        pages:1,updatedAt:new Date().toISOString(),locale:'en',
        localizationStatus:'no-translated-text',events
      })};
    }
  });
  assert.equal(typeof onReady,'function');
  onReady();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(fetchCalls,[
    'https://losp-roster-service.deliriousfan7.workers.dev/api/public/events'
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

test('Les identifiants obligatoires de la vue Objectifs existent dans le HTML',()=>{
  for(const id of ['section-objectives','events-objectives','stat-objectives','count-objectives']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html,/section-future|events-future|stat-future/);
});

test('Une panne R2 n’utilise aucun snapshot local et affiche une indisponibilité',async()=>{
  const nodes=await makePage({failure:true});
  assert.match(nodes.get('source-line').textContent,/indisponible/);
  assert.equal(nodes.get('events-current').children.length,1);
  assert.match(nodes.get('events-current').children[0].textContent,
    /temporairement indisponibles/);
  assert.equal(nodes.get('stat-current').textContent,'—');
  nodes.get('search-filter').handlers.get('input')({target:{value:'raid'}});
  assert.match(nodes.get('events-current').children[0].textContent,
    /temporairement indisponibles/);
  assert.doesNotMatch(script,/evenements-snapshot\.json|embedded-events/);
});
