// ===============================
// CONFIG
// ===============================
const REPO_NAME = "msf"; // change si tu renommes le repo
const BASE_PATH = location.hostname.includes("github.io") ? `/${REPO_NAME}` : "";

const CHAR_JSON_URL = `${BASE_PATH}/data/msf-characters.json`;
const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

// ✅ Mets ici le gid de l’onglet Teams
const TEAMS_TAB = { gid: 0 };

// Colonnes attendues dans l’onglet Teams
// Format idéal : Team | C1 | C2 | C3 | C4 | C5
const TEAMS_COLS = {
  team: ["Team", "Équipe", "Equipe", "Team Name"],
  c1: ["C1", "Char1", "Character 1", "CharacterId1", "Character Id 1"],
  c2: ["C2", "Char2", "Character 2", "CharacterId2", "Character Id 2"],
  c3: ["C3", "Char3", "Character 3", "CharacterId3", "Character Id 3"],
  c4: ["C4", "Char4", "Character 4", "CharacterId4", "Character Id 4"],
  c5: ["C5", "Char5", "Character 5", "CharacterId5", "Character Id 5"],
};

// ===============================
// HELPERS
// ===============================
function gvizUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?gid=${gid}&tqx=out:json`;
}

function pickCol(row, candidates) {
  for (const c of candidates) {
    if (row[c] != null && String(row[c]).trim() !== "") return row[c];
  }
  return null;
}

function norm(s) {
  return String(s ?? "").trim();
}

async function fetchGviz(gid) {
  const res = await fetch(gvizUrl(gid));
  if (!res.ok) throw new Error(`GVIZ HTTP ${res.status} for gid=${gid}`);
  const text = await res.text();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Unexpected GVIZ response format");

  const json = JSON.parse(text.slice(start, end + 1));
  const cols = json.table.cols.map(c => c.label);
  const rows = json.table.rows.map(r => {
    const obj = {};
    r.c.forEach((cell, i) => {
      obj[cols[i]] = cell ? (cell.v ?? cell.f ?? "") : "";
    });
    return obj;
  });

  return rows;
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
let teamMap = new Map(); // teamName -> [c1..c5]

// ===============================
// RENDER
// ===============================
function renderTeam(teamName) {
  teamNameEl.textContent = teamName || "—";
  teamGridEl.innerHTML = "";
  resultsListEl.innerHTML = ""; // placeholder pour plus tard

  const ids = teamMap.get(teamName) || [];

  for (const id of ids) {
    const c = charById.get(id);

    const card = document.createElement("div");
    card.className = "teamCard";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = c?.nameFr || id;
    if (c?.portraitUrl) img.src = c.portraitUrl;
    img.onerror = () => img.removeAttribute("src");

    const n = document.createElement("div");
    n.className = "n";
    n.textContent = c?.nameFr || id;

    card.append(img, n);
    teamGridEl.appendChild(card);
  }

  // Si moins de 5 ids, on complète visuellement
  for (let i = ids.length; i < 5; i++) {
    const card = document.createElement("div");
    card.className = "teamCard";
    const img = document.createElement("img");
    img.alt = "—";
    const n = document.createElement("div");
    n.className = "n";
    n.textContent = "—";
    card.append(img, n);
    teamGridEl.appendChild(card);
  }
}

// ===============================
// LOAD
// ===============================
async function loadCharacters() {
  const chars = await fetch(CHAR_JSON_URL).then(r => r.json());
  charById = new Map(chars.map(c => [String(c.id), c]));
}

async function loadTeams() {
  const rows = await fetchGviz(TEAMS_TAB.gid);

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

async function init() {
  try {
    await loadCharacters();
    await loadTeams();
    renderTeam(teamSelect.value);
  } catch (e) {
    console.error(e);
    teamNameEl.textContent = "Erreur";
    teamGridEl.innerHTML = "";
    resultsListEl.textContent =
      "Erreur de chargement. Vérifie le gid de l’onglet Teams et les noms de colonnes (Team, C1..C5).";
  }
}

// events
teamSelect.addEventListener("change", () => renderTeam(teamSelect.value));
refreshBtn.addEventListener("click", init);

// boot
init();