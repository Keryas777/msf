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
 * Robust CSV parsing:
 * - Detects delimiter ("," vs ";") based on the header line
 * - Handles quotes + escaped quotes ("")
 * - Trims lines and removes BOM
 * Returns: { headers: string[], rows: Array<Record<string,string>> }
 */
function detectDelimiter(line) {
  const commas = (line.match(/,/g) || []).length;
  const semis = (line.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function parseCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Escaped quote inside quoted field
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
  return out.map((s) => String(s ?? "").trim());
}

function parseCsvText(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "") // BOM
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const delim = detectDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delim);

  const headers = rawHeaders.map(normalizeHeader);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    rows.push(obj);
  }

  return { headers, rows, delim, rawHeaders };
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pick(rowObj, ...keys) {
  for (const k of keys) {
    const v = rowObj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseRatio(x) {
  // Keep as string in JSON if you want, but normalize commas to dots
  const s = String(x ?? "").trim();
  if (!s) return "";
  return s.replace(",", ".");
}

function isRowTotallyEmpty(o) {
  return !Object.values(o || {}).some((v) => String(v ?? "").trim() !== "");
}

async function main() {
  const url = csvUrl(SHEET_ID, SHEET_TAB);
  console.log(`[war-counters] Fetch CSV: ${url}`);

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`);
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  // If it's HTML (login page), stop early
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error("❌ The response looks like HTML (not CSV).");
    console.error("➡️ Make sure the Google Sheet is readable publicly or published to the web.");
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const { headers, rows, delim, rawHeaders } = parseCsvText(text);

  console.log(`[war-counters] Detected delimiter: ${JSON.stringify(delim)}`);
  console.log(`[war-counters] CSV rows: ${rows.length}`);
  console.log(`[war-counters] Raw headers: ${rawHeaders?.join(" | ") || "(none)"}`);
  console.log(`[war-counters] Headers: ${headers.join(" | ")}`);

  if (rows.length < 1) {
    console.error("❌ No data rows found (only headers or empty).");
    console.error("First 300 chars:", text.slice(0, 300));
    process.exit(1);
  }

  // Show a sample row (first non-empty row)
  const sample = rows.find((r) => !isRowTotallyEmpty(r));
  if (sample) {
    const sampleKeys = Object.keys(sample).slice(0, 10);
    console.log(
      "[war-counters] Sample row:",
      sampleKeys.map((k) => `${k}=${sample[k]}`).join(" | ")
    );
  }

  const mapped = rows
    .filter((r) => !isRowTotallyEmpty(r))
    .map((o) => {
      const def_family = pick(o, "def_family");
      const def_variant = pick(o, "def_variant");
      const def_key = pick(o, "def_key");

      const atk_team = pick(o, "atk_team");
      const atk_key = pick(o, "atk_key");

      const def_char1 = pick(o, "def_char1");
      const def_char2 = pick(o, "def_char2");
      const def_char3 = pick(o, "def_char3");
      const def_char4 = pick(o, "def_char4");
      const def_char5 = pick(o, "def_char5");

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

  // Filter out fully useless lines (still keep lines with notes if they have a def/atk context)
  const cleaned = mapped.filter((r) => r.def_family || r.def_variant || r.atk_team || r.atk_key);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(cleaned, null, 2), "utf8");

  console.log(`[war-counters] Wrote ${cleaned.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});