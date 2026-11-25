import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const catalog=JSON.parse(readFileSync(new URL("../docs/data/msf-resource-catalog.json",import.meta.url),"utf8"));
const byId=new Map(catalog.items.map(item=>[item.id,item]));

test("central resource catalog has unique IDs and French-facing labels",()=>{
  assert.equal(catalog.schemaVersion,1);
  assert.ok(catalog.items.length>0);
  assert.equal(byId.size,catalog.items.length,"resource identifiers must be unique");
  for(const item of catalog.items){
    assert.ok(item.id,"each item needs a stable game ID");
    assert.ok(item.names?.fr,"player-facing item names must be French");
    assert.ok(item.categoryLabelFr,"player-facing categories must be French");
  }
});

test("training modules use the archived official IDs, names and icons",()=>{
  const expected=[
    ["CONSUMABLE_XPLVL20","L1 Training Module",1,"https://assets.marvelstrikeforce.com/imgs/ICON_CONSUMABLE_XPLVL20_bcaf9784.png"],
    ["CONSUMABLE_XPLVL40","L2 Training Module",2,"https://assets.marvelstrikeforce.com/imgs/ICON_CONSUMABLE_XPLVL40_c4fc9554.png"],
    ["CONSUMABLE_XPLVL60","L3 Training Module",3,"https://assets.marvelstrikeforce.com/imgs/ICON_CONSUMABLE_XPLVL60_94cb6207.png"],
    ["CONSUMABLE_XPLVL80","L4 Training Module",4,"https://assets.marvelstrikeforce.com/imgs/ICON_CONSUMABLE_XPLVL80_4ae2e7af.png"]
  ];
  for(const [id,name,rank,icon] of expected){
    const item=byId.get(id);
    assert.ok(item);assert.equal(item.names.en,name);assert.equal(item.rank,rank);assert.equal(item.icon,icon);
    assert.equal(item.sourceKind,"official-public-game-definition");
  }
});

test("ISO-8 ion IDs are distinct from crystal inventory mappings",()=>{
  const expected=[
    ["ISO8-TIER-0-CURRENCY","T1 Ions",1,undefined],
    ["ISO8-TIER-1-A-CURRENCY","T2 Level 1 Ions",2,1],
    ["ISO8-TIER-1-B-CURRENCY","T2 Level 4 Ions",2,4],
    ["ISO8-TIER-1-C-CURRENCY","T2 Level 5 Ions",2,5],
    ["ISO8-TIER-2-A-CURRENCY","T3 Level 1 Ions",3,1],
    ["ISO8-TIER-2-B-CURRENCY","T3 Level 4 Ions",3,4],
    ["ISO8-TIER-2-C-CURRENCY","T3 Level 5 Ions",3,5],
    ["ISO8-TIER-3-A-CURRENCY","T4 Level 1 Ions",4,1]
  ];
  for(const [id,name,tier,level] of expected){
    const item=byId.get(id);
    assert.ok(item);assert.equal(item.names.en,name);assert.equal(item.iso8Ion.tier,tier);
    assert.equal(item.iso8Ion.upgradeLevel,level);assert.equal(item.sourceKind,"official-public-game-definition");
  }
  assert.equal(catalog.iso8CrystalMatrix.status,"unavailable");
  assert.deepEqual(catalog.iso8CrystalMatrix.items,[]);
  assert.equal(catalog.items.some(item=>item.iso8Crystal),false,"no unverified crystal properties may enter the catalog");
});

test("legacy gold and core mappings are not presented as new official definitions",()=>{
  for(const id of ["SC","HC"]){
    const item=byId.get(id);assert.ok(item);
    assert.equal(item.sourceKind,"existing-planner-resource-mapping");
    assert.notEqual(item.sourceKind,"official-public-game-definition");
  }
  assert.equal(catalog.localization.fr.officialScopelyFrenchClaimed,false);
});
