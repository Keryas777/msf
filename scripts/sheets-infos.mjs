// scripts/sheets-infos.mjs
// Génère docs/data/infos.json à partir du CSV "Infos" + l'alliance issue de docs/data/joueurs.json (fallback).
import fs from "node:fs/promises";
import path from "node:path";

// ✅ Sortie attendue
const OUT_FILE = process.env.OUT_FILE || "docs/data/infos.json";

// Option A (recommandé) : URLs "Publié sur le web"
const INFOS_CSV_URL = process.env.INFOS_CSV_URL || "";
const JOUEURS_CSV_URL = process.env.JOUEURS_CSV_URL || "";

// ✅ Nouveau : fallback local si on ne veut/peut pas refetch "Joueurs"
const JOUEURS_JSON_FILE = process.env.JOUEURS_JSON_FILE || "docs/data/joueurs.json";

// Option B (fallback) : gviz/tq via SHEET_ID + onglets
const SHEET_ID = process.env.SHEET_ID || "";
const INFOS_TAB = process.env.INFOS_TAB || "Infos";
const JOUEURS_TAB = process.env.JOUEURS_TAB || "Joueurs";

function gvizCsvUrl(sheetId, tabName) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`;
  const params = new URLSearchParams({ tqx: "out:csv", sheet: tabName });
  return `${base}?${params.toString()}`;
}

// ------- CSV parser char-by-char (gère \n, \r\n, \r + guillemets) -------
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
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_");
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

  // Infos attendus
  if (set.has("name")) score += 6;
  if (set.has("tcp")) score += 6;
  if (set.has("war")) score += 1; // parfois "war_mvp" peut se casser
  if (set.has("war_mvp")) score += 6;

  // Joueurs attendus (si on parse le CSV)
  if (set.has("alliance")) score += 4;

  if (repairedHeaders.filter(Boolean).length >= 6) score += 1;
  if (repairedHeaders.filter(Boolean).length >= 10) score += 1;

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

function normalizeName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function toInt(x) {
  const s = String(x ?? "").trim();
  if (!s) return 0;
  // accepte "1 234 567", "1,234,567", "1234567"
  const cleaned = s.replace(/[^\d-]/g, "");
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchCsv(url, label) {
  console.log(`[infos] Fetch CSV (${label}): ${url}`);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status} (${label})`);
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    console.error(`❌ Response looks like HTML, not CSV (${label}).`);
    console.error("➡️ Utilise un lien 'Publié sur le web' (output=csv) ou rends la feuille lisible publiquement.");
    console.error(text.slice(0, 600));
    process.exit(1);
  }

  return text;
}

function parseTableFromCsv(text, label) {
  const best = detectBestDelimiter(text);
  const rows = best.rows;

  console.log(`[infos] Best delimiter (${label}): ${JSON.stringify(best.delim)} (score=${best.score})`);
  console.log(`[infos] Total parsed rows (${label}): ${rows.length}`);

  if (rows.length < 2 || best.score < 6) {
    console.error(`❌ Could not confidently detect header row (${label}).`);
    console.error("Raw headers:", (best.rawHeaders || []).join(" | "));
    console.error("Repaired headers:", (best.repairedHeaders || []).join(" | "));
    console.error("First 800 chars:", text.slice(0, 800));
    process.exit(1);
  }

  const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const rawHeaders = rows[headerIdx];
  const headers = rawHeaders.map(repairHeaderCell);

  console.log(`[infos] Headers (${label}):`, headers.join(" | "));

  const dataRows = rows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  return dataRows.map((r) => rowToObject(headers, r));
}

async function loadJoueursTable() {
  // 1) CSV Joueurs explicite
  const joueursUrl =
    JOUEURS_CSV_URL ||
    (SHEET_ID ? gvizCsvUrl(SHEET_ID, JOUEURS_TAB) : "");

  if (joueursUrl) {
    const joueursCsv = await fetchCsv(joueursUrl, "Joueurs");
    return parseTableFromCsv(joueursCsv, "Joueurs");
  }

  // 2) Fallback JSON local
  try {
    const raw = await fs.readFile(JOUEURS_JSON_FILE, "utf8");
    const arr = JSON.parse(raw);

    if (!Array.isArray(arr)) {
      console.error(`❌ ${JOUEURS_JSON_FILE} is not an array.`);
      process.exit(1);
    }

    // Normalise un peu : on renvoie des objets "comme un CSV parsé"
    // (donc pick(row, "name", ...) marche)
    console.log(`[infos] Using local joueurs JSON: ${JOUEURS_JSON_FILE} (${arr.length} rows)`);
    return arr.map((r) => ({
      ...r,
      name: pick(r, "name", "player", "pseudo"),
      alliance: pick(r, "alliance", "alliance_name", "alliance_nom", "team", "team_name"),
    }));
  } catch (e) {
    console.error("❌ Missing CSV sources AND could not read local joueurs.json fallback.");
    console.error(`➡️ Fournis JOUEURS_CSV_URL (ou SHEET_ID), ou assure-toi que ${JOUEURS_JSON_FILE} existe et est valide.`);
    console.error(String(e?.message || e));
    process.exit(1);
  }
}

async function main() {
  // Resolve Infos URL (obligatoire)
  const infosUrl =
    INFOS_CSV_URL ||
    (SHEET_ID ? gvizCsvUrl(SHEET_ID, INFOS_TAB) : "");

  if (!infosUrl) {
    console.error("❌ Missing INFOS CSV source.");
    console.error("➡️ Fournis INFOS_CSV_URL (recommandé) ou SHEET_ID + INFOS_TAB.");
    process.exit(1);
  }

  // Fetch Infos
  const infosCsv = await fetchCsv(infosUrl, "Infos");
  const infos = parseTableFromCsv(infosCsv, "Infos");

  // Load Joueurs (CSV ou JSON local)
  const joueurs = await loadJoueursTable();

  // Build alliance map from Joueurs
  const allianceByName = new Map();
  for (const row of joueurs) {
    const name = pick(row, "name", "player", "pseudo");
    const alliance = pick(row, "alliance", "alliance_name", "alliance_nom", "team", "team_name");
    if (!name) continue;
    allianceByName.set(normalizeName(name), alliance || "");
  }

  // Build output from Infos tab
  const out = infos
    .map((row) => {
      const name = pick(row, "name");
      if (!name) return null;

      const tcp = toInt(pick(row, "tcp"));
      const warMvp = toInt(pick(row, "war_mvp", "war", "mvp", "war_m_v_p"));

      // Optionnel (mais utile pour tcp.html) : icon + frame si présents dans le CSV Infos
      const icon = pick(row, "icon", "portrait", "avatar", "icon_url");
      const frame = pick(row, "frame", "border", "frame_url");

      return {
        name,
        alliance: allianceByName.get(normalizeName(name)) || "",
        tcp,
        war_mvp: warMvp,
        ...(icon ? { icon } : {}),
        ...(frame ? { frame } : {}),
      };
    })
    .filter(Boolean);

  // Write file
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`[infos] Wrote ${out.length} rows -> ${OUT_FILE}`);

  // Debug: missing alliance
  const missingAlliance = out.filter((r) => !r.alliance).slice(0, 12);
  if (missingAlliance.length) {
    console.log(
      `[infos] ⚠️ Missing alliance for ${missingAlliance.length} sample players:`,
      missingAlliance.map((r) => r.name).join(", ")
    );
  }
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});