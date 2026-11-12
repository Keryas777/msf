import {rankResults, evaluateDimension} from "./dd-ranking-engine.mjs";
import {filterVisibleRosters, createMapLayout} from "./dimensions-noires-view.mjs";

const $ = (id) => document.getElementById(id);
const state = {
  rows: [],
  catalog: [],
  config: null,
  firstClearObservations: {},
  alliances: [],
  selectedAlliances: new Set(),
  individualRows: [],
  selectedPlayerIdentity: "",
  loadErrors: new Set(),
  loading: true,
};

const normalize = (value) => String(value ?? "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\s_-]+/g, "")
  .replace(/[^a-z0-9]/g, "");

function owns(roster, characterId) {
  const character = state.catalog.find((item) => item.id === characterId);
  if (!character || !roster?.chars ||
      typeof roster.chars !== "object" || Array.isArray(roster.chars))
    return false;
  const keys = new Set([character.id, character.nameKey].filter(Boolean).map(normalize));
  return Object.entries(roster.chars).some(([key, value]) =>
    keys.has(normalize(key)) && value && typeof value === "object"
  );
}

function dimension() {
  return state.config?.dimensions?.find((item) => item.key === $("dimension").value) ||
    state.config?.dimensions?.find((item) => item.active) ||
    state.config?.dimensions?.[0] || null;
}

function allianceKey(value) {
  return window.LoSPAlliances?.getAllianceKey?.(value) || "";
}

function isAllowed(key) {
  return Boolean(key) && window.LoSPAccess?.isAllianceAllowed?.(key) === true;
}

function knownAllowedAlliances() {
  return (window.LoSPAlliances?.getKnownAlliances?.() || [])
    .filter((alliance) => alliance?.key && isAllowed(alliance.key));
}

function authorizedRows() {
  const keys = knownAllowedAlliances().map((alliance) => alliance.key);
  return filterVisibleRosters(state.rows, keys, allianceKey, isAllowed);
}

function identity(roster) {
  const key = allianceKey(roster?.alliance);
  const player = String(roster?.playerKey || roster?.player || roster?.name || "");
  return key + "\u0000" + player;
}

function passageLabel(selectedDimension, passages) {
  const tier = selectedDimension?.completionRule?.tiers?.find((item) => item.passages === passages);
  return (passages === 1 ? "1er passage" : passages + " passages") +
    (tier ? " · " + tier.minYellowStars + "★ jaunes / " + tier.minRedStars + "★ rouges" : "");
}

function firstClearAt(roster, selectedDimension) {
  const key = normalize(roster?.alliance) + ":" + normalize(roster?.playerKey || roster?.player);
  const record = state.firstClearObservations?.[selectedDimension?.key]?.[key];
  return typeof record?.firstClearObservedAt === "string" ? record.firstClearObservedAt : null;
}

function setMessage(text, error = false) {
  $("state").textContent = text;
  $("state").classList.toggle("error", error);
}

function populateDimensions() {
  const select = $("dimension");
  const previous = select.value;
  select.replaceChildren();
  const dimensions = state.config?.dimensions?.filter((item) =>
    item && item.active !== false && typeof item.key === "string"
  ) || [];
  for (const item of dimensions) {
    const option = document.createElement("option");
    option.value = item.key;
    option.textContent = (item.shortName ? item.shortName + " · " : "") + item.name;
    select.append(option);
  }
  if (dimensions.some((item) => item.key === previous)) select.value = previous;
}

function renderAllianceChips() {
  const list = $("alliance-chips");
  list.replaceChildren();
  state.alliances = knownAllowedAlliances();

  const activeKeys = new Set(state.alliances.map((alliance) => alliance.key));
  state.selectedAlliances = new Set(
    [...state.selectedAlliances].filter((key) => activeKeys.has(key) && isAllowed(key))
  );

  for (const alliance of state.alliances) {
    const label = document.createElement("label");
    label.className = "alliance-chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = alliance.key;
    input.checked = state.selectedAlliances.has(alliance.key);
    input.addEventListener("change", () => {
      if (!isAllowed(alliance.key)) {
        input.checked = false;
        state.selectedAlliances.delete(alliance.key);
      } else if (input.checked) {
        state.selectedAlliances.add(alliance.key);
      } else {
        state.selectedAlliances.delete(alliance.key);
      }
      renderAllianceChips();
      renderRanking();
    });
    const emoji = document.createElement("span");
    emoji.className = "alliance-chip-emoji";
    emoji.textContent = alliance.emoji || "";
    emoji.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "alliance-chip-name";
    label.dataset.allianceNameLines = "two";
    window.LoSPAlliances.renderAllianceName(text, alliance.key);
    label.append(input, emoji, text);
    list.append(label);
  }

  const allSelected = state.alliances.length > 0 &&
    state.alliances.every((alliance) => state.selectedAlliances.has(alliance.key));
  $("select-all").disabled = !state.alliances.length;
  $("select-all").textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  if (!state.alliances.length) {
    $("select-all").disabled = true;
    setMessage("Aucune alliance autorisée pour cette session.", true);
  }
}

function filteredRankingRows() {
  const visible = filterVisibleRosters(
    state.rows,
    state.selectedAlliances,
    allianceKey,
    isAllowed
  );
  return visible;
}

function selectedLoadFailures() {
  let count = 0;
  for (const key of state.loadErrors) {
    if (state.selectedAlliances.has(key) && isAllowed(key)) count += 1;
  }
  return count;
}

function renderRanking() {
  const list = $("ranking");
  list.replaceChildren();
  const rows = filteredRankingRows();
  const selectedCount = [...state.selectedAlliances].filter(isAllowed).length;
  const selectedDimension = dimension();
  const dimensionLabel = selectedDimension?.shortName || selectedDimension?.name || "Dimension noire";
  $("ranking-title").textContent = "Classement " + dimensionLabel;

  if (!state.alliances.length) {
    setMessage("Aucune alliance autorisée pour cette session.", true);
    $("ranking-summary").textContent = "";
    const item = document.createElement("li");
    item.textContent = "Aucun roster autorisé pour cette session.";
    list.append(item);
    return;
  }

  if (!selectedCount) {
    setMessage("Aucune alliance sélectionnée. Sélectionnez au moins une alliance pour afficher le classement.");
    $("ranking-summary").textContent = "";
    const item = document.createElement("li");
    item.textContent = "Sélectionnez une ou plusieurs alliances.";
    list.append(item);
    return;
  }

  const entries = rows.map((roster) => ({
    roster,
    result: evaluateDimension({dimension: selectedDimension, roster, catalog: state.catalog, firstClearObservedAt: firstClearAt(roster, selectedDimension)}),
  }));
  const completed = entries.filter((entry) => entry.result.completed);
  const ranking = rankResults(entries);
  const ordered = [...ranking.ranked, ...ranking.indeterminate];
  const theoretical = ranking.ranked.filter((entry) => !entry.result.completed);
  const unknown = ranking.indeterminate;

  const failures = selectedLoadFailures();
  const message = rows.length
    ? rows.length + " rosters partageables · " + selectedCount +
      (selectedCount === 1 ? " alliance sélectionnée" : " alliances sélectionnées") +
      (failures ? " · " + failures + (failures === 1 ?
        " alliance indisponible" : " alliances indisponibles") : "")
    : failures
      ? "Aucun roster disponible dans la sélection ; " + failures +
        (failures === 1 ? " alliance n’a pas pu être chargée." :
          " alliances n’ont pas pu être chargées.")
      : "Aucun roster partageable dans les alliances sélectionnées.";
  setMessage(state.loading ? "Chargement des rosters autorisés…" : message);

  $("ranking-summary").textContent = ordered.length
    ? completed.length + " " + dimensionLabel + " terminée(s) selon la convention LoSP · " +
      theoretical.length + " progression(s) théorique(s) classée(s) · " +
      unknown.length + " progression(s) indéterminée(s)"
    : "";

  if (!ordered.length) {
    const item = document.createElement("li");
    item.textContent = state.loading
      ? "Chargement des rosters autorisés…"
      : "Aucun roster partageable dans les alliances sélectionnées.";
    list.append(item);
    return;
  }

  for (const entry of ordered) {
    const finished = entry.result.completed;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player" + (finished ? " finished" : "");
    button.innerHTML =
      '<span class="place"></span><span><span class="player-name"></span>' +
      '<span class="meta"></span><span class="badge"></span></span>';
    button.querySelector(".place").textContent = Number.isFinite(entry.rank) ? String(entry.rank) : "—";
    button.querySelector(".player-name").textContent = entry.roster.player;
    button.querySelector(".meta").textContent =
      window.LoSPAlliances.getAllianceEmoji(entry.roster.alliance) + " " +
      window.LoSPAlliances.getAllianceLabel(entry.roster.alliance);
    button.querySelector(".badge").textContent = finished
      ? dimensionLabel + " · " + passageLabel(selectedDimension, entry.result.passages) + " · convention LoSP"
      : entry.result.status === "theoretical"
        ? "Théorique : " + entry.result.consecutive + "/" + (selectedDimension?.nodes?.length || 0) +
          " salles consécutives · " + entry.result.prepared + " salles préparées (roster, pas progression réelle)"
        : entry.result.status === "unavailable"
          ? "Roster non disponible pour le calcul"
          : "Progression théorique indéterminée (données incomplètes)";
    if (finished && entry.result.firstClearObservedAt) button.querySelector(".badge").textContent +=
      " · 1er passage observé le " + new Date(entry.result.firstClearObservedAt).toLocaleDateString("fr-FR") +
      (Number.isFinite(entry.result.firstClearDays) ? " (" + entry.result.firstClearDays + " jours)" : "");
    button.addEventListener("click", () => openIndividual(entry.roster));
    list.append(button);
  }
}

function playerStatus(evaluation, totalNodes) {
  if (evaluation.completed)
    return (dimension()?.shortName || "Dimension noire") + " · " + passageLabel(dimension(), evaluation.passages) + " selon la convention LoSP fondée sur le roster vérifié.";
  if (evaluation.status === "unavailable")
    return "Progression indisponible : aucun roster vérifié n’est chargé.";
  if (evaluation.status === "indeterminate")
    return "Progression théorique indéterminée : une ou plusieurs exigences officielles ne sont pas vérifiables. Aucune salle inconnue n’est déclarée franchissable.";
  if (evaluation.status === "theoretical")
    return "Progression théorique : " + evaluation.consecutive + " salle(s) consécutive(s) sur " +
      totalNodes + " ; " + evaluation.prepared + " exigence(s) de salle satisfaite(s) par le roster. Cela ne prouve pas la progression réelle en jeu.";
  return "Progression théorique non disponible.";
}

function nodeDescription(id, type, nodeState, completed) {
  const officialNode=dimension()?.nodes?.find(node=>node.id===id);
  const label=officialNode?.name ? officialNode.name+" ("+id+")" : "Salle "+id;
  const raw=officialNode?.requirementDescription?.[0];
  const requirements=typeof raw==="string"?" · "+raw.replace(/<[^>]*>/g,"").replace(/^REQUIRES:\s*/i,"Exigences : "):"";
  const prefix=label+requirements;
  if (type === "portal")
    return (id === dimension()?.map?.startId ? "Départ " : "Passage ") + id +
      ". Les connexions sont visuelles et ne définissent pas les déverrouillages.";
  if (completed)
    return prefix +
      " · " + (dimension()?.shortName || "Dimension noire") +
      " terminée à 100 % selon la convention LoSP de récompense. Cette convention ne constitue pas un historique officiel.";

  if (nodeState === "true")
    return prefix +
      " · le roster vérifié satisfait les exigences officielles connues. C’est une indication théorique, pas une preuve de progression réelle.";
  if (nodeState === "false")
    return prefix +
      " · le roster vérifié ne satisfait pas actuellement les exigences officielles de cette salle.";
  return prefix +
    " · exigences officielles absentes ou non interprétables ; état indéterminé.";
}

function renderMap(roster) {
  const selectedDimension = dimension();
  const mapElement = $("map");
  const card = $("individual-card");
  const info = $("node-info");
  card.hidden = false;
  mapElement.replaceChildren();

  if (!selectedDimension?.map) {
    card.hidden = true;
    $("individual-state").textContent = "La carte de cette Dimension noire n’est pas disponible.";
    return;
  }
  if (!isAllowed(allianceKey(roster?.alliance))) {
    $("player-select").value = "";
    state.selectedPlayerIdentity = "";
    clearMap("Accès au roster révoqué ; sélectionnez un joueur autorisé.");
    return;
  }

  const layout = createMapLayout(selectedDimension.map);
  if (!layout) {
    mapElement.setAttribute("aria-label", "Carte indisponible");
    info.textContent = "La géométrie officielle de la carte n’est pas disponible.";
    return;
  }

  const map = selectedDimension.map;
  const evaluation = evaluateDimension({
    dimension: selectedDimension,
    roster,
    catalog: state.catalog,
    firstClearObservedAt: firstClearAt(roster, selectedDimension),
  });
  const nodeStates = new Map(evaluation.nodeStates.map((item) => [item.id, item.state]));
  mapElement.setAttribute("aria-label", "Carte " + selectedDimension.shortName +
    " pour " + (roster.player || "le joueur sélectionné"));
  mapElement.style.setProperty("--map-natural-width", layout.width + "px");
  mapElement.style.setProperty("--map-ratio", layout.width + " / " + layout.height);
  mapElement.style.setProperty("--map-column-tracks", layout.columnTracks);
  mapElement.style.setProperty("--map-row-tracks", layout.rowTracks);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "map-tracks");
  svg.setAttribute("aria-hidden", "true");
  for (const edge of map.visualEdges || []) {
    const start = layout.position(edge[0]);
    const end = layout.position(edge[1]);
    if (!start || !end) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
    svg.append(line);
  }
  mapElement.append(svg);

  for (const row of layout.rows) {
    const label = document.createElement("span");
    label.className = "coord";
    label.style.gridColumn = "1";
    label.style.gridRow = String(layout.gridPosition(map.columns[0] + row)?.row);
    label.textContent = String(row);
    mapElement.append(label);
  }
  layout.columns.forEach((column, index) => {
    const label = document.createElement("span");
    label.className = "coord";
    label.style.gridColumn = String(index + 2);
    label.style.gridRow = "1";
    label.textContent = column;
    mapElement.append(label);
  });

  const roomIds = [...new Set([
    ...(map.combatNodeIds || []),
    ...(map.portalIds || []),
    map.startId,
  ].filter(Boolean))];

  for (const id of roomIds) {
    const position = layout.gridPosition(id);
    if (!position) continue;
    const combat = (map.combatNodeIds || []).includes(id);
    const portal = (map.portalIds || []).includes(id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node " + (combat ? "combat" : portal ? "portal" : "start");
    if (combat) {
      if (evaluation.completed) button.classList.add("done");
      else if (nodeStates.get(id) === "true")
        button.classList.add("requirements-met");
      else if (nodeStates.get(id) === "false")
        button.classList.add("requirements-unmet");
    }
    button.style.gridColumn = String(position.column);
    button.style.gridRow = String(position.row);
    button.textContent = id;
    button.setAttribute("aria-label", nodeDescription(
      id, portal ? "portal" : combat ? "combat" : "start",
      nodeStates.get(id) || "unknown", evaluation.completed
    ));
    button.addEventListener("click", () => {
      info.textContent = nodeDescription(
        id, portal ? "portal" : combat ? "combat" : "start",
        nodeStates.get(id) || "unknown", evaluation.completed
      );
      mapElement.querySelectorAll(".node.selected")
        .forEach((node) => node.classList.remove("selected"));
      button.classList.add("selected");
    });
    mapElement.append(button);
  }

  $("detail-title").textContent =
    roster.player + " · " + selectedDimension.shortName;
  $("progress-summary").textContent =
    playerStatus(evaluation, selectedDimension.nodes?.length || 0);
  info.textContent = playerStatus(evaluation, selectedDimension.nodes?.length || 0);
}

function clearMap(message) {
  $("individual-card").hidden = true;
  $("map").replaceChildren();
  $("node-info").textContent = message;
  $("individual-state").textContent = message;
}

function renderPlayerChoices() {
  const select = $("player-select");
  const previousIdentity = state.selectedPlayerIdentity;
  const rows = authorizedRows();
  state.individualRows = rows;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = rows.length
    ? "— Choisir un joueur —"
    : "Aucun roster autorisé disponible";
  select.append(placeholder);

  rows.forEach((roster, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = roster.player + " · " +
      window.LoSPAlliances.getAllianceLabel(roster.alliance);
    option.dataset.identity = identity(roster);
    select.append(option);
  });

  select.disabled = !rows.length;
  const selectedIndex = rows.findIndex((roster) => identity(roster) === previousIdentity);
  if (selectedIndex >= 0) {
    select.value = String(selectedIndex);
    state.selectedPlayerIdentity = previousIdentity;
    renderMap(rows[selectedIndex]);
  } else {
    select.value = "";
    state.selectedPlayerIdentity = "";
    clearMap(rows.length
      ? "Sélectionnez un joueur autorisé pour afficher sa progression théorique."
      : "Aucun roster partageable accessible pour cette session.");
  }
  $("individual-state").textContent = rows.length
    ? rows.length + " joueurs issus des rosters autorisés."
    : "Aucun roster partageable accessible pour cette session.";
}

function selectPlayer(roster) {
  if (!isAllowed(allianceKey(roster?.alliance))) return;
  const index = state.individualRows.findIndex((item) => identity(item) === identity(roster));
  if (index < 0) {
    renderPlayerChoices();
    return;
  }
  state.selectedPlayerIdentity = identity(roster);
  $("player-select").value = String(index);
  renderMap(state.individualRows[index]);
  activateTab("individual", true);
}

function openIndividual(roster) {
  renderPlayerChoices();
  selectPlayer(roster);
}

function activateTab(name, focus = false) {
  const individual = name === "individual";
  const tab = $(individual ? "tab-individual" : "tab-ranking");
  const other = $(individual ? "tab-ranking" : "tab-individual");
  const activePanel = $(individual ? "panel-individual" : "panel-ranking");
  const otherPanel = $(individual ? "panel-ranking" : "panel-individual");

  tab.setAttribute("aria-selected", "true");
  tab.tabIndex = 0;
  tab.classList.add("is-active");
  other.setAttribute("aria-selected", "false");
  other.tabIndex = -1;
  other.classList.remove("is-active");
  activePanel.hidden = false;
  otherPanel.hidden = true;

  if (individual) renderPlayerChoices();
  if (focus) tab.focus();
}

function wireTabs() {
  const tabs = [$("tab-ranking"), $("tab-individual")];
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    activateTab(tab.id === "tab-individual" ? "individual" : "ranking");
  }));
  $("dd-tabs").addEventListener("keydown", (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    activateTab(next === 0 ? "ranking" : "individual", true);
  });
}

async function loadRosters() {
  const keys = state.alliances.map((alliance) => alliance.key);
  if (!keys.length) return;
  const loaded = await window.LoSPRosterLoader.loadMany(keys);
  state.rows = loaded.rosters;
  state.loadErrors = new Set(loaded.warnings
    .map((warning) => allianceKey(String(warning).split(" : ", 1)[0]))
    .filter(Boolean));
}

async function boot() {
  try {
    await window.LoSP_AUTH_READY;
    await window.LoSPAlliances.loadAlliances();
    const [config, characters, rosterMeta, firstClears] = await Promise.all([
      fetch("./data/dark-dimensions.json", {cache: "no-store"}).then((response) => {
        if (!response.ok) throw new Error("Configuration Dimensions noires indisponible.");
        return response.json();
      }),
      fetch("./data/msf-characters.json", {cache: "no-store"}).then((response) => {
        if (!response.ok) throw new Error("Catalogue personnages indisponible.");
        return response.json();
      }),
      fetch("./data/rosters-meta.json", {cache: "no-store"})
        .then((response) => response.ok ? response.json() : {}),
      fetch("./data/dd-first-clears.json", {cache: "no-store"})
        .then((response) => response.ok ? response.json() : {})
        .catch(() => ({})),
    ]);

    state.config = config;
    state.firstClearObservations = firstClears?.observations || {};
    state.catalog = characters.filter((character) => character.player_Character === true);
    populateDimensions();
    $("freshness").textContent = "Rosters publiés le " +
      (rosterMeta.updatedAt
        ? new Date(rosterMeta.updatedAt).toLocaleString("fr-FR")
        : "date inconnue");

    state.alliances = knownAllowedAlliances();
    state.selectedAlliances = new Set(state.alliances.map((alliance) => alliance.key));
    renderAllianceChips();
    wireTabs();
    $("select-all").addEventListener("click", () => {
      state.alliances = knownAllowedAlliances();
      const allSelected = state.alliances.length > 0 &&
        state.alliances.every((alliance) => state.selectedAlliances.has(alliance.key));
      state.selectedAlliances = new Set(allSelected ? [] : state.alliances
        .filter((alliance) => isAllowed(alliance.key))
        .map((alliance) => alliance.key));
      renderAllianceChips();
      renderRanking();
    });
    $("dimension").addEventListener("change", () => {
      renderRanking();
      if (state.selectedPlayerIdentity) renderPlayerChoices();
    });
    $("player-select").addEventListener("change", () => {
      const index = Number($("player-select").value);
      const roster = Number.isSafeInteger(index) ? state.individualRows[index] : null;
      if (!roster) {
        state.selectedPlayerIdentity = "";
        clearMap("Sélectionnez un joueur autorisé pour afficher sa progression théorique.");
        return;
      }
      state.selectedPlayerIdentity = identity(roster);
      renderMap(roster);
    });

    renderRanking();
    setMessage("Chargement des rosters autorisés…");
    await loadRosters();
    state.loading = false;
    renderAllianceChips();
    renderRanking();
    renderPlayerChoices();
  } catch (error) {
    state.loading = false;
    setMessage(error?.message || "Erreur de chargement.", true);
    $("individual-state").textContent = error?.message || "Rosters indisponibles.";
  }
}

boot();
