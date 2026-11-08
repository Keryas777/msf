import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const script = await read("docs/auth-guard.js");

function tile(href) {
  const attrs = new Map([["href", href]]);
  const classes = new Set([href.includes("home") ? "homeTile" : "rankingsTile"]);
  const children = [];
  return {
    attrs, children,
    classList: { contains: name => classes.has(name), add: name => classes.add(name) },
    getAttribute: name => attrs.get(name) || null,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name),
    querySelector: name => name === "img" ? { alt:"Tuile" } : null,
    appendChild: child => children.push(child)
  };
}

async function authenticate(session, page, targets=[]) {
  const redirects = [], mountedStyles = [];
  const el = tag => ({
    tag, style:{}, children:[], textContent:"", setAttribute(){}, appendChild(child){this.children.push(child);}
  });
  const document = {
    readyState:"complete",
    head:{appendChild:style=>mountedStyles.push(style)},
    documentElement:{classList:{remove(){}}},
    getElementById: () => null,
    createElement:el,
    querySelectorAll:()=>targets,
    addEventListener(){}
  };
  const window = {
    location:{pathname:"/msf/"+page,search:"",hash:"",replace:url=>redirects.push(url)},
    dispatchEvent(){}
  };
  const context = {
    window,document,
    localStorage:{getItem:()=>null,removeItem(){}},
    sessionStorage:{clear(){}},
    CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}},
    fetch:async ()=>Response.json(session)
  };
  runInNewContext(script,context,{filename:"docs/auth-guard.js"});
  await new Promise(resolve=>setImmediate(resolve));
  return {window,redirects,mountedStyles,targets};
}

test("Un invité Marines voit uniquement MARINES et le masque sur cinq tuiles",async()=>{
  const targets=[
    tile("./war-history.html"),tile("./war-rankings.html"),tile("./war-graphs.html"),
    tile("./cosmic.html"),tile("./battleworld.html"),
    tile("./war-counters.html"),tile("./joueur.html"),tile("./codex.html")
  ];
  const x=await authenticate({ok:true,role:"guest",groupKey:"marines",allowedAlliances:["marines"]},"home.html",targets);
  assert.deepEqual(x.redirects,[]);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("marines"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("zeus"),false);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("endgame-revolution-orange"),false);
  for(const t of targets.slice(0,5)){
    assert.equal(t.getAttribute("href"),null);
    assert.equal(t.getAttribute("aria-disabled"),"true");
    assert.equal(t.children.at(-1)?.children.at(-1)?.textContent,"Réservé LoSP");
  }
  for(const t of targets.slice(5))assert.ok(t.getAttribute("href"));
  assert.match(x.mountedStyles[0].textContent,/grayscale\(1\)/);
  assert.match(x.mountedStyles[0].textContent,/rotate\(-17deg\)/);
});

test("Invité Endgame : deux identifiants, pas de LoSP",async()=>{
  const x=await authenticate({ok:true,role:"guest",groupKey:"endgame-revolution",
    allowedAlliances:["endgame-revolution-red","endgame-revolution-orange"]},"joueur.html");
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("endgame-revolution-red"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("endgame-revolution-orange"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("hades"),false);
});

test("Invité Questionable Propriety : accès QP seulement et pages LoSP bloquées",async()=>{
  const session={ok:true,role:"guest",groupKey:"questionable-propriety",
    allowedAlliances:["questionable-propriety"]};
  const x=await authenticate(session,"joueur.html");
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("questionable-propriety"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("marines"),false);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("endgame-revolution-red"),false);
  const blocked=await authenticate(session,"cosmic.html");
  assert.deepEqual(blocked.redirects,["./home.html"]);
});

test("Les cinq pages réservées sont bloquées en URL directe pour les invités",async()=>{
  for(const page of ["war-history.html","war-rankings.html","war-graphs.html",
    "cosmic.html","battleworld.html","cosmic-counters.html","cosmic-defenses.html",
    "cosmic-defense-propose.html"]){
    const x=await authenticate({ok:true,role:"guest",groupKey:"marines",
      allowedAlliances:["marines"]},page);
    assert.deepEqual(x.redirects,["./home.html"],page);
  }
});

test("Membre LoSP et admin conservent leurs accès et les tuiles normales",async()=>{
  for(const role of ["member","admin"]){
    const list=role==="member"?["zeus","athena","kronos","dionysos","poseidon","hades"]:
      ["zeus","athena","kronos","dionysos","poseidon","hades","marines",
      "endgame-revolution-red","endgame-revolution-orange"];
    const link=tile("./cosmic.html");
    const x=await authenticate({ok:true,role,groupKey:role==="admin"?"all":"losp",
      allowedAlliances:list},"cosmic.html",[link]);
    assert.deepEqual(x.redirects,[]);
    assert.equal(link.getAttribute("href"),"./cosmic.html");
    assert.equal(x.window.LoSPAccess.isAllianceAllowed("marines"),role==="admin");
  }
});

test("Les vues de joueurs et classements filtrent toutes leurs sources",async()=>{
  for(const path of ["docs/tcp.js","docs/mvp.js","docs/iso.js","docs/joueur.js",
    "docs/app.js","docs/arena.js","docs/evolution.js","docs/evolution-classement.js",
    "docs/alliance-history.js","docs/historique-personnages-profile.js"]){
    const source=await read(path);
    assert.match(source,/LoSPAccess\?\.isAllianceAllowed/,path);
  }
  const home=await read("docs/home.html");
  const war=await read("docs/war-choose.html");
  for(const page of ["cosmic.html","battleworld.html"])assert.ok(home.includes('href="./'+page+'"'));
  for(const page of ["war-history.html","war-rankings.html","war-graphs.html"])
    assert.ok(war.includes('href="./'+page+'"'));
});
