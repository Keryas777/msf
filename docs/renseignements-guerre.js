(() => {
  "use strict";

  const rooms = [
    { id: "soute", name: "Soute", icon: "▣", range: "adjacent", color: "#77d8ff", effect: "Au tour, les personnages avec Augmentation d’attaque gagnent +10 % de Barrière." },
    { id: "hangar", name: "Hangar", icon: "✈", range: "adjacent", color: "#77bcff", effect: "+15 % de Barrière max. pour les alliés en défense." },
    { id: "security", name: "Sécurité", icon: "⬡", range: "adjacent", color: "#7dffd0", effect: "Apparition → Réduction de défense sur les alliés attaquants." },
    { id: "tech", name: "Labo technique", icon: "⌬", range: "adjacent", color: "#86f587", effect: "Apparition → Augmentation de défense sur les alliés en défense." },
    { id: "armory", name: "Armurerie", icon: "⫶", range: "adjacent", color: "#ff9f8b", effect: "Au tour, les alliés attaquants avec Réduction de défense retournent tous les effets actifs sur eux-mêmes." },
    { id: "infirmary", name: "Infirmerie", icon: "✚", range: "adjacent", color: "#ff8bd0", effect: "Frappe réussie → les alliés en défense gagnent Régénération." },
    { id: "bridge", name: "Pont", icon: "◉", range: "room", color: "#d6acff", effect: "Apparition → +10 effets positifs aléatoires pour les alliés en défense." },
    { id: "reactor", name: "Réacteur", icon: "☢", range: "room", color: "#ffcb72", effect: "+15 % de Barrière max. pour les alliés en défense." },
    { id: "barracks", name: "Caserne", icon: "✣", range: "global", color: "#ffe27c", effect: "Apparition → tous les personnages gagnent Augmentation d’attaque." }
  ];
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
    icon.textContent = room?.icon || "✦";
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

  function drawConnections(targets) {
    const rect = board.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    svg.replaceChildren();
    if (!currentObservation) return;
    if (mode === "emitted" && roomAt(selected)?.range === "adjacent") {
      targets.forEach(position => {
        const item = line(selected, position);
        if (item) svg.append(item);
      });
    }
    if (mode === "received") {
      targets.forEach(position => {
        if (roomAt(position)?.range === "adjacent") {
          const item = line(position, selected);
          if (item) svg.append(item);
        }
      });
    }
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
    const icon = addText(lead, "span", "intelDetailIcon", room?.icon || "✦");
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
    board.dataset.mode = mode;
    board.querySelectorAll(".intelCell").forEach(cell => {
      const position = Number(cell.dataset.cell);
      cell.classList.toggle("is-selected", position === selected);
      cell.classList.toggle("is-target", position !== selected && targets.includes(position));
      cell.classList.toggle("is-muted", mode !== "overview" && position !== selected && !targets.includes(position));
      cell.querySelector("button").setAttribute("aria-pressed", String(position === selected));
    });
    drawConnections(targets);
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
  window.addEventListener("resize", () => drawConnections(currentTargets()), { passive: true });
  window.addEventListener("pageshow", () => drawConnections(currentTargets()));
})();
