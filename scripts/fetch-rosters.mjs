// scripts/fetch-rosters.mjs
import fs from "node:fs/promises";
import path from "node:path";

const SHEET_ID = process.env.SHEET_ID; // même secret/env que pour teams/joueurs
const SHEET_NAME = process.env.SHEET_NAME || "Rosters";

if (!SHEET_ID) {
  console.error("Missing env SHEET_ID");
  process.exit(1);
}

const OUT_FILE = "docs/data/rosters.json";

function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

function parseCsvLine(line) {
  // CSV Google "simple" : guillemets possibles, séparateur virgule
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toInt(x) {
  // gère "123 456" / "123,456" / "123"
  const s = (x ?? "").toString().trim();
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching CSV (${SHEET_NAME})`);
  }

  const csv = await res.text();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);

  if (lines.length < 2) {
    throw new Error("CSV seems empty or missing data rows.");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  // On s'appuie sur les positions que tu décris :
  // A: joueur (index 0)
  // B: personnage (index 1)
  // D: power (index 3)
  const idxName = 0;
  const idxChar = 1;
  const idxPower = 3;

  // rostersByPlayer[playerKey] = { player, chars: { charKey: power } }
  const byPlayer = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const player = (cols[idxName] ?? "").toString().trim();
    const character = (cols[idxChar] ?? "").toString().trim();
    const power = toInt(cols[idxPower]);

    if (!player || !character) continue;

    const pKey = normalizeKey(player);
    const cKey = normalizeKey(character);

    if (!byPlayer.has(pKey)) {
      byPlayer.set(pKey, { player, chars: {} });
    }
    // si doublon, on garde le max (sécurité)
    const cur = byPlayer.get(pKey).chars[cKey] ?? 0;
    byPlayer.get(pKey).chars[cKey] = Math.max(cur, power);
  }

  const out = Array.from(byPlayer.values());

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${OUT_FILE} (${out.length} players)`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
