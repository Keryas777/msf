const allianceSelect = document.getElementById("allianceSelect");
const yearSelect = document.getElementById("yearSelect");
const monthSelect = document.getElementById("monthSelect");
const daySelect = document.getElementById("daySelect");

const rowsContainer = document.getElementById("warHistoryRows");
const metaEl = document.getElementById("warHistoryMeta");
const headerSortButtons = Array.from(document.querySelectorAll(".warHistoryHeadBtn"));

let warIndex = null;
let currentPlayers = [];
let originalPlayers = [];
let currentSortKey = null;
let currentSortDir = "desc";

init();

async function init() {
  try {
    setMeta("Chargement de l'index...");
    warIndex = await loadIndex();

    setupAllianceSelect();
    bindHeaderSortButtons();
    hydrateInitialSelection();
  } catch (error) {
    console.error(error);
    setMeta("Impossible de charger l'index des guerres.");
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Erreur index</div>`;
  }
}

async function loadIndex() {
  const url = "./data/war/index.json?v=" + Date.now();
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Impossible de charger " + url + " (" + res.status + ")");
  }

  return res.json();
}

function setupAllianceSelect() {
  const alliances = Array.isArray(warIndex?.alliances) ? warIndex.alliances : [];

  allianceSelect.innerHTML = alliances.map((alliance) => {
    return `<option value="${escapeHtml(alliance)}">${capitalize(alliance)}</option>`;
  }).join("");

  allianceSelect.addEventListener("change", () => {
    resetRows();
    hydrateSelectionFromAlliance();
  });
}

function hydrateInitialSelection() {
  if (!allianceSelect.value) {
    setMeta("Aucune alliance disponible.");
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    return;
  }

  hydrateSelectionFromAlliance();
  bindDateSelects();
}

function bindDateSelects() {
  yearSelect.addEventListener("change", () => {
    resetRows();
    populateMonths();
    autoSelectFirstOption(monthSelect);
    populateDays();
    autoSelectFirstOption(daySelect);
    updateSelectStates();
    loadSelectedWar();
  });

  monthSelect.addEventListener("change", () => {
    resetRows();
    populateDays();
    autoSelectFirstOption(daySelect);
    updateSelectStates();
    loadSelectedWar();
  });

  daySelect.addEventListener("change", () => {
    updateSelectStates();
    loadSelectedWar();
  });
}

function hydrateSelectionFromAlliance() {
  populateYears();
  autoSelectFirstOption(yearSelect);

  populateMonths();
  autoSelectFirstOption(monthSelect);

  populateDays();
  autoSelectFirstOption(daySelect);

  updateSelectStates();
  loadSelectedWar();
}

function populateYears() {
  const alliance = allianceSelect.value;

  if (!alliance) {
    clearYearSelect();
    return;
  }

  const dates = getDatesForAlliance(alliance);
  const years = [...new Set(dates.map((d) => d.year))].sort(descNumberSort);

  yearSelect.innerHTML =
    `<option value="">Année</option>` +
    years.map((year) => `<option value="${year}">${year}</option>`).join("");
}

function populateMonths() {
  const alliance = allianceSelect.value;
  const year = yearSelect.value;

  if (!alliance || !year) {
    clearMonthSelect();
    return;
  }

  const dates = getDatesForAlliance(alliance).filter((d) => d.year === year);
  const months = [...new Set(dates.map((d) => d.month))].sort(descNumberSort);

  monthSelect.innerHTML =
    `<option value="">Mois</option>` +
    months.map((month) => `<option value="${month}">${month}</option>`).join("");
}

function populateDays() {
  const alliance = allianceSelect.value;
  const year = yearSelect.value;
  const month = monthSelect.value;

  if (!alliance || !year || !month) {
    clearDaySelect();
    return;
  }

  const dates = getDatesForAlliance(alliance).filter((d) => d.year === year && d.month === month);
  const days = [...new Set(dates.map((d) => d.day))].sort(descNumberSort);

  daySelect.innerHTML =
    `<option value="">Jour</option>` +
    days.map((day) => `<option value="${day}">${day}</option>`).join("");
}

function getDatesForAlliance(alliance) {
  const dates = Array.isArray(warIndex?.dates) ? warIndex.dates : [];

  return dates
    .filter((entry) => Array.isArray(entry.alliances) && entry.alliances.includes(alliance))
    .map((entry) => {
      const [year, month, day] = entry.date.split("-");
      return {
        date: entry.date,
        year,
        month,
        day
      };
    });
}

async function loadSelectedWar() {
  const alliance = allianceSelect.value;
  const year = yearSelect.value;
  const month = monthSelect.value;
  const day = daySelect.value;

  if (!alliance || !year || !month || !day) {
    setMeta("Aucune donnée disponible.");
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    return;
  }

  const date = `${year}-${month}-${day}`;
  const path = `./data/war/${date}/${alliance}.json?v=${Date.now()}`;

  try {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error("Fichier non trouvé (" + res.status + ")");
    }

    const data = await res.json();

    originalPlayers = Array.isArray(data.players) ? data.players.slice() : [];
    currentPlayers = originalPlayers.slice();

    currentSortKey = null;
    currentSortDir = "desc";
    syncHeaderSortButtons();

    setMeta(`${capitalize(alliance)} • ${formatFrenchDate(date)} • ${originalPlayers.length} joueurs`);
    renderRows();
  } catch (error) {
    console.error(error);
    setMeta(`Impossible de charger ${alliance} pour le ${formatFrenchDate(date)} : ${error.message}`);
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
  }
}

function renderRows() {
  if (!currentPlayers.length) {
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    return;
  }

  rowsContainer.innerHTML = currentPlayers.map((player) => {
    return `
      <div class="warHistoryRow warHistoryDataRow">
        <div class="warHistoryCell col-rank is-sticky-1">${safeNumber(player.rank)}</div>

        <div class="warHistoryCell col-player is-sticky-2">
          <div class="warHistoryPlayerBlock">
            <div class="warHistoryPlayerName">${escapeHtml(player.name || "—")}</div>
            <div class="warHistoryPlayerAlliance">${capitalize(allianceSelect.value)}</div>
          </div>
        </div>

        <div class="warHistoryCell col-ap">${formatNumber(player.attack_points)}</div>
        <div class="warHistoryCell col-attacks">${formatNumber(player.attacks)}</div>
        <div class="warHistoryCell col-damage">${formatNumber(player.damage)}</div>
        <div class="warHistoryCell col-defensewins">${formatNumber(player.defense_wins)}</div>
        <div class="warHistoryCell col-defensebonus">${formatNumber(player.defense_bonus)}</div>
      </div>
    `;
  }).join("");
}

function bindHeaderSortButtons() {
  headerSortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (!key || !originalPlayers.length) return;

      if (currentSortKey === key) {
        currentSortDir = currentSortDir === "desc" ? "asc" : "desc";
      } else {
        currentSortKey = key;
        currentSortDir = key === "name" ? "asc" : "desc";
      }

      applySort();
      syncHeaderSortButtons();
      renderRows();
    });
  });
}

function applySort() {
  if (!currentSortKey) {
    currentPlayers = originalPlayers.slice();
    return;
  }

  currentPlayers = originalPlayers.slice().sort((a, b) => {
    const av = normalizeSortableValue(a[currentSortKey], currentSortKey);
    const bv = normalizeSortableValue(b[currentSortKey], currentSortKey);

    if (av < bv) return currentSortDir === "asc" ? -1 : 1;
    if (av > bv) return currentSortDir === "asc" ? 1 : -1;

    return normalizeSortableValue(a.rank, "rank") - normalizeSortableValue(b.rank, "rank");
  });
}

function syncHeaderSortButtons() {
  headerSortButtons.forEach((btn) => {
    btn.classList.remove("warHistorySorted", "is-desc");
    btn.textContent = getHeaderLabel(btn.dataset.sort);
  });

  const activeBtn = headerSortButtons.find((btn) => btn.dataset.sort === currentSortKey);
  if (!activeBtn) return;

  activeBtn.classList.add("warHistorySorted");
  if (currentSortDir === "desc") {
    activeBtn.classList.add("is-desc");
  }
}

function getHeaderLabel(key) {
  const labels = {
    name: "Joueur",
    attack_points: "Pts",
    attacks: "Att",
    damage: "Dégâts",
    defense_wins: "V. Déf",
    defense_bonus: "B. Déf"
  };

  return labels[key] || key;
}

function normalizeSortableValue(value, key) {
  if (key === "name") {
    return String(value || "").toLowerCase();
  }

  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return -Infinity;

  const n = Number(value);
  return Number.isNaN(n) ? -Infinity : n;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "number") return escapeHtml(String(value));
  return value.toLocaleString("fr-FR");
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  return escapeHtml(String(value));
}

function formatFrenchDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function descNumberSort(a, b) {
  return Number(b) - Number(a);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setMeta(text) {
  if (metaEl) metaEl.textContent = text;
}

function clearYearSelect() {
  yearSelect.innerHTML = `<option value="">Année</option>`;
  yearSelect.value = "";
}

function clearMonthSelect() {
  monthSelect.innerHTML = `<option value="">Mois</option>`;
  monthSelect.value = "";
}

function clearDaySelect() {
  daySelect.innerHTML = `<option value="">Jour</option>`;
  daySelect.value = "";
}

function updateSelectStates() {
  yearSelect.disabled = !allianceSelect.value;
  monthSelect.disabled = !allianceSelect.value || !yearSelect.value;
  daySelect.disabled = !allianceSelect.value || !yearSelect.value || !monthSelect.value;
}

function resetRows() {
  originalPlayers = [];
  currentPlayers = [];
  rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
}

function autoSelectFirstOption(selectEl) {
  const firstRealOption = Array.from(selectEl.options).find((option) => option.value !== "");
  selectEl.value = firstRealOption ? firstRealOption.value : "";
}