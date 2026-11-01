// Regression tests for the vanilla-JS Arena page, using a minimal DOM shim.
// No browser, framework, network call or player information is required.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../docs/arena.js",import.meta.url),"utf8");
const cut=source.indexOf('$("tabRanking").addEventListener(');
if(cut<0)throw Error("Arena event attachment marker missing");
const isolated=source.slice(source.indexOf("(()=>{"),cut)+
  "return {S,canonical,mapSourceAlliances,readSnapshots,label,fillRanking,setupPeople,fillChart};\n})();";
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
