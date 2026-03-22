// scripts/sheets-team-recommendations.mjs
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1RxAokcQw7rhNigPj8VwipbRRf9PVNA6lJzIVqdMBAXQ/export?format=csv&gid=1800603285";

const CSV_URL = process.env.CSV_URL || DEFAULT_CSV_URL;
const OUT_FILE = process.env.OUT_FILE || "docs/data/team-recommendations.json";

// ------- CSV parser char-by-char (gère \n, \r\n, \r + guillemets) -------
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

function normalizeHeaderBasic(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function repairHeaderCell(cell) {
  const raw = String(cell ?? "").trim();
  if (!raw) return "";
  const firstToken = raw.split(/\s+/)[0] || "";
  return normalizeHeaderBasic(firstToken);
}

function scoreHeaderRow(repairedHeaders) {
  const set = new Set(repairedHeaders.filter(Boolean));
  let score = 0;

  if (set.has("mode")) score += 5;
  if (set.has("sub_mode")) score += 5;
  if (set.has("group_label")) score += 5;
  if (set.has("group_order")) score += 4;
  if (set.has("subgroup_label")) score += 4;
  if (set.has("subgroup_order")) score += 4;
  if (set.has("layout_type")) score += 4;
  if (set.has("team_name")) score += 4;
  if (set.has("display_order")) score += 4;
  if (set.has("title")) score += 2;
  if (set.has("notes")) score += 2;
  if (set.has("char_1")) score += 2;
  if (set.has("core_1")) score += 2;
  if (set.has("flex_1")) score += 2;

  if (repairedHeaders.filter(Boolean).length >= 10) score += 2;
  if (repairedHeaders.filter(Boolean).length >= 20) score += 2;

  return score;
}

function detectBestDelimiter(text) {
  const candidates = [",", ";", "\t"];
  let best = { delim: ",", score: -1, rows: [], rawHeaders: [], repairedHeaders: [] };

  for (const d of candidates) {
    const rows = parseCsvWithDelimiter(text, d);
    if (!rows.length) continue;

    const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
    if (headerIdx === -1) continue;

    const rawHeaders = rows[headerIdx];
    const repairedHeaders = rawHeaders.map(repairHeaderCell);
    const score = scoreHeaderRow(repairedHeaders);

    if (score > best.score) best = { delim: d, score, rows, rawHeaders, repairedHeaders };
  }

  return best;
}

function rowToObject(headers, row) {
  const o = {};
  headers.forEach((h, idx) => {
    if (!h) return;
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

function toBoolean(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "oui"].includes(v);
}

function toNumber(value, fallback = 0) {
  const s = String(value ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function isTotallyEmptyRow(obj) {
  return !Object.values(obj || {}).some((v) => String(v ?? "").trim() !== "");
}

function buildFixedChars(o) {
  return [1, 2, 3, 4, 5]
    .map((i) => pick(o, `char_${i}`))
    .filter(Boolean);
}

function buildCoreChars(o) {
  return [1, 2, 3, 4, 5]
    .map((i) => pick(o, `core_${i}`))
    .filter(Boolean);
}

function buildFlexItems(o) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const name = pick(o, `flex_${i}`);
    const note = pick(o, `flex_${i}_note`);
    if (!name) continue;
    out.push({ name, note });
  }
  return out;
}

async function main() {
  console.log(`[team-recommendations] Fetch CSV: ${CSV_URL}`);

  const res = await fetch(CSV_URL, {
    cache: "no-store",
    headers: {
      "User-Agent": "losp-team-recommendations-fetcher",
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`);
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error("❌ The response looks like HTML (not CSV).");
    console.error("➡️ Check that your Google Sheets link outputs CSV.");
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const best = detectBestDelimiter(text);
  const rows = best.rows;

  console.log(`[team-recommendations] Best delimiter: ${JSON.stringify(best.delim)} (score=${best.score})`);
  console.log(`[team-recommendations] Total parsed rows: ${rows.length}`);

  if (rows.length < 2 || best.score < 10) {
    console.error("❌ Could not confidently detect header row.");
    console.error("Raw headers:", (best.rawHeaders || []).join(" | "));
    console.error("Repaired headers:", (best.repairedHeaders || []).join(" | "));
    console.error("First 800 chars:", text.slice(0, 800));
    process.exit(1);
  }

  const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const rawHeaders = rows[headerIdx];
  const headers = rawHeaders.map(repairHeaderCell);

  console.log("[team-recommendations] Raw headers:", rawHeaders.join(" | "));
  console.log("[team-recommendations] Repaired headers:", headers.join(" | "));

  const dataRows = rows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  console.log(`[team-recommendations] CSV data rows: ${dataRows.length}`);

  const mapped = dataRows
    .map((r) => rowToObject(headers, r))
    .filter((o) => !isTotallyEmptyRow(o))
    .map((o) => {
      const layoutType = pick(o, "layout_type") || "fixed";

      return {
        active: pick(o, "active") ? toBoolean(pick(o, "active")) : true,
        mode: pick(o, "mode"),
        sub_mode: pick(o, "sub_mode"),

        group_label: pick(o, "group_label"),
        group_order: toNumber(pick(o, "group_order"), 9999),

        subgroup_label: pick(o, "subgroup_label"),
        subgroup_order: toNumber(pick(o, "subgroup_order"), 9999),

        tier: pick(o, "tier"),
        display_order: toNumber(pick(o, "display_order"), 9999),
        layout_type: layoutType,
        title: pick(o, "title"),
        team_name: pick(o, "team_name"),

        char_1: pick(o, "char_1"),
        char_2: pick(o, "char_2"),
        char_3: pick(o, "char_3"),
        char_4: pick(o, "char_4"),
        char_5: pick(o, "char_5"),

        core_1: pick(o, "core_1"),
        core_2: pick(o, "core_2"),
        core_3: pick(o, "core_3"),
        core_4: pick(o, "core_4"),
        core_5: pick(o, "core_5"),

        flex_slots: toNumber(pick(o, "flex_slots"), 0),

        flex_1: pick(o, "flex_1"),
        flex_1_note: pick(o, "flex_1_note"),
        flex_2: pick(o, "flex_2"),
        flex_2_note: pick(o, "flex_2_note"),
        flex_3: pick(o, "flex_3"),
        flex_3_note: pick(o, "flex_3_note"),
        flex_4: pick(o, "flex_4"),
        flex_4_note: pick(o, "flex_4_note"),
        flex_5: pick(o, "flex_5"),
        flex_5_note: pick(o, "flex_5_note"),
        flex_6: pick(o, "flex_6"),
        flex_6_note: pick(o, "flex_6_note"),

        notes: pick(o, "notes"),
        patch: pick(o, "patch"),

        fixed_characters: buildFixedChars(o),
        core_characters: buildCoreChars(o),
        flex_items: buildFlexItems(o),
      };
    });

  const cleaned = mapped.filter(
    (r) =>
      r.mode ||
      r.sub_mode ||
      r.group_label ||
      r.subgroup_label ||
      r.team_name ||
      r.fixed_characters.length ||
      r.core_characters.length ||
      r.flex_items.length
  );

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      type: "google_sheets_csv",
      url: CSV_URL,
    },
    items: cleaned,
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`[team-recommendations] Wrote ${cleaned.length} items -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});