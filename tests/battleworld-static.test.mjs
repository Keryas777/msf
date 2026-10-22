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
  assert.match(read("battleworld.html"), /battleworld\.js\?v=6/);
  assert.match(read("battleworld.html"), /battleworld\.css\?v=4/);
});


test("Fallen Asgard documente les 27 missions, 3 mini-boss, bonus et Elite", () => {
  const guide = JSON.parse(read("data/battleworld/destroyer.json"));
  assert.equal(guide.zones.length, 3);
  assert.ok(guide.overview);
  assert.equal(guide.overview.eliteDebuffs.length, 3);
  guide.overview.eliteDebuffs.forEach(item => assert.equal(item.levels.length, 3));
  assert.ok(guide.overview.progression.length >= 3);
  assert.ok(guide.overview.tokens.length >= 3);
  assert.ok(guide.overview.rewards.length >= 4);

  let total = 0;
  for (const zone of guide.zones) {
    assert.equal(zone.nodes.length, 3);
    assert.equal(zone.eliteMissions.length, 3);
    assert.equal(zone.bonusMissions.length, 2);
    assert.ok(zone.miniboss && zone.miniboss.id === "mini-boss");
    const missions = [...zone.nodes, zone.miniboss, ...zone.eliteMissions, ...zone.bonusMissions];
    assert.equal(missions.length, 9);
    total += missions.length;
    assert.equal(new Set(missions.map(item => item.id)).size, 9);
    missions.forEach(item => {
      for (const field of ["restrictions","enemies","mechanics","objectives","strategy","avoid","instructions","teams","notes","warnings","sources"]) {
        assert.ok(Array.isArray(item[field]), zone.id + "/" + item.id + " missing " + field);
      }
      assert.ok(item.sources.some(source => source.url === "https://www.marvel.church/battleworld-fallen-asgard/"));
    });
  }
  assert.equal(total, 27);
  assert.equal(guide.boss.teams.length, 5);
  assert.ok(guide.boss.mechanics.length >= 12);
  assert.equal(guide.boss.baseSpeed, 100);
});

test("Équipes et sources : IDs jouables vérifiés, lacunes visibles, ancienne rotation conservée", () => {
  const guide = JSON.parse(read("data/battleworld/destroyer.json"));
  const ids = new Set(JSON.parse(read("data/msf-characters.json")).map(item => item.id));
  const sources = new Set();
  const all = guide.zones.flatMap(z => [...z.nodes, z.miniboss, ...z.eliteMissions, ...z.bonusMissions]);
  for (const item of [...all, guide.boss]) {
    for (const team of item.teams) {
      assert.ok(team.id && team.title);
      for (const id of team.characters || []) assert.ok(ids.has(id), "Unknown character " + id);
    }
    item.sources.forEach(source => sources.add(source.url));
  }
  assert.ok(sources.has("https://www.marvel.church/battleworld-fallen-asgard/"));
  const former = guide.zones[2].nodes[0];
  assert.deepEqual(former.restrictions, ["Tech uniquement (restriction modifiée, auparavant Tech ET Héros)."]);
  assert.equal(former.instructions.length, 0);
  assert.ok(former.historicalInstructions.length >= 7);
  assert.ok(guide.zones[0].bonusMissions[1].warnings.length > 0);
  for (const zone of guide.zones.slice(1)) {
    assert.equal(zone.bonusMissions.length, 2);
    assert.ok(zone.bonusMissions.every(m => !m.teams.length && m.warnings.length));
  }
});

test("Affichage des rubriques et compatibilité des boss historiques", () => {
  const js = read("battleworld.js");
  const html = read("battleworld.html");
  assert.match(js, /function renderMissionGroup\(/);
  assert.match(js, /function renderOverview\(/);
  assert.match(js, /historicalInstructions/);
  assert.match(js, /renderMissionGroup\("Missions Standard"/);
  assert.match(js, /renderMissionGroup\("Mini-boss"/);
  assert.match(js, /renderMissionGroup\("Missions Élite"/);
  assert.match(js, /renderMissionGroup\("Missions Bonus"/);
  assert.match(js, /"Les stratégies contre ce boss sont à compléter/);
  assert.match(html, /battleworld\.js\?v=5/);
  assert.match(html, /battleworld\.css\?v=4/);
  for (const name of ["knull", "sentry", "maestro"]) {
    const archived = JSON.parse(read("data/battleworld/" + name + ".json"));
    assert.equal(Object.hasOwn(archived, "zones"), false);
  }
});

test("Tous les panneaux de mission commencent repliés, y compris le premier", () => {
  const script = read("battleworld.js");
  const begin = script.indexOf("  function makeMissionDetails(item) {");
  const end = script.indexOf("  function renderOverview() {", begin);
  assert.ok(begin >= 0 && end > begin, "Constructeurs de mission absents");
  const missionFunctions = script.slice(begin, end);
  assert.doesNotMatch(missionFunctions, /details\.open\s*=/);
  assert.doesNotMatch(missionFunctions, /openFirst/);
  assert.match(missionFunctions, /items\.forEach\(item => group\.append\(makeMissionDetails\(item\)\)\)/);
  assert.doesNotMatch(script, /renderMissionGroup\("Missions Standard"[^\n]*true\)/);
});

test("Toutes les équipes documentées présentent cinq portraits, avec variantes illustratives identifiées", () => {
  const guide = JSON.parse(read("data/battleworld/destroyer.json"));
  const characterIds = new Set(JSON.parse(read("data/msf-characters.json")).map(row => row.id));
  const roster = JSON.parse(read("data/teams.json"));
  const documented = [
    ...guide.zones.flatMap(zone => [...zone.nodes, zone.miniboss, ...zone.eliteMissions, ...zone.bonusMissions].flatMap(m => m.teams)),
    ...guide.boss.teams
  ];
  assert.equal(documented.length, 33);
  const verified = new Map(roster.map(team => [team.team, team.characters]));
  const expectedRosters = [
    ["z1-standard3", "Insidious Six"],
    ["z1-miniboss", "Eternels Intemporels"],
    ["z2-standard2", "Insidious Six"],
    ["z2-miniboss", "Eternels Intemporels"],
    ["destroyer-timeless", "Eternels Intemporels"],
    ["destroyer-daring", "Guerriers Audacieux"]
  ];
  for (const [id, name] of expectedRosters) {
    const entry = documented.find(t => t.id === id);
    assert.deepEqual(entry.characters, verified.get(name), id + " ne correspond pas au roster LoSP");
  }
  let illustrative = 0;
  for (const team of documented) {
    const members = team.illustrativeCharacters || team.characters;
    assert.equal(members.length, 5, team.id + " doit afficher cinq personnages");
    assert.equal(new Set(members).size, 5, team.id + " contient des doublons");
    for (const member of members) assert.ok(characterIds.has(member), team.id + " : ID inconnu " + member);
    if (team.illustrativeCharacters) {
      illustrative++;
      assert.ok(team.characters.length > 0 && team.characters.length < 5);
      assert.ok(team.notes.some(note => /non confirmée|non confirmé|ne précise pas/.test(note)), team.id);
    }
  }
  assert.equal(illustrative, 3, "Les trois hybrides doivent rester explicitement illustratifs");
  const script = read("battleworld.js");
  assert.match(script, /illustrativeCharacters/);
  assert.match(script, /Composition illustrative/);
  assert.match(read("battleworld.html"), /battleworld\.js\?v=5/);
});

test("Les 27 missions ont chacune un unique bloc éditorial de conseils, sans perte des champs sources", () => {
  const guide = JSON.parse(read("data/battleworld/destroyer.json"));
  const missions = guide.zones.flatMap(zone =>
    [...zone.nodes, zone.miniboss, ...zone.eliteMissions, ...zone.bonusMissions]
  );
  assert.equal(missions.length, 27);
  const signatures = new Set();
  for (const item of missions) {
    assert.ok(Array.isArray(item.combatGuide) && item.combatGuide.length, item.title);
    assert.ok(item.combatGuide.every(line => typeof line === "string" && line.trim().length > 0), item.title);
    assert.equal(new Set(item.combatGuide).size, item.combatGuide.length, "Conseil répété : " + item.title);
    for (const field of ["restrictions", "enemies", "objectives", "strategy", "instructions", "teams", "sources"]) {
      assert.ok(Array.isArray(item[field]), "Les données originales doivent rester disponibles : " + field);
    }
    signatures.add(item.title);
  }
  assert.equal(signatures.size, 27);
  assert.ok(guide.zones[0].nodes[0].combatGuide.some(line => line.includes("Vahl")));
  assert.ok(guide.zones[0].bonusMissions[0].combatGuide.some(line => line.includes("Ultron")));
  assert.ok(guide.zones[1].miniboss.combatGuide.some(line => line.includes("Rage")));
  assert.ok(guide.zones[2].nodes[0].combatGuide.some(line => line.includes("Ancienne rotation")));
  assert.equal(guide.zones[2].nodes[0].historicalInstructions.length, 7);
  assert.ok(guide.zones[1].bonusMissions.every(m => m.combatGuide.some(s => s.includes("document"))));
});

test("Une mission compacte affiche Restriction et Conseils, sans répéter Ennemis/Objectifs/Stratégie", () => {
  const script = read("battleworld.js");
  const start = script.indexOf("  function renderFields(parent, item) {");
  const end = script.indexOf("\n\n  // Les boss disposent", start);
  assert.ok(start >= 0 && end > start);
  const labels = [];
  const sectionList = (_parent, label, items) => {
    if (!Array.isArray(items) || !items.length) return false;
    labels.push(label);
    return true;
  };
  const renderFields = new Function(
    "sectionList", "teamsSection", "sourcesSection",
    script.slice(start, end) + "\nreturn renderFields;"
  )(sectionList, () => true, () => true);
  const guide = JSON.parse(read("data/battleworld/destroyer.json"));
  for (const zone of guide.zones) {
    for (const mission of [...zone.nodes, zone.miniboss, ...zone.eliteMissions, ...zone.bonusMissions]) {
      labels.length = 0;
      assert.equal(renderFields({}, mission), true);
      const expected = mission.restrictions.length ? ["Restrictions", "Conseils de combat"] : ["Conseils de combat"];
      assert.deepEqual(labels, expected, mission.title);
    }
  }
  assert.match(read("battleworld.html"), /battleworld\.js\?v=6/);
  // Le moteur des fiches boss historiques reste rétrocompatible avec leurs anciens champs.
  assert.match(script.slice(start, end), /\["enemies", "Ennemis"\]/);
});
