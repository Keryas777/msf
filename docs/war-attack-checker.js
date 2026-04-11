// docs/war-attack-checker.js
(() => {
  const FILES = {
    warCounters: "./data/war-counters.json",
    warSeasonRules: "./data/war-season-rules.json",
    joueurs: "./data/joueurs.json",
    characters: "./data/msf-characters.json",
    rosters: "./data/rosters.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    "Poséidon": "🔱",
    Poseidon: "🔱",
  };

  const qs = (s) => document.querySelector(s);

  const allianceSelect = qs("#allianceSelect");
  const playerSelect = qs("#playerSelect");
  const atkFamilySelect = qs("#atkFamilySelect");
  const atkVariantSelect = qs("#atkVariantSelect");
  const enemyPowerInput = qs("#enemyPower");

  const atkTitle = qs("#atkTitle");
  const atkPortraits = qs("#atkPortraits");

  const resultsWrap = qs("#results");
  const resultsCount = qs("#resultsCount");
  const playerChip = qs("#playerChip");

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

      // on garde les cases vides si besoin
      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map((x) =>
        (x ?? "").toString().trim()
      ),

      min_hard: parseFloat(String(r.min_ratio_hard ?? "").replace(",", ".")) || 0,
      min_ok: parseFloat(String(r.min_ratio_ok ?? "").replace(",", ".")) || 0,
      min_safe: parseFloat(String(r.min_ratio_safe ?? "").replace(",", ".")) || 0,

      notes: (r.notes ?? "").toString().trim(),
    };
  }

  function isRealDefenseMatch(r) {
    if ((r.def_variant || "").trim()) return true;
    return Array.isArray(r.def_chars) && r.def_chars.some((c) => (c || "").trim());
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

    console.log("[war-attack-checker] rosters chargés :", ROSTERS.size);
  }

  function getPlayerRawPower(player, chars) {
    const playerKey = normalizeKey(player);
    const roster = ROSTERS.get(playerKey);

    if (!roster) {
      console.warn(
        "[war-attack-checker] roster introuvable pour :",
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
      const p = (