import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("hub cosmique : navigation et authentification", async () => {
  const [home, hub, counters, defenses] = await Promise.all([
    read("docs/home.html"), read("docs/cosmic.html"),
    read("docs/cosmic-counters.html"), read("docs/cosmic-defenses.html")
  ]);
  const propose = await read("docs/cosmic-defense-propose.html");
  // En cours de validation : la rubrique ne doit pas encore être visible depuis l’accueil.
  assert.doesNotMatch(home, /cosmic(?:-counters|-defenses)?\.html/);
  const homeCss = await read("docs/home.css");
  assert.doesNotMatch(homeCss, /homeTile--cosmic/);
  assert.match(hub, /href="\.\/cosmic-counters\.html"/);
  assert.match(hub, /href="\.\/cosmic-defenses\.html"/);
  assert.match(hub, /href="\.\/cosmic-defense-propose\.html"/);
  for (const page of [hub, counters, defenses, propose]) assert.match(page, /auth-guard\.js/);
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

test("propositions : sauvegarde locale et publication directe confirmée", async () => {
  const code = await read("docs/cosmic-defenses.js");
  assert.match(code, /localStorage\.setItem\(DRAFT_KEY/);
  assert.match(code, /publishSubmission/);
  assert.match(code, /method:"POST"/);
  assert.match(code, /PUBLISH_WORKER/);
  assert.match(code, /signedSession/);
  assert.match(code, /result\.published/);
  assert.doesNotMatch(code, /navigator\.share/);
});

test("identité Discord non éditable et suppression de la saisie source", async () => {
  const [html, js] = await Promise.all([
    read("docs/cosmic-defense-propose.html"), read("docs/cosmic-defenses.js")
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

test("défenses cosmiques : portraits non rognés, règle par salle et sélecteur de collections", async () => {
  const [html, css, js] = await Promise.all([
    read("docs/cosmic-defenses.html"), read("docs/cosmic.css"), read("docs/cosmic-defenses.js")
  ]);
  assert.match(css, /\.cosmicPortrait img\{[^}]*object-fit:contain/);
  assert.match(css, /\.cosmicRoomRule\{[^}]*font-size:12px/);
  assert.match(html, /id="publishedDefenseSelect"/);
  assert.match(html, /cosmic-defense-catalog\.js/);
  assert.match(js, /"Règle de la salle : " \+ room\.rule/g);
  assert.match(js, /function initPublishedSelector\(/);
  assert.match(js, /catalog\.activeEntries\(defenses, COSMIC_SEASON_ID\)/);
  assert.match(js, /publishedDefenseSelect\.addEventListener\("change", renderPublished\)/);
});

test("les classes ISO-8 des règles cosmiques utilisent les termes officiels français", async () => {
  const config = JSON.parse(await read("docs/data/cosmic-config.json"));
  const roomRules = config.rooms.map(room => room.rule).join("\n");
  // Scopely FR : Raider = Fantassin, Skirmisher = Tirailleur.
  assert.doesNotMatch(roomRules, /\bPillard\b/i);
  if (config.season.id === "season-25") {
    const rule = config.rooms.find(room => room.id === 2)?.rule || "";
    assert.match(rule, /ISO-8 Tirailleur \(Skirmisher\)/);
    assert.match(rule, /ISO-8 Fantassin \(Raider\)/);
  }
});

test("les portraits du brouillon peuvent être retirés individuellement, puis sauvegardés", async () => {
  const [js, css, html] = await Promise.all([
    read("docs/cosmic-defenses.js"), read("docs/cosmic.css"), read("docs/cosmic-defense-propose.html")
  ]);
  const selectedPortraits = js.split("function renderSelectedPortraits(section)")[1]?.split("function closeSuggestions")[0];
  assert.ok(selectedPortraits, "section des portraits sélectionnés présente");
  assert.match(selectedPortraits, /if \(selected\) \{/);
  assert.match(selectedPortraits, /make\("button", "cosmicPortraitRemove", "×"\)/);
  assert.match(selectedPortraits, /removeButton\.type = "button"/);
  assert.match(selectedPortraits, /removeButton\.setAttribute\("aria-label"/);
  assert.match(selectedPortraits, /removeButton\.addEventListener\("click", \(\) => \{/);
  assert.match(selectedPortraits, /input\.value = "";/);
  assert.match(selectedPortraits, /input\.dataset\.selectedId = "";/);
  assert.match(selectedPortraits, /renderSelectedPortraits\(section\);\s*saveDraft\(\);/);
  assert.match(css, /\.cosmicPortraitRemove\{/);
  assert.match(css, /\.cosmicPortraitRemove:focus-visible/);
  // Pas de croix pour les défenses publiées ni de suppression de la note.
  assert.doesNotMatch(js.split("function renderPublished()")[1]?.split("function initPublishedSelector")[0] || "", /cosmicPortraitRemove/);
  assert.match(html, /cosmic-defenses\.js\?v=7/);
});

test("trois tuiles : consultation et proposition sont des pages indépendantes", async () => {
  const [hub, browse, propose, js] = await Promise.all([
    read("docs/cosmic.html"), read("docs/cosmic-defenses.html"),
    read("docs/cosmic-defense-propose.html"), read("docs/cosmic-defenses.js")
  ]);
  assert.equal((hub.match(/class="cosmicHubTile /g) || []).length, 3);
  assert.match(browse, /data-cosmic-view="browse"/);
  assert.match(propose, /data-cosmic-view="propose"/);
  assert.match(browse, /id="publishedDefenseSelect"/);
  assert.match(browse, /id="publishedDefenses"/);
  assert.doesNotMatch(browse, /id="proposalRooms"/);
  assert.doesNotMatch(browse, /id="proposalShare"/);
  assert.match(propose, /id="proposalRooms"/);
  assert.match(propose, /id="proposalShare"/);
  assert.match(propose, /id="proposalAuthorDisplay"/);
  assert.doesNotMatch(propose, /id="publishedDefenseSelect"/);
  assert.doesNotMatch(propose, /id="publishedDefenses"/);
  assert.match(browse, /cosmic-defense-catalog\.js/);
  assert.doesNotMatch(propose, /cosmic-defense-catalog\.js/);
  assert.match(js, /IS_PROPOSE = document\.body\?\.dataset\?\.cosmicView === "propose"/);
  assert.match(js, /IS_PROPOSE \? Promise\.resolve\(\[\]\) : fetchJson\(DATA\.defenses\)/);
  assert.match(js, /if \(IS_PROPOSE\) \{/);
  assert.match(js, /initPublishedSelector\(published\)/);
  assert.match(js, /renderProposals\(\)/);
});

test("le formulaire déplacé conserve la clé de brouillon et les suppressions", async () => {
  const [js, html, css] = await Promise.all([
    read("docs/cosmic-defenses.js"),
    read("docs/cosmic-defense-propose.html"),
    read("docs/cosmic.css")
  ]);
  assert.match(js, /LEGACY_DRAFT_KEY = "losp:cosmic-defense-draft:v1"/);
  assert.match(js, /DRAFT_KEY = LEGACY_DRAFT_KEY \+ ":" \+ COSMIC_SEASON_ID/);
  assert.match(js, /localStorage\.setItem\(DRAFT_KEY/);
  assert.match(js, /cosmicPortraitRemove/);
  assert.match(js, /input\.dataset\.selectedId = ""/);
  assert.match(html, /cosmic-defenses\.js\?v=7/);
  assert.match(html, /cosmic-season-ui\.js/);
  assert.match(css, /\.cosmicHubTile--propose/);
});

test("publication directe : backend requis, brouillon conservé, lecture live", async () => {
  const [propose,browse,js] = await Promise.all([
    read("docs/cosmic-defense-propose.html"),
    read("docs/cosmic-defenses.html"),
    read("docs/cosmic-defenses.js")
  ]);
  assert.match(propose,/Publier mes défenses/);
  assert.match(propose,/proposalPublishedLink/);
  assert.match(js,/checkPublishService\(\)/);
  assert.match(js,/loadPublishedLive\(config\?\.season\?\.id\)/);
  assert.match(js,/if \(!response\.ok \|\| !result\?\.ok\)/);
  assert.match(js,/Aucune publication confirmée/);
  assert.match(browse,/id="publishedDefenseSelect"/);
});
