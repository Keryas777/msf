// scripts/sheets-war-counters.mjs
import fs from "node:fs/promises";
import path from "node:path";

const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB = process.env.SHEET_TAB || "WarCounters";
const OUT_FILE = process.env.OUT_FILE || "docs/data/war-counters.json";

if (!SHEET_ID) {
  console.error("❌ Missing env SHEET_ID.");
  process.exit(1);
}

function csvUrl(sheetId, tabName) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`;
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: tabName,
  });
  return `${base}?${params.toString()}`;
}

/**
 * IMPORTANT:
 * - En FR, l’export CSV utilise très souvent ";" comme séparateur.
 * - Les ratios contiennent des virgules (0,5) -> ça piège toute "détection par comptage".
 * Donc: on détecte par présence explicite de ';' ou '\t', sinon ','.
 */
function detectDelimiter(headerLine) {
  const line = String(headerLine || "");
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}

function parseCsv(text) {
  const raw = String(text || "").replace(/^\uFEFF/, ""); // BOM
  const lines = raw.split(/\r?\n/);

  // trouver la première ligne non vide (header)
  const firstNonEmptyIdx = lines.findIndex((l) => String(l || "").trim() !== "");
  if (firstNonEmptyIdx === -1) return { headers: [], rows: [], delim: "," };

  const headerLine = lines[firstNonEmptyIdx];
  const delim = detectDelimiter(headerLine);

  const rows = [];
  for (let li = firstNonEmptyIdx; li < lines.length; li++) {
    const line = lines[li];
    if (!line || !String(line).trim()) continue;

    // parse d'une ligne CSV avec quotes
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // "" -> quote échappée
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === delim) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }
    out.push(cur);

    rows.push(out.map((s) => String(s ?? "").trim()));
  }

  if (rows.length === 0) return { headers: [], rows: [], delim };

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);

  const dataRows = rows.slice(1);

  return { headers, rows: dataRows, delim, rawHeaders };
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseRatio(x) {
  // On normalise juste "0,5" -> "0.5" (la page front gère déjà parseFloat avec replace, mais c'est propre)
  const s = String(x ?? "").trim();
  if (!s) return "";
  return s.replace(",", ".");
}

function rowToObject(headers, row) {
  const o = {};
  headers.forEach((h, idx) => {
    o[h] = row[idx] ?? "";
  });
  return o;
}

function isTotallyEmptyRow(obj) {
  return !Object.values(obj || {}).some((v) => String(v ?? "").trim() !== "");
}

async function main() {
  const url = csvUrl(SHEET_ID, SHEET_TAB);
  console.log(`[war-counters] Fetch CSV: ${url}`);

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`);
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  // Si c'est du HTML (login), on stoppe net
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error("❌ The response looks like HTML (not CSV).");
    console.error("➡️ Make sure the Google Sheet is readable publicly or published to the web.");
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const { headers, rows, delim, rawHeaders } = parseCsv(text);

  console.log(`[war-counters] Detected delimiter: ${JSON.stringify(delim)}`);
  console.log(`[war-counters] CSV data rows: ${rows.length}`);
  console.log(`[war-counters] Raw headers: ${rawHeaders?.join(" | ") || "(none)"}`);
  console.log(`[war-counters] Headers: ${headers.join(" | ")}`);

  if (!headers.length || rows.length === 0) {
    console.error("❌ No rows found after parsing.");
    console.error("First 300 chars:", text.slice(0, 300));
    process.exit(1);
  }

  // sample row (first non-empty)
  const sampleRow = rows.find((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (sampleRow) {
    const sObj = rowToObject(headers, sampleRow);
    console.log(
      "[war-counters] Sample row:",
      ["def_family", "def_variant", "def_key", "atk_team", "atk_key"]
        .map((k) => `${k}=${sObj[k] ?? ""}`)
        .join(" | ")
    );
  }

  const mapped = rows
    .map((r) => rowToObject(headers, r))
    .filter((o) => !isTotallyEmptyRow(o))
    .map((o) => {
      const def_family = pick(o, "def_family");
      const def_variant = pick(o, "def_variant");
      const def_key = pick(o, "def_key");

      const def_char1 = pick(o, "def_char1");
      const def_char2 = pick(o, "def_char2");
      const def_char3 = pick(o, "def_char3");
      const def_char4 = pick(o, "def_char4");
      const def_char5 = pick(o, "def_char5");

      const atk_team = pick(o, "atk_team");
      const atk_key = pick(o, "atk_key");

      const atk_char1 = pick(o, "atk_char1");
      const atk_char2 = pick(o, "atk_char2");
      const atk_char3 = pick(o, "atk_char3");
      const atk_char4 = pick(o, "atk_char4");
      const atk_char5 = pick(o, "atk_char5");

      const min_ratio_ok = parseRatio(pick(o, "min_ratio_ok"));
      const min_ratio_safe = parseRatio(pick(o, "min_ratio_safe"));
      const notes = pick(o, "notes");

      return {
        def_family,
        def_variant,
        def_key,
        def_char1,
        def_char2,
        def_char3,
        def_char4,
        def_char5,
        atk_team,
        atk_key,
        atk_char1,
        atk_char2,
        atk_char3,
        atk_char4,
        atk_char5,
        min_ratio_ok,
        min_ratio_safe,
        notes,
      };
    });

  // Filtre minimal: on garde les lignes qui ont au moins une "structure" de counter
  const cleaned = mapped.filter((r) => r.def_family || r.def_variant || r.atk_team || r.atk_key);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(cleaned, null, 2), "utf8");

  console.log(`[war-counters] Wrote ${cleaned.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});