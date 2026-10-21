import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../docs/historique-personnages.html", import.meta.url), "utf8");
const theme = readFileSync(new URL("../docs/historique-personnages-theme.css", import.meta.url), "utf8");
const script = html.split("<script>").at(-1).split("</script>")[0];

function extractFunction(name, nextName) {
  const begin = script.indexOf("        function " + name + "(");
  const end = script.indexOf("        function " + nextName + "(", begin);
  assert.ok(begin >= 0 && end > begin, name + " doit rester disponible");
  return script.slice(begin, end);
}

test("uniquement recherche, année et tri, avec Année/Tri sur la même ligne", () => {
  const filters = html.slice(html.indexOf('<section class="filters archiveFilters"'), html.indexOf('<section id="content"'));
  assert.match(filters, /class="filterGrid filterGrid--compact"/);
  assert.match(filters, /class="field field--search"/);
  assert.match(filters, /id="searchInput"/);
  assert.match(filters, /id="yearFilter"/);
  assert.match(filters, /id="sortSelect"/);
  assert.match(filters, /id="resetFilters"/);
  assert.doesNotMatch(filters, /id="typeFilter"|id="reworkFilter"/);
  assert.match(theme, /\.archiveApp \.filterGrid\.filterGrid--compact \{\s*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\)/);
  assert.match(theme, /\.archiveApp \.filterGrid--compact \.field--search \{\s*grid-column: 1 \/ -1;/);
  assert.match(html, /historique-personnages-theme\.css\?v=3/);
});

test("aucun accès aux champs supprimés, reset sécurisé et script valide", () => {
  assert.doesNotMatch(script, /typeFilter|reworkFilter|filters\.(?:type|rework)/);
  assert.match(script, /els\.yearFilter\.value = "all"/);
  assert.match(script, /els\.sortSelect\.value = "oldest"/);
  assert.doesNotThrow(() => new Function(script));
});

test("année, recherche et tri filtrent toujours les personnages jouables", () => {
  const snippet = extractFunction("getFilteredCharacters", "createPortraitHtml");
  const known = {
    id: "Alpha", name: "Alpha", searchText: "alpha",
    release: { temporal: { year: 2018, key: "2018-03-28" } }, reworks: []
  };
  const unknown = {
    id: "Omega", name: "Omega", searchText: "omega",
    release: null, reworks: []
  };
  const state = {
    view: "characters",
    characters: [known, unknown],
    filters: { query: "", year: "all", sort: "oldest" }
  };
  const getFiltered = runInNewContext(snippet + "\ngetFilteredCharacters", {
    state,
    normalizeSearch: value => String(value).toLowerCase().trim()
  });
  assert.equal(getFiltered().length, 2, "personnage sans date toujours visible dans le catalogue");
  state.filters.year = "2018";
  assert.deepEqual(Array.from(getFiltered(), record => record.id), ["Alpha"]);
  state.filters.year = "all";
  state.filters.query = "omega";
  assert.deepEqual(Array.from(getFiltered(), record => record.id), ["Omega"]);
  state.filters.query = "";
  state.filters.sort = "newest";
  assert.equal(getFiltered()[0].id, "Alpha");
  state.view = "rankings";
  assert.deepEqual(Array.from(getFiltered(), record => record.id), ["Alpha"]);
});

test("chronologie conserve tous les types d'événements et le filtre année", () => {
  const snippet = extractFunction("getFilteredTimelineEvents", "getTimelineEventMeta");
  const events = [
    {
      type: "launch", temporal: { year: 2018, key: "2018-03-28" },
      sequence: 1, occurrences: [{ record: { searchText: "alpha", reworks: [] } }]
    },
    {
      type: "team", temporal: { year: 2019, key: "2019-04-12" },
      sequence: 2, occurrences: [{ record: { searchText: "beta", reworks: [{}] } }]
    }
  ];
  const state = { filters: { query: "", year: "all", sort: "oldest" } };
  const getEvents = runInNewContext(snippet + "\ngetFilteredTimelineEvents", {
    state,
    buildTimelineEvents: () => events,
    normalizeSearch: value => String(value).toLowerCase().trim()
  });
  assert.equal(getEvents().length, 2, "les événements de rework et lancement restent accessibles");
  state.filters.year = "2019";
  assert.equal(getEvents().length, 1);
  assert.equal(getEvents()[0].type, "team");
  state.filters.year = "all";
  state.filters.query = "alpha";
  assert.equal(getEvents().length, 1);
  assert.equal(getEvents()[0].type, "launch");
});
