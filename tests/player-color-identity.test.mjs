import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const cases=[
  ["docs/war-counters.js","const normalizeKey","const FALLBACK_ALLIANCES","normalizeKey"],
  ["docs/app.js","function normalizeKey","function allianceHelper","normalizePlayerKey"],
  ["docs/war-rankings.js","function normalizeKey","function mergeAlliances","normalizeKey"],
  ["docs/evolution-classement.js","function normalizeKey","function allianceKey","normalizeKey"]
];
for(const [path,start,end,fn] of cases){
  test(path+" matches colored and plain player identities",()=>{
    const source=read(path),from=source.indexOf(start),to=source.indexOf(end,from);
    assert.ok(from>=0&&to>from,"normalizer must be present");
    const normalize=runInNewContext(source.slice(from,to)+"\n"+fn);
    assert.equal(normalize("<#FF0000>Caps"),normalize("Caps"));
    assert.equal(normalize("<color=red>Caps</color>"),normalize("Caps"));
    assert.notEqual(normalize("Caps"),normalize("Capitaine Aaron"));
  });
}
test("Counters keep alliance scope in player identity",()=>{
  const source=read("docs/war-counters.js");
  assert.match(source,/return allianceK && playerK \? allianceK \+ ":" \+ playerK : ""/);
});
