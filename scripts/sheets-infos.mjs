// scripts/sheets-infos.mjs
// Génère docs/data/infos.json à partir des CSV :
// infos_zeus, infos_dionysos, infos_poseidon

import fs from "node:fs/promises";
import path from "node:path";

const OUT_FILE = process.env.OUT_FILE || "docs/data/infos.json";

// CSV publiés
const INFOS_ZEUS_CSV_URL = process.env.INFOS_ZEUS_CSV_URL || "";
const INFOS_DIONYSOS_CSV_URL = process.env.INFOS_DIONYSOS_CSV_URL || "";
const INFOS_POSEIDON_CSV_URL = process.env.INFOS_POSEIDON_CSV_URL || "";

const JOUEURS_CSV_URL = process.env.JOUEURS_CSV_URL || "";
const JOUEURS_JSON_FILE = process.env.JOUEURS_JSON_FILE || "docs/data/joueurs.json";

// fallback gviz
const SHEET_ID = process.env.SHEET_ID || "";
const TAB_ZEUS = "infos_zeus";
const TAB_DIONYSOS = "infos_dionysos";
const TAB_POSEIDON = "infos_poseidon";
const JOUEURS_TAB = "Joueurs";

function gvizCsvUrl(sheetId, tabName) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`;
  const params = new URLSearchParams({ tqx: "out:csv", sheet: tabName });
  return `${base}?${params.toString()}`;
}

// -------- CSV parser --------

function parseCsvWithDelimiter(text, delim) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  const s = String(text || "").replace(/^\uFEFF/, "");

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

function detectDelimiter(text) {
  const candidates = [",", ";", "\t"];
  let best = { delim: ",", rows: [] };

  for (const d of candidates) {
    const rows = parseCsvWithDelimiter(text, d);
    if (rows.length > best.rows.length) {
      best = { delim: d, rows };
    }
  }

  return best;
}

function normalizeHeaderBasic(h) {
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function rowToObject(headers, row) {
  const o = {};
  headers.forEach((h, idx) => {
    if (!h) return;
    o[h] = row[idx] ?? "";
  });
  return o;
}

function parseTableFromCsv(text) {
  const best = detectDelimiter(text);
  const rows = best.rows;

  const header = rows[0].map(normalizeHeaderBasic);

  return rows
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => rowToObject(header, r));
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizeName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d-]/g, "");
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchCsv(url, label) {
  console.log(`[infos] Fetch CSV (${label})`);

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`);
    process.exit(1);
  }

  return text;
}

// -------- Joueurs table --------

async function loadJoueursTable() {

  if (JOUEURS_CSV_URL) {
    const csv = await fetchCsv(JOUEURS_CSV_URL, "Joueurs");
    return parseTableFromCsv(csv);
  }

  try {
    const raw = await fs.readFile(JOUEURS_JSON_FILE, "utf8");
    const arr = JSON.parse(raw);

    return arr.map((r) => ({
      ...r,
      name: pick(r, "name", "player"),
      alliance: pick(r, "alliance")
    }));
  } catch {
    console.error("❌ Impossible de charger joueurs.json");
    process.exit(1);
  }
}

// -------- MAIN --------

async function loadInfosForAlliance(label, url, tab) {

  const finalUrl =
    url ||
    (SHEET_ID ? gvizCsvUrl(SHEET_ID, tab) : "");

  if (!finalUrl) {
    console.error(`❌ Missing source for ${label}`);
    process.exit(1);
  }

  const csv = await fetchCsv(finalUrl, label);
  return parseTableFromCsv(csv);
}

async function main() {

  const infosZeus = await loadInfosForAlliance("infos_zeus", INFOS_ZEUS_CSV_URL, TAB_ZEUS);
  const infosDionysos = await loadInfosForAlliance("infos_dionysos", INFOS_DIONYSOS_CSV_URL, TAB_DIONYSOS);
  const infosPoseidon = await loadInfosForAlliance("infos_poseidon", INFOS_POSEIDON_CSV_URL, TAB_POSEIDON);

  const infos = [
    ...infosZeus,
    ...infosDionysos,
    ...infosPoseidon
  ];

  const joueurs = await loadJoueursTable();

  const allianceByName = new Map();

  for (const row of joueurs) {
    const name = pick(row, "name", "player");
    const alliance = pick(row, "alliance");

    if (!name) continue;

    allianceByName.set(normalizeName(name), alliance || "");
  }

  const out = infos
    .map((row) => {

      const name = pick(row, "name");

      if (!name) return null;

      const tcp = toInt(pick(row, "tcp"));
      const warMvp = toInt(pick(row, "war_mvp", "war"));

      const icon = pick(row, "icon");
      const frame = pick(row, "frame");

      return {
        name,
        alliance: allianceByName.get(normalizeName(name)) || "",
        tcp,
        war_mvp: warMvp,
        ...(icon ? { icon } : {}),
        ...(frame ? { frame } : {})
      };

    })
    .filter(Boolean);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });

  await fs.writeFile(
    OUT_FILE,
    JSON.stringify(out, null, 2),
    "utf8"
  );

  console.log(`[infos] Wrote ${out.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});