import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const ORIGIN="https://keryas777.github.io";
const OWNER="300305626926415874";
const OTHER="900000000000000001";
const TOKEN="Bearer v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN";
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
const b64=value=>Buffer.from(JSON.stringify(value),"utf8").toString("base64");
function fixture({id=OWNER,role="admin",conflict=false}={}){
  const calls=[];let head="a".repeat(40),data={schemaVersion:1,alliances:[],observations:[]},conflicts=0;
  const fetch=async(url,options={})=>{
    const path=new URL(url).pathname;const body=options.body?JSON.parse(options.body):null;
    calls.push({path,method:options.method||"GET",body});
    if(path.endsWith("/git/ref/heads/main"))return json({object:{sha:head}});
    if(path.includes("/contents/docs/data/war-intelligence.json"))return json({encoding:"base64",content:b64(data)});
    if(path.includes("/git/commits/"+head))return json({tree:{sha:"c".repeat(40)}});
    if(path.endsWith("/git/trees"))return json({sha:"d".repeat(40)});
    if(path.endsWith("/git/commits"))return json({sha:"b".repeat(40)});
    if(path.endsWith("/git/refs/heads/main")){
      if(conflict&&!conflicts++)return json({message:"head updated"},422);
      const tree=calls.findLast(call=>call.path.endsWith("/git/trees"));
      head="b".repeat(40);data=JSON.parse(tree.body.tree[0].content);return json({object:{sha:head}});
    }
    throw Error("Unexpected request "+path);
  };
  const env={GITHUB_TOKEN:"test-only",LOSP_AUTH:{fetch:async()=>json({ok:true,signedSession:true,id,role,displayName:"Session test"})}};
  return {calls,env,fetch,get data(){return data;}};
}
async function withFetch(mock,fn){const original=globalThis.fetch;globalThis.fetch=mock;try{return await fn();}finally{globalThis.fetch=original;}}
const post=(body,token=TOKEN)=>new Request("https://worker.example/api/war-intelligence",{
  method:"POST",headers:{Origin:ORIGIN,Authorization:token,"Content-Type":"application/json"},body:JSON.stringify(body)
});
test("les écritures refusent les utilisateurs ordinaires, même avec rôle admin Discord",async()=>{
  const x=fixture({id:OTHER});await withFetch(x.fetch,async()=>{
    const response=await worker.fetch(post({action:"createAlliance",name:"Rivals"}),x.env);
    assert.equal(response.status,403);assert.equal((await response.json()).error,"owner_only");
    assert.equal(x.calls.filter(call=>call.method!=="GET").length,0);
  });
});
test("l'identifiant du propriétaire ne suffit pas sans rôle administrateur",async()=>{
  const x=fixture({role:"member"});await withFetch(x.fetch,async()=>{
    const response=await worker.fetch(post({action:"createAlliance",name:"Rivals"}),x.env);
    assert.equal(response.status,403);assert.equal((await response.json()).error,"owner_only");
    assert.equal(x.calls.filter(call=>call.method!=="GET").length,0);
  });
});
test("création alliance conserve le nom classique et un identifiant stable",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const response=await worker.fetch(post({action:"createAlliance",name:"Rivals Ω"}),x.env);
    assert.equal(response.status,200,JSON.stringify({body:await response.clone().json(),calls:x.calls}));const result=await response.json();
    assert.match(result.allianceId,/^wi-[a-f0-9-]{36}$/i);assert.equal(x.data.alliances[0].name,"Rivals Ω");
    assert.equal(x.data.alliances[0].richName,null);
  });
});
test("une correction à la même date remplace le relevé sans créer de révision",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const created=await worker.fetch(post({action:"createAlliance",name:"Rivals"}),x.env);
    const allianceId=(await created.json()).allianceId;
    const first={allianceId,date:"2026-11-13",layout:["soute",null,"hangar",null,null,null,null,null,null]};
    const published=await worker.fetch(post({action:"publish",observation:first}),x.env);
    assert.equal(published.status,200,JSON.stringify(await published.clone().json()));const firstId=(await published.json()).observationId;
    const second=await worker.fetch(post({action:"publish",observation:{...first,layout:["soute","security","hangar",null,null,null,null,null,null]}}),x.env);
    assert.equal(second.status,200,JSON.stringify(await second.clone().json()));const secondId=(await second.json()).observationId;
    assert.equal(firstId,secondId);assert.equal(x.data.observations.length,1);
    assert.deepEqual(x.data.observations[0].layout,["soute","security","hangar",null,null,null,null,null,null]);
    assert.equal("revision" in x.data.observations[0],false);assert.equal("supersedesId" in x.data.observations[0],false);
    const otherDate=await worker.fetch(post({action:"publish",observation:{...first,date:"2026-11-12"}}),x.env);
    assert.equal(otherDate.status,200);assert.equal(x.data.observations.length,2);
    assert.notEqual((await otherDate.json()).observationId,firstId);
  });
});
test("publication accepte une carte complète avec les neuf salles distinctes",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const created=await worker.fetch(post({action:"createAlliance",name:"Complete"}),x.env);
    const allianceId=(await created.json()).allianceId;
    const layout=["soute","hangar","security","tech","armory","infirmary","bridge","reactor","barracks"];
    const response=await worker.fetch(post({action:"publish",observation:{allianceId,date:"2026-11-13",layout}}),x.env);
    assert.equal(response.status,200);assert.deepEqual(x.data.observations[0].layout,layout);
  });
});
test("doublons, dates invalides et positions de pont d’envol sont rejetés",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const created=await worker.fetch(post({action:"createAlliance",name:"Rivals"}),x.env);
    const allianceId=(await created.json()).allianceId;
    for(const observation of [
      {allianceId,date:"2026-11-13",layout:["soute","soute",null,null,null,null,null,null,null]},
      {allianceId,date:"2026-02-30",layout:["soute",null,null,null,null,null,null,null,null]},
      {allianceId,date:"2026-11-13",layout:["flight-deck",null,null,null,null,null,null,null,null]}
    ]){
      const response=await worker.fetch(post({action:"publish",observation}),x.env);assert.equal(response.status,400);
    }
    assert.equal(x.data.observations.length,0);
  });
});
test("nom enrichi versionné et suppression définitive conservent alliance et autres dates",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const created=await worker.fetch(post({action:"createAlliance",name:"Rivals"}),x.env);const allianceId=(await created.json()).allianceId;
    await worker.fetch(post({action:"updateAlliance",allianceId,name:"Rivals classic",richName:{schemaVersion:1,segments:[{text:"RIVALS",color:"#66ccff",symbol:"◆"}]}}),x.env);
    const published=await worker.fetch(post({action:"publish",observation:{allianceId,date:"2026-11-13",layout:["soute",null,null,null,null,null,null,null,null]}}),x.env);
    const observationId=(await published.json()).observationId;
    await worker.fetch(post({action:"publish",observation:{allianceId,date:"2026-11-12",layout:["hangar",null,null,null,null,null,null,null,null]}}),x.env);
    const visible=await worker.fetch(new Request("https://worker.example/api/war-intelligence"),x.env);
    const publicData=await visible.json();assert.equal(visible.headers.get("Cache-Control"),"no-store");
    assert.equal(publicData.alliances[0].name,"Rivals classic");assert.equal(publicData.observations.length,2);
    const removed=await worker.fetch(post({action:"delete",observationId}),x.env);assert.equal(removed.status,200);
    assert.equal(x.data.observations.length,1);assert.equal(x.data.observations[0].date,"2026-11-12");
    const hidden=await worker.fetch(new Request("https://worker.example/api/war-intelligence"),x.env);
    assert.equal((await hidden.json()).observations.length,1);
    assert.deepEqual(x.data.alliances[0].richName.segments,[{text:"RIVALS",color:"#66ccff",symbol:"◆"}]);
  });
});
test("la suppression d’un relevé inexistant est refusée sans modifier les données",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const response=await worker.fetch(post({action:"delete",observationId:"wir-missing"}),x.env);
    assert.equal(response.status,404);assert.deepEqual(x.data.observations,[]);
  });
});
test("session ancienne, origine incorrecte et conflit de commit ne valident pas une écriture non sûre",async()=>{
  const x=fixture();await withFetch(x.fetch,async()=>{
    const unsigned=await worker.fetch(post({action:"createAlliance",name:"Rivals"},"Bearer abc"),x.env);assert.equal(unsigned.status,401);
    const wrongOrigin=new Request("https://worker.example/api/war-intelligence",{method:"POST",headers:{Authorization:TOKEN,"Content-Type":"application/json"},body:JSON.stringify({action:"createAlliance",name:"Rivals"})});
    assert.equal((await worker.fetch(wrongOrigin,x.env)).status,403);
  });
  const conflict=fixture({conflict:true});await withFetch(conflict.fetch,async()=>{
    const response=await worker.fetch(post({action:"createAlliance",name:"Rivals"}),conflict.env);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.equal(conflict.calls.filter(call=>call.path.endsWith("/git/ref/heads/main")).length,2);
  });
});
