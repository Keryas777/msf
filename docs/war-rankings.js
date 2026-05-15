/* docs/war-rankings.js */
(() => {
  const FILES = {
    history: "./data/war-history-lite.json",
    infos: "./data/infos.json",
    aliases: "./data/player-aliases.json",
  };

  const $players = document.getElementById("players");
  const $count = document.getElementById("playersCount");
  const $rankingTitle = document.getElementById("rankingTitle");
  const $rankingHint = document.getElementById("rankingHint");
  const $minWarsSelect = document.getElementById("minWarsSelect");
  const tabs = Array.from(document.querySelectorAll(".rankingTab"));

  const filters = {
    zeus: document.getElementById("filterZeus"),
    dionysos: document.getElementById("filterDionysos"),
    poseidon: document.getElementById("filterPoseidon"),
    kronos: document.getElementById("filterKronos"),
  };

  if (
    !$players ||
    !$count ||
    !$rankingTitle ||
    !$rankingHint ||
    !$minWarsSelect ||
    !tabs.length ||
    !filters.zeus ||
    !filters.dionysos ||
    !filters.poseidon ||
    !filters.kronos
  ) {
    console.error("[war-rankings] Missing DOM elements. Check war-rankings.html ids.");
    return;
  }

  const EMOJI = {
    zeus: "⚡",
    dionysos: "🍇",
    poseidon: "🔱",
    kronos: "⏳",
  };

  const LABEL = {
    zeus: "Zeus",
    dionysos: "Dionysos",
    poseidon: "Poséidon",
    kronos: "Kronos",
  };

  const CHART_BANDS = {
    score: [
      { from: 85, to: 101, className: "statGapExcellent" },
      { from: 70, to: 85, className: "statGapGood" },
      { from: 55, to: 70, className: "statGapNeutral" },
      { from: 45, to: 55, className: "statGapWarning" },
      { from: 0, to: 45, className: "statGapBad" },
    ],

    scoreGap: [
      { from: 15.000001, to: 999, className: "statGapExcellent" },
      { from: 5, to: 15.000001, className: "statGapGood" },
      { from: -10, to: 5, className: "statGapNeutral" },
      { from: -20, to: -10, className: "statGapWarning" },
      { from: -999, to: -20, className: "statGapBad" },
    ],

    attacks: [
      { from: 13, to: 15, className: "statGapExcellent" },
      { from: 12, to: 13, className: "statGapGood" },
      { from: 10, to: 12, className: "statGapNeutral" },
      { from: 9, to: 10, className: "statGapWarning" },
      { from: 0, to: 9, className: "statGapBad" },
    ],

    misses: [
      { from: 0, to: 1.000001, className: "statGapExcellent" },
      { from: 1.000001, to: 2, className: "statGapGood" },
      { from: 2, to: 3, className: "statGapNeutral" },
      { from: 3, to: 4, className: "statGapWarning" },
      { from: 4, to: 999, className: "statGapBad" },
    ],

    success: [
      { from: 90, to: 101, className: "statGapExcellent" },
      { from: 80, to: 90, className: "statGapGood" },
      { from: 70, to: 80, className: "statGapNeutral" },
      { from: 60, to: 70, className: "statGapWarning" },
      { from: 0, to: 60, className: "statGapBad" },
    ],

    impact: [
      { from: 30, to: 36, className: "statGapExcellent" },
      { from: 25, to: 30, className: "statGapGood" },
      { from: 20, to: 25, className: "statGapNeutral" },
      { from: 15, to: 20, className: "statGapWarning" },
      { from: 0, to: 15, className: "statGapBad" },
    ],

    damageShare: [
      { from: 6, to: 999, className: "statGapExcellent" },
      { from: 4.5, to: 6, className: "statGapGood" },
      { from: 3, to: 4.5, className: "statGapNeutral" },
      { from: 2, to: 3, className: "statGapWarning" },
      { from: 0, to: 2, className: "statGapBad" },
    ],

    defenseWins: [
      { from: 4, to: 999, className: "statGapExcellent" },
      { from: 2.5, to: 4, className: "statGapGood" },
      { from: 1.5, to: 2.5, className: "statGapNeutral" },
      { from: 0.5, to: 1.5, className: "statGapWarning" },
      { from: 0, to: 0.5, className: "statGapBad" },
    ],

    deviations: [
      { from: 4, to: 999, className: "statGapExcellent" },
      { from: 2, to: 4, className: "statGapGood" },
      { from: 1.5, to: 2, className: "statGapNeutral" },
      { from: 0.5, to: 1.5, className: "statGapWarning" },
      { from: 0, to: 0.5, className: "statGapBad" },
    ],
  };

  const RANKINGS = {
    avg_score: {
      title: "📈 Meilleure note moyenne",
      hint: "Moyenne du score total par guerre.",
      field: "avg_score",
      order: "desc",
      className: (p) => classFromBands(p.avg_score, CHART_BANDS.score),
      main: (p) => `${fmt(p.avg_score, 1)} / 100`,
      sub: (p) =>
        `${p.wars_played} guerre${p.wars_played > 1 ? "s" : ""} • meilleur ${fmt(
          p.best_score,
          0
        )}`,
    },

    avg_score_gap: {
      title: "⚖️ Meilleur écart avec la moyenne alliance",
      hint: "Écart moyen entre la note du joueur et la note moyenne de son alliance sur chaque guerre.",
      field: "avg_score_gap",
      order: "desc",
      className: (p) => classFromBands(p.avg_score_gap, CHART_BANDS.scoreGap),
      main: (p) => signedFmt(p.avg_score_gap, 1),
      sub: (p) => `moy. alliance ${fmt(p.avg_alliance_score, 1)} / 100`,
    },

    avg_attacks: {
      title: "⚔️ Meilleure moyenne d’attaques",
      hint: "Nombre moyen d’attaques jouées par guerre.",
      field: "avg_attacks",
      order: "desc",
      className: (p) => classFromBands(p.avg_attacks, CHART_BANDS.attacks),
      main: (p) => fmt(p.avg_attacks, 1),
      sub: (p) => `${p.total_attacks} attaques totales`,
    },

    avg_misses: {
      title: "❌ Moins de ratés par guerre",
      hint: "Nombre moyen de ratés par guerre. Le plus bas est le meilleur.",
      field: "avg_misses",
      order: "asc",
      className: (p) => classFromBands(p.avg_misses, CHART_BANDS.misses),
      main: (p) => fmt(p.avg_misses, 1),
      sub: (p) =>
        `${p.total_misses} raté${p.total_misses > 1 ? "s" : ""} • ${fmt(
          p.success_rate,
          1
        )} % réussite`,
    },

    success_rate: {
      title: "🎯 Meilleure réussite moyenne",
      hint: "Moyenne du pourcentage de réussite par guerre.",
      field: "success_rate",
      order: "desc",
      className: (p) => classFromBands(p.success_rate, CHART_BANDS.success),
      main: (p) => `${fmt(p.success_rate, 1)} %`,
      sub: (p) => `${p.total_successful_attacks}/${p.total_attacks} attaques réussies`,
    },

    avg_impact: {
      title: "🔥 Meilleur impact moyen",
      hint: "Moyenne du score d’impact offensif par guerre.",
      field: "avg_impact",
      order: "desc",
      className: (p) => classFromBands(p.avg_impact, CHART_BANDS.impact),
      main: (p) => `${fmt(p.avg_impact, 1)} / 35`,
      sub: (p) => `${compact(p.avg_damage)} dégâts moyens / guerre`,
    },

    avg_damage: {
      title: "💥 Meilleurs dégâts moyens",
      hint: "Dégâts moyens par guerre. La couleur compare le joueur à la moyenne de son alliance.",
      field: "avg_damage",
      order: "desc",
      className: (p) => ratioClass(p.avg_damage, p.avg_alliance_damage),
      main: (p) => compact(p.avg_damage),
      sub: (p) => `moy. alliance ${compact(p.avg_alliance_damage)}`,
    },

    avg_damage_share: {
      title: "🧨 Meilleure part des dégâts alliance",
      hint: "Part moyenne des dégâts de l’alliance apportée par le joueur.",
      field: "avg_damage_share",
      order: "desc",
      className: (p) => classFromBands(p.avg_damage_share, CHART_BANDS.damageShare),
      main: (p) => `${fmt(p.avg_damage_share, 1)} %`,
      sub: (p) => `${compact(p.avg_damage)} dégâts moyens / guerre`,
    },

    avg_defense_wins: {
      title: "🛡️ Meilleures victoires défense",
      hint: "Moyenne de victoires en défense par guerre.",
      field: "avg_defense_wins",
      order: "desc",
      className: (p) => classFromBands(p.avg_defense_wins, CHART_BANDS.defenseWins),
      main: (p) => fmt(p.avg_defense_wins, 1),
      sub: (p) =>
        `${p.defense_wins} victoire${p.defense_wins > 1 ? "s" : ""} défense au total`,
    },

    avg_deviations: {
      title: "🧲 Meilleur bonus défensif posé",
      hint: "Moyenne de déviations / bonus défensifs posés par guerre.",
      field: "avg_deviations",
      order: "desc",
      className: (p) => classFromBands(p.avg_deviations, CHART_BANDS.deviations),
      main: (p) => fmt(p.avg_deviations, 1),
      sub: (p) =>
        `${p.deviations} déviation${p.deviations > 1 ? "s" : ""} au total`,
    },
  };

  let allPlayers = [];
  let avatarByPlayer = new Map();
  let playerAliases = new Map();
  let currentRanking = "avg_score";

  function bust(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  }

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  function normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normAlliance(value) {
    const key = normalizeKey(value);

    if (key.includes("zeus")) return "zeus";
    if (key.includes("dionysos")) return "dionysos";
    if (key.includes("poseidon") || key.includes("posseidon")) return "poseidon";
    if (
      key.includes("kronos") ||
      key.includes("cronos") ||
      key.includes("chronos")
    ) {
      return "kronos";
    }

    return "";
  }

  function canonicalPlayerName(name) {
    let current = String(name ?? "").trim();

    if (!current) return "";

    for (let i = 0; i < 10; i++) {
      const next = playerAliases.get(normalizeKey(current));

      if (!next || String(next).trim() === current) {
        break;
      }

      current = String(next).trim();
    }

    return current;
  }

  function playerKey(name) {
    return normalizeKey(canonicalPlayerName(name));
  }

  function statKey(alliance, playerName) {
    const a = normAlliance(alliance);
    const p = playerKey(playerName);

    if (!a || !p) return "";

    return `${a}::${p}`;
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(value, decimals = 1) {
    return Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function signedFmt(value, decimals = 1) {
    const n = Number(value || 0);
    const sign = n > 0 ? "+" : "";

    return `${sign}${fmt(n, decimals)}`;
  }

  function compact(value) {
    const n = Number(value || 0);

    if (!Number.isFinite(n) || n <= 0) return "0";

    if (n >= 1_000_000_000) {
      return `${String(Math.round((n / 1_000_000_000) * 10) / 10).replace(
        ".",
        ","
      )} Md`;
    }

    if (n >= 1_000_000) {
      return `${String(Math.round((n / 1_000_000) * 10) / 10).replace(".", ",")} M`;
    }

    if (n >= 1_000) {
      return `${Math.round(n / 1_000)} k`;
    }

    return String(Math.round(n));
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeUrl(u) {
    const s = String(u ?? "").trim();

    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;

    return "";
  }

  function cleanClassName(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function classFromBands(value, bands) {
    const n = Number(value || 0);

    if (!Array.isArray(bands) || !bands.length) return "";

    for (const band of bands) {
      const from = Number(band.from);
      const to = Number(band.to);

      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;

      const low = Math.min(from, to);
      const high = Math.max(from, to);

      if (n >= low && n < high) {
        return cleanClassName(band.className);
      }
    }

    return "";
  }

  function ratioClass(value, reference) {
    const v = Number(value || 0);
    const ref = Number(reference || 0);

    if (!Number.isFinite(v) || !Number.isFinite(ref) || ref <= 0) {
      return "";
    }

    const ratio = v / ref;

    if (ratio >= 1.25) return "statGapExcellent";
    if (ratio >= 1.05) return "statGapGood";
    if (ratio >= 0.85) return "statGapNeutral";
    if (ratio >= 0.65) return "statGapWarning";

    return "statGapBad";
  }

  function enabled(key) {
    if (!key) return true;
    return filters[key]?.checked !== false;
  }

  async function loadPlayerAliases() {
    try {
      const data = await fetchJson(FILES.aliases);

      const source =
        data?.aliases && typeof data.aliases === "object" && !Array.isArray(data.aliases)
          ? data.aliases
          : data;

      playerAliases = new Map();

      if (source && typeof source === "object" && !Array.isArray(source)) {
        Object.entries(source).forEach(([alias, canonical]) => {
          const aliasKey = normalizeKey(alias);
          const canonicalName = String(canonical ?? "").trim();

          if (!aliasKey || !canonicalName) return;

          playerAliases.set(aliasKey, canonicalName);
        });
      }

      if (Array.isArray(source)) {
        source.forEach((row) => {
          const alias = String(row?.alias ?? row?.from ?? row?.name ?? "").trim();
          const canonical = String(row?.canonical ?? row?.to ?? row?.target ?? "").trim();
          const aliasKey = normalizeKey(alias);

          if (!aliasKey || !canonical) return;

          playerAliases.set(aliasKey, canonical);
        });
      }

      console.log("[war-rankings] aliases loaded:", playerAliases.size);
    } catch (error) {
      console.warn("[war-rankings] aliases unavailable:", error);
      playerAliases = new Map();
    }
  }

  async function loadPlayerAvatars() {
    try {
      const data = await fetchJson(FILES.infos);

      if (!Array.isArray(data)) {
        throw new Error("infos.json is not an array");
      }

      avatarByPlayer = new Map();

      data.forEach((p) => {
        const name = canonicalPlayerName(String(p?.name ?? "").trim());
        const key = playerKey(name);

        if (!key) return;

        avatarByPlayer.set(key, {
          icon: String(p?.icon ?? "").trim(),
          frame: String(p?.frame ?? "").trim(),
        });
      });

      console.log("[war-rankings] avatars loaded:", avatarByPlayer.size);
    } catch (error) {
      console.warn("[war-rankings] avatars unavailable:", error);
      avatarByPlayer = new Map();
    }
  }

  function renderAvatar(player) {
    const key = playerKey(player?.name);
    const avatar = avatarByPlayer.get(key) || {};

    const icon = safeUrl(avatar.icon);
    const frame = safeUrl(avatar.frame);

    const iconSafe = esc(icon);
    const frameSafe = esc(frame);

    if (!icon && !frame) {
      return `<div class="rankAvatar" aria-hidden="true"></div>`;
    }

    return `
      <div class="rankAvatar" aria-hidden="true">
        ${
          frame
            ? `<img class="rankAvatarFrame" src="${frameSafe}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : ""
        }
        ${
          icon
            ? `<img class="rankAvatarIcon" src="${iconSafe}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : ""
        }
      </div>
    `;
  }

  function makeEmptyGroup(alliance, name) {
    return {
      alliance,
      name,

      wars_played: 0,

      sum_score: 0,
      best_score: 0,
      sum_alliance_score: 0,
      sum_score_gap: 0,

      sum_attacks: 0,
      total_attacks: 0,

      sum_misses: 0,
      total_misses: 0,

      sum_success_rate: 0,
      total_successful_attacks: 0,

      sum_impact: 0,

      sum_damage: 0,
      total_damage: 0,
      sum_alliance_damage: 0,

      sum_damage_share: 0,

      sum_defense_wins: 0,
      defense_wins: 0,

      sum_deviations: 0,
      deviations: 0,
    };
  }

  function buildPlayersFromHistory(history) {
    const groups = new Map();

    if (!Array.isArray(history)) {
      throw new Error("war-history-lite.json is not an array");
    }

    history.forEach((war) => {
      const alliance = normAlliance(war?.alliance);
      const date = String(war?.date || "").trim();

      if (!alliance || !date || !Array.isArray(war.players)) return;

      war.players.forEach((rawPlayer) => {
        const name = canonicalPlayerName(rawPlayer?.name || rawPlayer?.player || "");
        const key = statKey(alliance, name);

        if (!key || !name) return;

        if (!groups.has(key)) {
          groups.set(key, makeEmptyGroup(alliance, name));
        }

        const g = groups.get(key);

        const score = toNumber(rawPlayer.score_total);
        const allianceScore = toNumber(war.alliance_avg_score);
        const scoreGap =
          rawPlayer.score_gap !== undefined
            ? toNumber(rawPlayer.score_gap)
            : score - allianceScore;

        const attacks = toNumber(rawPlayer.attacks);
        const misses = toNumber(rawPlayer.misses);
        const successful =
          rawPlayer.successful_attacks !== undefined
            ? toNumber(rawPlayer.successful_attacks)
            : Math.max(0, attacks - misses);

        const successRate =
          rawPlayer.success_rate !== undefined
            ? toNumber(rawPlayer.success_rate)
            : attacks > 0
              ? (successful / attacks) * 100
              : 0;

        const impact = toNumber(rawPlayer.score_impact);
        const damage = toNumber(rawPlayer.damage);
        const allianceDamage = toNumber(war.alliance_avg_damage);
        const damageShare = toNumber(rawPlayer.damage_share_pct);
        const defenseWins = toNumber(rawPlayer.defense_wins);
        const deviations = toNumber(rawPlayer.deviations);

        g.wars_played += 1;

        g.sum_score += score;
        g.best_score = Math.max(g.best_score, score);
        g.sum_alliance_score += allianceScore;
        g.sum_score_gap += scoreGap;

        g.sum_attacks += attacks;
        g.total_attacks += attacks;

        g.sum_misses += misses;
        g.total_misses += misses;

        g.sum_success_rate += successRate;
        g.total_successful_attacks += successful;

        g.sum_impact += impact;

        g.sum_damage += damage;
        g.total_damage += damage;
        g.sum_alliance_damage += allianceDamage;

        g.sum_damage_share += damageShare;

        g.sum_defense_wins += defenseWins;
        g.defense_wins += defenseWins;

        g.sum_deviations += deviations;
        g.deviations += deviations;
      });
    });

    return Array.from(groups.values())
      .map((g) => {
        const wars = Math.max(1, g.wars_played || 0);

        return {
          ...g,

          avg_score: g.sum_score / wars,
          avg_alliance_score: g.sum_alliance_score / wars,
          avg_score_gap: g.sum_score_gap / wars,

          avg_attacks: g.sum_attacks / wars,
          avg_misses: g.sum_misses / wars,

          success_rate: g.sum_success_rate / wars,

          avg_impact: g.sum_impact / wars,

          avg_damage: g.sum_damage / wars,
          avg_alliance_damage: g.sum_alliance_damage / wars,
          avg_damage_share: g.sum_damage_share / wars,

          avg_defense_wins: g.sum_defense_wins / wars,
          avg_deviations: g.sum_deviations / wars,

          defense_wins: Math.round(g.defense_wins),
          deviations: Math.round(g.deviations),
          total_attacks: Math.round(g.total_attacks),
          total_misses: Math.round(g.total_misses),
          total_successful_attacks: Math.round(g.total_successful_attacks),
        };
      })
      .filter((p) => p.name && p.alliance && p.wars_played > 0);
  }

  function sortRows(rows, config) {
    const dir = config.order === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      const va = Number(a[config.field] || 0);
      const vb = Number(b[config.field] || 0);

      if (va !== vb) return (va - vb) * dir;

      if (currentRanking === "avg_misses") {
        if ((b.success_rate || 0) !== (a.success_rate || 0)) {
          return (b.success_rate || 0) - (a.success_rate || 0);
        }
      }

      if (currentRanking !== "avg_score") {
        if ((b.avg_score || 0) !== (a.avg_score || 0)) {
          return (b.avg_score || 0) - (a.avg_score || 0);
        }
      }

      if ((b.wars_played || 0) !== (a.wars_played || 0)) {
        return (b.wars_played || 0) - (a.wars_played || 0);
      }

      if ((b.total_attacks || 0) !== (a.total_attacks || 0)) {
        return (b.total_attacks || 0) - (a.total_attacks || 0);
      }

      return String(a.name || "").localeCompare(String(b.name || ""), "fr", {
        sensitivity: "base",
      });
    });
  }

  function render(rows) {
    const config = RANKINGS[currentRanking];

    $rankingTitle.textContent = config.title;
    $rankingHint.textContent = config.hint;
    $count.textContent = String(rows.length);

    if (!rows.length) {
      $players.innerHTML = `
        <div class="emptyState">
          Aucun joueur ne correspond aux filtres ou au minimum de guerres sélectionné.
        </div>
      `;
      return;
    }

    $players.innerHTML = rows
      .map((p, i) => {
        const key = normAlliance(p.alliance);
        const emoji = EMOJI[key] || "👤";
        const alliance = LABEL[key] || "Alliance";
        const nameSafe = esc(p.name);
        const valueClass = cleanClassName(config.className ? config.className(p) : "");

        return `
          <div class="rankRow">
            <div class="rankLeft">
              <div class="rankNum">${i + 1}</div>
              ${renderAvatar(p)}
            </div>

            <div class="rankCenter">
              <div class="rankMainLine">
                <div class="rankEmoji" aria-label="${esc(alliance)}">${emoji}</div>
                <div class="rankName" title="${nameSafe}">${nameSafe}</div>
              </div>

              <div class="rankMeta">
                ${esc(alliance)} • ${p.wars_played} guerre${p.wars_played > 1 ? "s" : ""}
              </div>
            </div>

            <div class="rankPower ${valueClass}">
              <div>${esc(config.main(p))}</div>
              <div class="rankSubValue">${esc(config.sub(p))}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function apply() {
    const minWars = Number($minWarsSelect.value || 1);
    const config = RANKINGS[currentRanking];

    const rows = allPlayers.filter((p) => {
      const key = normAlliance(p.alliance);

      if (!enabled(key)) return false;
      if (Number(p.wars_played || 0) < minWars) return false;

      if (
        (currentRanking === "success_rate" || currentRanking === "avg_misses") &&
        Number(p.total_attacks || 0) <= 0
      ) {
        return false;
      }

      return true;
    });

    render(sortRows(rows, config));
  }

  function setRanking(key) {
    if (!RANKINGS[key]) return;

    currentRanking = key;

    tabs.forEach((tab) => {
      const isActive = tab.dataset.ranking === key;

      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    apply();
  }

  function bindEvents() {
    Object.values(filters).forEach((cb) => {
      cb?.addEventListener("change", apply);
    });

    $minWarsSelect.addEventListener("change", apply);

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => setRanking(tab.dataset.ranking));
    });
  }

  async function init() {
    try {
      await loadPlayerAliases();
      await loadPlayerAvatars();

      const history = await fetchJson(FILES.history);
      allPlayers = buildPlayersFromHistory(history);

      bindEvents();
      setRanking(currentRanking);
    } catch (error) {
      console.error("[war-rankings] init error:", error);

      $players.innerHTML = `
        <div class="emptyState">
          ❌ Impossible de charger <code>data/war-history-lite.json</code><br>
          <span style="color: rgba(255,255,255,.55); font-size: 13px;">
            ${esc(error?.message || error)}
          </span>
        </div>
      `;

      $count.textContent = "0";
    }
  }

  init();
})();