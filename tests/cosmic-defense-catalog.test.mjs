import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("../docs/cosmic-defense-catalog.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(code, context);
const { activeEntries, groupsFor, entriesForGroup, groupFor, presentationFor, sortedForDisplay, displaySource } = context.LoSPCosmicDefenseCatalog;

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


test("libellés français et nom d'équipe distinct sans modifier les données publiées", () => {
  const best = {name:"Best Defense — Symbiote Six + Professeur Xavier (sans Toxin)"};
  const optimal = {name:"Optimal Defense — Symbiote Six"};
  const budget = {name:"Budget Defense — Armes immortelles + Captain Britain"};
  const player = {name:"Défense de 🚂Keryas", author:"🚂Keryas", source:"Personnel"};
  assert.equal(presentationFor(best).label,"Meilleure défense");
  assert.equal(presentationFor(best).team,"Symbiote Six + Professeur Xavier (sans Toxin)");
  assert.equal(presentationFor(optimal).label,"Défense optimisée");
  assert.equal(presentationFor(budget).label,"Défense économique");
  assert.equal(presentationFor(player).label,"");
  assert.equal(presentationFor(player).team,"Défense de 🚂Keryas");
  assert.equal(best.name,"Best Defense — Symbiote Six + Professeur Xavier (sans Toxin)");
});

test("ordre fixe Best, Optimal, Budget et variantes stables quelle que soit l'origine", () => {
  const a={name:"Budget Defense — A"}, b={name:"Optimal Defense — B"};
  const c={name:"Best Defense — C"}, d={name:"Best Defense — D"};
  const player={name:"Défense de 🚂Keryas",source:"Personnel",author:"🚂Keryas"};
  const input=[a,player,b,c,d];
  const sorted=sortedForDisplay(input);
  assert.deepEqual(sorted.map(v=>v.name),[
    "Best Defense — C","Best Defense — D","Optimal Defense — B",
    "Budget Defense — A","Défense de 🚂Keryas"
  ]);
  assert.equal(input[0],a,"le tableau source n'est pas modifié");
  assert.deepEqual(sortedForDisplay([]),[]);
});

test("ligne Source uniforme pour guides et joueurs (pseudo serveur conservé)", () => {
  assert.equal(displaySource({source:"Marvel Church"}),"Marvel Church");
  assert.equal(displaySource({source:"Personnel",author:"🚂Keryas"}),"🚂Keryas");
  assert.equal(displaySource({source:"Personnel",author:"Autre joueur"}),"Autre joueur");
  assert.equal(displaySource({source:"Personnel"}),"Joueur LoSP");
  assert.equal(displaySource({source:"Autre guide",author:"Administrateur"}),"Autre guide");
});

test("toutes les 20 compositions saison 25 se trient par priorité à chaque salle", async () => {
  const rows=JSON.parse(await readFile(new URL("../docs/data/cosmic-defenses.json",import.meta.url),"utf8"));
  const church=rows.filter(e=>e.source==="Marvel Church" && e.season==="season-25");
  assert.equal(church.length,20);
  for(let room=1;room<=6;room++){
    const entries=sortedForDisplay(church.filter(e=>e.room===room));
    const ranks=entries.map(e=>presentationFor(e).order);
    assert.deepEqual(ranks,[...ranks].sort((a,b)=>a-b));
    assert.ok(entries.every(e=>presentationFor(e).label),"label de guide traduit");
  }
});
