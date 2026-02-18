// scripts/fetch-joueurs.mjs
import fs from "node:fs/promises";

const SPREADSHEET_ID = "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";
const SHEET_NAME = "Joueurs";

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
      row.push(cell); cell = "";
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

const norm = (x) => String(x ?? "").trim();

async function main() {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Joueurs CSV`);
  const csv = await res.text();

  const grid = parseCSV(csv);
  if (!grid.length) throw new Error("Empty CSV");

  const headers = grid[0].map(h => norm(h).toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());

  // Ton onglet a "JOUEURS" et "ALLIANCES" d'après ta capture
  const iPlayer = idx("joueurs");
  const iAlliance = idx("alliances");

  if (iPlayer < 0 || iAlliance < 0) {
    throw new Error(`Missing headers. Found: ${headers.join(", ")}`);
  }

  const players = [];
  for (const r of grid.slice(1)) {
    const player = norm(r[iPlayer]);
    const alliance = norm(r[iAlliance]);
    if (!player || !alliance) continue;
    players.push({ player, alliance });
  }

  await fs.mkdir("docs/data", { recursive: true });
  await fs.writeFile("docs/data/joueurs.json", JSON.stringify(players, null, 2), "utf8");

  console.log(`OK: wrote ${players.length} players -> docs/data/joueurs.json`);
  console.log("Sample:", players.slice(0, 5));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
