/* docs/war-graphs.js */
(() => {
  const AUTH_PLAYER_STORAGE_KEY = "losp:lastPlayerByAlliance";
  const LOCAL_SESSION_KEY = "losp_session";

  const FILES = {
    history: "./data/war-history-lite.json",
    stats: "./data/war-stats.json",
    infos: "./data/infos.json",
    aliases: "./data/player-aliases.json",
    joueurs: "./data/joueurs.json",
  };

  const $allianceSelect = document.getElementById("allianceSelect");
  const $playerSelect = document.getElementById("playerSelect");
  const $warRangeButtons = Array.from(document.querySelectorAll(".rangeChip[data-range]"));
  const $playerTitle = document.getElementById("playerTitle");
  const $playerSubtitle = document.getElementById("playerSubtitle");
  const $warsCount = document.getElementById("warsCount");
  const $summaryStats = document.getElementById("summaryStats");

  const mounts = {
    score: document.getElementById("chartScore"),
    scoreGap: document.getElementById("chartScoreGap"),
    attacks: document.getElementById("chartAttacks"),
    misses: document.getElementById("chartMisses"),
    success: document.getElementById("chartSuccess"),
    impact: document.getElementById("chartImpact"),
    damage: document.getElementById("chartDamage"),
    damageShare: document.getElementById("chartDamageShare"),
    defenseWins: document.getElementById("chartDefenseWins"),
    deviations: document.getElementById("chartDeviations"),
  };

  if (
    !$allianceSelect ||
    !$playerSelect ||
    !$warRangeButtons.length ||
    !$playerTitle ||
    !$playerSubtitle ||
    !$warsCount ||
    !$summaryStats
  ) {
    console.error("[war-graphs] Missing DOM elements. Check war-graphs.html ids.");
    return;
  }

  const EMOJI = {
    zeus: "⚡",
    kronos: "⏳",
    dionysos: "🍇",
    poseidon: "🔱",
  };

  const LABEL = {
    zeus: "Zeus",
    kronos: "Kronos",
    dionysos: "Dionysos",
    poseidon: "Poséidon",
  };

  const CHART_BAND_STYLES = {
    chartBandExcellent: {
      fill: "rgba(45,190,95,.18)",
      opacity: 0.62,
    },
    chartBandGood: {
      fill: "rgba(175,235,85,.15)",
      opacity: 0.62,
    },
    chartBandNeutral: {
      fill: "rgba(255,205,55,.14)",
      opacity: 0.62,
    },
    chartBandWarning: {
      fill: "rgba(255,125,35,.15)",
      opacity: 0.62,
    },
    chartBandBad: {
      fill: "rgba(255,65,82,.16)",
      opacity: 0.62,
    },
  };

  const CHART_BANDS = {
    score: [
      { from: 85, to: 100, className: "chartBandExcellent" },
      { from: 70, to: 85, className: "chartBandGood" },
      { from: 55, to: 70, className: "chartBandNeutral" },
      { from: 45, to: 55, className: "chartBandWarning" },
      { from: 0, to: 45, className: "chartBandBad" },
    ],

    scoreGap: [
      { from: 15, to: 999, className: "chartBandExcellent" },
      { from: 5, to: 15, className: "chartBandGood" },
      { from: -10, to: 5, className: "chartBandNeutral" },
      { from: -20, to: -10, className: "chartBandWarning" },
      { from: -999, to: -20, className: "chartBandBad" },
    ],

    attacks: [
      { from: 13, to: 14, className: "chartBandExcellent" },
      { from: 12, to: 13, className: "chartBandGood" },
      { from: 10, to: 12, className: "chartBandNeutral" },
      { from: 9, to: 10, className: "chartBandWarning" },
      { from: 0, to: 9, className: "chartBandBad" },
    ],

    misses: [],

    success: [
      { from: 90, to: 100, className: "chartBandExcellent" },
      { from: 80, to: 90, className: "chartBandGood" },
      { from: 70, to: 80, className: "chartBandNeutral" },
      { from: 60, to: 70, className: "chartBandWarning" },
      { from: 0, to: 60, className: "chartBandBad" },
    ],

    impact: [
      { from: 30, to: 35, className: "chartBandExcellent" },
      { from: 25, to: 30, className: "chartBandGood" },
      { from: 20, to: 25, className: "chartBandNeutral" },
      { from: 15, to: 20, className: "chartBandWarning" },
      { from: 0, to: 15, className: "chartBandBad" },
    ],

    // Pas de palier fixe ici : les dégâts bruts dépendent trop de l'alliance, de la méta et du niveau TCP.
    damage: [],

    damageShare: [],

    defenseWins: [],

    deviations: [
      { from: 4, to: 999, className: "chartBandExcellent" },
      { from: 2, to: 4, className: "chartBandGood" },
      { from: 1.5, to: 2, className: "chartBandNeutral" },
      { from: 0.5, to: 1.5, className: "chartBandWarning" },
      { from: 0, to: 0.5, className: "chartBandBad" },
    ],
  };

  let warHistory = [];
  let warStatsByPlayer = new Map();
  let avatarByPlayer = new Map();
  let playerAliases = new Map();
  let currentPlayersByAlliance = new Map();

  let lospSession = window.LoSP_SESSION || readLocalSessionPayload() || null;
  let currentWarRange = "all";
  let authDefaultsApplied = false;
  let bootReady = false;
  let eventsBound = false;

  // ---------- Auth session ----------
  function decodeBase64UrlJson(value) {
    try {
      const base64 = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const binary = atob(padded);

      const bytes = new Uint8Array(
        Array.from(binary).map((char) => char.charCodeAt(0))
      );

      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      return null;
    }
  }

  function readLocalSessionPayload() {
    try {
      const raw = localStorage.getItem(LOCAL_SESSION_KEY) || "";
      if (!raw) return null;

      const payload = decodeBase64UrlJson(raw);
      if (!payload) return null;

      return {
        ok: true,
        ...payload,
      };
    } catch (_) {
      return null;
    }
  }

  function refreshLoSPSession() {
    lospSession =
      window.LoSP_SESSION ||
      readLocalSessionPayload() ||
      lospSession ||
      null;

    return lospSession;
  }

  function hasUsableSession(session) {
    return !!session && (
      session.ok === true ||
      Array.isArray(session.alliances) ||
      Array.isArray(session.players)
    );
  }

  window.addEventListener("losp:auth-ready", (event) => {
    lospSession = event.detail || window.LoSP_SESSION || readLocalSessionPayload() || null;

    if (!bootReady) return;

    authDefaultsApplied = false;
    tryApplyAuthDefaults({ force: true });
  });

  // ---------- Utils ----------
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

  function normalizeTextForMatch(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function allianceKey(value) {
    const key = normalizeKey(value);

    if (key === "zeus") return "zeus";
    if (key === "dionysos") return "dionysos";
    if (key === "poseidon" || key === "posseidon") return "poseidon";
    if (
      key === "kronos" ||
      key === "cronos" ||
      key === "chronos" ||
      key === "lospkronos"
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
    const allianceK = allianceKey(alliance);
    const playerK = playerKey(playerName);

    if (!allianceK || !playerK) return "";

    return `${allianceK}::${playerK}`;
  }

  function getPlayerStats(alliance, playerName) {
    return warStatsByPlayer.get(statKey(alliance, playerName)) || null;
  }

  function fmt(v, d = 1) {
    return Number(v || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  function compact(value) {
    const n = Number(value || 0);

    if (!Number.isFinite(n) || n <= 0) return "0";

    if (n >= 1_000_000_000) {
      const v = Math.round((n / 1_000_000_000) * 10) / 10;
      return `${String(v).replace(".", ",")} Md`;
    }

    if (n >= 1_000_000) {
      const v = Math.round((n / 1_000_000) * 10) / 10;
      return `${String(v).replace(".", ",")} M`;
    }

    if (n >= 1_000) {
      const v = Math.round(n / 1_000);
      return `${v} k`;
    }

    return String(Math.round(n));
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeUrl(u) {
    const s = String(u ?? "").trim();

    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;

    return "";
  }

  function shortDate(v) {
    return String(v || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2");
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function cleanClassName(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function bandStyleForClass(className) {
    return CHART_BAND_STYLES[className] || {
      fill: "rgba(255,255,255,.08)",
      opacity: 0.55,
    };
  }

  function normalizeWarRange(value) {
    const mode = String(value || "all").trim();

    if (mode === "last12") return "last12";
    if (mode === "last4") return "last4";

    return "all";
  }

  function setWarRange(mode, options = {}) {
    currentWarRange = normalizeWarRange(mode);

    $warRangeButtons.forEach((button) => {
      const isActive = normalizeWarRange(button.dataset.range) === currentWarRange;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (options.render === true) {
      renderCharts();
    }
  }

  function getWarRangeMode() {
    return normalizeWarRange(currentWarRange);
  }

  function getWarRangeLimit() {
    const mode = getWarRangeMode();

    if (mode === "last12") return 12;
    if (mode === "last4") return 4;

    return 0;
  }

  function getWarRangeLabel() {
    const mode = getWarRangeMode();

    if (mode === "last12") return "12 dernières guerres";
    if (mode === "last4") return "4 dernières guerres";

    return "toutes les guerres";
  }

  function applyWarRange(series) {
    const rows = Array.isArray(series) ? series.slice() : [];
    const limit = getWarRangeLimit();

    if (!limit || rows.length <= limit) {
      return rows;
    }

    return rows.slice(-limit);
  }

  // ---------- Stat color classes ----------
  function scoreClass(value) {
    const n = Number(value || 0);

    if (n >= 85) return "statGapExcellent";
    if (n >= 70) return "statGapGood";
    if (n >= 55) return "statGapNeutral";
    if (n >= 45) return "statGapWarning";

    return "statGapBad";
  }

  function scoreGapClass(value) {
    const n = Number(value || 0);

    if (n > 15) return "statGapExcellent";
    if (n >= 5) return "statGapGood";
    if (n >= -10) return "statGapNeutral";
    if (n >= -20) return "statGapWarning";

    return "statGapBad";
  }

  function activityClass(value) {
    const n = Number(value || 0);

    if (n >= 13) return "statGapExcellent";
    if (n >= 12) return "statGapGood";
    if (n >= 10) return "statGapNeutral";
    if (n >= 9) return "statGapWarning";

    return "statGapBad";
  }

  function successClass(value) {
    const n = Number(value || 0);

    if (n >= 90) return "statGapExcellent";
    if (n >= 80) return "statGapGood";
    if (n >= 70) return "statGapNeutral";
    if (n >= 60) return "statGapWarning";

    return "statGapBad";
  }

  function impactClass(value) {
    const n = Number(value || 0);

    if (n >= 30) return "statGapExcellent";
    if (n >= 25) return "statGapGood";
    if (n >= 20) return "statGapNeutral";
    if (n >= 15) return "statGapWarning";

    return "statGapBad";
  }

  // ---------- Aliases ----------
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

      console.log("[war-graphs] aliases loaded:", playerAliases.size);
    } catch (error) {
      console.warn("[war-graphs] aliases unavailable:", error);
      playerAliases = new Map();
    }
  }

  // ---------- War stats ----------
  async function loadWarStats() {
    try {
      const data = await fetchJson(FILES.stats);

      if (!Array.isArray(data)) {
        throw new Error("war-stats.json is not an array");
      }

      warStatsByPlayer = new Map();

      data.forEach((row) => {
        const alliance = allianceKey(row?.alliance || row?.alliance_label || "");
        const name = canonicalPlayerName(row?.name || row?.player || "");
        const key = statKey(alliance, name);

        if (!key) return;

        warStatsByPlayer.set(key, {
          ...row,
          alliance,
          name,
        });
      });

      console.log("[war-graphs] war stats loaded:", warStatsByPlayer.size);
    } catch (error) {
      console.warn("[war-graphs] war stats unavailable:", error);
      warStatsByPlayer = new Map();
    }
  }

  // ---------- Current players ----------
  async function loadCurrentPlayers() {
    try {
      const data = await fetchJson(FILES.joueurs);

      if (!Array.isArray(data)) {
        throw new Error("joueurs.json is not an array");
      }

      currentPlayersByAlliance = new Map();

      data.forEach((row) => {
        const alliance = allianceKey(row?.alliance);
        const playerName = canonicalPlayerName(row?.player || row?.name || "");
        const key = playerKey(playerName);

        if (!alliance || !key) return;

        if (!currentPlayersByAlliance.has(alliance)) {
          currentPlayersByAlliance.set(alliance, new Set());
        }

        currentPlayersByAlliance.get(alliance).add(key);
      });

      console.log("[war-graphs] current players loaded:", {
        zeus: currentPlayersByAlliance.get("zeus")?.size || 0,
        kronos: currentPlayersByAlliance.get("kronos")?.size || 0,
        dionysos: currentPlayersByAlliance.get("dionysos")?.size || 0,
        poseidon: currentPlayersByAlliance.get("poseidon")?.size || 0,
      });
    } catch (error) {
      console.warn("[war-graphs] current players unavailable, no current-roster filter:", error);
      currentPlayersByAlliance = new Map();
    }
  }

  function isCurrentPlayerInAlliance(playerName, alliance) {
    const allianceK = allianceKey(alliance);
    const key = playerKey(playerName);
    const set = currentPlayersByAlliance.get(allianceK);

    if (!set || !set.size) return true;

    return set.has(key);
  }

  // ---------- Auth helpers ----------
  function getSessionAlliancePreferenceKeys() {
    if (!hasUsableSession(lospSession)) return [];

    const keys = [];

    if (lospSession.primaryAlliance) {
      keys.push(allianceKey(lospSession.primaryAlliance));
    }

    if (Array.isArray(lospSession.alliances)) {
      lospSession.alliances.forEach((alliance) => {
        keys.push(allianceKey(alliance));
      });
    }

    if (Array.isArray(lospSession.players)) {
      lospSession.players.forEach((player) => {
        if (player?.alliance) keys.push(allianceKey(player.alliance));
      });
    }

    return [...new Set(keys.filter(Boolean))];
  }

  function getSessionPlayerForAlliance(session, alliance) {
    const allianceK = allianceKey(alliance);

    if (!hasUsableSession(session) || !Array.isArray(session.players)) {
      return null;
    }

    const exactMatch = session.players.find(
      (player) => allianceKey(player.alliance) === allianceK
    );

    if (exactMatch) return exactMatch;

    if (session.players.length === 1) {
      return session.players[0];
    }

    return null;
  }

  function readStoredPlayersByAlliance() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_PLAYER_STORAGE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveStoredPlayerForAlliance(alliance, player) {
    const allianceK = allianceKey(alliance);
    const playerName = String(player ?? "").trim();

    if (!allianceK || !playerName) return;

    try {
      const data = readStoredPlayersByAlliance();
      data[allianceK] = playerName;
      localStorage.setItem(AUTH_PLAYER_STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function getStoredPlayerForAlliance(alliance) {
    const allianceK = allianceKey(alliance);
    if (!allianceK) return "";

    const data = readStoredPlayersByAlliance();
    return data[allianceK] || "";
  }

  function findAllianceOptionByKey(key) {
    if (!key) return null;

    return Array.from($allianceSelect.options).find((option) => {
      if (!option.value) return false;

      return (
        allianceKey(option.value) === key ||
        allianceKey(option.textContent) === key
      );
    });
  }

  function findBestAllianceOptionFromSession() {
    const preferenceKeys = getSessionAlliancePreferenceKeys();

    for (const key of preferenceKeys) {
      const option = findAllianceOptionByKey(key);

      if (option && playersForAlliance(option.value).length) {
        return option;
      }
    }

    return Array.from($allianceSelect.options).find((option) => {
      return option.value && playersForAlliance(option.value).length;
    }) || null;
  }

  function findPlayerOptionByName(name) {
    if (!name) return null;

    const canonical = canonicalPlayerName(name);
    const wanted = normalizeTextForMatch(canonical);
    const wantedKey = playerKey(canonical);

    return Array.from($playerSelect.options).find((option) => {
      if (!option.value) return false;

      const optionLabel = String(option.textContent || "").replace(/\s*$begin:math:text$\\d\+$end:math:text$\s*$/, "");

      return (
        normalizeTextForMatch(option.value) === wanted ||
        normalizeTextForMatch(optionLabel) === wanted ||
        playerKey(option.value) === wantedKey ||
        playerKey(optionLabel) === wantedKey
      );
    });
  }

  function selectPlayerByName(name) {
    const option = findPlayerOptionByName(name);

    if (!option) return false;

    $playerSelect.value = option.value;
    return true;
  }

  function selectBestPlayerForCurrentAlliance() {
    const alliance = String($allianceSelect.value ?? "").trim();
    if (!alliance) return false;

    const sessionPlayer = getSessionPlayerForAlliance(lospSession, alliance);

    if (sessionPlayer?.name && selectPlayerByName(sessionPlayer.name)) {
      return true;
    }

    const storedPlayer = getStoredPlayerForAlliance(alliance);

    if (storedPlayer && selectPlayerByName(storedPlayer)) {
      return true;
    }

    const candidateNames = [
      lospSession?.displayName,
      lospSession?.global_name,
      lospSession?.username,
    ].filter(Boolean);

    for (const name of candidateNames) {
      if (selectPlayerByName(name)) return true;
    }

    return false;
  }

  function tryApplyAuthDefaults(options = {}) {
    const force = options.force === true;

    refreshLoSPSession();

    const params = new URLSearchParams(window.location.search);
    const hasUrlTarget = Boolean(params.get("alliance") || params.get("player"));

    if (hasUrlTarget && !force) return false;
    if (authDefaultsApplied && !force) return false;
    if (!hasUsableSession(lospSession)) return false;
    if (!$allianceSelect.options.length) return false;

    const allianceOption = findBestAllianceOptionFromSession();

    if (!allianceOption) return false;

    $allianceSelect.value = allianceOption.value;

    renderPlayerSelect({
      preferAuth: true,
      preservePrevious: false,
    });

    const didSelectPlayer = selectBestPlayerForCurrentAlliance();

    authDefaultsApplied = true;

    if (didSelectPlayer) {
      saveStoredPlayerForAlliance($allianceSelect.value, $playerSelect.value);
    }

    renderCharts();

    console.log("[war-graphs] auth defaults applied:", {
      alliance: $allianceSelect.value,
      player: $playerSelect.value,
      range: currentWarRange,
      session: lospSession,
    });

    return true;
  }

  // ---------- Avatars ----------
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

      console.log("[war-graphs] avatars loaded:", avatarByPlayer.size);
    } catch (error) {
      console.warn("[war-graphs] avatars unavailable:", error);
      avatarByPlayer = new Map();
    }
  }

  function renderAvatar(playerName) {
    const key = playerKey(playerName);
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

  // ---------- Data helpers ----------
  function playersForAlliance(alliance) {
    const a = allianceKey(alliance);
    const map = new Map();

    warHistory
      .filter((w) => allianceKey(w.alliance) === a)
      .forEach((war) => {
        const seenInThisWar = new Set();

        (war.players || []).forEach((p) => {
          const canonicalName = canonicalPlayerName(p.name);
          const key = playerKey(canonicalName);

          if (!canonicalName || !key) return;

          if (!isCurrentPlayerInAlliance(canonicalName, a)) return;

          if (seenInThisWar.has(key)) return;
          seenInThisWar.add(key);

          if (!map.has(key)) {
            map.set(key, {
              name: canonicalName,
              wars: 0,
              lastDate: "",
            });
          }

          const row = map.get(key);
          row.wars += 1;

          if (!row.lastDate || war.date > row.lastDate) {
            row.lastDate = war.date;
          }
        });
      });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
    );
  }

  function seriesForPlayer(alliance, playerName) {
    const a = allianceKey(alliance);
    const wantedKey = playerKey(playerName);

    return warHistory
      .filter((w) => allianceKey(w.alliance) === a)
      .map((war) => {
        const p = (war.players || []).find((x) => playerKey(x.name) === wantedKey);

        if (!p) return null;

        const scoreTotal = toNumber(p.score_total);
        const allianceAvgScore = toNumber(war.alliance_avg_score);
        const scoreGap =
          p.score_gap !== undefined
            ? toNumber(p.score_gap)
            : scoreTotal - allianceAvgScore;

        return {
          date: war.date,

          score_total: scoreTotal,
          alliance_avg_score: allianceAvgScore,

          score_gap: scoreGap,
          alliance_score_gap: 0,

          attacks: toNumber(p.attacks),
          alliance_avg_attacks: toNumber(war.alliance_avg_attacks),

          misses: toNumber(p.misses),
          alliance_avg_misses: toNumber(war.alliance_avg_misses),

          success_rate: toNumber(p.success_rate),
          alliance_avg_success_rate: toNumber(war.alliance_avg_success_rate),

          score_impact: toNumber(p.score_impact),
          alliance_avg_impact: toNumber(war.alliance_avg_impact),

          damage: toNumber(p.damage),
          alliance_avg_damage: toNumber(war.alliance_avg_damage),

          damage_share_pct: toNumber(p.damage_share_pct),
          alliance_avg_damage_share_pct: toNumber(war.alliance_avg_damage_share_pct),

          defense_wins: toNumber(p.defense_wins),
          alliance_avg_defense_wins: toNumber(war.alliance_avg_defense_wins),

          deviations: toNumber(p.deviations),
          alliance_avg_deviations: toNumber(war.alliance_avg_deviations),

          rank: toNumber(p.rank),
          player_count: toNumber(p.player_count || war.player_count),
          successful_attacks: toNumber(p.successful_attacks),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderPlayerSelect(options = {}) {
    const preferAuth = options.preferAuth === true;
    const preservePrevious = options.preservePrevious === true;
    const previousValue = $playerSelect.value;

    const players = playersForAlliance($allianceSelect.value);

    $playerSelect.innerHTML = "";

    if (!players.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Aucun joueur disponible —";
      $playerSelect.appendChild(opt);
      $playerSelect.disabled = true;
      return;
    }

    $playerSelect.disabled = false;

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.name} (${p.wars})`;
      $playerSelect.appendChild(opt);
    });

    const params = new URLSearchParams(window.location.search);
    const wantedPlayer = params.get("player");
    const wantedAlliance = allianceKey(params.get("alliance"));

    if (wantedPlayer && wantedAlliance === allianceKey($allianceSelect.value)) {
      if (selectPlayerByName(wantedPlayer)) return;
    }

    if (preferAuth && selectBestPlayerForCurrentAlliance()) {
      return;
    }

    if (preservePrevious && previousValue && selectPlayerByName(previousValue)) {
      return;
    }

    const storedPlayer = getStoredPlayerForAlliance($allianceSelect.value);

    if (storedPlayer && selectPlayerByName(storedPlayer)) {
      return;
    }

    if (players[0]) {
      $playerSelect.value = players[0].name;
    }
  }

  function avg(rows, field) {
    return rows.length
      ? rows.reduce((s, r) => s + Number(r[field] || 0), 0) / rows.length
      : 0;
  }

  function renderSummary(series, playerName, alliance, totalWars = 0) {
    const wars = series.length;
    const allWars = Number(totalWars || wars);
    const allianceKeyValue = allianceKey(alliance);
    const emoji = EMOJI[allianceKeyValue] || "👤";
    const allianceLabel = LABEL[allianceKeyValue] || "Alliance";
    const canonicalName = canonicalPlayerName(playerName);
    const playerStats = getPlayerStats(alliance, canonicalName);

    $warsCount.textContent = String(wars);

    if (!wars) {
      $playerTitle.innerHTML = "—";
      $playerSubtitle.textContent = "Aucune donnée disponible pour cette sélection.";
      $summaryStats.innerHTML = "";
      return;
    }

    const avgScore = avg(series, "score_total");
    const avgAlliance = avg(series, "alliance_avg_score");
    const scoreGap = avgScore - avgAlliance;

    const avgAttacks = avg(series, "attacks");
    const avgMisses = avg(series, "misses");
    const avgSuccess = avg(series, "success_rate");
    const avgImpact = avg(series, "score_impact");

    const statsAvgDamage = Number(playerStats?.avg_damage_per_war || 0);
    const statsTotalDamage = Number(playerStats?.total_damage || 0);
    const statsWarsPlayed = Number(playerStats?.wars_played || 0);
    const fallbackAvgDamage =
      statsTotalDamage > 0 && statsWarsPlayed > 0
        ? statsTotalDamage / statsWarsPlayed
        : avg(series, "damage");

    const avgDamage =
      statsAvgDamage > 0 && getWarRangeMode() === "all"
        ? statsAvgDamage
        : avg(series, "damage") || fallbackAvgDamage;

    const avgDamageShare = avg(series, "damage_share_pct");
    const avgDefenseWins = avg(series, "defense_wins");
    const avgDeviations = avg(series, "deviations");

    $playerTitle.innerHTML = `
      <div class="playerIdentity">
        ${renderAvatar(canonicalName)}
        <div class="playerIdentityText">
          <div class="playerNameLine">
            <span class="playerEmoji">${emoji}</span>
            <span class="playerName" title="${esc(canonicalName)}">${esc(canonicalName)}</span>
          </div>
        </div>
      </div>
    `;

    const pluralWars = wars > 1 ? "guerres analysées" : "guerre analysée";

    if (allWars > wars) {
      $playerSubtitle.textContent =
        `${allianceLabel} • ${getWarRangeLabel()} • ${wars}/${allWars} guerres`;
    } else {
      $playerSubtitle.textContent =
        `${allianceLabel} • ${wars} ${pluralWars}`;
    }

    $summaryStats.innerHTML = `
      <div class="statPill ${scoreClass(avgScore)}">
        <div class="statValue">${fmt(avgScore, 1)} / 100</div>
        <div class="statLabel">note moyenne</div>
      </div>

      <div class="statPill ${scoreGapClass(scoreGap)}">
        <div class="statValue">${fmt(scoreGap, 1)}</div>
        <div class="statLabel">écart avec la note moyenne de l'alliance</div>
      </div>

      <div class="statPill ${activityClass(avgAttacks)}">
        <div class="statValue">${fmt(avgAttacks, 1)}</div>
        <div class="statLabel">moyenne d'attaques / guerre</div>
      </div>

      <div class="statPill">
        <div class="statValue">${fmt(avgMisses, 1)}</div>
        <div class="statLabel">moyenne de ratés / guerre</div>
      </div>

      <div class="statPill ${successClass(avgSuccess)}">
        <div class="statValue">${fmt(avgSuccess, 1)} %</div>
        <div class="statLabel">réussite moyenne</div>
      </div>

      <div class="statPill ${impactClass(avgImpact)}">
        <div class="statValue">${fmt(avgImpact, 1)} / 35</div>
        <div class="statLabel">impact moyen</div>
      </div>

      <div class="statPill">
        <div class="statValue">${compact(avgDamage)}</div>
        <div class="statLabel">dégâts moyens / guerre</div>
      </div>

      <div class="statPill">
        <div class="statValue">${fmt(avgDamageShare, 1)} %</div>
        <div class="statLabel">part moy. des dégâts alliance</div>
      </div>

      <div class="statPill">
        <div class="statValue">${fmt(avgDefenseWins, 1)}</div>
        <div class="statLabel">victoires défense / guerre</div>
      </div>

      <div class="statPill">
        <div class="statValue">${fmt(avgDeviations, 1)}</div>
        <div class="statLabel">bonus défensif posé / guerre</div>
      </div>
    `;
  }

  function emptyChart(mount, message) {
    if (mount) {
      mount.innerHTML = `<div class="emptyChart">${esc(message)}</div>`;
    }
  }

  function niceMax(v, fallback = 100) {
    const n = Number(v);

    if (!Number.isFinite(n) || n <= 0) return fallback;
    if (n <= 10) return Math.ceil(n);
    if (n <= 35) return Math.ceil(n / 5) * 5;
    if (n <= 100) return Math.ceil(n / 10) * 10;
    if (n <= 1_000_000) return Math.ceil(n / 100_000) * 100_000;
    if (n <= 1_000_000_000) return Math.ceil(n / 100_000_000) * 100_000_000;

    return Math.ceil(n / 250_000_000) * 250_000_000;
  }

  function niceMin(v) {
    const n = Number(v);

    if (!Number.isFinite(n) || n >= 0) return 0;

    const abs = Math.abs(n);

    if (abs <= 10) return -Math.ceil(abs);
    if (abs <= 35) return -Math.ceil(abs / 5) * 5;
    if (abs <= 100) return -Math.ceil(abs / 10) * 10;

    return -Math.ceil(abs / 25) * 25;
  }

  function pathFrom(points) {
    if (!points.length) return "";

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.01} ${points[0].y}`;
    }

    return points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  }

  function axisValue(v, opts) {
    if (opts.compact) return compact(v);
    if (opts.percent) return `${Math.round(v)}%`;

    return Number(v || 0).toLocaleString("fr-FR", {
      maximumFractionDigits: 0,
    });
  }

  function pointValue(v, opts) {
    if (opts.compact) return compact(v);
    if (opts.percent) return `${fmt(v, 1)} %`;

    return fmt(v, opts.decimals ?? 1);
  }

  function renderBandsSvg(opts, y, pad, plotW, minY, maxY) {
    const bands = Array.isArray(opts.bands) ? opts.bands : [];

    if (!bands.length) return "";

    return bands
      .map((band) => {
        const from = Number(band.from);
        const to = Number(band.to);

        if (!Number.isFinite(from) || !Number.isFinite(to)) return "";

        const low = Math.max(minY, Math.min(from, to));
        const high = Math.min(maxY, Math.max(from, to));

        if (high <= minY || low >= maxY || high <= low) return "";

        const top = y(high);
        const bottom = y(low);
        const height = Math.max(0, bottom - top);
        const className = cleanClassName(band.className);

        if (!height || !className) return "";

        const style = bandStyleForClass(className);

        return `
          <rect
            class="chartBand ${className}"
            x="${pad.left}"
            y="${top}"
            width="${plotW}"
            height="${height}"
            fill="${style.fill}"
            opacity="${style.opacity}"
            pointer-events="none"
            shape-rendering="crispEdges"
          />
        `;
      })
      .join("");
  }

  function draw(mount, opts) {
    if (!mount) return;

    const rows = opts.rows || [];

    if (!rows.length) {
      return emptyChart(mount, "Aucune donnée à afficher.");
    }

    const width = 640;
    const height = 500;

    const pad = {
      left: 52,
      right: 22,
      top: 30,
      bottom: 58,
    };

    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const playerVals = rows.map((r) => Number(r[opts.playerField] || 0));
    const allianceVals = opts.allianceField
      ? rows.map((r) => Number(r[opts.allianceField] || 0))
      : [];

    const allVals = [...playerVals, ...allianceVals].filter(Number.isFinite);

    const rawMax = Math.max(...allVals, opts.suggestedMax ?? 0);
    const rawMin = Math.min(...allVals, opts.suggestedMin ?? 0);

    let maxY =
      opts.maxY !== undefined
        ? opts.maxY
        : niceMax(rawMax, opts.suggestedMax || 100);

    let minY =
      opts.minY !== undefined
        ? opts.minY
        : niceMin(rawMin);

    if (minY === maxY) {
      maxY = maxY + 1;
      minY = Math.min(0, minY - 1);
    }

    const x = (i) =>
      rows.length === 1
        ? pad.left + plotW / 2
        : pad.left + (plotW * i) / (rows.length - 1);

    const y = (v) =>
      pad.top +
      plotH -
      ((Number(v || 0) - minY) / Math.max(1, maxY - minY)) * plotH;

    const playerPoints = rows.map((r, i) => ({
      x: x(i),
      y: y(r[opts.playerField]),
      value: Number(r[opts.playerField] || 0),
    }));

    const alliancePoints = opts.allianceField
      ? rows.map((r, i) => ({
          x: x(i),
          y: y(r[opts.allianceField]),
          value: Number(r[opts.allianceField] || 0),
        }))
      : [];

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: minY + (maxY - minY) * ratio,
      y: y(minY + (maxY - minY) * ratio),
    }));

    const dateStep = Math.max(1, Math.ceil(rows.length / 5));
    const bandsSvg = renderBandsSvg(opts, y, pad, plotW, minY, maxY);

    mount.innerHTML = `
      <svg class="chartSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(
        opts.title || "Graphique"
      )}">
        ${bandsSvg}

        ${ticks
          .map(
            (t) => `
              <line class="chartGridLine" x1="${pad.left}" y1="${t.y}" x2="${
                width - pad.right
              }" y2="${t.y}"/>
              <text class="chartText" x="${pad.left - 9}" y="${
                t.y + 4
              }" text-anchor="end">${axisValue(t.value, opts)}</text>
            `
          )
          .join("")}

        <line class="chartAxis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${
          height - pad.bottom
        }"/>
        <line class="chartAxis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${
          width - pad.right
        }" y2="${height - pad.bottom}"/>

        ${
          alliancePoints.length
            ? `<path class="lineAlliance" d="${pathFrom(alliancePoints)}"/>`
            : ""
        }

        <path class="linePlayer" d="${pathFrom(playerPoints)}"/>

        ${playerPoints
          .map(
            (p, i) => `
              <circle class="pointPlayer" cx="${p.x}" cy="${p.y}" r="4.5">
                <title>${esc(rows[i].date)} — ${pointValue(p.value, opts)}</title>
              </circle>
            `
          )
          .join("")}

        ${rows
          .map((r, i) =>
            i === 0 || i === rows.length - 1 || i % dateStep === 0
              ? `<text class="chartDate" x="${x(i)}" y="${height - 22}" text-anchor="middle">${esc(
                  shortDate(r.date)
                )}</text>`
              : ""
          )
          .join("")}
      </svg>
    `;
  }

  function renderCharts() {
    const alliance = $allianceSelect.value;
    const player = $playerSelect.value;

    const fullSeries = seriesForPlayer(alliance, player);
    const series = applyWarRange(fullSeries);

    renderSummary(series, player, alliance, fullSeries.length);

    if (!series.length) {
      Object.values(mounts).forEach((m) => emptyChart(m, "Aucune donnée disponible."));
      return;
    }

    draw(mounts.score, {
      title: "Note / 100 par GA",
      rows: series,
      playerField: "score_total",
      allianceField: "alliance_avg_score",
      maxY: 100,
      bands: CHART_BANDS.score,
    });

    draw(mounts.scoreGap, {
      title: "Écart avec la note moyenne de l'alliance par GA",
      rows: series,
      playerField: "score_gap",
      allianceField: "alliance_score_gap",
      suggestedMin: -30,
      suggestedMax: 30,
      bands: CHART_BANDS.scoreGap,
    });

    draw(mounts.attacks, {
      title: "Attaques par GA",
      rows: series,
      playerField: "attacks",
      allianceField: "alliance_avg_attacks",
      maxY: 14,
      bands: CHART_BANDS.attacks,
    });

    draw(mounts.misses, {
      title: "Ratés par GA",
      rows: series,
      playerField: "misses",
      allianceField: "alliance_avg_misses",
      suggestedMax: 6,
      bands: CHART_BANDS.misses,
    });

    draw(mounts.success, {
      title: "Pourcentage de Réussite par GA",
      rows: series,
      playerField: "success_rate",
      allianceField: "alliance_avg_success_rate",
      maxY: 100,
      percent: true,
      bands: CHART_BANDS.success,
    });

    draw(mounts.impact, {
      title: "Score d'impact / 35 par GA",
      rows: series,
      playerField: "score_impact",
      allianceField: "alliance_avg_impact",
      maxY: 35,
      bands: CHART_BANDS.impact,
    });

    const damageMax = Math.max(
      ...series.map((r) => Number(r.damage || 0)),
      ...series.map((r) => Number(r.alliance_avg_damage || 0)),
      1
    );

    draw(mounts.damage, {
      title: "Dégâts par GA",
      rows: series,
      playerField: "damage",
      allianceField: "alliance_avg_damage",
      suggestedMax: niceMax(damageMax * 1.15, 1_000_000_000),
      compact: true,
      decimals: 0,
      bands: CHART_BANDS.damage,
    });

    const damageShareMax = Math.max(
      ...series.map((r) => Number(r.damage_share_pct || 0)),
      ...series.map((r) => Number(r.alliance_avg_damage_share_pct || 0)),
      8
    );

    draw(mounts.damageShare, {
      title: "Part des dégâts d'alliance par GA",
      rows: series,
      playerField: "damage_share_pct",
      allianceField: "alliance_avg_damage_share_pct",
      suggestedMax: niceMax(damageShareMax * 1.15, 10),
      percent: true,
      bands: CHART_BANDS.damageShare,
    });

    draw(mounts.defenseWins, {
      title: "Victoires défense par GA",
      rows: series,
      playerField: "defense_wins",
      allianceField: "alliance_avg_defense_wins",
      suggestedMax: 6,
      bands: CHART_BANDS.defenseWins,
    });

    draw(mounts.deviations, {
      title: "Bonus défensif posé par GA",
      rows: series,
      playerField: "deviations",
      allianceField: "alliance_avg_deviations",
      suggestedMax: 6,
      bands: CHART_BANDS.deviations,
    });
  }

  function applyUrlDefaults() {
    const params = new URLSearchParams(window.location.search);
    const wantedAlliance = allianceKey(params.get("alliance"));
    const wantedPlayer = params.get("player");
    const wantedRange = normalizeWarRange(params.get("range"));

    setWarRange(wantedRange);

    if (!wantedAlliance) return false;

    const allianceOption = findAllianceOptionByKey(wantedAlliance);
    if (!allianceOption) return false;

    $allianceSelect.value = allianceOption.value;

    renderPlayerSelect({
      preferAuth: false,
      preservePrevious: false,
    });

    if (wantedPlayer) {
      selectPlayerByName(wantedPlayer);
    }

    renderCharts();
    return true;
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    $allianceSelect.addEventListener("change", () => {
      authDefaultsApplied = true;

      renderPlayerSelect({
        preferAuth: true,
        preservePrevious: false,
      });

      saveStoredPlayerForAlliance($allianceSelect.value, $playerSelect.value);
      renderCharts();
    });

    $allianceSelect.addEventListener("input", () => {
      authDefaultsApplied = true;

      renderPlayerSelect({
        preferAuth: true,
        preservePrevious: false,
      });

      saveStoredPlayerForAlliance($allianceSelect.value, $playerSelect.value);
      renderCharts();
    });

    $playerSelect.addEventListener("change", () => {
      authDefaultsApplied = true;

      saveStoredPlayerForAlliance($allianceSelect.value, $playerSelect.value);
      renderCharts();
    });

    $playerSelect.addEventListener("input", () => {
      authDefaultsApplied = true;

      saveStoredPlayerForAlliance($allianceSelect.value, $playerSelect.value);
      renderCharts();
    });

    $warRangeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setWarRange(button.dataset.range, { render: true });
      });
    });
  }

  async function init() {
    try {
      setWarRange("all");

      await loadPlayerAliases();
      await loadWarStats();
      await loadCurrentPlayers();
      await loadPlayerAvatars();

      const data = await fetchJson(FILES.history);

      if (!Array.isArray(data)) {
        throw new Error("war-history-lite.json is not an array");
      }

      warHistory = data
        .map((w) => ({
          ...w,
          alliance: allianceKey(w.alliance),
          date: String(w.date || ""),
          players: Array.isArray(w.players) ? w.players : [],
        }))
        .filter((w) => w.date && w.alliance);

      bindEvents();

      const urlApplied = applyUrlDefaults();

      if (!urlApplied) {
        renderPlayerSelect({
          preferAuth: false,
          preservePrevious: false,
        });
      }

      bootReady = true;

      if (!urlApplied && !tryApplyAuthDefaults()) {
        renderCharts();
      }
    } catch (error) {
      console.error("[war-graphs] init error:", error);

      $playerTitle.textContent = "Erreur";
      $playerSubtitle.innerHTML = `Impossible de charger <code>data/war-history-lite.json</code>`;
      $warsCount.textContent = "0";
      $summaryStats.innerHTML = "";

      Object.values(mounts).forEach((m) =>
        emptyChart(m, `Erreur : ${error?.message || error}`)
      );
    }
  }

  init();
})();