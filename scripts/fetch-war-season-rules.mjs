import fs from "node:fs/promises";
import path from "node:path";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTYKGvuHFRrB59aW6oMHBVFTRBdHhxxZP76YmwlpedoepMftwst1MfCwLg7pMLCPsGOpSrADdLzntQH/pub?gid=1782302584&single=true&output=csv";

const OUTPUT_PATH = "docs/data/war-season-rules.json";

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/^\uFEFF/, "");
}

function cleanString(value) {
  return String(value || "").trim();
}

function toBoolean(value) {
  const normalized = cleanString(value).toLowerCase();
  return ["true", "1", "yes", "oui"].includes(normalized);
}

function toNumber(value, fallback = 0) {
  const normalized = cleanString(value).replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function rowsToObjects(rows) {
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cleanString(cell) !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? "";
      });
      return obj;
    });
}

function extractMembers(row) {
  return Object.keys(row)
    .filter((key) => /^char_\d+$/i.test(key))
    .sort((a, b) => {
      const aNum = Number(a.split("_")[1]);
      const bNum = Number(b.split("_")[1]);
      return aNum - bNum;
    })
    .map((key) => cleanString(row[key]))
    .filter(Boolean);
}

function buildWarSeasonRulesJson(sheetRows) {
  const activeRows = sheetRows.filter((row) => toBoolean(row.active));

  const defaultRow =
    activeRows.find((row) => cleanString(row.rule_key) === "default_attack") ||
    activeRows.find((row) => toNumber(row.required_count, -1) === 0);

  const defaultMultiplier = defaultRow
    ? toNumber(defaultRow.multiplier, 1.17)
    : 1.17;

  const rules = activeRows
    .filter((row) => cleanString(row.rule_key) !== "default_attack")
    .map((row) => {
      const members = extractMembers(row);

      return {
        active: true,
        ruleKey: cleanString(row.rule_key),
        label: cleanString(row.label),
        multiplier: toNumber(row.multiplier, defaultMultiplier),
        requiredCount: Math.max(0, Math.trunc(toNumber(row.required_count, 5))),
        members,
        memberCount: members.length,
        matchMode: "all_selected_members_in_rule_pool",
      };
    });

  const byRuleKey = Object.fromEntries(
    rules.map((rule) => [rule.ruleKey, rule])
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      type: "google_sheets_published_csv",
      url: CSV_URL,
    },
    defaultMultiplier,
    rules,
    byRuleKey,
  };
}

async function fetchCsv(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "losp-war-season-rules-fetcher",
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: HTTP ${response.status}`);
  }

  return response.text();
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function main() {
  console.log(`Fetching published CSV from: ${CSV_URL}`);

  const csvText = await fetchCsv(CSV_URL);
  const parsedRows = parseCsv(csvText);
  const sheetRows = rowsToObjects(parsedRows);
  const json = buildWarSeasonRulesJson(sheetRows);

  await writeJsonFile(OUTPUT_PATH, json);

  console.log(`Generated: ${OUTPUT_PATH}`);
  console.log(`defaultMultiplier: ${json.defaultMultiplier}`);
  console.log(`rules count: ${json.rules.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
