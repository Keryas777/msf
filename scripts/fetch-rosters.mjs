// scripts/fetch-rosters.mjs
import fs from "node:fs/promises";
import path from "node:path";

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
  return v;
}

function computeIsoMax(cols, idxs) {
  let m = 0;
  for (const i of idxs) {
    const v = toInt(cols[i]);
    if (v > m) m = v;
  }
  return m;
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

  // Indices fixes selon ton sheet (0-based)
  const idxName = 0;       // A
  const idxChar = 1;       // B
  const idxLevel = 2;      // C
  const idxPower = 3;      // D
  const idxGear = 6;       // G

  const idxIsoClass = 11;  // L (ISO class text)
  const idxIsoMatrix = 12; // M (ISO color text)

  const idxIsoCols = [13, 14, 15, 16, 17]; // N O P Q R -> valeurs iso (int)

  // byPlayer:
  //  - chars: { charKey: {power, level, gear, isoMax} }
  //  - iso:   { charKey: { isoClass, isoColor } }
  //
  // On conserve la ligne de POWER max pour chaque perso.
  const byPlayer = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const player = (cols[idxName] ?? "").toString().trim();
    const character = (cols[idxChar] ?? "").toString().trim();

    if (!player || !character) continue;

    const power = toInt(cols[idxPower]);
    const level = toInt(cols[idxLevel]);
    const gear = toInt(cols[idxGear]);
    const isoMax = computeIsoMax(cols, idxIsoCols);

    const isoClass = normIsoClass(cols[idxIsoClass]);
    const isoColor = normIsoColor(cols[idxIsoMatrix]);

    const pKey = normalizeKey(player);
    const cKey = normalizeKey(character);

    if (!byPlayer.has(pKey)) byPlayer.set(pKey, { player, chars: {}, iso: {} });
    const entry = byPlayer.get(pKey);

    const prev = entry.chars[cKey];
    const prevPower = prev && typeof prev === "object" ? toInt(prev.power) : 0;

    // si power plus grand -> on remplace tout (cohérent)
    if (power > prevPower) {
      entry.chars[cKey] = { power, level, gear, isoMax };

      if (isoClass || isoColor) {
        entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
      }
      continue;
    }

    // si power égal -> on garde le meilleur "progress" (max) pour level/gear/isoMax
    if (power === prevPower && prev && typeof prev === "object") {
      prev.level = Math.max(toInt(prev.level), level);
      prev.gear = Math.max(toInt(prev.gear), gear);
      prev.isoMax = Math.max(toInt(prev.isoMax), isoMax);

      // iso : si on a une info sur cette ligne et pas déjà, on la garde
      if ((isoClass || isoColor) && !entry.iso[cKey]) {
        entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
      }
    }

    // si prev absent (power==0) et power==0 => on peut quand même stocker les infos
    if (!prev && power === 0) {
      entry.chars[cKey] = { power, level, gear, isoMax };
      if (isoClass || isoColor) {
        entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
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