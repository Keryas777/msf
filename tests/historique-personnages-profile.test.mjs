import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../docs/historique-personnages-profile-data.js", import.meta.url), "utf8");
const window = {};
runInNewContext(source, { window });
const { rankPlayers, groupTraits } = window.LoSPProfileData;

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
