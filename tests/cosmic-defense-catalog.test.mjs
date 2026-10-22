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
  assert.equal(groups[0].label, "Autre (Mes défenses) S25");
  const playerGroup = groups.find(x => x.label === "Keryas (Mes défenses) S25");
  assert.equal(playerGroup.count, 2);
  assert.equal(entriesForGroup(rows, playerGroup.id).length, 2);
  const external = groups.find(x => x.label === "Marvel Church S25");
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


test("Marvel Church est présent trois fois : meilleure, optimisée, économique dans cet ordre", async () => {
  const rows=JSON.parse(await readFile(new URL("../docs/data/cosmic-defenses.json",import.meta.url),"utf8"));
  const church=activeEntries(rows,"season-25").filter(row=>row.source==="Marvel Church");
  const groups=groupsFor(church);
  assert.deepEqual(Array.from(groups,group=>group.label),[
    "Marvel Church (meilleure défense) S25",
    "Marvel Church (défense optimisée) S25",
    "Marvel Church (défense économique) S25"
  ]);
  assert.deepEqual(Array.from(groups,group=>group.count),[7,7,6]);
  for(const group of groups) {
    const members=entriesForGroup(church,group.id);
    assert.equal(members.length,group.count);
    assert.ok(members.every(row=>groupFor(row).id===group.id));
  }
  assert.equal(rows[0].collection,"Marvel Church — Saison 25","le JSON n'est pas modifié");
});

test("pseudo Discord (titre personnel) S25, titre ancien manquant et saison suivante", () => {
  const me={...make("season-25",1,"🚂Keryas","Personnel"),title:"Défense polyvalente",authorDiscordId:"300305626926415874"};
  const second={...me,room:2};
  const other={...make("season-25",3,"Autre","Personnel"),title:"Ma défense"};
  const legacy=make("season-25",4,"Ancien","Personnel");
  const next={...me,season:"season-26"};
  const groups=groupsFor([me,second,other,legacy,next]);
  assert.equal(groups.find(g=>g.label==="🚂Keryas (Défense polyvalente) S25").count,2);
  assert.equal(groups.find(g=>g.label==="🚂Keryas (Défense polyvalente) S26").count,1);
  assert.ok(groups.some(g=>g.label==="Ancien (Mes défenses) S25"));
  assert.ok(groups.some(g=>g.label==="Autre (Ma défense) S25"));
  assert.notEqual(groupFor(me).id,groupFor(next).id);
  assert.equal(groupFor({...me,author:"Nouveau pseudo"}).id,groupFor(me).id,
    "le changement du pseudo Discord ne change pas la clé de propriété");
});

test("une autre source conserve ses collections et une catégorie non classée", () => {
  const one={...make("season-25",1,"","Autre guide","Collection A"),name:"Équipe spéciale"};
  const two={...make("season-25",2,"","Autre guide","Collection B"),name:"Équipe B"};
  const groups=groupsFor([one,two]);
  assert.deepEqual(Array.from(groups,g=>g.label),["Collection A S25","Collection B S25"]);
  assert.notEqual(groupFor(one).id,groupFor(two).id);
});
