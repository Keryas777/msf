// Regression tests for the vanilla-JS Arena page, using a minimal DOM shim.
// No browser, framework, network call or player information is required.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../docs/arena.js",import.meta.url),"utf8");
const cut=source.indexOf('$("tabRanking").addEventListener(');
if(cut<0)throw Error("Arena event attachment marker missing");
const isolated=source.slice(source.indexOf("(()=>{"),cut)+
  "return {S,canonical,mapSourceAlliances,readSnapshots,label,fillRanking,setupFilters,setupPeople,fillChart,fillSummary,isGuestView,isAdminView,guestAllianceKeys,signedSession,mergeArenaHistories,readArenaAPI,loadGuestProfiles};\n})();";
const metadata=[
  {key:"zeus",name:"Zeus",emoji:"⚡️",color:"#ffff00"},
  {key:"athena",name:"Athéna",emoji:"🦉",color:"#ff9900"},
  {key:"hades",name:"Hadès",emoji:"🔥",color:"#21bb77"},
  {key:"marines",name:"MARINES",emoji:"⚓",color:"#e53935"}
];
const allianceApi={
  getAllianceMeta:value=>metadata.find(a=>value===a.key||value===a.name)||null,
  getKnownAlliances:()=>metadata
};
function element(tag){
  return {
    tag,children:[],value:"",textContent:"",className:"",attrs:{},
    dataset:{},listeners:{},checked:false,
    style:{setProperty(){}},classList:{add(){},toggle(){}},
    setAttribute(k,v){this.attrs[k]=v;},
    addEventListener(name,callback){this.listeners[name]=callback;},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;}
  };
}
function setup(options={}){
  const nodes={rankingAllianceFilters:element("div"),
    rankingAllianceSummaryText:element("span"),rankingList:element("div")};
  nodes.historyAlliance=element("select");nodes.historyAlliance.value="all";
  nodes.arenaChart=element("svg");nodes.arenaChart.parentElement={clientWidth:320};
  const document={
    createElement:element,
    createElementNS:(_ns,tag)=>element(tag),
    getElementById:id=>nodes[id]??(nodes[id]=element("div"))
  };
  const fn=new Function("window","document","fetch","localStorage","return "+isolated);
  const win={LoSPAlliances:allianceApi,
    LoSPAccess:{isAllianceAllowed:()=>true},...options.window};
  const page=fn(win,document,options.fetch||(()=>{
    throw Error("Tests must never fetch or perform an API request");
  }),options.storage||{getItem:()=>null});
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
  assert.match(html,/arena\.js\?v=\d+/);
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
  assert.match(html,/arena\.css\?v=9/);
});


test("Arena uses the same expandable multi-alliance checkboxes as MVP/TCP",()=>{
  const html=fs.readFileSync(new URL("../docs/arena.html",import.meta.url),"utf8");
  assert.match(html,/class="arenaPage rankingPage"/);
  assert.match(html,/rankings-shared\.css\?v=1/);
  assert.match(html,/id="rankingAllianceFilters"/);
  assert.match(html,/id="rankingAllianceSummaryText"/);
  assert.doesNotMatch(html,/id="rankingAlliance"/);
});

test("Arena multi-alliance filtering retains absolute ranks and updates its summary",()=>{
  const {page,nodes}=setup(),history=records(page);
  page.mapSourceAlliances(history);
  page.S.snapshots=page.readSnapshots(history);
  for(const person of page.S.snapshots[1].players)page.S.people.set(person.id,person);
  page.setupFilters();
  page.fillRanking();
  const inputs=nodes.rankingAllianceFilters.children.map(toggle=>toggle.children[0]);
  assert.deepEqual(inputs.map(input=>input.dataset.allianceKey),
    ["zeus","athena","hades"]);
  assert.ok(inputs.every(input=>input.checked));
  assert.equal(nodes.rankingAllianceSummaryText.textContent,"Toutes les alliances");
  assert.equal(nodes.rankingList.children.length,6);
  const setChecked=(key,checked)=>{
    const input=inputs.find(cb=>cb.dataset.allianceKey===key);
    input.checked=checked;
    input.listeners.change();
  };
  setChecked("zeus",false);
  assert.equal(nodes.rankingAllianceSummaryText.textContent,"2 alliances sélectionnées");
  assert.deepEqual(nodes.rankingList.children.map(row=>row.children[0].textContent),
    ["#3","—","#5","#6"]);
  setChecked("athena",false);
  assert.equal(nodes.rankingAllianceSummaryText.textContent,"🔥 Hadès");
  assert.deepEqual(nodes.rankingList.children.map(row=>row.children[0].textContent),
    ["#5","#6"]);
  setChecked("hades",false);
  assert.equal(nodes.rankingAllianceSummaryText.textContent,
    "Aucune alliance sélectionnée");
  assert.equal(nodes.rankingList.children[0].textContent,"Aucun joueur classé.");
  for(const input of inputs)setChecked(input.dataset.allianceKey,true);
  assert.equal(nodes.rankingList.children.length,6);
  assert.equal(nodes.rankingAllianceSummaryText.textContent,"Toutes les alliances");
});

test("MARINES guest session loads ranks from signed, scope-bound API only",async()=>{
  const signed="v1."+"A".repeat(65)+"."+"B".repeat(43),calls=[];
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"guest",groupKey:"marines",
      allowedAlliances:["marines"]}},
    storage:{getItem:key=>key==="losp_session"?signed:null},
    fetch:async(url,options)=>{
      calls.push({url,options});
      return Response.json({status:"ok",kind:"authorized-guest-arena-history",
        snapshots:[{date:"2026-11-05",players:[{
          name:"MARINE 01",alliance:"marines",arenaRank:12}]}]});
    }
  });
  const payload=await page.readArenaAPI();
  assert.equal(payload.snapshots[0].players[0].name,"MARINE 01");
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/api\/secure\/guest-arena-history\?alliances=marines$/);
  assert.equal(calls[0].options.headers.Authorization,"Bearer "+signed);
  assert.equal(calls[0].options.cache,"no-store");
});
test("guest view never falls back to public LoSP ranks or legacy unsigned sessions",async()=>{
  const {page}=setup({window:{LoSP_SESSION:{ok:true,role:"guest",
    groupKey:"marines",allowedAlliances:["marines"]}},
    storage:{getItem:()=> "eyJpZCI6IjMwMDMwNTYyNjkyNjQxNTg3NCJ9"}});
  await assert.rejects(()=>page.readArenaAPI(),/Session Discord signée nécessaire/);
});
test("admin preview does not grant rights; sends real signed session for target guest",async()=>{
  const token="v1."+"Q".repeat(42)+"."+"W".repeat(43),calls=[];
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"guest",previewMode:true,
      previewGroupKey:"marines",groupKey:"marines",allowedAlliances:["marines"]},
      LoSP_REAL_SESSION:{ok:true,role:"admin",groupKey:"all"}},
    storage:{getItem:()=>token},
    fetch:async(url,options)=>{
      calls.push([url,options.headers.Authorization]);
      return Response.json({kind:"authorized-guest-arena-history",status:"ok",snapshots:[]});
    }
  });
  await page.readArenaAPI();
  assert.match(calls[0][0],/alliances=marines$/);
  assert.equal(calls[0][1],"Bearer "+token);
});
test("LoSP view retains its existing public API with no bearer token",async()=>{
  const calls=[];
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"member",groupKey:"losp",
      allowedAlliances:["zeus"]}},
    fetch:async(url,options)=>{
      calls.push([url,options]);
      return Response.json({snapshots:[]});
    }
  });
  assert.deepEqual(await page.readArenaAPI(),{snapshots:[]});
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/\/api\/public\/arena-history$/);
  assert.equal(calls[0][1].headers,undefined);
});

test("admin receives LoSP plus 24 consented MARINES in one daily ranking and history",async()=>{
  const signed="v1."+"J".repeat(65)+"."+"K".repeat(43),calls=[];
  const publicRows=Array.from({length:121},(_,i)=>({
    name:"LoSP Player "+i,alliance:i===120?"hades":"zeus",arenaRank:i+100
  }));
  const guestRows=Array.from({length:24},(_,i)=>({
    name:"Marine Player "+i,alliance:"marines",arenaRank:i+1,
    observedAt:"2026-11-05T16:05:17Z"
  }));
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",
      allowedAlliances:["zeus","hades","marines","endgame-revolution-red"]}},
    storage:{getItem:()=>signed},
    fetch:async(url,options)=>{
      calls.push([url,options]);
      if(url.includes("/api/secure/guest-arena-history"))
        return Response.json({status:"ok",kind:"authorized-guest-arena-history",
          snapshots:[{date:"2026-11-05",players:guestRows}]});
      return Response.json({status:"ok",snapshots:[{
        date:"2026-11-05",players:publicRows}]});
    }
  });
  const data=await page.readArenaAPI();
  assert.equal(calls.length,2);
  assert.equal(calls[0][1].headers,undefined);
  assert.match(calls[1][0],/\/api\/secure\/guest-arena-history\?alliances=approved$/);
  assert.equal(calls[1][1].headers.Authorization,"Bearer "+signed);
  assert.equal(data.snapshots.length,1);
  assert.equal(data.snapshots[0].players.length,145);
  const rows=page.readSnapshots(data);
  assert.equal(rows[0].players.length,145);
  assert.equal(rows[0].players.filter(p=>p.alliance==="marines").length,24);
  page.S.snapshots=rows;
  page.fillRanking();
  assert.ok(page.label("marines").includes("MARINES"));
});
test("member LoSP still uses public history and cannot ask for invited alliance data",async()=>{
  const calls=[];
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"member",groupKey:"losp",
      allowedAlliances:["zeus","athena","hades"]}},
    fetch:async(url,options)=>{
      calls.push([url,options]);
      return Response.json({status:"ok",snapshots:[]});
    }
  });
  await page.readArenaAPI();
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/\/api\/public\/arena-history$/);
});
test("admin without signed session sees LoSP plus an explicit guest warning",async()=>{
  const calls=[];
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",allowedAlliances:["marines","zeus"]}},
    storage:{getItem:()=> "base64-legacy-unsigned"},
    fetch:async(url)=>{
      calls.push(url);
      return Response.json({status:"ok",snapshots:[{
        date:"2026-11-05",players:[{name:"Zeus Player",alliance:"zeus",arenaRank:12}]
      }]});
    }
  });
  const data=await page.readArenaAPI();
  assert.equal(data.snapshots.length,1);
  assert.equal(data.snapshots[0].players.length,1);
  assert.match(data.guestWarning,/Session Discord signée nécessaire/);
  assert.equal(calls.length,1);
});
test("admin guest-source error never silently hides missing invited ranks",async()=>{
  const signed="v1."+"L".repeat(65)+"."+"M".repeat(43);
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",allowedAlliances:["marines","zeus"]}},
    storage:{getItem:()=>signed},
    fetch:async(url)=>{
      if(url.includes("/api/secure/"))return new Response(null,{status:503});
      return Response.json({snapshots:[{date:"2026-11-05",players:[
        {name:"Zeus Player",alliance:"zeus",arenaRank:10}
      ]}]});
    }
  });
  const data=await page.readArenaAPI();
  assert.equal(data.snapshots.length,1);
  assert.match(data.guestWarning,/Historique Arène invité indisponible \(HTTP 503/);
});
test("merging by date preserves earlier LoSP history without fabricating guest points",()=>{
  const {page}=setup();
  const history=page.mergeArenaHistories({
    snapshots:[{date:"2026-11-04",players:[{name:"Z",alliance:"zeus",arenaRank:2}]},
      {date:"2026-11-05",players:[{name:"Z",alliance:"zeus",arenaRank:1}]}]},
    {snapshots:[{date:"2026-11-05",players:[{name:"M",alliance:"marines",arenaRank:4}]}]});
  assert.deepEqual(history.snapshots.map(x=>x.date),["2026-11-04","2026-11-05"]);
  assert.equal(history.snapshots[0].players.length,1);
  assert.equal(history.snapshots[1].players.length,2);
});

test("admin sees an exact Cloudflare auth-binding failure instead of a generic unavailable message",async()=>{
  const signed="v1."+"R".repeat(65)+"."+"S".repeat(43);
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",allowedAlliances:["marines","zeus"]}},
    storage:{getItem:()=>signed},
    fetch:async(url)=>{
      if(url.includes("/api/secure/guest-arena-history"))
        return Response.json({status:"auth-unavailable",reason:"auth-binding-missing"},{status:503});
      return Response.json({snapshots:[{date:"2026-11-05",
        players:[{name:"Zeus",alliance:"zeus",arenaRank:2}]}]});
    }
  });
  const data=await page.readArenaAPI();
  assert.equal(data.snapshots[0].players.length,1);
  assert.match(data.guestWarning,/HTTP 503.*auth-binding-missing/);
  assert.match(data.guestWarning,/Liaison Cloudflare losp-auth absente/);
});
test("404 identifies a Worker deployment mismatch without inventing any guests",async()=>{
  const signed="v1."+"R".repeat(65)+"."+"S".repeat(43);
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",allowedAlliances:["marines","zeus"]}},
    storage:{getItem:()=>signed},
    fetch:async(url)=>{
      if(url.includes("/api/secure/guest-arena-history"))
        return new Response("<html>Not Found</html>",{status:404,
          headers:{"Content-Type":"text/html"}});
      return Response.json({snapshots:[]});
    }
  });
  const data=await page.readArenaAPI();
  assert.match(data.guestWarning,/API Arène privée absente.*HTTP 404/);
  assert.deepEqual(data.snapshots,[]);
});
test("R2 failure code is rendered as text, no private Worker traces",async()=>{
  const signed="v1."+"R".repeat(65)+"."+"S".repeat(43);
  const {page}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",allowedAlliances:["marines","zeus"]}},
    storage:{getItem:()=>signed},
    fetch:async(url)=>{
      if(url.includes("/api/secure/guest-arena-history"))
        return Response.json({status:"unavailable",reason:"private-r2-read-failed",
          stack:"private oauth token must not display"}, {status:503});
      return Response.json({snapshots:[]});
    }
  });
  const data=await page.readArenaAPI();
  assert.match(data.guestWarning,/private-r2-read-failed/);
  assert.doesNotMatch(data.guestWarning,/oauth token/);
});


const marineIcon="https://assets.marvelstrikeforce.com/imgs/Portrait_Marine_1234abcd.png";
const marineFrame="https://assets.marvelstrikeforce.com/imgs/ICON_FRAME_Marine_aabbcc11.png";
const lospIcon="https://assets.marvelstrikeforce.com/imgs/Portrait_Zeus_1234abcd.png";
const lospFrame="https://assets.marvelstrikeforce.com/imgs/ICON_FRAME_Zeus_aabbcc11.png";
test("24 MARINES Arena players use authorized portrait and frame URLs in admin ranking",async()=>{
  const signed="v1."+"P".repeat(65)+"."+"Q".repeat(43);
  const people=Array.from({length:24},(_,i)=>({
    name:"Marine "+i,alliance:"marines",arenaRank:i+1,
    icon:marineIcon,frame:marineFrame
  }));
  const profiles=people.map(p=>({
    name:p.name,alliance:p.alliance,icon:p.icon,frame:p.frame
  }));
  const {page,nodes}=setup({
    window:{LoSP_SESSION:{ok:true,role:"admin",allowedAlliances:["zeus","marines"]}},
    storage:{getItem:()=>signed},
    fetch:async url=>url.includes("/api/secure/")?
      Response.json({status:"ok",kind:"authorized-guest-arena-history",
        alliances:["marines"],profiles,snapshots:[{date:"2026-11-05",players:people}]}):
      Response.json({snapshots:[{date:"2026-11-05",
        players:[{name:"Zeus Player",alliance:"zeus",arenaRank:25}]}]})
  });
  const data=await page.readArenaAPI();
  assert.equal(data.snapshots[0].players.length,25);
  page.loadGuestProfiles(data);
  page.S.snapshots=page.readSnapshots(data);
  page.fillRanking();
  assert.equal(page.S.snapshots[0].players.filter(p=>p.alliance==="marines").length,24);
  const rows=nodes.rankingList.children.filter(row=>row.tag==="article");
  assert.equal(rows.length,25);
  for(const row of rows.filter(row=>row.children[2].children[1].textContent.includes("MARINES"))){
    const avatar=row.children[1];
    assert.deepEqual(avatar.children.map(img=>img.className),
      ["arenaAvatarFrame","arenaAvatarIcon"]);
    assert.deepEqual(avatar.children.map(img=>img.src),[marineFrame,marineIcon]);
  }
});
test("same player name in LoSP and MARINES never shares avatar, frame or chart identity",()=>{
  const {page,nodes}=setup();
  page.S.infos.set("shared",{name:"Shared",alliance:"zeus",
    icon:lospIcon,frame:lospFrame});
  page.loadGuestProfiles({guestAlliances:["marines"],
    guestProfiles:[{name:"Shared",alliance:"marines",
      icon:marineIcon,frame:marineFrame}]});
  const data={snapshots:[{date:"2026-11-05",players:[
    {name:"Shared",alliance:"zeus",arenaRank:12},
    {name:"Shared",alliance:"marines",arenaRank:13}
  ]}]};
  const points=page.readSnapshots(data)[0].players;
  assert.equal(points.length,2);
  assert.deepEqual(points.map(p=>p.id),["shared","marines:shared"]);
  assert.equal(points[0].profile.icon,lospIcon);
  assert.equal(points[1].profile.icon,marineIcon);
  assert.equal(points[1].profile.frame,marineFrame);
  page.S.snapshots=[{date:"2026-11-05",players:points}];
  for(const person of points)page.S.people.set(person.id,person);
  assert.equal(page.S.people.size,2,"chart player keys are tenant-specific");
  page.fillRanking();
  const rows=nodes.rankingList.children;
  assert.deepEqual(rows[0].children[1].children.map(img=>img.src),
    [lospFrame,lospIcon]);
  assert.deepEqual(rows[1].children[1].children.map(img=>img.src),
    [marineFrame,marineIcon]);
});
test("untrusted image addresses and unknown guest media never fall back to LoSP photos",()=>{
  const {page,nodes}=setup();
  page.S.infos.set("same",{name:"Same",alliance:"zeus",
    icon:lospIcon,frame:lospFrame});
  page.loadGuestProfiles({alliances:["marines"],profiles:[
    {name:"Same",alliance:"marines",
      icon:"https://evil.example/steal.png",frame:"javascript:alert(1)"},
    {name:"Good",alliance:"marines",icon:marineIcon,
      frame:"https://assets.marvelstrikeforce.com/imgs/../../evil.png"}
  ]});
  const data={snapshots:[{date:"2026-11-05",players:[
    {name:"Same",alliance:"marines",arenaRank:1,
      icon:"https://evil.example/steal.png",frame:"javascript:alert(1)"},
    {name:"Good",alliance:"marines",arenaRank:2}
  ]}]};
  page.S.snapshots=page.readSnapshots(data);
  page.fillRanking();
  assert.equal(page.S.snapshots[0].players[0].profile,null);
  assert.deepEqual(nodes.rankingList.children[0].children[1].children.map(x=>x.textContent),["?"]);
  const good=nodes.rankingList.children[1].children[1].children;
  assert.equal(good.length,1);
  assert.equal(good[0].src,marineIcon);
});
test("guest profile metadata can be supplied separately from immutable older rank points",()=>{
  const {page}=setup();
  page.loadGuestProfiles({alliances:["marines"],
    profiles:[{name:"Veteran",alliance:"marines",
      icon:marineIcon,frame:marineFrame}]});
  const points=page.readSnapshots({snapshots:[{
    date:"2026-11-05",players:[{name:"Veteran",alliance:"marines",arenaRank:13}]
  }]})[0].players;
  assert.equal(points[0].profile.icon,marineIcon);
  assert.equal(points[0].profile.frame,marineFrame);
});
