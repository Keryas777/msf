const allianceSelect = document.getElementById("allianceSelect");
const yearSelect = document.getElementById("yearSelect");
const monthSelect = document.getElementById("monthSelect");
const daySelect = document.getElementById("daySelect");

const rowsContainer = document.getElementById("warHistoryRows");
const metaEl = document.getElementById("warHistoryMeta");
const sortInfoEl = document.getElementById("sortInfo");
const sortButtons = Array.from(document.querySelectorAll(".sortBtn"));

let warIndex = null;
let currentPlayers = [];
let originalPlayers = [];
let currentSortKey = "rank";
let currentSortDir = "asc";

init();

async function init() {
  try {
    warIndex = await loadIndex();
    setupAllianceSelect();
    bindSortButtons();
    hydrateFiltersFromIndex();
  } catch (error) {
    console.error(error);
    metaEl.textContent = "Impossible de charger l'index des guerres.";
    rowsContainer.innerHTML = "";
  }
}

async function loadIndex() {
  const res = await fetch("./docs/data/war/index.json?v=" + Date.now());
  if (!res.ok) {
    throw new Error("Impossible de charger docs/data/war/index.json");
  }
  return res.json();
}

function setupAllianceSelect() {
  const alliances = warIndex.alliances || [];

  allianceSelect.innerHTML = alliances.map((alliance) => {
    return `<option value="${escapeHtml(alliance)}">${capitalize(alliance)}</option>`;
  }).join("");

  allianceSelect.addEventListener("change", () => {
    populateYears();
    populateMonths();
    populateDays();
    loadSelectedWar();
  });
}

function hydrateFiltersFromIndex() {
  populateYears();
  populateMonths();
  populateDays();

  yearSelect.addEventListener("change", () => {
    populateMonths();
    populateDays();
    loadSelectedWar();
  });

  monthSelect.addEventListener("change", () => {
    populateDays();
    loadSelectedWar();
  });

  daySelect.addEventListener("change", () => {
    loadSelectedWar();
  });

  loadSelectedWar();
}

function populateYears() {
  const alliance = allianceSelect.value;
  const dates = getDatesForAlliance(alliance);
  const years = [...new Set(dates.map((d) => d.year))].sort(descNumberSort);

  yearSelect.innerHTML = years.map((year) => {
    return `<option value="${year}">${year}</option>`;
  }).join("");
}

function populateMonths() {
  const alliance = allianceSelect.value;
  const year = yearSelect.value;
  const dates = getDatesForAlliance(alliance).filter((d) => d.year === year);
  const months = [...new Set(dates.map((d) => d.month))].sort(descNumberSort);

  monthSelect.innerHTML = months.map((month) => {
    return `<option value="${month}">${month}</option>`;
  }).join("");
}

function populateDays() {
  const alliance = allianceSelect.value;
  const year = yearSelect.value;
  const month = monthSelect.value;

  const dates = getDatesForAlliance(alliance).filter((d) => {
    return d.year === year && d.month === month;
  });

  const days = [...new Set(dates.map((d) => d.day))].sort(descNumberSort);

  daySelect.innerHTML = days.map((day) => {
    return `<option value="${day}">${day}</option>`;
  }).join("");
}

function getDatesForAlliance(alliance) {
  const dates = warIndex.dates || [];

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
    metaEl.textContent = "Aucune donnée disponible.";
    rowsContainer.innerHTML = "";
    return;
  }

  const date = `${year}-${month}-${day}`;
  const path = `./docs/data/war/${date}/${alliance}.json?v=${Date.now()}`;

  try {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error("Fichier non trouvé");
    }

    const data = await res.json();
    originalPlayers = Array.isArray(data.players) ? data.players.slice() : [];
    currentPlayers = originalPlayers.slice();

    currentSortKey = "rank";
    currentSortDir = "asc";
    syncSortButtons();

    metaEl.textContent = `${capitalize(alliance)} • ${formatFrenchDate(date)} • ${originalPlayers.length} joueurs`;
    sortInfoEl.textContent = "Ordre initial";

    renderRows();
  } catch (error) {
    console.error(error);
    metaEl.textContent = `Impossible de charger ${alliance} pour le ${formatFrenchDate(date)}.`;
    rowsContainer.innerHTML = "";
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
        <div class="warHistoryCell col-rank">${safeNumber(player.rank)}</div>
        <div class="warHistoryCell col-player">
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

function bindSortButtons() {
  sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (!key) return;

      if (key === "rank") {
        if (currentSortKey === "rank") {
          currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
        } else {
          currentSortKey = "rank";
          currentSortDir = "asc";
        }
      } else {
        if (currentSortKey === key) {
          currentSortDir = currentSortDir === "desc" ? "asc" : "desc";
        } else {
          currentSortKey = key;
          currentSortDir = "desc";
        }
      }

      applySort();
      syncSortButtons();
      renderRows();
    });
  });
}

function applySort() {
  currentPlayers = originalPlayers.slice().sort((a, b) => {
    const av = normalizeSortableValue(a[currentSortKey]);
    const bv = normalizeSortableValue(b[currentSortKey]);

    if (av < bv) return currentSortDir === "asc" ? -1 : 1;
    if (av > bv) return currentSortDir === "asc" ? 1 : -1;

    const ar = normalizeSortableValue(a.rank);
    const br = normalizeSortableValue(b.rank);
    return ar - br;
  });

  const directionLabel = currentSortDir === "asc" ? "croissant" : "décroissant";
  const labelMap = {
    rank: "rang",
    attack_points: "points d'attaque",
    attacks: "attaques",
    damage: "dégâts",
    defense_wins: "victoires en défense",
    defense_bonus: "bonus de défense"
  };

  sortInfoEl.textContent = `Tri : ${labelMap[currentSortKey]} (${directionLabel})`;
}

function syncSortButtons() {
  sortButtons.forEach((btn) => {
    btn.classList.remove("is-active");
    btn.textContent = getBaseSortLabel(btn.dataset.sort);
  });

  const activeBtn = sortButtons.find((btn) => btn.dataset.sort === currentSortKey);
  if (!activeBtn) return;

  activeBtn.classList.add("is-active");
  activeBtn.textContent = `${getBaseSortLabel(currentSortKey)} ${currentSortDir === "asc" ? "↑" : "↓"}`;
}

function getBaseSortLabel(key) {
  const labels = {
    rank: "Rang",
    attack_points: "Points d'attaque",
    attacks: "Attaques",
    damage: "Dégâts",
    defense_wins: "Victoires défense",
    defense_bonus: "Bonus défense"
  };
  return labels[key] || key;
}

function normalizeSortableValue(value) {
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