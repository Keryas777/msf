// scripts/sheets-war-counters.mjs
// Convertit l'onglet "WarCounters" (Google Sheets) en docs/data/war-counters.json
// Sans auth : utilise l'export CSV via gviz (le fichier doit être accessible en lecture via lien).

import fs from "node:fs/promises";
import path from "node:path";

const SHEET_ID = process.env.SHEET_ID;          // ex: "1AbC...xyz"
const SHEET_TAB = process.env.SHEET_TAB || "WarCounters";
const OUT_FILE = process.env.OUT_FILE || "docs/data/war-counters.json";

if (!SHEET_ID) {
  console.error("❌ Missing env SHEET_ID. Exemple: SHEET_ID=1AbC... node scripts/sheets-war-counters.mjs");
  process.exit(1);
}

function buildCsvUrl(sheetId, tabName) {
  // gviz CSV export
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`;
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: tabName,
  });
  return `${base}?${params.toString()}`;
}

// CSV parser simple (gère guillemets, virgules, CRLF)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      cur = "";
      // trim CR
      if (row.length && typeof row[row.length - 1] === "string") {
        row[row.length - 1] = row[row.length - 1].replace(/\r$/, "");
      }
      rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  // last cell
  row.push(cur.replace(/\r$/, ""));
  rows.push(row);

  // remove trailing empty last row if any
  while (rows.length && rows[rows.length - 1].every((c) => !String(c ?? "").trim())) {
    rows.pop();
  }
  return rows;
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((h) => {
    const key = h;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n === 1) return key;
    return `${key}_${n}`;
  });
}

function toNumberLoose(x) {
  if (x == null) return 0;
  const s = String(x).trim();
  if (!s) return 0;
  const digits = s.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function cleanCell(x) {
  return String(x ?? "").trim();
}

function rowToWarCounter(obj) {
  // On sort un format "propre" aligné avec ton war-counters.js
  const def_chars = [
    obj.def_char1,
    obj.def_char2,
    obj.def_char3,
    obj.def_char4,
    obj.def_char5,
  ].map(cleanCell).filter(Boolean);

  const atk_chars = [
    obj.atk_char1,
    obj.atk_char2,
    obj.atk_char3,
    obj.atk_char4,
    obj.atk_char5,
  ].map(cleanCell).filter(Boolean);

  return {
    def_family: cleanCell(obj.def_family),
    def_variant: cleanCell(obj.def_variant),
    def_key: cleanCell(obj.def_key),
    def_char1: cleanCell(obj.def_char1),
    def_char2: cleanCell(obj.def_char2),
    def_char3: cleanCell(obj.def_char3),
    def_char4: cleanCell(obj.def_char4),
    def_char5: cleanCell(obj.def_char5),

    atk_team: cleanCell(obj.atk_team),
    atk_key: cleanCell(obj.atk_key),
    atk_char1: cleanCell(obj.atk_char1),
    atk_char2: cleanCell(obj.atk_char2),
    atk_char3: cleanCell(obj.atk_char3),
    atk_char4: cleanCell(obj.atk_char4),
    atk_char5: cleanCell(obj.atk_char5),

    min_ratio_ok: toNumberLoose(obj.min_ratio_ok),
    min_ratio_safe: toNumberLoose(obj.min_ratio_safe),
    notes: cleanCell(obj.notes),
  };
}

async function main() {
  const url = buildCsvUrl(SHEET_ID, SHEET_TAB);
  console.log(`[war-counters] fetch CSV: ${url}`);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error("CSV seems empty (need header + at least 1 data row).");
  }

  // headers
  let headers = rows[0].map(normalizeHeader);
  headers = dedupeHeaders(headers);

  // data rows
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = r[c] ?? "";
    }

    const wc = rowToWarCounter(obj);

    // garde uniquement les lignes utiles
    const hasMin =
      wc.def_family && wc.def_variant && wc.atk_team &&
      (wc.atk_char1 || wc.atk_char2 || wc.atk_char3 || wc.atk_char4 || wc.atk_char5);

    if (hasMin) out.push(wc);
  }

  // write
  const outPath = path.resolve(OUT_FILE);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), "utf-8");

  console.log(`[war-counters] wrote ${out.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ war-counters build failed:", e);
  process.exit(1);
});
