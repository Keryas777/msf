import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("../docs/cosmic-defense-catalog.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(code, context);
const { activeEntries, groupsFor, entriesForGroup, groupFor } = context.LoSPCosmicDefenseCatalog;

const make = (season, room, author, source = "", collection = "") => ({
  season, room, author, source, collection, characters: ["Hulk", "SpiderMan", "Blade", "Thor", "Odin"]
});

test("séparation stricte des saisons et exclusion des compositions incomplètes", () => {
  const current = make("season-25", 1, "Keryas");
  const older = make("season-24", 1, "Autre");
  const invalid = { ...current, characters: ["Hulk"] };
  const duplicate = { ...current, characters: Array(5).fill("Hulk") };
  const active = activeEntries([current, older, invalid, duplicate], "season-25");
  assert.equal(active.length, 1);
  assert.equal(active[0], current);
  assert.equal(activeEntries([current], "season-26").length, 0);
});

test("groupement joueurs et Marvel Church, plusieurs salles par contributeur", () => {
  const rows = [
    make("season-25", 1, "Keryas"),
    make("season-25", 2, "Keryas", "Personnel"),
    make("season-25", 1, "Keryas", "Marvel Church"),
    make("season-25", 2, "Keryas", "Marvel Church"),
    make("season-25", 3, "Autre")
  ];
  const groups = groupsFor(rows);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].kind, "player");
  assert.equal(groups[0].label, "Défenses de Autre");
  const playerGroup = groups.find(x => x.label === "Défenses de Keryas");
  assert.equal(playerGroup.count, 2);
  assert.equal(entriesForGroup(rows, playerGroup.id).length, 2);
  const external = groups.find(x => x.label === "Marvel Church");
  assert.equal(external.kind, "source");
  assert.equal(external.count, 2);
  assert.equal(entriesForGroup(rows, external.id).length, 2);
  assert.equal(entriesForGroup(rows, "").length, 5);
});

test("collections distinctes d'une même source sans confondre les joueurs", () => {
  const one = make("season-25", 1, "Keryas", "Marvel Church", "Défense A");
  const two = make("season-25", 2, "Keryas", "Marvel Church", "Défense B");
  const third = make("season-25", 3, "Joueur", "Personnel", "Défense A");
  const groups = groupsFor([one, two, third]);
  assert.equal(groups.length, 3);
  assert.notEqual(groupFor(one).id, groupFor(two).id);
  assert.notEqual(groupFor(one).id, groupFor(third).id);
  assert.equal(entriesForGroup([one, two, third], groupFor(two).id)[0], two);
});
