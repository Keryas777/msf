import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../docs/historique-personnages-profile-data.js", import.meta.url), "utf8");
const window = {};
runInNewContext(source, { window });
const { rankPlayers, groupTraits, decodeIsoProgress, presentIso } = window.LoSPProfileData;

test("classe par puissance uniquement les membres des alliances actives", () => {
  const alliances = [
    { key: "zeus", name: "Zeus", active: true, aliases: ["LoSP Zeus"] },
    { key: "athena", name: "Athéna", active: true },
    { key: "hades", name: "Hadès", active: false }
  ];
  const members = [
    { player: "Keryas I", alliance: "LoSP Zeus" },
    { player: "Joueur B", alliance: "Athéna" },
    { player: "Ancien membre", alliance: "Hadès" }
  ];
  const rosters = [
    { player: "Keryas I", chars: { ultron: { power: 1500, level: 110, gear: 21,
      yellowStars: 7, redStars: 7, diamonds: 3, isoMax: 15 } },
      iso: { Ultron: { isoClass: "Raider", isoColor: "orange" } } },
    { player: "Joueur B", chars: { Ultron: { power: 2100 } } },
    { player: "Ancien membre", chars: { Ultron: { power: 9999 } } },
    { player: "Ancien joueur hors liste", chars: { ultron: { power: 9999 } } },
    { player: "Ancien pseudo", chars: { Ultron: { power: 1700 } } }
  ];
  const result = rankPlayers("Ultron", rosters, members,
    { aliases: { "Ancien pseudo": "Keryas I" } }, alliances);
  assert.equal(result.length, 2);
  assert.equal(result[0].player, "Joueur B");
  assert.equal(result[0].power, 2100);
  assert.equal(result[1].player, "Keryas I");
  assert.equal(result[1].power, 1700);
  assert.equal(result[1].diamonds, undefined);
});

test("conserve les étoiles, diamants et ISO du roster réellement retenu", () => {
  const result = rankPlayers("Ultron", [
    { player: "A", chars: { ultron: { power: 500, yellowStars: 7,
      redStars: 6, diamonds: 1, isoMax: 12 } },
      iso: { Ultron: { isoClass: "Striker", isoColor: "orange" } } }
  ], [{ player: "A", alliance: "Zeus" }], {}, [{ key: "zeus", name: "Zeus" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].redStars, 6);
  assert.equal(result[0].diamonds, 1);
  assert.equal(result[0].isoClass, "Striker");
  assert.equal(result[0].isoColor, "orange");
});

test("catégorise les tags officiels sans inventer une équipe", () => {
  const groups = groupTraits({
    traits: ["Global", "Tech", "Villain", "MastersOfEvil"],
    displayTraits: ["Mondial", "Tech", "Vilain", "Masters Of Evil"]
  });
  assert.equal(groups.map(group => group.title).join("|"),
    "Origine|Type|Affiliation|Équipes et autres tags");
  assert.equal(groups[3].labels[0], "Masters Of Evil");
});

test("la page garde la chronologie et charge les rosters à la demande", () => {
  const html = readFileSync(new URL("../docs/historique-personnages.html", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../docs/historique-personnages-profile.js", import.meta.url), "utf8");
  assert.match(html, /data-view="timeline"/);
  assert.match(html, /data-view="characters"/);
  assert.match(html, /player_Character === true/);
  assert.match(html, /LoSPCharacterProfiles\?\.attach/);
  assert.match(ui, /if \(name === "players"\) loadRanking\(state\)/);
  assert.doesNotMatch(ui, /getGear|getCharacterAbilities|T4/);
});


test("convertit les paliers ISO avec les niveaux réels, y compris l'orange", () => {
  const cases = [
    [1, "green", 1], [5, "green", 5],
    [6, "blue", 1], [10, "blue", 5],
    [11, "purple", 1], [14, "purple", 4], [15, "purple", 5],
    [16, "orange", 1], [18, "orange", 3]
  ];
  for (const [total, color, level] of cases) {
    const value = decodeIsoProgress(total);
    assert.equal(value.key, color, "couleur ISO pour " + total);
    assert.equal(value.level, level, "niveau ISO pour " + total);
  }
  assert.equal(decodeIsoProgress("14").level, 4);
  for (const invalid of [null, undefined, "", 0, -1, 2.5, 19, "inconnu"]) {
    assert.equal(decodeIsoProgress(invalid), null);
  }
});

test("utilise les traductions françaises officielles et la couleur du palier", () => {
  const expected = {
    striker: "Attaquant",
    raider: "Fantassin",
    skirmisher: "Tirailleur",
    healer: "Soigneur",
    fortifier: "Fortificateur"
  };
  for (const [english, french] of Object.entries(expected)) {
    assert.equal(presentIso(english, "purple", 14).classLabel, french);
  }
  assert.equal(presentIso("Striker", "orange", 14).colorKey, "purple");
  assert.equal(presentIso("Striker", "orange", 14).level, 4);
  assert.equal(presentIso("striker", "", 16).colorKey, "orange");
  assert.equal(presentIso("healer", "violet", null).colorLabel, "Violet");
  assert.equal(presentIso("", "", null), null);
});

test("affiche des étoiles SVG colorées et une pastille ISO, jamais les nombres bruts", () => {
  const uiSource = readFileSync(new URL("../docs/historique-personnages-profile.js", import.meta.url), "utf8");
  const testWindow = { LoSPProfileData: window.LoSPProfileData, LoSPProfileCodex: {} };
  const exported = uiSource.replace(
    "window.LoSPCharacterProfiles = Object.freeze({ attach, close });",
    "window.__testPlayerMarkup = playerMarkup;\n  window.LoSPCharacterProfiles = Object.freeze({ attach, close });"
  );
  assert.notEqual(exported, uiSource, "point d'export test disponible");
  runInNewContext(exported, { window: testWindow });
  const row = {
    player: "Exemple", alliance: "zeus", power: 800000,
    yellowStars: 7, redStars: 7, diamonds: 3,
    isoClass: "striker", isoColor: "purple", isoMax: 14
  };
  const html = testWindow.__testPlayerMarkup(row, 1, [
    { key: "zeus", name: "Zeus", emoji: "⚡️" }
  ]);
  assert.match(html, /class="profileStarBadge profileStarBadge--yellow"/);
  assert.match(html, /class="profileStarBadge profileStarBadge--red"/);
  assert.equal((html.match(/<svg /g) || []).length, 2);
  assert.equal((html.match(/<svg[^>]*fill="currentColor"[^>]*stroke="none"/g) || []).length, 2);
  assert.equal((html.match(/<path[^>]*fill="currentColor"[^>]*stroke="none"/g) || []).length, 2);
  assert.doesNotMatch(html, /🔴|★ 7|étoiles jaunes<\/span>|étoiles rouges<\/span>/);
  assert.match(html, /ISO : Attaquant/);
  assert.match(html, /profileIsoDot--purple/);
  assert.match(html, /ISO · Attaquant · Violet niveau 4/);
  assert.doesNotMatch(html, /purple · niveau 14|niveau 14|niveau 15/);

  const css = readFileSync(new URL("../docs/historique-personnages-profile.css", import.meta.url), "utf8");
  assert.match(css, /\.profileStarBadge--yellow\{color:#ffd24a\}/);
  assert.match(css, /\.profileStarBadge--red\{color:#ff545c\}/);
  assert.match(css, /\.profileStarBadge svg path\{fill:currentColor;stroke:none\}/);
  assert.match(css, /\.profilePlayerStats \.profileIsoDot--orange\{background:/);
});


test("ne masque pas les joueurs quand le module ISO reste en cache dans Safari", () => {
  const source = readFileSync(new URL("../docs/historique-personnages-profile.js", import.meta.url), "utf8");
  const legacyData = { ...window.LoSPProfileData };
  delete legacyData.presentIso;
  delete legacyData.decodeIsoProgress;
  const oldWindow = { LoSPProfileData: legacyData, LoSPProfileCodex: {} };
  const exposed = source.replace(
    "window.LoSPCharacterProfiles = Object.freeze({ attach, close });",
    "window.__testPlayerMarkup = playerMarkup;\n  window.LoSPCharacterProfiles = Object.freeze({ attach, close });"
  );
  assert.notEqual(exposed, source, "fonction de rendu disponible pour le test");
  runInNewContext(exposed, { window: oldWindow });
  const row = {
    player: "Joueur en cache", alliance: "zeus", power: 987654,
    yellowStars: 7, redStars: 7, diamonds: 3,
    isoClass: "striker", isoColor: "purple", isoMax: 14
  };
  const markup = oldWindow.__testPlayerMarkup(row, 1, [
    { key: "zeus", name: "Zeus", emoji: "⚡️" }
  ]);
  assert.match(markup, /Joueur en cache/);
  assert.match(markup, /profileStarBadge--yellow/);
  assert.match(markup, /profileStarBadge--red/);
  assert.match(markup, /987.654/);
  assert.doesNotMatch(markup, /ISO :/); // Fallback sûr jusqu'au chargement du nouveau module.
});

test("versionne ensemble les scripts de fiche après un changement de contrat ISO", () => {
  const html = readFileSync(new URL("../docs/historique-personnages.html", import.meta.url), "utf8");
  assert.match(html, /historique-personnages-profile-data\.js\?v=2/);
  assert.match(html, /historique-personnages-profile\.js\?v=3/);
});


test("la charte LoSP ne masque pas les pastilles colorées ISO", () => {
  const theme = readFileSync(new URL("../docs/historique-personnages-theme.css", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../docs/historique-personnages-profile.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../docs/historique-personnages.html", import.meta.url), "utf8");

  // Le fond neutre des badges ne doit pas s'appliquer aux pastilles ISO imbriquées.
  assert.match(theme, /body\.archiveCharactersPage \.profilePlayerStats span:not\(\.profileIsoDot\) \{/);
  assert.doesNotMatch(theme, /body\.archiveCharactersPage \.profilePlayerStats span \{/);
  for (const color of ["green", "blue", "purple", "orange"]) {
    assert.match(profile, new RegExp("\\.profilePlayerStats \\.profileIsoDot--" + color + "\\{background:#[0-9a-f]{6}\\}", "i"));
  }
  // Changer l'URL évite qu'iOS Safari/PWA affiche une ancienne version de la charte.
  assert.match(html, /historique-personnages-theme\.css\?v=2/);
});


test("le rang n'empiète plus sur les pseudos dès #100, même en largeur mobile", () => {
  const css = readFileSync(new URL("../docs/historique-personnages-profile.css", import.meta.url), "utf8");
  assert.match(css, /\.profileRank\{flex:0 0 auto;min-width:3\.1em;white-space:nowrap;text-align:right;/);
  assert.doesNotMatch(css, /\.profileRank\{width:(?:22|26)px;/);
  assert.doesNotMatch(css, /flex-basis:(?:22|26)px/);
});

test("la puissance utilise un espace visible entre les milliers sans changer la valeur", () => {
  const source = readFileSync(new URL("../docs/historique-personnages-profile.js", import.meta.url), "utf8");
  const testWindow = { LoSPProfileData: window.LoSPProfileData, LoSPProfileCodex: {} };
  const exported = source.replace(
    "window.LoSPCharacterProfiles = Object.freeze({ attach, close });",
    "window.__testPlayerMarkup = playerMarkup;\n  window.LoSPCharacterProfiles = Object.freeze({ attach, close });"
  );
  assert.notEqual(exported, source);
  runInNewContext(exported, { window: testWindow });
  const alliances = [{ key: "zeus", name: "Zeus", emoji: "⚡️" }];
  function render(rank, power) {
    return testWindow.__testPlayerMarkup({
      player: "Joueur exemple", alliance: "zeus", power
    }, rank, alliances);
  }
  assert.match(render(100, 628775), /class="profileRank">#100<\/span>/);
  assert.match(render(104, 628775), /#104<\/span><div class="profilePlayerInfo"><strong>Joueur exemple<\/strong>/);
  assert.match(render(100, 628775), /class="profilePower">628\u2002775<\/strong>/);
  assert.match(render(1000, 1234567), /class="profilePower">1\u2002234\u2002567<\/strong>/);
  assert.match(render(1, 999), /class="profilePower">999<\/strong>/);
  const html = readFileSync(new URL("../docs/historique-personnages.html", import.meta.url), "utf8");
  assert.match(html, /historique-personnages-profile\.css\?v=3/);
  assert.match(html, /historique-personnages-profile\.js\?v=4/);
});
