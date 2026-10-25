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
  assert.match(html,/alliance-history-data\.js\?v=5/);
  assert.match(html,/alliance-history\.js\?v=11/);
  assert.match(html,/alliance-history\.css\?v=4/);
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


function drawRenderedChart(id,clientWidth=390,snapshots=[original],hiddenKeys=[]){
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
    remove(){const i=plot.children.indexOf(this);
      if(i>=0)plot.children.splice(i,1);},
    // Approximate browser SVG text measurement for the isolated test DOM.
    getComputedTextLength(){return String(this.text||'').length*7;},
    addEventListener(){}
  });
  const ctx=vm.createContext({
    refs:{plot,plotWrap:{clientWidth}},svg:makeNode,
    safeColor:value=>value,formatDate:date=>date.slice(0,10),
    number:new Intl.NumberFormat('fr-FR'),
    state:{snapshots,registry,config,hiddenAlliances:new Set(hiddenKeys)},
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
test('trophy plot shows P-IV and four Diamond tiers, with smaller empty edge zones',()=>{
  const divisions=config.trophyDivisions;
  assert.deepEqual(divisions.map(b=>[b.label,b.min??null,b.max??null]),[
    ['P-IV',null,2249],['D-I',2250,2499],['D-II',2500,2749],
    ['D-III',2750,2999],['D-IV',3000,null]
  ]);
  for(const width of [320,390,680]){
    const plot=drawRenderedChart('war-trophies',width);
    assert.equal(plot.attributes.viewBox,
      '0 0 '+(width-8)+' '+(width<500?350:400));
    const bands=plot.children.filter(n=>n.attrs.class==='historyTrophyBand');
    const separators=plot.children.filter(n=>n.attrs.class==='historyTrophyBoundary');
    const labels=plot.children.filter(n=>n.attrs.class==='historyTrophyLabel');
    assert.equal(bands.length,5);
    assert.equal(new Set(bands.map(b=>b.attrs.fill)).size,5);
    const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    const luminance=hex=>rgb(hex).reduce((sum,v)=>sum+v,0);
    assert.ok(luminance(bands[0].attrs.fill)>luminance(bands[1].attrs.fill),
      'P-IV must be visually lighter than D-I');
    assert.equal(plot.attributes.viewBox,
      drawRenderedChart('war-season-rank',width).attributes.viewBox,
      'Trophy and war ranking graphs have the same mobile/desktop height');
    assert.equal(plot.attributes.viewBox,
      drawRenderedChart('raid-season-rank',width).attributes.viewBox,
      'Trophy and raid ranking graphs have the same mobile/desktop height');
    assert.deepEqual(labels.map(n=>n.text),['P-IV','D-I','D-II','D-III','D-IV']);
    assert.equal(separators.length,4);
    assert.ok(bands.every(b=>b.attrs.height>16));
    assert.ok(bands[0].attrs.height<bands[1].attrs.height,
      'Empty P-IV is smaller than D-I');
    assert.ok(bands[4].attrs.height<bands[3].attrs.height,
      'Empty D-IV is smaller than D-III');
    assert.ok(labels.every(l=>l.attrs.x>width-8-50));
    assert.ok(plot.children.indexOf(bands.at(-1))<
      plot.children.findIndex(n=>n.tag==='circle'),
      'Grey zones remain behind the alliance curves');
    assert.equal(plot.children.filter(n=>n.tag==='line'&&
      n.attrs.class==='historyGridLine').length,0,
      'No generic horizontal grid lines in the trophy chart');
    assert.equal(plot.children.filter(n=>n.tag==='circle').length,5);
    assert.equal(plot.children.filter(n=>n.attrs.class==='historyRankBand').length,0);
  }
});
test('trophy chart expands beyond P-IV and D-IV for observed outliers',()=>{
  const unusual={...original,alliances:original.alliances.map((a,i)=>(
    i===0?{...a,warTrophies:2040}:
    i===1?{...a,warTrophies:3450}:a))};
  const plot=drawRenderedChart('war-trophies',390,[unusual]);
  const points=plot.children.filter(n=>n.tag==='circle');
  assert.equal(points.length,5);
  for(const dot of points)assert.ok(dot.attrs.cy>=22&&dot.attrs.cy<=302);
  const labels=plot.children.filter(n=>n.attrs.class==='historyTrophyLabel');
  assert.deepEqual(labels.map(n=>n.text),['P-IV','D-I','D-II','D-III','D-IV']);
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
    n.attrs.class==='historyTrophyBand').length,5);
});

test('all three graphs use abbreviated, non-overlapping dates on mobile',()=>{
  const scenarios=[
    ['war-trophies',[original,shifted(1),shifted(3)]],
    ['war-season-rank',[original,shifted(17),shifted(34)]],
    ['raid-season-rank',[original,shifted(17),shifted(34)]]
  ];
  for(const [id,snapshots] of scenarios){
    for(const width of [300,320,390,680]){
      const plot=drawRenderedChart(id,width,snapshots);
      const labels=plot.children.filter(n=>
        n.tag==='text'&&n.attrs.class?.includes('historyDateLabel'));
      assert.ok(labels.length>=2&&labels.length<=(width<500?3:5),
        id+' should show 2–3 dates on mobile and no more than 5 on desktop');
      assert.ok(labels.every(n=>!/20\\d{2}/.test(n.text)),
        'Same-year labels omit the redundant four-digit year');
      const extents=labels.map(n=>{
        const len=n.getComputedTextLength();
        const x=Number(n.attrs.x);
        const left=x-(n.attrs['text-anchor']==='end'?len:
          n.attrs['text-anchor']==='middle'?len/2:0);
        return {left,right:left+len};
      }).sort((a,b)=>a.left-b.left);
      for(let i=1;i<extents.length;i++)
        assert.ok(extents[i].left-extents[i-1].right>=9.9,
          id+' has overlapping dates at width '+width);
      assert.equal(plot.children.filter(n=>n.tag==='circle').length,
        5*snapshots.length,
        'All real data points remain unchanged');
    }
  }
});
test('date labels de-duplicate same-day captures and add short year across years',()=>{
  const sameDay=shifted(.01);
  const sameDayPlot=drawRenderedChart('war-trophies',390,[original,sameDay]);
  assert.equal(sameDayPlot.children.filter(n=>
    n.attrs.class?.includes('historyDateLabel')).length,1);
  const acrossYears=drawRenderedChart('war-trophies',390,
    [original,shifted(22),shifted(85)]);
  const labels=acrossYears.children.filter(n=>
    n.attrs.class?.includes('historyDateLabel'));
  assert.ok(labels.length>=2);
  assert.ok(labels.some(n=>/26$/.test(n.text)));
  assert.ok(labels.some(n=>/27$/.test(n.text)));
});

test('Hadès 🔥 is active and present on all three charts from the real 24 October reading',()=>{
  const hades=registry.find(a=>a.key==='hades');
  assert.equal(hades?.active,true);
  assert.equal(hades.emoji,'🔥');
  assert.equal(hades.color,'#1EA164');
  const history=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  const current=history.at(-1);
  assert.equal(current.capturedAt,'2026-10-24T21:31:12.523Z');
  assert.equal(current.coverage.completeSessionScan,true);
  assert.equal(current.coverage.validSessions,10);
  assert.equal(current.alliances.length,6);
  assert.doesNotMatch(JSON.stringify(current),/allianceFingerprint/);
  const expected={'war-trophies':1651,'war-season-rank':12228,'raid-season-rank':6998};
  for(const [id,value] of Object.entries(expected)){
    const model=prepare(history,registry,byId(id),config.rankingSeasons);
    assert.equal(model.series.length,6);
    const points=model.series.find(s=>s.key==='hades')?.points;
    assert.ok(points);
    assert.equal(points.at(-1).value,value);
    assert.equal(points.at(-1).capturedAt,current.capturedAt);
    assert.ok(points.slice(0,-1).every(p=>p.value===null),
      'No invented Hadès readings before his first capture');
    const standings=rankLatest(history,registry,byId(id),config.rankingSeasons);
    assert.equal(standings.find(s=>s.key==='hades').value,value);
  }
  for(const id of ['war-season-rank','raid-season-rank']){
    const model=prepare(history,registry,byId(id),config.rankingSeasons);
    assert.equal(model.rows.length,1,'Only one point for the completed season');
    assert.equal(model.rows[0].seasonVerified,true,
      'Preserve the original administrator-confirmed season reference');
    const hadesPoint=model.series.find(s=>s.key==='hades').points[0];
    assert.equal(hadesPoint.plotAt,'2026-10-11T20:00:00.000Z');
    assert.equal(hadesPoint.seasonVerified,false,
      'Do not present the newly observed Hadès value as independently verified');
    assert.equal(model.series.find(s=>s.key==='zeus').points[0].capturedAt,
      original.capturedAt,'Keep original confirmed alliance values');
  }
});
test('large Hadès ranks use a readable shared compressed axis without hundreds of ticks',()=>{
  const history=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  const labels=[];
  for(const id of ['war-season-rank','raid-season-rank']){
    const plot=drawRenderedChart(id,390,history);
    const ticks=plot.children.filter(n=>n.attrs.class==='historyGridLine');
    assert.ok(ticks.length>=6&&ticks.length<=12);
    assert.equal(plot.children.filter(n=>n.tag==='circle').length,6);
    const yValues=plot.children.filter(n=>n.tag==='circle').map(n=>Number(n.attrs.cy));
    assert.ok(yValues.every(y=>y>=14&&y<=302));
    assert.ok(Math.max(...yValues)-Math.min(...yValues)>150,
      'The huge rank gap must not collapse all alliance points');
    const values=plot.children.filter(n=>n.tag==='text'&&
      n.attrs['text-anchor']==='end').map(n=>n.text);
    assert.ok(values.includes('100')&&values.includes('200'));
    labels.push(values);
  }
  assert.deepEqual(labels[0],labels[1],'Rank charts retain a shared axis');
});
test('missing seasons and values never inherit a later observed new alliance',()=>{
  const history=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  const future={...history.at(-1),capturedAt:'2026-11-10T10:00:00.000Z',
    alliances:history.at(-1).alliances.filter(a=>a.key!=='hades'),
    seasonVerified:false,seasonId:null};
  const model=prepare([...history,future],registry,
    byId('raid-season-rank'),config.rankingSeasons);
  const points=model.series.find(s=>s.key==='hades').points;
  assert.equal(points.length,2);
  assert.equal(points[0].value,6998);
  assert.equal(points[1].value,null);
});

test('24 October counts as one trophy reading, and Hadès begins there',()=>{
  const captured=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  assert.equal(captured.length,3);
  const days=captured.map(row=>row.capturedAt.slice(0,10));
  assert.deepEqual(days,['2026-10-21','2026-10-22','2026-10-24']);
  const model=prepare(captured,registry,byId('war-trophies'),config.rankingSeasons);
  assert.equal(model.rows.length,3);
  assert.equal(model.series.length,6);
  const hades=model.series.find(s=>s.key==='hades');
  assert.deepEqual(Array.from(hades.points,p=>p.value),[null,null,1651]);
  assert.equal(model.series.find(s=>s.key==='zeus').points.length,3);
});

test('legend controls are accessible buttons with filled and hollow alliance markers',()=>{
  const source=read('docs/alliance-history.js');
  const css=read('docs/alliance-history.css');
  assert.match(source,/el\('button','historyLegendEntry'\)/);
  assert.match(source,/legend\.type='button'/);
  assert.match(source,/legend\.setAttribute\('aria-pressed',String\(shownNow\)\)/);
  assert.match(source,/state\.hiddenAlliances\.add\(s\.key\)/);
  assert.match(source,/state\.hiddenAlliances\.delete\(s\.key\)/);
  assert.match(source,/render\(\);[\s\S]*updated\.focus\(\{preventScroll:true\}\)/);
  assert.match(css,/\.historyLegendEntry\.is-hidden \.historyLegendDot \{ background: transparent; \}/);
  assert.match(css,/\.historyLegendEntry:focus-visible/);
});

test('hiding Hadès filters dots and restores the standard rank scale on mobile',()=>{
  const readings=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  for(const id of ['war-season-rank','raid-season-rank']){
    const full=drawRenderedChart(id,390,readings);
    const filtered=drawRenderedChart(id,390,readings,['hades']);
    assert.equal(full.children.filter(n=>n.tag==='circle').length,6);
    assert.equal(filtered.children.filter(n=>n.tag==='circle').length,5);
    const fullTicks=full.children.filter(n=>n.attrs.class==='historyGridLine');
    const filteredTicks=filtered.children.filter(n=>n.attrs.class==='historyGridLine');
    assert.ok(fullTicks.length<=12);
    assert.equal(filteredTicks.length,9,'Without Hadès return to 1–800 linear rank axis');
    const end=filtered.children.filter(n=>n.tag==='text'&&
      n.attrs['text-anchor']==='end').at(-1);
    assert.equal(end.text,'800');
    assert.equal(filtered.attributes.viewBox,full.attributes.viewBox);
  }
  for(const width of [320,390,680]){
    const full=drawRenderedChart('war-trophies',width,readings);
    const filtered=drawRenderedChart('war-trophies',width,readings,['hades']);
    assert.equal(full.children.filter(n=>n.tag==='circle').length,16);
    assert.equal(filtered.children.filter(n=>n.tag==='circle').length,15);
    assert.equal(full.attributes.viewBox,filtered.attributes.viewBox);
    const fullLabels=full.children.filter(n=>n.attrs.class==='historyTrophyLabel');
    const filteredLabels=filtered.children.filter(n=>n.attrs.class==='historyTrophyLabel');
    assert.ok(fullLabels.some(n=>n.text==='P-IV'));
    assert.ok(filteredLabels.some(n=>n.text==='D-I'));
  }
});
test('all hidden curves do not create a fake data series or break SVG rendering',()=>{
  const readings=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  for(const id of ['war-trophies','war-season-rank','raid-season-rank']){
    const plot=drawRenderedChart(id,320,readings,registry.map(a=>a.key));
    assert.equal(plot.children.filter(n=>n.tag==='circle').length,0);
    assert.equal(plot.children.filter(n=>n.tag==='polyline').length,0);
    assert.ok(plot.children.some(n=>n.tag==='text'&&
      n.text==='Toutes les alliances sont masquées'));
  }
});

test('new 25 October ranks create a second season point, not a fourth trophy reading',()=>{
  const readings=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  assert.equal(readings.length,4);
  const trophies=prepare(readings,registry,byId('war-trophies'),config.rankingSeasons);
  assert.equal(trophies.rows.length,3);
  assert.deepEqual(Array.from(trophies.series.find(s=>s.key==='hades').points,
    p=>p.value),[null,null,1651]);
  const expected={
    kronos:[195,159],poseidon:[1601,865],hades:[12228,6998],
    dionysos:[1006,231],athena:[383,162],zeus:[55,31]
  };
  for(const [id,indexOfMetric] of [['war-season-rank',0],['raid-season-rank',1]]){
    const rank=prepare(readings,registry,byId(id),config.rankingSeasons);
    assert.equal(rank.rows.length,2);
    assert.equal(rank.rows[1].seasonVerified,false);
    assert.equal(rank.rows[1].rankingSeason.endExclusiveAt,'2026-10-25T20:00:00.000Z');
    for(const series of rank.series){
      assert.equal(series.points[0].plotAt,'2026-10-11T20:00:00.000Z');
      assert.equal(series.points[1].plotAt,'2026-10-25T20:00:00.000Z');
      assert.equal(series.points[1].value,expected[series.key][indexOfMetric]);
    }
  }
});
