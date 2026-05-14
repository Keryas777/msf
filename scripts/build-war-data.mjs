// scripts/build-war-data.mjs
// Génère docs/data/war-stats.json et docs/data/war-history-lite.json
// depuis docs/data/war/index.json + docs/data/war/YYYY-MM-DD/alliance.json.

import fs from "node:fs/promises";
import path from "node:path";

const WAR_DIR = process.env.WAR_DIR || "docs/data/war";
const INDEX_FILE = process.env.INDEX_FILE || path.join(WAR_DIR, "index.json");
const OUT_STATS_FILE = process.env.OUT_STATS_FILE || "docs/data/war-stats.json";
const OUT_HISTORY_FILE = process.env.OUT_HISTORY_FILE || "docs/data/war-history-lite.json";

const ALLIANCES = ["zeus", "dionysos", "poseidon", "kronos"];
const ALLIANCE_LABELS = {
  zeus: "Zeus",
  dionysos: "Dionysos",
  poseidon: "Poséidon",
  kronos: "Kronos",
};

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
  const key = normKey(value);
  if (key === "zeus") return "zeus";
  if (key === "dionysos") return "dionysos";
  if (key === "poseidon" || key === "posseidon") return "poseidon";
  if (key === "kronos" || key === "cronos" || key === "chronos") return "kronos";
  return key;
}

const allianceLabel = (value) => ALLIANCE_LABELS[allianceKey(value)] || String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const round = (value, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};
const pct = (part, total) => (num(total) > 0 ? round((num(part) / num(total)) * 100, 2) : 0);
const sum = (rows, fn) => rows.reduce((acc, row) => acc + num(fn(row)), 0);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
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

function normalizeIndex(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.wars)
      ? data.wars
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
          ? data.data
          : [];

  return list
    .map((entry) => {
      if (typeof entry === "string") return { date: entry.trim(), alliances: ALLIANCES };

      const date = String(entry?.date || entry?.day || entry?.folder || "").trim();
      let alliances = [];

      if (Array.isArray(entry?.alliances)) alliances = entry.alliances;
      else if (Array.isArray(entry?.files)) {
        alliances = entry.files.map((file) => String(file || "").replace(/\.json$/i, "").split("/").pop());
      } else if (typeof entry?.alliance === "string") alliances = [entry.alliance];

      alliances = alliances.map(allianceKey).filter(Boolean);
      alliances = [...new Set(alliances)];

      return { date, alliances };
    })
    .filter((entry) => entry.date && entry.alliances.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function rankingMap(report) {
  const out = new Map();
  const ranking = Array.isArray(report?.ranking) ? report.ranking : [];
  for (const row of ranking) {
    const key = normKey(row?.name);
    if (!key) continue;
    out.set(key, { rank: num(row?.rank), score: num(row?.score) });
  }
  return out;
}

function normalizePlayers(war) {
  const enriched = Array.isArray(war?.report?.players) ? war.report.players : [];
  const raw = Array.isArray(war?.players) ? war.players : [];
  const source = enriched.length ? enriched : raw;
  const ranks = rankingMap(war?.report);

  return source.map((p) => {
    const name = String(p?.name || "").trim();
    const nameKey = normKey(name);
    if (!name || !nameKey) return null;

    const attacks = num(p?.attacks);
    const attackPoints = num(p?.attack_points);
    const successful = p?.successful_attacks != null ? num(p.successful_attacks) : Math.max(0, Math.floor(attackPoints / 1000));
    const misses = p?.misses != null ? num(p.misses) : Math.max(0, attacks - successful);
    const rankInfo = ranks.get(nameKey);

    return {
      name,
      name_key: nameKey,
      rank: p?.rank != null ? num(p.rank) : num(rankInfo?.rank),
      attacks,
      attack_points: attackPoints,
      successful_attacks: successful,
      misses,
      damage: num(p?.damage),
      avg_damage: num(p?.avg_damage),
      damage_share_pct: round(num(p?.damage_share_pct), 2),
      defense_wins: num(p?.defense_wins),
      deviations: num(p?.deviations ?? p?.defense_bonus),
      score_total: p?.score_total != null ? round(num(p.score_total), 2) : round(num(rankInfo?.score), 2),
      score_activity: round(num(p?.score_activity), 2),
      score_efficiency: round(num(p?.score_efficiency), 2),
      score_impact: round(num(p?.score_impact), 2),
      score_defense: round(num(p?.score_defense), 2),
      min_attacks_ok: Boolean(p?.min_attacks_ok),
      min_deviations_ok: Boolean(p?.min_deviations_ok),
    };
  }).filter(Boolean);
}

function warAverages(players) {
  const playerCount = players.length;
  const active = players.filter((p) => p.attacks > 0);
  const totalAttacks = sum(active, (p) => p.attacks);
  const totalSuccess = sum(active, (p) => p.successful_attacks);

  return {
    player_count: playerCount,
    alliance_avg_score: playerCount ? round(sum(players, (p) => p.score_total) / playerCount, 2) : 0,
    alliance_avg_success_rate: totalAttacks ? round((totalSuccess / totalAttacks) * 100, 2) : 0,
    alliance_avg_impact: playerCount ? round(sum(players, (p) => p.score_impact) / playerCount, 2) : 0,
    alliance_avg_damage_share_pct: playerCount ? round(100 / playerCount, 2) : 0,
  };
}

function makeHistoryWar({ date, alliance, war, players }) {
  const avg = warAverages(players);

  return {
    war_id: `${date}-${alliance}`,
    date,
    alliance,
    alliance_label: allianceLabel(alliance),
    captured_at: String(war?.captured_at || ""),
    source: String(war?.source || ""),
    summary: {
      total_damage: num(war?.report?.summary?.total_damage),
      minimum_attacks: num(war?.report?.summary?.minimum_attacks),
      minimum_deviations: num(war?.report?.summary?.minimum_deviations),
    },
    ...avg,
    players: players.map((p) => {
      const successRate = pct(p.successful_attacks, p.attacks);
      const missRate = pct(p.misses, p.attacks);
      const rankPercentile = p.rank > 0 && avg.player_count > 1 ? round(((p.rank - 1) / (avg.player_count - 1)) * 100, 2) : 0;

      return {
        name: p.name,
        name_key: p.name_key,
        rank: p.rank,
        player_count: avg.player_count,
        score_total: p.score_total,
        score_vs_alliance_avg: round(p.score_total - avg.alliance_avg_score, 2),
        attacks: p.attacks,
        attack_points: p.attack_points,
        successful_attacks: p.successful_attacks,
        misses: p.misses,
        success_rate: successRate,
        miss_rate: missRate,
        success_rate_vs_alliance_avg: round(successRate - avg.alliance_avg_success_rate, 2),
        score_impact: p.score_impact,
        impact_vs_alliance_avg: round(p.score_impact - avg.alliance_avg_impact, 2),
        damage_share_pct: p.damage_share_pct,
        damage_share_vs_alliance_avg: round(p.damage_share_pct - avg.alliance_avg_damage_share_pct, 2),
        score_activity: p.score_activity,
        score_efficiency: p.score_efficiency,
        score_defense: p.score_defense,
        defense_wins: p.defense_wins,
        deviations: p.deviations,
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
    total_successful_attacks: 0,
    total_misses: 0,
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
    deviations: 0,
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
  a.best_score = a.wars_played === 1 ? p.score_total : Math.max(a.best_score, p.score_total);
  a.worst_score = a.wars_played === 1 ? p.score_total : Math.min(a.worst_score, p.score_total);

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
  const w = a.wars_played || 0;
  a.avg_score = w ? round(a.total_score / w, 2) : 0;
  a.success_rate = pct(a.total_successful_attacks, a.total_attacks);
  a.miss_rate = pct(a.total_misses, a.total_attacks);
  a.avg_damage_per_war = w ? round(a.total_damage / w, 0) : 0;
  a.avg_damage_share_pct = w ? round(a.avg_damage_share_pct / w, 2) : 0;
  a.avg_impact = w ? round(a.total_impact / w, 2) : 0;
  a.avg_efficiency = w ? round(a.total_efficiency / w, 2) : 0;
  a.avg_activity = w ? round(a.total_activity / w, 2) : 0;
  a.avg_defense = w ? round(a.total_defense_score / w, 2) : 0;
  a.best_score = round(a.best_score, 2);
  a.worst_score = round(a.worst_score, 2);
  a.min_attacks_ok_rate = pct(a.min_attacks_ok_count, w);
  a.min_deviations_ok_rate = pct(a.min_deviations_ok_count, w);
  return a;
}

async function main() {
  const index = normalizeIndex(await readJson(INDEX_FILE));
  const history = [];
  const agg = new Map();

  for (const item of index) {
    for (const allianceRaw of item.alliances) {
      const alliance = allianceKey(allianceRaw);
      if (!alliance) continue;

      const file = path.join(WAR_DIR, item.date, `${alliance}.json`);
      const war = await readJsonOrNull(file);
      if (!war) continue;

      const date = String(war?.date || item.date);
      const finalAlliance = allianceKey(war?.alliance || alliance);
      const players = normalizePlayers(war);
      const historyWar = makeHistoryWar({ date, alliance: finalAlliance, war, players });
      history.push(historyWar);

      for (const p of players) {
        const key = `${finalAlliance}::${p.name_key}`;
        if (!agg.has(key)) agg.set(key, emptyAgg(p, date, finalAlliance));
        addAgg(agg.get(key), p, date);
      }
    }
  }

  history.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d) return d;
    return ALLIANCES.indexOf(a.alliance) - ALLIANCES.indexOf(b.alliance);
  });

  const stats = Array.from(agg.values()).map(finalizeAgg).sort((a, b) => {
    const ia = ALLIANCES.indexOf(a.alliance);
    const ib = ALLIANCES.indexOf(b.alliance);
    if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  await fs.mkdir(path.dirname(OUT_STATS_FILE), { recursive: true });
  await fs.mkdir(path.dirname(OUT_HISTORY_FILE), { recursive: true });
  await fs.writeFile(OUT_STATS_FILE, JSON.stringify(stats, null, 2), "utf8");
  await fs.writeFile(OUT_HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");

  console.log(`[war-data] Index entries: ${index.length}`);
  console.log(`[war-data] Wrote ${stats.length} player stat rows -> ${OUT_STATS_FILE}`);
  console.log(`[war-data] Wrote ${history.length} war history rows -> ${OUT_HISTORY_FILE}`);
  for (const alliance of ALLIANCES) {
    console.log(`[war-data] ${alliance}: ${stats.filter((r) => r.alliance === alliance).length} players, ${history.filter((r) => r.alliance === alliance).length} wars`);
  }
}

main().catch((error) => {
  console.error("❌ build-war-data fatal:", error);
  process.exit(1);
});
