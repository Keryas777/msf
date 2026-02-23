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

// ------- CSV parser char-by-char (gère \n et \r, guillemets, etc.) -------
function parseCsvWithDelimiter(text, delim) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  const s = String(text || "").replace(/^\uFEFF/, ""); // remove BOM

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

    // newline (support \n, \r\n, \r)
    if (ch === "\n" || ch === "\r") {
      row.push(cur);
      cur = "";

      // push row if not totally empty
      if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);

      row = [];

      // eat \r\n
      if (ch === "\r" && s[i + 1] === "\n") i += 2;
      else i += 1;

      continue;
    }

    cur += ch;
    i += 1;
  }

  // last cell
  row.push(cur);
  if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);

  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function scoreHeaderRow(row) {
  const set = new Set(row.map(normalizeHeader));
  let score = 0;

  // clés très attendues
  if (set.has("def_family")) score += 5;
  if (set.has("def_variant")) score += 5;
  if (set.has("def_key")) score += 3;
  if (set.has("atk_team")) score += 5;
  if (set.has("atk_key")) score += 3;
  if (set.has("min_ratio_ok")) score += 2;
  if (set.has("min_ratio_safe")) score += 2;
  if (set.has("notes")) score += 1;

  // bonus si ça ressemble à un vrai header (assez de colonnes)
  if (row.length >= 12) score += 2;
  if (row.length >= 18) score += 2;

  return score;
}

function detectBestDelimiter(text) {
  const candidates = [",", ";", "\t"];
  let best = { delim: ",", score: -1, rows: [] };

  for (const d of candidates) {
    const rows = parseCsvWithDelimiter(text, d);
    if (!rows.length) continue;

    // on cherche la première ligne non vide comme "header candidate"
    const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
    if (headerIdx === -1) continue;

    const headerRow = rows[headerIdx];
    const score = scoreHeaderRow(headerRow);

    if (score > best.score) best = { delim: d, score, rows };
  }

  return best;
}

function rowToObject(headers, row) {
  const o = {};
  headers.forEach((h, idx) => {
    o[h] = row[idx] ?? "";
  });
  return o;
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseRatio(x) {
  const s = String(x ?? "").trim();
  if (!s) return "";
  return s.replace(",", ".");
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

  // HTML guard (login page)
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error("❌ The response looks like HTML (not CSV).");
    console.error("➡️ Make sure the Google Sheet is readable publicly or published to the web.");
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const best = detectBestDelimiter(text);
  const rows = best.rows;

  console.log(`[war-counters] Best delimiter: ${JSON.stringify(best.delim)} (score=${best.score})`);
  console.log(`[war-counters] Total parsed rows: ${rows.length}`);

  if (rows.length < 2 || best.score < 6) {
    console.error("❌ Could not confidently detect header row.");
    console.error("First 800 chars:", text.slice(0, 800));
    process.exit(1);
  }

  // header = first non-empty row
  const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const rawHeaders = rows[headerIdx];
  const headers = rawHeaders.map(normalizeHeader);

  console.log("[war-counters] Raw headers:", rawHeaders.join(" | "));
  console.log("[war-counters] Headers:", headers.join(" | "));

  const dataRows = rows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  console.log(`[war-counters] CSV data rows: ${dataRows.length}`);

  const sample = dataRows[0];
  if (sample) {
    const sObj = rowToObject(headers, sample);
    console.log(
      "[war-counters] Sample row:",
      ["def_family", "def_variant", "def_key", "atk_team", "atk_key"]
        .map((k) => `${k}=${sObj[k] ?? ""}`)
        .join(" | ")
    );
  }

  const mapped = dataRows
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

  // filtre utile
  const cleaned = mapped.filter((r) => r.def_family || r.def_variant || r.atk_team || r.atk_key);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(cleaned, null, 2), "utf8");

  console.log(`[war-counters] Wrote ${cleaned.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});