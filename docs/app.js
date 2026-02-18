const REPO_NAME = "msf";
const BASE_PATH = location.hostname.includes("github.io") ? `/${REPO_NAME}` : "";

const CHAR_JSON_URL = `${BASE_PATH}/data/msf-characters.json`;
const TEAMS_JSON_URL = `${BASE_PATH}/data/teams.json`;

const teamSelect = document.getElementById("teamSelect");
const refreshBtn = document.getElementById("refreshBtn");
const teamNameEl = document.getElementById("teamName");
const teamGridEl = document.getElementById("teamGrid");
const resultsListEl = document.getElementById("resultsList");

let charById = new Map();
let teamMap = new Map();

async function loadCharacters() {
  const res = await fetch(CHAR_JSON_URL);
  if (!res.ok) throw new Error(`Characters HTTP ${res.status}`);
  const chars = await res.json();
  charById = new Map(chars.map(c => [String(c.id), c]));
}

async function loadTeamsLocal() {
  const res = await fetch(TEAMS_JSON_URL);
  if (!res.ok) throw new Error(`Teams HTTP ${res.status}`);
  const teams = await res.json();

  teamMap = new Map(teams.map(t => [t.team, t.characters]));
  const names = [...teamMap.keys()].sort((a,b) => a.localeCompare(b, "fr"));

  teamSelect.innerHTML = "";
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    teamSelect.appendChild(opt);
  }
  if (names.length) teamSelect.value = names[0];
}

function renderTeam(teamName) {
  teamNameEl.textContent = teamName || "—";
  teamGridEl.innerHTML = "";
  resultsListEl.textContent = ""; // placeholder

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

    const name = document.createElement("div");
    name.className = "n";
    name.textContent = c?.nameFr || id;

    card.append(img, name);
    teamGridEl.appendChild(card);
  }
}

async function init() {
  try {
    await loadCharacters();
    await loadTeamsLocal();
    renderTeam(teamSelect.value);
  } catch (e) {
    console.error(e);
    teamNameEl.textContent = "Erreur de chargement";
    resultsListEl.textContent =
      "Données indisponibles. Lance le workflow “Fetch Teams (Sheet)” pour générer data/teams.json.";
  }
}

teamSelect.addEventListener("change", () => renderTeam(teamSelect.value));
refreshBtn.addEventListener("click", init);

init();
