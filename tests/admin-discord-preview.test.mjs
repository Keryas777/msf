import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../docs/auth-guard.js", import.meta.url), "utf8");
const groups = JSON.parse(await readFile(new URL("../docs/data/access-groups.json", import.meta.url), "utf8"));
const OWNER = "300305626926415874";
const STORE = "losp:admin-preview:group";

function domElement(tag, elements) {
  const attrs = {};
  const listeners = {};
  const classes = new Set();
  let id = "";
  const node = {
    tag, children: [], hidden: false, textContent: "", value: "", style: {},
    get id() { return id; },
    set id(v) { id = v; elements.set(v, node); },
    classList: { add: name => classes.add(name), contains: name => classes.has(name) },
    setAttribute: (k,v) => { attrs[k] = v; },
    getAttribute: k => attrs[k] ?? null,
    appendChild(child) { node.children.push(child); },
    prepend(child) { node.children.unshift(child); },
    append(...children) { node.children.push(...children); },
    addEventListener(name,cb) { listeners[name] = cb; },
    emit(name,event={}) { listeners[name]?.(event); },
    focus() {},
  };
  return node;
}

async function scenario({ id=OWNER, role="admin", groupKey="all",
  stored="", path="home.html", config=groups, failConfig=false, inlineHome=false, inlineOther=false }={}) {
  const elements = new Map(), saved = new Map(stored ? [[STORE,stored]] : []);
  const body = domElement("body",elements);
  const head = domElement("head",elements);
  const redirects=[], requests=[];
  const homeGrid = { inserted: [], before(node) { this.inserted.push(node); } };
  const pageHeader = { inserted: [], after(node) { this.inserted.push(node); } };
  let reloads=0;
  const document = {
    readyState: "complete", body, head,
    documentElement: { classList: {remove() {}} },
    getElementById: id => elements.get(id) || null,
    createElement: tag => domElement(tag,elements),
    querySelector: selector => inlineHome && selector === ".homeGrid" ? homeGrid :
      inlineOther && selector === ".app > .header" ? pageHeader : null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const window = {
    location: {
      pathname: "/msf/" + path, search:"", hash:"",
      replace: url=>redirects.push(url),
      reload:()=>{reloads++;}
    },
    dispatchEvent() {}
  };
  const session = { ok:true, id, username:"Keryas", role, groupKey,
    allowedAlliances:["zeus","athena","kronos","dionysos","poseidon","hades",
      "marines","endgame-revolution-red","endgame-revolution-orange"], players:[{name:"Keryas I",alliance:"zeus"}] };
  const context = {
    window, document,
    localStorage:{getItem:()=>null,removeItem(){}},
    sessionStorage:{
      getItem:key=>saved.get(key)||null,
      setItem:(key,value)=>saved.set(key,value),
      removeItem:key=>saved.delete(key),
      clear:()=>saved.clear()
    },
    CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}},
    fetch: async url => {
      requests.push(String(url));
      if (String(url).endsWith("/me")) return Response.json(session);
      if (String(url).includes("access-groups.json")) {
        if (failConfig) return new Response(null,{status:503});
        return Response.json(config);
      }
      throw Error("Unexpected URL " + url);
    },
    console:{warn(){}},
  };
  runInNewContext(script,context,{filename:"docs/auth-guard.js"});
  await new Promise(resolve=>setImmediate(resolve));
  return {window,document,body,head,homeGrid,pageHeader,elements,saved,redirects,requests,
    get reloads(){return reloads;}};
}

test("Sur l'accueil le menu unique s'insère avant les tuiles, sans recouvrir Déconnexion",async()=>{
  const x=await scenario({inlineHome:true,path:"home.html"});
  assert.equal(x.homeGrid.inserted.length,1);
  const preview=x.homeGrid.inserted[0];
  assert.equal(preview.id,"lospAdminPreview");
  assert.equal(preview.children.length,2);
  assert.equal(preview.children[0].tag,"label");
  assert.equal(preview.children[1].tag,"select");
  assert.equal(x.body.children.length,0);
  const guard=await readFile(new URL("../docs/auth-guard.js", import.meta.url),"utf8");
  assert.match(guard,/#lospAdminPreview\s*\{\s*position:relative/);
  assert.doesNotMatch(guard,/lospPreviewToggle|lospPreviewPanel|position:fixed;right:12px/);
});

test("Sur les autres pages le menu est placé sous le header dans le flux",async()=>{
  const x=await scenario({inlineOther:true,path:"joueur.html"});
  assert.equal(x.pageHeader.inserted.length,1);
  assert.equal(x.pageHeader.inserted[0].id,"lospAdminPreview");
  assert.equal(x.body.children.length,0);
});

test("Seul le propriétaire admin vérifié par Discord voit le sélecteur",async()=>{
  const mine=await scenario();
  assert.ok(mine.elements.get("lospAdminPreview"));
  assert.equal(mine.window.LoSP_SESSION.role,"admin");
  assert.equal(mine.window.LoSP_REAL_SESSION.role,"admin");
  const another=await scenario({id:"999999999999999999"});
  assert.equal(another.elements.has("lospAdminPreview"),false);
  assert.ok(!another.requests.some(url=>url.includes("access-groups.json")));
  const guest=await scenario({id:OWNER,role:"guest",groupKey:"marines"});
  assert.equal(guest.elements.has("lospAdminPreview"),false);
});

test("Marines : droits effectifs limités à une seule alliance sans modifier les droits réels",async()=>{
  const x=await scenario({stored:"marines"});
  assert.equal(x.window.LoSP_REAL_SESSION.role,"admin");
  assert.equal(x.window.LoSP_SESSION.role,"guest");
  assert.equal(x.window.LoSP_SESSION.groupKey,"marines");
  assert.equal(x.window.LoSP_SESSION.previewMode,true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("marines"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("zeus"),false);
  assert.deepEqual(Array.from(x.window.LoSP_SESSION.allowedAlliances),["marines"]);
  assert.equal(x.elements.get("lospPreviewGroup").value,"marines");
  const preview=x.elements.get("lospAdminPreview");
  assert.equal(preview.children.length,2);
  assert.ok(preview.children[1].children.some(option=>option.textContent==="WebApp MARINES"));
});

test("Endgame : les deux variantes uniquement, et pages LoSP bloquées",async()=>{
  const x=await scenario({stored:"endgame-revolution",path:"cosmic.html"});
  assert.equal(x.window.LoSP_SESSION.role,"guest");
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("endgame-revolution-red"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("endgame-revolution-orange"),true);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("hades"),false);
  assert.deepEqual(x.redirects,["./home.html"]);
});

test("LoSP simulé : six alliances, identité admin intacte et accès cosmique",async()=>{
  const x=await scenario({stored:"losp",path:"cosmic.html"});
  assert.equal(x.window.LoSP_SESSION.role,"member");
  assert.equal(x.window.LoSP_SESSION.groupKey,"losp");
  assert.equal(x.window.LoSP_SESSION.allowedAlliances.length,6);
  assert.equal(x.window.LoSPAccess.isAllianceAllowed("marines"),false);
  assert.deepEqual(x.redirects,[]);
  assert.equal(x.window.LoSP_REAL_SESSION.role,"admin");
});

test("Changer de groupe utilise uniquement sessionStorage puis recharge la vue",async()=>{
  const x=await scenario();
  const select=x.elements.get("lospPreviewGroup");
  select.value="marines";
  select.emit("change");
  assert.equal(x.saved.get(STORE),"marines");
  assert.equal(x.reloads,1);
  assert.equal(x.window.LoSP_SESSION.role,"admin");
  const y=await scenario({stored:"marines"});
  const reset=y.elements.get("lospPreviewGroup");
  reset.value="";
  reset.emit("change");
  assert.equal(y.saved.has(STORE),false);
  assert.equal(y.reloads,1);
});

test("Configuration indisponible ou valeur invalide : aucune escalade, retour vue réelle",async()=>{
  const invalid=await scenario({stored:"fake-role"});
  assert.equal(invalid.window.LoSP_SESSION.role,"admin");
  assert.equal(invalid.saved.has(STORE),false);
  const offline=await scenario({stored:"marines",failConfig:true});
  assert.equal(offline.window.LoSP_SESSION.role,"admin");
  assert.equal(offline.elements.has("lospAdminPreview"),false);
});
