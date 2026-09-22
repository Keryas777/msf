export const WAR_COUNTERS_LIVE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTYKGvuHFRrB59aW6oMHBVFTRBdHhxxZP76YmwlpedoepMftwst1MfCwLg7pMLCPsGOpSrADdLzntQH/pub?gid=1440171156&single=true&output=csv";

function parseCsvWithDelimiter(text, delimiter) {
  const rows = [];
  let row = [];
  let current = "";
  let index = 0;
  let inQuotes = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  while (index < source.length) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          current += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      current += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === delimiter) {
      row.push(current);
      current = "";
      index += 1;
      continue;
    }

    if (character === "\n" || character === "\r") {
      row.push(current);
      current = "";
      if (row.some((cell) => String(cell ?? "").trim() !== "")) rows.push(row);
      row = [];
      if (character === "\r" && source[index + 1] === "\n") index += 2;
      else index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  row.push(current);
  if (row.some((cell) => String(cell ?? "").trim() !== "")) rows.push(row);

  return rows.map((cells) => cells.map((cell) => String(cell ?? "").trim()));
}

function repairHeaderCell(cell) {
  const raw = String(cell ?? "").trim();
  if (!raw) return "";
  return (raw.split(/\s+/)[0] || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function scoreHeaderRow(headers) {
  const set = new Set(headers.filter(Boolean));
  let score = 0;
  if (set.has("def_family")) score += 5;
  if (set.has("def_variant")) score += 5;
  if (set.has("def_key")) score += 3;
  if (set.has("atk_family")) score += 5;
  if (set.has("atk_team")) score += 5;
  if (set.has("atk_key")) score += 3;
  if (set.has("min_ratio_hard")) score += 2;
  if (set.has("min_ratio_ok")) score += 2;
  if (set.has("min_ratio_safe")) score += 2;
  if (set.has("min_ratio_overkill")) score += 1;
  if (set.has("min_ratio_overkill_plus")) score += 1;
  if (set.has("notes")) score += 1;
  if (headers.filter(Boolean).length >= 12) score += 2;
  if (headers.filter(Boolean).length >= 18) score += 2;
  return score;
}

function detectBestDelimiter(text) {
  let best = { score: -1, rows: [], headers: [] };

  for (const delimiter of [",", ";", "\t"]) {
    const rows = parseCsvWithDelimiter(text, delimiter);
    if (!rows.length) continue;
    const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map(repairHeaderCell);
    const score = scoreHeaderRow(headers);
    if (score > best.score) best = { delimiter, score, rows, headers, headerIndex };
  }

  return best;
}

function rowToObject(headers, row) {
  const object = {};
  headers.forEach((header, index) => {
    if (header) object[header] = row[index] ?? "";
  });
  return object;
}

function pick(object, key) {
  const value = object?.[key];
  return value == null ? "" : String(value).trim();
}

function ratio(value) {
  const raw = String(value ?? "").trim();
  return raw ? raw.replace(",", ".") : "";
}

export function parsePublishedWarCountersCsv(text) {
  const head = String(text || "").slice(0, 500).toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("accounts.google.com")) {
    throw new Error("La réponse Google n'est pas un CSV publié.");
  }

  const best = detectBestDelimiter(text);
  if (best.score < 10 || best.headerIndex == null) {
    throw new Error("En-tête WarCounters non reconnu dans le CSV publié.");
  }

  return best.rows
    .slice(best.headerIndex + 1)
    .map((row) => rowToObject(best.headers, row))
    .map((row) => ({
      def_family: pick(row, "def_family"),
      def_variant: pick(row, "def_variant"),
      def_key: pick(row, "def_key"),
      def_char1: pick(row, "def_char1"),
      def_char2: pick(row, "def_char2"),
      def_char3: pick(row, "def_char3"),
      def_char4: pick(row, "def_char4"),
      def_char5: pick(row, "def_char5"),
      atk_family: pick(row, "atk_family"),
      atk_team: pick(row, "atk_team"),
      atk_key: pick(row, "atk_key"),
      atk_char1: pick(row, "atk_char1"),
      atk_char2: pick(row, "atk_char2"),
      atk_char3: pick(row, "atk_char3"),
      atk_char4: pick(row, "atk_char4"),
      atk_char5: pick(row, "atk_char5"),
      min_ratio_hard: ratio(pick(row, "min_ratio_hard")),
      min_ratio_ok: ratio(pick(row, "min_ratio_ok")),
      min_ratio_safe: ratio(pick(row, "min_ratio_safe")),
      min_ratio_overkill: ratio(pick(row, "min_ratio_overkill")),
      min_ratio_overkill_plus: ratio(pick(row, "min_ratio_overkill_plus")),
      notes: pick(row, "notes")
    }))
    .filter((row) => row.def_family || row.def_variant || row.atk_family || row.atk_team || row.atk_key);
}

export async function loadLiveWarCounters({
  fetchImpl = globalThis.fetch,
  fallbackUrl = "data/war-counters.json",
  now = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch indisponible.");

  let liveError = null;

  try {
    const liveUrl = new URL(WAR_COUNTERS_LIVE_CSV_URL);
    liveUrl.searchParams.set("_", String(now()));
    const response = await fetchImpl(liveUrl.toString(), {
      cache: "no-store",
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Google Sheet -> HTTP ${response.status}`);

    const rows = parsePublishedWarCountersCsv(text);
    if (!rows.length) throw new Error("Le Google Sheet publié ne contient aucun contre exploitable.");

    return {
      rows,
      source: "sheet-live",
      liveError: null
    };
  } catch (error) {
    liveError = error?.message || String(error);
  }

  const fallbackResponse = await fetchImpl(fallbackUrl, { cache: "no-store" });
  if (!fallbackResponse.ok) {
    throw new Error(`Google Sheet indisponible et fallback War Counters -> HTTP ${fallbackResponse.status}`);
  }

  const rows = await fallbackResponse.json();
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Google Sheet indisponible et fallback War Counters invalide.");
  }

  return {
    rows,
    source: "json-fallback",
    liveError
  };
}
