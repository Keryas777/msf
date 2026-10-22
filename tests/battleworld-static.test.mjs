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


test("Chaque fiche identifie la variante PVE du boss avec un portrait officiel", () => {
  const characters = JSON.parse(read("data/msf-characters.json"));
  const byId = new Map(characters.map(character => [character.id, character]));
  const expected = {
    destroyer: "PVE_Boss_Destroyer",
    maestro: "PVE_Boss_Maestro",
    sentry: "PVE_Boss_Sentry",
    knull: "PVE_Boss_Knull"
  };
  for (const entry of manifest.guides) {
    const guide = JSON.parse(read("data/battleworld/" + entry.file));
    assert.equal(guide.boss.characterId, expected[entry.id]);
    const character = byId.get(guide.boss.characterId);
    assert.ok(character, "Boss PVE absent du catalogue pour " + entry.id);
    assert.match(character.portraitUrl, /^https:\/\//);
  }
});

test("Le portrait est à gauche et le catalogue se charge sans dépendre des équipes", () => {
  const page = read("battleworld.html");
  const css = read("battleworld.css");
  const script = read("battleworld.js");
  assert.match(page, /id="bw-boss-portrait"/);
  assert.match(page, /id="bw-boss-portrait-fallback"/);
  assert.ok(page.indexOf('id="bw-boss-portrait"') < page.indexOf('id="bw-guide-title"'));
  assert.match(css, /\.bw-summary-layout\s*\{\s*display:grid;/);
  assert.match(css, /\.bw-boss-portrait\[hidden\]/);
  assert.match(script, /function renderBossPortrait\(/);
  assert.match(script, /await loadCharacterCatalog\(\)/);
  assert.doesNotMatch(script, /guideHasCharacters\(data\)/);
});

test("Le portrait conserve son cadrage et essaie la variante jouable après PVE", () => {
  const css = read("battleworld.css");
  const js = read("battleworld.js");
  const characters = JSON.parse(read("data/msf-characters.json"));
  const catalog = new Map(characters.map(row => [row.id.toLowerCase(), row]));
  assert.match(css, /\.bw-boss-portrait-frame\s*\{[^}]*padding:8px/s);
  assert.match(css, /\.bw-boss-portrait\s*\{[^}]*object-fit:contain;/s);
  assert.match(css, /object-position:center;/);

  // Exécuter réellement le constructeur de candidats extrait du JS de production.
  const begin = js.indexOf("  function getBossPortraitCandidates(boss) {");
  const end = js.indexOf("  function renderBossPortrait() {", begin);
  assert.ok(begin >= 0 && end > begin);
  const source = js.slice(begin, end);
  const buildCandidates = new Function(
    "charMap", "validHttpsImage",
    source + "\nreturn getBossPortraitCandidates;"
  )(catalog, url => {
    try { return typeof url === "string" && new URL(url).protocol === "https:"; }
    catch { return false; }
  });

  for (const bossId of ["destroyer", "maestro"]) {
    const guide = JSON.parse(read("data/battleworld/" + bossId + ".json"));
    const pveId = guide.boss.characterId;
    const playableId = pveId.replace(/^PVE_Boss_/, "");
    const pveUrl = catalog.get(pveId.toLowerCase()).portraitUrl;
    const playableUrl = catalog.get(playableId.toLowerCase()).portraitUrl;
    const urls = buildCandidates(guide.boss);
    assert.ok(urls.includes(pveUrl) && urls.includes(playableUrl), bossId);
    assert.ok(urls.indexOf(pveUrl) < urls.indexOf(playableUrl), "PVE prioritaire pour " + bossId);
  }

  assert.match(js, /bossPortrait\.onerror = \(\) => \{/);
  assert.match(js, /tryNext\(\);/);
  assert.match(js, /portraitState\.token\+\+/);
  assert.match(read("battleworld.html"), /battleworld\.js\?v=3/);
  assert.match(read("battleworld.html"), /battleworld\.css\?v=3/);
});
