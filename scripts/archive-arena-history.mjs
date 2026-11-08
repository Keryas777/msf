// Publish verified arena snapshots into append-only static Git history.
// Never overwrite a previously published date or fabricate missing captures.
import fs from "node:fs/promises";
import path from "node:path";
const root="docs/data/arena-history";
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&
  Number.isFinite(Date.parse(d+"T00:00:00Z"))&&
  new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
export function appendArenaIndex(index,snapshot){
  if(index?.version!==1||!Array.isArray(index.snapshots))
    throw Error("Invalid arena index");
  if(!validDay(snapshot?.date)||snapshot?.version!==1||
     !Array.isArray(snapshot.players)||!snapshot.players.length)
    throw Error("Invalid arena snapshot");
  if(index.snapshots.some(s=>s.date===snapshot.date))
    return {index,added:false};
  const file="snapshots/"+snapshot.date+".json";
  return {added:true,index:{...index,snapshots:
    [...index.snapshots,{date:snapshot.date,file,sourceDay:snapshot.sourceDay,
      attribution:snapshot.attribution}]
      .sort((a,b)=>a.date.localeCompare(b.date))}};
}
async function main(){
  const dir=process.argv.find(a=>a.startsWith("--dir="))?.slice(6)||
    ".tmp/arena-snapshots";
  const indexFile=path.join(root,"index.json");
  let index;
  try{index=JSON.parse(await fs.readFile(indexFile,"utf8"));}
  catch(e){if(e.code!=="ENOENT")throw e;
    index={version:1,kind:"losp-arena-history-index",snapshots:[]};}
  if(index.kind!=="losp-arena-history-index")throw Error("Invalid arena index kind");
  const files=(await fs.readdir(dir)).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  let added=0;
  for(const file of files){
    const snapshot=JSON.parse(await fs.readFile(path.join(dir,file),"utf8"));
    if(file!==snapshot.date+".json")throw Error("Arena filename mismatch");
    const next=appendArenaIndex(index,snapshot);
    if(!next.added)continue;
    const dest=path.join(root,"snapshots",file);
    await fs.mkdir(path.dirname(dest),{recursive:true});
    await fs.writeFile(dest,JSON.stringify(snapshot,null,2)+"\n",{flag:"wx"});
    index=next.index;added++;
  }
  if(added)await fs.writeFile(indexFile,JSON.stringify(index,null,2)+"\n");
  console.log("[arena] Permanent archive: "+added+" new day(s), "+index.snapshots.length+" total");
}
if(process.argv[1]?.endsWith("archive-arena-history.mjs"))
  main().catch(e=>{console.error(e);process.exitCode=1;});
