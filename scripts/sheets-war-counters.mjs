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

// CSV parser simple (supporte guillemets, virgules, lignes)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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

    if (ch === ",") {
      row.push(cur);
      cur = "";
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  // last cell
  row.push(cur);
  // avoid pushing empty trailing row
  if (row.some((c) => (c ?? "").trim() !== "")) rows.push(row);

  return rows;
}

function normalizeHeader(h) {
  return (h ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pick(rowObj, ...keys) {
  for (const k of keys) {
    if (rowObj[k] != null && String(rowObj[k]).trim() !== "") return String(rowObj[k]).trim();
  }
  return "";
}

function toRowObject(headers, row) {
  const obj = {};
  headers.forEach((h, idx) => {
    const key = h;
    const val = row[idx] ?? "";
    obj[key] = val;
  });
  return obj;
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

  // Si c'est du HTML (login), on stoppe net au lieu de produire []
  const head = text.slice(0, 200).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error("❌ The response looks like HTML (not CSV).");
    console.error("➡️ Make sure the Google Sheet is readable publicly or published to the web.");
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  const rows = parseCsv(text);
  console.log(`[war-counters] CSV rows: ${rows.length}`);

  if (rows.length < 2) {
    console.error("❌ No data rows found (only headers or empty).");
    console.error("First 300 chars:", text.slice(0, 300));
    process.exit(1);
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);

  console.log("[war-counters] Headers:", headers.join(" | "));
  console.log("[war-counters] Sample row:", rows[1]?.slice(0, 10).join(" | "));

  const dataRows = rows.slice(1).filter((r) => r.some((c) => (c ?? "").trim() !== ""));

  const out = dataRows.map((r) => {
    const o = toRowObject(headers, r);

    // colonnes attendues (exactes, en snake_case)
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

    const min_ratio_ok = pick(o, "min_ratio_ok");
    const min_ratio_safe = pick(o, "min_ratio_safe");
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

  // optionnel : on filtre uniquement les lignes vides “totales”
  const cleaned = out.filter((r) => r.def_family || r.def_variant || r.atk_team);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(cleaned, null, 2), "utf8");

  console.log(`[war-counters] Wrote ${cleaned.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});