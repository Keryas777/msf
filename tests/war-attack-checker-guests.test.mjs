import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("docs/war-attack-checker.js");

test("attack checker retains lazy, authorized per-alliance roster loader",()=>{
  const html=read("docs/war-attack-checker.html");
  assert.ok(html.indexOf("roster-loader.js")>=0);
  assert.ok(html.indexOf("roster-loader.js")<
    html.indexOf("war-attack-checker.js"));
  assert.match(source,/LoSPRosterLoader\.load\(key\)/);
  assert.doesNotMatch(source,/fetchJson\(FILES\.rosters\)/);
});

test("attack checker keeps same pseudonym powers separate by alliance",()=>{
  const from=source.indexOf("  function buildRosterMap(data, alliance) {");
  const to=source.indexOf("  function getMatchingSeasonRule(",from);
  assert.ok(from>0&&to>from);
  const context={
    ROSTERS:new Map(),
    allianceSelect:{value:"marines"},
    allianceKey:value=>String(value||"").toLowerCase(),
    normalizeKey:value=>String(value||"").toLowerCase()
  };
  const api=runInNewContext(source.slice(from,to)+
    "\n({buildRosterMap,getPlayerRawPower})",context);
  api.buildRosterMap([{player:"Same",alliance:"marines",
    chars:{blob:{power:200}}}], "marines");
  assert.equal(api.getPlayerRawPower("Same",["blob"]),200);
  context.allianceSelect.value="zeus";
  api.buildRosterMap([{player:"Same",alliance:"zeus",
    chars:{blob:{power:900}}}], "zeus");
  assert.equal(api.getPlayerRawPower("Same",["blob"]),900);
  context.allianceSelect.value="marines";
  assert.equal(api.getPlayerRawPower("Same",["blob"]),0,
    "stale character powers must not leak across a newly selected alliance");
});
test("attack checker does not present inferred results with absent roster",()=>{
  assert.match(source,
    /if \(!ROSTERS\.has\(allianceKey\(allianceSelect\?\.value\) \+ ":" \+ normalizeKey\(player\)\)\)/);
  assert.match(source,/Roster non partagé ou indisponible/);
});
