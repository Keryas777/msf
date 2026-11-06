import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=file=>readFile(new URL("../docs/"+file,import.meta.url),"utf8");

test("every browser roster consumer is switched off the consolidated roster file",async()=>{
  const scripts=["app.js","iso.js","joueur.js","evolution.js",
    "war-attack-checker.js","war-counters.js",
    "historique-personnages-profile.js","alliance-data.js"];
  for(const file of scripts) {
    const code=await read(file);
    assert.doesNotMatch(code,/fetchJson\(FILES\.rosters\)/,file);
    assert.doesNotMatch(code,/fetchData\("rosters\.json"\)/,file);
    assert.doesNotMatch(code,/publicJson\("rosters"\)/,file);
    assert.doesNotMatch(code,/\.\/data\/rosters\.json/,file);
  }
});
test("each page installs the shared roster reader before its consumers",async()=>{
  for(const page of ["index","iso","joueur","evolution",
    "war-attack-checker","historique-personnages"]){
    const html=await read(page+".html");
    assert.ok(html.includes("roster-loader.js"),page);
    const consumer=page==="index"?"alliance-data.js":
      page==="historique-personnages"?"historique-personnages-profile.js":
      page==="war-attack-checker"?"war-attack-checker.js":
      page==="evolution"?"evolution.js":
      page==="joueur"?"joueur.js":"alliance-data.js";
    assert.ok(html.indexOf("roster-loader.js")<html.indexOf(consumer),page);
  }
});
test("mono-alliance viewers use the current authorized selection",async()=>{
  const iso=await read("iso.js");
  const player=await read("joueur.js");
  const attack=await read("war-attack-checker.js");
  const evolution=await read("evolution.js");
  for(const [file,code] of [["iso",iso],["joueur",player],
      ["war-attack-checker",attack],["evolution",evolution]]){
    assert.match(code,/LoSPRosterLoader\.load\(/,file);
  }
  assert.match(attack,/allianceKey\(allianceSelect\?\.value\) \+ ":" \+ normalizeKey\(player\)/);
  assert.match(iso,/ROSTER_ISO_MAP\.set\(pKey, out\)/);
  assert.match(player,/generation !== selectedRosterGeneration/);
});
test("multi-alliance ranking loads only the permitted subset and preserves player identities",async()=>{
  const shared=await read("alliance-data.js");
  const team=await read("app.js");
  const profile=await read("historique-personnages-profile.js");
  assert.match(shared,/rosterAlliances=null/);
  assert.match(shared,/LoSPRosterLoader\.loadMany\(rosterKeys\)/);
  assert.match(team,/rosterIdentity\(r\.alliance, r\.player\)/);
  assert.match(profile,/LoSPRosterLoader\.loadMany\(/);
  assert.match(profile,/state\.alliances\.map\(a => a\.key\)/);
});
