// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  const FALLBACK_ALLIANCES = Object.freeze([
    { key: "zeus", name: "Zeus", emoji: "⚡️", color: "#F8FF00", order: 1 },
    { key: "kronos", name: "Kronos", emoji: "⏳", color: "#E10D17", order: 2 },
    { key: "dionysos", name: "Dionysos", emoji: "🍇", color: "#93328E", order: 3 },
    { key: "poseidon", name: "Poséidon", emoji: "🔱", color: "#0000FF", order: 4 },
    { key: "hades", name: "Hadès", emoji: "🔥", color: "#1EA164", order: 5 },
  ]);

  const MODE_ORDER = [
    "Arène",
    "Raids",
    "Guerre",
    "Epreuve",
    "Battleworld",
    "Divers hors méta",
  ];

  const THRESH = {
    level: 100,
    gear: 19,
    iso: 13,
  };

  const qs = (s) => document.querySelector(s);

  const modeSelect = qs("#modeSelect");
  const teamSelect = qs("#teamSelect");

  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");

  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");

  const filtersWrap = qs("#allianceFilters");

  let TEAMS = [];
  let CHARS = [];
  let CHAR_MAP = new Map();
  let CHAR_MULTI = new Map();

  let JOUEURS = [];
  let ROSTERS = [];
  let ROSTER_MAP = new Map();

  const bust = (url) => {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", Date.now().toString());
    return u.toString();
  };

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`${url} -> HTTP ${res.status}`);
    }

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

  function normalizePlayerKey(value) {
    return normalizeKey(value).replace(/[^a-z0-9]/g, "");
  }

  function allianceHelper() {
    return window.LoSPAlliances || null;
  }

  function getKnownAlliances() {
    const helper = allianceHelper();

    if (helper?.getKnownAlliances) {
      const alliances = helper.getKnownAlliances();

      if (Array.isArray(alliances) && alliances.length) return alliances;
    }

    return FALLBACK_ALLIANCES;
  }

  function allianceKey(value) {
    const helper = allianceHelper();

    if (helper?.getAllianceKey) return helper.getAllianceKey(value);

    const key = normalizeKey(value);

    if (key.includes("zeus")) return "zeus";
    if (key.includes("dionysos")) return "dionysos";
    if (key.includes("hades")) return "hades";
    if (key.includes("poseidon") || key.includes("posseidon")) return "poseidon";

    if (
      key.includes("kronos") ||
      key.includes("cronos") ||
      key.includes("chronos") ||
      key.includes("lospkronos")
    ) {
      return "kronos";
    }

    return "";
  }

  function allianceEmoji(value) {
    const helper = allianceHelper();

    if (helper?.getAllianceEmoji) return helper.getAllianceEmoji(value);

    return FALLBACK_ALLIANCES.find((a) => a.key === value)?.emoji || "•";
  }

  function allianceLabel(value) {
    const helper = allianceHelper();

    if (helper?.getAllianceLabel) return helper.getAllianceLabel(value);

    return FALLBACK_ALLIANCES.find((a) => a.key === value)?.name || "Alliance";
  }

  function clearNode(el) {
    if (!el) return;

    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function formatThousandsDot(n) {
    const num = Number(n);

    if (!Number.isFinite(num)) return "0";

    return Math.trunc(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function getSelectedAlliances() {
    const selected = {};

    filtersWrap
      ?.querySelectorAll('input[type="checkbox"][data-alliance]')
      .forEach((input) => {
        selected[input.dataset.alliance] = input.checked;
      });

    return selected;
  }

  function renderAllianceFilters() {
    if (!filtersWrap) return;

    clearNode(filtersWrap);

    getKnownAlliances().forEach((alliance) => {
      const key = allianceKey(alliance.key);

      if (!key) return;

      const label = document.createElement("label");
      label.className = "filterToggle";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      input.dataset.alliance = key;

      const stack = document.createElement("span");
      stack.className = "fStack";

      const emoji = document.createElement("span");
      emoji.className = "fEmoji";
      emoji.textContent = allianceEmoji(key);

      const name = document.createElement("span");
      name.className = "fName";
      name.textContent = allianceLabel(key);

      stack.appendChild(emoji);
      stack.appendChild(name);
      label.appendChild(input);
      label.appendChild(stack);
      filtersWrap.appendChild(label);
    });
  }

  function getSelectedMode() {
    return String(modeSelect?.value || "").trim();
  }

  function getTeamListFilteredByMode() {
    const selectedMode = getSelectedMode();

    if (!selectedMode) return [];

    return TEAMS.filter((t) => String(t.mode || "").trim() === selectedMode);
  }

  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = Array.from(
      new Set(TEAMS.map((t) => String(t.mode || "").trim()).filter(Boolean))
    );

    modes.sort((a, b) => {
      const ia = MODE_ORDER.indexOf(a);
      const ib = MODE_ORDER.indexOf(b);

      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }

      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });

    modeSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un mode de jeu —";
    modeSelect.appendChild(opt0);

    modes.forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode;
      modeSelect.appendChild(opt);
    });

    modeSelect.value = "";
  }

  function renderTeamOptions() {
    if (!teamSelect) return;

    const list = getTeamListFilteredByMode()
      .slice()
      .sort((a, b) =>
        String(a.team || "").localeCompare(String(b.team || ""), "fr", {
          sensitivity: "base",
        })
      );

    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    list.forEach((teamObj) => {
      const opt = document.createElement("option");
      opt.value = teamObj.team;
      opt.textContent = teamObj.team;
      teamSelect.appendChild(opt);
    });

    teamSelect.value = "";
  }

  function isVariantId(id) {
    const s = String(id ?? "");

    if (!s) return false;

    return /(_props|_bbminn|_npc|_event|_raid|_trial|_campaign|_boss)$/i.test(s);
  }

  function scoreCharacterMatch(c, queryKey) {
    const id = String(c?.id ?? "");
    const nameKey = String(c?.nameKey ?? "");

    const idKey = normalizeKey(id);
    const nameKeyKey = normalizeKey(nameKey);

    let score = 0;

    if (idKey && idKey === queryKey) score += 1000;
    if (nameKeyKey && nameKeyKey === queryKey) score += 900;

    if (isVariantId(id)) score -= 200;
    if (id && id.length <= 18) score += 10;

    return score;
  }

  function findPortraitFor(name) {
    const raw = String(name ?? "").trim();

    if (!raw) return null;

    const key = normalizeKey(raw);

    if (!key) return null;

    const list = CHAR_MULTI.get(key);

    if (Array.isArray(list) && list.length) {
      let best = list[0];
      let bestScore = -Infinity;

      for (const c of list) {
        const score = scoreCharacterMatch(c, key);

        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }

      return best || null;
    }

    return CHAR_MAP.get(key) || null;
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);

    if (teamTitle) {
      teamTitle.textContent = teamName || "—";
    }

    if (!teamName) return;

    const teamsFiltered = getTeamListFilteredByMode();
    const teamObj = teamsFiltered.find((t) => t.team === teamName);

    if (!teamObj) return;

    (teamObj.characters || []).forEach((charName) => {
      const info = findPortraitFor(charName);

      const card = document.createElement("div");
      card.className = "portraitCard";

      const img = document.createElement("img");
      img.className = "portraitImg";
      img.alt = charName;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = info?.portraitUrl || "";

      card.appendChild(img);
      portraitsWrap.appendChild(card);
    });
  }

  function readCharPower(val) {
    if (val == null) return 0;

    if (typeof val === "number") {
      return Number.isFinite(val) ? val : 0;
    }

    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    }

    if (typeof val === "object") {
      const n = Number(val.power);
      return Number.isFinite(n) ? n : 0;
    }

    return 0;
  }

  function readCharLevel(val) {
    if (!val || typeof val !== "object") return 0;

    const n = Number(val.level);
    return Number.isFinite(n) ? n : 0;
  }

  function readCharGear(val) {
    if (!val || typeof val !== "object") return 0;

    const n = Number(val.gear);
    return Number.isFinite(n) ? n : 0;
  }

  function readCharIsoMax(val) {
    if (!val || typeof val !== "object") return 0;

    const n = Number(val.isoMax);
    return Number.isFinite(n) ? n : 0;
  }

  function buildBarTooltip(charName, present, level, gear, isoMax) {
    if (!present) return `${charName}\n❌ Non débloqué`;

    const okLevel = level >= THRESH.level;
    const okGear = gear >= THRESH.gear;
    const okIso = isoMax >= THRESH.iso;

    return [
      charName,
      `${okLevel ? "✅" : "⚠️"} Level : ${level || "—"} (≥ ${THRESH.level})`,
      `${okGear ? "✅" : "⚠️"} Gear  : ${gear || "—"} (≥ ${THRESH.gear})`,
      `${okIso ? "✅" : "⚠️"} ISO max: ${isoMax || "—"} (≥ ${THRESH.iso})`,
    ].join("\n");
  }

  function getRosterValueForCharacter(charsMap, charName) {
    if (!charsMap) return null;

    const info = findPortraitFor(charName);

    const candidateKeys = [
      charName,
      info?.id,
      info?.nameKey,
      info?.nameEn,
      info?.nameFr,
    ]
      .map(normalizeKey)
      .filter(Boolean);

    for (const key of candidateKeys) {
      if (charsMap[key] != null) {
        return charsMap[key];
      }
    }

    return null;
  }

  function computeTeamStatsForPlayer(playerName, teamName) {
    const playerK = normalizePlayerKey(playerName);
    const charsMap = ROSTER_MAP.get(playerK) || null;

    if (!charsMap) return { sum: 0, bars: [] };

    const teamsFiltered = getTeamListFilteredByMode();
    const teamObj = teamsFiltered.find((t) => t.team === teamName);

    if (!teamObj) return { sum: 0, bars: [] };

    let sum = 0;
    const bars = [];

    for (const charName of teamObj.characters || []) {
      const raw = getRosterValueForCharacter(charsMap, charName);

      const present = raw !== undefined && raw !== null;
      const power = readCharPower(raw);

      if (present && Number.isFinite(power)) {
        sum += power;
      }

      const level = readCharLevel(raw);
      const gear = readCharGear(raw);
      const isoMax = readCharIsoMax(raw);

      let status = "red";

      if (present) {
        const ok = level >= THRESH.level && gear >= THRESH.gear && isoMax >= THRESH.iso;
        status = ok ? "green" : "orange";
      }

      const tip = buildBarTooltip(charName, present, level, gear, isoMax);
      bars.push({ status, tip });
    }

    return { sum, bars };
  }

  function renderRanking() {
    clearNode(playersWrap);

    const selectedMode = getSelectedMode();
    const teamName = String(teamSelect?.value || "").trim();

    if (!selectedMode || !teamName) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const allianceEnabled = getSelectedAlliances();

    const rows = JOUEURS
      .filter((p) => {
        const key = allianceKey(p.alliance);

        if (!key) return false;

        return allianceEnabled[key] === true;
      })
      .map((p) => {
        const stats = computeTeamStatsForPlayer(p.player, teamName);
        const key = allianceKey(p.alliance);

        return {
          ...p,
          allianceKey: key,
          power: stats.sum,
          bars: stats.bars,
        };
      })
      .sort((a, b) => {
        if (b.power !== a.power) return b.power - a.power;

        return String(a.player || "").localeCompare(String(b.player || ""), "fr", {
          sensitivity: "base",
        });
      });

    if (playersCount) {
      playersCount.textContent = String(rows.length);
    }

    const list = document.createElement("div");
    list.className = "rankList";

    rows.forEach((r, idx) => {
      const key = r.allianceKey || allianceKey(r.alliance);
      const emoji = allianceEmoji(key);
      const label = allianceLabel(key);

      const row = document.createElement("div");
      row.className = "rankRow";

      const left = document.createElement("div");
      left.className = "rankLeft";

      const num = document.createElement("div");
      num.className = "rankNum";
      num.textContent = String(idx + 1);

      const name = document.createElement("div");
      name.className = "rankName";
      name.title = `${label} • ${r.player}`;
      name.textContent = `${emoji}${r.player}`;

      left.appendChild(num);
      left.appendChild(name);

      const bars = document.createElement("div");
      bars.className = "rankBars";

      const barsData = Array.isArray(r.bars) ? r.bars : [];

      for (let i = 0; i < 5; i++) {
        const b = barsData[i] || { status: "empty", tip: "—" };

        const bar = document.createElement("span");
        bar.className = `rankBar is-${b.status}`;
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", b.tip || "—");
        bar.title = b.tip || "";
        bar.dataset.tip = b.tip || "";

        bars.appendChild(bar);
      }

      const power = document.createElement("div");
      power.className = "rankPower";
      power.textContent = formatThousandsDot(r.power);

      row.appendChild(left);
      row.appendChild(bars);
      row.appendChild(power);

      list.appendChild(row);
    });

    playersWrap.appendChild(list);
  }

  function onModeChange() {
    if (teamSelect) teamSelect.value = "";

    renderTeamOptions();
    renderSelectedTeam("");
    renderRanking();
  }

  function onTeamChange() {
    renderSelectedTeam(teamSelect.value || "");
    renderRanking();
  }

  async function boot() {
    if (allianceHelper()?.loadAlliances) {
      await allianceHelper().loadAlliances();
    }

    renderAllianceFilters();

    const [teamsRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
      fetchJson(FILES.teams),
      fetchJson(FILES.characters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.rosters),
    ]);

    CHARS = Array.isArray(charsRaw) ? charsRaw : [];

    CHAR_MAP = new Map();
    CHAR_MULTI = new Map();

    CHARS.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);

      keys.forEach((k) => {
        const kk = normalizeKey(k);

        if (!kk) return;

        if (!CHAR_MULTI.has(kk)) {
          CHAR_MULTI.set(kk, []);
        }

        CHAR_MULTI.get(kk).push(c);

        const existing = CHAR_MAP.get(kk);

        if (!existing) {
          CHAR_MAP.set(kk, c);
          return;
        }

        const scNew = scoreCharacterMatch(c, kk);
        const scOld = scoreCharacterMatch(existing, kk);

        if (scNew > scOld) {
          CHAR_MAP.set(kk, c);
        }
      });
    });

    TEAMS = (Array.isArray(teamsRaw) ? teamsRaw : [])
      .map((t) => {
        const team = String(t.team ?? t.Team ?? "").trim();
        const mode = String(t.mode ?? t.Mode ?? "").trim();

        const characters = Array.isArray(t.characters)
          ? t.characters.map((c) => String(c ?? "").trim()).filter(Boolean)
          : [];

        return { team, mode, characters };
      })
      .filter((t) => t.team);

    JOUEURS = (Array.isArray(joueursRaw) ? joueursRaw : [])
      .map((r) => {
        const player = String(r.player ?? r.joueur ?? r.JOUEURS ?? "").trim();
        const rawAlliance = String(r.alliance ?? r.ALLIANCES ?? "").trim();
        const key = allianceKey(rawAlliance);

        return {
          player,
          alliance: key,
          allianceRaw: rawAlliance,
        };
      })
      .filter((r) => r.player && r.alliance);

    ROSTERS = (Array.isArray(rostersRaw) ? rostersRaw : [])
      .map((r) => ({
        player: String(r.playerKey ?? r.player ?? "").trim(),
        chars: r.chars && typeof r.chars === "object" ? r.chars : {},
      }))
      .filter((r) => r.player);

    ROSTER_MAP = new Map();

    for (const r of ROSTERS) {
      const playerK = normalizePlayerKey(r.player);

      if (!playerK) continue;

      const normChars = {};

      for (const [k, v] of Object.entries(r.chars || {})) {
        const key = normalizeKey(k);

        if (!key) continue;

        normChars[key] = v;
      }

      ROSTER_MAP.set(playerK, normChars);
    }

    renderModeOptions();
    renderTeamOptions();
    renderSelectedTeam("");
    renderRanking();
  }

  modeSelect?.addEventListener("change", onModeChange);
  teamSelect?.addEventListener("change", onTeamChange);

  filtersWrap?.addEventListener("change", (event) => {
    if (event.target?.matches('input[type="checkbox"][data-alliance]')) {
      renderRanking();
    }
  });

  boot().catch((e) => {
    console.error("[app] boot error:", e);
  });
})();