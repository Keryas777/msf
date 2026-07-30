/* docs/war-history.js */

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

const FALLBACK_ALLIANCES = [
  { key: "zeus", name: "Zeus", emoji: "⚡️", color: "#F8FF00", order: 1, aliases: ["Zeus", "zeus", "LoSP Zeus", "losp zeus"] },
  { key: "athena", name: "Athéna", emoji: "🦉", color: "#F28C28", order: 2, aliases: ["Athéna", "Athena", "athéna", "athena", "LoSP Athéna", "LoSP Athena", "losp athéna", "losp athena"] },
  { key: "kronos", name: "Kronos", emoji: "⏳", color: "#E10D17", order: 3, aliases: ["Kronos", "kronos", "Cronos", "Chronos", "LoSP Kronos", "losp kronos"] },
  { key: "dionysos", name: "Dionysos", emoji: "🍇", color: "#93328E", order: 4, aliases: ["Dionysos", "dionysos", "LoSP Dionysos", "losp dionysos"] },
  { key: "poseidon", name: "Poséidon", emoji: "🔱", color: "#0000FF", order: 5, aliases: ["Poséidon", "Poseidon", "Posseidon", "poséidon", "poseidon", "LoSP Poséidon", "losp poseidon"] },
  { key: "hades", name: "Hadès", emoji: "🔥", color: "#1EA164", order: 6, aliases: ["Hadès", "Hades", "hadès", "hades", "LoSP Hadès", "losp hades"] }
];

let allianceMeta = [];
let allianceMetaByKey = new Map();
let allianceAliasToKey = new Map();

const MONTH_NAMES = {
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

let warIndex = null;
let currentPlayers = [];
let originalPlayers = [];
let currentSortKey = null;
let currentSortDir = "desc";
let currentTab = "table";

if (
  !allianceSelect ||
  !yearSelect ||
  !monthSelect ||
  !daySelect ||
  !rowsContainer
) {
  console.error("[war-history] Missing DOM elements. Check war-history.html ids.");
} else {
  init();
}

async function init() {
  try {
    bindTabs();
    bindDateSelects();
    bindHeaderSortButtons();

    setActiveTab("table");
    setMeta("Chargement de l'index...");

    await loadAllianceMeta();
    warIndex = await loadIndex();

    setupAllianceSelect();
    hydrateInitialSelection();
  } catch (error) {
    console.error("[war-history] init error:", error);

    setMeta("Impossible de charger l'index des guerres.");
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Erreur index</div>`;
    renderNotes(null);
    renderDebrief(null);
  }
}

async function loadIndex() {
  const url = `./data/war/index.json?v=${Date.now()}`;
  const res = await fetch(url, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Impossible de charger ${url} (${res.status})`);
  }

  const data = await res.json();

  if (!data || typeof data !== "object") {
    throw new Error("war/index.json invalide");
  }

  if (!Array.isArray(data.dates)) {
    data.dates = [];
  }

  if (!Array.isArray(data.alliances)) {
    data.alliances = [];
  }

  return data;
}

/* ---------- Tabs ---------- */

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
  currentTab = tabName || "table";

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === currentTab;

    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === getPanelIdFromTab(currentTab);

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

/* ---------- Selects ---------- */

function setupAllianceSelect() {
  const alliances = getAvailableAlliances();

  allianceSelect.innerHTML =
    `<option value="">Alliance</option>` +
    alliances
      .map((alliance) => {
        const label = getAllianceDisplayName(alliance);
        return `<option value="${escapeHtml(alliance)}">${escapeHtml(label)}</option>`;
      })
      .join("");

  allianceSelect.addEventListener("change", () => {
    resetRows();
    hydrateSelectionFromAlliance();
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
  const years = [...new Set(dates.map((d) => d.year))]
    .filter(Boolean)
    .sort(descNumberSort);

  yearSelect.innerHTML =
    `<option value="">Année</option>` +
    years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join("");
}

function populateMonths() {
  const alliance = normalizeAllianceKey(allianceSelect.value);
  const year = yearSelect.value;

  if (!alliance || !year) {
    clearMonthSelect();
    return;
  }

  const dates = getDatesForAlliance(alliance).filter((d) => d.year === year);
  const months = [...new Set(dates.map((d) => d.month))]
    .filter(Boolean)
    .sort(descNumberSort);

  monthSelect.innerHTML =
    `<option value="">Mois</option>` +
    months
      .map((month) => {
        const label = `${month} (${MONTH_NAMES[month] || ""})`;
        return `<option value="${escapeHtml(month)}">${escapeHtml(label)}</option>`;
      })
      .join("");
}

function populateDays() {
  const alliance = normalizeAllianceKey(allianceSelect.value);
  const year = yearSelect.value;
  const month = monthSelect.value;

  if (!alliance || !year || !month) {
    clearDaySelect();
    return;
  }

  const dates = getDatesForAlliance(alliance).filter(
    (d) => d.year === year && d.month === month
  );

  const days = [...new Set(dates.map((d) => d.day))]
    .filter(Boolean)
    .sort(descNumberSort);

  daySelect.innerHTML =
    `<option value="">Jour</option>` +
    days.map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`).join("");
}

function getAvailableAlliances() {
  const fromRegistry = allianceMeta.map((alliance) => alliance.key);
  const fromIndex = Array.isArray(warIndex?.alliances) ? warIndex.alliances : [];

  const fromDates = Array.isArray(warIndex?.dates)
    ? warIndex.dates.flatMap((entry) =>
        Array.isArray(entry?.alliances) ? entry.alliances : []
      )
    : [];

  const merged = [...new Set([...fromRegistry, ...fromIndex, ...fromDates])]
    .map((alliance) => normalizeAllianceKey(alliance))
    .filter(Boolean);

  return [...new Set(merged)].sort(sortAllianceKeys);
}

function getDatesForAlliance(alliance) {
  const allianceKey = normalizeAllianceKey(alliance);
  const dates = Array.isArray(warIndex?.dates) ? warIndex.dates : [];

  return dates
    .filter((entry) => {
      const entryAlliances = Array.isArray(entry?.alliances) ? entry.alliances : [];
      return entryAlliances.map(normalizeAllianceKey).includes(allianceKey);
    })
    .map((entry) => {
      const [year, month, day] = String(entry?.date || "").split("-");

      return {
        date: String(entry?.date || ""),
        year,
        month,
        day
      };
    })
    .filter((entry) => entry.date && entry.year && entry.month && entry.day)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function updateSelectStates() {
  yearSelect.disabled = !allianceSelect.value;
  monthSelect.disabled = !allianceSelect.value || !yearSelect.value;
  daySelect.disabled = !allianceSelect.value || !yearSelect.value || !monthSelect.value;
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

/* ---------- Load selected war ---------- */

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
    setMeta(`Chargement de ${getAllianceDisplayName(alliance)} • ${formatFrenchDate(date)}...`);

    const res = await fetch(path, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`Fichier non trouvé (${res.status})`);
    }

    const data = await res.json();

    originalPlayers = getPlayersFromWarData(data);
    currentPlayers = originalPlayers.slice();

    currentSortKey = null;
    currentSortDir = "desc";
    syncHeaderSortButtons();

    setMeta(
      `${getAllianceDisplayName(alliance)} • ${formatFrenchDate(date)} • ${originalPlayers.length} joueur${originalPlayers.length > 1 ? "s" : ""}`
    );

    renderRows();
    renderReport(data?.report || null);
  } catch (error) {
    console.error("[war-history] loadSelectedWar error:", error);

    setMeta(
      `Impossible de charger ${getAllianceDisplayName(alliance)} pour le ${formatFrenchDate(date)} : ${error.message}`
    );

    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    renderNotes(null);
    renderDebrief(null);
  }
}

function getPlayersFromWarData(data) {
  if (Array.isArray(data?.players)) {
    return data.players.slice();
  }

  if (Array.isArray(data?.report?.players)) {
    return data.report.players.slice();
  }

  return [];
}

function resetRows() {
  originalPlayers = [];
  currentPlayers = [];
  currentSortKey = null;
  currentSortDir = "desc";
  syncHeaderSortButtons();

  rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
  renderNotes(null);
  renderDebrief(null);
}

/* ---------- Table ---------- */

function renderRows() {
  if (!currentPlayers.length) {
    rowsContainer.innerHTML = `<div class="warHistoryEmpty">Aucune donnée disponible.</div>`;
    return;
  }

  rowsContainer.innerHTML = currentPlayers
    .map((player, index) => {
      const defenseBonus = getDefenseBonusValue(player);

      return `
        <div class="warHistoryRow warHistoryDataRow">
          <div class="warHistoryCell col-rank is-sticky-1">${index + 1}</div>

          <div class="warHistoryCell col-player is-sticky-2">
            <div class="warHistoryPlayerBlock">
              <div class="warHistoryPlayerName">${escapeHtml(player?.name || "—")}</div>
              <div class="warHistoryPlayerAlliance">${escapeHtml(getAllianceDisplayName(allianceSelect.value))}</div>
            </div>
          </div>

          <div class="warHistoryCell col-ap">${formatNumber(player?.attack_points)}</div>
          <div class="warHistoryCell col-attacks">${formatNumber(player?.attacks)}</div>
          <div class="warHistoryCell col-damage">${formatNumber(player?.damage)}</div>
          <div class="warHistoryCell col-defensewins">${formatNumber(player?.defense_wins)}</div>
          <div class="warHistoryCell col-defensebonus">${formatNumber(defenseBonus)}</div>
        </div>
      `;
    })
    .join("");
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
    const av = getSortableValue(a, currentSortKey);
    const bv = getSortableValue(b, currentSortKey);

    if (av < bv) return currentSortDir === "asc" ? -1 : 1;
    if (av > bv) return currentSortDir === "asc" ? 1 : -1;

    return getSortableValue(a, "rank") - getSortableValue(b, "rank");
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

function getSortableValue(player, key) {
  if (key === "name") {
    return String(player?.name || "").toLowerCase();
  }

  if (key === "defense_bonus") {
    return normalizeSortableValue(getDefenseBonusValue(player));
  }

  return normalizeSortableValue(player?.[key]);
}

function normalizeSortableValue(value) {
  if (value === null || value === undefined || value === "") return -Infinity;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : -Infinity;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : -Infinity;
}

function getDefenseBonusValue(player) {
  if (player?.defense_bonus !== undefined) return player.defense_bonus;
  if (player?.deviations !== undefined) return player.deviations;
  return undefined;
}

/* ---------- Notes / Débrief ---------- */

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
    ? Number(summary.best_damage_share_pct ?? (Number(summary.best_damage_share || 0) * 100))
    : 0;

  const summaryHtml = summary
    ? `
      <div class="warHistorySummary">
        <div class="warHistorySummaryLine"><strong>Joueurs :</strong> ${formatNumber(summary.player_count)}</div>
        <div class="warHistorySummaryLine"><strong>Dégâts totaux :</strong> ${formatNumber(summary.total_damage)}</div>
        <div class="warHistorySummaryLine"><strong>Meilleur dégâts moyens :</strong> ${formatNumber(summary.best_avg_damage)}</div>
        <div class="warHistorySummaryLine"><strong>Meilleure part dégâts :</strong> ${formatDecimal(bestDamageSharePct, 2)}%</div>
      </div>
    `
    : "";

  const rankingHtml = ranking
    .map((player, index) => {
      const rank = player?.rank ?? index + 1;
      const score = player?.score ?? player?.score_total ?? 0;

      return `
        <div class="warHistoryNoteRow">
          <div class="warHistoryNoteRank">#${formatNumber(rank)}</div>
          <div class="warHistoryNoteName">${escapeHtml(player?.name || "—")}</div>
          <div class="warHistoryNoteScore">${formatNumber(score)}</div>
        </div>
      `;
    })
    .join("");

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

  const validPlayers = enrichedPlayers.filter((player) => {
    return player && (
      player.analysis ||
      player.score_total !== undefined ||
      player.rank !== undefined
    );
  });

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

  debriefEl.innerHTML = validPlayers
    .map((player, index) => {
      const rank = player?.rank ?? index + 1;

      return `
        <div class="warHistoryDebriefCard">
          <div class="warHistoryDebriefTop">
            <div class="warHistoryDebriefName">
              #${formatNumber(rank)} — ${escapeHtml(player?.name || "—")}
            </div>
            <div class="warHistoryDebriefScore">${formatNumber(player?.score_total ?? 0)}/100</div>
          </div>

          <div class="warHistoryDebriefStats">
            <span>Att : ${formatNumber(player?.attacks)}</span>
            <span>Pts : ${formatNumber(player?.attack_points)}</span>
            <span>Dégâts : ${formatNumber(player?.damage)}</span>
            <span>V. Déf : ${formatNumber(player?.defense_wins)}</span>
          </div>

          <div class="warHistoryDebriefText">
            ${escapeHtml(player?.analysis || "Aucune analyse disponible.")}
          </div>
        </div>
      `;
    })
    .join("");
}

/* ---------- Utils ---------- */

function loadAllianceMeta() {
  const helper = window.LoSPAlliances;
  const load = helper && typeof helper.loadAlliances === "function"
    ? helper.loadAlliances()
    : Promise.resolve([]);

  return Promise.resolve(load)
    .catch((error) => {
      console.warn("[war-history] alliances helper fallback:", error);
      return [];
    })
    .then(() => {
      const helperAlliances = getHelperAlliances(helper);
      allianceMeta = mergeAllianceMeta(helperAlliances);
      allianceMetaByKey = new Map(allianceMeta.map((alliance) => [alliance.key, alliance]));
      allianceAliasToKey = buildAliasMap(allianceMeta);
    });
}

function getHelperAlliances(helper) {
  if (!helper || typeof helper.getKnownAlliances !== "function") return [];

  const known = helper.getKnownAlliances();
  return Array.isArray(known) ? known : [];
}

function mergeAllianceMeta(helperAlliances) {
  const byKey = new Map(
    FALLBACK_ALLIANCES
      .map(normalizeAllianceMeta)
      .filter(Boolean)
      .map((alliance) => [alliance.key, alliance])
  );

  helperAlliances
    .map(normalizeAllianceMeta)
    .filter(Boolean)
    .forEach((alliance) => {
      const fallback = byKey.get(alliance.key);

      byKey.set(alliance.key, {
        key: alliance.key,
        name: alliance.name || fallback?.name || alliance.key,
        emoji: alliance.emoji || fallback?.emoji || "•",
        order: Number.isFinite(alliance.order) ? alliance.order : fallback?.order ?? 999,
        aliases: mergeAliases(fallback?.aliases || [], alliance.aliases || [])
      });
    });

  return Array.from(byKey.values()).sort(sortAllianceMeta);
}

function normalizeAllianceMeta(alliance) {
  const key = baseNormalizeAllianceKey(alliance?.key);
  if (!key) return null;

  const order = parseAllianceOrder(alliance?.order);
  const name = String(alliance?.name || "").trim();
  const emoji = String(alliance?.emoji || "").trim();
  const aliases = Array.isArray(alliance?.aliases) ? alliance.aliases : [];

  return {
    key,
    name,
    emoji,
    order: Number.isFinite(order) ? order : undefined,
    aliases: mergeAliases([key, name], aliases)
  };
}

function parseAllianceOrder(value) {
  if (value === null || value === undefined || value === "") return undefined;

  const order = Number(value);
  return Number.isFinite(order) ? order : undefined;
}

function buildAliasMap(alliances) {
  const aliasMap = new Map();

  alliances.forEach((alliance) => {
    [alliance.key, alliance.name, ...(alliance.aliases || [])].forEach((alias) => {
      const aliasKey = baseNormalizeAllianceKey(alias);
      if (aliasKey) aliasMap.set(aliasKey, alliance.key);
    });
  });

  return aliasMap;
}

function mergeAliases(...groups) {
  const aliases = [];
  const seen = new Set();

  groups.flat().forEach((alias) => {
    const value = String(alias || "").trim();
    const key = baseNormalizeAllianceKey(value);
    if (!value || !key || seen.has(key)) return;

    seen.add(key);
    aliases.push(value);
  });

  return aliases;
}

function normalizeAllianceKey(value) {
  const helper = window.LoSPAlliances;
  const helperKey = helper && typeof helper.getAllianceKey === "function"
    ? helper.getAllianceKey(value)
    : "";
  const key = baseNormalizeAllianceKey(helperKey || value);

  if (!key) return "";
  return allianceAliasToKey.get(key) || key;
}

function baseNormalizeAllianceKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function sortAllianceKeys(a, b) {
  const ma = getAllianceMeta(a);
  const mb = getAllianceMeta(b);

  return sortAllianceMeta(ma, mb);
}

function sortAllianceMeta(a, b) {
  const oa = Number.isFinite(a?.order) ? a.order : 999;
  const ob = Number.isFinite(b?.order) ? b.order : 999;

  if (oa !== ob) return oa - ob;

  return String(a?.name || a?.key || "").localeCompare(String(b?.name || b?.key || ""), "fr", {
    sensitivity: "base"
  });
}

function getAllianceMeta(value) {
  const key = normalizeAllianceKey(value);
  return allianceMetaByKey.get(key) || { key, name: capitalize(key), emoji: "", order: 999, aliases: [] };
}

function getAllianceDisplayName(value) {
  const meta = getAllianceMeta(value);
  return [meta.emoji, meta.name || capitalize(meta.key)].filter(Boolean).join(" ");
}

function descNumberSort(a, b) {
  return Number(b) - Number(a);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);

  if (Number.isFinite(n)) {
    return n.toLocaleString("fr-FR", {
      maximumFractionDigits: 0
    });
  }

  return escapeHtml(String(value));
}

function formatDecimal(value, decimals = 2) {
  const n = Number(value || 0);

  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatFrenchDate(dateStr) {
  const [year, month, day] = String(dateStr || "").split("-");

  if (!year || !month || !day) {
    return String(dateStr || "");
  }

  return `${day}/${month}/${year}`;
}

function capitalize(value) {
  const s = String(value || "");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setMeta(text) {
  if (metaEl) {
    metaEl.textContent = text;
  }
}
