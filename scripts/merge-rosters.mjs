// scripts/merge-rosters.mjs
// Fusionne docs/data/rosters_zeus.json + rosters_dionysos.json + rosters_poseidon.json
// vers docs/data/rosters.json

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "docs/data";
const OUT_FILE = process.env.OUT_FILE || path.join(DATA_DIR, "rosters.json");

const SOURCES = [
  path.join(DATA_DIR, "rosters_zeus.json"),
  path.join(DATA_DIR, "rosters_dionysos.json"),
  path.join(DATA_DIR, "rosters_poseidon.json"),
];

function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
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
      console.warn(`[merge-rosters] Missing source file: ${file} -> ignored`);
      return [];
    }
    throw e;
  }
}

function mergePlayerEntry(target, source) {
  if (!target.player && source.player) target.player = source.player;
  if (!target.playerKey && source.playerKey) target.playerKey = source.playerKey;
  if (!target.alliance && source.alliance) target.alliance = source.alliance;

  const sourceChars = source?.chars && typeof source.chars === "object" ? source.chars : {};
  const sourceIso = source?.iso && typeof source.iso === "object" ? source.iso : {};

  for (const [charKeyRaw, srcChar] of Object.entries(sourceChars)) {
    const charKey = normalizeKey(charKeyRaw);
    if (!charKey || !srcChar || typeof srcChar !== "object") continue;

    const srcPower = toInt(srcChar.power);
    const srcLevel = toInt(srcChar.level);
    const srcGear = toInt(srcChar.gear);
    const srcIsoMax = toInt(srcChar.isoMax);

    const prev = target.chars[charKey];
    const prevPower = prev ? toInt(prev.power) : -1;

    if (!prev || srcPower > prevPower) {
      target.chars[charKey] = {
        power: srcPower,
        level: srcLevel,
        gear: srcGear,
        isoMax: srcIsoMax,
      };

      if (sourceIso[charKey] && typeof sourceIso[charKey] === "object") {
        target.iso[charKey] = {
          isoClass: (sourceIso[charKey].isoClass ?? "").toString(),
          isoColor: (sourceIso[charKey].isoColor ?? "").toString(),
        };
      }
      continue;
    }

    if (srcPower === prevPower) {
      prev.level = Math.max(toInt(prev.level), srcLevel);
      prev.gear = Math.max(toInt(prev.gear), srcGear);
      prev.isoMax = Math.max(toInt(prev.isoMax), srcIsoMax);

      if (!target.iso[charKey] && sourceIso[charKey] && typeof sourceIso[charKey] === "object") {
        target.iso[charKey] = {
          isoClass: (sourceIso[charKey].isoClass ?? "").toString(),
          isoColor: (sourceIso[charKey].isoColor ?? "").toString(),
        };
      }
    }
  }
}

async function main() {
  const arrays = await Promise.all(SOURCES.map(readJsonArray));
  const allPlayers = arrays.flat();

  const byPlayer = new Map();

  for (const row of allPlayers) {
    const player = (row?.player ?? "").toString().trim();
    const playerKey = normalizeKey(row?.playerKey || row?.player || "");
    if (!playerKey) continue;

    if (!byPlayer.has(playerKey)) {
      byPlayer.set(playerKey, {
        player,
        playerKey,
        alliance: (row?.alliance ?? "").toString().trim(),
        chars: {},
        iso: {},
      });
    }

    mergePlayerEntry(byPlayer.get(playerKey), row);
  }

  const out = Array.from(byPlayer.values()).sort((a, b) =>
    (a.player || a.playerKey).localeCompare(b.player || b.playerKey, "fr", {
      sensitivity: "base",
    })
  );

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`[merge-rosters] Wrote ${out.length} players -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ merge-rosters fatal:", e);
  process.exit(1);
});
