// scripts/fetch-teams.mjs
import fs from "node:fs/promises";

const SPREADSHEET_ID =
  process.env.SHEET_ID || "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

const SHEET_NAME = process.env.SHEET_NAME || "Teams";

const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
  SHEET_NAME
)}`;

/* ---------------- CSV PARSER ---------------- */

function parseCSV(text) {
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
      if (row.some(c => c !== "")) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some(c => c !== "")) rows.push(row);

  return rows;
}

const norm = x => String(x ?? "").trim();

/* ---------------- MAIN ---------------- */

async function main() {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Teams CSV`);

  const csv = await res.text();
  const grid = parseCSV(csv);

  if (!grid.length) throw new Error("Empty CSV");

  const headers = grid[0].map(h => norm(h).toLowerCase());
  const idx = name => headers.indexOf(name.toLowerCase());

  const iTeam = idx("team");
  const iMode = idx("mode");

  const charIndexes = [
    idx("character1"),
    idx("character2"),
    idx("character3"),
    idx("character4"),
    idx("character5")
  ].filter(i => i >= 0);

  if (iTeam < 0) throw new Error("Missing header: team");
  if (iMode < 0) throw new Error("Missing header: mode");
  if (!charIndexes.length) throw new Error("No character columns found");

  const teams = [];

  for (const row of grid.slice(1)) {
    const team = norm(row[iTeam]);
    if (!team) continue;

    const mode = norm(row[iMode]);

    // 🔥 accepte 1 à 5 persos
    const characters = charIndexes
      .map(i => norm(row[i]))
      .filter(Boolean);

    if (characters.length === 0) continue;

    teams.push({
      team,
      mode,
      characters
    });
  }

  // tri propre pour stabilité des commits
  teams.sort((a, b) => {
    const m = a.mode.localeCompare(b.mode, "fr");
    if (m !== 0) return m;
    return a.team.localeCompare(b.team, "fr");
  });

  await fs.mkdir("docs/data", { recursive: true });
  await fs.writeFile(
    "docs/data/teams.json",
    JSON.stringify(teams, null, 2),
    "utf8"
  );

  console.log(`✅ ${teams.length} teams written`);
  console.log("Modes détectés :", [...new Set(teams.map(t => t.mode))]);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});