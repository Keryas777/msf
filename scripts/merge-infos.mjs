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
const JOUEURS_OUT_FILE =
  process.env.JOUEURS_OUT_FILE ||
  path.join(DATA_DIR, "joueurs.json");
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

function validateJoueurs(joueurs) {
  const seenPairs = new Map();
  const alliancesByPlayer = new Map();
  const warnings = [];

  joueurs.forEach((row, index) => {
    if (typeof row.player !== "string") {
      throw new Error(`joueurs[${index}] invalid field "player": expected string`);
    }

    if (!row.player.trim()) {
      throw new Error(`joueurs[${index}] invalid field "player": expected non-empty string`);
    }

    if (typeof row.alliance !== "string") {
      throw new Error(`joueurs[${index}] invalid field "alliance": expected string`);
    }

    if (!row.alliance.trim()) {
      throw new Error(`joueurs[${index}] invalid field "alliance": expected non-empty string`);
    }

    const pairKey = `${row.player}\u0000${row.alliance}`;
    const previousIndex = seenPairs.get(pairKey);

    if (previousIndex !== undefined) {
      throw new Error(
        `Duplicate joueurs entry for player "${row.player}" in alliance "${row.alliance}" at indexes ${previousIndex} and ${index}`
      );
    }

    seenPairs.set(pairKey, index);

    const playerAlliances = alliancesByPlayer.get(row.player) || new Set();
    playerAlliances.add(row.alliance);
    alliancesByPlayer.set(row.player, playerAlliances);
  });

  for (const [player, alliances] of alliancesByPlayer) {
    if (alliances.size > 1) {
      warnings.push(
        `Player "${player}" appears in multiple alliances: ${Array.from(alliances).join(", ")}`
      );
    }
  }

  return warnings;
}

function buildJoueurs(rows) {
  return rows.map((row) => ({
    player: row.name,
    alliance: row.alliance,
  }));
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

  const joueurs = buildJoueurs(rows);
  const playerWarnings = validateJoueurs(joueurs);

  console.log(`[merge-infos] Total joueurs rows: ${joueurs.length}`);
  console.log(`[merge-infos] Duplicate player+alliance pairs: 0`);

  if (playerWarnings.length) {
    console.warn(`[merge-infos] Player warnings:`);
    playerWarnings.forEach((warning) => console.warn(`- ${warning}`));
  } else {
    console.log(`[merge-infos] Player warnings: none`);
  }

  if (DRY_RUN) {
    console.log(`[merge-infos] DRY_RUN=1: would write infos -> ${OUT_FILE}`);
    console.log(`[merge-infos] DRY_RUN=1: would write joueurs -> ${JOUEURS_OUT_FILE}`);
    console.log(`[merge-infos] DRY_RUN=1: no file was written`);
    return;
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.mkdir(path.dirname(JOUEURS_OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
  await fs.writeFile(JOUEURS_OUT_FILE, JSON.stringify(joueurs, null, 2) + "\n", "utf8");

  console.log(`[merge-infos] Wrote ${rows.length} rows -> ${OUT_FILE}`);
  console.log(`[merge-infos] Wrote ${joueurs.length} joueurs -> ${JOUEURS_OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ merge-infos fatal:", e);
  process.exit(1);
});
