import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("hub cosmique : navigation et authentification", async () => {
  const [home, hub, counters, defenses] = await Promise.all([
    read("docs/home.html"), read("docs/cosmic.html"),
    read("docs/cosmic-counters.html"), read("docs/cosmic-defenses.html")
  ]);
  // En cours de validation : la rubrique ne doit pas encore être visible depuis l’accueil.
  assert.doesNotMatch(home, /cosmic(?:-counters|-defenses)?\.html/);
  const homeCss = await read("docs/home.css");
  assert.doesNotMatch(homeCss, /homeTile--cosmic/);
  assert.match(hub, /href="\.\/cosmic-counters\.html"/);
  assert.match(hub, /href="\.\/cosmic-defenses\.html"/);
  for (const page of [hub, counters, defenses]) assert.match(page, /auth-guard\.js/);
  assert.match(counters, /data-counter-mode="cosmic"/);
  assert.match(counters, /id="roomSelect"/);
});

test("catalogues cosmiques indépendants et six salles configurables", async () => {
  const config = JSON.parse(await read("docs/data/cosmic-config.json"));
  const counters = JSON.parse(await read("docs/data/cosmic-counters.json"));
  const defenses = JSON.parse(await read("docs/data/cosmic-defenses.json"));
  assert.equal(config.rooms.length, 6);
  assert.deepEqual(config.rooms.map(r => r.id), [1,2,3,4,5,6]);
  assert.ok(Array.isArray(counters));
  assert.ok(Array.isArray(defenses));
  for (const row of counters) {
    assert.ok(!row.room || config.rooms.some(r => r.id === row.room));
    assert.ok(row.def_family && row.def_variant && row.atk_team);
  }
  for (const row of defenses) {
    assert.ok(config.rooms.some(r => r.id === row.room));
    assert.equal(row.characters?.length, 5);
    assert.equal(new Set(row.characters).size, 5);
  }
});

test("reprise du moteur de contres sans bonus de guerre dans le mode cosmique", async () => {
  const engine = await read("docs/war-counters.js");
  assert.match(engine, /IS_COSMIC \? "\.\/data\/cosmic-counters\.json" : "\.\/data\/war-counters\.json"/);
  assert.match(engine, /if \(IS_COSMIC\) return rawPower;/);
  assert.match(engine, /filter\(isRoomRelevant\)\.filter\(isRealCounter\)/);
  assert.match(engine, /IS_COSMIC \? Promise\.resolve\(null\) : fetchJson\(FILES\.warSeasonRules\)/);
  assert.match(engine, /if \(IS_COSMIC \|\| !USAGE_LOGGER_URL\) return;/);
});

test("propositions : sauvegarde locale et partage, sans publication implicite", async () => {
  const code = await read("docs/cosmic-defenses.js");
  assert.match(code, /localStorage\.setItem\(DRAFT_KEY/);
  assert.match(code, /navigator\.share/);
  assert.match(code, /navigator\.clipboard/);
  assert.match(code, /proposition à vérifier|Proposition à vérifier/);
  assert.doesNotMatch(code, /method:\s*["']POST["']/);
});

test("identité Discord non éditable et suppression de la saisie source", async () => {
  const [html, js] = await Promise.all([
    read("docs/cosmic-defenses.html"), read("docs/cosmic-defenses.js")
  ]);
  assert.match(html, /id="proposalAuthorDisplay"/);
  assert.doesNotMatch(html, /<input[^>]+id="proposalAuthor"/);
  assert.doesNotMatch(html, /id="proposalSource"/);
  assert.doesNotMatch(js, /const proposalSource =/);
  assert.match(js, /session\?\.ok === true/);
  assert.match(js, /const author = discordAuthor/);
  assert.match(js, /"Défense de " \+ entry\.author/);
});
test("autocomplétion préfixe, validation par clic et portraits par salle", async () => {
  const [js, css] = await Promise.all([
    read("docs/cosmic-defenses.js"), read("docs/cosmic.css")
  ]);
  assert.match(js, /normalize\(character\.name\)\.startsWith\(query\)/);
  assert.match(js, /button\.addEventListener\("click"/);
  assert.match(js, /input\.dataset\.selectedId = character\.id/);
  assert.match(js, /renderSelectedPortraits\(section\)/);
  assert.match(js, /cosmicSelectedPortraits/);
  assert.match(css, /\.cosmicSuggestions\[hidden\]/);
  assert.match(css, /\.cosmicReadonlyField/);
});
