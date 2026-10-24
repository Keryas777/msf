import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(read('docs/alliance-history-data.js'),context);
const {chooseSnapshots,prepare,rankLatest}=context.window.LoSPStandingsSeries;
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
  rankingSeason:options.rankingSeason??original.rankingSeason,
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
test('all trophy observations and exactly one selected point per completed ranking season',()=>{
  const repeat=shifted(2,{seasonVerified:true,seasonId:original.seasonId});
  const next=shifted(7,{
    seasonVerified:true,seasonId:'2026-10-11/2026-10-25',
    rankingSeason:{startAt:'2026-10-11T20:00:00.000Z',
      endExclusiveAt:'2026-10-25T20:00:00.000Z',
      identification:'user-confirmed',timezone:'Europe/Paris'}
  });
  const snapshots=[next,repeat,original];
  const trophy=prepare(snapshots,registry,byId('war-trophies'));
  const raid=prepare(snapshots,registry,byId('raid-season-rank'));
  const war=prepare(snapshots,registry,byId('war-season-rank'));
  assert.equal(trophy.rows.length,3);
  assert.equal(raid.rows.length,2);
  assert.equal(war.rows.length,2);
  // Subsequent captures of the SAME completed season do not create extra points.
  assert.equal(raid.rows[0].capturedAt,repeat.capturedAt);
  assert.equal(raid.series[0].points[0].plotAt,'2026-10-11T20:00:00.000Z');
  assert.equal(raid.series[0].points[1].plotAt,'2026-10-25T20:00:00.000Z');
  assert.equal(raid.series[0].points[1].capturedAt,next.capturedAt);
  assert.equal(trophy.series.find(x=>x.key==='zeus').points[1].value,2877);
  const latest=rankLatest(snapshots,registry,byId('raid-season-rank'));
  assert.equal(latest.find(x=>x.key==='zeus').value,
    raid.series.find(x=>x.key==='zeus').points[1].value);
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

test('the latest standings display is titled and uses exactly one vertical row per alliance',()=>{
  const html=read('docs/alliance-history.html');
  const css=read('docs/alliance-history.css');
  const js=read('docs/alliance-history.js');
  assert.match(html,/id="history-latest-title"/);
  assert.match(html,/id="history-latest" class="historyLatest" role="list"/);
  assert.match(css,/\.historyLatest \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(css,/\.historyLatest \{ grid-template-columns: repeat\(5/);
  assert.match(js,/Derniers trophées de guerre/);
  assert.match(js,/Derniers classements de saison/);
  assert.match(js,/setAttribute\('role','listitem'\)/);
});
test('trophies descend, world war and raid ranks ascend across all five alliances',()=>{
  const trophies=rankLatest([original],registry,byId('war-trophies'));
  const war=rankLatest([original],registry,byId('war-season-rank'));
  const raid=rankLatest([original],registry,byId('raid-season-rank'));
  assert.deepEqual(Array.from(trophies,x=>[x.key,x.value]),[
    ['zeus',2875],['kronos',2758],['athena',2678],
    ['dionysos',2607],['poseidon',2189]]);
  assert.deepEqual(Array.from(war,x=>[x.key,x.value]),[
    ['kronos',93],['zeus',322],['dionysos',332],
    ['athena',427],['poseidon',722]]);
  assert.deepEqual(Array.from(raid,x=>[x.key,x.value]),[
    ['zeus',77],['athena',157],['kronos',235],
    ['dionysos',285],['poseidon',767]]);
});
test('latest rank list matches the season point shown by its graph',()=>{
  const newer=shifted(7,{seasonId:original.seasonId,seasonVerified:true});
  const sampled=prepare([original,newer],registry,byId('raid-season-rank'));
  assert.equal(sampled.rows.length,1);
  const latest=rankLatest([original,newer],registry,byId('raid-season-rank'));
  assert.equal(latest.find(x=>x.key==='zeus').value,84);
  assert.equal(sampled.series.find(x=>x.key==='zeus').points[0].value,84);
  assert.equal(latest.find(x=>x.key==='zeus').capturedAt,newer.capturedAt);
  assert.equal(latest.find(x=>x.key==='zeus').seasonEndAt,
    '2026-10-11T20:00:00.000Z');
});
test('incomplete capture preserves last real reading and always sorts unavailable rows last',()=>{
  const noAthena=shifted(7,{alliances:original.alliances.filter(x=>x.key!=='athena')});
  const latest=rankLatest([original,noAthena],registry,byId('war-trophies'));
  assert.equal(latest.find(x=>x.key==='athena').value,2678);
  assert.equal(latest.find(x=>x.key==='athena').capturedAt,original.capturedAt);
  const onlyZeus=shifted(15,{alliances:[original.alliances.find(x=>x.key==='zeus')]});
  const incompleteRegistry=[...registry.filter(x=>x.key!=='hades')];
  // An alliance seen in a prior capture but with an absent numeric field
  // must not show a fabricated zero (the row falls to the bottom).
  const bad=shifted(22,{alliances:onlyZeus.alliances.map(x=>({...x,warTrophies:null}))});
  const partial=rankLatest([bad],incompleteRegistry,byId('war-trophies'));
  assert.equal(partial[0].value,null);
  assert.equal(partial[0].capturedAt,null);
});

test('a completed ranking season is dated by its end, not by the OAuth capture date',()=>{
  const chart=byId('war-season-rank');
  const model=prepare([original],registry,chart);
  assert.equal(model.rows[0].capturedAt,'2026-10-21T10:55:00.466Z');
  assert.equal(model.series[0].points[0].plotAt,
    '2026-10-11T20:00:00.000Z');
  const js=read('docs/alliance-history.js');
  assert.match(js,/plotAt\|\|p.capturedAt/);
  assert.match(js,/Saison du /);
  assert.doesNotMatch(js,/previous\.seasonId!==p\.seasonId\)flush\(\)/);
});

test('calculated season picks previous completed 14-day cycle across winter DST',()=>{
  const resolve=context.window.LoSPStandingsSeries.resolveRankingSeason;
  const calendar=config.rankingSeasons;
  assert.equal(calendar.cycleDays,14);
  assert.equal(resolve('2026-10-21T10:55:00.466Z',calendar).seasonId,
    '2026-09-27/2026-10-11');
  // One hour after 25 October's UTC cutoff, the prior season advances.
  assert.equal(resolve('2026-10-25T20:59:59.000Z',calendar).seasonId,
    '2026-09-27/2026-10-11');
  const next=resolve('2026-10-25T21:00:00.000Z',calendar);
  assert.equal(next.seasonId,'2026-10-11/2026-10-25');
  assert.equal(next.startAt,'2026-10-11T20:00:00.000Z');
  assert.equal(next.endExclusiveAt,'2026-10-25T20:00:00.000Z');
  assert.equal(next.identification,'schedule-derived');
});
test('unverified future captures are grouped by calculated season, without false verification',()=>{
  const calendar=config.rankingSeasons;
  const early=shifted(2);
  const same=shifted(3);
  const future=shifted(7);
  const chart=byId('raid-season-rank');
  const chosen=chooseSnapshots([future,same,original,early],chart,calendar);
  assert.equal(chosen.length,2);
  assert.equal(chosen[0].capturedAt,original.capturedAt);
  assert.equal(chosen[0].seasonVerified,true);
  assert.equal(chosen[1].capturedAt,future.capturedAt);
  assert.equal(chosen[1].seasonVerified,false);
  assert.equal(chosen[1].seasonDerived,true);
  const model=prepare([future,original],registry,chart,calendar);
  assert.equal(model.series[0].points[1].seasonVerified,false);
  assert.equal(model.series[0].points[1].plotAt,'2026-10-25T20:00:00.000Z');
  assert.equal(rankLatest([original,future],registry,chart,calendar)[0].seasonEndAt,
    '2026-10-25T20:00:00.000Z');
});
test('trophies retain every genuine measurement regardless of season calendar',()=>{
  const chart=byId('war-trophies');
  const extra=shifted(3);
  assert.equal(prepare([original,extra],registry,chart,config.rankingSeasons).rows.length,2);
  assert.equal(chooseSnapshots([original,extra],chart,config.rankingSeasons)[1].capturedAt,
    extra.capturedAt);
  assert.equal(prepare([original],registry,byId('war-season-rank'),
    {referenceEndExclusiveAt:'invalid',cycleDays:14,publicationDelayMinutes:60}).rows.length,1);
  // Verified metadata remains usable even if the inferred schedule is invalid.
});
test('page reads the configured calendar, preserves authorization and cache busting',()=>{
  const source=read('docs/alliance-history.js');
  const html=read('docs/alliance-history.html');
  assert.match(source,/state\.config\.rankingSeasons/);
  assert.match(html,/auth-guard\.js/);
  assert.match(html,/alliance-history-data\.js\?v=3/);
  assert.match(html,/alliance-history\.js\?v=6/);
});

test('22 October adds exactly a second real trophy point, not a second season ranking',()=>{
  const later=JSON.parse(read('docs/data/alliance-standings/snapshots/2026-10-22T120208591Z.json'));
  const trophies=prepare([original,later],registry,byId('war-trophies'),config.rankingSeasons);
  assert.equal(trophies.rows.length,2);
  assert.equal(trophies.series.length,5);
  assert.deepEqual(Array.from(trophies.series,s=>[s.key,Array.from(s.points,p=>p.value)]),[
    ['zeus',[2875,2806]],['athena',[2678,2604]],['kronos',[2758,2684]],
    ['dionysos',[2607,2663]],['poseidon',[2189,2264]]
  ]);
  for(const id of ['war-season-rank','raid-season-rank']){
    const model=prepare([original,later],registry,byId(id),config.rankingSeasons);
    assert.equal(model.rows.length,1);
    assert.equal(model.rows[0].capturedAt,original.capturedAt);
    assert.equal(model.series[0].points[0].plotAt,'2026-10-11T20:00:00.000Z');
  }
  assert.deepEqual(Array.from(rankLatest([original,later],registry,
    byId('war-trophies'),config.rankingSeasons),x=>[x.key,x.value]),[
    ['zeus',2806],['kronos',2684],['dionysos',2663],
    ['athena',2604],['poseidon',2264]
  ]);
});


function drawRenderedChart(id,clientWidth=390,snapshots=[original]){
  // Execute the same SVG plotting function shipped to GitHub Pages.
  // A tiny DOM stub is sufficient; no dependency on a browser framework.
  const source=read('docs/alliance-history.js');
  const begin=source.indexOf('  function niceStep(');
  const end=source.indexOf('  function plotDatesForPeriod(',begin);
  assert.ok(begin>=0&&end>begin,'Plot function must remain present');
  const plot={
    children:[],attributes:{},
    replaceChildren(){this.children=[];},
    setAttribute(name,value){this.attributes[name]=String(value);},
    append(node){this.children.push(node);}
  };
  const makeNode=(tag,attrs={},text)=>({
    tag,attrs,text,children:[],
    append(node){this.children.push(node);},
    addEventListener(){}
  });
  const ctx=vm.createContext({
    refs:{plot,plotWrap:{clientWidth}},svg:makeNode,
    safeColor:value=>value,formatDate:date=>date.slice(0,10),
    number:new Intl.NumberFormat('fr-FR'),
    state:{snapshots,registry,config},
    byId,
    window:{LoSPStandingsSeries:context.window.LoSPStandingsSeries}
  });
  vm.runInContext(source.slice(begin,end)+'\nthis.plotFn=drawPlot;',ctx);
  ctx.plotFn(prepare(snapshots,registry,byId(id),config.rankingSeasons),byId(id));
  return plot;
}
test('raid and war ranking charts use exact 1, 100, 200 ... hundred ticks and taller SVG',()=>{
  for(const id of ['raid-season-rank','war-season-rank']){
    const plot=drawRenderedChart(id);
    assert.equal(plot.attributes.viewBox,'0 0 382 350');
    const labels=plot.children.filter(n=>n.tag==='text'&&
      n.attrs['text-anchor']==='end').map(n=>n.text);
    assert.deepEqual(labels,['1','100','200','300','400','500','600','700','800']);
    assert.equal(plot.children.filter(n=>n.tag==='line'&&
      n.attrs.class==='historyGridLine').length,9);
    const points=plot.children.filter(n=>n.tag==='circle');
    assert.equal(points.length,5,'All five official rank values remain plotted');
    const y=rank=>14+(rank-1)/(800-1)*(350-14-48);
    for(const point of points){
      assert.ok(point.attrs.cy>=14&&point.attrs.cy<=302);
    }
    assert.equal(plot.children.find(n=>n.tag==='line').attrs.y1,14);
  }
});
test('rankings shade Top 100 dark green and 101-200 light green behind points',()=>{
  for(const id of ['raid-season-rank','war-season-rank']){
    const plot=drawRenderedChart(id);
    const bands=plot.children.filter(n=>n.tag==='rect');
    assert.equal(bands.length,2);
    assert.equal(bands[0].attrs.class,'historyRankBand');
    assert.equal(bands[1].attrs.class,'historyRankBand');
    assert.notEqual(bands[0].attrs.fill,bands[1].attrs.fill);
    assert.ok(Number(bands[0].attrs['fill-opacity'])>0);
    assert.ok(Number(bands[1].attrs['fill-opacity'])>0);
    assert.ok(Number(bands[0].attrs['fill-opacity'])<1);
    assert.ok(Number(bands[1].attrs['fill-opacity'])<1);
    assert.equal(bands[0].attrs.y,14);
    assert.ok(Math.abs(bands[0].attrs.y+bands[0].attrs.height-
      bands[1].attrs.y)<1e-7,'The two bands must touch');
    assert.ok(plot.children.indexOf(bands[1])<
      plot.children.findIndex(n=>n.tag==='circle'),
      'Bands must be behind all alliance dots');
    assert.ok(plot.children.indexOf(bands[1])<
      plot.children.findIndex(n=>n.tag==='line'),
      'Bands must also be behind the grid');
  }
});
test('trophies show four visible grey Diamond divisions with right-side labels',()=>{
  const divisions=config.trophyDivisions;
  assert.deepEqual(divisions.map(b=>[b.label,b.min,b.max??null]),[
    ['D-I',2250,2499],['D-II',2500,2749],
    ['D-III',2750,2999],['D-IV',3000,null]
  ]);
  for(const width of [320,390,680]){
    const plot=drawRenderedChart('war-trophies',width);
    assert.equal(plot.attributes.viewBox,
      '0 0 '+(width-8)+' '+(width<500?320:370));
    const bands=plot.children.filter(n=>n.attrs.class==='historyTrophyBand');
    const separators=plot.children.filter(n=>n.attrs.class==='historyTrophyBoundary');
    const labels=plot.children.filter(n=>n.attrs.class==='historyTrophyLabel');
    assert.equal(bands.length,4);
    assert.equal(new Set(bands.map(b=>b.attrs.fill)).size,4);
    assert.deepEqual(labels.map(n=>n.text),['D-I','D-II','D-III','D-IV']);
    assert.equal(separators.length,3);
    assert.ok(bands.every(b=>b.attrs.height>16));
    assert.ok(labels.every(l=>l.attrs.x>width-8-50));
    assert.ok(plot.children.indexOf(bands.at(-1))<
      plot.children.findIndex(n=>n.tag==='circle'),
      'Grey zones remain behind the alliance curves');
    assert.equal(plot.children.filter(n=>n.tag==='line'&&
      n.attrs.class==='historyGridLine').length,5);
    assert.equal(plot.children.filter(n=>n.tag==='circle').length,5);
    assert.equal(plot.children.filter(n=>n.attrs.class==='historyRankBand').length,0);
  }
});

test('both seasonal charts always share the largest hundred ceiling, regardless of which has worse ranks',()=>{
  const cases=[
    {raid:930,war:722,expected:1000},
    {raid:767,war:1044,expected:1100},
    {raid:1395,war:1201,expected:1400}
  ];
  for(const {raid,war,expected} of cases){
    const modified={...original,alliances:original.alliances.map((a,i)=>
      i===0?{...a,raidRank:raid,warRank:war}:a)};
    const plots=['raid-season-rank','war-season-rank'].map(id=>
      drawRenderedChart(id,390,[modified]));
    const scales=plots.map(plot=>plot.children.filter(n=>
      n.tag==='text'&&n.attrs['text-anchor']==='end').map(n=>
      Number(String(n.text).replace(/\D/g,''))));
    assert.deepEqual(scales[0],scales[1],
      'Switching between raid and war must keep identical Y-axis ticks');
    assert.equal(scales[0][0],1);
    assert.equal(scales[0].at(-1),expected);
    assert.equal(scales[0].length,expected/100+1);
    for(const plot of plots){
      const ticks=plot.children.filter(n=>n.tag==='line'&&
        n.attrs.class==='historyGridLine');
      assert.equal(ticks.length,scales[0].length);
      assert.equal(ticks[0].attrs.y1,14);
      assert.equal(ticks.at(-1).attrs.y1,302);
      assert.equal(plot.children.filter(n=>n.tag==='rect').length,2);
    }
  }
});
test('trophy graph is still independent of shared ranking ceiling',()=>{
  const altered={...original,alliances:original.alliances.map(a=>
    ({...a,raidRank:2750,warRank:3400}))};
  const baseline=drawRenderedChart('war-trophies',390);
  const changed=drawRenderedChart('war-trophies',390,[altered]);
  assert.equal(changed.attributes.viewBox,baseline.attributes.viewBox);
  assert.deepEqual(
    changed.children.filter(n=>n.tag==='text'&&n.attrs['text-anchor']==='end').map(n=>n.text),
    baseline.children.filter(n=>n.tag==='text'&&n.attrs['text-anchor']==='end').map(n=>n.text)
  );
  assert.equal(changed.children.filter(n=>
    n.attrs.class==='historyTrophyBand').length,4);
});
