import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app, core, homeHtml, homeCss, tileSvg] = await Promise.all([
  readFile(new URL("../docs/codex.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/codex.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/codex.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/codex-core.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/home.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/home.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/Codex.svg", import.meta.url), "utf8"),
]);

test("le frontend ne référence jamais operations.json", () => {
  for (const source of [html, css, app, core]) {
    assert.equal(source.includes("operations.json"), false);
  }
});

test("la page autorise le zoom et expose les primitives d’accessibilité", () => {
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  assert.match(html, /class="codexSkipLink"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-controls="codexSearchResults"/);
  assert.match(html, /role="status" aria-live="polite"/);
});

test("les routes utilisent pushState, replaceState et la restauration manuelle", () => {
  assert.match(app, /history\.pushState/);
  assert.match(app, /history\.replaceState/);
  assert.match(app, /history\.scrollRestoration = "manual"/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  assert.doesNotMatch(app, /Date\.now\(\)/);
});

test("le partage implémente Web Share, presse-papiers et fallback", () => {
  assert.match(app, /navigator\.share/);
  assert.match(app, /navigator\.clipboard/);
  assert.match(app, /document\.execCommand\?\.\("copy"\)/);
  assert.match(app, /Lien copié/);
});

test("les messages d’état demandés sont présents", () => {
  const messages = [
    "Chargement du Codex…",
    "Aucun résultat pour",
    "Impossible de charger les données du Codex.",
    "Cette fiche n’est pas disponible dans la génération actuelle.",
    "Texte officiel indisponible pour cette capacité.",
    "Aucune mécanique vérifiée n’est disponible pour cette capacité.",
    "Cette fiche représente une invocation, une variante ou une entité de combat.",
    "Ta session a expiré. Reconnecte-toi pour revenir à cette fiche.",
    "Ce lien ne correspond plus à une fiche du Codex.",
    "Les images officielles sont indisponibles. Les données restent consultables.",
  ];
  for (const message of messages) assert.ok(app.includes(message), message);
  assert.ok(html.includes("Des données MSF plus récentes sont disponibles."));
});

test("le CSS couvre les seuils mobile, tablette, desktop et le mouvement réduit", () => {
  assert.match(css, /@media \(min-width: 375px\)/);
  assert.match(css, /@media \(min-width: 620px\)/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height: 44px/);
});

test("la tuile Codex est ajoutée après les tuiles existantes avec son fallback", () => {
  const links = [...homeHtml.matchAll(/<a href="([^"]+)" class="homeTile[^\"]*">/g)]
    .map((match) => match[1]);
  assert.deepEqual(links, [
    "./war-choose.html",
    "./war-stats.html",
    "./conseils.html",
    "./iso.html",
    "./classements.html",
    "./joueur.html",
    "./codex.html",
  ]);
  assert.match(homeHtml, /Codex MSF — Personnages, capacités et mécaniques/);
  assert.match(homeCss, /homeTile--codex::before[\s\S]*content:"📖"/);
  assert.match(tileSvg, /Livre ouvert abstrait, loupe et nœuds de capacités/);
});
