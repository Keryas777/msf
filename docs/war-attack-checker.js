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
  }

  // ---------- DATA ----------
  let WAR = [];
  let JOUEURS = [];
  let ROSTERS = new Map();
  let PLAYERS_BY_ALLIANCE = new Map();
  let CHAR_MAP = new Map();
  let WAR_SEASON_RULES = { defaultMultiplier: 1.17, rules: [] };

  function normalizeWarRow(r) {
    return {
      atk_family: (r.atk_family ?? "").toString().trim(),
      atk_team: (r.atk_team ?? "").toString().trim(),

      atk_chars: [r.atk_char1, r.atk_char2, r.atk_char3, r.atk_char4, r.atk_char5].map((x) =>
        (x ?? "").toString().trim()
      ),

      def_family: (r.def_family ?? "").toString().trim(),
      def_variant: (r.def_variant ?? "").toString().trim(),

      def_chars: [r.def_char1, r.def_char2, r.def_char3, r.def_char4, r.def_char5]
        .map((x) => (x ?? "").toString().trim())
        .filter(Boolean),

      min_hard: parseFloat(String(r.min_ratio_hard ?? "").replace(",", ".")) || 0,
      min_ok: parseFloat(String(r.min_ratio_ok ?? "").replace(",", ".")) || 0,
      min_safe: parseFloat(String(r.min_ratio_safe ?? "").replace(",", ".")) || 0,

      notes: (r.notes ?? "").toString().trim(),
    };
  }

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

  function buildRosterMap(data) {
    ROSTERS = new Map();

    (Array.isArray(data) ? data : []).forEach((r) => {
      const playerKey = normalizeKey(r.player);
      const map = {};

      Object.entries(r.chars || {}).forEach(([k, v]) => {
        map[normalizeKey(k)] =
          typeof v === "object" ? Number(v.power) || 0 : Number(v) || 0;
      });

      ROSTERS.set(playerKey, map);
    });
  }

  function getPlayerRawPower(player, chars) {
    const roster = ROSTERS.get(normalizeKey(player));
    if (!roster) return 0;

    return chars.reduce((sum, c) => {
      return sum + (roster[normalizeKey(c)] || 0);
    }, 0);
  }

  function getWarAdjustedPower(player, teamMembers) {
    const rawPower = getPlayerRawPower(player, teamMembers);
    return Math.round(rawPower * 1.17);
  }

  // ---------- SELECTS ----------
  function buildPlayersByAlliance() {
    PLAYERS_BY_ALLIANCE = new Map();

    JOUEURS.forEach((j) => {
      if (!PLAYERS_BY_ALLIANCE.has(j.alliance))
        PLAYERS_BY_ALLIANCE.set(j.alliance, []);

      PLAYERS_BY_ALLIANCE.get(j.alliance).push(j.player);
    });
  }

  function renderAllianceOptions() {
    allianceSelect.innerHTML = `<option value="">— Choisir une alliance —</option>`;

    [...new Set(JOUEURS.map((j) => j.alliance))]
      .sort()
      .forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = `${ALLIANCE_EMOJI[a] || "•"} ${a}`;
        allianceSelect.appendChild(opt);
      });
  }

  function renderPlayerOptions() {
    const list = PLAYERS_BY_ALLIANCE.get(allianceSelect.value) || [];

    playerSelect.innerHTML = `<option value="">— Choisir un joueur —</option>`;

    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      playerSelect.appendChild(opt);
    });
  }

  function renderAtkFamilies() {
    atkFamilySelect.innerHTML = `<option value="">— Choisir une famille —</option>`;

    [...new Set(WAR.map((r) => r.atk_family).filter(Boolean))]
      .sort()
      .forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        atkFamilySelect.appendChild(opt);
      });
  }

  function renderAtkVariants() {
    const fam = atkFamilySelect.value;

    atkVariantSelect.innerHTML = `<option value="">— Choisir une variante —</option>`;

    WAR.filter((r) => r.atk_family === fam)
      .map((r) => r.atk_team)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort()
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        atkVariantSelect.appendChild(opt);
      });
  }

  function getSelectedAtk() {
    const fam = atkFamilySelect.value;
    const vari = atkVariantSelect.value;
    if (!fam || !vari) return null;
    return WAR.find((r) => r.atk_family === fam && r.atk_team === vari) || null;
  }

  // ---------- UI ----------
  function renderAttack() {
    clearNode(atkPortraits);

    const row = getSelectedAtk();
    if (!row) {
      atkTitle.textContent = "—";
      return;
    }

    atkTitle.textContent = row.atk_team;

    row.atk_chars.forEach((name) => {
      if (!name) return;

      const img = document.createElement("img");
      img.src = getPortrait(name);
      img.className = "portraitImg";
      atkPortraits.appendChild(img);
    });
  }

  function getClass(ratio, r) {
    if (ratio >= r.min_safe) return "is-green";
    if (ratio >= r.min_ok) return "is-yellow";
    if (ratio >= r.min_hard) return "is-orange";
    return "is-red";
  }

  function computeRecommendation(enemy, row, power) {
    if (!enemy || !row.min_ok) return null;

    const recommended = enemy * row.min_ok;
    const delta = power - recommended;

    return {
      line1: `Recommandé : ${formatCompactFR(recommended)}`,
      line2:
        delta >= 0
          ? `✅ ${formatCompactFR(delta)} marge`
          : `🚫 +${formatCompactFR(Math.abs(delta))}`,
    };
  }

  function renderResults() {
    clearNode(resultsWrap);

    const atk = getSelectedAtk();
    const player = playerSelect.value;
    const enemy = enemyPowerDigitsValue();

    if (!atk || !player) return;

    const atkChars = atk.atk_chars.filter(Boolean);
    const power = getWarAdjustedPower(player, atkChars);

    const rows = WAR.map((r) => {
      const ratio = enemy > 0 ? power / enemy : 0;
      const cls = enemy ? getClass(ratio, r) : "is-yellow";
      return { r, cls, ratio };
    }).sort((a, b) => b.ratio - a.ratio);

    resultsCount.textContent = rows.length;
    playerChip.textContent = player;

    rows.forEach(({ r, cls }) => {
      const div = document.createElement("div");
      div.className = `counterCard ${cls}`;
      div.textContent = r.def_variant || r.def_family;
      resultsWrap.appendChild(div);
    });
  }

  // ---------- EVENTS ----------
  allianceSelect.addEventListener("change", () => {
    renderPlayerOptions();
  });

  atkFamilySelect.addEventListener("change", () => {
    renderAtkVariants();
  });

  atkVariantSelect.addEventListener("change", () => {
    renderAttack();
    renderResults();
  });

  playerSelect.addEventListener("change", renderResults);

  enemyPowerInput.addEventListener("input", () => {
    const raw = enemyPowerInput.value;
    const pos = enemyPowerInput.selectionStart;

    const digitsBefore = digitsOnly(raw.slice(0, pos)).length;
    const digits = digitsOnly(raw);

    enemyPowerInput.value = formatThousandsDotFromDigits(digits);
    setCaretByDigitsCount(enemyPowerInput, digitsBefore);

    renderResults();
  });

  // ---------- BOOT ----------
  async function boot() {
    const [war, joueurs, chars, rosters] = await Promise.all([
      fetchJson(FILES.warCounters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.characters),
      fetchJson(FILES.rosters),
    ]);

    WAR = war.map(normalizeWarRow);
    JOUEURS = joueurs;

    buildCharMap(chars);
    buildRosterMap(rosters);
    buildPlayersByAlliance();

    renderAllianceOptions();
    renderPlayerOptions();
    renderAtkFamilies();
  }

  boot();
})();