import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../docs/alliances.js", import.meta.url), "utf8");
const data = JSON.parse(await readFile(new URL("../docs/data/alliances.json", import.meta.url), "utf8"));

async function openAlliances(allowedAlliances) {
  const window = { LoSP_SESSION: { ok: true, allowedAlliances } };
  runInNewContext(script, {
    window,
    fetch: async () => Response.json(data)
  }, { filename: "docs/alliances.js" });
  await window.LoSPAlliances.loadAlliances();
  return window.LoSPAlliances;
}
function visibleKeys(helper) {
  return Array.from(helper.getKnownAlliances(), alliance => alliance.key);
}

test("membre LoSP : six alliances seulement", async () => {
  const helper = await openAlliances(["zeus", "athena", "kronos", "dionysos", "poseidon", "hades"]);
  assert.equal(visibleKeys(helper).length, 6);
  assert.equal(visibleKeys(helper).includes("marines"), false);
});

test("invités Marines et Endgame : scopes disjoints", async () => {
  const marines = await openAlliances(["marines"]);
  assert.deepEqual(visibleKeys(marines), ["marines"]);
  const endgame = await openAlliances(["endgame-revolution-red", "endgame-revolution-orange"]);
  assert.deepEqual(visibleKeys(endgame), ["endgamerevolutionred", "endgamerevolutionorange"]);
  assert.equal(endgame.getAllianceLabel("endgame-revolution-red"), "ENDGAME R-évolution");
  assert.equal(endgame.getAllianceLabel("endgame-revolution-orange"), "ENDGAME R-évolution");
  assert.equal(endgame.getAllianceMeta("ENDGAME R-évolution"), null);
  // UI aliases stay normalized; the Scopely/GitHub source IDs retain hyphens.
  assert.deepEqual(Array.from(endgame.getKnownAlliances(),x=>x.sourceKey),[
    "endgame-revolution-red","endgame-revolution-orange"
  ]);
});

test("administrateur : les neuf identifiants internes sont visibles", async () => {
  const helper = await openAlliances(data.map(a => a.key));
  assert.equal(visibleKeys(helper).length, 9);
  assert.ok(visibleKeys(helper).includes("endgamerevolutionred"));
  assert.ok(visibleKeys(helper).includes("endgamerevolutionorange"));
});
