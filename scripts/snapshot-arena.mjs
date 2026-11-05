// Daily arena standings snapshot. No Scopely calls, no long-lived Git history.
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {publishedInfosAlliances} from "./lib/infos-r2-import.mjs";

export const FIRST_INFOS_COMMIT = "f7079efc3b5b498415644b78ecd13148b2196190";
export const BASELINE_DAY = "2026-10-31";
export const FIRST_SOURCE_DAY = "2026-11-01";
const FIRST_SOURCE_PUBLISHED = "2026-11-01T12:09:57Z";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const INFO_FILE = "docs/data/infos.json";
const STATE_FILE = ".github/infos-r2-import-state.json";

export function validDay(day) {
  return DAY_RE.test(day) && !Number.isNaN(Date.parse(day + "T00:00:00Z")) &&
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
}

// The baseline is an immutable November 1 source, whose historical set of
// alliances must never depend on which guests joined the registry later.
export function originalArenaAllianceKeys(firstState){
  const assignments=firstState?.alliances;
  if(!assignments||typeof assignments!=="object"||Array.isArray(assignments))
    throw Error("First Infos provenance does not match 2026-11-01-am");
  const keys=Object.keys(assignments);
  if(!keys.length||keys.some(key=>!/^[a-z0-9-]+$/.test(key)||
       assignments[key]!==FIRST_SOURCE_DAY+"-am"))
    throw Error("First Infos provenance does not match 2026-11-01-am");
  return keys;
}

export function normalizeKey(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function canonicalPlayer(name, aliases = {}) {
  let current = String(name ?? "").trim();
  const byAlias = new Map(Object.entries(aliases).map(([a, b]) => [normalizeKey(a), String(b).trim()]));
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    const key = normalizeKey(current);
    if (!key || seen.has(key)) break;
    seen.add(key);
    const next = byAlias.get(key);
    if (!next) break;
    current = next;
  }
  return current;
}

export function buildSnapshot(rows, config) {
  if (!Array.isArray(rows) || !rows.length || !validDay(config.day)) {
    throw new Error("Invalid arena source rows or day");
  }
  const seen = new Set();
  const players = [];
  for (const row of rows) {
    const name = String(row?.name ?? "").trim();
    const alliance = String(row?.alliance ?? "").trim();
    const rank = row?.latestArena;
    if (!name || !alliance || !Number.isSafeInteger(rank) || rank < 1) {
      // Missing values must never become zero / a fictitious best Arena rank.
      continue;
    }
    const canonical = canonicalPlayer(name, config.aliases);
    const playerKey = normalizeKey(canonical);
    if (!playerKey || seen.has(playerKey)) {
      throw new Error("Ambiguous arena player identity: " + name);
    }
    seen.add(playerKey);
    players.push({ playerKey, name: canonical, alliance, arenaRank: rank });
  }
  if (!players.length || players.length > 500) throw new Error("Invalid arena player count");
  players.sort((a, b) => a.playerKey.localeCompare(b.playerKey, "fr"));
  return {
    version: 1,
    date: config.day,
    sourceDay: config.sourceDay,
    sourceCampaigns: config.sourceCampaigns,
    sourceCommit: config.sourceCommit || null,
    sourcePublishedAt: config.sourcePublishedAt || null,
    recordedAt: config.recordedAt || null,
    attribution: config.attribution,
    players
  };
}

async function loadJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function gitFile(revision, filename) {
  return JSON.parse(execFileSync("git", ["show", revision + ":" + filename], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  }));
}

function parseArgs(argv) {
  const opts = { day: new Date().toISOString().slice(0, 10), outdir: ".tmp/arena-snapshots" };
  for (const arg of argv) {
    if (arg.startsWith("--day=")) opts.day = arg.slice(6);
    else if (arg.startsWith("--outdir=")) opts.outdir = arg.slice(9);
    else throw new Error("Unknown option: " + arg);
  }
  if (!validDay(opts.day)) throw new Error("Invalid --day (expected YYYY-MM-DD)");
  return opts;
}

async function main() {
  const { day, outdir } = parseArgs(process.argv.slice(2));
  const info = await loadJson(INFO_FILE);
  const state = await loadJson(STATE_FILE);
  const registry = await loadJson("docs/data/alliances.json");
  const aliases = (await loadJson("docs/data/player-aliases.json")).aliases || {};
  const allianceKeys=publishedInfosAlliances(registry).map(a=>a.key);
  if (!allianceKeys.length) throw new Error("No active alliance");
  if (!state?.alliances || typeof state.alliances !== "object") {
    throw new Error("Missing Infos import provenance");
  }

  await fs.mkdir(outdir, { recursive: true });
  const written = [];
  const write = async snapshot => {
    const filename = path.join(outdir, snapshot.date + ".json");
    await fs.writeFile(filename, JSON.stringify(snapshot, null, 2) + "\n");
    written.push(filename);
  };

  // Explicit one-day back-attribution requested by LoSP. This is NOT an
  // observation made on 2026-10-31: it is the first 2026-11-01 AM campaign.
  // Do not reconstruct this source from whatever happens to be in main today.
  if (day >= FIRST_SOURCE_DAY && day < "2026-11-29") {
    const firstRows = gitFile(FIRST_INFOS_COMMIT, INFO_FILE);
    const firstState = gitFile(FIRST_INFOS_COMMIT, STATE_FILE);
    const firstKeys=originalArenaAllianceKeys(firstState);
    await write(buildSnapshot(firstRows, {
      day: BASELINE_DAY, sourceDay: FIRST_SOURCE_DAY,
      sourceCampaigns: Object.fromEntries(firstKeys.map(key => [key, FIRST_SOURCE_DAY+"-am"])),
      sourceCommit: FIRST_INFOS_COMMIT, sourcePublishedAt: FIRST_SOURCE_PUBLISHED,
      recordedAt: null, attribution: "backdated-from-first-next-day-collection", aliases
    }));
  }

  // Only label a snapshot with today's date when the imported campaign for
  // EVERY active alliance actually belongs to today. Never repeat stale values.
  const fresh = allianceKeys.every(key => {
    const campaign = state.alliances[key];
    return typeof campaign === "string" && campaign.startsWith(day + "-");
  });
  if (fresh) {
    await write(buildSnapshot(info, {
      day, sourceDay: day,
      sourceCampaigns: Object.fromEntries(allianceKeys.map(key => [key, state.alliances[key]])),
      sourceCommit: process.env.GITHUB_SHA || null,
      sourcePublishedAt: null,
      recordedAt: new Date().toISOString(),
      attribution: "daily-observation-of-latest-imported-info", aliases
    }));
  } else {
    console.warn("[arena] No fully fresh imported Infos for " + day + "; skipping daily point.");
  }
  console.log("[arena] Wrote " + written.length + " temporary snapshot files: " + written.join(", "));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("[arena] " + error.message); process.exitCode = 1; });
}
