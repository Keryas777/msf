// scripts/build-war-data.mjs
// Génère docs/data/war-stats.json et docs/data/war-history-lite.json
// depuis docs/data/war/index.json + docs/data/war/YYYY-MM-DD/alliance.json.
// Gère aussi docs/data/player-aliases.json pour fusionner les pseudos mal orthographiés.

import fs from "node:fs/promises";
import path from "node:path";
import {
  getAllianceLabel,
  loadAllianceRegistry,
  normalizeAllianceKey,
  sortAllianceKeys,
} from "./lib/alliances-node.mjs";

const WAR_DIR = process.env.WAR_DIR || "docs/data/war";
const INDEX_FILE = process.env.INDEX_FILE || path.join(WAR_DIR, "index.json");
const OUT_STATS_FILE = process.env.OUT_STATS_FILE || "docs/data/war-stats.json";
const OUT_HISTORY_FILE = process.env.OUT_HISTORY_FILE || "docs/data/war-history-lite.json";
const PLAYER_ALIASES_FILE =
  process.env.PLAYER_ALIASES_FILE || "docs/data/player-aliases.json";
const DRY_RUN = process.env.DRY_RUN === "1";

const normKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]/g, "");

function allianceKey(value) {
  return normalizeAllianceKey(value);
}

function allianceLabel(value) {
  return getAllianceLabel(value) || String(value ?? "").trim();
}

function compareAllianceKeys(left, right) {
  const sorted = sortAllianceKeys([left, right]);
  return sorted.indexOf(left) - sorted.indexOf(right);
}

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;

  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function pct(part, total) {
  return num(total) > 0 ? round((num(part) / num(total)) * 100, 2) : 0;
}

function sum(rows, fn) {
  return rows.reduce((acc, row) => acc + num(fn(row)), 0);
}

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    const preview = raw.slice(0, 800);

    throw new Error(
      [
        `Invalid JSON in ${file}`,
        String(error?.message || error),
        "Preview:",
        preview,
      ].join("\n")
    );
  }
}

async function readJsonOrNull(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.warn(`[war-data] Missing file ignored: ${file}`);
      return null;
    }

    throw error;
  }
}

async function loadPlayerAliases() {
  const data = await readJsonOrNull(PLAYER_ALIASES_FILE);

  if (!data) {
    return new Map();
  }

  const source =
    data?.aliases && typeof data.aliases === "object" && !Array.isArray(data.aliases)
      ? data.aliases
      : data;

  const aliases = new Map();

  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [alias, canonical] of Object.entries(source)) {
      const aliasKey = normKey(alias);
      const canonicalName = String(canonical ?? "").trim();

      if (!aliasKey || !canonicalName) continue;

      aliases.set(aliasKey, canonicalName);
    }
  }

  if (Array.isArray(source)) {
    for (const row of source) {
      const alias = String(row?.alias ?? row?.from ?? row?.name ?? "").trim();
      const canonical = String(row?.canonical ?? row?.to ?? row?.target ?? "").trim();

      const aliasKey = normKey(alias);
      if (!aliasKey || !canonical) continue;

      aliases.set(aliasKey, canonical);
    }
  }

  return aliases;
}

function canonicalPlayerName(name, aliases) {
  let current = String(name ?? "").trim();

  if (!current) return "";

  for (let i = 0; i < 10; i++) {
    const next = aliases.get(normKey(current));

    if (!next || String(next).trim() === current) {
      break;
    }

    current = String(next).trim();
  }

  return current;
}

function normalizeIndex(data, registry) {
  let list = [];

  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    const candidateKeys = [
      "wars",
      "items",
      "data",
      "entries",
      "dates",
      "index",
      "list",
      "folders",
      "history",
    ];

    for (const key of candidateKeys) {
      if (Array.isArray(data[key])) {
        list = data[key];
        break;
      }
    }

    if (!list.length) {
      list = Object.entries(data)
        .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(String(key)))
        .map(([date, value]) => ({
          date,
          alliances: Array.isArray(value) ? value : [],
        }));
    }
  }

  return list
    .map((entry) => {
      if (typeof entry === "string") {
        const raw = entry.trim();
        if (!raw) return null;

        const parts = raw.replace(/^\.\//, "").split("/").filter(Boolean);
        const date = parts.find((part) => /^\d{4}-\d{2}-\d{2}$/.test(part)) || raw;
        const filePart = parts.find((part) => /\.json$/i.test(part));

        const alliances = filePart
          ? [filePart.replace(/\.json$/i, "")]
              .map(allianceKey)
              .filter((alliance) => alliance && registry.allianceByKey.has(alliance))
          : [];

        return { date, alliances: sortAllianceKeys([...new Set(alliances)]) };
      }

      const date = String(
        entry?.date ||
          entry?.day ||
          entry?.folder ||
          entry?.dir ||
          entry?.directory ||
          entry?.name ||
          ""
      ).trim();

      let alliances = [];

      if (Array.isArray(entry?.alliances)) {
        alliances = entry.alliances;
      } else if (Array.isArray(entry?.alliance)) {
        alliances = entry.alliance;
      } else if (typeof entry?.alliance === "string") {
        alliances = [entry.alliance];
      } else if (Array.isArray(entry?.files)) {
        alliances = entry.files.map((file) =>
          String(file || "").replace(/\.json$/i, "").split("/").pop()
        );
      } else if (Array.isArray(entry?.paths)) {
        alliances = entry.paths.map((file) =>
          String(file || "").replace(/\.json$/i, "").split("/").pop()
        );
      }

      alliances = alliances
        .map(allianceKey)
        .filter((alliance) => alliance && registry.allianceByKey.has(alliance));

      alliances = sortAllianceKeys([...new Set(alliances)]);

      return { date, alliances };
    })
    .filter((entry) => entry?.date && entry.alliances.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function rankingMap(report, aliases = new Map()) {
  const out = new Map();
  const ranking = Array.isArray(report?.ranking) ? report.ranking : [];

  for (const row of ranking) {
    const originalName = String(row?.name || "").trim();
    const canonicalName = canonicalPlayerName(originalName, aliases);
    const key = normKey(canonicalName);

    if (!key) continue;

    out.set(key, {
      rank: num(row?.rank),
      score: num(row?.score),
    });
  }

  return out;
}

function normalizePlayers(war, aliases = new Map()) {
  const enriched = Array.isArray(war?.report?.players) ? war.report.players : [];
  const raw = Array.isArray(war?.players) ? war.players : [];
  const source = enriched.length ? enriched : raw;
  const ranks = rankingMap(war?.report, aliases);

  return source
    .map((p) => {
      const originalName = String(p?.name || "").trim();
      const name = canonicalPlayerName(originalName, aliases);
      const nameKey = normKey(name);

      if (!name || !nameKey) return null;

      const attacks = num(p?.attacks);
      const attackPoints = num(p?.attack_points);

      const successfulRaw =
        p?.successful_attacks != null
          ? num(p.successful_attacks)
          : Math.max(0, Math.floor(attackPoints / 1000));

      const successful = attacks > 0 ? Math.min(attacks, successfulRaw) : 0;

      const misses =
        p?.misses != null
          ? num(p.misses)
          : Math.max(0, attacks - successful);

      const rankInfo = ranks.get(nameKey);

      const damageSharePct =
        p?.damage_share_pct !== null &&
        p?.damage_share_pct !== undefined &&
        p?.damage_share_pct !== ""
          ? round(num(p.damage_share_pct), 2)
          : null;

      return {
        name,
        name_key: nameKey,
        ...(originalName && originalName !== name ? { original_name: originalName } : {}),
        rank: p?.rank != null ? num(p.rank) : num(rankInfo?.rank),

        attacks,
        attack_points: attackPoints,
        successful_attacks: successful,
        misses,

        damage: num(p?.damage),
        avg_damage: num(p?.avg_damage),
        damage_share_pct: damageSharePct,

        defense_wins: num(p?.defense_wins),
        deviations: num(p?.deviations ?? p?.defense_bonus),

        score_total:
          p?.score_total != null
            ? round(num(p.score_total), 2)
            : round(num(rankInfo?.score), 2),
        score_activity: round(num(p?.score_activity), 2),
        score_efficiency: round(num(p?.score_efficiency), 2),
        score_impact: round(num(p?.score_impact), 2),
        score_defense: round(num(p?.score_defense), 2),

        min_attacks_ok: Boolean(p?.min_attacks_ok),
        min_deviations_ok: Boolean(p?.min_deviations_ok),
      };
    })
    .filter(Boolean);
}

function completePlayerDerivedMetrics(players) {
  const totalDamage = sum(players, (p) => p.damage);

  return players.map((p) => ({
    ...p,
    damage_share_pct:
      p.damage_share_pct !== null && p.damage_share_pct !== undefined
        ? round(p.damage_share_pct, 2)
        : pct(p.damage, totalDamage),
  }));
}

function warAverages(players) {
  const playerCount = players.length;
  const active = players.filter((p) => p.attacks > 0);

  const totalAttacks = sum(active, (p) => p.attacks);
  const totalSuccess = sum(active, (p) => p.successful_attacks);
  const totalDamage = sum(players, (p) => p.damage);

  return {
    player_count: playerCount,

    alliance_total_damage: totalDamage,

    alliance_avg_score: playerCount
      ? round(sum(players, (p) => p.score_total) / playerCount, 2)
      : 0,

    alliance_avg_attacks: playerCount
      ? round(sum(players, (p) => p.attacks) / playerCount, 2)
      : 0,

    alliance_avg_misses: playerCount
      ? round(sum(players, (p) => p.misses) / playerCount, 2)
      : 0,

    alliance_avg_success_rate: totalAttacks
      ? round((totalSuccess / totalAttacks) * 100, 2)
      : 0,

    alliance_avg_impact: playerCount
      ? round(sum(players, (p) => p.score_impact) / playerCount, 2)
      : 0,

    alliance_avg_damage: playerCount
      ? round(totalDamage / playerCount, 0)
      : 0,

    alliance_avg_damage_share_pct: playerCount
      ? round(100 / playerCount, 2)
      : 0,

    alliance_avg_defense_wins: playerCount
      ? round(sum(players, (p) => p.defense_wins) / playerCount, 2)
      : 0,

    alliance_avg_deviations: playerCount
      ? round(sum(players, (p) => p.deviations) / playerCount, 2)
      : 0,
  };
}

function makeHistoryWar({ date, alliance, war, players }) {
  const avg = warAverages(players);
  const summary = war?.report?.summary || {};

  return {
    war_id: `${date}-${alliance}`,
    date,
    alliance,
    alliance_label: allianceLabel(alliance),
    captured_at: String(war?.captured_at || ""),
    source: String(war?.source || ""),

    summary: {
      total_damage:
        summary?.total_damage !== null &&
        summary?.total_damage !== undefined &&
        summary?.total_damage !== ""
          ? num(summary.total_damage)
          : avg.alliance_total_damage,
      minimum_attacks: num(summary?.minimum_attacks),
      minimum_deviations: num(summary?.minimum_deviations),
    },

    ...avg,

    players: players.map((p) => {
      const successRate = pct(p.successful_attacks, p.attacks);
      const missRate = pct(p.misses, p.attacks);

      const scoreGap = round(p.score_total - avg.alliance_avg_score, 2);

      const rankPercentile =
        p.rank > 0 && avg.player_count > 1
          ? round(((p.rank - 1) / (avg.player_count - 1)) * 100, 2)
          : 0;

      return {
        name: p.name,
        name_key: p.name_key,
        ...(p.original_name ? { original_name: p.original_name } : {}),

        rank: p.rank,
        player_count: avg.player_count,

        score_total: p.score_total,
        score_gap: scoreGap,
        score_vs_alliance_avg: scoreGap,

        attacks: p.attacks,
        attack_points: p.attack_points,
        attacks_vs_alliance_avg: round(p.attacks - avg.alliance_avg_attacks, 2),

        successful_attacks: p.successful_attacks,
        misses: p.misses,
        misses_vs_alliance_avg: round(p.misses - avg.alliance_avg_misses, 2),

        success_rate: successRate,
        miss_rate: missRate,
        success_rate_vs_alliance_avg: round(
          successRate - avg.alliance_avg_success_rate,
          2
        ),

        score_impact: p.score_impact,
        impact_vs_alliance_avg: round(p.score_impact - avg.alliance_avg_impact, 2),

        damage: p.damage,
        damage_vs_alliance_avg: round(p.damage - avg.alliance_avg_damage, 2),

        damage_share_pct: p.damage_share_pct,
        damage_share_vs_alliance_avg: round(
          p.damage_share_pct - avg.alliance_avg_damage_share_pct,
          2
        ),

        score_activity: p.score_activity,
        score_efficiency: p.score_efficiency,
        score_defense: p.score_defense,

        defense_wins: p.defense_wins,
        defense_wins_vs_alliance_avg: round(
          p.defense_wins - avg.alliance_avg_defense_wins,
          2
        ),

        deviations: p.deviations,
        deviations_vs_alliance_avg: round(
          p.deviations - avg.alliance_avg_deviations,
          2
        ),

        rank_percentile: rankPercentile,
      };
    }),
  };
}

function emptyAgg(p, date, alliance) {
  return {
    name: p.name,
    name_key: p.name_key,
    alliance,
    alliance_label: allianceLabel(alliance),
    wars_played: 0,
    first_date: date,
    last_date: date,

    total_score: 0,
    avg_score: 0,
    best_score: 0,
    worst_score: 0,

    total_attacks: 0,
    avg_attacks_per_war: 0,

    total_successful_attacks: 0,
    total_misses: 0,
    avg_misses_per_war: 0,

    success_rate: 0,
    miss_rate: 0,

    total_damage: 0,
    avg_damage_per_war: 0,
    avg_damage_share_pct: 0,

    total_impact: 0,
    avg_impact: 0,

    total_efficiency: 0,
    avg_efficiency: 0,

    total_activity: 0,
    avg_activity: 0,

    total_defense_score: 0,
    avg_defense: 0,

    defense_wins: 0,
    avg_defense_wins_per_war: 0,

    deviations: 0,
    avg_deviations_per_war: 0,

    top_3_count: 0,
    top_5_count: 0,

    min_attacks_ok_count: 0,
    min_deviations_ok_count: 0,
    min_attacks_ok_rate: 0,
    min_deviations_ok_rate: 0,
  };
}

function addAgg(a, p, date) {
  a.wars_played += 1;

  a.first_date = a.first_date && a.first_date < date ? a.first_date : date;
  a.last_date = a.last_date && a.last_date > date ? a.last_date : date;

  a.total_score += p.score_total;
  a.best_score =
    a.wars_played === 1 ? p.score_total : Math.max(a.best_score, p.score_total);
  a.worst_score =
    a.wars_played === 1 ? p.score_total : Math.min(a.worst_score, p.score_total);

  a.total_attacks += p.attacks;
  a.total_successful_attacks += p.successful_attacks;
  a.total_misses += p.misses;

  a.total_damage += p.damage;
  a.avg_damage_share_pct += p.damage_share_pct;

  a.total_impact += p.score_impact;
  a.total_efficiency += p.score_efficiency;
  a.total_activity += p.score_activity;
  a.total_defense_score += p.score_defense;

  a.defense_wins += p.defense_wins;
  a.deviations += p.deviations;

  if (p.rank > 0 && p.rank <= 3) a.top_3_count += 1;
  if (p.rank > 0 && p.rank <= 5) a.top_5_count += 1;
  if (p.min_attacks_ok) a.min_attacks_ok_count += 1;
  if (p.min_deviations_ok) a.min_deviations_ok_count += 1;
}

function finalizeAgg(a) {
  const wars = a.wars_played || 0;

  a.avg_score = wars ? round(a.total_score / wars, 2) : 0;

  a.avg_attacks_per_war = wars ? round(a.total_attacks / wars, 2) : 0;
  a.avg_misses_per_war = wars ? round(a.total_misses / wars, 2) : 0;

  a.success_rate = pct(a.total_successful_attacks, a.total_attacks);
  a.miss_rate = pct(a.total_misses, a.total_attacks);

  a.avg_damage_per_war = wars ? round(a.total_damage / wars, 0) : 0;
  a.avg_damage_share_pct = wars ? round(a.avg_damage_share_pct / wars, 2) : 0;

  a.avg_impact = wars ? round(a.total_impact / wars, 2) : 0;
  a.avg_efficiency = wars ? round(a.total_efficiency / wars, 2) : 0;
  a.avg_activity = wars ? round(a.total_activity / wars, 2) : 0;
  a.avg_defense = wars ? round(a.total_defense_score / wars, 2) : 0;

  a.avg_defense_wins_per_war = wars ? round(a.defense_wins / wars, 2) : 0;
  a.avg_deviations_per_war = wars ? round(a.deviations / wars, 2) : 0;

  a.best_score = round(a.best_score, 2);
  a.worst_score = round(a.worst_score, 2);

  a.min_attacks_ok_rate = pct(a.min_attacks_ok_count, wars);
  a.min_deviations_ok_rate = pct(a.min_deviations_ok_count, wars);

  return a;
}

async function main() {
  const registry = loadAllianceRegistry();
  const rawIndex = await readJson(INDEX_FILE);
  const playerAliases = await loadPlayerAliases();

  const rawIndexShape = Array.isArray(rawIndex)
    ? `array length ${rawIndex.length}`
    : rawIndex && typeof rawIndex === "object"
      ? `object keys ${Object.keys(rawIndex).join(", ")}`
      : typeof rawIndex;

  console.log(`[war-data] Reading index: ${INDEX_FILE}`);
  console.log(`[war-data] Raw index shape: ${rawIndexShape}`);
  console.log(`[war-data] Player aliases: ${playerAliases.size}`);

  const index = normalizeIndex(rawIndex, registry);

  const history = [];
  const agg = new Map();
  let warsRead = 0;

  for (const item of index) {
    for (const allianceRaw of item.alliances) {
      const alliance = allianceKey(allianceRaw);
      if (!alliance || !registry.allianceByKey.has(alliance)) continue;

      const file = path.join(WAR_DIR, item.date, `${alliance}.json`);
      const war = await readJsonOrNull(file);

      if (!war) continue;

      warsRead += 1;

      const date = String(war?.date || item.date);
      const finalAlliance = allianceKey(war?.alliance || alliance);

      if (!finalAlliance || !registry.allianceByKey.has(finalAlliance)) continue;

      let players = normalizePlayers(war, playerAliases);
      players = completePlayerDerivedMetrics(players);

      const historyWar = makeHistoryWar({
        date,
        alliance: finalAlliance,
        war,
        players,
      });

      history.push(historyWar);

      for (const p of players) {
        const key = `${finalAlliance}::${p.name_key}`;

        if (!agg.has(key)) {
          agg.set(key, emptyAgg(p, date, finalAlliance));
        }

        addAgg(agg.get(key), p, date);
      }
    }
  }

  history.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare) return dateCompare;

    return compareAllianceKeys(a.alliance, b.alliance);
  });

  const stats = Array.from(agg.values())
    .map(finalizeAgg)
    .sort((a, b) => {
      const allianceCompare = compareAllianceKeys(a.alliance, b.alliance);

      if (allianceCompare) {
        return allianceCompare;
      }

      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    });

  const outputAlliances = sortAllianceKeys(
    [...new Set([...stats.map((row) => row.alliance), ...history.map((row) => row.alliance)])]
  );

  console.log(`[war-data] Index entries: ${index.length}`);

  if (DRY_RUN) {
    console.log("[war-data] DRY_RUN=1: no files written");
    console.log(`[war-data] Wars read: ${warsRead}`);
    console.log(`[war-data] Player stat rows produced: ${stats.length}`);
    console.log(`[war-data] War history rows produced: ${history.length}`);
    console.log(`[war-data] Output alliances: ${outputAlliances.join(", ") || "(none)"}`);
    console.log(`[war-data] Would write player stats -> ${OUT_STATS_FILE}`);
    console.log(`[war-data] Would write war history -> ${OUT_HISTORY_FILE}`);
  } else {
    await fs.mkdir(path.dirname(OUT_STATS_FILE), { recursive: true });
    await fs.mkdir(path.dirname(OUT_HISTORY_FILE), { recursive: true });

    await fs.writeFile(OUT_STATS_FILE, JSON.stringify(stats, null, 2) + "\n", "utf8");
    await fs.writeFile(OUT_HISTORY_FILE, JSON.stringify(history, null, 2) + "\n", "utf8");

    console.log(`[war-data] Wrote ${stats.length} player stat rows -> ${OUT_STATS_FILE}`);
    console.log(`[war-data] Wrote ${history.length} war history rows -> ${OUT_HISTORY_FILE}`);
  }

  for (const alliance of outputAlliances) {
    const playerCount = stats.filter((row) => row.alliance === alliance).length;
    const warCount = history.filter((row) => row.alliance === alliance).length;

    console.log(`[war-data] ${alliance}: ${playerCount} players, ${warCount} wars`);
  }
}

main().catch((error) => {
  console.error("❌ build-war-data fatal:", error);
  process.exit(1);
});