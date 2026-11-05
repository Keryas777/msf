// Canonical publication of the verified daily MSF events catalogue to GitHub Pages.
// The file docs/data/evenements-snapshot.json is the published source, NOT an
// offline/legacy fallback. Only the public verified Worker projection is read.
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const OUTPUT="docs/data/evenements-snapshot.json";
export const SOURCE="https://losp-roster-service.deliriousfan7.workers.dev/api/public/events";
const MAX_AGE=48*3600000,MAX_BYTES=3_000_000;
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const isTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
export function verifyEventsPublication(doc,now=Date.now(),previous=null){
  if(!isObject(doc)||doc.schemaVersion!==1||doc.status!=="ok"||
     doc.source!=="verified-daily-game-events"||
     !Number.isSafeInteger(doc.total)||doc.total<1||doc.total>1000||
     doc.count!==doc.total||doc.events?.length!==doc.total||
     doc.pages!==Math.ceil(doc.total/100)||
     !isTime(doc.updatedAt))
    throw Error("Incomplete or non-daily events source: refusing publication");
  const age=now-Date.parse(doc.updatedAt);
  if(age< -300000||age>=MAX_AGE)
    throw Error("Events source is older than 48h or dated in the future");
  if(isTime(previous?.updatedAt)&&
     Date.parse(previous.updatedAt)>Date.parse(doc.updatedAt))
    throw Error("Refusing older events data than GitHub");
  const ids=new Set();
  for(const event of doc.events){
    if(!isObject(event)||!(/^[a-f0-9]{24}$/).test(event.id||"")||
       ids.has(event.id)||!Number.isSafeInteger(event.startTime)||
       !Number.isSafeInteger(event.endTime)||event.endTime<=event.startTime||
       typeof event.type!=="string"||event.type.length<1||
       event.type.length>50)
      throw Error("Invalid event or duplicate event ID");
    ids.add(event.id);
  }
  if(!["fr","en"].includes(doc.locale)||
     typeof doc.localizationStatus!=="string")
    throw Error("Invalid event localization");
  // Use one stable JSON representation; only official projected public fields.
  return {...doc};
}

async function readPrevious(path){
  try{return JSON.parse(await readFile(path,"utf8"));}
  catch(error){
    if(error.code==="ENOENT")return null;
    throw Error("Existing events JSON is corrupt: refuse overwrite");
  }
}
export async function publishEvents({fetchImpl=fetch,now=Date.now(),
  output=OUTPUT,write=false}={}){
  const url=new URL(SOURCE);
  url.searchParams.set("_fresh",String(now));
  const response=await fetchImpl(url.toString(),{method:"GET",cache:"no-store",
    redirect:"error",signal:AbortSignal.timeout(20000),
    headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("Events API failed HTTP "+response.status);
  if(Number(response.headers?.get("content-length")||0)>MAX_BYTES)
    throw Error("Events API response too large");
  const body=await response.text();
  if(Buffer.byteLength(body,"utf8")>MAX_BYTES)throw Error("Events response too large");
  const path=resolve(output);
  const previous=await readPrevious(path);
  const verified=verifyEventsPublication(JSON.parse(body),now,previous);
  const next=JSON.stringify(verified,null,2)+"\n";
  const old=previous===null?null:await readFile(path,"utf8");
  if(old===next)return {status:"unchanged",count:verified.count,updatedAt:verified.updatedAt};
  if(write)await writeFile(path,next,"utf8");
  return {status:write?"written":"dry-run",count:verified.count,updatedAt:verified.updatedAt};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  publishEvents({write:process.argv.includes("--write")}).then(result=>
    console.log("GitHub events publication:",JSON.stringify(result))).catch(error=>{
      console.error("GitHub events publication blocked:",error.message);
      process.exitCode=1;
    });
}
