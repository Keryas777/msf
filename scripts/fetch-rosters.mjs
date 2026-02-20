// scripts/fetch-rosters.mjs
import fs from "node:fs/promises";
import path from "node:path";

// Accepte plusieurs noms de variables (selon tes workflows existants)
const SHEET_ID =
  process.env.SHEET_ID ||
  process.env.SPREADSHEET_ID ||
  process.env.GOOGLE_SHEET_ID ||
  process.env.SHEETID;

const SHEET_NAME = process.env.SHEET_NAME || "Rosters";

if (!SHEET_ID) {
  console.error("Missing env SHEET_ID (or SPREADSHEET_ID / GOOGLE_SHEET_ID)");
  process.exit(1);
}

const OUT_FILE = "docs/data/rosters.json";

function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "")
    .replace(/[’']/g, "");
}

function parseCsvLine(line) {
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
  const s = (x ?? "").toString().trim();
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function normIsoClass(x) {
  return (x ?? "").toString().trim().toLowerCase();
}

function normIsoColor(x) {
  // IMPORTANT : on NE force PAS green ici
  // (car tu veux: "si vide => green" côté web-app)
  const v = (x ?? "").toString().trim().toLowerCase();
  if (!v) return "";
  if (v === "vert") return "green";
  if (v === "bleu") return "blue";
  if (v === "violet") return "purple";
  return v; // si déjà green/blue/purple ou autre
}

async function main() {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching CSV (${SHEET_NAME})`);

  const csv = await res.text();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);

  if (lines.length < 2) throw new Error("CSV empty / no data rows.");

  // Indices fixes selon ton sheet:
  // A=0 (joueur), B=1 (personnage), D=3 (power)
  // L=11 (ISO Class), M=12 (ISO Matrix)
  const idxName = 0;
  const idxChar = 1;
  const idxPower = 3;
  const idxIsoClass = 11;
  const idxIsoMatrix = 12;

  // byPlayer:
  //  - chars: { charKey: power }
  //  - iso:   { charKey: { isoClass, isoColor } }
  //
  // On garde l'entrée issue de la ligne au POWER max (comme avant).
  const byPlayer = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const player = (cols[idxName] ?? "").toString().trim();
    const character = (cols[idxChar] ?? "").toString().trim();
    const power = toInt(cols[idxPower]);

    const isoClass = normIsoClass(cols[idxIsoClass]);
    const isoColor = normIsoColor(cols[idxIsoMatrix]);

    if (!player || !character) continue;

    const pKey = normalizeKey(player);
    const cKey = normalizeKey(character);

    if (!byPlayer.has(pKey)) byPlayer.set(pKey, { player, chars: {}, iso: {} });

    const entry = byPlayer.get(pKey);

    const prevPower = entry.chars[cKey] ?? 0;

    // si power plus grand -> on remplace power ET iso (cohérent)
    if (power >= prevPower) {
      entry.chars[cKey] = power;

      // On écrit iso seulement si on a au moins une info (sinon on laisse vide)
      if (isoClass || isoColor) {
        entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
      } else {
        // si on remplace par une ligne sans iso, on ne supprime pas l’ancienne
        // (pour éviter de "perdre" l’info si la ligne power max n'a pas L/M)
        // donc on ne touche pas entry.iso[cKey]
      }
    }
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