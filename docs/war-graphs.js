/* docs/war-graphs.js */
(() => {
  const AUTH_PLAYER_STORAGE_KEY = "losp:lastPlayerByAlliance";
  const LOCAL_SESSION_KEY = "losp_session";

  const FILES = {
    history: "./data/war-history-lite.json",
    infos: "./data/infos.json",
    aliases: "./data/player-aliases.json",
    joueurs: "./data/joueurs.json",
  };

  const $allianceSelect = document.getElementById("allianceSelect");
  const $playerSelect = document.getElementById("playerSelect");
  const $playerTitle = document.getElementById("playerTitle");
  const $playerSubtitle = document.getElementById("playerSubtitle");
  const $warsCount = document.getElementById("warsCount");
  const $summaryStats = document.getElementById("summaryStats");

  const mounts = {
    score: document.getElementById("chartScore"),
    success: document.getElementById("chartSuccess"),
    impact: document.getElementById("chartImpact"),
    damageShare: document.getElementById("chartDamageShare"),
  };

  if (
    !$allianceSelect ||
    !$playerSelect ||
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

  let warHistory = [];
  let avatarByPlayer = new Map();
  let playerAliases = new Map();
  let currentPlayersByAlliance = new Map();

  let lospSession = window.LoSP_SESSION || readLocalSessionPayload() || null;
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

  function fmt(v, d = 1) {
    return Number(v || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
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
        dionysos: currentPlayersByAlliance.get("dionysos")?.size || 0,
        poseidon: currentPlayersByAlliance.get("poseidon")?.size || 0,
        kronos: currentPlayersByAlliance.get("kronos")?.size || 0,
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

        return {
          date: war.date,

          score_total: Number(p.score_total || 0),
          alliance_avg_score: Number(war.alliance_avg_score || 0),

          success_rate: Number(p.success_rate || 0),
          alliance_avg_success_rate: Number(war.alliance_avg_success_rate || 0),

          score_impact: Number(p.score_impact || 0),
          alliance_avg_impact: Number(war.alliance_avg_impact || 0),

          damage_share_pct: Number(p.damage_share_pct || 0),
          alliance_avg_damage_share_pct: Number(war.alliance_avg_damage_share_pct || 0),

          rank: Number(p.rank || 0),
          player_count: Number(p.player_count || war.player_count || 0),

          attacks: Number(p.attacks || 0),
          successful_attacks: Number(p.successful_attacks || 0),
          misses: Number(p.misses || 0),

          defense_wins: Number(p.defense_wins || 0),
          deviations: Number(p.deviations || 0),
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

  function renderSummary(series, playerName, alliance) {
    const wars = series.length;
    const allianceKeyValue = allianceKey(alliance);
    const emoji = EMOJI[allianceKeyValue] || "👤";
    const allianceLabel = LABEL[allianceKeyValue] || "Alliance";
    const canonicalName = canonicalPlayerName(playerName);

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

    $playerSubtitle.textContent =
      `${allianceLabel} • ${wars} guerre${wars > 1 ? "s" : ""} analysée${wars > 1 ? "s" : ""}`;

    $summaryStats.innerHTML = `
      <div class="statPill ${scoreClass(avgScore)}">
        <div class="statValue">${fmt(avgScore, 1)}</div>
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
        <div class="statValue">${fmt(avgImpact, 1)}</div>
        <div class="statLabel">impact moyen</div>
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

    return Math.ceil(n / 25) * 25;
  }

  function pathFrom(points) {
    if (!points.length) return "";

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.01} ${points[0].y}`;
    }

    return points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  }

  function draw(mount, opts) {
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

    const maxY =
      opts.maxY ||
      niceMax(
        Math.max(...playerVals, ...allianceVals, opts.suggestedMax || 0),
        opts.suggestedMax || 100
      );

    const minY = opts.minY || 0;

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

    const axisValue = (v) => (opts.percent ? `${Math.round(v)}%` : String(Math.round(v)));
    const val = (v) => (opts.percent ? `${fmt(v, 1)} %` : fmt(v, 1));

    mount.innerHTML = `
      <svg class="chartSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(
        opts.title || "Graphique"
      )}">
        ${ticks
          .map(
            (t) => `
              <line class="chartGridLine" x1="${pad.left}" y1="${t.y}" x2="${
                width - pad.right
              }" y2="${t.y}"/>
              <text class="chartText" x="${pad.left - 9}" y="${
                t.y + 4
              }" text-anchor="end">${axisValue(t.value)}</text>
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
                <title>${esc(rows[i].date)} — ${val(p.value)}</title>
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
    const series = seriesForPlayer(alliance, player);

    renderSummary(series, player, alliance);

    if (!series.length) {
      Object.values(mounts).forEach((m) => emptyChart(m, "Aucune donnée disponible."));
      return;
    }

    draw(mounts.score, {
      title: "Note vs moyenne alliance",
      rows: series,
      playerField: "score_total",
      allianceField: "alliance_avg_score",
      maxY: 100,
    });

    draw(mounts.success, {
      title: "Taux de réussite vs moyenne alliance",
      rows: series,
      playerField: "success_rate",
      allianceField: "alliance_avg_success_rate",
      maxY: 100,
      percent: true,
    });

    draw(mounts.impact, {
      title: "Impact vs moyenne alliance",
      rows: series,
      playerField: "score_impact",
      allianceField: "alliance_avg_impact",
      maxY: 35,
    });

    const dmgMax = Math.max(
      ...series.map((r) => Number(r.damage_share_pct || 0)),
      ...series.map((r) => Number(r.alliance_avg_damage_share_pct || 0)),
      8
    );

    draw(mounts.damageShare, {
      title: "Damage share %",
      rows: series,
      playerField: "damage_share_pct",
      allianceField: "alliance_avg_damage_share_pct",
      suggestedMax: niceMax(dmgMax * 1.15, 10),
      percent: true,
    });
  }

  function applyUrlDefaults() {
    const params = new URLSearchParams(window.location.search);
    const wantedAlliance = allianceKey(params.get("alliance"));
    const wantedPlayer = params.get("player");

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
  }

  async function init() {
    try {
      await loadPlayerAliases();
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