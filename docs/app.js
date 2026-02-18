// ===============================
// CONFIG
// ===============================

// Nom du repo GitHub (pour servir /data/... sur GitHub Pages)
const REPO_NAME = "msf";
const BASE_PATH = location.hostname.includes("github.io") ? `/${REPO_NAME}` : "";

// Mini BDD portraits (générée via l’API MSF)
const CHAR_JSON_URL = `${BASE_PATH}/data/msf-characters.json`;

// Google Sheet
const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

// ✅ Onglet Teams par NOM (plus besoin de gid)
const TEAMS_SHEET_NAME = "Teams";

// Colonnes (ton onglet)
const TEAMS_COLS = {
  team: ["team", "Team", "Équipe", "Equipe"],
  c1: ["character1", "Character1", "perso1", "c1", "C1"],
  c2: ["character2", "Character2", "perso2", "c2", "C2"],
  c3: ["character3", "Character3", "perso3", "c3", "C3"],
  c4: ["character4", "Character4", "perso4", "c4", "C4"],
  c5: ["character5", "Character5", "perso5", "c5", "C5"],
};

// ===============================
// HELPERS
// ===============================
function norm(v) {
  return String(v ?? "").trim();
}

function pickCol(row, candidates) {
  for (const key of candidates) {
    if (row[key] != null && String(row[key]).trim() !== "") return row[key];
  }
  return null;
}

// ----- Google Sheets: GViz par nom d’onglet (JSON) -----
// (Plus robuste que CSV pour les caractères spéciaux)
function gvizBySheetNameUrl(sheetName) {
  const s = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${s}&tqx=out:json`;
}

async function fetchSheetByName_GViz(sheetName) {
  const res = await fetch(gvizBySheetNameUrl(sheetName));
  if (!res.ok) throw new Error(`GVIZ HTTP ${res.status} (sheet=${sheetName})`);

  const text = await res.text();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Unexpected GVIZ response format");

  const json = JSON.parse(text.slice(start, end + 1));
  const cols = json.table.cols.map(c => c.label);

  // Si l’onglet a des en-têtes vides, Google met parfois "" -> on garde quand même
  const rows = json.table.rows.map(r => {
    const obj = {};
    r.c.forEach((cell, i) => {
      obj[cols[i]] = cell ? (cell.v ?? cell.f ?? "") : "";
    });
    return obj;
  });

  return { cols, rows };
}

// ----- Fallback CSV par nom d’onglet -----
function csvBySheetNameUrl(sheetName) {
  const s = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${s}`;
}

function parseCSV(text) {
  // parser CSV simple (gère guillemets)
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  // last
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);

  return rows;
}

async function fetchSheetByName_CSV(sheetName) {
  const res = await fetch(csvBySheetNameUrl(sheetName));
  if (!res.ok) throw new Error(`CSV HTTP ${res.status} (sheet=${sheetName})`);
  const text = await res.text();
  const grid = parseCSV(text);
  if (!grid.length) return { cols: [], rows: [] };

  const cols = grid[0].map(h => norm(h));
  const rows = grid.slice(1).map(r => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = r[i] ?? ""));
    return obj;
  });

  return { cols, rows };
}

async function fetchTeamsSheet() {
  // On tente GViz JSON, sinon fallback CSV
  try {
    return await fetchSheetByName_GViz(TEAMS_SHEET_NAME);
  } catch (e) {
    console.warn("GViz JSON failed, trying CSV fallback:", e);
    return await fetchSheetByName_CSV(TEAMS_SHEET_NAME);
  }
}

// ===============================
// UI
// ===============================
const teamSelect = document.getElementById("teamSelect");
const refreshBtn = document.getElementById("refreshBtn");
const teamNameEl = document.getElementById("teamName");
const teamGridEl = document.getElementById("teamGrid");
const resultsListEl = document.getElementById("resultsList");

// ===============================
// STATE
// ===============================
let charById = new Map();
let teamMap = new Map(); // teamName -> [id1..id5]

// ===============================
// LOADERS
// ===============================
async function loadCharacters() {
  const res = await fetch(CHAR_JSON_URL);
  if (!res.ok) throw new Error(`Characters JSON HTTP ${res.status}`);
  const chars = await res.json();
  charById = new Map(chars.map(c => [String(c.id), c]));
}

async function loadTeams() {
  const { cols, rows } = await fetchTeamsSheet();

  // Debug léger en console (utile si un jour ça casse)
  console.log("Teams cols:", cols);

  teamMap = new Map();

  for (const r of rows) {
    const team = norm(pickCol(r, TEAMS_COLS.team));
    if (!team) continue;

    const ids = [
      norm(pickCol(r, TEAMS_COLS.c1)),
      norm(pickCol(r, TEAMS_COLS.c2)),
      norm(pickCol(r, TEAMS_COLS.c3)),
      norm(pickCol(r, TEAMS_COLS.c4)),
      norm(pickCol(r, TEAMS_COLS.c5)),
    ].filter(Boolean);

    // On accepte si 5 persos (sinon on ignore la ligne)
    if (ids.length === 5) teamMap.set(team, ids);
  }

  const teams = [...teamMap.keys()].sort((a, b) => a.localeCompare(b, "fr"));

  teamSelect.innerHTML = "";
  for (const t of teams) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    teamSelect.appendChild(opt);
  }

  if (teams.length) teamSelect.value = teams[0];
}

// ===============================
// RENDER
// ===============================
function renderTeam(teamName) {
  teamNameEl.textContent = teamName || "—";
  teamGridEl.innerHTML = "";
  resultsListEl.innerHTML = ""; // placeholder (classement plus tard)

  const ids = teamMap.get(teamName) || [];

  // affiche 5 cartes
  for (const id of ids) {
    const c = charById.get(id);

    const card = document.createElement("div");
    card.className = "teamCard";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = c?.nameFr || id;
    if (c?.portraitUrl) img.src = c.portraitUrl;

    // si portrait indispo, on laisse vide
    img.onerror = () => img.removeAttribute("src");

    const name = document.createElement("div");
    name.className = "n";
    name.textContent = c?.nameFr || id;

    card.append(img, name);
    teamGridEl.appendChild(card);
  }

  // si moins de 5 (au cas où), on complète visuellement
  for (let i = ids.length; i < 5; i++) {
    const card = document.createElement("div");
    card.className = "teamCard";
    const img = document.createElement("img");
    img.alt = "—";
    const name = document.createElement("div");
    name.className = "n";
    name.textContent = "—";
    card.append(img, name);
    teamGridEl.appendChild(card);
  }
}

// ===============================
// INIT
// ===============================
async function init() {
  try {
    await loadCharacters();
    await loadTeams();
    renderTeam(teamSelect.value);
  } catch (e) {
    console.error(e);
    teamNameEl.textContent = "Erreur de chargement";
    teamGridEl.innerHTML = "";
    resultsListEl.textContent =
      "Impossible de lire l’onglet Teams. Vérifie que le fichier est public/partagé et que les en-têtes sont bien : team, character1..character5.";
  }
}

teamSelect.addEventListener("change", () => renderTeam(teamSelect.value));
refreshBtn.addEventListener("click", init);

init();