import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../docs/historique-personnages.html", import.meta.url), "utf8");
const theme = readFileSync(new URL("../docs/historique-personnages-theme.css", import.meta.url), "utf8");
const script = html.split("<script>").at(-1).split("</script>")[0];

function functionSource(name, nextName) {
  const first = script.indexOf("        function " + name + "(");
  const last = script.indexOf("        function " + nextName + "(", first);
  assert.ok(first >= 0 && last > first, name + " est disponible");
  return script.slice(first, last);
}

test("la vue Personnages s'ouvre sans textes de présentation ni bloc historique", () => {
  assert.match(html, /view: "characters"/);
  assert.match(html, /<h1 id="pageTitle" class="title">Personnages MSF<\/h1>/);
  assert.doesNotMatch(html, /Identité, capacités, classements et historique du groupement/);
  assert.doesNotMatch(html, /Sorties et reworks, capacités et classement des personnages/);
  assert.match(html, /<section class="hero card archiveSummary"[^>]* hidden>/);
  assert.match(theme, /\.archiveApp \.hero\.archiveSummary\[hidden\] \{ display: none; \}/);
  assert.match(html, /historique-personnages-theme\.css\?v=4/);
  assert.doesNotThrow(() => new Function(script));
});

test("les quatre statistiques et le statut historique restent disponibles", () => {
  for (const id of ["dataScope", "statCharacters", "statLaunch", "statAfterLaunch", "statReworks"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(script, /Historique renseigné : \$\{range\}/);
  assert.doesNotMatch(script, /Les futures années du JSON s’ajouteront automatiquement/);
});

test("la navigation affiche les statistiques seulement dans les deux vues historiques", () => {
  const state = { view: "characters" };
  const els = {
    archiveSummary: { hidden: true },
    resultCount: { textContent: "" },
    content: { innerHTML: "" }
  };
  const render = runInNewContext(functionSource("render", "getRecordById") + "\nrender", {
    state,
    els,
    getFilteredCharacters: () => [{ id: "Ultron" }],
    getFilteredTimelineEvents: () => [{ occurrences: [{}] }],
    renderCharacterList: () => "catalogue visible",
    renderRankings: () => "classements visibles",
    renderTimeline: () => "chronologie visible"
  });
  render();
  assert.equal(els.archiveSummary.hidden, true);
  assert.equal(els.content.innerHTML, "catalogue visible");
  state.view = "timeline";
  render();
  assert.equal(els.archiveSummary.hidden, false);
  assert.equal(els.content.innerHTML, "chronologie visible");
  state.view = "rankings";
  render();
  assert.equal(els.archiveSummary.hidden, false);
  assert.equal(els.content.innerHTML, "classements visibles");
  state.view = "characters";
  render();
  assert.equal(els.archiveSummary.hidden, true);
  assert.equal(els.content.innerHTML, "catalogue visible");
});

test("la recherche, les filtres, les trois vues et les fiches restent accessibles", () => {
  for (const id of ["searchInput", "yearFilter", "sortSelect", "resultCount", "resetFilters", "detailModal", "detailContent"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  for (const view of ["characters", "timeline", "rankings"]) {
    assert.match(html, new RegExp('data-view="' + view + '"'));
  }
  assert.match(script, /LoSPCharacterProfiles\?\.attach/);
});
