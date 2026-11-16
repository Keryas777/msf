import {rankResults, evaluateDimension} from "./dd-ranking-engine.mjs";
import {filterVisibleRosters, createMapLayout} from "./dimensions-noires-view.mjs";
import {mergeOfficialCodexTraits} from "./dd-character-traits.mjs";
import {progressSections, progressFills} from "./dd-progress-sections.mjs";

const $ = (id) => document.getElementById(id);
const state = {
  rows: [],
  catalog: [],
  traitsWarning: "",
  config: null,
  firstClearObservations: {},
  alliances: [],
  selectedAlliances: new Set(),
  individualRows: [],
  selectedPlayerIdentity: "",
  selectedIndividualAlliance: "",
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
    const item = document.createElement("li");
    item.textContent = "Aucun roster autorisé pour cette session.";
    list.append(item);
    return;
  }

  if (!selectedCount) {
    setMessage("Aucune alliance sélectionnée. Sélectionnez au moins une alliance pour afficher le classement.");
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
  // Keep loading, empty-selection and data warnings; hide routine roster counters.
  setMessage(state.loading ? "Chargement des rosters autorisés…" :
    (!ordered.length || failures ? message : "") +
    (state.traitsWarning ? (ordered.length && !failures ? "" : " · ") + state.traitsWarning : ""));



  if (!ordered.length) {
    const item = document.createElement("li");
    item.textContent = state.loading
      ? "Chargement des rosters autorisés…"
      : "Aucun roster partageable dans les alliances sélectionnées.";
    list.append(item);
    return;
  }

  let previousRank = null;
  for (const entry of ordered) {
    const finished = entry.result.completed;
    const twiceFinished = finished && entry.result.passages >= 2;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player" + (finished ? " finished" : "") + (twiceFinished ? " finished-twice" : "") + (!finished && entry.result.status === "theoretical" ? " theoretical" : "");
    button.innerHTML =
      '<span class="place"></span><span class="player-details"><span class="player-name"></span>' +
      '<span class="meta"></span><span class="badge"></span></span>';
    const rank = Number.isFinite(entry.rank) ? entry.rank : null;
    button.querySelector(".place").textContent = rank !== null && rank !== previousRank ? String(rank) : "—";
    previousRank = rank;
    button.querySelector(".player-name").textContent = entry.roster.player;
    const allianceMeta = button.querySelector(".meta");
    const allianceId = allianceKey(entry.roster.alliance);
    const emoji = document.createElement("span");
    emoji.textContent = window.LoSPAlliances.getAllianceEmoji(allianceId);
    emoji.setAttribute("aria-hidden", "true");
    const allianceName = document.createElement("span");
    allianceName.className = "ranking-alliance-name";
    window.LoSPAlliances.renderAllianceName(allianceName, allianceId);
    allianceMeta.replaceChildren(emoji, document.createTextNode(" "), allianceName);
    const badge = button.querySelector(".badge");
    if (finished) {
      const tier = selectedDimension?.completionRule?.tiers?.find((item) => item.passages === entry.result.passages);
      const heading = document.createElement("span");
      heading.className = "dd-badge-line";
      heading.textContent = twiceFinished ? "2ème passage terminé" : "1er passage terminé";
      badge.append(heading);
      if (tier) {
        const rewards = document.createElement("span");
        rewards.className = "dd-badge-line";
        rewards.append(document.createTextNode("Annihilus " + tier.minYellowStars + " "));
        const yellow = document.createElement("span");
        yellow.className = "dd-star-yellow";
        yellow.textContent = "★";
        rewards.append(yellow, document.createTextNode(" - " + tier.minRedStars + " "));
        const red = document.createElement("span");
        red.className = "dd-star-red";
        red.textContent = "★";
        rewards.append(red);
        badge.append(rewards);
      }
    } else if (entry.result.status === "theoretical") {
      const total = selectedDimension?.nodes?.length || 0;
      const first = document.createElement("span");
      first.className = "dd-badge-line";
      first.textContent = entry.result.consecutive + " / " + total + " salles consécutives prêtes";
      const second = document.createElement("span");
      second.className = "dd-badge-line";
      second.textContent = entry.result.prepared + " / " + total + " salles prêtes au total";
      badge.append(first, second);
    } else {
      badge.textContent = entry.result.status === "unavailable"
        ? "Roster non disponible pour le calcul"
        : Number.isFinite(entry.result.consecutive)
          ? "Théorique : " + entry.result.consecutive + "/" + (selectedDimension?.nodes?.length || 0) +
            " salles consécutives confirmées · préparation totale indéterminée (non classé)"
          : "Progression théorique indéterminée (données incomplètes)";
    }
    if (finished || entry.result.status === "theoretical") {
      const sizes = progressSections(selectedDimension?.nodes || []);
      const total = sizes.reduce((sum, size) => sum + size, 0);
      const count = finished ? total : Math.max(0, Math.min(total, entry.result.consecutive || 0));
      if (total > 0) {
        const wrap = document.createElement("span");
        wrap.className = "dd-progress" + (finished ? " dd-progress--complete" : "") + (twiceFinished ? " dd-progress--twice" : "");
        wrap.setAttribute("role", "progressbar");
        wrap.setAttribute("aria-label", finished ? (twiceFinished ? "Deux passages terminés (convention LoSP)" : "Premier passage terminé (convention LoSP)") : "Salles théoriquement accessibles consécutivement");
        wrap.setAttribute("aria-valuemin", "0");
        wrap.setAttribute("aria-valuemax", String(total));
        wrap.setAttribute("aria-valuenow", String(count));
        const track = document.createElement("span");
        track.className = "dd-progress-track";
        for (const [index, size] of sizes.entries()) {
          const segment = document.createElement("span");
          segment.className = "dd-progress-segment";
          segment.style.flexGrow = String(size);
          segment.style.setProperty("--dd-fill", progressFills(sizes, count, finished)[index] + "%");
          // Delimit individual combat nodes without changing the seven section widths.
          for (let node = 1; node < size; node++) {
            const divider = document.createElement("span");
            divider.className = "dd-progress-node-divider";
            divider.style.left = (node / size * 100) + "%";
            divider.setAttribute("aria-hidden", "true");
            segment.append(divider);
          }
          track.append(segment);
        }
        wrap.append(track);
        button.querySelector(".player-details").append(wrap);
      }
    }
    if (twiceFinished) {
      // SVG viewBox is normalized, so the arcs follow responsive card dimensions.
      const ns = "http://www.w3.org/2000/svg";
      const frame = document.createElementNS(ns, "svg");
      frame.setAttribute("class", "dd-electric-frame");
      frame.setAttribute("viewBox", "0 0 1000 400");
      frame.setAttribute("preserveAspectRatio", "none");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("focusable", "false");
      const paths = [
        ["dd-electric-core", "M22 2 L145 2 178 9 218 2 302 2 333 10 361 2 449 2 475 9 506 2 609 2 638 10 669 2 773 2 810 8 838 2 978 2 Q998 2 998 22 L998 378 Q998 398 978 398 L815 398 787 390 760 398 653 398 620 390 591 398 474 398 446 391 412 398 305 398 275 390 245 398 22 398 Q2 398 2 378 L2 22 Q2 2 22 2 Z"],
        ["dd-electric-arc dd-electric-arc-a", "M18 6 L105 12 128 1 156 9 193 2 225 14 251 4 310 8 344 1 389 10 421 3 472 12 512 2 549 10 589 4 625 13 664 3 715 9 756 1 796 11 844 4 886 12 922 3 984 8 994 31 988 77 999 117 989 163 998 211 990 256 998 301 988 353 986 390"],
        ["dd-electric-arc dd-electric-arc-b", "M13 11 L4 58 14 91 3 129 11 174 2 218 13 259 3 303 12 345 10 385 47 392 92 386 130 399 179 388 224 395 264 387 301 399 349 388 390 395 434 386 477 397 521 388 565 397 612 386 650 396 697 388 746 399 793 386 836 395 876 388 918 397 984 391"],
        ["dd-electric-arc dd-electric-arc-c", "M20 4 L148 5 181 1 226 6 272 3 321 8 373 2 421 6 468 2 519 8 562 2 617 7 668 1 715 6 762 3 810 7 863 2 910 6 979 4 997 27 993 76 997 129 991 180 997 228 992 278 997 327 992 377 978 396"]
      ];
      for (const [className, d] of paths) {
        const path = document.createElementNS(ns, "path");
        path.setAttribute("class", className);
        path.setAttribute("d", d);
        frame.append(path);
      }
      button.append(frame);
    }
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
    return "Progression théorique\n" +
      evaluation.consecutive + " / " + totalNodes + " salle" + (evaluation.consecutive > 1 ? "s" : "") + " consécutive" + (evaluation.consecutive > 1 ? "s" : "") + " prête" + (evaluation.consecutive > 1 ? "s" : "") + "\n" +
      evaluation.prepared + " / " + totalNodes + " pré-requis validés dans le roster.\n" +
      "Cela ne prouve pas la progression réelle en jeu.";
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

  // Keep official visualEdges (including intermediate coordinates) for the
  // route, but only combat rooms are interactive nodes.
  const roomIds = [...new Set(map.combatNodeIds || [])];

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
      info.hidden = false;
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
  info.hidden = true;
  info.textContent = "";
}

function clearMap(message) {
  $("individual-card").hidden = true;
  $("map").replaceChildren();
  $("node-info").textContent = message;
  $("individual-state").textContent = message;
}

function renderIndividualAlliances(rows) {
  const list = $("individual-alliance-choices");
  list.replaceChildren();
  const available = new Set(rows.map((roster) => allianceKey(roster.alliance)));
  const alliances = knownAllowedAlliances().filter((alliance) => available.has(alliance.key));
  if (!alliances.some((alliance) => alliance.key === state.selectedIndividualAlliance)) {
    state.selectedIndividualAlliance = "";
    state.selectedPlayerIdentity = "";
  }
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = alliances.length ? "— Choisir une alliance —" : "Aucune alliance disponible";
  list.append(placeholder);
  for (const alliance of alliances) {
    const option = document.createElement("option");
    option.value = alliance.key;
    option.textContent = (alliance.emoji ? alliance.emoji + " " : "") + (alliance.name || alliance.label || alliance.key);
    list.append(option);
  }
  list.value = state.selectedIndividualAlliance;
  list.disabled = !alliances.length;
  list.onchange = () => {
    const key = list.value;
    if (key && !isAllowed(key)) {
      list.value = state.selectedIndividualAlliance;
      return;
    }
    if (state.selectedIndividualAlliance !== key) state.selectedPlayerIdentity = "";
    state.selectedIndividualAlliance = key;
    renderPlayerChoices();
  };
  $("individual-alliance-help").textContent = alliances.length
    ? "Choisissez une alliance pour afficher ses joueurs."
    : "Aucune alliance avec roster partageable accessible.";
}

function renderPlayerChoices() {
  const select = $("player-select");
  const previousIdentity = state.selectedPlayerIdentity;
  const authorized = authorizedRows();
  renderIndividualAlliances(authorized);
  const rows = state.selectedIndividualAlliance
    ? authorized.filter((roster) => allianceKey(roster.alliance) === state.selectedIndividualAlliance)
    : [];
  state.individualRows = rows;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = !state.selectedIndividualAlliance
    ? "— Choisir d’abord une alliance —"
    : rows.length ? "— Choisir un joueur —" : "Aucun joueur autorisé";
  select.append(placeholder);

  rows.forEach((roster, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = roster.player;
    option.dataset.identity = identity(roster);
    select.append(option);
  });

  select.disabled = !state.selectedIndividualAlliance || !rows.length;
  const selectedIndex = rows.findIndex((roster) => identity(roster) === previousIdentity);
  if (selectedIndex >= 0) {
    select.value = String(selectedIndex);
    state.selectedPlayerIdentity = previousIdentity;
    renderMap(rows[selectedIndex]);
  } else {
    select.value = "";
    state.selectedPlayerIdentity = "";
    clearMap(!state.selectedIndividualAlliance
      ? "Sélectionnez d’abord une alliance, puis un joueur autorisé."
      : rows.length
        ? "Sélectionnez un joueur pour afficher sa progression théorique."
        : "Aucun roster partageable pour cette alliance.");
  }
  $("individual-state").textContent = !state.selectedIndividualAlliance
    ? authorized.length + " joueurs issus des rosters autorisés."
    : rows.length + " joueurs autorisés dans cette alliance.";
}

function selectPlayer(roster) {
  const key = allianceKey(roster?.alliance);
  if (!isAllowed(key)) return;
  if (state.selectedIndividualAlliance !== key) {
    state.selectedIndividualAlliance = key;
    renderPlayerChoices();
  }
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
    const [config, characters, rosterMeta, firstClears, traitsFile, codexManifest] = await Promise.all([
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
      fetch("./data/dd-character-traits.json", {cache: "no-store"})
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null),
      fetch("./data/msf-capabilities-explorer/manifest.json", {cache: "no-store"})
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null),
    ]);

    state.config = config;
    state.firstClearObservations = firstClears?.observations || {};
    const playable = characters.filter((character) => character.player_Character === true);
    try {
      state.catalog = mergeOfficialCodexTraits(playable, traitsFile, codexManifest);
    } catch (error) {
      // Keep completion rankings, but never infer filtered DD9 eligibility from partial tags.
      state.catalog = playable;
      state.traitsWarning = "Tags officiels du Codex indisponibles ou à actualiser";
      console.warn("dd9-official-traits", error);
    }
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
