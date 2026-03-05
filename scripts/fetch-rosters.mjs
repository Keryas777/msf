// scripts/fetch-rosters.mjs
// Génère docs/data/rosters.json à partir de 3 onglets Rosters (gid) via gviz:
// - rosters_zeus
// - rosters_dionysos
// - rosters_poseidon
//
// Sortie: [{ player, chars: {...}, iso: {...} }, ...]
// Règle: on garde la ligne "power max" par perso+character.
// Si égalité: on maximise level/gear/isoMax, et on garde iso si dispo.

import fs from "node:fs/promises";
import path from "node:path";

const SHEET_ID =
  process.env.SHEET_ID ||
  process.env.SPREADSHEET_ID ||
  process.env.GOOGLE_SHEET_ID ||
  process.env.SHEETID ||
  "";

const OUT_FILE = process.env.OUT_FILE || "docs/data/rosters.json";

// Optionnel: override direct CSV url
const ROSTERS_ZEUS_CSV_URL = process.env.ROSTERS_ZEUS_CSV_URL || "";
const ROSTERS_DIONYSOS_CSV_URL = process.env.ROSTERS_DIONYSOS_CSV_URL || "";
const ROSTERS_POSEIDON_CSV_URL = process.env.ROSTERS_POSEIDON_CSV_URL || "";

// Sinon: gid
const ROSTERS_ZEUS_GID = process.env.ROSTERS_ZEUS_GID || "";
const ROSTERS_DIONYSOS_GID = process.env.ROSTERS_DIONYSOS_GID || "";
const ROSTERS_POSEIDON_GID = process.env.ROSTERS_POSEIDON_GID || "";

function gvizCsvUrlByGid(sheetId, gid) {
  // gviz: tqx=out:csv + gid
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`;
  const params = new URLSearchParams({ tqx: "out:csv", gid: String(gid) });
  return `${base}?${params.toString()}`;
}

// ---------- Utils ----------
function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "")
    .replace(/[’']/g, "");
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return 0;
  // accepte "1 234 567", "1,234,567", "1234567"
  const cleaned = s.replace(/[^\d-]/g, "");
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function normIsoClass(x) {
  return String(x ?? "").trim().toLowerCase();
}

function normIsoColor(x) {
  // IMPORTANT : on NE force PAS green ici (tu fais "si vide => green" côté web-app)
  const v = String(x ?? "").trim().toLowerCase();
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

// ---------- CSV parser (robuste, char-by-char) ----------
function parseCsvWithDelimiter(text, delim) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  const s = String(text || "").replace(/^\uFEFF/, ""); // BOM

  while (i < s.length) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delim) {
      row.push(cur);
      cur = "";
      i += 1;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      row.push(cur);
      cur = "";

      if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);
      row = [];

      if (ch === "\r" && s[i + 1] === "\n") i += 2;
      else i += 1;

      continue;
    }

    cur += ch;
    i += 1;
  }

  row.push(cur);
  if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);

  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}

function detectBestDelimiter(text) {
  const candidates = [",", ";", "\t"];
  let best = { delim: ",", rows: [], score: -1 };

  for (const d of candidates) {
    const rows = parseCsvWithDelimiter(text, d);
    // score simple: plus il y a de lignes, mieux c’est
    // (en gviz out:csv c’est presque toujours ",")
    const score = rows.length;
    if (score > best.score) best = { delim: d, rows, score };
  }

  return best;
}

function parseCsvToRows(text, label) {
  const best = detectBestDelimiter(text);
  const rows = best.rows;

  console.log(`[rosters] Best delimiter (${label}): ${JSON.stringify(best.delim)} (rows=${rows.length})`);

  if (!rows.length) return [];

  // Trouve la première ligne non vide = header, puis dataRows = tout après
  const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (headerIdx === -1) return [];

  const dataRows = rows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  return dataRows;
}

async function fetchCsv(url, label) {
  console.log(`[rosters] Fetch CSV (${label}): ${url}`);
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status} (${label})`);
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error(`❌ Response looks like HTML, not CSV (${label}).`);
    console.error("➡️ Vérifie que le Google Sheet est lisible publiquement, et que le gid est correct.");
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  return text;
}

function resolveSource(label, directUrl, gid) {
  if (directUrl) return directUrl;
  if (!SHEET_ID) return "";
  if (!gid) return "";
  return gvizCsvUrlByGid(SHEET_ID, gid);
}

// ---------- Parse & merge ----------
function mergeRowsInto(byPlayer, rows) {
  // Indices fixes selon TON sheet (0-based) — inchangés
  const idxName = 0; // A
  const idxChar = 1; // B
  const idxLevel = 2; // C
  const idxPower = 3; // D
  const idxGear = 6; // G

  const idxIsoClass = 11; // L
  const idxIsoMatrix = 12; // M

  const idxIsoCols = [13, 14, 15, 16, 17]; // N O P Q R

  for (const cols of rows) {
    const player = String(cols[idxName] ?? "").trim();
    const character = String(cols[idxChar] ?? "").trim();

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

    // power plus grand -> remplace tout
    if (power > prevPower) {
      entry.chars[cKey] = { power, level, gear, isoMax };
      if (isoClass || isoColor) entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
      continue;
    }

    // power égal -> maximise progress
    if (power === prevPower && prev && typeof prev === "object") {
      prev.level = Math.max(toInt(prev.level), level);
      prev.gear = Math.max(toInt(prev.gear), gear);
      prev.isoMax = Math.max(toInt(prev.isoMax), isoMax);

      if ((isoClass || isoColor) && !entry.iso[cKey]) {
        entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
      }
    }

    // prev absent (power==0) et power==0 -> stocke quand même
    if (!prev && power === 0) {
      entry.chars[cKey] = { power, level, gear, isoMax };
      if (isoClass || isoColor) entry.iso[cKey] = { isoClass: isoClass || "", isoColor: isoColor || "" };
    }
  }
}

async function loadRosterRows(label, directUrl, gid) {
  const url = resolveSource(label, directUrl, gid);
  if (!url) {
    console.error(`❌ Missing source for ${label}. Provide SHEET_ID + ${label.toUpperCase()}_GID (or ${label.toUpperCase()}_CSV_URL).`);
    process.exit(1);
  }

  const csv = await fetchCsv(url, label);
  const rows = parseCsvToRows(csv, label);

  console.log(`[rosters] Parsed data rows (${label}): ${rows.length}`);
  return rows;
}

async function main() {
  if (!SHEET_ID && !(ROSTERS_ZEUS_CSV_URL && ROSTERS_DIONYSOS_CSV_URL && ROSTERS_POSEIDON_CSV_URL)) {
    console.error("Missing env SHEET_ID (or provide the 3 direct CSV URLs).");
    process.exit(1);
  }

  const [rowsZeus, rowsDio, rowsPos] = await Promise.all([
    loadRosterRows("rosters_zeus", ROSTERS_ZEUS_CSV_URL, ROSTERS_ZEUS_GID),
    loadRosterRows("rosters_dionysos", ROSTERS_DIONYSOS_CSV_URL, ROSTERS_DIONYSOS_GID),
    loadRosterRows("rosters_poseidon", ROSTERS_POSEIDON_CSV_URL, ROSTERS_POSEIDON_GID),
  ]);

  const byPlayer = new Map();
  mergeRowsInto(byPlayer, rowsZeus);
  mergeRowsInto(byPlayer, rowsDio);
  mergeRowsInto(byPlayer, rowsPos);

  const out = Array.from(byPlayer.values());

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${OUT_FILE} (${out.length} players)`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});