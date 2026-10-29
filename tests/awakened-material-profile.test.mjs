import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../docs/historique-personnages-profile-codex.js",import.meta.url),"utf8");
const img="https://assets.marvelstrikeforce.com/imgs/ARCHANGEL_PASSIVE_aabbccdd.png";
const materials=[
  {id:"ABILITY_MATERIAL_UNIQUE_ABILITY_MAT_ARCHANGEL_PASSIVE",
    characterId:"ARCHANGEL",abilityType:"PASSIVE",name:"Archangel Awakened",iconUrl:img},
  {id:"ABILITY_MATERIAL_UNIQUE_ABILITY_MAT_NEWCHARACTER_SPECIAL",
    characterId:"NEWCHARACTER",abilityType:"SPECIAL",name:"New Awakening",iconUrl:
    "https://assets.marvelstrikeforce.com/imgs/NEW_SPECIAL_aabbccdd.png"}
];
function fixture(payload={schemaVersion:1,status:"ok",materials}){
  const calls=[];
  const window={LoSPProfileData:{esc:s=>String(s).replace(/&/g,"&amp;")
    .replace(/</g,"&lt;").replace(/>/g,"&gt;"),groupTraits:()=>[]}};
  const fetch=async url=>{
    calls.push(url);
    return {ok:true,json:async()=>payload};
  };
  runInNewContext(source,{window,fetch,URL});
  return {api:window.LoSPProfileCodex,calls};
}
const shard={abilities:[
  {id:"a",type:"basic",typeLabel:"Basique",name:"Basic",iconUrl:""},
  {id:"b",type:"passive",typeLabel:"Passive",name:"Passive — Aura protectrice",iconUrl:""}
]};
test("fetches public catalog lazily and matches character IDs without a hardcoded list",async()=>{
  const f=fixture();
  const rows=await f.api.getAwakenedMaterials("Archangel");
  assert.equal(rows.length,1);
  assert.equal(rows[0].abilityType,"PASSIVE");
  assert.equal((await f.api.getAwakenedMaterials("NewCharacter")).length,1);
  assert.equal(f.calls.length,1,"one catalog read shared across characters");
  assert.match(f.calls[0],/\/api\/public\/awakened-materials$/);
});
test("renders separate MATERIAL icon beside corresponding ability, without replacing skill icon",()=>{
  const f=fixture();
  const html=f.api.renderAbilities(shard,materials.filter(x=>x.characterId==="ARCHANGEL"));
  assert.equal((html.match(/profileAwakenedMaterial/g)||[]).length,1);
  assert.match(html,/ARCHANGEL_PASSIVE_aabbccdd/);
  assert.match(html,/Matériau d'éveil/);
  assert.match(html,/profileAbilityIcon/);
  assert.match(html,/Basic/);
});
test("untrusted image or different character does not display",()=>{
  const f=fixture();
  const html=f.api.renderAbilities(shard,[
    {characterId:"ARCHANGEL",abilityType:"PASSIVE",
      name:"Tracker",iconUrl:"https://evil.test/icon.png"}
  ]);
  assert.doesNotMatch(html,/evil.test/);
  assert.doesNotMatch(html,/profileAwakenedMaterial/);
});
test("missing material catalog does not remove official abilities",async()=>{
  const f=fixture({schemaVersion:0,status:"unavailable",materials:[]});
  await assert.rejects(f.api.getAwakenedMaterials("Archangel"),/invalide/);
  const html=f.api.renderAbilities(shard);
  assert.match(html,/Basic/);
  assert.match(html,/Passive/);
  assert.doesNotMatch(html,/Matériau d'éveil/);
});

test("short French awakened-material captions replace long English names for all types",()=>{
  const f=fixture();
  const types=[
    ["basic","Basique","BASIC"],
    ["special","Spécial","SPECIAL"],
    ["ultimate","Ultime","ULTIMATE"],
    ["passive","Passif","PASSIVE"]
  ];
  const abilities=types.map(([type,label])=>({
    id:"abl_"+type,type,typeLabel:label,name:"Capacité "+label,iconUrl:""
  }));
  const icons=types.map(([,label,abilityType])=>({
    abilityType,
    iconUrl:img,
    name:"Adam Warlock's "+abilityType+" Awakened Ability Material"
  }));
  const html=f.api.renderAbilities({abilities},icons);
  for(const [,label] of types)
    assert.match(html,new RegExp("Matériau d'éveil · "+label+"<\\/span>"));
  assert.equal((html.match(/profileAwakenedMaterial/g)||[]).length,4);
  assert.doesNotMatch(html,/Adam Warlock's|Awakened Ability Material/);
  assert.match(html,/profileAbilityIcon/);
});

test("older Codex shards and roster/evolution displays consistently use Spécial and Passif",()=>{
  const f=fixture();
  const html=f.api.renderAbilities({abilities:[
    {id:"one",type:"special",typeLabel:"Spéciale",
      name:"Spéciale — Décharge affaiblissante",iconUrl:""},
    {id:"two",type:"passive",typeLabel:"Passive",
      name:"Passive — Aura protectrice",iconUrl:""}
  ]});
  assert.match(html,/Spéciel — Décharge affaiblissante/);
  assert.match(html,/Passif — Aura protectrice/);
  assert.doesNotMatch(html,/Spéciale —|Passive —/);
  const roster=readFileSync(new URL("../docs/app.js",import.meta.url),"utf8");
  const evolution=readFileSync(new URL("../docs/evolution.js",import.meta.url),"utf8");
  assert.match(roster,/key: "special", label: "Spécial"/);
  assert.match(roster,/key: "passive", label: "Passif"/);
  assert.match(evolution,/\["special", "Spécial"\]/);
  assert.match(evolution,/\["passive", "Passif"\]/);
  assert.doesNotMatch(roster,/label: "(?:Spéciale|Passive)"/);
  assert.doesNotMatch(evolution,/\["(?:special|passive)", "(?:Spéciale|Passive)"\]/);
});
