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
// Fixture for assertions specifically about the 21–25 October readings.
// Live index.json can grow with each authorized Thursday/Saturday R2 import.
const octoberBaseline=()=>index.snapshots
  .filter(s=>s.capturedAt<'2026-10-26T00:00:00.000Z')
  .map(s=>JSON.parse(read('docs/data/alliance-standings/'+s.file)));
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
test('history is linked from home and has exactly two levels of chips',()=>{
  const html=read('docs/alliance-history.html');
  assert.match(html,/id="history-war"[^>]*data-mode="war"/);
  assert.match(html,/id="history-raid"[^>]*data-mode="raid"/);
  assert.match(html,/id="history-war-choices"/);
  assert.match(html,/id="history-raid-choices" hidden/);
  assert.match(html,/data-chart="war-trophies"/);
  assert.match(html,/data-chart="war-season-rank"/);
  assert.match(html,/data-chart="raid-season-rank"/);
  assert.match(html,/id="history-plot"/);
  assert.match(read('docs/home.html'),/alliance-history\.html/);
  assert.doesNotMatch(read('docs/classements.html'),/alliance-history\.html/);
});
test('five original alliances render by dynamic registry with official colors and values',()=>{
  const model=prepare([original],registry,byId('war-trophies'));
  assert.equal(model.rows.length,1);
  assert.equal(model.series.length,5);
  assert.deepEqual(Array.from(model.series,s=>s.key),
    ['zeus','athena','kronos','dionysos','poseidon']);
  assert.deepEqual(Array.from(model.series,s=>s.color),[
    '#F8FF00','#F28C28','#E10D17','#93328E','#0073ff']);
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
  assert.match(html,/alliance-history-data\.js\?v=6/);
  assert.match(html,/alliance-trophy-live\.js\?v=5/);
  assert.match(html,/alliance-season-live\.js\?v=4/);
  assert.match(html,/alliance-history\.js\?v=19/);
  assert.match(html,/alliance-history\.css\?v=5/);
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
test('raid and war ranks fit their visible extrema with short Y axes',()=>{
  for(const id of ['raid-season-rank','war-season-rank']){
    const plot=drawRenderedChart(id);
    assert.equal(plot.attributes.viewBox,'0 0 382 350');
    const points=plot.children.filter(n=>n.tag==='circle');
    assert.equal(points.length,5);
    const y=points.map(p=>Number(p.attrs.cy));
    assert.ok(Math.min(...y)>24&&Math.max(...y)<292);
    const labels=plot.children.filter(n=>n.tag==='text'&&
      n.attrs['text-anchor']==='end').map(n=>n.text);
    assert.ok(labels.includes('100')&&labels.includes('200'));
    assert.ok(labels.length>=5&&labels.length<=12);
    assert.equal(plot.children.filter(n=>
      n.attrs.class==='historyGridLine').length,labels.length);
  }
});
test('rank bands stay behind data and clip to the visible viewport',()=>{
  for(const id of ['raid-season-rank','war-season-rank']){
    const plot=drawRenderedChart(id);
    const bands=plot.children.filter(n=>n.attrs.class==='historyRankBand');
    assert.equal(bands.length,2);
    assert.notEqual(bands[0].attrs.fill,bands[1].attrs.fill);
    assert.ok(bands.every(n=>n.attrs.y>=14&&n.attrs.y<=302));
    assert.ok(bands.every(n=>n.attrs.height>0));
    assert.ok(Math.abs(bands[0].attrs.y+bands[0].attrs.height-
      bands[1].attrs.y)<1e-7);
    assert.ok(plot.children.indexOf(bands[1])<
      plot.children.findIndex(n=>n.tag==='circle'));
    assert.ok(plot.children.indexOf(bands[1])<
      plot.children.findIndex(n=>n.tag==='line'));
  }
});
test('trophy Y domain hugs visible dots rather than including unused upper leagues',()=>{
  assert.equal(config.trophyDivisions.length,11);
  for(const width of [320,390,680]){
    const plot=drawRenderedChart('war-trophies',width);
    const axis=plot.children.filter(n=>n.tag==='text'&&
      n.attrs.class==='historyAxisText'&&
      n.attrs['text-anchor']==='end').map(n=>Number(
        String(n.text).replace(/[^\d]/g,'')));
    assert.ok(axis[0]<2189);
    assert.ok(axis.at(-1)>2875&&axis.at(-1)<3250);
    const bands=plot.children.filter(n=>n.attrs.class==='historyTrophyBand');
    const labels=plot.children.filter(n=>n.attrs.class==='historyTrophyLabel');
    assert.deepEqual(labels.map(n=>n.text),['P-IV','D-I','D-II','D-III']);
    assert.equal(bands.length,4);
    for(let i=1;i<bands.length;i++)assert.ok(
      Math.abs(bands[i].attrs.y+bands[i].attrs.height-
        bands[i-1].attrs.y)<1e-7);
    const points=plot.children.filter(n=>n.tag==='circle');
    assert.equal(points.length,5);
    const ys=points.map(n=>Number(n.attrs.cy));
    assert.ok(Math.min(...ys)>32);
    assert.ok(Math.max(...ys)<(width<500?350:400)-58);
    assert.equal(plot.attributes.viewBox,
      drawRenderedChart('war-season-rank',width).attributes.viewBox);
    assert.equal(plot.attributes.viewBox,
      drawRenderedChart('raid-season-rank',width).attributes.viewBox);
    assert.equal(plot.children.filter(n=>
      n.attrs.class==='historyGridLine').length,0);
  }
});
test('outlying trophies reveal all visible league bands',()=>{
  const changed={...original,alliances:original.alliances.map((a,i)=>
    i===0?{...a,warTrophies:1375}:
    i===1?{...a,warTrophies:3450}:a)};
  for(const width of [320,390,680]){
    const plot=drawRenderedChart('war-trophies',width,[changed]);
    const bands=plot.children.filter(n=>n.attrs.class==='historyTrophyBand');
    const lines=plot.children.filter(n=>n.attrs.class==='historyTrophyBoundary');
    const labels=plot.children.filter(n=>n.attrs.class==='historyTrophyLabel');
    assert.equal(bands.length,9);
    assert.equal(lines.length,8);
    assert.deepEqual(labels.map(n=>n.text),
      ['P-I','P-II','P-III','P-IV','D-I','D-II','D-III','D-IV','U-I']);
    // Dynamic bounds 1000..3800; league thresholds must remain exact.
    const y=v=>22+(3800-v)/(3800-1000)*
      ((width<500?350:400)-22-48);
    for(const [i,b] of [1500,1750,2000,2250,2500,2750,3000,3250].entries())
      assert.ok(Math.abs(lines[i].attrs.y1-y(b))<1e-7);
    assert.ok(bands.every(b=>b.attrs.height>0));
  }
});
test('Ultimate I, II and III boundaries remain exact for high-trophy alliances',()=>{
  const divisions=config.trophyDivisions.slice(-3);
  assert.deepEqual(divisions.map(({label,min,max})=>({label,min,max})),[
    {label:'U-I',min:3250,max:3499},
    {label:'U-II',min:3500,max:3749},
    {label:'U-III',min:3750,max:3999}
  ]);
  const changed={...original,alliances:original.alliances.map((a,i)=>
    i===0?{...a,warTrophies:3900}:
    i===1?{...a,warTrophies:3450}:a)};
  for(const width of [320,390,680]){
    const plot=drawRenderedChart('war-trophies',width,[changed]);
    const labels=plot.children.filter(n=>n.attrs.class==='historyTrophyLabel')
      .map(n=>n.text);
    assert.ok(labels.includes('U-I'));
    assert.ok(labels.includes('U-II'));
    assert.ok(labels.includes('U-III'));
    const bands=plot.children.filter(n=>n.attrs.class==='historyTrophyBand');
    assert.ok(bands.every(b=>b.attrs.height>0));
  }
});
test('intermediate Platinum and Uru outliers also fit the dynamic bounds',()=>{
  const changed={...original,alliances:original.alliances.map((a,i)=>
    i===0?{...a,warTrophies:2040}:
    i===1?{...a,warTrophies:3450}:a)};
  const plot=drawRenderedChart('war-trophies',390,[changed]);
  const points=plot.children.filter(n=>n.tag==='circle');
  assert.equal(points.length,5);
  assert.ok(points.every(n=>n.attrs.cy>22&&n.attrs.cy<302));
  assert.deepEqual(plot.children.filter(n=>
    n.attrs.class==='historyTrophyLabel').map(n=>n.text),
    ['P-III','P-IV','D-I','D-II','D-III','D-IV','U-I']);
});
test('raid and war seasons have independent bounds based on visible dots',()=>{
  const changed={...original,alliances:original.alliances.map(a=>
    a.key==='zeus'?{...a,raidRank:930,warRank:722}:a)};
  const labels=id=>drawRenderedChart(id,390,[changed]).children.filter(n=>
    n.tag==='text'&&n.attrs['text-anchor']==='end').map(n=>
      Number(String(n.text).replace(/[^\d]/g,'')));
  const raid=labels('raid-season-rank'),war=labels('war-season-rank');
  assert.notDeepEqual(raid,war);
  assert.equal(raid[0],50);
  assert.equal(raid.at(-1),1050);
  assert.equal(war[0],1);
  assert.equal(war.at(-1),800);
});
test('trophy scale remains independent of all season ranking values',()=>{
  const changed={...original,alliances:original.alliances.map(a=>
    ({...a,raidRank:2750,warRank:3400}))};
  const baseline=drawRenderedChart('war-trophies',390);
  const updated=drawRenderedChart('war-trophies',390,[changed]);
  const axis=plot=>plot.children.filter(n=>n.tag==='text'&&
    n.attrs['text-anchor']==='end').map(n=>n.text);
  assert.deepEqual(axis(updated),axis(baseline));
  assert.equal(updated.children.filter(n=>
    n.attrs.class==='historyTrophyBand').length,
    baseline.children.filter(n=>n.attrs.class==='historyTrophyBand').length);
});

test('single-point series keep vertical space even at rank one',()=>{
  const zeus=original.alliances.find(a=>a.key==='zeus');
  const snapshot={...original,alliances:[{...zeus,
    warTrophies:2875,raidRank:1,warRank:1}]};
  for(const id of ['war-trophies','war-season-rank','raid-season-rank']){
    const plot=drawRenderedChart(id,390,[snapshot]);
    const dots=plot.children.filter(n=>n.tag==='circle');
    assert.equal(dots.length,1);
    assert.ok(dots[0].attrs.cy>(id==='war-trophies'?22:14)+10);
    assert.ok(dots[0].attrs.cy<292);
  }
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

test('Hadès 🔥 first appears in the true 24 October snapshot, not the earlier season',()=>{
  const hades=registry.find(a=>a.key==='hades');
  assert.equal(hades?.active,true);
  assert.equal(hades.emoji,'🔥');
  assert.equal(hades.color,'#1EA164');
  const history=index.snapshots.map(s=>
    JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  // Keep this historical regression scoped to the snapshots that existed
  // before the separate seasonal rank-only import was added.
  history.splice(3);
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
test('Hadès rank outliers retain readable compression on independent Y axes',()=>{
  // This chart fixture is intentionally frozen before the 9 November import.
  // The import workflow writes its fresh real snapshot before running tests;
  // that new season must not change this test's historical 12-point baseline.
  const history=index.snapshots.filter(s=>
    s.capturedAt<'2026-11-09T00:00:00.000Z').map(s=>
      JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  const labels=[];
  for(const id of ['war-season-rank','raid-season-rank']){
    const plot=drawRenderedChart(id,390,history);
    const lines=plot.children.filter(n=>n.attrs.class==='historyGridLine');
    assert.ok(lines.length>=6&&lines.length<=12);
    assert.equal(plot.children.filter(n=>n.tag==='circle').length,12);
    const ys=plot.children.filter(n=>n.tag==='circle').map(n=>Number(n.attrs.cy));
    assert.ok(ys.every(y=>y>=14&&y<=302));
    assert.ok(Math.max(...ys)-Math.min(...ys)>150);
    const ticks=plot.children.filter(n=>n.tag==='text'&&
      n.attrs['text-anchor']==='end').map(n=>n.text);
    assert.ok(ticks.includes('100')&&ticks.includes('200'));
    labels.push(ticks);
  }
  assert.notDeepEqual(labels[0],labels[1]);
});
test('missing seasons and values never inherit a later observed new alliance',()=>{
  // Use only observations published before the targeted 9 November import.
  // Its new rank snapshot is genuine, but it must not turn this absent-value
  // fixture into a test of a season where Hadès has since been observed.
  const history=index.snapshots.filter(s=>
    s.capturedAt<'2026-11-09T00:00:00.000Z').map(s=>
      JSON.parse(read('docs/data/alliance-standings/'+s.file)));
  const future={...history.at(-1),capturedAt:'2026-11-10T10:00:00.000Z',
    alliances:history.at(-1).alliances.filter(a=>a.key!=='hades'),
    seasonVerified:false,seasonId:null};
  const model=prepare([...history,future],registry,
    byId('raid-season-rank'),config.rankingSeasons);
  const points=model.series.find(s=>s.key==='hades').points;
  assert.equal(points.length,3);
  assert.equal(points[0].value,6998);
  assert.equal(points[1].value,6998);
  assert.equal(points[2].value,null);
});

test('24 October counts as one trophy reading, and Hadès begins there',()=>{
  const captured=octoberBaseline();
  assert.equal(captured.length,4);
  const days=captured.filter(row=>row.captureType!=='season-ranks')
    .map(row=>row.capturedAt.slice(0,10));
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

test('hiding Hadès recalculates every Y axis from visible alliances only',()=>{
  const readings=octoberBaseline();
  for(const id of ['war-season-rank','raid-season-rank']){
    const full=drawRenderedChart(id,390,readings);
    const filtered=drawRenderedChart(id,390,readings,['hades']);
    assert.equal(full.children.filter(n=>n.tag==='circle').length,12);
    assert.equal(filtered.children.filter(n=>n.tag==='circle').length,10);
    const axis=plot=>plot.children.filter(n=>n.tag==='text'&&
      n.attrs['text-anchor']==='end'&&
      n.attrs.class==='historyAxisText').map(n=>
        Number(String(n.text).replace(/[^\d]/g,'')));
    assert.ok(axis(filtered).at(-1)<axis(full).at(-1));
    assert.ok(filtered.children.filter(n=>
      n.attrs.class==='historyGridLine').length<=12);
    assert.equal(filtered.attributes.viewBox,full.attributes.viewBox);
  }
  for(const width of [320,390,680]){
    const full=drawRenderedChart('war-trophies',width,readings);
    const filtered=drawRenderedChart('war-trophies',width,readings,['hades']);
    assert.equal(full.children.filter(n=>n.tag==='circle').length,16);
    assert.equal(filtered.children.filter(n=>n.tag==='circle').length,15);
    assert.equal(full.attributes.viewBox,filtered.attributes.viewBox);
    const labels=plot=>plot.children.filter(n=>
      n.attrs.class==='historyTrophyLabel').map(n=>n.text);
    assert.ok(labels(full).includes('P-IV'));
    assert.ok(labels(filtered).includes('D-I'));
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
  const readings=octoberBaseline();
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

test('trophy observations have equal horizontal spacing despite irregular capture dates',()=>{
  const captures=octoberBaseline();
  const model=prepare(captures,registry,byId('war-trophies'),config.rankingSeasons);
  assert.equal(model.rows.length,3);
  const times=model.rows.map(row=>Date.parse(row.capturedAt));
  assert.ok(times[2]-times[1]>2*(times[1]-times[0]),
    'The actual source dates remain irregular in time');
  for(const width of [320,390,680]){
    const plot=drawRenderedChart('war-trophies',width,captures);
    const zeusDots=plot.children.filter(node=>node.tag==='circle'&&
      node.attrs.fill==='#F8FF00');
    assert.equal(zeusDots.length,3);
    const positions=zeusDots.map(node=>Number(node.attrs.cx));
    const expectedLeft=53, expectedRight=width-8-50;
    assert.ok(Math.abs(positions[0]-expectedLeft)<1e-7);
    assert.ok(Math.abs(positions[2]-expectedRight)<1e-7);
    assert.ok(Math.abs(positions[1]-(expectedLeft+expectedRight)/2)<1e-7);
    const hadesDots=plot.children.filter(node=>node.tag==='circle'&&
      node.attrs.fill==='#1EA164');
    assert.equal(hadesDots.length,1,'Hadès is not backfilled before 24 October');
    assert.equal(hadesDots[0].attrs.cx,zeusDots[2].attrs.cx);
    const dates=plot.children.filter(node=>node.attrs.class?.includes('historyDateLabel'));
    assert.deepEqual(dates.map(node=>node.attrs['aria-label']),
      ['2026-10-21','2026-10-24','2026-10-22'],
      'The date labels still represent the real, selected capture dates');
  }
});

test('a subsequent verified R2 trophy reading adds one graph point, not a new rank season',()=>{
  const baseline=octoberBaseline();
  const previous=baseline.find(s=>s.capturedAt==='2026-10-24T21:31:12.523Z');
  const added={...previous,capturedAt:'2026-10-29T02:02:50.024Z',
    seasonId:null,seasonVerified:false,
    coverage:{...previous.coverage,completeSessionScan:false,
      scannedSessions:null,validSessions:null},
    collection:{method:'r2-pull',sourceDayUtc:'2026-10-29'}};
  const after=[...baseline,added];
  const trophyBefore=prepare(baseline,registry,byId('war-trophies'),config.rankingSeasons);
  const trophyAfter=prepare(after,registry,byId('war-trophies'),config.rankingSeasons);
  assert.equal(trophyAfter.rows.length,trophyBefore.rows.length+1);
  assert.equal(trophyAfter.series.find(s=>s.key==='zeus').points.length,4);
  for(const id of ['war-season-rank','raid-season-rank']){
    const before=prepare(baseline,registry,byId(id),config.rankingSeasons);
    const afterRank=prepare(after,registry,byId(id),config.rankingSeasons);
    assert.deepEqual(Array.from(afterRank.rows,r=>r.capturedAt),
      Array.from(before.rows,r=>r.capturedAt));
  }
});

test('both seasonal ranking charts use equal step spacing for uneven season gaps',()=>{
  const captures=[original,shifted(15),shifted(45)];
  for(const id of ['war-season-rank','raid-season-rank']){
    const model=prepare(captures,registry,byId(id),config.rankingSeasons);
    assert.equal(model.rows.length,3);
    assert.equal(model.series[0].points.length,3);
    const seasonEnds=model.series[0].points.map(p=>Date.parse(p.plotAt));
    assert.notEqual(seasonEnds[1]-seasonEnds[0],seasonEnds[2]-seasonEnds[1]);
    for(const width of [320,390,680]){
      const plot=drawRenderedChart(id,width,captures);
      const dots=plot.children.filter(node=>node.tag==='circle'&&
        node.attrs.fill==='#F8FF00');
      assert.equal(dots.length,3);
      const xs=dots.map(node=>Number(node.attrs.cx));
      assert.ok(Math.abs((xs[1]-xs[0])-(xs[2]-xs[1]))<1e-7);
      assert.equal(xs[0],53);
      assert.equal(xs[2],width-8-17);
      assert.ok(dots.every(dot=>Number(dot.attrs.cy)>=14));
    }
  }
});

test('a single plotted season or capture remains horizontally centered',()=>{
  for(const id of ['war-trophies','war-season-rank','raid-season-rank']){
    const plot=drawRenderedChart(id,390,[original]);
    const dots=plot.children.filter(node=>node.tag==='circle');
    assert.equal(dots.length,5);
    const middle=(53+(390-8-(id==='war-trophies'?50:17)))/2;
    assert.ok(dots.every(dot=>Math.abs(Number(dot.attrs.cx)-middle)<1e-7));
  }
});

test('switching from trophies to war and raid season ranks redraws real rank values',()=>{
  // Execute the actual page render() path: static drawPlot tests alone cannot
  // catch a ReferenceError before drawPlot() that leaves the old SVG visible.
  const source=read('docs/alliance-history.js');
  const begin=source.indexOf('  function render(){');
  const end=source.indexOf('  if(typeof ResizeObserver',begin);
  assert.ok(begin>=0&&end>begin,'render() must be present');
  const stub=()=>({
    textContent:'',hidden:false,dataset:{},classList:{toggle(){}},
    style:{setProperty(){}},
    append(){},replaceChildren(){},setAttribute(){},addEventListener(){}
  });
  const refs=Object.fromEntries([
    'title','count','legend','latest','plotWrap','note','period','status',
    'latestTitle','latestCaption','plot'].map(key=>[key,stub()]));
  const state={mode:'war',warChart:'war-trophies',snapshots:[original],
    registry,config,failures:0,sourceWarnings:[],liveCoverage:null,
    liveAvailable:true,guestRanksAvailable:true,
    hiddenAlliances:new Set(),chart:null,prepared:null};
  const drawn=[];
  const viewId=()=>state.mode==='raid'?'raid-season-rank':state.warChart;
  const scope=vm.createContext({
    refs,state,byId,viewId,number:new Intl.NumberFormat('fr-FR'),
    formatDate:iso=>iso.slice(0,10),safeColor:value=>value,
    el:(tag,className,value)=>Object.assign(stub(),{
      tag,className,textContent:value||''
    }),
    window:{LoSPStandingsSeries:context.window.LoSPStandingsSeries},
    drawPlot:(model,chart)=>drawn.push({
      id:chart.id,
      zeus:model.series.find(x=>x.key==='zeus')?.points[0]?.value
    })
  });
  vm.runInContext(source.slice(begin,end)+'\nthis.runRender=render;',scope);
  scope.runRender();
  state.warChart='war-season-rank';
  assert.doesNotThrow(()=>scope.runRender(),
    'a stale rendering helper must not leave the trophy SVG in a rank view');
  assert.equal(refs.title.textContent,'Classement guerre');
  state.mode='raid';
  assert.doesNotThrow(()=>scope.runRender());
  assert.equal(refs.title.textContent,'Classement raid');
  assert.deepEqual(drawn,[
    {id:'war-trophies',zeus:2875},
    {id:'war-season-rank',zeus:322},
    {id:'raid-season-rank',zeus:77}
  ]);
});


test('partial season captures retain independent LoSP and guest rankings',()=>{
  const season={startAt:'2026-10-25T20:00:00.000Z',
    endExclusiveAt:'2026-11-08T20:00:00.000Z'};
  const make=(time,alliances)=>({
    capturedAt:time,captureType:'season-ranks',
    seasonId:'2026-10-25/2026-11-08',
    seasonDerived:true,rankingSeason:season,alliances
  });
  const rows=[
    make('2026-11-09T03:15:00.000Z',[
      {key:'zeus',warRank:125,raidRank:70}]),
    make('2026-11-09T15:15:00.000Z',[
      {key:'marines',warRank:88,raidRank:42},
      {key:'zeus',warRank:null,raidRank:null}])
  ];
  for(const field of ['war-season-rank','raid-season-rank']){
    const model=prepare(rows,registry,byId(field),config.rankingSeasons);
    assert.equal(model.rows.length,1);
    assert.equal(model.series.find(s=>s.key==='zeus').points[0].value,
      field==='war-season-rank'?125:70);
    assert.equal(model.series.find(s=>s.key==='marines').points[0].value,
      field==='war-season-rank'?88:42);
  }
});

test('alliance history loads authorized live trophy and guest season projections',()=>{
  const browser=read('docs/alliance-history.js');
  const html=read('docs/alliance-history.html');
  assert.ok(browser.includes('/api/public/trophy-history'));
  assert.ok(browser.includes('/api/public/guest-season-ranks'));
  assert.ok(browser.includes('LoSPTrophyLive.merge'));
  assert.ok(browser.includes('LoSPGuestSeasonLive.fromCloudflare'));
  assert.ok(browser.includes('LoSPGuestSeasonLive.fromArchive'));
  assert.ok(browser.includes('window.LoSPAccess?.isAllianceAllowed'));
  assert.ok(browser.includes('readSnapshots(index)'));
  assert.ok(html.includes('alliance-trophy-live.js'));
  assert.ok(html.includes('alliance-season-live.js'));
});
