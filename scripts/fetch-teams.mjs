// scripts/fetch-teams.mjs
import fs from "node:fs/promises";

const SPREADSHEET_ID =
  process.env.SHEET_ID || "1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ";

const SHEET_NAME = process.env.SHEET_NAME || "Teams";

const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
  SHEET_NAME
)}`;

/**
 * Minimal CSV parser (handles quotes + commas + CRLF)
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    // escaped quote inside quoted field
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
      // avoid pushing final empty row
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  // last cell
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const norm = (x) => String(x ?? "").trim();

function headerIndexMap(headersRow) {
  const map = new Map();
  headersRow.forEach((h, idx) => map.set(norm(h).toLowerCase(), idx));
  return map;
}

function getCell(row, idx) {
  if (idx == null || idx < 0) return "";
  return norm(row[idx]);
}

async function main() {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Teams CSV`);
  const csv = await res.text();

  const grid = parseCSV(csv);
  if (!grid.length) throw new Error("Empty CSV");

  const headers = grid[0];
  const hmap = headerIndexMap(headers);

  const iTeam = hmap.get("team");
  const iMode = hmap.get("mode"); // may be missing in older sheets

  const charIdx = [
    hmap.get("character1"),
    hmap.get("character2"),
    hmap.get("character3"),
    hmap.get("character4"),
    hmap.get("character5"),
  ];

  if (iTeam == null) {
    throw new Error(`Missing required header: team. Found: ${headers.join(", ")}`);
  }

  // At least character1..3 should exist as headers (you can have 3-man teams)
  const haveSomeCharHeaders = charIdx.slice(0, 3).every((i) => typeof i === "number");
  if (!haveSomeCharHeaders) {
    throw new Error(
      `Missing headers character1/2/3 (minimum). Found: ${headers.join(", ")}`
    );
  }

  const teams = [];
  for (const r of grid.slice(1)) {
    const team = getCell(r, iTeam);
    if (!team) continue;

    const mode = iMode != null ? getCell(r, iMode) : "";

    // Collect characters that exist (3..5)
    const chars = charIdx
      .map((i) => getCell(r, i))
      .filter(Boolean);

    // Skip if less than 3 characters (useless team)
    if (chars.length < 3) continue;

    teams.push({
      team,
      mode: mode || null, // keep null if empty to make it explicit
      characters: chars,
    });
  }

  // Optional: stable order (team then mode) so diffs are clean
  teams.sort((a, b) => {
    const am = (a.mode || "").localeCompare(b.mode || "", "fr");
    if (am !== 0) return am;
    return a.team.localeCompare(b.team, "fr");
  });

  await fs.mkdir("docs/data", { recursive: true });
  await fs.writeFile("docs/data/teams.json", JSON.stringify(teams, null, 2), "utf8");

  console.log(`OK: wrote ${teams.length} teams -> docs/data/teams.json`);
  console.log("Sample:", teams.slice(0, 3));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});