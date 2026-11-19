import {
  loadAllianceDirectory,
  renderRichName,
  searchAll
} from "./alliance-directory.js";

const $ = id => document.getElementById(id);
const input = $("allianceQuery");
const results = $("directoryResults");
const status = $("directoryStatus");
const dialog = $("allianceDetail");
let directory;

function textElement(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function aliasesOf(alliance) {
  return [...(alliance.aliases || []).map(value => typeof value === "string" ? value : value?.name),
    ...(alliance.previousNames || []).map(value => typeof value === "string" ? value : value?.name)]
    .filter(Boolean);
}

function renderList() {
  const query = input.value.trim();
  const matches = searchAll(directory, query, { limit: 60 });
  results.replaceChildren();
  for (const alliance of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "allianceCard";
    const rich = textElement("span", "allianceCardName", "");
    renderRichName(rich, alliance.richName, alliance.name);
    button.append(rich, textElement("span", "allianceCardSimple", alliance.name));
    button.append(textElement("span", "identityBadge", alliance.identityStatus === "confirmed" ? "Identité confirmée" : "Identité provisoire"));
    button.addEventListener("click", () => showDetail(alliance));
    results.append(button);
  }
  status.textContent = query
    ? `${matches.length} résultat${matches.length > 1 ? "s" : ""}${matches.length === 60 ? " (affichage limité à 60)" : ""}`
    : `${directory.payload.alliances.length} alliances enregistrées`;
}

function addFact(dl, label, value) {
  const wrapper = document.createElement("div");
  wrapper.append(textElement("dt", "", label), textElement("dd", "", value || "Non renseigné"));
  dl.append(wrapper);
}

function showDetail(alliance) {
  renderRichName($("detailRichName"), alliance.richName, alliance.name);
  $("detailSimpleName").textContent = `Nom simplifié : ${alliance.name}`;
  const facts = $("detailFacts");
  facts.replaceChildren();
  addFact(facts, "Identifiant interne", alliance.allianceId);
  addFact(facts, "Identifiant officiel MSF", alliance.officialAllianceId);
  addFact(facts, "Première observation", alliance.firstObservedAt);
  addFact(facts, "Dernière observation", alliance.lastObservedAt);
  $("detailStatus").textContent = alliance.identityStatus === "confirmed"
    ? "Identité confirmée"
    : "Identité provisoire : aucun identifiant officiel ne relie encore cette fiche à une alliance MSF.";
  const aliases = $("detailAliases");
  aliases.replaceChildren();
  aliases.append(textElement("h3", "", "Alias et anciens noms"));
  const names = aliasesOf(alliance);
  aliases.append(textElement("p", "", names.length ? names.join(" · ") : "Aucun alias confirmé."));
  const sources = $("detailSources");
  sources.replaceChildren();
  sources.append(textElement("h3", "", "Provenance"));
  for (const observation of alliance.observations || []) {
    const source = observation.source?.type === "user-supplied-ranking-capture"
      ? "Capture de classement fournie par l’utilisateur"
      : observation.source?.type || "Source non précisée";
    sources.append(textElement("p", "", `${source} · date non fournie · confiance ${observation.confidence || "non précisée"}`));
  }
  for (const note of alliance.provenance?.uncertainties || []) sources.append(textElement("p", "", `À vérifier : ${note}`));
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

input.addEventListener("input", renderList);
try {
  directory = await loadAllianceDirectory();
  const id = new URLSearchParams(location.search).get("id");
  renderList();
  const selected = id && directory.byId.get(id);
  if (selected) showDetail(selected);
} catch (error) {
  status.textContent = error.message || "L’annuaire n’a pas pu être chargé.";
}
