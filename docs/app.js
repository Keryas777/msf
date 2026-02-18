// ===============================
// CONFIG
// ===============================

const REPO_NAME = "msf"; // <-- change uniquement si tu renommes le repo
const BASE_PATH = location.hostname.includes("github.io")
  ? `/${REPO_NAME}`
  : "";

const CHAR_JSON_URL = `${BASE_PATH}/data/msf-characters.json`;

const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

// Onglets alliances (mets les bons gid)
const ALLIANCE_TABS = [
  { label: "Alliance 1", gid: 0 },
  { label: "Alliance 2", gid: 0 },
  { label: "Alliance 3", gid: 0 },
];

// Onglet Teams
const TEAMS_TAB = { gid: 0 };

// ===============================
// HELPERS
// ===============================

function gvizUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?gid=${gid}&tqx=out:json`;
}

async function fetchGviz(gid) {
  const res = await fetch(gvizUrl(gid));
  const text = await res.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = JSON.parse(text.slice(start, end + 1));

  const cols = json.table.cols.map(c => c.label);
  return json.table.rows.map(r => {
    const obj = {};
    r.c.forEach((cell, i) => {
      obj[cols[i]] = cell ? (cell.v ?? "") : "";
    });
    return obj;
  });
}

function toNumber(x) {
  const n = Number(String(x).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ===============================
// STATE
// ===============================

let charById = new Map();
let allRows = [];
let teamMap = new Map();

// ===============================
// UI
// ===============================

const teamSelect = document.getElementById("teamSelect");
const playerFilter = document.getElementById("playerFilter");
const refreshBtn = document.getElementById("refreshBtn");

const teamGridEl = document.getElementById("teamGrid");
const teamNameEl = document.getElementById("teamName");
const resultsListEl = document.getElementById("resultsList");

// ===============================
// LOADERS
// ===============================

async function loadCharacters() {
  const chars = await fetch(CHAR_JSON_URL).then(r => r.json());
  charById = new Map(chars.map(c => [String(c.id), c]));
}

async function loadTeams() {
  const rows = await fetchGviz(TEAMS_TAB.gid);
  teamMap.clear();

  rows.forEach(r => {
    const team = r["Team"] || r["Équipe"];
    if (!team) return;

    const ids = [
      r["C1"],
      r["C2"],
      r["C3"],
      r["C4"],
      r["C5"]
    ].filter(Boolean);

    if (ids.length === 5) teamMap.set(team, ids);
  });

  teamSelect.innerHTML = "";
  [...teamMap.keys()].forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    teamSelect.appendChild(opt);
  });

  if (teamSelect.options.length) {
    teamSelect.selectedIndex = 0;
  }
}

async function loadAlliances() {
  allRows = [];

  for (const tab of ALLIANCE_TABS) {
    const rows = await fetchGviz(tab.gid);

    rows.forEach(r => {
      if (!r["Character Id"]) return;

      allRows.push({
        alliance: tab.label,
        player: r["Name"] || r["Player"],
        team: r["Team"] || r["Équipe"],
        charId: r["Character Id"],
        power: toNumber(r["Power"])
      });
    });
  }
}

// ===============================
// RENDER
// ===============================

function renderTeamHeader(team) {
  teamNameEl.textContent = team;
  teamGridEl.innerHTML = "";

  const ids = teamMap.get(team) || [];

  ids.forEach(id => {
    const c = charById.get(id);

    const div = document.createElement("div");
    div.className = "teamCard";

    div.innerHTML = `
      <img src="${c?.portraitUrl || ""}" />
      <div class="n">${c?.nameFr || id}</div>
    `;

    teamGridEl.appendChild(div);
  });
}

function renderResults(team) {
  resultsListEl.innerHTML = "";
  const ids = teamMap.get(team) || [];

  const grouped = new Map();

  allRows.forEach(r => {
    if (r.team !== team) return;
    if (!ids.includes(r.charId)) return;

    const key = r.alliance + "__" + r.player;

    if (!grouped.has(key)) {
      grouped.set(key, {
        alliance: r.alliance,
        player: r.player,
        total: 0,
        members: new Map()
      });
    }

    const g = grouped.get(key);
    g.members.set(r.charId, r.power);
  });

  const computed = [];

  grouped.forEach(g => {
    let total = 0;
    ids.forEach(id => {
      total += g.members.get(id) || 0;
    });
    computed.push({ ...g, total });
  });

  computed.sort((a, b) => b.total - a.total);

  computed.forEach(g => {
    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="rowTop">
        <div class="name">${g.player}</div>
        <div class="meta">${g.alliance} • ${g.total.toLocaleString()}</div>
      </div>
    `;

    const squad = document.createElement("div");
    squad.className = "squad";

    ids.forEach(id => {
      const c = charById.get(id);
      const power = g.members.get(id) || 0;

      squad.innerHTML += `
        <div class="portrait">
          <img src="${c?.portraitUrl || ""}">
          <div class="pmeta">
            <b>${c?.nameFr || id}</b><br>
            ${power.toLocaleString()}
          </div>
        </div>
      `;
    });

    row.appendChild(squad);
    resultsListEl.appendChild(row);
  });
}

// ===============================
// INIT
// ===============================

async function init() {
  await loadCharacters();
  await loadTeams();
  await loadAlliances();

  const team = teamSelect.value;
  renderTeamHeader(team);
  renderResults(team);
}

teamSelect.addEventListener("change", () => {
  const team = teamSelect.value;
  renderTeamHeader(team);
  renderResults(team);
});

refreshBtn.addEventListener("click", init);

init();