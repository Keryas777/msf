import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const read = path => fs.readFileSync(new URL("../docs/" + path, import.meta.url), "utf8");
const manifest = JSON.parse(read("data/battleworld/index.json"));

test("Battleworld conserve quatre guides avec Destructeur actif", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.guides.map(item => item.id), ["destroyer", "maestro", "sentry", "knull"]);
  assert.equal(manifest.activeGuideId, "destroyer");
  assert.equal(new Set(manifest.guides.map(item => item.id)).size, manifest.guides.length);
});

test("Destructeur possède trois zones de trois nodes et son guide boss", () => {
  const entry = manifest.guides.find(item => item.id === manifest.activeGuideId);
  const guide = JSON.parse(read("data/battleworld/" + entry.file));
  assert.equal(guide.id, "destroyer");
  assert.equal(guide.boss.name, entry.name);
  assert.equal(guide.zones.length, 3);
  guide.zones.forEach((zone, index) => {
    assert.equal(zone.id, "zone-" + (index + 1));
    assert.equal(zone.nodes.length, 3);
    zone.nodes.forEach((node, offset) => {
      assert.equal(node.id, "node-" + (offset + 1));
      for (const field of ["restrictions", "enemies", "mechanics", "objectives", "strategy", "avoid", "instructions", "teams", "sources"]) {
        assert.ok(Array.isArray(node[field]), field + " manquant pour " + guide.id);
      }
    });
  });
});

test("Knull, Sentry et Maestro ne contiennent que la technique sur le boss", () => {
  for (const id of ["knull", "sentry", "maestro"]) {
    const entry = manifest.guides.find(item => item.id === id);
    assert.ok(entry, id + " absent de l'index");
    const guide = JSON.parse(read("data/battleworld/" + entry.file));
    assert.equal(guide.id, id);
    assert.equal(guide.boss.name, entry.name);
    assert.equal(Object.hasOwn(guide, "zones"), false, "Les zones doivent disparaître de " + id);
    for (const field of ["mechanics", "objectives", "strategy", "avoid", "instructions", "teams", "sources"]) {
      assert.ok(Array.isArray(guide.boss[field]), field + " manquant pour " + id);
    }
  }
});

test("Battleworld n'ajoute pas de lien à l'accueil, mais reste accessible via URL directe", () => {
  const home = read("home.html");
  const homeCss = read("home.css");
  const page = read("battleworld.html");
  const script = read("battleworld.js");
  const css = read("battleworld.css");
  assert.doesNotMatch(home, /href=["']\.\/battleworld\.html/);
  assert.doesNotMatch(homeCss, /\.homeBattleworld/);
  assert.match(page, /auth-guard\.js/);
  assert.match(page, /battleworld\.css/);
  assert.match(page, /battleworld\.js/);
  assert.match(script, /data\/battleworld\/index\.json/);
  assert.match(script, /data\/msf-characters\.json/);
  assert.match(script, /tabBar\.hidden = !hasZones/);
  assert.match(script, /if \(!hasZones\) activeTab = "boss"/);
  assert.match(css, /\.bw-tabs\[hidden\]\s*\{\s*display:none;/);
  execFileSync(process.execPath, ["--check", new URL("../docs/battleworld.js", import.meta.url).pathname]);
});
