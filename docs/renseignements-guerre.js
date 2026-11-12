(() => {
  "use strict";

  const rooms = [
    { id: "soute", name: "Soute", icon: "▣", range: "adjacent", color: "#FACC15", effect: "Au tour, les personnages avec Augmentation d’attaque gagnent +10 % de Barrière." },
    { id: "hangar", name: "Hangar", icon: "✈", range: "adjacent", color: "#F97316", effect: "+15 % de Barrière max. pour les alliés en défense." },
    { id: "security", name: "Sécurité", icon: "⬡", range: "adjacent", color: "#EF4444", effect: "Apparition → Réduction de défense sur les alliés attaquants." },
    { id: "tech", name: "Labo technique", icon: "⌬", range: "adjacent", color: "#3DCE73", effect: "Apparition → Augmentation de défense sur les alliés en défense." },
    { id: "armory", name: "Armurerie", icon: "⫶", range: "adjacent", color: "#3B82F6", effect: "Au tour, les alliés attaquants avec Réduction de défense retournent tous les effets actifs sur eux-mêmes." },
    { id: "infirmary", name: "Infirmerie", icon: "✚", range: "adjacent", color: "#D946EF", effect: "Frappe réussie → les alliés en défense gagnent Régénération." },
    { id: "bridge", name: "Pont", icon: "◉", range: "room", color: "#d6acff", effect: "Apparition → +10 effets positifs aléatoires pour les alliés en défense." },
    { id: "reactor", name: "Réacteur", icon: "☢", range: "room", color: "#ffcb72", effect: "+15 % de Barrière max. pour les alliés en défense." },
    { id: "barracks", name: "Caserne", icon: "✣", range: "global", color: "#ffe27c", effect: "Apparition → tous les personnages gagnent Augmentation d’attaque." }
  ];
  // Inline SVG pictograms: recognizable at mobile size, with no external assets or dependencies.
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
  const observations = [
    { id: "a-2026-11-11", allianceId: "test-a", date: "2026-11-11", layout: ["soute", "hangar", "security", "tech", "armory", "infirmary", "bridge", "reactor", "barracks"] },
    { id: "a-2026-11-04", allianceId: "test-a", date: "2026-11-04", layout: ["hangar", "security", "soute", "armory", "infirmary", "tech", "reactor", "barracks", "bridge"] },
    { id: "b-2026-11-09", allianceId: "test-b", date: "2026-11-09", layout: ["security", "soute", "hangar", "infirmary", "tech", "armory", "barracks", "bridge", "reactor"] }
  ];
  const alliances = [
    { id: "test-a", name: "Alliance de test A" },
    { id: "test-b", name: "Alliance de test B" },
    { id: "test-empty", name: "Alliance sans relevé" }
  ];
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

    const button = document.createElement("button");
    button.type = "button";
    button.className = room ? "intelRoom room-" + room.id : "intelRoom intelFlight";
    button.dataset.position = String(position);
    button.style.setProperty("--room-color", room?.color || "#8edfff");
    button.setAttribute("aria-label", "Sélectionner " + (room?.name || flightDecks[position].name));
    button.setAttribute("aria-pressed", "false");

    const icon = document.createElement("span");
    icon.className = room ? "intelRoomIcon" : "intelFlightIcon";
    icon.setAttribute("aria-hidden", "true");
    if (room) icon.append(roomIcon(room));
    else icon.textContent = "✦";
    const name = document.createElement("strong");
    name.textContent = room?.name || flightDecks[position].name;

    if (room) {
      const range = document.createElement("span");
      range.className = "intelRange";
      range.textContent = room.range === "room" ? "SALLE" : room.range === "global" ? "GLOBALE" : "ADJACENTE";
      button.append(icon, name, range);
    } else {
      const runway = document.createElement("span");
      runway.className = "runway";
      runway.setAttribute("aria-hidden", "true");
      runway.append(document.createElement("i"));
      button.append(icon, name, runway);
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
    board.hidden = !currentObservation;
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

  alliances.forEach(alliance => {
    const option = document.createElement("option");
    option.value = alliance.id;
    option.textContent = alliance.name;
    allianceSelect.append(option);
  });
  allianceSelect.value = alliances[0].id;
  updateObservations(true);
  allianceSelect.addEventListener("change", () => updateObservations(true));
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
