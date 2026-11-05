import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../docs/rankings-infos.js",import.meta.url),"utf8");
const token="v1."+"X".repeat(50)+"."+"Y".repeat(43);
const info=(name,alliance)=>({name,alliance,tcp:400000000,
  war_mvp:12,icon:"",frame:""});
const allowed=keys=>({isAllianceAllowed:key=>keys.includes(key)});
function make(role,keys,{signed=true,failGuest=false,pending=false}={}){
  const calls=[],summary={textContent:""};
  const session={ok:true,role,groupKey:role==="guest"?"marines":"losp",
    allowedAlliances:keys};
  const window={LoSP_SESSION:session,LoSP_AUTH_READY:Promise.resolve(),
    LoSPAccess:allowed(keys)};
  const localStorage={getItem:()=>signed?token:""};
  const document={querySelector:q=>q===".rankingsSummaryNote"?summary:null};
  const fetch=async(url,opts)=>{
    calls.push({url,opts});
    if(url.startsWith("./data/infos.json"))
      return Response.json([info("Z","Zeus"),info("MUST NOT LEAK","marines")]);
    if(failGuest)return new Response(null,{status:503});
    const guest=keys.filter(k=>k!=="zeus");
    return Response.json({status:"ok",kind:"authorized-guest-infos",
      alliances:guest.map(k=>({alliance:k,
        state:pending?"not-collected":"complete",
        players:pending?[]:[info(k+" player",k)]}))});
  };
  runInNewContext(source,{window,localStorage,document,fetch,Date,Set,
    Number,Error,Array,Object,String,encodeURIComponent});
  return {window,calls,summary};
}
test("MARINES guest ranks never read public LoSP Infos and use signed auth",async()=>{
  const x=make("guest",["marines"]);
  const result=await x.window.LoSPRankingInfos.load();
  assert.deepEqual(result.rows.map(p=>p.name),["marines player"]);
  assert.equal(x.calls.length,1);
  assert.match(x.calls[0].url,/\/api\/secure\/guest-infos\?alliances=marines$/);
  assert.equal(x.calls[0].opts.headers.Authorization,"Bearer "+token);
  assert.equal(x.summary.textContent,"Alliance invitée");
});
test("future approved guest keys need no new hardcode",async()=>{
  const x=make("guest",["future-guest-2027"]);
  const result=await x.window.LoSPRankingInfos.load();
  assert.deepEqual(result.rows.map(p=>p.alliance),["future-guest-2027"]);
  assert.match(x.calls[0].url,/alliances=future-guest-2027/);
});
test("missing signed session fails closed before any public Infos fetch",async()=>{
  const x=make("guest",["marines"],{signed:false});
  await assert.rejects(()=>x.window.LoSPRankingInfos.load(),/Session Discord signée/);
  assert.equal(x.calls.length,0);
});
test("members remain on existing public Infos only and cannot load guests",async()=>{
  const x=make("member",["zeus"]);
  const r=await x.window.LoSPRankingInfos.load();
  assert.deepEqual(r.rows.map(p=>p.name),["Z"]);
  assert.equal(x.calls.length,1);
  assert.match(x.calls[0].url,/infos.json/);
  assert.equal(x.summary.textContent,"Groupement LoSP");
});
test("admins merge LoSP with signed approved guests without duplicates of tenant scope",async()=>{
  const x=make("admin",["zeus","marines","future-guest-2027"]);
  const r=await x.window.LoSPRankingInfos.load();
  assert.deepEqual(r.rows.map(p=>p.name),["Z","MUST NOT LEAK",
    "marines player","future-guest-2027 player"]);
  assert.equal(x.calls.length,2);
  assert.match(x.calls[1].url,/alliances=approved/);
  assert.equal(x.summary.textContent,"Groupement et invités");
});
test("admin missing private API keeps LoSP and reports warning, never claims full ranking",async()=>{
  const x=make("admin",["zeus","marines"],{failGuest:true});
  const r=await x.window.LoSPRankingInfos.load();
  assert.equal(r.rows.length,2);
  assert.match(r.warning,/HTTP 503/);
});
test("guest without complete private collection gets explicit warning instead of fake rank",async()=>{
  const x=make("guest",["marines"],{pending:true});
  const r=await x.window.LoSPRankingInfos.load();
  assert.deepEqual(r.rows,[]);
  assert.match(r.warning,/non encore collectées/);
});
test("both page HTMLs load shared signed source before their ranking scripts",async()=>{
  for(const page of ["tcp","mvp"]){
    const html=await readFile(new URL("../docs/"+page+".html",import.meta.url),"utf8");
    assert.match(html,/rankingsDataNotice/);
    assert.ok(html.indexOf("rankings-infos.js")<html.indexOf(page+".js"));
  }
});
