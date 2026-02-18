// ==== CONFIG À REMPLIR ====
const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

// Mets ici tes onglets (1 par alliance).
// gid = le nombre dans l'URL quand tu es sur l'onglet (#gid=123456789)
const SHEET_TABS = [
  { key: "alliance1", label: "Alliance 1", gid: 0 },           // <-- remplace
  { key: "alliance2", label: "Alliance 2", gid: 0 },           // <-- remplace
  { key: "alliance3", label: "Alliance 3", gid: 0 },           // <-- remplace
];

// Colonnes attendues dans chaque onglet (ajuste si besoin)
// - player: nom du joueur
// - team: nom de l'équipe
// - charId: id interne (ex: AbsorbingMan) (parfait pour ta BDD)
// - power: puissance du perso (numérique)
const COLS = {
  player: ["Name", "Player", "Joueur", "Pseudo"],
  team: ["Team", "Équipe", "Equipe"],
  charId: ["Character Id", "CharacterId", "Char Id", "Character", "Id"],
  power: ["Power", "Puissance", "TCP", "Power (Character)"],
};

const CHAR_JSON_URL = "../data/msf-characters.json";

// ==== HELPERS ====
function pickCol(row, candidates) {
  for (const c of candidates) {
    if (row[c] != null && String(row[c]).trim() !== "") return row[c];
  }
  return null;
}

function toNumber(x) {
  if (x == null) return 0;
  const s = String(x).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function norm(s) {
  return String(s ?? "").trim();
}

function gvizUrl(gid) {
  // Renvoie du JSON encapsulé dans une fonction (google.visualization...)
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?gid=${gid}&tqx=out:json`;
}

async function fetchGviz(gid) {
  const res = await fetch(gvizUrl(gid));
  if (!res.ok) throw new Error(`GVIZ fetch failed gid=${gid}: ${res.status}`);
  const text = await res.text();

  // Format typique : google.visualization.Query.setResponse({...});
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Unexpected GVIZ response format");
  const json = JSON.parse(text.slice(start, end + 1));

  const table = json.table;
  const cols = table.cols.map(c => c.label);
  const rows = table.rows.map(r => {
    const o = {};
    r.c.forEach((cell, i) => {
      o[cols[i]] = cell ? (cell.v ?? cell.f ?? "") : "";
    });
    return o;
  });

  return rows;
}

// ==== STATE ====
let characters = [];
let charById = new Map();
let allRows = []; // rows fusionnées multi-onglets

// ==== UI ====
const teamSelect = document.getElementById("teamSelect");
const playerFilter = document.getElementById("playerFilter");
const refreshBtn = document.getElementById("refreshBtn");

const teamNameEl = document.getElementById("teamName");
const teamGridEl = document.getElementById("teamGrid");
const resultsListEl = document.getElementById("resultsList");

function renderTeamHeader(team, teamComp) {
  teamNameEl.textContent = team ? team : "—";
  teamGridEl.innerHTML = "";

  const five = teamComp.slice(0, 5);
  for (const id of five) {
    const c = charById.get(id);
    const card = document.createElement("div");
    card.className = "teamCard";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = c?.nameFr || id;
    img.src = c?.portraitUrl || "";
    img.onerror = () => { img.removeAttribute("src"); };

    const n = document.createElement("div");
    n.className = "n";
    n.textContent = c?.nameFr || id;

    card.append(img, n);
    teamGridEl.appendChild(card);
  }
}

function renderResults(rows, selectedTeam) {
  resultsListEl.innerHTML = "";

  const term = playerFilter.value.toLowerCase().trim();

  // Group by alliance+player, then build a 5-character squad for that team
  const grouped = new Map();

  for (const r of rows) {
    if (selectedTeam && r.team !== selectedTeam) continue;
    if (term && !r.player.toLowerCase().includes(term)) continue;

    const key = `${r.alliance}__${r.player}`;
    if (!grouped.has(key)) grouped.set(key, { alliance: r.alliance, player: r.player, members: [] });
    grouped.get(key).members.push(r);
  }

  const computed = [];
  for (const g of grouped.values()) {
    // Build squad: sort members by power desc, take top 5
    const squad = g.members
      .slice()
      .sort((a, b) => b.power - a.power)
      .slice(0, 5);

    const total = squad.reduce((sum, x) => sum + x.power, 0);

    // Keep the 5 unique charIds in order (some sheets can have duplicates)
    const unique = [];
    const seen = new Set();
    for (const s of squad) {
      if (!seen.has(s.charId)) { seen.add(s.charId); unique.push(s); }
      if (unique.length === 5) break;
    }

    computed.push({ ...g, squad: unique, totalPower: total });
  }

  computed.sort((a, b) => b.totalPower - a.totalPower);

  for (const item of computed) {
    const row = document.createElement("div");
    row.className = "row";

    const top = document.createElement("div");
    top.className = "rowTop";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `${item.player}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.alliance} • Total: ${Math.round(item.totalPower).toLocaleString("fr-FR")}`;

    top.append(name, meta);

    const squadEl = document.createElement("div");
    squadEl.className = "squad";

    // Always render 5 slots
    for (let i = 0; i < 5; i++) {
      const s = item.squad[i];
      const charId = s?.charId;
      const power = s?.power ?? 0;
      const c = charId ? charById.get(charId) : null;

      const p = document.createElement("div");
      p.className = "portrait";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = c?.nameFr || charId || "—";
      if (c?.portraitUrl) img.src = c.portraitUrl;
      img.onerror = () => { img.removeAttribute("src"); };

      const pm = document.createElement("div");
      pm.className = "pmeta";
      pm.innerHTML = `<b>${(c?.nameFr || charId || "—")}</b><br>${Math.round(power).toLocaleString("fr-FR")}`;

      p.append(img, pm);
      squadEl.appendChild(p);
    }

    row.append(top, squadEl);
    resultsListEl.appendChild(row);
  }
}

// Derive team composition: for the selected team, find the most common 5 charIds across all players
function computeTeamComposition(rows, selectedTeam) {
  // Count charIds among that team across all rows
  const counts = new Map();
  for (const r of rows) {
    if (r.team !== selectedTeam) continue;
    counts.set(r.charId, (counts.get(r.charId) || 0) + 1);
  }
  // pick top 5 most frequent charIds
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([charId]) => charId);
}

function rebuildUI() {
  const selectedTeam = teamSelect.value || null;
  if (!selectedTeam) {
    renderTeamHeader(null, []);
    resultsListEl.innerHTML = "";
    return;
  }
  const teamComp = computeTeamComposition(allRows, selectedTeam);
  renderTeamHeader(selectedTeam, teamComp);
  renderResults(allRows, selectedTeam);
}

// ==== LOAD ====
async function loadAll() {
  // 1) Load characters DB
  characters = await fetch(CHAR_JSON_URL).then(r => r.json());
  charById = new Map(characters.map(c => [String(c.id), c]));

  // 2) Load all sheet tabs
  const datasets = await Promise.all(
    SHEET_TABS.map(async (tab) => {
      const rows = await fetchGviz(tab.gid);
      return rows.map(r => {
        const player = norm(pickCol(r, COLS.player));
        const team = norm(pickCol(r, COLS.team));
        const charId = norm(pickCol(r, COLS.charId));
        const power = toNumber(pickCol(r, COLS.power));
        return { alliance: tab.label, player, team, charId, power };
      })
      // keep only rows that can be used
      .filter(x => x.player && x.team && x.charId);
    })
  );

  allRows = datasets.flat();

  // 3) Build team list from sheet data
  const teams = [...new Set(allRows.map(r => r.team))].sort((a, b) => a.localeCompare(b, "fr"));
  teamSelect.innerHTML = "";
  for (const t of teams) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    teamSelect.appendChild(opt);
  }

  // Select first team by default
  if (teams.length) teamSelect.value = teams[0];

  rebuildUI();
}

// events
teamSelect.addEventListener("change", rebuildUI);
playerFilter.addEventListener("input", rebuildUI);
refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "…";
  try { await loadAll(); }
  finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Rafraîchir";
  }
});

// boot
loadAll().catch(err => {
  console.error(err);
  document.getElementById("resultsList").textContent =
    "Erreur de chargement. Vérifie les gid des onglets et les noms de colonnes.";
});
