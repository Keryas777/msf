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
  assert.match(js, /IS_PROPOSE \? Promise\.resolve\(\[\]\) : loadPublishedLive\(config\?\.season\?\.id\)/);
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

test("croix de retrait plus discrète sans réduire la zone tactile mobile", async () => {
  const [css, propose] = await Promise.all([
    read("docs/cosmic.css"), read("docs/cosmic-defense-propose.html")
  ]);
  const button = css.match(/\.cosmicPortraitRemove\{([^}]*)\}/)?.[1] || "";
  const circle = css.match(/\.cosmicPortraitRemove::before,\s*\.cosmicPortraitRemove::after\{([^}]*)\}/)?.[1] || "";
  const cross = css.match(/\.cosmicPortraitRemove::after\{\s*content:"×";([^}]*)\}/)?.[1] || "";
  assert.match(button, /width:32px;height:32px/);
  assert.match(button, /touch-action:manipulation/);
  assert.match(circle, /width:19px;height:19px/);
  assert.match(cross, /font:700 12px\/1 sans-serif/);
  assert.match(propose, /cosmic\.css\?v=8/);
});


test("cosmic visual design matches the common LoSP dark glass theme", async () => {
  const [css, hub, browse, propose, counters] = await Promise.all([
    read("docs/cosmic.css"), read("docs/cosmic.html"),
    read("docs/cosmic-defenses.html"), read("docs/cosmic-defense-propose.html"),
    read("docs/cosmic-counters.html")
  ]);
  assert.match(css, /\.cosmicHeader\{[^}]*background:rgba\(8,9,10,\.78\)/);
  assert.match(css, /\.cosmicHubTile\{[^}]*background:radial-gradient\([^}]*rgba\(12,18,28,\.90\)/);
  assert.match(css, /\.cosmicRoom\{[^}]*border:1px solid var\(--border\)/);
  assert.match(css, /\.cosmicSeasonCard\{[^}]*var\(--panel\)/);
  assert.match(css, /\.cosmicIntro\{[^}]*var\(--muted\)/);
  assert.match(css, /\.cosmicHubGrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.cosmicPortrait img\{[^}]*object-fit:contain/);
  assert.match(css, /\.cosmicPortraitRemove::after\{[^}]*font:700 12px\/1 sans-serif/);
  for (const page of [hub,browse,propose,counters]) {
    assert.match(page, /cosmic\.css\?v=8/);
    assert.match(page, /style\.css\?v=/);
  }
});


test("Marvel Church saison 25 : recommandations DÉFENSIVES importées sans inventer les cinq personnages", async () => {
  const [raw, catalog, config, characters] = await Promise.all([
    read("docs/data/cosmic-defenses.json"),
    read("docs/cosmic-defense-catalog.js"),
    read("docs/data/cosmic-config.json"),
    read("docs/data/msf-characters.json")
  ]);
  const rows=JSON.parse(raw), season=JSON.parse(config).season.id;
  const playable=new Set(JSON.parse(characters).filter(c=>c.player_Character===true).map(c=>c.id));
  const church=rows.filter(c=>c.source==="Marvel Church");
  assert.equal(season,"season-25");
  assert.equal(church.length,20);
  assert.deepEqual(church.reduce((acc,c)=>(acc[c.room]=(acc[c.room]||0)+1,acc),{}),
    {1:3,2:3,3:3,4:4,5:4,6:3});
  assert.equal(church.filter(c=>c.name.startsWith("Best Defense")).length,7);
  assert.equal(church.filter(c=>c.name.startsWith("Optimal Defense")).length,7);
  assert.equal(church.filter(c=>c.name.startsWith("Budget Defense")).length,6);
  for (const entry of church) {
    assert.equal(entry.season,season);
    assert.equal(entry.collection,"Marvel Church — Saison 25");
    assert.equal(entry.sourceUrl,"https://www.marvel.church/cosmic-crucible-the-best-defensive-setup/");
    assert.equal(entry.characters.length,5);
    assert.equal(new Set(entry.characters).size,5);
    assert.ok(entry.characters.every(id=>playable.has(id)),entry.name);
    assert.doesNotMatch(entry.name+" "+entry.notes,/offensive setup|offense heavy/i);
    assert.equal("authorDiscordId" in entry,false);
  }
  const specific=church.find(c=>c.room===3&&c.name.startsWith("Optimal Defense"));
  assert.ok(specific?.characters.includes("EmmaFrost"));
  assert.ok(specific?.characters.includes("EmmaFrostXMen"));
  const room6=church.filter(c=>c.room===6);
  const best=room6.find(c=>c.name.startsWith("Best Defense"));
  const optimal=room6.find(c=>c.name.startsWith("Optimal Defense"));
  assert.deepEqual(best?.characters,
    ["InvisibleWomanMCU","MrFantasticMCU","FranklinRichards","Sentry","BlueMarvel"]);
  assert.deepEqual(optimal?.characters,
    ["InvisibleWomanMCU","MrFantasticMCU","FranklinRichards","CaptainBritain","Nightcrawler"]);
  for (const entry of [best,optimal]) {
    assert.equal(entry.characters.includes("Thing"),false);
    assert.equal(entry.characters.includes("HumanTorch"),false);
    assert.match(entry.notes,/non détaillée sur le guide Marvel Church/);
  }
  const group=(room,match)=>church.find(e=>e.room===room && e.name.includes(match));
  assert.deepEqual(group(1,"Budget Defense")?.characters,
    ["IronFist","SwordMaster","SteelSerpent","LadyBullseye","CaptainBritain"]);
  assert.deepEqual(group(2,"Optimal Defense")?.characters,
    ["Hellverine","TheHood","Satana","Juggernaut","Odin"]);
  const variants4=church.filter(e=>e.room===4 && e.name.startsWith("Best Defense"));
  assert.equal(variants4.length,2);
  assert.deepEqual(variants4.map(x=>x.characters.at(-1)).sort(),["Annihilus","Quasar"]);
  for(const variant of variants4){
    assert.deepEqual(variant.characters.slice(0,4),["Wolverine","Angel","Morph","StormMighty"]);
    assert.equal(variant.characters.includes("Jubilee"),false);
    assert.ok(variant.notes.length>60);
  }
  assert.match(variants4.find(x=>x.characters.includes("Annihilus"))?.notes,/barrières/);
  assert.match(variants4.find(x=>x.characters.includes("Quasar"))?.notes,/assistances/);
  const variants5=church.filter(e=>e.room===5 && e.name.startsWith("Optimal Defense"));
  assert.equal(variants5.length,2);
  assert.deepEqual(variants5.map(x=>x.characters.at(-1)).sort(),["Mephisto","SilverSurferBreaker"]);
  for(const variant of variants5){
    assert.deepEqual(variant.characters.slice(0,4),["Warlock","Magik","Wolfsbane","Cannonball"]);
    assert.equal(variant.characters.includes("Sunspot"),false);
    assert.match(variant.notes,/Solar/);
  }
  assert.match(catalog,/collection \|\| \(external \? source/);
});


test("consultation : badges français, titres séparés, sources homogènes et cache mobile", async () => {
  const [html,js,css,catalog]=await Promise.all([
    read("docs/cosmic-defenses.html"),read("docs/cosmic-defenses.js"),
    read("docs/cosmic.css"),read("docs/cosmic-defense-catalog.js")
  ]);
  assert.match(html,/cosmic\.css\?v=9/);
  assert.match(html,/cosmic-defense-catalog\.js\?v=2/);
  assert.match(html,/cosmic-defenses\.js\?v=8/);
  assert.match(js,/catalog\.sortedForDisplay\(list\.filter/);
  assert.match(js,/catalog\.presentationFor\(entry\)/);
  assert.match(js,/make\("span", "cosmicDefenseTier cosmicDefenseTier--" \+ presentation\.key/);
  assert.match(js,/make\("h4", "cosmicDefenseTeam"/);
  assert.match(js,/"Source : " \+ safeText\(catalog\.displaySource\(entry\), 100\)/);
  assert.doesNotMatch(js,/Proposé par :/);
  assert.match(css,/\.cosmicDefenseTier\{[^}]*white-space:nowrap/);
  assert.match(css,/\.cosmicDefenseTier--best\{/);
  assert.match(css,/\.cosmicDefenseTier--optimal\{/);
  assert.match(css,/\.cosmicDefenseTier--budget\{/);
  assert.match(catalog,/function sortedForDisplay\(entries\)/);
  // Le formulaire et le moteur de publication ne changent pas.
  assert.match(js,/localStorage\.setItem\(DRAFT_KEY/);
});
