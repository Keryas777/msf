// Regression tests for the vanilla-JS Arena page, using a minimal DOM shim.
// No browser, framework, network call or player information is required.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../docs/arena.js",import.meta.url),"utf8");
const cut=source.indexOf('$("tabRanking").addEventListener(');
if(cut<0)throw Error("Arena event attachment marker missing");
const isolated=source.slice(source.indexOf("(()=>{"),cut)+
  "return {S,canonical,mapSourceAlliances,readSnapshots,label,fillRanking};\n})();";
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
    tag,children:[],value:"",textContent:"",className:"",
    style:{setProperty(){}},classList:{add(){},toggle(){}},
    setAttribute(){},addEventListener(){},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;}
  };
}
function setup(){
  const nodes={rankingAlliance:element("select"),rankingList:element("div")};
  nodes.rankingAlliance.value="all";
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
