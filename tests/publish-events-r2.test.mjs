import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyEventsPublication,publishEvents,SOURCE} from
  "../scripts/publish-events-r2.mjs";

const NOW=Date.parse("2026-11-05T04:05:00Z");
function fixture({checkedAt=NOW,status="ok",source="verified-daily-game-events",
  duplicate=false}={}){
  const ids=["a".repeat(24),duplicate?"a".repeat(24):"b".repeat(24)];
  return {schemaVersion:1,status,source,updatedAt:new Date(checkedAt).toISOString(),
    revision:"a".repeat(20),total:2,count:2,pages:1,
    locale:"fr",localizationStatus:"verified",localizedFields:1,
    events:ids.map((id,i)=>({id,name:"Événement "+i,type:"milestone",
      startTime:1793000000,endTime:1803000000}))};
}
test("accepts a complete daily catalogue and rejects stale, corrupt or duplicated data",()=>{
  assert.equal(verifyEventsPublication(fixture(),NOW).count,2);
  assert.throws(()=>verifyEventsPublication(fixture({checkedAt:NOW-49*3600000}),NOW),/48h/);
  assert.throws(()=>verifyEventsPublication(fixture({duplicate:true}),NOW),/duplicate/);
  assert.throws(()=>verifyEventsPublication(fixture({source:"verified-weekly-game-archive"}),NOW),/non-daily/);
  assert.throws(()=>verifyEventsPublication(fixture({status:"unavailable"}),NOW),/Incomplete/);
  assert.throws(()=>verifyEventsPublication(fixture(),NOW,fixture({checkedAt:NOW+1000})),/older/);
});

test("writes only validated GitHub JSON; unchanged reimports are idempotent",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"losp-events-"));
  try{
    const output=join(dir,"events.json"),data=fixture();
    const urls=[];
    const fetchImpl=async url=>{
      urls.push(url);
      return new Response(JSON.stringify(data),{status:200,
        headers:{"content-type":"application/json"}});
    };
    const first=await publishEvents({fetchImpl,now:NOW,output,write:true});
    assert.equal(first.status,"written");
    const saved=JSON.parse(await readFile(output,"utf8"));
    assert.equal(saved.source,"verified-daily-game-events");
    assert.equal(saved.events.length,2);
    assert.ok(urls.every(url=>url.startsWith(SOURCE+"?_fresh=")));
    const second=await publishEvents({fetchImpl,now:NOW,output,write:true});
    assert.equal(second.status,"unchanged");
    const before=await readFile(output,"utf8");
    const stale=async()=>new Response(JSON.stringify(fixture({
      checkedAt:NOW-72*3600000
    })),{status:200});
    await assert.rejects(publishEvents({fetchImpl:stale,now:NOW,output,write:true}),/48h/);
    assert.equal(await readFile(output,"utf8"),before);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("never rewrites GitHub when HTTP 503 or catalogue incomplete",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"losp-events-fail-"));
  try{
    const output=join(dir,"events.json");
    await writeFile(output,JSON.stringify(fixture()));
    await assert.rejects(publishEvents({
      fetchImpl:async()=>new Response("",{status:503}),now:NOW,output,write:true
    }),/HTTP 503/);
    await assert.rejects(publishEvents({
      fetchImpl:async()=>new Response(JSON.stringify({
        ...fixture(),count:1
      }),{status:200}),now:NOW,output,write:true
    }),/Incomplete/);
    assert.equal(JSON.parse(await readFile(output,"utf8")).count,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
