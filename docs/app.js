const REPO_NAME = "msf";
const BASE_PATH = location.hostname.includes("github.io") ? `/${REPO_NAME}` : "";
const CHAR_JSON_URL = `${BASE_PATH}/data/msf-characters.json`;

const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";
const TEAMS_SHEET_NAME = "Teams";

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function parseCSV(text) {
  const rows = text.split("\n").map(r => r.split(","));
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] ? r[i].trim() : "");
    return obj;
  });
}

const teamSelect = document.getElementById("teamSelect");
const refreshBtn = document.getElementById("refreshBtn");
const teamNameEl = document.getElementById("teamName");
const teamGridEl = document.getElementById("teamGrid");

let charById = new Map();
let teamMap = new Map();

async function loadCharacters() {
  const res = await fetch(CHAR_JSON_URL);
  const chars = await res.json();
  charById = new Map(chars.map(c => [c.id, c]));
}

async function loadTeams() {
  const res = await fetch(csvUrl(TEAMS_SHEET_NAME));
  const text = await res.text();
  const rows = parseCSV(text);

  teamMap.clear();

  for (const r of rows) {
    if (!r.team) continue;

    teamMap.set(r.team, [
      r.character1,
      r.character2,
      r.character3,
      r.character4,
      r.character5
    ]);
  }

  teamSelect.innerHTML = "";
  [...teamMap.keys()].sort().forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    teamSelect.appendChild(opt);
  });
}

function renderTeam(teamName) {
  teamNameEl.textContent = teamName || "";
  teamGridEl.innerHTML = "";

  const ids = teamMap.get(teamName) || [];

  ids.forEach(id => {
    const c = charById.get(id);

    const card = document.createElement("div");
    card.className = "teamCard";

    const img = document.createElement("img");
    img.src = c?.portraitUrl || "";
    img.alt = c?.nameFr || id;

    const name = document.createElement("div");
    name.className = "n";
    name.textContent = c?.nameFr || id;

    card.append(img, name);
    teamGridEl.appendChild(card);
  });
}

async function init() {
  try {
    await loadCharacters();
    await loadTeams();
    renderTeam(teamSelect.value);
  } catch (e) {
    teamNameEl.textContent = "Erreur de chargement";
  }
}

teamSelect.addEventListener("change", () => renderTeam(teamSelect.value));
refreshBtn.addEventListener("click", init);

init();