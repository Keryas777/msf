// scripts/fetch-teams.mjs
import fs from "node:fs/promises";

const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";
const SHEET_NAME = "Teams";

const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }

    if (ch === "," && !inQuotes) { row.push(cell); cell = ""; continue; }

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

  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function norm(x) { return String(x ?? "").trim(); }

async function main() {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Teams CSV`);
  const csv = await res.text();

  const grid = parseCSV(csv);
  if (!grid.length) throw new Error("Empty CSV");

  const headers = grid[0].map(h => norm(h).toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());

  const iTeam = idx("team");
  const i1 = idx("character1");
  const i2 = idx("character2");
  const i3 = idx("character3");
  const i4 = idx("character4");
  const i5 = idx("character5");

  if ([iTeam,i1,i2,i3,i4,i5].some(i => i < 0)) {
    throw new Error(`Missing headers. Found: ${headers.join(", ")}`);
  }

  const teams = [];
  for (const r of grid.slice(1)) {
    const team = norm(r[iTeam]);
    if (!team) continue;

    const chars = [r[i1], r[i2], r[i3], r[i4], r[i5]].map(norm);
    if (chars.some(c => !c)) continue;

    teams.push({ team, characters: chars });
  }

  await fs.mkdir("docs/data", { recursive: true });
  await fs.writeFile("docs/data/teams.json", JSON.stringify(teams, null, 2), "utf8");

  console.log(`OK: wrote ${teams.length} teams -> docs/data/teams.json`);
  console.log("Sample:", teams.slice(0, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});