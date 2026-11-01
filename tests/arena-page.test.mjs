// Regression tests for the vanilla-JS Arena page, using a minimal DOM shim.
// No browser, framework, network call or player information is required.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../docs/arena.js",import.meta.url),"utf8");
const cut=source.indexOf('$("tabRanking").addEventListener(');
if(cut<0)throw Error("Arena event attachment marker missing");
const isolated=source.slice(source.indexOf("(()=>{"),cut)+
  "return {S,canonical,mapSourceAlliances,readSnapshots,label,fillRanking,setupPeople,fillChart,fillSummary};\n})();";
const metadata=[
  {key:"zeus",name:"Zeus",emoji:"⚡️",color:"#ffff00"},
  {key:"athena",name:"Athéna",emoji:"🦉",color:"#ff9900"},
  {key:"hades",name:"Hadès",emoji:"🔥",color:"#21bb77"}
];
const allianceApi={
  getAllianceMeta:value=>metadata.find(a=>value===a.key||value===a.name)||null
};
function element(tag){
  return {
    tag,children:[],value:"",textContent:"",className:"",attrs:{},
    style:{setProperty(){}},classList:{add(){},toggle(){}},
    setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;}
  };
}
function setup(){
  const nodes={rankingAlliance:element("select"),rankingList:element("div")};
  nodes.rankingAlliance.value="all";
  nodes.historyAlliance=element("select");nodes.historyAlliance.value="all";
  nodes.arenaChart=element("svg");nodes.arenaChart.parentElement={clientWidth:320};
  const document={
    createElement:element,
    createElementNS:(_ns,tag)=>element(tag),
    getElementById:id=>nodes[id]??(nodes[id]=element("div"))
  };
  const fn=new Function("window","document","fetch","return "+isolated);
  const page=fn({LoSPAlliances:allianceApi},document,()=>{
    throw Error("Tests must never fetch or perform an API request");
  });
  return {page,nodes};
}
function records(page){
  const encode={Zeus:"ffffflospe10d17roos",
    "Athéna":"losp8ff00zs","Hadès":"losp93328edss"};
  const names=[
    ["A","Zeus"],["B","Zeus"],
    ["C","Athéna"],["D","Athéna"],
    ["E","Hadès"],["F","Hadès"]
  ];
  for(const [name,alliance] of names)page.S.infos.set(name.toLowerCase(),{
    name,alliance,
    icon:"https://assets.marvelstrikeforce.com/imgs/Portrait_X.png",
    frame:"https://assets.marvelstrikeforce.com/imgs/ICON_FRAME_X.png"
  });
  const players=names.map(([name,alliance],i)=>({
    name,alliance:encode[alliance],arenaRank:[1,1,3,3,5,6][i]
  }));
  return {snapshots:[
    {date:"2026-10-31",sourceDay:"2026-11-01",
      attribution:"backdated-from-first-next-day-collection",
      players:players.map(p=>({...p,arenaRank:p.arenaRank+1}))},
    {date:"2026-11-01",attribution:"after-daily-arena-rewards",players}
  ]};
}
test("encoded alliance names are resolved by existing Infos, with emojis",()=>{
  const {page}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  const points=page.readSnapshots(history);
  assert.deepEqual(points[1].players.map(p=>p.alliance),
    ["zeus","zeus","athena","athena","hades","hades"]);
  assert.equal(page.label("zeus"),"⚡️ Zeus");
  assert.equal(page.label("athena"),"🦉 Athéna");
  assert.equal(page.label("hades"),"🔥 Hadès");
  assert.equal(page.canonical("<color=red>JAXX"),"JAXX");
});
test("tied Arena ranks show only first number and keep framed portraits",()=>{
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  page.S.snapshots=page.readSnapshots(history);
  page.fillRanking();
  const rows=nodes.rankingList.children;
  assert.deepEqual(rows.map(row=>row.children[0].textContent),
    ["#1","—","#3","—","#5","#6"]);
  for(const row of rows){
    assert.deepEqual(row.children[1].children.map(img=>img.className),
      ["arenaAvatarFrame","arenaAvatarIcon"]);
    assert.match(row.children[2].children[1].textContent,/Zeus|Athéna|Hadès/);
    assert.equal(row.children[3].textContent,"▲ 1");
  }
});
test("foreign asset URLs and unrecognized alliance codes are not displayed",()=>{
  const {page}=setup(),history=records(page);
  history.snapshots[0].players.push({
    name:"Ghost",alliance:"mystery-private-id",arenaRank:9
  });
  page.mapSourceAlliances(history);
  const snap=page.readSnapshots(history)[0];
  assert.equal(snap.players.find(p=>p.name==="Ghost")?.alliance,"unknown");
  assert.equal(page.label("unknown"),"Alliance non identifiée");
});


test("player options show only names, because alliance is already a filter",()=>{
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  page.S.snapshots=page.readSnapshots(history);
  for(const person of page.S.snapshots[1].players)page.S.people.set(person.id,person);
  nodes.historyAlliance.value="zeus";
  page.setupPeople();
  assert.deepEqual(nodes.historyPlayer.children.map(x=>x.textContent),
    ["Choisir un joueur","A","B"]);
  assert.ok(nodes.historyPlayer.children.every(x=>!x.textContent.includes(" — ")));
});

test("two Arena dates fit a 320px viewport without horizontal scroll",()=>{
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  page.S.snapshots=page.readSnapshots(history);
  for(const person of page.S.snapshots[1].players)page.S.people.set(person.id,person);
  page.S.selected=["a","b"];
  page.fillChart();
  assert.equal(nodes.arenaChart.style.width,"320px");
  assert.equal(nodes.arenaChart.attrs.viewBox,"0 0 320 320");
  const circles=nodes.arenaChart.children.filter(x=>x.tag==="circle");
  assert.equal(circles.length,4);
  assert.ok(circles.every(x=>Number(x.attrs.cx)>=0&&Number(x.attrs.cx)<=320));
  // The rendering also adapts when the available width changes.
  nodes.arenaChart.parentElement.clientWidth=420;
  page.fillChart();
  assert.equal(nodes.arenaChart.style.width,"420px");
});

test("long histories retain horizontal scroll without hiding graph points",()=>{
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  const example=page.readSnapshots(history).at(-1);
  page.S.snapshots=Array.from({length:12},(_,i)=>({
    ...example,date:"2026-11-"+String(i+1).padStart(2,"0")
  }));
  for(const person of example.players)page.S.people.set(person.id,person);
  page.S.selected=["a"];
  page.fillChart();
  const width=Number.parseInt(nodes.arenaChart.style.width,10);
  assert.ok(width>320,"long history must scroll rather than crush daily points");
  assert.equal(Number(nodes.arenaChart.attrs.viewBox.split(" ")[2]),width);
  assert.equal(nodes.arenaChart.children.filter(x=>x.tag==="circle").length,12);
});


test("ranking caption stays concise and uses the real latest date",()=>{
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  page.S.snapshots=page.readSnapshots(history);
  page.fillSummary();
  assert.equal(nodes.rankingSource.textContent,
    "Classement du 01/11/2026 à 17h et comparatif avec la veille");
  assert.equal(nodes.arenaLatestDate.textContent,"01/11/2026");
  page.S.snapshots=page.S.snapshots.slice(0,1);
  page.fillSummary();
  assert.equal(nodes.rankingSource.textContent,
    "Classement initial du 31/10/2026");
  page.S.fallback=true;
  page.fillSummary();
  assert.equal(nodes.rankingSource.textContent,
    "Classement actuel — date non vérifiée");
});

test("Arena HTML no longer displays the provenance disclaimer",()=>{
  const html=fs.readFileSync(new URL("../docs/arena.html",import.meta.url),"utf8");
  assert.doesNotMatch(html,/class="arenaDisclaimer"/);
  assert.doesNotMatch(html,/attribution rétrospective/);
  assert.match(html,/id="rankingSource"/);
});


test("successful Arena loading hides the redundant banner but keeps error feedback",()=>{
  const html=fs.readFileSync(new URL("../docs/arena.html",import.meta.url),"utf8");
  const css=fs.readFileSync(new URL("../docs/arena.css",import.meta.url),"utf8");
  assert.match(source,/arenaStatus"\)\.hidden=true/);
  assert.doesNotMatch(source,/Relevés Arène vérifiés — historique disponible/);
  assert.match(source,/Historique R2 inaccessible/);
  assert.match(source,/Données Arène indisponibles/);
  assert.match(css,/\.arenaState\[hidden\]\{display:none!important\}/);
  assert.match(html,/id="arenaStatus"/);
  assert.match(html,/arena\.js\?v=6/);
});


test("Arena chart omits explanatory text but preserves point dates and ranks",()=>{
  const html=fs.readFileSync(new URL("../docs/arena.html",import.meta.url),"utf8");
  assert.doesNotMatch(html,/Plus le rang est petit, meilleur est le classement/);
  assert.doesNotMatch(source,/Mesuré le /);
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  page.S.snapshots=page.readSnapshots(history);
  for(const person of page.S.snapshots[1].players)page.S.people.set(person.id,person);
  page.S.selected=["a","b"];
  page.fillChart();
  assert.ok(nodes.historyDetails.children.length>1,"date/rank table remains present");
  assert.ok(nodes.historyDetails.children.some(entry=>
    entry.children.some(child=>child.textContent.includes("31/10/2026"))));
  assert.ok(nodes.historyDetails.children.every(entry=>
    !entry.children.some(child=>String(child.textContent).includes("Mesuré le"))));
  assert.equal(page.S.snapshots[0].sourceDay,"2026-11-01",
    "historic provenance stays in the data");
});


test("Arena portrait/frame use 1:1 scale without changing tile or row dimensions",()=>{
  const css=fs.readFileSync(new URL("../docs/arena.css",import.meta.url),"utf8");
  const html=fs.readFileSync(new URL("../docs/arena.html",import.meta.url),"utf8");
  assert.match(css,/\.arenaAvatarFrame,\s*\.arenaAvatarIcon\{[^}]*width:100%;height:100%/);
  assert.match(css,/\.arenaAvatarFrame\{z-index:1;padding:0;pointer-events:none\}/);
  assert.match(css,/\.arenaAvatarIcon\{z-index:2;padding:0;/);
  assert.match(css,/\.arenaAvatar\{position:relative;width:46px;height:46px/);
  assert.match(css,/@media\(max-width:480px\)[\s\S]*?\.arenaAvatar\{width:42px;height:42px\}/);
  assert.match(css,/\.arenaRankRow\{display:grid;grid-template-columns:50px 46px minmax\(0,1fr\) 55px/);
  assert.match(html,/arena\.css\?v=8/);
});
