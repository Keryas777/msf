const allianceSelect = document.getElementById("allianceSelect");
const yearSelect = document.getElementById("yearSelect");
const monthSelect = document.getElementById("monthSelect");
const daySelect = document.getElementById("daySelect");

const rowsContainer = document.getElementById("warHistoryRows");
const metaEl = document.getElementById("warHistoryMeta");
const notesEl = document.getElementById("warHistoryNotes");
const debriefEl = document.getElementById("warHistoryDebrief");
const headerSortButtons = Array.from(document.querySelectorAll(".warHistoryHeadBtn"));

const tabButtons = Array.from(document.querySelectorAll(".warHistoryTabBtn"));
const tabPanels = Array.from(document.querySelectorAll(".warHistoryTabPanel"));

const ALLIANCE_ORDER = ["zeus", "kronos", dionysos", "poseidon"];

const ALLIANCE_LABELS = {
  zeus: "⚡️ Zeus",
  dionysos: "🍇 Dionysos",
  poseidon: "🔱 Poséidon",
  kronos: "⏳ Kronos"
};

let warIndex = null;
let currentPlayers = [];
let originalPlayers = [];
let currentSortKey = null;
let currentSortDir = "desc";
let currentTab = "table";

init();

async function init() {
  try {
    bindTabs();
    setMeta("Chargement de l'index...");
    warIndex = await loadIndex();

    setupAllianceSelect();
    bindHeaderSortButtons();
    hydrateInitialSelection();
  } catch (error) {
    console.error(error);
    setMeta("Impossible de charger l'index des guerres.");
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Erreur index</div>`;
    renderNotes(null);
    renderDebrief(null);
  }
}

async function loadIndex() {
  const url = "./data/war/index.json?v=" + Date.now();
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error("Impossible de charger " + url + " (" + res.status + ")");
  }

  return res.json();
}

function bindTabs() {
  if (!tabButtons.length || !tabPanels.length) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextTab = btn.dataset.tab;
      if (!nextTab || nextTab === currentTab) return;
      setActiveTab(nextTab);
    });
  });
}

function setActiveTab(tabName) {
  currentTab = tabName;

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === getPanelIdFromTab(tabName);
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function getPanelIdFromTab(tabName) {
  const map = {
    table: "warHistoryPanelTable",
    notes: "warHistoryPanelNotes",
    debrief: "warHistoryPanelDebrief"
  };

  return map[tabName] || "warHistoryPanelTable";
}

function setupAllianceSelect() {
  const alliances = getAvailableAlliances();

  allianceSelect.innerHTML =
    `<option value="">Alliance</option>` +
    alliances.map((alliance) => {
      const label = getAllianceDisplayName(alliance);
      return `<option value="${escapeHtml(alliance)}">${escapeHtml(label)}</option>`;
    }).join("");

  allianceSelect.addEventListener("change", () => {
    resetRows();
    hydrateSelectionFromAlliance();
  });
}

function getAvailableAlliances() {
  const fromIndex = Array.isArray(warIndex?.alliances) ? warIndex.alliances : [];
  const fromDates = Array.isArray(warIndex?.dates)
    ? warIndex.dates.flatMap((entry) => Array.isArray(entry.alliances) ? entry.alliances : [])
    : [];

  const merged = [...new Set([...fromIndex, ...fromDates])]
    .map((alliance) => normalizeAllianceKey(alliance))
    .filter(Boolean);

  return [...new Set(merged)].sort((a, b) => {
    const ia = ALLIANCE_ORDER.indexOf(a);
    const ib = ALLIANCE_ORDER.indexOf(b);

    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }

    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });
}

function hydrateInitialSelection() {
  clearYearSelect();
  clearMonthSelect();
  clearDaySelect();
  updateSelectStates();

  setMeta("Sélectionne une alliance, une année, un mois et un jour.");
  rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée sélectionnée.</div>`;
  renderNotes(null);
  renderDebrief(null);

  bindDateSelects();
}

function bindDateSelects() {
  yearSelect.addEventListener("change", () => {
    resetRows();
    populateMonths();
    clearDaySelect();
    updateSelectStates();
    loadSelectedWar();
  });

  monthSelect.addEventListener("change", () => {
    resetRows();
    populateDays();
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
  clearMonthSelect();
  clearDaySelect();
  updateSelectStates();
  loadSelectedWar();
}

function populateYears() {
  const alliance = normalizeAllianceKey(allianceSelect.value);

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
  const alliance = normalizeAllianceKey(allianceSelect.value);
  const year = yearSelect.value;

  if (!alliance || !year) {
    clearMonthSelect();
    return;
  }

  const monthNames = {
    "01": "Janvier",
    "02": "Février",
    "03": "Mars",
    "04": "Avril",
    "05": "Mai",
    "06": "Juin",
    "07": "Juillet",
    "08": "Août",
    "09": "Septembre",
    "10": "Octobre",
    "11": "Novembre",
    "12": "Décembre"
  };

  const dates = getDatesForAlliance(alliance).filter((d) => d.year === year);
  const months = [...new Set(dates.map((d) => d.month))].sort(descNumberSort);

  monthSelect.innerHTML =
    `<option value="">Mois</option>` +
    months.map((month) => {
      const label = `${month} (${monthNames[month] || ""})`;
      return `<option value="${month}">${label}</option>`;
    }).join("");
}

function populateDays() {
  const alliance = normalizeAllianceKey(allianceSelect.value);
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
  const allianceKey = normalizeAllianceKey(alliance);
  const dates = Array.isArray(warIndex?.dates) ? warIndex.dates : [];

  return dates
    .filter((entry) => {
      const entryAlliances = Array.isArray(entry.alliances) ? entry.alliances : [];
      return entryAlliances.map(normalizeAllianceKey).includes(allianceKey);
    })
    .map((entry) => {
      const [year, month, day] = String(entry.date || "").split("-");
      return {
        date: entry.date,
        year,
        month,
        day
      };
    })
    .filter((entry) => entry.date && entry.year && entry.month && entry.day);
}

async function loadSelectedWar() {
  const alliance = normalizeAllianceKey(allianceSelect.value);
  const year = yearSelect.value;
  const month = monthSelect.value;
  const day = daySelect.value;

  if (!alliance || !year || !month || !day) {
    setMeta("Sélectionne une alliance, une année, un mois et un jour.");
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée sélectionnée.</div>`;
    renderNotes(null);
    renderDebrief(null);
    return;
  }

  const date = `${year}-${month}-${day}`;
  const path = `./data/war/${date}/${alliance}.json?v=${Date.now()}`;

  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Fichier non trouvé (" + res.status + ")");
    }

    const data = await res.json();

    originalPlayers = Array.isArray(data.players) ? data.players.slice() : [];
    currentPlayers = originalPlayers.slice();

    currentSortKey = null;
    currentSortDir = "desc";
    syncHeaderSortButtons();

    setMeta(`${getAllianceDisplayName(alliance)} • ${formatFrenchDate(date)} • ${originalPlayers.length} joueurs`);
    renderRows();
    renderReport(data.report || null);
  } catch (error) {
    console.error(error);
    setMeta(`Impossible de charger ${getAllianceDisplayName(alliance)} pour le ${formatFrenchDate(date)} : ${error.message}`);
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    renderNotes(null);
    renderDebrief(null);
  }
}

function renderRows() {
  if (!currentPlayers.length) {
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    return;
  }

  rowsContainer.innerHTML = currentPlayers.map((player, index) => {
    return `
      <div class="warHistoryRow warHistoryDataRow">
        <div class="warHistoryCell col-rank is-sticky-1">${index + 1}</div>

        <div class="warHistoryCell col-player is-sticky-2">
          <div class="warHistoryPlayerBlock">
            <div class="warHistoryPlayerName">${escapeHtml(player.name || "—")}</div>
            <div class="warHistoryPlayerAlliance">${escapeHtml(getAllianceDisplayName(allianceSelect.value))}</div>
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

function renderReport(report) {
  renderNotes(report);
  renderDebrief(report);
}

function renderNotes(report) {
  if (!notesEl) return;

  const ranking = Array.isArray(report?.ranking) ? report.ranking : [];
  const summary = report?.summary || null;

  if (!ranking.length) {
    notesEl.innerHTML = `
      <div class="warHistoryDebriefPlaceholder">
        <p class="warHistoryDebriefTitle">Aucune note disponible</p>
        <p class="warHistoryDebriefText">
          Cette guerre ne contient pas encore de classement enrichi.
        </p>
      </div>
    `;
    return;
  }

  const bestDamageSharePct = summary
    ? Number(summary.best_damage_share_pct ?? ((summary.best_damage_share || 0) * 100))
    : 0;

  const summaryHtml = summary ? `
    <div class="warHistorySummary">
      <div class="warHistorySummaryLine"><strong>Joueurs :</strong> ${formatNumber(summary.player_count)}</div>
      <div class="warHistorySummaryLine"><strong>Dégâts totaux :</strong> ${formatNumber(summary.total_damage)}</div>
      <div class="warHistorySummaryLine"><strong>Meilleur dégâts moyens :</strong> ${formatNumber(summary.best_avg_damage)}</div>
      <div class="warHistorySummaryLine"><strong>Meilleure part dégâts :</strong> ${bestDamageSharePct.toFixed(2)}%</div>
    </div>
  ` : "";

  const rankingHtml = ranking.map((player) => `
    <div class="warHistoryNoteRow">
      <div class="warHistoryNoteRank">#${formatNumber(player.rank)}</div>
      <div class="warHistoryNoteName">${escapeHtml(player.name || "—")}</div>
      <div class="warHistoryNoteScore">${formatNumber(player.score)}</div>
    </div>
  `).join("");

  notesEl.innerHTML = `
    ${summaryHtml}
    <div class="warHistoryNotesList">
      ${rankingHtml}
    </div>
  `;
}

function renderDebrief(report) {
  if (!debriefEl) return;

  const enrichedPlayers = Array.isArray(report?.players) ? report.players : [];
  const validPlayers = enrichedPlayers.filter((player) =>
    player && (player.analysis || player.score_total !== undefined || player.rank !== undefined)
  );

  if (!validPlayers.length) {
    debriefEl.innerHTML = `
      <div class="warHistoryDebriefPlaceholder">
        <p class="warHistoryDebriefTitle">Aucun débrief disponible</p>
        <p class="warHistoryDebriefText">
          Cette guerre ne contient pas encore d’analyse enrichie.
        </p>
      </div>
    `;
    return;
  }

  debriefEl.innerHTML = validPlayers.map((player) => `
    <div class="warHistoryDebriefCard">
      <div class="warHistoryDebriefTop">
        <div class="warHistoryDebriefName">
          #${formatNumber(player.rank)} — ${escapeHtml(player.name || "—")}
        </div>
        <div class="warHistoryDebriefScore">${formatNumber(player.score_total ?? 0)}/100</div>
      </div>

      <div class="warHistoryDebriefStats">
        <span>Att : ${formatNumber(player.attacks)}</span>
        <span>Pts : ${formatNumber(player.attack_points)}</span>
        <span>Dégâts : ${formatNumber(player.damage)}</span>
        <span>V. Déf : ${formatNumber(player.defense_wins)}</span>
      </div>

      <div class="warHistoryDebriefText">
        ${escapeHtml(player.analysis || "Aucune analyse disponible.")}
      </div>
    </div>
  `).join("");
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

function normalizeAllianceKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_‐-‒–—―﹘﹣－]/g, "");

  if (key === "zeus") return "zeus";
  if (key === "dionysos") return "dionysos";
  if (key === "poseidon" || key === "posseidon") return "poseidon";
  if (key === "kronos" || key === "cronos" || key === "chronos" || key === "lospkronos") return "kronos";

  return key;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "number") return escapeHtml(String(value));
  return value.toLocaleString("fr-FR");
}

function formatFrenchDate(dateStr) {
  const [year, month, day] = String(dateStr || "").split("-");
  return `${day}/${month}/${year}`;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getAllianceDisplayName(value) {
  const key = normalizeAllianceKey(value);
  return ALLIANCE_LABELS[key] || capitalize(key);
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
  renderNotes(null);
  renderDebrief(null);
}