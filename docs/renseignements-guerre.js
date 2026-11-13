(() => {
  "use strict";

  const WAR_INTEL_API = "https://msf-cosmic-defenses.deliriousfan7.workers.dev/api/war-intelligence";
  const DATA_FALLBACK = "./data/war-intelligence.json";
  const ADMIN_MODE = document.body?.dataset?.warIntelAdmin === "true";
  const DEMO_MODE = !ADMIN_MODE && new URLSearchParams(location.search).get("demo") === "1";

  const rooms = [
    { id: "soute", name: "Soute", icon: "▣", range: "adjacent", color: "#FACC15", effect: "À chaque tour, les personnages avec Attaque augmentée gagnent +10 % de Barrière." },
    { id: "hangar", name: "Hangar", icon: "✈", range: "adjacent", color: "#F97316", effect: "+15 % de Barrière max pour tous les alliés en défense." },
    { id: "security", name: "Sécurité", icon: "⬡", range: "adjacent", color: "#EF4444", effect: "À l’apparition, applique Défense réduite aux alliés en attaque." },
    { id: "tech", name: "Labo technique", icon: "⌬", range: "adjacent", color: "#3DCE73", effect: "À l’apparition, applique Défense augmentée aux alliés en défense." },
    { id: "armory", name: "Armurerie", icon: "⫶", range: "adjacent", color: "#3B82F6", effect: "À chaque tour, les alliés en attaque avec Défense réduite inversent tous les effets actifs sur soi." },
    { id: "infirmary", name: "Infirmerie", icon: "✚", range: "adjacent", color: "#D946EF", effect: "Lors d’un coup réussi, les alliés en défense gagnent Régénération." },
    { id: "bridge", name: "Pont", icon: "◉", range: "room", color: "#d6acff", effect: "À l’apparition, applique 10 effets bénéfiques aléatoires aux alliés en défense." },
    { id: "reactor", name: "Réacteur", icon: "☢", range: "room", color: "#ffcb72", effect: "À l’apparition, applique Saignement aux alliés en attaque." },
    { id: "barracks", name: "Caserne", icon: "✣", range: "global", color: "#ffe27c", effect: "À l’apparition, tous les personnages obtiennent Attaque augmentée." }
  ];
  // Inline SVG pictograms: recognizable at mobile size, with no external assets or dependencies.
  const roomPoints = { soute: 40000, hangar: 15000, security: 20000, tech: 20000, armory: 15000, infirmary: 25000, bridge: 50000, reactor: 10000, barracks: 25000 };
  const flightDeckPoints = 10000;
  const formatRoomPoints = points => new Intl.NumberFormat("fr-FR").format(points) + " pts";
  const roomIconPaths = {
    soute: '<path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 5 9-5M12 12v9"/>',
    hangar: '<path d="M12 2.5c-.8 0-1.4.7-1.4 1.6v6.1L3 14.3v2.8l7.6-2.1v4.2l-2.7 1.9v1.5l4.1-1.1 4.1 1.1v-1.5l-2.7-1.9V15l7.6 2.1v-2.8l-7.6-4.1V4.1c0-.9-.6-1.6-1.4-1.6Z"/>',
    security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    tech: '<path d="M9 3h6M10 3v7l-6.7 9.3A2 2 0 0 0 4.9 22h14.2a2 2 0 0 0 1.6-2.7L14 10V3M7.5 16h9"/>',
    armory: '<path d="M3 20V9h5v11zM10 20V9h5v11zM17 20V9h5v11z"/><path d="M3 9V6l2.5-3L8 6v3M10 9V6l2.5-3L15 6v3M17 9V6l2.5-3L22 6v3"/><path d="M3 17h5M10 17h5M17 17h5"/>',
    infirmary: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
    bridge: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M7 7l10 10M17 7 7 17"/>',
    reactor: '<circle cx="12" cy="12" r="2"/><path d="M9.5 7.7 7 3.5a10 10 0 0 1 10 0l-2.5 4.2M16.4 13l4.8 1a10 10 0 0 1-5 8.6l-2.4-4.3M7.6 13l-4.8 1a10 10 0 0 0 5 8.6l2.4-4.3"/>',
    barracks: '<circle cx="5" cy="8" r="2"/><circle cx="12" cy="6" r="2.5"/><circle cx="19" cy="8" r="2"/><path d="M1.5 19v-4a3.5 3.5 0 0 1 7 0v4zM8 20v-6a4 4 0 0 1 8 0v6zM15.5 19v-4a3.5 3.5 0 0 1 7 0v4z"/>'
  };

  function roomIcon(room) {
    const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgIcon.setAttribute("viewBox", "0 0 24 24");
    svgIcon.setAttribute("width", "23");
    svgIcon.setAttribute("height", "23");
    svgIcon.setAttribute("fill", "none");
    svgIcon.setAttribute("stroke", "currentColor");
    svgIcon.setAttribute("stroke-width", "1.9");
    svgIcon.setAttribute("stroke-linecap", "round");
    svgIcon.setAttribute("stroke-linejoin", "round");
    svgIcon.setAttribute("aria-hidden", "true");
    svgIcon.innerHTML = roomIconPaths[room.id] || "";
    return svgIcon;
  }

  const flightDecks = [
    { name: "Pont d’envol 1", position: 0 },
    { name: "Pont d’envol 2", position: 1 },
    { name: "Pont d’envol 3", position: 2 }
  ];
  let observations = [];
  let alliances = [];
  const positions = Array.from({ length: 12 }, (_, index) => index);
  const roomsById = new Map(rooms.map(room => [room.id, room]));
  const board = document.getElementById("intelBoard");
  const detail = document.getElementById("intelDetail");
  const svg = document.getElementById("intelConnections");
  const allianceSelect = document.getElementById("intelAlliance");
  const observationSelect = document.getElementById("intelObservation");
  const emptyState = document.getElementById("intelEmpty");
  let mode = "overview";
  let selected = 11;
  let currentObservation = null;
  let editHandler = null;
  let dataLoaded = false;

  function displayName(alliance) {
    const rich = alliance?.richName;
    if (rich?.schemaVersion === 1 && Array.isArray(rich.segments) && rich.segments.length) {
      return rich.segments.map(segment => String(segment?.text || "")).join("").trim() || alliance.name;
    }
    return String(alliance?.name || "Alliance inconnue");
  }
  function renderAllianceDisplay(alliance) {
    const target = document.getElementById("intelAllianceDisplay");
    if (!target) return;
    target.replaceChildren();
    const rich = alliance?.richName;
    if (rich?.schemaVersion === 1 && Array.isArray(rich.segments) && rich.segments.some(segment => segment?.text)) {
      rich.segments.forEach(segment => {
        const span = document.createElement("span");
        span.textContent = String(segment?.symbol || "") + String(segment?.text || "");
        if (/^#[0-9a-f]{6}$/i.test(String(segment?.color || ""))) span.style.color = segment.color;
        target.append(span);
      });
    } else target.textContent = String(alliance?.name || "");
    target.hidden = !alliance;
  }

  async function loadData() {
    let data;
    if (DEMO_MODE) {
      const response = await fetch("./data/war-intelligence-demo.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Données de démonstration indisponibles.");
      data = await response.json();
    } else try {
      const response = await fetch(WAR_INTEL_API, { cache: "no-store", mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error("api_unavailable");
      data = await response.json();
      if (data?.ok !== true || !Array.isArray(data.alliances) || !Array.isArray(data.observations)) throw new Error("invalid_api_data");
    } catch {
      const response = await fetch(DATA_FALLBACK, { cache: "no-store" });
      if (!response.ok) throw new Error("Données des renseignements indisponibles.");
      data = await response.json();
    }
    if (data?.schemaVersion !== 1 || !Array.isArray(data.alliances) || !Array.isArray(data.observations))
      throw new Error("Format des renseignements invalide.");
    alliances = data.alliances.filter(item => item && typeof item.id === "string" && typeof item.name === "string");
    observations = data.observations.filter(item => item && item.status === "published" && Array.isArray(item.layout) && item.layout.length === 9);
    dataLoaded = true;
    return { alliances, observations };
  }

  function byRecentDate(items) {
    return [...items].sort((a, b) => b.date.localeCompare(a.date));
  }

  function roomAt(position) {
    if (position < 3 || !currentObservation) return null;
    return roomsById.get(currentObservation.layout[position - 3]) || null;
  }

  function adjacent(position) {
    const row = Math.floor(position / 3);
    const column = position % 3;
    return positions.filter(target => {
      const targetRow = Math.floor(target / 3);
      const targetColumn = target % 3;
      return Math.abs(row - targetRow) + Math.abs(column - targetColumn) === 1;
    });
  }

  function cellForRoom(room) {
    return [...board.querySelectorAll(".intelCell")].find(item => item.dataset.roomId === room.id);
  }

  function emittedTargets(room) {
    if (!room) return [];
    if (room.range === "global") return positions;
    const cell = cellForRoom(room);
    if (!cell) return [];
    const position = Number(cell.dataset.cell);
    if (room.range === "room") return [position];
    return adjacent(position);
  }

  function receivedSources(position) {
    return [...board.querySelectorAll(".intelCell")]
      .map(cell => ({ position: Number(cell.dataset.cell), room: roomAt(Number(cell.dataset.cell)) }))
      .filter(item => item.room && emittedTargets(item.room).includes(position));
  }

  function currentTargets() {
    if (mode === "emitted") return emittedTargets(roomAt(selected));
    if (mode === "received") return receivedSources(selected).map(item => item.position);
    return [];
  }

  function makeCell(position, room) {
    const cell = document.createElement("div");
    cell.className = "intelCell" + (position < 3 ? " intelFlightCell" : "");
    cell.dataset.cell = String(position);
    if (room) cell.dataset.roomId = room.id;

    const isFlight = position < 3;
    const button = document.createElement("button");
    button.type = "button";
    button.className = room ? "intelRoom room-" + room.id : isFlight ? "intelRoom intelFlight" : "intelRoom intelUnknown";
    button.dataset.position = String(position);
    button.style.setProperty("--room-color", room?.color || "#8edfff");
    button.setAttribute("aria-label", (ADMIN_MODE && !isFlight ? "Choisir la salle, emplacement " + (position - 2) + ". " : "Sélectionner ") + (room?.name || (isFlight ? flightDecks[position].name : "Salle inconnue")));
    button.setAttribute("aria-pressed", "false");

    const icon = room ? document.createElement("span") : null;
    if (icon) {
      icon.className = "intelRoomIcon";
      icon.setAttribute("aria-hidden", "true");
      icon.append(roomIcon(room));
    }
    const name = document.createElement("strong");
    name.textContent = room?.name || (isFlight ? flightDecks[position].name : "Salle inconnue");

    const heading = document.createElement("span");
    heading.className = "intelRoomHeading";
    const points = document.createElement("span");
    points.className = "intelRoomPoints";
    points.textContent = formatRoomPoints(room ? roomPoints[room.id] : isFlight ? flightDeckPoints : 0);
    heading.append(name, points);

    if (room) {
      const range = document.createElement("span");
      range.className = "intelRange";
      range.textContent = room.range === "room" ? "SALLE" : room.range === "global" ? "GLOBALE" : "ADJACENTE";
      button.append(icon, heading, range);
    } else if (isFlight) {
      const runway = document.createElement("span");
      runway.className = "runway";
      runway.setAttribute("aria-hidden", "true");
      runway.append(document.createElement("i"));
      const tower = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tower.setAttribute("class", "flightControlTower");
      tower.setAttribute("viewBox", "0 0 32 36");
      tower.setAttribute("aria-hidden", "true");
      tower.innerHTML = '<path d="M12 32V18h12v14" fill="#305b75" stroke="#93d8f3" stroke-width="1.5"/><path d="M7 13h21l-3 6H10z" fill="#5b9bb9" stroke="#b2eaff" stroke-width="1.4"/><path d="M9 14h17l-2 3H11z" fill="#102c40"/><path d="M14 13V6h9v7" fill="#457d9b" stroke="#93d8f3" stroke-width="1.2"/><path d="M19 6V2m0 1 5 2" fill="none" stroke="#a7e9ff" stroke-width="1.2"/><path d="M15 22h6m-6 4h6" stroke="#a5dff3" stroke-width="1.3"/><path d="M5 32h24" stroke="#7bc2e5" stroke-width="1.5"/>';
      runway.append(tower);
      button.append(heading, runway);
    } else {
      const unknown = document.createElement("span");
      unknown.className = "intelUnknownMark";
      unknown.setAttribute("aria-hidden", "true");
      unknown.textContent = "?";
      button.append(unknown, heading);
    }
    cell.append(button);
    return cell;
  }

  function renderBoard() {
    const cells = flightDecks.map(deck => makeCell(deck.position, null));
    if (currentObservation) {
      currentObservation.layout.forEach((roomId, index) => cells.push(makeCell(index + 3, roomsById.get(roomId) || null)));
    }
    board.replaceChildren(svg, ...cells);
    board.hidden = !currentObservation && !ADMIN_MODE;
    emptyState.hidden = Boolean(currentObservation);
    if (currentObservation && !rooms.some(room => room.id === roomAt(selected)?.id)) selected = 11;
  }

  function line(from, to) {
    const boardRect = board.getBoundingClientRect();
    const source = board.querySelector('[data-cell="' + from + '"]');
    const target = board.querySelector('[data-cell="' + to + '"]');
    if (!source || !target) return null;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
    element.setAttribute("x1", String(sourceRect.left + sourceRect.width / 2 - boardRect.left));
    element.setAttribute("y1", String(sourceRect.top + sourceRect.height / 2 - boardRect.top));
    element.setAttribute("x2", String(targetRect.left + targetRect.width / 2 - boardRect.left));
    element.setAttribute("y2", String(targetRect.top + targetRect.height / 2 - boardRect.top));
    element.setAttribute("class", "intelConnectionLine");
    return element;
  }

  // A single measured foreground layer avoids SVG stacking-context conflicts.
  // Copy only text and room symbols: flight-deck runways stay in their own
  // original buttons, avoiding reparenting the control tower's CSS geometry.
  function refreshForegroundOverlay() {
    let overlay = board.querySelector(".intelIconOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "intelIconOverlay";
      board.append(overlay);
    }
    const boardRect = board.getBoundingClientRect();
    const fragment = document.createDocumentFragment();
    board.querySelectorAll(".intelCell .intelRoomIcon, .intelCell .intelRoomHeading, .intelCell .intelRange").forEach(element => {
      const rect = element.getBoundingClientRect();
      const copy = element.cloneNode(true);
      copy.classList.add("intelForegroundMirror");
      copy.setAttribute("aria-hidden", "true");
      copy.style.left = (rect.left - boardRect.left) + "px";
      copy.style.top = (rect.top - boardRect.top) + "px";
      copy.style.width = rect.width + "px";
      copy.style.height = rect.height + "px";
      copy.style.setProperty("--room-color", element.closest(".intelRoom")?.style.getPropertyValue("--room-color") || "#8edfff");
      if (element.closest(".intelCell")?.classList.contains("is-muted")) copy.classList.add("is-muted");
      const originalName = element.querySelector("strong");
      const copiedName = copy.querySelector("strong");
      if (originalName && copiedName) copiedName.style.fontSize = getComputedStyle(originalName).fontSize;
      fragment.append(copy);
    });
    overlay.replaceChildren(fragment);
    board.classList.add("has-foreground-overlay");
  }

  function drawConnections() {
    const rect = board.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    svg.replaceChildren();
    if (!currentObservation) return;

    let emitters = [];
    if (mode === "overview") {
      emitters = [...board.querySelectorAll(".intelCell")]
        .filter(cell => roomAt(Number(cell.dataset.cell))?.range === "adjacent")
        .map(cell => Number(cell.dataset.cell));
    } else if (mode === "emitted" && roomAt(selected)?.range === "adjacent") {
      emitters = [selected];
    } else if (mode === "received") {
      emitters = receivedSources(selected)
        .filter(item => item.room.range === "adjacent")
        .map(item => item.position);
    }

    emitters.forEach(position => {
      const sourceCell = board.querySelector('[data-cell="' + position + '"]');
      const room = roomAt(position);
      if (!sourceCell || !room) return;
      adjacent(position).forEach(targetPosition => {
        const targetCell = board.querySelector('[data-cell="' + targetPosition + '"]');
        if (!targetCell) return;
        const source = sourceCell.getBoundingClientRect();
        const target = targetCell.getBoundingClientRect();
        const sx = source.left + source.width / 2 - rect.left;
        const sy = source.top + source.height / 2 - rect.top;
        const tx = target.left + target.width / 2 - rect.left;
        const ty = target.top + target.height / 2 - rect.top;
        const dx = tx - sx;
        const dy = ty - sy;
        const distance = Math.hypot(dx, dy);
        if (!distance || (dx !== 0 && dy !== 0)) return;
        const ux = dx / distance;
        const uy = dy / distance;
        // Fill the straight part of the emitting room's edge, without entering its rounded corners.
        const sourceRoom = sourceCell.querySelector(".intelRoom");
        const style = sourceRoom ? getComputedStyle(sourceRoom) : null;
        const cornerRadius = style ? Math.max(...[
          style.borderTopLeftRadius, style.borderTopRightRadius,
          style.borderBottomLeftRadius, style.borderBottomRightRadius
        ].map(value => parseFloat(value) || 0)) : 8;
        const perpendicularSize = Math.abs(dx) > 0 ? source.height : source.width;
        const half = Math.max(0, perpendicularSize / 2 - cornerRadius - 1);
        const penetration = 13;
        const edge = Math.abs(dx) > 0 ? source.width / 2 : source.height / 2;
        const depth = Math.min(distance * 0.58, edge + Math.max(0, distance - edge - (Math.abs(dx) > 0 ? target.width / 2 : target.height / 2)) + penetration);
        const bx = sx + ux * edge;
        const by = sy + uy * edge;
        const px = bx + ux * depth;
        const py = by + uy * depth;
        const nx = -uy * half;
        const ny = ux * half;
        const triangle = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        triangle.setAttribute("points", (bx + nx) + "," + (by + ny) + " " + (bx - nx) + "," + (by - ny) + " " + px + "," + py);
        triangle.setAttribute("fill", room.color);
        triangle.style.setProperty("--triangle-color", room.color);
        triangle.setAttribute("class", "intelInfluenceTriangle");
        triangle.setAttribute("data-source", String(position));
        svg.append(triangle);
      });
    });
    refreshForegroundOverlay();
  }

  function rangeLabel(room) {
    return room.range === "global" ? "Globale" : room.range === "room" ? "Salle" : "Adjacente";
  }

  function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function renderDetail() {
    detail.replaceChildren();
    if (!currentObservation) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    const room = roomAt(selected);
    const flight = flightDecks.find(item => item.position === selected);
    const lead = document.createElement("div");
    lead.className = "intelDetailLead";
    lead.style.setProperty("--room-color", room?.color || "#8edfff");
    const icon = addText(lead, "span", "intelDetailIcon", room ? "" : "✦");
    if (room) icon.append(roomIcon(room));
    icon.setAttribute("aria-hidden", "true");
    const heading = document.createElement("div");
    addText(heading, "h3", "", room?.name || flight?.name || "Salle");
    lead.append(heading);
    detail.append(lead);

    if (mode === "received") {
      const sources = receivedSources(selected);
      if (!sources.length) {
        addText(detail, "p", "intelDetailBody", "Aucun bonus reçu.");
      } else {
        const list = document.createElement("ul");
        list.className = "intelEffectList";
        sources.forEach(item => {
          const entry = document.createElement("li");
          addText(entry, "strong", "", item.room.name + " · " + rangeLabel(item.room));
          addText(entry, "span", "", item.room.effect || "Effet à confirmer");
          list.append(entry);
        });
        detail.append(list);
      }
      return;
    }

    if (flight) {
      addText(detail, "p", "intelDetailBody", "Aucun bonus émis.");
      return;
    }
    if (!room) {
      addText(detail, "p", "intelDetailBody", "Salle non renseignée pour ce relevé.");
      return;
    }
    addText(detail, "p", "intelDetailMeta", "Portée : " + rangeLabel(room));
    addText(detail, "p", "intelDetailBody", room.effect || "Effet à confirmer");
  }

  function render() {
    const targets = currentTargets();
    let emitterPositions = [];
    if (mode === "overview") {
      emitterPositions = [...board.querySelectorAll(".intelCell")]
        .filter(cell => roomAt(Number(cell.dataset.cell))?.range === "adjacent")
        .map(cell => Number(cell.dataset.cell));
    } else if (mode === "emitted" && roomAt(selected)?.range === "adjacent") {
      emitterPositions = [selected];
    } else if (mode === "received") {
      emitterPositions = receivedSources(selected)
        .filter(item => item.room.range === "adjacent")
        .map(item => item.position);
    }
    board.dataset.mode = mode;
    board.querySelectorAll(".intelCell").forEach(cell => {
      const position = Number(cell.dataset.cell);
      cell.classList.toggle("is-selected", position === selected);
      cell.classList.toggle("is-target", position !== selected && targets.includes(position));
      cell.classList.toggle("is-muted", mode !== "overview" && position !== selected && !targets.includes(position));
      cell.classList.toggle("is-emitter", emitterPositions.includes(position));
      cell.querySelector("button").setAttribute("aria-pressed", String(position === selected));
    });
    drawConnections();
    renderDetail();
  }

  function updateObservations(selectLatest) {
    const items = byRecentDate(observations.filter(item => item.allianceId === allianceSelect.value));
    observationSelect.replaceChildren();
    if (!items.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Aucun relevé disponible";
      observationSelect.append(option);
      observationSelect.disabled = true;
      currentObservation = null;
    } else {
      observationSelect.disabled = false;
      items.forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = new Date(item.date + "T12:00:00Z").toLocaleDateString("fr-FR", {
          day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
        });
        observationSelect.append(option);
      });
      if (selectLatest) observationSelect.value = items[0].id;
      currentObservation = items.find(item => item.id === observationSelect.value) || items[0];
      observationSelect.value = currentObservation.id;
    }
    selected = 11;
    renderBoard();
    render();
  }

  function refreshAlliances(selectedId = allianceSelect.value) {
    allianceSelect.replaceChildren();
    const sorted = [...alliances].sort((a, b) => displayName(a).localeCompare(displayName(b), "fr"));
    sorted.forEach(alliance => {
      const option = document.createElement("option");
      option.value = alliance.id;
      option.textContent = displayName(alliance);
      allianceSelect.append(option);
    });
    allianceSelect.value = sorted.some(item => item.id === selectedId) ? selectedId : (sorted[0]?.id || "");
    renderAllianceDisplay(sorted.find(item => item.id === allianceSelect.value));
  }

  window.LoSPWarIntel = Object.freeze({
    getRooms: () => rooms.map(room => ({ ...room })),
    getState: () => ({ alliances, observations, currentObservation, dataLoaded }),
    refresh: async () => { await loadData(); refreshAlliances(); updateObservations(true); },
    setEditHandler(handler) { editHandler = typeof handler === "function" ? handler : null; },
    setPreview(observation) {
      currentObservation = observation ? { ...observation, layout: [...observation.layout] } : null;
      if (observation?.allianceId) allianceSelect.value = observation.allianceId;
      if (observation?.date) observationSelect.value = observation.id || "";
      selected = 11;
      renderBoard();
      render();
    },
    render: () => { renderBoard(); render(); },
    selectRoom(position, roomId) {
      if (!currentObservation || position < 3 || position > 11) return false;
      currentObservation.layout[position - 3] = roomId || null;
      renderBoard(); render();
      return true;
    }
  });

  loadData().then(() => {
    const demo = document.getElementById("intelDemoStatus");
    if (demo) demo.hidden = !DEMO_MODE;
    refreshAlliances();
    if (alliances.length) updateObservations(true);
    else { currentObservation = null; renderBoard(); render(); }
  }).catch(() => {
    currentObservation = null;
    renderBoard();
    render();
    const message = document.getElementById("intelLoadError");
    if (message) { message.hidden = false; message.textContent = "Impossible de charger les relevés publiés. Réessaie lorsque le service sera disponible."; }
  });
  allianceSelect.addEventListener("change", () => { renderAllianceDisplay(alliances.find(item => item.id === allianceSelect.value)); updateObservations(true); });
  observationSelect.addEventListener("change", () => {
    currentObservation = observations.find(item => item.id === observationSelect.value && item.allianceId === allianceSelect.value) || null;
    selected = 11;
    renderBoard();
    render();
  });
  board.addEventListener("click", event => {
    const button = event.target.closest("button[data-position]");
    if (!button) return;
    selected = Number(button.dataset.position);
    if (ADMIN_MODE && selected >= 3 && editHandler) {
      editHandler(selected, currentObservation?.layout?.[selected - 3] || null);
      return;
    }
    render();
  });
  document.querySelectorAll(".intelMode").forEach(button => button.addEventListener("click", () => {
    mode = button.dataset.mode;
    document.querySelectorAll(".intelMode").forEach(item => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    render();
  }));
  window.addEventListener("resize", () => drawConnections(), { passive: true });
  window.addEventListener("pageshow", () => drawConnections(currentTargets()));
})();
