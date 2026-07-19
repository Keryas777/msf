// scripts/merge-infos.mjs
// Fusionne les infos par alliance :
// - docs/data/infos_<alliance>.json
//
// vers docs/data/infos.json

import fs from "node:fs/promises";
import path from "node:path";
import { loadAllianceRegistry } from "./lib/alliances-node.mjs";

const DATA_DIR = process.env.DATA_DIR || "docs/data";
const OUT_FILE = process.env.OUT_FILE || path.join(DATA_DIR, "infos.json");
const DRY_RUN = process.env.DRY_RUN === "1";
const OUTPUT_KEYS = ["name", "alliance", "tcp", "war_mvp", "icon", "frame"];

function validateString(row, file, index, field) {
  if (typeof row?.[field] !== "string") {
    throw new Error(`${file}[${index}] invalid field "${field}": expected string`);
  }
}

function validateFiniteNumber(row, file, index, field) {
  if (typeof row?.[field] !== "number" || !Number.isFinite(row[field])) {
    throw new Error(`${file}[${index}] invalid field "${field}": expected finite number`);
  }
}

function normalizeInfoRow(row, file, index) {
  validateString(row, file, index, "name");
  validateString(row, file, index, "alliance");
  validateFiniteNumber(row, file, index, "tcp");
  validateFiniteNumber(row, file, index, "war_mvp");
  validateString(row, file, index, "icon");
  validateString(row, file, index, "frame");

  return Object.fromEntries(OUTPUT_KEYS.map((key) => [key, row[key]]));
}

async function readJsonArray(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error(`${file} is not an array`);
    }

    return parsed;
  } catch (e) {
    if (e?.code === "ENOENT") {
      console.warn(`[merge-infos] Missing source file: ${file} -> ignored`);
      return null;
    }

    throw e;
  }
}

async function main() {
  const registry = loadAllianceRegistry();
  const sources = registry.knownKeys.map((key) => ({
    key,
    file: path.join(DATA_DIR, `infos_${key}.json`),
  }));

  const rows = [];
  const counts = new Map();
  console.log(`[merge-infos] Alliance order: ${registry.knownKeys.join(", ")}`);
  console.log(`[merge-infos] Sources:`);

  for (const source of sources) {
    const sourceRows = await readJsonArray(source.file);

    if (sourceRows === null) {
      counts.set(source.key, 0);
      continue;
    }

    console.log(`- ${source.file}`);
    counts.set(source.key, sourceRows.length);

    sourceRows.forEach((row, index) => {
      rows.push(normalizeInfoRow(row, source.file, index));
    });
  }

  console.log(`[merge-infos] Rows by alliance:`);
  for (const key of registry.knownKeys) {
    console.log(`- ${key}: ${counts.get(key) ?? 0}`);
  }
  console.log(`[merge-infos] Total rows: ${rows.length}`);

  if (DRY_RUN) {
    console.log(`[merge-infos] DRY_RUN=1: would write ${OUT_FILE}`);
    console.log(`[merge-infos] DRY_RUN=1: no file was written`);
    return;
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");

  console.log(`[merge-infos] Wrote ${rows.length} rows -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ merge-infos fatal:", e);
  process.exit(1);
});
