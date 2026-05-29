// docs/war-counters.js
(() => {
  const USAGE_LOGGER_URL =
    "https://script.google.com/macros/s/AKfycbzTdFi7gEgRVCKjK2UBwFcQIlIzi2jp4eeO2ryR36sSrcy3QtzfEK8k7kNSXSJOGmFAbw/exec";

  const FILES = {
    warCounters: "./data/war-counters.json",
    warSeasonRules: "./data/war-season-rules.json",
    joueurs: "./data/joueurs.json",
    characters: "./data/msf-characters.json",
    rosters: "./data/rosters.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    zeus: "⚡️",
    Dionysos: "🍇",
    dionysos: "🍇",
    "Poséidon": "🔱",
    Poseidon: "🔱",
    poseidon: "🔱",
    Kronos: "⏳",
    kronos: "⏳",
    "LoSP Kronos": "⏳",
  };

  const AUTH_PLAYER_STORAGE_KEY = "losp:lastPlayerByAlliance";
  const LOCAL_SESSION_KEY = "losp_session";

  const qs = (s) => document.querySelector(s);

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");
  const defFamilySelect = qs("#defFamilySelect");
  const defVariantSelect = qs("#defVariantSelect");
  const enemyPowerInput = qs("#enemyPower");

  const defTitle = qs("#defTitle");
  const defPortraits = qs("#defPortraits");

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

  function allianceKey(value) {
    const key = normalizeKey(value);

    if (key === "poseidon" || key === "posseidon") return "poseidon";
    if (key === "dionysos") return "dionysos";
    if (key === "zeus") return "zeus";
    if (key === "kronos" || key === "lospkronos") return "kronos";

    return key;
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

  function formatCompactFR(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return "0";

    if (num >= 1_000_000) {
      const v = Math.round((num / 1_000_000) * 10) / 10;
      return `${String(v).replace(".", ",")} M`;
    }

    if (num >= 1_000) {
      const v = Math.round(num / 1_000);
      return `${v} k`;
    }

    return String(Math.round(num));
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

    const exactMatch = session.players.find((player) => allianceKey(player.alliance) === allianceK);

    if (exactMatch) return exactMatch;

    if (session.players.length === 1) {
      return session.players[0];
    }

    return null;
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

  // ---------- Enemy power LIVE formatting ----------
  function digitsOnly(s) {
    return String(s || "").replace(/[^\d]/g, "");
  }

  function formatThousandsDotFromDigits(d) {
    const s = digitsOnly(d);
    if (!s) return "";
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function enemyPowerDigitsValue() {
    return Number(digitsOnly(enemyPowerInput?.value || "")) || 0;
  }

  function setCaretByDigitsCount(input, digitsBefore) {
    const v = String(input?.value || "");
    if (!v) {
      try {
        input.setSelectionRange(0, 0);
      } catch (_) {}
      return;
    }

    let seen = 0;
    for (let i = 0; i < v.length; i++) {
      if (/\d/.test(v[i])) seen++;
      if (seen >= digitsBefore) {
        const pos = i + 1;
        try {
          input.setSelectionRange(pos, pos);
        } catch (_) {}
        return;
      }
    }

    try {
      input.setSelectionRange(v.length, v.length);
    } catch (_) {}
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
      def_family: (r.def_family ?? "").toString().trim(),
      def_variant: (r.def_variant ?? "").toString().trim(),
      def_key: (r.def_key ?? "").toString().trim(),

      def_chars: [r.def_char1, r.def_char2, r.def_char3, r.def_char4, r.def_char5]
        .map((x) => (x ?? "").toString().trim())
        .filter(Boolean),

      def_team: (r.def_team ?? "").toString().trim(),
      atk_family: (r.atk_family ?? "").toString().trim(),
      atk_team: (r.atk_team ?? "").toString().trim(),
      atk_key: (r.atk_key ?? "").toString().trim(),

      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map((x) =>
        (x ?? "").toString().trim()
      ),

      min_hard: parseFloat(String(r.min_ratio_hard ?? "").replace(",", ".")) || 0,
      min_ok: parseFloat(String(r.min_ratio_ok ?? "").replace(",", ".")) || 0,
      min_safe: parseFloat(String(r.min_ratio_safe ?? "").replace(",", ".")) || 0,

      notes: (r.notes ?? "").toString().trim(),
    };
  }

  function isRealCounter(r) {
    if ((r.atk_team || "").trim()) return true;
    return Array.isArray(r.atk_chars) && r.atk_chars.some((c) => (c || "").trim());
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

    console.log("[war-counters] rosters chargés :", ROSTERS.size);
  }

  function getPlayerRawPower(player, chars) {
    const playerKey = normalizeKey(player);
    const roster = ROSTERS.get(playerKey);

    if (!roster) {
      console.warn(
        "[war-counters] roster introuvable pour :",
        player,
        "=> clé normalisée :",
        playerKey
      );
      return 0;
    }

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

    const ORDER_KEYS = ["zeus", "dionysos", "poseidon", "kronos"];
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
        opt.textContent = `${ALLIANCE_EMOJI[a] || ALLIANCE_EMOJI[allianceKey(a)] || "•"} ${a}`.trim();
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

  function renderDefFamilyOptions() {
    if (!defFamilySelect) return;
    defFamilySelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une team générique —";
    defFamilySelect.appendChild(opt0);

    const families = [...new Set(WAR.map((r) => r.def_family).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr")
    );

    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      defFamilySelect.appendChild(opt);
    });
  }

  function renderDefVariantOptions() {
    if (!defVariantSelect) return;

    const fam = (defFamilySelect?.value ?? "").trim();
    defVariantSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";

    if (!fam) {
      opt0.textContent = "— Choisir une team générique d’abord —";
      defVariantSelect.appendChild(opt0);
      defVariantSelect.disabled = true;
      defVariantSelect.value = "";
      return;
    }

    defVariantSelect.disabled = false;
    opt0.textContent = "— Choisir une variante —";
    defVariantSelect.appendChild(opt0);

    const variants = WAR.filter((r) => r.def_family === fam)
      .map((r) => r.def_variant)
      .filter(Boolean);

    [...new Set(variants)]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        defVariantSelect.appendChild(opt);
      });
  }

  function getSelectedDef() {
    const fam = (defFamilySelect?.value ?? "").trim();
    const vari = (defVariantSelect?.value ?? "").trim();
    if (!fam || !vari) return null;
    return WAR.find((r) => r.def_family === fam && r.def_variant === vari) || null;
  }

  // ---------- UI ----------
  function renderDefense() {
    clearNode(defPortraits);

    const row = getSelectedDef();

    if (!row) {
      if (defTitle) defTitle.textContent = "—";
      return;
    }

    if (defTitle) defTitle.textContent = row.def_variant || row.def_family || "Défense";

    row.def_chars.forEach((name) => {
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
      defPortraits.appendChild(card);
    });
  }

  function computeCounterStatus(enemyPower, row, teamPower) {
    const enemy = Number(enemyPower) || 0;
    const power = Number(teamPower) || 0;

    const hardRatio = Number(row?.min_hard) || 0;
    const okRatio = Number(row?.min_ok) || 0;
    const safeRatio = Number(row?.min_safe) || 0;

    const hardRequired = enemy * hardRatio;
    const okRequired = enemy * okRatio;
    const safeRequired = enemy * safeRatio;

    if (enemy <= 0 || (!hardRatio && !okRatio && !safeRatio)) {
      return {
        show: false,
        cls: "is-yellow",
        rank: 1,
        recommended: 0,
        delta: 0,
        ratio: 0,
        line1: "",
        line2: "",
      };
    }

    let cls = "is-red";
    let rank = 3;

    if (safeRatio && power >= safeRequired) {
      cls = "is-green";
      rank = 0;
    } else if (okRatio && power >= okRequired) {
      cls = "is-yellow";
      rank = 1;
    } else if (hardRatio && power >= hardRequired) {
      cls = "is-orange";
      rank = 2;
    }

    const recommended = okRequired || hardRequired || safeRequired || 0;
    const delta = power - recommended;

    return {
      show: recommended > 0,
      cls,
      rank,
      recommended,
      delta,
      ratio: enemy > 0 ? power / enemy : 0,
      line1: `Recommandé : ${formatCompactFR(recommended)} mini`,
      line2:
        delta >= 0
          ? `✅ ${formatCompactFR(delta)} de marge`
          : `🚫 + ${formatCompactFR(Math.abs(delta))} mini. requis`,
    };
  }

  function classRank(cls) {
    if (cls === "is-green") return 0;
    if (cls === "is-yellow") return 1;
    if (cls === "is-orange") return 2;
    return 3;
  }

  function makeCounterCard({ teamName, power, cls, portraits, enemy, row, notes }) {
    const card = document.createElement("div");
    card.className = `counterCard ${cls}`.trim();

    const top = document.createElement("div");
    top.className = "counterTop";

    const left = document.createElement("div");
    left.className = "counterName";
    left.textContent = teamName || "Counter";

    const right = document.createElement("div");
    right.className = "counterRight";

    const pow = document.createElement("div");
    pow.className = "counterPower";
    pow.textContent = formatThousandsDot(power);
    right.appendChild(pow);

    const status = computeCounterStatus(enemy, row, power);

    if (status.show) {
      const l1 = document.createElement("div");
      l1.className = "counterRatio";
      l1.textContent = status.line1;

      const l2 = document.createElement("div");
      l2.className = "counterRatio";
      l2.textContent = status.line2;

      right.appendChild(l1);
      right.appendChild(l2);
    }

    top.appendChild(left);
    top.appendChild(right);

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

    card.appendChild(top);
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

    const def = getSelectedDef();
    const player = (playerSelect?.value ?? "").trim();
    const enemy = enemyPowerDigitsValue();

    if (playerChip) playerChip.textContent = player || "—";

    if (!def) {
      if (resultsCount) resultsCount.textContent = "0";
      return;
    }

    if (!player) {
      if (resultsCount) resultsCount.textContent = "0";
      const hint = document.createElement("p");
      hint.className = "subtitle";
      hint.textContent = "Choisis un joueur pour afficher les counters disponibles.";
      resultsWrap.appendChild(hint);
      return;
    }

    const baseRows = WAR.filter(
      (r) => r.def_family === def.def_family && r.def_variant === def.def_variant
    ).filter(isRealCounter);

    if (!baseRows.length) {
      if (resultsCount) resultsCount.textContent = "0";
      resultsWrap.innerHTML = `<p class="subtitle">Aucun counter renseigné</p>`;
      return;
    }

    const trackKey = JSON.stringify({
      page: "war-counters",
      alliance: (allianceSelect?.value ?? "").trim(),
      player,
      defense_family: def.def_family || "",
      defense_variant: def.def_variant || "",
    });

    if (trackKey !== LAST_TRACKED_KEY) {
      LAST_TRACKED_KEY = trackKey;

      trackUsage({
        page: "war-counters",
        event_type: "counter_search",
        alliance: (allianceSelect?.value ?? "").trim(),
        player,
        attack_family: "",
        attack_team: "",
        defense_family: def.def_family || "",
        defense_variant: def.def_variant || "",
        discord_username: lospSession?.username || "",
        discord_display_name: lospSession?.displayName || lospSession?.global_name || "",
      });
    }

    const rows = baseRows.map((r) => {
      const atkList = (r.atk_chars || []).filter((c) => (c || "").trim());
      const power = getWarAdjustedPower(player, atkList);
      const status = computeCounterStatus(enemy, r, power);

      return {
        r,
        atkList,
        power,
        ratio: status.ratio,
        cls: status.cls,
        delta: status.delta,
        hasRec: status.show,
        statusRank: status.rank,
      };
    });

    rows.sort((a, b) => {
      if (enemy > 0) {
        const ra = Number(a.statusRank ?? classRank(a.cls));
        const rb = Number(b.statusRank ?? classRank(b.cls));

        if (ra !== rb) return ra - rb;

        if (a.hasRec && b.hasRec && a.delta !== b.delta) return b.delta - a.delta;
        if (a.ratio !== b.ratio) return b.ratio - a.ratio;
        if (a.power !== b.power) return b.power - a.power;
      } else {
        if (a.power !== b.power) return b.power - a.power;
      }

      const na = (a.r.atk_team || "Counter").toString();
      const nb = (b.r.atk_team || "Counter").toString();

      return na.localeCompare(nb, "fr", { sensitivity: "base" });
    });

    if (resultsCount) resultsCount.textContent = String(rows.length);

    rows.forEach(({ r, atkList, power, cls }) => {
      const portraits = atkList.map((c) => getPortrait(c)).filter(Boolean);

      resultsWrap.appendChild(
        makeCounterCard({
          teamName: r.atk_team || "Counter",
          power,
          cls,
          portraits,
          enemy,
          row: r,
          notes: r.notes || "",
        })
      );
    });
  }

  function renderAll() {
    renderDefense();
    renderResults();
  }

  // ---------- EVENTS ----------
  allianceSelect?.addEventListener("change", () => {
    renderPlayerOptions();

    if (playerChip) playerChip.textContent = "—";

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

  defFamilySelect?.addEventListener("change", () => {
    if (defVariantSelect) defVariantSelect.value = "";
    renderDefVariantOptions();
    renderAll();
  });

  defVariantSelect?.addEventListener("change", renderAll);

  enemyPowerInput?.addEventListener("input", () => {
    if (!enemyPowerInput) return;

    const raw = String(enemyPowerInput.value || "");
    const pos = enemyPowerInput.selectionStart ?? raw.length;

    const digitsBefore = digitsOnly(raw.slice(0, pos)).length;
    const digits = digitsOnly(raw);

    enemyPowerInput.value = formatThousandsDotFromDigits(digits);
    setCaretByDigitsCount(enemyPowerInput, digitsBefore);

    renderResults();
  });

  // ---------- BOOT ----------
  async function boot() {
    const [war, warSeasonRules, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.warSeasonRules),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    WAR = Array.isArray(war) ? war.map(normalizeWarRow) : [];
    WAR_SEASON_RULES = normalizeSeasonRules(warSeasonRules);
    JOUEURS = Array.isArray(joueurs) ? joueurs : [];

    buildCharMap(chars);
    buildRosterMap(rosters);
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderDefFamilyOptions();
    renderDefVariantOptions();

    if (defVariantSelect) defVariantSelect.disabled = true;
    if (resultsCount) resultsCount.textContent = "0";
    if (defTitle) defTitle.textContent = "—";
    if (playerChip) playerChip.textContent = "—";

    bootReady = true;

    if (!tryApplyAuthDefaults()) {
      renderAll();
    }
  }

  boot().catch((e) => console.error("[war-counters] boot error:", e));
})();