// Five LoSP alliance lines, driven by JSON under /docs/data.
// No chart framework, server, Scopely call, hardcoded names or colors.
(() => {
  'use strict';
  const BASE='./data/alliance-standings/';
  const refs={
    tabs:[...document.querySelectorAll('[data-mode]')],
    charts:[...document.querySelectorAll('[data-chart]')],
    warChoices:document.getElementById('history-war-choices'),
    raidChoices:document.getElementById('history-raid-choices'),
    panel:document.getElementById('history-panel'),
    title:document.getElementById('history-chart-title'),
    period:document.getElementById('history-chart-period'),
    count:document.getElementById('history-chart-count'),
    status:document.getElementById('history-status'),
    plotWrap:document.getElementById('history-plot-wrap'),
    plot:document.getElementById('history-plot'),
    legend:document.getElementById('history-legend'),
    latest:document.getElementById('history-latest'),
    latestTitle:document.getElementById('history-latest-title'),
    latestCaption:document.getElementById('history-latest-caption'),
    note:document.getElementById('history-note')
  };
  if(!refs.plot||!window.LoSPStandingsSeries)return;
  const NS='http://www.w3.org/2000/svg';
  const dates=new Intl.DateTimeFormat('fr-FR',{
    day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Paris'});
  const number=new Intl.NumberFormat('fr-FR');
  const state={mode:'war',warChart:'war-trophies',snapshots:[],
    registry:[],config:null,failures:0,prepared:null,chart:null};
  const byId=id=>state.config?.charts?.find(chart=>chart.id===id);
  const safeColor=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'#ffffff';
  const formatDate=iso=>dates.format(new Date(iso));
  const svg=(tag,attributes={},text)=>{
    const element=document.createElementNS(NS,tag);
    for(const [name,value] of Object.entries(attributes))
      element.setAttribute(name,String(value));
    if(text!==undefined)element.textContent=String(text);
    return element;
  };
  const el=(tag,className,text)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  async function json(url){
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    return response.json();
  }
  async function readSnapshots(index){
    const entries=Array.isArray(index?.snapshots)?index.snapshots:[];
    const valid=entries.filter(item=>typeof item?.capturedAt==='string'&&
      /^snapshots\/\d{4}-\d\d-\d\dT\d{9}Z\.json$/.test(item.file));
    const result=new Array(valid.length);
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,valid.length)},async()=>{
      while(cursor<valid.length){
        const i=cursor++;
        try{
          const row=await json(BASE+valid[i].file);
          if(row?.kind!=='losp-alliance-standings-snapshot'||
              row.capturedAt!==valid[i].capturedAt||
              !Array.isArray(row.alliances))throw Error('invalid-snapshot');
          result[i]=row;
        }catch{state.failures++;}
      }
    }));
    return result.filter(Boolean).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
  }
  function viewId(){
    return state.mode==='raid'?'raid-season-rank':state.warChart;
  }
  function syncChips(){
    for(const chip of refs.tabs){
      const active=chip.dataset.mode===state.mode;
      chip.classList.toggle('is-active',active);
      chip.setAttribute('aria-selected',String(active));
      chip.tabIndex=active?0:-1;
    }
    refs.warChoices.hidden=state.mode!=='war';
    refs.raidChoices.hidden=state.mode!=='raid';
    for(const chip of refs.charts){
      const active=chip.dataset.chart===viewId();
      chip.classList.toggle('is-active',active);
      chip.setAttribute('aria-pressed',String(active));
    }
    refs.panel.setAttribute('aria-labelledby',
      state.mode==='war'?'history-war':'history-raid');
  }
  function useMode(mode){
    if(!['war','raid'].includes(mode))return;
    state.mode=mode;syncChips();render();
  }
  function useChart(id){
    if(!byId(id))return;
    if(id==='raid-season-rank')state.mode='raid';
    else{state.mode='war';state.warChart=id;}
    syncChips();render();
  }
  for(const chip of refs.tabs){
    chip.addEventListener('click',()=>useMode(chip.dataset.mode));
    chip.addEventListener('keydown',event=>{
      if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;
      event.preventDefault();
      const next=chip.dataset.mode==='war'?'raid':'war';
      useMode(next);
      refs.tabs.find(t=>t.dataset.mode===next)?.focus();
    });
  }
  for(const chip of refs.charts)
    chip.addEventListener('click',()=>useChart(chip.dataset.chart));
  function niceStep(target){
    if(!(target>0))return 1;
    const power=Math.pow(10,Math.floor(Math.log10(target)));
    const scaled=target/power;
    return (scaled<=1?1:scaled<=2?2:scaled<=5?5:10)*power;
  }
  function scale(values,rank){
    const min=Math.min(...values),max=Math.max(...values);
    const pad=Math.max(1,(max-min)*.08,max===min?max*.06:0);
    const step=niceStep((max-min+2*pad)/4);
    let lo=Math.floor((min-pad)/step)*step;
    const hi=Math.max(lo+step,Math.ceil((max+pad)/step)*step);
    lo=Math.max(rank?1:0,lo);
    return {lo,hi};
  }
  function sharedRankCeiling(){
    // Both completed-season charts use the same maximum, based on the
    // least favorable rank visible in EITHER chart (all available seasons).
    let worst=1;
    for(const id of ['raid-season-rank','war-season-rank']){
      const chart=byId(id);
      if(!chart)continue;
      const prepared=window.LoSPStandingsSeries.prepare(
        state.snapshots,state.registry,chart,state.config.rankingSeasons);
      for(const series of prepared.series)
        for(const point of series.points)
          if(Number.isSafeInteger(point.value)&&point.value>worst)
            worst=point.value;
    }
    return Math.max(200,Math.ceil(worst/100)*100);
  }
  function drawPlot(model,chart){
    refs.plot.replaceChildren();
    if(!model.rows.length||!model.series.length)return;
    const width=Math.max(290,Math.round(refs.plotWrap.clientWidth-8));
    const rank=!chart.higherIsBetter;
    // Keep trophy, war-rank and raid-rank charts at the same height.
    const height=width<500?350:400;
    refs.plot.setAttribute('viewBox','0 0 '+width+' '+height);
    refs.plot.setAttribute('aria-label',chart.title+'. '+model.series.length+
      ' alliances et '+model.rows.length+' relevés.');
    const trophyDivisions=!rank&&chart.field==='warTrophies'&&
      Array.isArray(state.config?.trophyDivisions)?
      state.config.trophyDivisions.filter(b=>
        (b.min===undefined||Number.isSafeInteger(b.min))&&
        (b.max===undefined||Number.isSafeInteger(b.max))&&
        (b.min!==undefined||b.max!==undefined)&&
        (b.min===undefined||b.max===undefined||b.max>=b.min)&&
        typeof b.label==='string'&&/^#[0-9a-f]{6}$/i.test(b.fill||'')):[];
    const margin={left:53,right:rank?17:50,top:rank?14:22,bottom:48};
    const w=width-margin.left-margin.right;
    const h=height-margin.top-margin.bottom;
    const values=model.series.flatMap(s=>s.points.map(p=>p.value))
      .filter(v=>v!==null);
    if(!values.length)return;
    // Rank 1 belongs at the top; use exact hundred boundaries, not
    // interpolated labels such as 101, 251 or 501.
    // Make empty P-IV / D-IV areas smaller; expand only for real values.
    const firstDiamond=trophyDivisions.find(b=>Number.isSafeInteger(b.min)&&
      Number.isSafeInteger(b.max));
    const finalDivision=trophyDivisions.at(-1);
    const tierSize=firstDiamond?.max-firstDiamond?.min+1;
    const tickStep=tierSize/5;
    const trophyBounds=tierSize>0&&Number.isSafeInteger(finalDivision?.min)?
      {lo:Math.max(0,Math.floor(Math.min(
        firstDiamond.min-tierSize*.4,Math.min(...values)-tierSize*.12)/tickStep)*tickStep),
       hi:Math.ceil(Math.max(finalDivision.min+tierSize*.6,
         Math.max(...values)+tierSize*.12)/tickStep)*tickStep}:
      scale(values,false);
    const bounds=rank?{lo:1,hi:sharedRankCeiling()}:trophyBounds;
    const compressedRank=rank&&bounds.hi>2000;
    // Keep Top 100/200 readable even if a new alliance has a rank above
    // 10,000. Both ranking charts use this same labelled, piecewise axis.
    const linearY=v=>margin.top+
      (rank?(v-bounds.lo):(bounds.hi-v))/(bounds.hi-bounds.lo)*h;
    const rankRatio=v=>v<=1000?
      .7*(v-bounds.lo)/(1000-bounds.lo):
      .7+.3*Math.log(v/1000)/Math.log(bounds.hi/1000);
    const y=v=>compressedRank?margin.top+rankRatio(v)*h:linearY(v);
    const plotDates=model.series[0].points.map(p=>p.plotAt||p.capturedAt);
    const times=plotDates.map(iso=>Date.parse(iso));
    const first=times[0],last=times[times.length-1];
    const x=t=>first===last?margin.left+w/2:
      margin.left+(t-first)/(last-first)*w;
    if(rank){
      // The half-step boundaries separate whole-number ranks cleanly:
      // 1-100 = dark green; 101-200 = light green.
      for(const band of [
        {from:1,to:100.5,fill:'#147448',opacity:.30},
        {from:100.5,to:200,fill:'#9adc9c',opacity:.20}
      ]){
        const top=y(band.from),bottom=y(band.to);
        refs.plot.append(svg('rect',{x:margin.left,y:top,width:w,
          height:bottom-top,fill:band.fill,'fill-opacity':band.opacity,
          class:'historyRankBand','aria-hidden':'true'}));
      }
    }
    if(trophyDivisions.length){
      // Grey tiers and labels occupy the right-hand gutter.
      // Intervals use [min, max+1), including open-ended P-IV and D-IV.
      for(const band of trophyDivisions){
        const low=Math.max(bounds.lo,band.min??bounds.lo);
        const high=Math.min(bounds.hi,band.max===undefined?
          bounds.hi:band.max+1);
        if(high<=low)continue;
        const top=y(high),bottom=y(low);
        refs.plot.append(svg('rect',{x:margin.left,y:top,
          width:width-margin.left-4,height:bottom-top,
          fill:band.fill,class:'historyTrophyBand','aria-hidden':'true'}));
      }
      trophyDivisions.forEach((band,index)=>{
        if(index===0||band.min<=bounds.lo||band.min>=bounds.hi)return;
        const at=y(band.min);
        refs.plot.append(svg('line',{x1:margin.left,y1:at,
          x2:width-4,y2:at,class:'historyTrophyBoundary',
          'aria-hidden':'true'}));
      });
      for(const band of trophyDivisions){
        const low=Math.max(bounds.lo,band.min??bounds.lo);
        const high=Math.min(bounds.hi,band.max===undefined?
          bounds.hi:band.max+1);
        if(high<=low||y(low)-y(high)<16)continue;
        refs.plot.append(svg('text',{x:width-margin.right/2,
          y:(y(high)+y(low))/2+4,'text-anchor':'middle',
          class:'historyTrophyLabel','aria-hidden':'true'},band.label));
      }
    }
    const compressedTicks=[1,100,200,500,1000,2500,5000,10000]
      .filter(v=>v<bounds.hi);
    const spacedTicks=[];
    if(compressedRank){
      for(const value of compressedTicks){
        const pos=y(value);
        if((!spacedTicks.length||pos-y(spacedTicks.at(-1))>=16)&&
          y(bounds.hi)-pos>=16)spacedTicks.push(value);
      }
      spacedTicks.push(bounds.hi);
    }
    const ticks=rank?
      (compressedRank?spacedTicks:
        [1,...Array.from({length:bounds.hi/100},(_,i)=>(i+1)*100)]):
      Array.from({length:5},(_,i)=>bounds.lo+(bounds.hi-bounds.lo)*i/4);
    for(const value of ticks){
      const pos=y(value);
      // Trophy divisions already have separators; skip generic grid lines
      // to avoid dark strokes crossing their grey background.
      if(rank)refs.plot.append(svg('line',{x1:margin.left,y1:pos,
        x2:width-margin.right,y2:pos,class:'historyGridLine'}));
      refs.plot.append(svg('text',{x:margin.left-9,y:pos+4,
        'text-anchor':'end',class:'historyAxisText'},
        number.format(Math.round(value))));
    }
    // Keep dates readable as the number of snapshots grows. The date range
    // above the chart and each point tooltip still show the complete date.
    const axisYear=new Intl.DateTimeFormat('fr-FR',{
      year:'numeric',timeZone:'Europe/Paris'});
    const crossesYear=axisYear.format(new Date(first))!==
      axisYear.format(new Date(last));
    const axisDate=new Intl.DateTimeFormat('fr-FR',{
      day:'numeric',month:'short',timeZone:'Europe/Paris',
      ...(crossesYear?{year:'2-digit'}:{})});
    const dateEntries=[];
    const seenDates=new Set();
    for(let i=0;i<plotDates.length;i++){
      if(!Number.isFinite(times[i]))continue;
      const label=axisDate.format(new Date(times[i]));
      if(seenDates.has(label))continue;
      seenDates.add(label);
      dateEntries.push({i,label,position:x(times[i])});
    }
    const occupied=[];
    const addDateLabel=(entry,anchor)=>{
      const text=svg('text',{x:entry.position,y:height-17,
        'text-anchor':anchor,class:'historyAxisText historyDateLabel',
        'aria-label':formatDate(plotDates[entry.i])},entry.label);
      refs.plot.append(text);
      // SVG measures real glyph widths on Safari/Chrome; use a conservative
      // fallback only in environments without getComputedTextLength.
      const measured=typeof text.getComputedTextLength==='function'?
        text.getComputedTextLength():entry.label.length*7;
      const left=entry.position-(anchor==='end'?measured:
        anchor==='middle'?measured/2:0);
      const right=left+measured;
      if(occupied.some(space=>left<space.right+10&&right>space.left-10)){
        text.remove();
        return;
      }
      occupied.push({left,right});
      text.append(svg('title',{},formatDate(plotDates[entry.i])));
    };
    if(dateEntries.length){
      addDateLabel(dateEntries[0],dateEntries.length===1?'middle':'start');
      if(dateEntries.length>1)addDateLabel(dateEntries.at(-1),'end');
      const maxLabels=width<500?3:5;
      const center=margin.left+w/2;
      const interior=dateEntries.slice(1,-1).sort((a,b)=>
        Math.abs(a.position-center)-Math.abs(b.position-center));
      for(const entry of interior){
        if(occupied.length>=maxLabels)break;
        addDateLabel(entry,'middle');
      }
    }
    for(const s of model.series){
      const color=safeColor(s.color);
      let segment=[];
      const flush=()=>{
        if(segment.length>1)
          refs.plot.append(svg('polyline',{
            points:segment.map(p=>p.x+','+p.y).join(' '),
            stroke:color,class:'historyPlotLine'}));
        segment=[];
      };
      for(const p of s.points){
        if(p.value===null){flush();continue;}
        // Adjacent completed seasons must be connected to show
        // how each alliance's ranking evolves between seasons.
        segment.push({x:x(Date.parse(p.plotAt||p.capturedAt)),y:y(p.value)});
      }
      flush();
      for(const p of s.points){
        if(p.value===null)continue;
        const dot=svg('circle',{cx:x(Date.parse(p.plotAt||p.capturedAt)),
          cy:y(p.value),r:5.5,fill:color,
          class:'historyPlotDot',tabindex:0,role:'button',
          'aria-label':s.name+' : '+number.format(p.value)+
            (p.seasonStartAt?' pour la saison du '+formatDate(p.seasonStartAt)+
              ' au '+formatDate(p.plotAt):' le '+formatDate(p.capturedAt))});
        dot.append(svg('title',{},s.name+' — '+number.format(p.value)+
          ' — '+(p.seasonStartAt?'Saison du '+formatDate(p.seasonStartAt)+
          ' au '+formatDate(p.plotAt):formatDate(p.capturedAt))));
        const announce=()=>{refs.status.textContent=s.emoji+' '+s.name+
          ' : '+number.format(p.value)+(rank?' (rang)':' trophées')+
          (p.seasonStartAt?' pour la saison du '+formatDate(p.seasonStartAt)+
          ' au '+formatDate(p.plotAt):' le '+formatDate(p.capturedAt))+'.';};
        dot.addEventListener('click',announce);
        dot.addEventListener('keydown',event=>{
          if(event.key==='Enter'||event.key===' '){
            event.preventDefault();announce();
          }
        });
        refs.plot.append(dot);
      }
    }
  }
  function plotDatesForPeriod(model,index){
    return model.series[0]?.points[index]?.plotAt ||
      model.rows[index].capturedAt;
  }
  function render(){
    if(!state.config)return;
    const chart=byId(viewId());
    if(!chart)return;
    state.chart=chart;
    const model=window.LoSPStandingsSeries.prepare(
      state.snapshots,state.registry,chart,state.config.rankingSeasons);
    state.prepared=model;
    refs.title.textContent=chart.title;
    refs.count.textContent=model.rows.length+' relevé'+(model.rows.length>1?'s':'');
    refs.legend.replaceChildren();
    refs.latest.replaceChildren();
    refs.plotWrap.hidden=!model.rows.length||!model.series.length;
    refs.note.textContent=chart.requiresSeasonQualification?
      'Les rangs sont ceux des saisons terminées (pas de la saison en cours). Les périodes sont déduites du calendrier de 14 jours, sauf relevé confirmé ; l’API ne fournit pas de numéro de saison. Rang 1 = meilleur classement.':
      'Les trophées représentent le total détenu par chaque alliance à la date du relevé. Les courbes utilisent exclusivement les valeurs réellement capturées.';
    if(!chart.higherIsBetter&&sharedRankCeiling()>2000)
      refs.note.textContent+=' Échelle verticale compressée au-delà du rang 1 000 pour rendre toutes les alliances lisibles.';
    if(state.failures)refs.note.textContent+=' Attention : '+
      state.failures+' instantané(s) indisponible(s).';
    if(!model.rows.length){
      refs.period.textContent='Aucune date disponible';
      refs.status.textContent='Aucun instantané disponible pour ce graphique.';
      refs.plot.replaceChildren();
      return;
    }
    const knownSeason=chart.frequency==='per-season'&&
      model.rows.length===1&&
      (model.rows[0].seasonVerified===true||model.rows[0].seasonDerived===true)&&
      model.rows[0].rankingSeason;
    refs.period.textContent=knownSeason?
      'Saison du '+formatDate(knownSeason.startAt)+' au '+
        formatDate(knownSeason.endExclusiveAt):
      model.rows.length===1?'Capture du '+formatDate(model.rows[0].capturedAt):
      'Du '+formatDate(plotDatesForPeriod(model,0))+' au '+
        formatDate(plotDatesForPeriod(model,model.rows.length-1));
    refs.status.textContent=model.rows.length===1?
      'Un premier relevé : les cinq points sont visibles. Les courbes se traceront avec les prochaines captures.':
      model.rows.length+' relevés réels, sans valeurs inventées.';
    for(const s of model.series){
      const legend=el('div','historyLegendEntry');
      const dot=el('span','historyLegendDot');
      dot.style.backgroundColor=safeColor(s.color);
      legend.append(dot,el('span','',s.emoji+' '+s.name));
      refs.legend.append(legend);
    }
    // The summary uses the same snapshots selected for the chart:
    // one point per completed season, or every measured trophy reading.
    const standings=window.LoSPStandingsSeries.rankLatest(
      state.snapshots,state.registry,chart,state.config.rankingSeasons);
    refs.latestTitle.textContent=chart.field==='warTrophies'?
      'Derniers trophées de guerre':
      'Derniers classements de saison — '+(state.mode==='raid'?'Raid':'Guerre');
    refs.latestCaption.textContent=chart.higherIsBetter?
      'Alliances LoSP classées du plus grand au plus petit total.':
      'Alliances LoSP classées du meilleur au moins bon rang.';
    for(const [position,alliance] of standings.entries()){
      const item=el('div','historyLatestItem');
      item.setAttribute('role','listitem');
      item.style.setProperty('--alliance-color',safeColor(alliance.color));
      item.append(el('span','historyLatestPosition',String(position+1)+'.'));
      item.append(el('span','historyLatestName',alliance.emoji+' '+alliance.name));
      const result=el('div','historyLatestResult');
      result.append(el('div','historyLatestValue',
        alliance.value===null?'—':number.format(alliance.value)));
      result.append(el('div','historyLatestDate',
        alliance.seasonStartAt&&alliance.seasonEndAt?
          'Saison '+formatDate(alliance.seasonStartAt)+' – '+
          formatDate(alliance.seasonEndAt):
          alliance.capturedAt?formatDate(alliance.capturedAt):'Aucun relevé'));
      item.append(result);
      refs.latest.append(item);
    }
    drawPlot(model,chart);
  }
  if(typeof ResizeObserver==='function'){
    const ro=new ResizeObserver(()=>{
      if(state.prepared&&state.chart&&!refs.plotWrap.hidden)
        drawPlot(state.prepared,state.chart);
    });
    ro.observe(refs.plotWrap);
  }else window.addEventListener('resize',()=>{
    if(state.prepared&&state.chart&&!refs.plotWrap.hidden)
      drawPlot(state.prepared,state.chart);
  });
  async function boot(){
    try{
      const [index,config,registry]=await Promise.all([
        json(BASE+'index.json'),json(BASE+'config.json'),
        json('./data/alliances.json')]);
      if(!Array.isArray(registry)||!Array.isArray(config?.charts))
        throw Error('Structure des données invalide');
      state.config=config;
      state.registry=registry;
      state.snapshots=await readSnapshots(index);
      syncChips();render();
    }catch{
      refs.status.textContent=
        'Impossible de charger les relevés. Vérifie la connexion puis actualise la page.';
    }
  }
  void boot();
})();
