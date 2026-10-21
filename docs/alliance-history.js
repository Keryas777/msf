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
  function drawPlot(model,chart){
    refs.plot.replaceChildren();
    if(!model.rows.length||!model.series.length)return;
    const width=Math.max(290,Math.round(refs.plotWrap.clientWidth-8));
    const height=width<500?320:370;
    refs.plot.setAttribute('viewBox','0 0 '+width+' '+height);
    refs.plot.setAttribute('aria-label',chart.title+'. '+model.series.length+
      ' alliances et '+model.rows.length+' relevés.');
    const margin={left:53,right:17,top:22,bottom:48};
    const w=width-margin.left-margin.right;
    const h=height-margin.top-margin.bottom;
    const values=model.series.flatMap(s=>s.points.map(p=>p.value))
      .filter(v=>v!==null);
    if(!values.length)return;
    const rank=!chart.higherIsBetter;
    const bounds=scale(values,rank);
    const y=v=>margin.top+
      (rank?(v-bounds.lo):(bounds.hi-v))/(bounds.hi-bounds.lo)*h;
    const times=model.rows.map(r=>Date.parse(r.capturedAt));
    const first=times[0],last=times[times.length-1];
    const x=t=>first===last?margin.left+w/2:
      margin.left+(t-first)/(last-first)*w;
    for(let i=0;i<=4;i++){
      const value=bounds.lo+(bounds.hi-bounds.lo)*i/4;
      const pos=y(value);
      refs.plot.append(svg('line',{x1:margin.left,y1:pos,
        x2:width-margin.right,y2:pos,class:'historyGridLine'}));
      refs.plot.append(svg('text',{x:margin.left-9,y:pos+4,
        'text-anchor':'end',class:'historyAxisText'},
        number.format(Math.round(value))));
    }
    const labels=model.rows.length===1?[0]:
      [0,Math.floor((model.rows.length-1)/2),model.rows.length-1];
    for(const i of new Set(labels)){
      const date=model.rows[i].capturedAt;
      const position=x(Date.parse(date));
      const anchor=i===0&&model.rows.length>1?'start':
        i===model.rows.length-1&&model.rows.length>1?'end':'middle';
      refs.plot.append(svg('text',{x:position,y:height-17,
        'text-anchor':anchor,class:'historyAxisText'},formatDate(date)));
    }
    for(const s of model.series){
      const color=safeColor(s.color);
      let segment=[],previous=null;
      const flush=()=>{
        if(segment.length>1)
          refs.plot.append(svg('polyline',{
            points:segment.map(p=>p.x+','+p.y).join(' '),
            stroke:color,class:'historyPlotLine'}));
        segment=[];
      };
      for(const p of s.points){
        if(p.value===null){flush();previous=null;continue;}
        if(previous?.seasonId&&p.seasonId&&
            previous.seasonId!==p.seasonId)flush();
        segment.push({x:x(Date.parse(p.capturedAt)),y:y(p.value)});
        previous=p;
      }
      flush();
      for(const p of s.points){
        if(p.value===null)continue;
        const dot=svg('circle',{cx:x(Date.parse(p.capturedAt)),
          cy:y(p.value),r:5.5,fill:color,
          class:'historyPlotDot',tabindex:0,role:'button',
          'aria-label':s.name+' : '+number.format(p.value)+' le '+formatDate(p.capturedAt)});
        dot.append(svg('title',{},s.name+' — '+number.format(p.value)+
          ' — '+formatDate(p.capturedAt)));
        const announce=()=>{refs.status.textContent=s.emoji+' '+s.name+
          ' : '+number.format(p.value)+(rank?' (rang)':' trophées')+
          ' le '+formatDate(p.capturedAt)+'.';};
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
  function render(){
    if(!state.config)return;
    const chart=byId(viewId());
    if(!chart)return;
    state.chart=chart;
    const model=window.LoSPStandingsSeries.prepare(
      state.snapshots,state.registry,chart);
    state.prepared=model;
    refs.title.textContent=chart.title;
    refs.count.textContent=model.rows.length+' relevé'+(model.rows.length>1?'s':'');
    refs.legend.replaceChildren();
    refs.latest.replaceChildren();
    refs.plotWrap.hidden=!model.rows.length||!model.series.length;
    refs.note.textContent=chart.requiresSeasonQualification?
      'Ces rangs sont les dernières valeurs retournées par MSF. Sans identifiant de saison confirmé, ils ne garantissent pas une comparaison dans la même saison. Rang 1 = meilleur classement.':
      'Les trophées représentent le total détenu par chaque alliance à la date du relevé. Les courbes utilisent exclusivement les valeurs réellement capturées.';
    if(state.failures)refs.note.textContent+=' Attention : '+
      state.failures+' instantané(s) indisponible(s).';
    if(!model.rows.length){
      refs.period.textContent='Aucune date disponible';
      refs.status.textContent='Aucun instantané disponible pour ce graphique.';
      refs.plot.replaceChildren();
      return;
    }
    refs.period.textContent=model.rows.length===1?
      'Capture du '+formatDate(model.rows[0].capturedAt):
      'Du '+formatDate(model.rows[0].capturedAt)+' au '+
        formatDate(model.rows[model.rows.length-1].capturedAt);
    refs.status.textContent=model.rows.length===1?
      'Un premier relevé : les cinq points sont visibles. Les courbes se traceront avec les prochaines captures.':
      model.rows.length+' relevés réels, sans valeurs inventées.';
    for(const s of model.series){
      const legend=el('div','historyLegendEntry');
      const dot=el('span','historyLegendDot');
      dot.style.backgroundColor=safeColor(s.color);
      legend.append(dot,el('span','',s.emoji+' '+s.name));
      refs.legend.append(legend);
      const recent=[...s.points].reverse().find(p=>p.value!==null);
      const item=el('div','historyLatestItem');
      item.style.setProperty('--alliance-color',safeColor(s.color));
      item.append(el('div','historyLatestName',s.emoji+' '+s.name));
      item.append(el('div','historyLatestValue',
        recent?number.format(recent.value):'—'));
      item.append(el('div','historyLatestDate',
        recent?formatDate(recent.capturedAt):'Aucun relevé'));
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
