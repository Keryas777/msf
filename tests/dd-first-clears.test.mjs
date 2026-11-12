import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
const script=new URL("../scripts/update-dd-first-clears.mjs",import.meta.url).pathname;
test("DD first-clear observations survive publications and do not invent baseline dates",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"dd-first-"));
 const write=async(name,data)=>writeFile(path.join(dir,name),JSON.stringify(data));
 const run=()=>execFileSync(process.execPath,[script],{env:{...process.env,DATA_DIR:dir}});
 const row=(stars)=>({alliance:"zeus",player:"Alpha",playerKey:"alpha",chars:stars?{annihilus:{yellowStars:stars,redStars:stars>=7?4:2}}:{}});
 try{
  await write("dark-dimensions.json",{dimensions:[{key:"dd9",completionRule:{characterId:"Annihilus",tiers:[{passages:1,minYellowStars:5,minRedStars:2}]}}]});
  await write("rosters-meta.json",{updatedAt:"2026-11-12T02:00:00Z"});
  await write("rosters.json",[row(0),{alliance:"zeus",player:"Already",chars:{annihilus:{yellowStars:7,redStars:4}}}]);
  run();
  let data=JSON.parse(await readFile(path.join(dir,"dd-first-clears.json"),"utf8"));
  assert.equal(data.observations.dd9["zeus:already"].firstClearObservedAt,null);
  await write("rosters-meta.json",{updatedAt:"2026-11-12T14:00:00Z"});
  await write("rosters.json",[row(5),{alliance:"zeus",player:"Already",chars:{annihilus:{yellowStars:7,redStars:4}}}]);
  run();run();
  data=JSON.parse(await readFile(path.join(dir,"dd-first-clears.json"),"utf8"));
  assert.equal(data.observations.dd9["zeus:alpha"].firstClearObservedAt,"2026-11-12T14:00:00Z");
  assert.equal(data.observations.dd9["zeus:already"].firstClearObservedAt,null);
 }finally{await rm(dir,{recursive:true,force:true})}
});
