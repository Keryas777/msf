import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(read('docs/alliance-history-data.js'),context);
const {chooseSnapshots,prepare}=context.window.LoSPStandingsSeries;
const config=JSON.parse(read('docs/data/alliance-standings/config.json'));
const registry=JSON.parse(read('docs/data/alliances.json'));
const index=JSON.parse(read('docs/data/alliance-standings/index.json'));
const original=JSON.parse(read('docs/data/alliance-standings/'+index.snapshots[0].file));
const byId=id=>config.charts.find(x=>x.id===id);
const addDays=(base,days)=>new Date(Date.parse(base)+days*86400000).toISOString();
const shifted=(days,options={})=>({
  ...original,capturedAt:addDays(original.capturedAt,days),
  seasonId:options.seasonId??null,
  seasonVerified:options.seasonVerified===true,
  alliances:options.alliances??original.alliances.map(a=>({...a,
    warTrophies:a.warTrophies+days,
    raidRank:a.raidRank+days,
    warRank:a.warRank+days}))
});
test('standalone page is not linked from home and has exactly two levels of chips',()=>{
  const html=read('docs/alliance-history.html');
  assert.match(html,/id="history-war"[^>]*data-mode="war"/);
  assert.match(html,/id="history-raid"[^>]*data-mode="raid"/);
  assert.match(html,/id="history-war-choices"/);
  assert.match(html,/id="history-raid-choices" hidden/);
  assert.match(html,/data-chart="war-trophies"/);
  assert.match(html,/data-chart="war-season-rank"/);
  assert.match(html,/data-chart="raid-season-rank"/);
  assert.match(html,/id="history-plot"/);
  assert.doesNotMatch(read('docs/home.html'),/alliance-history\.html/);
  assert.doesNotMatch(read('docs/classements.html'),/alliance-history\.html/);
});
test('five original alliances render by dynamic registry with official colors and values',()=>{
  const model=prepare([original],registry,byId('war-trophies'));
  assert.equal(model.rows.length,1);
  assert.equal(model.series.length,5);
  assert.deepEqual(Array.from(model.series,s=>s.key),
    ['zeus','athena','kronos','dionysos','poseidon']);
  assert.deepEqual(Array.from(model.series,s=>s.color),[
    '#F8FF00','#F28C28','#E10D17','#93328E','#0000FF']);
  assert.equal(model.series.find(s=>s.key==='zeus').points[0].value,2875);
  assert.equal(prepare([original],registry,byId('war-season-rank'))
    .series.find(s=>s.key==='kronos').points[0].value,93);
  assert.equal(prepare([original],registry,byId('raid-season-rank'))
    .series.find(s=>s.key==='zeus').points[0].value,77);
});
test('all trophy snapshots, but only 15-day-spaced raid and war rankings',()=>{
  const snapshots=[shifted(30),original,shifted(7),shifted(15)];
  const trophy=prepare(snapshots,registry,byId('war-trophies'));
  const raid=prepare(snapshots,registry,byId('raid-season-rank'));
  const war=prepare(snapshots,registry,byId('war-season-rank'));
  assert.equal(trophy.rows.length,4);
  assert.equal(raid.rows.length,3);
  assert.equal(war.rows.length,3);
  assert.deepEqual(Array.from(raid.rows,x=>x.capturedAt),[
    original.capturedAt,addDays(original.capturedAt,15),
    addDays(original.capturedAt,30)]);
  assert.equal(trophy.series.find(s=>s.key==='zeus').points[1].value,2882);
});
test('missing alliance stays absent, never zero or interpolated',()=>{
  const fewer=shifted(15,{alliances:original.alliances.filter(a=>a.key!=='athena')});
  const model=prepare([original,fewer],registry,byId('war-trophies'));
  assert.equal(model.series.find(s=>s.key==='athena').points[1].value,null);
  assert.equal(model.series.length,5);
});
test('verified season transition creates additional boundary checkpoint',()=>{
  const first=shifted(0,{seasonVerified:true,seasonId:'season-A'});
  const next=shifted(7,{seasonVerified:true,seasonId:'season-B'});
  const chosen=chooseSnapshots([first,next],byId('raid-season-rank'));
  assert.equal(chosen.length,2);
  const model=prepare([first,next],registry,byId('raid-season-rank'));
  assert.equal(model.series[0].points[0].seasonId,'season-A');
  assert.equal(model.series[0].points[1].seasonId,'season-B');
});
test('date sorting, duplicate prevention and alliance registry not hardcoded',()=>{
  const list=chooseSnapshots([shifted(7),original,original],byId('war-trophies'));
  assert.equal(list.length,2);
  assert.equal(list[0].capturedAt,original.capturedAt);
  const extraRegistry=[...registry,{key:'new-alliance',name:'Nouvelle',color:'#abcdef',order:7}];
  const future=shifted(15,{alliances:[...original.alliances,
    {key:'new-alliance',warTrophies:3000,warRank:1,raidRank:2}]});
  const model=prepare([original,future],extraRegistry,byId('war-trophies'));
  assert.equal(model.series.length,6);
  assert.equal(model.series.find(s=>s.key==='new-alliance').points[0].value,null);
  assert.equal(model.series.find(s=>s.key==='new-alliance').points[1].value,3000);
});
test('rank chart axis is inverted and source JSON is loaded via index',()=>{
  const js=read('docs/alliance-history.js');
  assert.match(js,/const rank=!chart\.higherIsBetter/);
  assert.match(js,/rank\?\(v-bounds\.lo\)/);
  assert.match(js,/index\.json/);
  assert.match(js,/cache:'no-store'/);
  assert.match(js,/ResizeObserver/);
  assert.doesNotMatch(js,/api\.marvelstrikeforce\.com|chart\.js|react|vue/i);
});
