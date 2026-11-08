// Register a guest alliance in both static catalogues, without touching existing tenants.
// Used by the GitHub Actions onboarding workflow. No API or Scopely requests.
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const SLUG=/^[a-z][a-z0-9-]{1,63}$/;
const ROLE=/^[0-9]{16,22}$/;
const HEX=/^#[0-9A-Fa-f]{6}$/;
const NAME=/^[^\x00-\x1f\x7f<>]{1,120}$/;
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);

export function planGuestRegistration(alliances,access,{key,name,roleId,color}){
  if(!Array.isArray(alliances)||!isObject(access)||
     access.schemaVersion!==1||!Array.isArray(access.groups))
    throw Error("invalid-registries");
  if(typeof key!=="string"||!SLUG.test(key)||
     typeof name!=="string"||!NAME.test(name)||name.trim()!==name||
     typeof roleId!=="string"||!ROLE.test(roleId)||
     typeof color!=="string"||!HEX.test(color))
    throw Error("invalid-input");
  const shade=color.toUpperCase();
  if(new Set(alliances.map(a=>a.key)).size!==alliances.length||
     new Set(access.groups.map(g=>g.key)).size!==access.groups.length)
    throw Error("duplicate-registry-keys");
  const existingAlliance=alliances.find(a=>a.key===key);
  const existingGroup=access.groups.find(g=>g.key===key);
  if(existingAlliance||existingGroup){
    if(existingAlliance?.name===name&&existingAlliance?.group===key&&
       existingAlliance?.color?.toUpperCase()===shade&&
       existingAlliance?.nameColor?.toUpperCase()===shade&&
       existingGroup?.name===name&&
       JSON.stringify(existingGroup.alliances)==='["'+key+'"]'&&
       JSON.stringify(existingGroup.roleIds)==='["'+roleId+'"]')
      return {alliances,accessGroups:access,changed:false};
    throw Error("alliance-already-exists-with-different-configuration");
  }
  if(access.groups.some(g=>(g.roleIds||[]).includes(roleId)||
       Object.hasOwn(g.allianceRoles||{},roleId)))
    throw Error("discord-role-already-assigned");
  const existingKeys=new Set(alliances.map(a=>a.key));
  if(access.groups.some(g=>(g.alliances||[]).some(k=>!existingKeys.has(k))))
    throw Error("broken-existing-group-reference");
  const order=Math.max(0,...alliances.map(a=>Number.isSafeInteger(a.order)?a.order:0))+1;
  const row={key,name,group:key,color:shade,nameColor:shade,order,aliases:[name]};
  const group={key,name,alliances:[key],roleIds:[roleId]};
  return {alliances:[...alliances,row],
    accessGroups:{...access,groups:[...access.groups,group]},changed:true};
}

async function main(){
  if(process.argv.slice(2).join(" ")!=="--write")
    throw Error("Usage: node scripts/register-guest-alliance.mjs --write");
  const aPath=resolve("docs/data/alliances.json");
  const gPath=resolve("docs/data/access-groups.json");
  const [alliances,groups]=await Promise.all([
    readFile(aPath,"utf8").then(JSON.parse),
    readFile(gPath,"utf8").then(JSON.parse)
  ]);
  const result=planGuestRegistration(alliances,groups,{
    key:process.env.GUEST_KEY,name:process.env.GUEST_NAME,
    roleId:process.env.GUEST_ROLE_ID,color:process.env.GUEST_COLOR
  });
  if(!result.changed){
    console.log("Alliance déjà enregistrée avec les mêmes paramètres.");
    return;
  }
  const a=JSON.stringify(result.alliances,null,2)+"\n";
  const g=JSON.stringify(result.accessGroups,null,2)+"\n";
  JSON.parse(a);JSON.parse(g);
  await writeFile(aPath,a,"utf8");
  await writeFile(gPath,g,"utf8");
  console.log("Alliance invitée déclarée :",process.env.GUEST_KEY);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error("Enregistrement invité :",e.message);process.exitCode=1;});
