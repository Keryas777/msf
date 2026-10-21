import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const read = path => fs.readFileSync(new URL("../docs/" + path, import.meta.url), "utf8");
const manifest = JSON.parse(read("data/battleworld/index.json"));

test("Battleworld liste quatre boss avec un seul guide actif", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.guides.map(item => item.id), ["destroyer", "maestro", "sentry", "knull"]);
  assert.equal(manifest.activeGuideId, "destroyer");
  assert.equal(new Set(manifest.guides.map(item => item.id)).size, manifest.guides.length);
});

test("chaque boss possède ses neuf nodes et son espace boss indépendants", () => {
  for (const entry of manifest.guides) {
    assert.match(entry.file, /^[a-z0-9-]+\.json$/);
    const guide = JSON.parse(read("data/battleworld/" + entry.file));
    assert.equal(guide.id, entry.id);
    assert.equal(guide.boss.name, entry.name);
    assert.equal(guide.zones.length, 3);
    guide.zones.forEach((zone, index) => {
      assert.equal(zone.id, "zone-" + (index + 1));
      assert.equal(zone.nodes.length, 3);
      zone.nodes.forEach((node, offset) => {
        assert.equal(node.id, "node-" + (offset + 1));
        for (const field of ["restrictions", "enemies", "mechanics", "objectives", "strategy", "avoid", "instructions", "teams", "sources"]) {
          assert.ok(Array.isArray(node[field]), field + " manquant pour " + entry.id);
        }
      });
    });
    for (const field of ["mechanics", "objectives", "strategy", "avoid", "instructions", "teams", "sources"]) {
      assert.ok(Array.isArray(guide.boss[field]), field + " manquant pour " + entry.id);
    }
  }
});

test("Battleworld est accessible, protégé et piloté par JSON", () => {
  const home = read("home.html");
  const page = read("battleworld.html");
  const script = read("battleworld.js");
  assert.match(home, /href="\.\/battleworld\.html"/);
  assert.match(page, /auth-guard\.js/);
  assert.match(page, /battleworld\.css/);
  assert.match(page, /battleworld\.js/);
  assert.match(script, /data\/battleworld\/index\.json/);
  assert.match(script, /data\/msf-characters\.json/);
  execFileSync(process.execPath, ["--check", new URL("../docs/battleworld.js", import.meta.url).pathname]);
});
