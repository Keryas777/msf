// docs/war-attack-checker.js
(() => {
  const USAGE_LOGGER_URL =
    "https://script.google.com/macros/s/AKfycbzTdFi7gEgRVCKjK2UBwFcQIlIzi2jp4eeO2ryR36sSrcy3QtzfEK8k7kNSXSJOGmFAbw/exec";

  const FILES = {
    alliances: "./data/alliances.json",
    warCounters: "./data/war-counters.json",
    warSeasonRules: "./data/war-season-rules.json",
    joueurs: "./data/joueurs.json",
    characters: "./data/msf-characters.json",
    rosters: "./data/rosters.json",
  };

  const AUTH_PLAYER_STORAGE_KEY = "losp:lastAttackCheckerPlayerByAlliance";
  const LOCAL_SESSION_KEY = "losp_session";

  const qs = (s) => document.querySelector(s);

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");
  const atkFamilySelect = qs("#atkFamilySelect");
  const atkVariantSelect = qs("#atkVariantSelect");

  const atkTitle = qs("#atkTitle");
  const atkSubtitle = qs("#atkSubtitle");
  const atkPortraits = qs("#atkPortraits");

  const resultsWrap = qs("#results");
  const resultsCount = qs("#resultsCount");
  const playerChip = qs("#playerChip");

  // ---------- Auth session / auto-selection ----------
  let lospSession = window.LoSP_SESSION || readLocalSessionPayload() || null;
  let authDefaultsApplied = false;
  let bootReady = false;

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

  window.addEventListener("losp:auth-ready", (event) => {
    lospSession = event.detail || window.LoSP_SESSION || readLocalSessionPayload() || null;

    if (bootReady) {
      authDefaultsApplied = false;
      renderAllianceOptions();
      renderPlayerOptions();
      tryApplyAuthDefaults({ force: true });
    }
  });

  // ---------- Utils ----------
  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function trackUsage(payload) {
    if (!USAGE_LOGGER_URL) return;

    fetch(USAGE_LOGGER_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_‐-‒–—―﹘﹣－]/g, "")
      .replace(/[’'`´]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  let ALLIANCES = [];
  let ALLIANCE_BY_KEY = new Map();
  let ALLIANCE_ALIAS_TO_KEY = new Map();
  let ORDER_KEYS = [];

  function normalizeAllianceData(data) {
    const rows = Array.isArray(data) ? data : [];

    return rows
      .map((a) => {
        const key = normalizeKey(a?.key);
        const name = (a?.name ?? "").toString().trim();
        const emoji = (a?.emoji ?? "").toString().trim();
        const color = (a?.color ?? "").toString().trim();
        const order = Number(a?.order) || 999;
        const aliases = Array.isArray(a?.aliases) ? a.aliases : [];

        if (!key || !name) return null;

        return {
          key,
          name,
          emoji,
          color,
          order,
          aliases: [...new Set([name, key, ...aliases].filter(Boolean))],
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, "fr");
      });
  }

  function buildAllianceMaps(data) {
    ALLIANCES = normalizeAllianceData(data);
    ALLIANCE_BY_KEY = new Map();
    ALLIANCE_ALIAS_TO_KEY = new Map();

    ALLIANCES.forEach((alliance) => {
      ALLIANCE_BY_KEY.set(alliance.key, alliance);

      [alliance.key, alliance.name, ...(alliance.aliases || [])].forEach((value) => {
        const aliasKey = normalizeKey(value);
        if (!aliasKey) return;
        ALLIANCE_ALIAS_TO_KEY.set(aliasKey, alliance.key);
      });
    });

    ORDER_KEYS = ALLIANCES.map((a) => a.key);
  }

  function allianceKey(value) {
    const key = normalizeKey(value);

    if (ALLIANCE_ALIAS_TO_KEY.has(key)) {
      return ALLIANCE_ALIAS_TO_KEY.get(key);
    }

    if (key === "poseidon" || key === "posseidon") return "poseidon";
    if (key === "dionysos") return "dionysos";
    if (key === "zeus") return "zeus";
    if (key === "kronos" || key === "lospkronos") return "kronos";
    if (key === "hades" || key === "losphades") return "hades";

    return key;
  }

  function getAllianceMeta(value) {
    return ALLIANCE_BY_KEY.get(allianceKey(value)) || null;
  }

  function getAllianceEmoji(value) {
    return getAllianceMeta(value)?.emoji || "•";
  }

  function normalizeTextForMatch(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatApproxPower(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return "—";
    return formatThousandsDot(Math.round(num));
  }

  function safeRatioValue(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function computeEnemyPowerFromRatio(attackPower, ratio) {
    const atk = Number(attackPower) || 0;
    const r = safeRatioValue(ratio);
    if (atk <= 0 || r <= 0) return 0;
    return Math.round(atk / r);
  }

  function createThresholdLines(row, attackPower) {
    const hard = safeRatioValue(row?.min_hard);
    const ok = safeRatioValue(row?.min_ok);
    const safe = safeRatioValue(row?.min_safe);

    const lines = [];

    if (safe > 0) {
      const val = computeEnemyPowerFromRatio(attackPower, safe);
      lines.push({
        emoji: "🟢",
        label: "Sûr",
        value: `Inf. à ${formatApproxPower(val)}`,
      });
    }

    if (ok > 0) {
      const val = computeEnemyPowerFromRatio(attackPower, ok);
      lines.push({
        emoji: "🟡",
        label: "Passe",
        value: `Jusqu'à ${formatApproxPower(val)}`,
      });
    }

    if (hard > 0) {
      const val = computeEnemyPowerFromRatio(attackPower, hard);
      lines.push({
        emoji: "🟠",
        label: "Risqué",
        value: `Jusqu'à ${formatApproxPower(val)}`,
      });
    }

    if (hard > 0) {
      const val = computeEnemyPowerFromRatio(attackPower, hard) + 1;
      lines.push({
        emoji: "🔴",
        label: "Éviter",
        value: `Sup. à ${formatApproxPower(val)}`,
      });
    } else {
      lines.push({
        emoji: "🔴",
        label: "Éviter",
        value: "",
      });
    }

    return lines;
  }

  // ---------- Auth helpers ----------
  function hasUsableSession(session) {
    return !!session && (
      session.ok === true ||
      Array.isArray(session.alliances) ||
      Array.isArray(session.players)
    );
  }

  function getAllowedAllianceKeys() {
    if (!hasUsableSession(lospSession)) return null;
    if (!Array.isArray(lospSession.alliances) || !lospSession.alliances.length) return null;

    return new Set(lospSession.alliances.map((a) => allianceKey(a)).filter(Boolean));
  }

  function isAllianceAllowed(alliance) {
    const allowedKeys = getAllowedAllianceKeys();
    if (!allowedKeys) return true;

    return allowedKeys.has(allianceKey(alliance));
  }

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

  function findAllianceOptionByKey(key) {
    if (!key || !allianceSelect) return null;

    return Array.from(allianceSelect.options).find((option) => {
      if (!option.value) return false;
      return allianceKey(option.value) === key || allianceKey(option.textContent) === key;
    });
  }

  function findBestAllianceOptionFromSession() {
    if (!allianceSelect) return null;

    const preferenceKeys = getSessionAlliancePreferenceKeys();

    for (const key of preferenceKeys) {
      const option = findAllianceOptionByKey(key);
      if (option) return option;
    }

    return Array.from(allianceSelect.options).find((option) => option.value) || null;
  }

  function getSessionPlayerForAlliance(session, alliance) {
    const allianceK = allianceKey(alliance);

    if (!hasUsableSession(session) || !Array.isArray(session.players)) return null;

    const matchingPlayer = session.players.find(
      (player) => allianceKey(player.alliance) === allianceK
    );

    if (matchingPlayer) return matchingPlayer;

    return session.players.length === 1 ? session.players[0] : null;
  }

  function findPlayerOptionByName(name) {
    if (!name || !playerSelect) return null;

    const wanted = normalizeTextForMatch(name);
    const wantedKey = normalizeKey(name);

    return Array.from(playerSelect.options).find((option) => {
      if (!option.value) return false;

      return (
        normalizeTextForMatch(option.value) === wanted ||
        normalizeTextForMatch(option.textContent) === wanted ||
        normalizeKey(option.value) === wantedKey ||
        normalizeKey(option.textContent) === wantedKey
      );
    });
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
    const playerName = (player ?? "").toString().trim();

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

  function selectPlayerByName(name, options = {}) {
    const shouldDispatch = options.dispatch !== false;
    const option = findPlayerOptionByName(name);

    if (!option) return false;

    playerSelect.value = option.value;

    if (shouldDispatch) {
      playerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return true;
  }

  function selectBestPlayerForCurrentAlliance(options = {}) {
    if (!playerSelect || !allianceSelect) return false;

    const alliance = (allianceSelect.value ?? "").trim();
    if (!alliance) return false;

    const sessionPlayer = getSessionPlayerForAlliance(lospSession, alliance);

    if (sessionPlayer?.name && selectPlayerByName(sessionPlayer.name, options)) {
      return true;
    }

    const storedPlayer = getStoredPlayerForAlliance(alliance);
    if (storedPlayer && selectPlayerByName(storedPlayer, options)) {
      return true;
    }

    const candidateNames = [
      lospSession?.displayName,
      lospSession?.global_name,
      lospSession?.username,
    ].filter(Boolean);

    for (const name of candidateNames) {
      if (selectPlayerByName(name, options)) return true;
    }

    return false;
  }

  function tryApplyAuthDefaults(options = {}) {
    const force = options.force === true;

    refreshLoSPSession();

    if (authDefaultsApplied && !force) return false;
    if (!hasUsableSession(lospSession)) return false;
    if (!allianceSelect || !playerSelect) return false;
    if (!allianceSelect.options.length) return false;

    const allianceOption = findBestAllianceOptionFromSession();

    if (!allianceOption) return false;

    allianceSelect.value = allianceOption.value;

    renderPlayerOptions();

    const didSelectPlayer = selectBestPlayerForCurrentAlliance({
      dispatch: false,
    });

    authDefaultsApplied = true;

    if (didSelectPlayer) {
      saveStoredPlayerForAlliance(allianceSelect.value, playerSelect.value);
    }

    renderAll();

    return true;
  }

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map();
  let PLAYERS_BY_ALLIANCE = new Map();
  let CHAR_MAP = new Map();
  let LAST_TRACKED_KEY = "";
  let WAR_SEASON_RULES = {
    defaultMultiplier: 1.17,
    rules: [],
  };

  // ---------- PARSING ----------
  function normalizeWarRow(r) {
    return {
      atk_family: (r.atk_family ?? "").toString().trim(),
      atk_team: (r.atk_team ?? "").toString().trim(),
      atk_key: (r.atk_key ?? "").toString().trim(),

      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map((x) =>
        (x ?? "").toString().trim()
      ),

      def_family: (r.def_family ?? "").toString().trim(),
      def_variant: (r.def_variant ?? "").toString().trim(),
      def_key: (r.def_key ?? "").toString().trim(),

      def_chars: [r.def_char1, r.def_char2, r.def_char3, r.def_char4, r.def_char5]
        .map((x) => (x ?? "").toString().trim())
        .filter(Boolean),

      min_hard: parseFloat(String(r.min_ratio_hard ?? "").replace(",", ".")) || 0,
      min_ok: parseFloat(String(r.min_ratio_ok ?? "").replace(",", ".")) || 0,
      min_safe: parseFloat(String(r.min_ratio_safe ?? "").replace(",", ".")) || 0,

      notes: (r.notes ?? "").toString().trim(),
    };
  }

  function isRealDefense(r) {
    return Boolean((r.def_variant || "").trim() || (r.def_family || "").trim());
  }

  function normalizeSeasonRules(data) {
    const defaultMultiplier = Number(data?.defaultMultiplier) || 1.17;

    const rules = Array.isArray(data?.rules)
      ? data.rules
          .filter((r) => r && r.active !== false)
          .map((r) => ({
            active: true,
            ruleKey: (r.ruleKey ?? "").toString().trim(),
            label: (r.label ?? "").toString().trim(),
            multiplier: Number(r.multiplier) || defaultMultiplier,
            requiredCount: Number(r.requiredCount) || 5,
            membersNormalized: new Set(
              (Array.isArray(r.members) ? r.members : [])
                .map((m) => normalizeKey(m))
                .filter(Boolean)
            ),
          }))
      : [];

    return {
      defaultMultiplier,
      rules,
    };
  }

  // ---------- CHAR ----------
  function buildCharMap(chars) {
    CHAR_MAP = new Map();

    (Array.isArray(chars) ? chars : []).forEach((c) => {
      [c?.id, c?.nameKey, c?.nameFr, c?.nameEn]
        .filter(Boolean)
        .forEach((k) => {
          const kk = normalizeKey(k);
          if (!kk) return;
          if (!CHAR_MAP.has(kk)) CHAR_MAP.set(kk, c);
        });
    });
  }

  function getPortrait(name) {
    const c = CHAR_MAP.get(normalizeKey(name));
    return c?.portraitUrl || c?.portrait || c?.iconUrl || "";
  }

  // ---------- ROSTER ----------
  function buildRosterMap(data) {
    ROSTERS = new Map();

    (Array.isArray(data) ? data : []).forEach((r) => {
      const player = (r.player ?? "").toString().trim();
      if (!player) return;

      const playerKey = normalizeKey(player);
      if (!playerKey) return;

      const map = {};
      const chars = r.chars && typeof r.chars === "object" ? r.chars : {};

      Object.entries(chars).forEach(([k, v]) => {
        const kk = normalizeKey(k);
        if (!kk) return;
        map[kk] = typeof v === "object" ? Number(v.power) || 0 : Number(v) || 0;
      });

      ROSTERS.set(playerKey, map);
    });
  }

  function getPlayerRawPower(player, chars) {
    const playerKey = normalizeKey(player);
    const roster = ROSTERS.get(playerKey);

    if (!roster) return 0;

    return (Array.isArray(chars) ? chars : [])
      .filter((c) => (c || "").trim())
      .reduce((sum, c) => {
        const charKey = normalizeKey(c);
        return sum + (roster[charKey] || 0);
      }, 0);
  }

  function getMatchingSeasonRule(teamMembers) {
    const selected = (Array.isArray(teamMembers) ? teamMembers : [])
      .filter((c) => (c || "").trim())
      .map((c) => normalizeKey(c));

    if (!selected.length) return null;

    const rules = Array.isArray(WAR_SEASON_RULES?.rules) ? WAR_SEASON_RULES.rules : [];

    for (const rule of rules) {
      const requiredCount = Number(rule.requiredCount) || 5;
      if (selected.length !== requiredCount) continue;

      const matchCount = selected.filter((member) => rule.membersNormalized.has(member)).length;

      if (matchCount === requiredCount) {
        return rule;
      }
    }

    return null;
  }

  function getWarAdjustedPower(player, teamMembers) {
    const rawPower = getPlayerRawPower(player, teamMembers);
    const defaultMultiplier = Number(WAR_SEASON_RULES?.defaultMultiplier) || 1.17;
    const matchedRule = getMatchingSeasonRule(teamMembers);
    const multiplier = matchedRule
      ? Number(matchedRule.multiplier) || defaultMultiplier
      : defaultMultiplier;

    return Math.round(rawPower * multiplier);
  }

  // ---------- SELECTS ----------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();

    (Array.isArray(JOUEURS) ? JOUEURS : []).forEach((j) => {
      const a = (j.alliance ?? "").toString().trim();
      const p = (j.player ?? "").toString().trim();
      if (!a || !p) return;

      if (!PLAYERS_BY_ALLIANCE.has(a)) PLAYERS_BY_ALLIANCE.set(a, []);
      PLAYERS_BY_ALLIANCE.get(a).push({ alliance: a, player: p });
    });
  }

  function renderAllianceOptions() {
    if (!allianceSelect) return;

    const previousValue = allianceSelect.value;
    allianceSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une alliance —";
    allianceSelect.appendChild(opt0);

    const alliances = [
      ...new Set(JOUEURS.map((j) => (j.alliance ?? "").toString().trim()).filter(Boolean)),
    ];

    alliances
      .filter((a) => isAllianceAllowed(a))
      .sort((a, b) => {
        const ia = ORDER_KEYS.indexOf(allianceKey(a));
        const ib = ORDER_KEYS.indexOf(allianceKey(b));

        if (ia !== -1 || ib !== -1) {
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        }

        return a.localeCompare(b, "fr");
      })
      .forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = `${getAllianceEmoji(a)} ${a}`.trim();
        allianceSelect.appendChild(opt);
      });

    const previousStillExists = Array.from(allianceSelect.options).some(
      (option) => option.value === previousValue
    );

    if (previousStillExists) {
      allianceSelect.value = previousValue;
    }
  }

  function renderPlayerOptions() {
    if (!playerSelect) return;

    const a = (allianceSelect?.value ?? "").trim();
    playerSelect.innerHTML = "";

    if (!a) {
      playerSelect.disabled = true;
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choisir une alliance d’abord —";
      playerSelect.appendChild(opt);
      return;
    }

    playerSelect.disabled = false;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un joueur —";
    playerSelect.appendChild(opt0);

    const players = (PLAYERS_BY_ALLIANCE.get(a) || [])
      .slice()
      .sort((x, y) => x.player.localeCompare(y.player, "fr"));

    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.player;
      opt.textContent = p.player;
      playerSelect.appendChild(opt);
    });
  }

  function renderAtkFamilyOptions() {
    if (!atkFamilySelect) return;
    atkFamilySelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une team générique —";
    atkFamilySelect.appendChild(opt0);

    const families = [...new Set(WAR.map((r) => r.atk_family).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr")
    );

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      atkFamilySelect.appendChild(opt);
    });
  }

  function renderAtkVariantOptions() {
    if (!atkVariantSelect) return;

    const fam = (atkFamilySelect?.value ?? "").trim();
    atkVariantSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

    if (!fam) {
      opt0.textContent = "— Choisir une team générique d’abord —";
      atkVariantSelect.appendChild(opt0);
      atkVariantSelect.disabled = true;
      atkVariantSelect.value = "";
      return;
    }

    atkVariantSelect.disabled = false;
    opt0.textContent = "— Choisir une variante —";
    atkVariantSelect.appendChild(opt0);

    const variants = WAR.filter((r) => r.atk_family === fam)
      .map((r) => r.atk_team)
      .filter(Boolean);

    [...new Set(variants)]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        atkVariantSelect.appendChild(opt);
      });
  }

  function getSelectedAtk() {
    const fam = (atkFamilySelect?.value ?? "").trim();
    const vari = (atkVariantSelect?.value ?? "").trim();

    if (!fam || !vari) return null;

    return (
      WAR.find(
        (r) =>
          normalizeKey(r.atk_family) === normalizeKey(fam) &&
          normalizeKey(r.atk_team) === normalizeKey(vari)
      ) || null
    );
  }

  // ---------- UI ----------
  function renderAttack() {
    clearNode(atkPortraits);

    const row = getSelectedAtk();
    const player = (playerSelect?.value ?? "").trim();

    if (!row) {
      if (atkTitle) atkTitle.textContent = "—";
      if (atkSubtitle) atkSubtitle.textContent = "—";
      return;
    }

    if (atkTitle) atkTitle.textContent = row.atk_team || row.atk_family || "Attaque";

    const atkChars = (row.atk_chars || []).filter((c) => (c || "").trim());
    const power = player ? getWarAdjustedPower(player, atkChars) : 0;

    if (atkSubtitle) {
      atkSubtitle.textContent = player && power > 0 ? `Environ ${formatThousandsDot(power)}` : "—";
    }

    row.atk_chars.forEach((name) => {
      if (!name) return;

      const card = document.createElement("div");
      card.className = "portraitCard";
      card.title = name;

      const img = document.createElement("img");
      img.src = getPortrait(name) || "";
      img.className = "portraitImg";
      img.alt = name;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

      img.onerror = () => {
        img.remove();
        const t = document.createElement("div");
        t.className = "portraitFallback";
        t.textContent = name;
        card.appendChild(t);
      };

      card.appendChild(img);
      atkPortraits.appendChild(card);
    });
  }

  function getClass(ratio, r) {
    const hard = safeRatioValue(r.min_hard);
    const ok = safeRatioValue(r.min_ok);
    const safe = safeRatioValue(r.min_safe);

    if (!hard && !ok && !safe) return ratio >= 1 ? "is-yellow" : "is-red";

    if (safe && ratio >= safe) return "is-green";
    if (ok && ratio >= ok) return "is-yellow";
    if (hard && ratio >= hard) return "is-orange";
    return "is-red";
  }

  function makeCounterCard({ teamName, attackPower, cls, portraits, row, notes }) {
    const card = document.createElement("div");
    card.className = `counterCard ${cls}`.trim();

    const top = document.createElement("div");
    top.className = "counterTop";

    const left = document.createElement("div");
    left.className = "counterName";
    left.textContent = teamName || "Défense";

    top.appendChild(left);
    card.appendChild(top);

    const right = document.createElement("div");
    right.className = "counterRight";

    const levels = document.createElement("div");
    levels.className = "counterThresholds";

    const thresholdLines = createThresholdLines(row, attackPower);

    thresholdLines.forEach((line) => {
      const rowEl = document.createElement("div");
      rowEl.className = "counterThresholdRow";

      const leftEl = document.createElement("div");
      leftEl.className = "counterThresholdLabel";
      leftEl.textContent = `${line.emoji} ${line.label}`;

      const rightEl = document.createElement("div");
      rightEl.className = "counterThresholdValue";
      rightEl.textContent = line.value;

      rowEl.appendChild(leftEl);
      rowEl.appendChild(rightEl);
      levels.appendChild(rowEl);
    });

    right.appendChild(levels);
    card.appendChild(right);

    const wrap = document.createElement("div");
    wrap.className = "counterPortraits";

    portraits.forEach((src, idx) => {
      const p = document.createElement("div");
      p.className = "counterPortrait";
      p.title = `p${idx + 1}`;

      const img = document.createElement("img");
      img.className = "counterPortraitImg";
      img.alt = `p${idx + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = src || "";

      p.appendChild(img);
      wrap.appendChild(p);
    });

    card.appendChild(wrap);

    const noteText = (notes ?? "").toString().trim();

    if (noteText) {
      const note = document.createElement("div");
      note.textContent = noteText;
      note.setAttribute("aria-label", "Notes");
      note.style.marginTop = "6px";
      note.style.fontSize = "12px";
      note.style.fontStyle = "italic";
      note.style.lineHeight = "1.25";
      note.style.color = "rgba(255,255,255,.70)";
      card.appendChild(note);
    }

    return card;
  }

  function renderResults() {
    clearNode(resultsWrap);

    const atk = getSelectedAtk();
    const player = (playerSelect?.value ?? "").trim();

    if (!atk) {
      if (resultsCount) resultsCount.textContent = "0";
      if (playerChip) playerChip.textContent = player || "—";
      return;
    }

    if (!player) {
      if (resultsCount) resultsCount.textContent = "0";
      if (playerChip) playerChip.textContent = "—";
      const hint = document.createElement("p");
      hint.className = "subtitle";
      hint.textContent = "Choisis un joueur pour afficher les défenses battables.";
      resultsWrap.appendChild(hint);
      return;
    }

    const atkChars = (atk.atk_chars || []).filter((c) => (c || "").trim());
    const attackPower = getWarAdjustedPower(player, atkChars);

    if (playerChip) playerChip.textContent = player;

    const baseRows = WAR.filter(
      (r) =>
        normalizeKey(r.atk_family) === normalizeKey(atk.atk_family) &&
        normalizeKey(r.atk_team) === normalizeKey(atk.atk_team)
    ).filter(isRealDefense);

    if (!baseRows.length) {
      if (resultsCount) resultsCount.textContent = "0";
      resultsWrap.innerHTML = `<p class="subtitle">Aucune défense renseignée pour cette attaque.</p>`;
      return;
    }

    const trackKey = JSON.stringify({
      page: "war-attack-checker",
      alliance: (allianceSelect?.value ?? "").trim(),
      player,
      attack_family: atk.atk_family || "",
      attack_team: atk.atk_team || "",
    });

    if (trackKey !== LAST_TRACKED_KEY) {
      LAST_TRACKED_KEY = trackKey;

      trackUsage({
        page: "war-attack-checker",
        event_type: "attack_checker_search",
        alliance: (allianceSelect?.value ?? "").trim(),
        player,
        attack_family: atk.atk_family || "",
        attack_team: atk.atk_team || "",
        defense_family: "",
        defense_variant: "",
        discord_username: lospSession?.username || "",
        discord_display_name: lospSession?.displayName || lospSession?.global_name || "",
      });
    }

    const seenDefs = new Set();
    const rows = [];

    baseRows.forEach((r) => {
      const defUniqueKey = [
        normalizeKey(r.def_family),
        normalizeKey(r.def_variant),
        normalizeKey(r.def_chars.join("|")),
      ].join("::");

      if (seenDefs.has(defUniqueKey)) return;
      seenDefs.add(defUniqueKey);

      const targetRatio =
        safeRatioValue(r.min_hard) ||
        safeRatioValue(r.min_ok) ||
        safeRatioValue(r.min_safe) ||
        1;

      const virtualEnemyPower = computeEnemyPowerFromRatio(attackPower, targetRatio);
      const ratio = virtualEnemyPower > 0 ? attackPower / virtualEnemyPower : 0;
      const cls = getClass(ratio, r);

      rows.push({
        r,
        attackPower,
        ratio,
        cls,
      });
    });

    rows.sort((a, b) => {
      const na = (a.r.def_variant || a.r.def_family || "").toString();
      const nb = (b.r.def_variant || b.r.def_family || "").toString();

      return na.localeCompare(nb, "fr", { sensitivity: "base" });
    });

    if (resultsCount) resultsCount.textContent = String(rows.length);

    rows.forEach(({ r, attackPower, cls }) => {
      const portraits = (r.def_chars || []).map((c) => getPortrait(c)).filter(Boolean);

      resultsWrap.appendChild(
        makeCounterCard({
          teamName: r.def_variant || r.def_family || "Défense",
          attackPower,
          cls,
          portraits,
          row: r,
          notes: r.notes || "",
        })
      );
    });
  }

  function renderAll() {
    renderAttack();
    renderResults();
  }

  // ---------- EVENTS ----------
  allianceSelect?.addEventListener("change", () => {
    renderPlayerOptions();

    const didSelectPlayer = selectBestPlayerForCurrentAlliance();

    if (!didSelectPlayer) {
      renderAll();
    }
  });

  playerSelect?.addEventListener("change", () => {
    const alliance = (allianceSelect?.value ?? "").trim();
    const player = (playerSelect?.value ?? "").trim();

    if (alliance && player) {
      saveStoredPlayerForAlliance(alliance, player);
    }

    renderAll();
  });

  atkFamilySelect?.addEventListener("change", () => {
    if (atkVariantSelect) atkVariantSelect.value = "";
    renderAtkVariantOptions();
    renderAll();
  });

  atkVariantSelect?.addEventListener("change", renderAll);

  // ---------- BOOT ----------
  async function boot() {
    const [alliances, war, warSeasonRules, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.alliances),
      fetchJson(FILES.warCounters),
      fetchJson(FILES.warSeasonRules),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    buildAllianceMaps(alliances);

    WAR = Array.isArray(war) ? war.map(normalizeWarRow) : [];
    WAR_SEASON_RULES = normalizeSeasonRules(warSeasonRules);
    JOUEURS = Array.isArray(joueurs) ? joueurs : [];

    buildCharMap(chars);
    buildRosterMap(rosters);
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderAtkFamilyOptions();
    renderAtkVariantOptions();

    if (atkVariantSelect) atkVariantSelect.disabled = true;
    if (resultsCount) resultsCount.textContent = "0";
    if (atkTitle) atkTitle.textContent = "—";
    if (atkSubtitle) atkSubtitle.textContent = "—";
    if (playerChip) playerChip.textContent = "—";

    bootReady = true;

    if (!tryApplyAuthDefaults()) {
      renderAll();
    }
  }

  boot().catch((e) => console.error("[war-attack-checker] boot error:", e));
})();