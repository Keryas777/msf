// ==== CONFIG À REMPLIR ====
const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

// Onglets "alliances" (1 par alliance)
const ALLIANCE_TABS = [
  { key: "a1", label: "Alliance 1", gid: 0 }, // <-- remplace
  { key: "a2", label: "Alliance 2", gid: 0 }, // <-- remplace
  { key: "a3", label: "Alliance 3", gid: 0 }, // <-- remplace
];

// Onglet "Teams" (source de vérité)
const TEAMS_TAB = { label: "Teams", gid: 0 }; // <-- remplace

// Colonnes attendues
// Alliances: une ligne par perso d'une team d'un joueur (ou équivalent)
const ALLIANCE_COLS = {
  player: ["Name", "Player", "Joueur", "Pseudo"],
  team: ["Team", "Équipe", "Equipe"],
  charId: ["Character Id", "CharacterId", "Char Id", "Character", "Id"],
  power: ["Power", "Puissance", "TCP", "Power (Character)"],
};

// Teams: une ligne par team avec 5 Character Id
// Exemple idéal: Team | C1 | C2 | C3 | C4 | C5
const TEAMS_COLS = {
  team: ["Team", "Équipe", "Equipe", "Team Name"],
  c1: ["C1", "Char1", "Character 1", "CharacterId1", "Character Id 1"],
  c2: ["C2", "Char2", "Character 2", "CharacterId2", "Character Id 2"],
  c3: ["C3", "Char3", "Character 3", "CharacterId3", "Character Id 3"],
  c4: ["C4", "Char4", "Character 4", "CharacterId4", "Character Id 4"],
  c5: ["C5", "Char5", "Character 5", "CharacterId5", "Character Id 5"],
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
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?gid=${gid}&tqx=out:json`;
}

async function fetchGviz(gid) {
  const res = await fetch(gvizUrl(gid));
  if (!res.ok) throw new Error(`GVIZ fetch failed gid=${gid}: ${res.status}`);
  const text = await res.text();

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

// ==== UI ====
const teamSelect = document.getElementById("teamSelect");
const playerFilter = document.getElementById("playerFilter");
const refreshBtn = document.getElementById("refreshBtn");

const teamNameEl = document.getElementById("teamName");
const teamGridEl = document.getElementById("teamGrid");
const resultsListEl = document.getElementById("resultsList");

// ==== STATE ====
let charById = new Map();
let allRows = [];          // { alliance, player, team, charId, power }
let teamMap = new Map();   // teamName -> [c1..c5]

// ==== RENDER ====
function renderTeamHeader(team, charIds) {
  teamNameEl.textContent = team || "—";
  teamGridEl.innerHTML = "";

  for (const id of (charIds || [])) {
    const c = charById.get(id);

    const card = document.createElement("div");
    card.className = "teamCard";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = c?.nameFr || id;
    if (c?.portraitUrl) img.src = c.portraitUrl;
    img.onerror = () => { img.removeAttribute("src"); };

    const n = document.createElement("div");
    n.className = "n";
    n.textContent = c?.nameFr || id;

    card.append(img, n);
    teamGridEl.appendChild(card);
  }

  // Si moins de 5, on complète visuellement (optionnel)
  const missing = 5 - (charIds?.length || 0);
  for (let i = 0; i < missing; i++) {
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

function renderResults(selectedTeam) {
  resultsListEl.innerHTML = "";

  const squadIds = teamMap.get(selectedTeam) || [];
  const squadSet = new Set(squadIds);

  const term = playerFilter.value.toLowerCase().trim();

  // Group by alliance+player
  const grouped = new Map();
  for (const r of allRows) {
    if (r.team !== selectedTeam) continue;
    if (!squadSet.has(r.charId)) continue;
    if (term && !r.player.toLowerCase().includes(term)) continue;

    const key = `${r.alliance}__${r.player}`;
    if (!grouped.has(key)) grouped.set(key, { alliance: r.alliance, player: r.player, byChar: new Map() });
    // si doublon charId, on garde le power max
    const prev = grouped.get(key).byChar.get(r.charId) || 0;
    if (r.power > prev) grouped.get(key).byChar.set(r.charId, r.power);
  }

  const computed = [];
  for (const g of grouped.values()) {
    // Construire la squad dans l'ordre défini par l'onglet Teams
    const squad = squadIds.map(charId => ({
      charId,
      power: g.byChar.get(charId) || 0
    }));

    const total = squad.reduce((s, x) => s + x.power, 0);
    computed.push({ ...g, squad, totalPower: total });
  }

  computed.sort((a, b) => b.totalPower - a.totalPower);

  for (const item of computed) {
    const row = document.createElement("div");
    row.className = "row";

    const top = document.createElement("div");
    top.className = "rowTop";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.player;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.alliance} • Total: ${Math.round(item.totalPower).toLocaleString("fr-FR")}`;

    top.append(name, meta);

    const squadEl = document.createElement("div");
    squadEl.className = "squad";

    for (const s of item.squad) {
      const c = charById.get(s.charId);

      const p = document.createElement("div");
      p.className = "portrait";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = c?.nameFr || s.charId;
      if (c?.portraitUrl) img.src = c.portraitUrl;
      img.onerror = () => { img.removeAttribute("src"); };

      const pm = document.createElement("div");
      pm.className = "pmeta";
      pm.innerHTML = `<b>${(c?.nameFr || s.charId)}</b><br>${Math.round(s.power).toLocaleString("fr-FR")}`;

      p.append(img, pm);
      squadEl.appendChild(p);
    }

    row.append(top, squadEl);
    resultsListEl.appendChild(row);
  }
}

function rebuildUI() {
  const selectedTeam = teamSelect.value || null;
  if (!selectedTeam) {
    renderTeamHeader(null, []);
    resultsListEl.innerHTML = "";
    return;
  }
  renderTeamHeader(selectedTeam, teamMap.get(selectedTeam) || []);
  renderResults(selectedTeam);
}

// ==== LOADERS ====
async function loadCharacters() {
  const chars = await fetch(CHAR_JSON_URL).then(r => r.json());
  charById = new Map(chars.map(c => [String(c.id), c]));
}

async function loadTeamsTab() {
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

    // On ne garde que les teams complètes (ou presque) — modifie si tu veux tolérer <5
    if (ids.length >= 5) teamMap.set(team, ids.slice(0, 5));
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

async function loadAllianceTabs() {
  const datasets = await Promise.all(
    ALLIANCE_TABS.map(async (tab) => {
      const rows = await fetchGviz(tab.gid);
      return rows
        .map(r => ({
          alliance: tab.label,
          player: norm(pickCol(r, ALLIANCE_COLS.player)),
          team: norm(pickCol(r, ALLIANCE_COLS.team)),
          charId: norm(pickCol(r, ALLIANCE_COLS.charId)),
          power: toNumber(pickCol(r, ALLIANCE_COLS.power)),
        }))
        .filter(x => x.player && x.team && x.charId);
    })
  );

  allRows = datasets.flat();
}

async function loadAll() {
  await loadCharacters();
  await loadTeamsTab();
  await loadAllianceTabs();
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
  resultsListEl.textContent =
    "Erreur de chargement. Vérifie les gid (Teams + alliances) et les noms de colonnes.";
});
