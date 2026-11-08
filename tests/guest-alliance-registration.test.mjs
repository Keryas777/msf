import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {planGuestRegistration} from "../scripts/register-guest-alliance.mjs";

const get=path=>readFile(new URL("../"+path,import.meta.url),"utf8").then(JSON.parse);
const input={key:"another-us-team",name:"Another US Team",
  color:"#ffffff",roleId:"1568752859137318999"};

test("nouvel invité : deux registres dynamiques, couleur et rôle uniques",async()=>{
  const [a,g]=await Promise.all([get("docs/data/alliances.json"),get("docs/data/access-groups.json")]);
  const result=planGuestRegistration(a,g,input);
  assert.equal(result.changed,true);
  assert.equal(result.alliances.length,a.length+1);
  assert.equal(result.accessGroups.groups.length,g.groups.length+1);
  assert.deepEqual(result.alliances.at(-1),{
    key:input.key,name:input.name,group:input.key,color:"#FFFFFF",
    nameColor:"#FFFFFF",order:Math.max(...a.map(x=>x.order||0))+1,
    aliases:[input.name]});
  assert.deepEqual(result.accessGroups.groups.at(-1),{
    key:input.key,name:input.name,alliances:[input.key],
    roleIds:[input.roleId]});
  assert.deepEqual(result.alliances.slice(0,-1),a);
  assert.deepEqual(result.accessGroups.groups.slice(0,-1),g.groups);
  const again=planGuestRegistration(result.alliances,result.accessGroups,input);
  assert.equal(again.changed,false);
});
test("rôle déjà utilisé, collision de clé et valeurs dangereuses refusés",async()=>{
  const [a,g]=await Promise.all([get("docs/data/alliances.json"),get("docs/data/access-groups.json")]);
  const used=g.groups.find(x=>x.roleIds?.length)?.roleIds[0];
  assert.throws(()=>planGuestRegistration(a,g,{...input,roleId:used}),/discord-role-already-assigned/);
  assert.throws(()=>planGuestRegistration(a,g,{...input,key:"marines"}),/different-configuration/);
  for(const wrong of [
    {...input,name:"<script>alert(1)</script>"},
    {...input,key:"../alliance"},
    {...input,roleId:"123"},
    {...input,color:"red"}])
    assert.throws(()=>planGuestRegistration(a,g,wrong),/invalid-input/);
});
test("Questionable Propriety est isolée des autres groupes",async()=>{
  const [a,g]=await Promise.all([get("docs/data/alliances.json"),get("docs/data/access-groups.json")]);
  const q=a.find(x=>x.key==="questionable-propriety");
  const role=g.groups.find(x=>x.key==="questionable-propriety");
  assert.equal(q?.name,"Questionable Propriety");
  assert.equal(q?.color,"#FFFFFF");
  assert.equal(q?.nameColor,"#FFFFFF");
  assert.deepEqual(role?.alliances,["questionable-propriety"]);
  assert.deepEqual(role?.roleIds,["1568752859137318963"]);
  assert.equal(g.groups.filter(x=>(x.roleIds||[]).includes("1568752859137318963")).length,1);
});
