import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("docs/war-attack-checker.js");

test("attack checker loads shared authorized roster source before rendering",()=>{
  const html=read("docs/war-attack-checker.html");
  assert.ok(html.indexOf("alliance-data.js")>=0);
  assert.ok(html.indexOf("alliance-data.js")<
    html.indexOf("war-attack-checker.js"));
  assert.match(source,/LoSPAllianceData\.load\(\{ joueurs: true, rosters: true \}\)/);
  assert.match(source,/LoSPAllianceData\.showWarnings\(sources\.warnings\)/);
});

test("attack checker never confuses two alliances with the same pseudo",()=>{
  const from=source.indexOf("  function buildRosterMap(data) {");
  const to=source.indexOf("  function getMatchingSeasonRule(",from);
  assert.ok(from>0&&to>from);
  const context={
    ROSTERS:new Map(),
    allianceSelect:{value:"marines"},
    allianceKey:value=>String(value||"").toLowerCase(),
    normalizeKey:value=>String(value||"").toLowerCase(),
    isAllianceAllowed:key=>["zeus","marines"].includes(key),
  };
  const api=runInNewContext(source.slice(from,to)+
    "\n({buildRosterMap,getPlayerRawPower})",context);
  api.buildRosterMap([
    {player:"Same",alliance:"zeus",chars:{blob:{power:900}}},
    {player:"Same",alliance:"marines",chars:{blob:{power:200}}},
    {player:"Restricted",alliance:"endgame-red",
      chars:{blob:{power:9900}}}
  ]);
  assert.equal(api.getPlayerRawPower("Same",["blob"]),200);
  context.allianceSelect.value="zeus";
  assert.equal(api.getPlayerRawPower("Same",["blob"]),900);
  assert.equal(context.ROSTERS.size,2);
});
