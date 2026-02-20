// docs/app.js
(() => {
  const FILES = {
    teams: "./data/teams.json",
    characters: "./data/msf-characters.json",
    joueurs: "./data/joueurs.json",
    rosters: "./data/rosters.json",
  };

  const ALLIANCE_EMOJI = {
    Zeus: "⚡️",
    Dionysos: "🍇",
    "Poséidon": "🔱",
    Poseidon: "🔱",
  };

  // Paliers demandés
  const THRESH = {
    level: 100,
    gear: 19,
    iso: 13, // au moins une des 5 colonnes N-O-P-Q-R >= 13 => isoMax
  };

  const qs = (s) => document.querySelector(s);

  const modeSelect = qs("#modeSelect");
  const teamSelect = qs("#teamSelect");

  const teamTitle = qs("#teamTitle");
  const portraitsWrap = qs("#portraits");

  const playersWrap = qs("#players");
  const playersCount = qs("#playersCount");

  const filterZeus = qs("#filterZeus");
  const filterDionysos = qs("#filterDionysos");
  const filterPoseidon = qs("#filterPoseidon");

  let TEAMS = [];              // [{team, mode, characters[]}]
  let CHARS = [];              // raw chars array
  let CHAR_MAP = new Map();    // normalized alias -> "best" character object (heuristic)
  let CHAR_MULTI = new Map();  // normalized alias -> [character objects] (for disambiguation)

  let JOUEURS = [];            // [{player, alliance}]
  let ROSTERS = [];            // [{player, chars:{key:number|{power,level,gear,isoMax}}}]
  let ROSTER_MAP = new Map();  // playerKey -> chars map (keys normalisées)

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

  const normalizeKey = (s) =>
    (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "")
      .replace(/[’']/g, "");

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function formatThousandsDot(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    return Math.trunc(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function getSelectedAlliances() {
    return {
      Zeus: !!filterZeus?.checked,
      Dionysos: !!filterDionysos?.checked,
      "Poséidon": !!filterPoseidon?.checked,
      Poseidon: !!filterPoseidon?.checked,
    };
  }

  function getSelectedMode() {
    return (modeSelect?.value || "").trim();
  }

  // si aucun mode sélectionné => aucune équipe
  function getTeamListFilteredByMode() {
    const selectedMode = getSelectedMode();
    if (!selectedMode) return [];
    return TEAMS.filter((t) => (t.mode || "").trim() === selectedMode);
  }

  function renderModeOptions() {
    if (!modeSelect) return;

    const modes = Array.from(
      new Set(TEAMS.map((t) => (t.mode || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr"));

    modeSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir un mode de jeu —";
    modeSelect.appendChild(opt0);

    modes.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modeSelect.appendChild(opt);
    });

    modeSelect.value = "";
  }

  function renderTeamOptions() {
    if (!teamSelect) return;

    const list = getTeamListFilteredByMode()
      .slice()
      .sort((a, b) => a.team.localeCompare(b.team, "fr"));

    teamSelect.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Choisir une équipe —";
    teamSelect.appendChild(opt0);

    list.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.team;
      opt.textContent = t.team;
      teamSelect.appendChild(opt);
    });

    teamSelect.value = "";
  }

  // --------- Canon / variants handling ---------
  function isVariantId(id) {
    const s = (id ?? "").toString();
    if (!s) return false;
    // Mets ici les suffixes "techniques" qu'on veut éviter par défaut
    return /(_props|_bbminn|_npc|_event|_raid|_trial|_campaign|_boss)$/i.test(s);
  }

  function scoreCharacterMatch(c, queryKey) {
    // plus le score est haut, plus on préfère cette entrée
    const id = (c?.id ?? "").toString();
    const nameKey = (c?.nameKey ?? "").toString();

    const idKey = normalizeKey(id);
    const nameKeyKey = normalizeKey(nameKey);

    let score = 0;

    // match exact sur id ou nameKey -> très fort
    if (idKey && idKey === queryKey) score += 1000;
    if (nameKeyKey && nameKeyKey === queryKey) score += 900;

    // pénalité si variant
    if (isVariantId(id)) score -= 200;

    // bonus si "id" est court (= souvent le vrai perso)
    if (id && id.length <= 18) score += 10;

    return score;
  }

  function findPortraitFor(name) {
    const raw = (name ?? "").toString().trim();
    if (!raw) return null;

    const key = normalizeKey(raw);
    if (!key) return null;

    // 1) si on a une liste multi pour cette clé, on choisit le meilleur candidat
    const list = CHAR_MULTI.get(key);
    if (Array.isArray(list) && list.length) {
      let best = list[0];
      let bestScore = -Infinity;
      for (const c of list) {
        const sc = scoreCharacterMatch(c, key);
        if (sc > bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      return best || null;
    }

    // 2) fallback : map simple (un seul objet)
    return CHAR_MAP.get(key) || null;
  }

  function renderSelectedTeam(teamName) {
    clearNode(portraitsWrap);

    if (teamTitle) teamTitle.textContent = teamName || "—";
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

  // --- Lecture robuste des valeurs roster (ancien format number vs nouveau objet) ---
  function readCharPower(val) {
    if (val == null) return 0;
    if (typeof val === "number") return Number.isFinite(val) ? val : 0;
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

  // Retourne { sum, bars:[{status:'red'|'orange'|'green', tip:string}] }
  function computeTeamStatsForPlayer(playerName, teamName) {
    const playerKey = normalizeKey(playerName);
    const charsMap = ROSTER_MAP.get(playerKey) || null;
    if (!charsMap) return { sum: 0, bars: [] };

    const teamsFiltered = getTeamListFilteredByMode();
    const teamObj = teamsFiltered.find((t) => t.team === teamName);
    if (!teamObj) return { sum: 0, bars: [] };

    let sum = 0;
    const bars = [];

    for (const charName of teamObj.characters || []) {
      const info = findPortraitFor(charName);

      const rosterKey = normalizeKey(
        info?.id || info?.nameKey || info?.nameEn || info?.nameFr || charName
      );

      // ✅ lookup principal
      let raw = charsMap[rosterKey];

      // ✅ fallback : on retente avec le nom de l’équipe (ex: RocketRaccoon)
      if (raw == null) {
        const fallbackKey = normalizeKey(charName);
        raw = charsMap[fallbackKey];
      }

      // ✅ Présence = la clé existe dans le roster (pas juste power > 0)
      const present = raw !== undefined && raw !== null;

      const power = readCharPower(raw);

      if (present && Number.isFinite(power)) sum += power;

      const level = readCharLevel(raw);
      const gear = readCharGear(raw);
      const isoMax = readCharIsoMax(raw);

      // ✅ Rouge uniquement si absent.
      // ✅ Orange si présent mais pas OK.
      // ✅ Vert si présent et OK.
      let status = "red";
      if (present) {
        const ok =
          level >= THRESH.level && gear >= THRESH.gear && isoMax >= THRESH.iso;
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
    const teamName = teamSelect?.value || "";

    if (!selectedMode || !teamName) {
      if (playersCount) playersCount.textContent = "0";
      return;
    }

    const allianceEnabled = getSelectedAlliances();

    const rows = JOUEURS
      .filter((p) => {
        const a = (p.alliance || "").trim();
        return !!allianceEnabled[a];
      })
      .map((p) => {
        const stats = computeTeamStatsForPlayer(p.player, teamName);
        return { ...p, power: stats.sum, bars: stats.bars };
      })
      .sort((a, b) => b.power - a.power);

    if (playersCount) playersCount.textContent = String(rows.length);

    const list = document.createElement("div");
    list.className = "rankList";

    rows.forEach((r, idx) => {
      const emoji = ALLIANCE_EMOJI[r.alliance] || "•";

      const row = document.createElement("div");
      row.className = "rankRow";

      const left = document.createElement("div");
      left.className = "rankLeft";

      const num = document.createElement("div");
      num.className = "rankNum";
      num.textContent = String(idx + 1);

      const name = document.createElement("div");
      name.className = "rankName";
      name.textContent = `${emoji}${r.player}`;

      left.appendChild(num);
      left.appendChild(name);

      // ✅ 5 barres statut (mais si team < 5, on met des barres "empty" neutres)
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
    const [teamsRaw, charsRaw, joueursRaw, rostersRaw] = await Promise.all([
      fetchJson(FILES.teams),
      fetchJson(FILES.characters),
      fetchJson(FILES.joueurs),
      fetchJson(FILES.rosters),
    ]);

    // raw chars
    CHARS = Array.isArray(charsRaw) ? charsRaw : [];

    // Characters maps
    CHAR_MAP = new Map();
    CHAR_MULTI = new Map();

    CHARS.forEach((c) => {
      const keys = [c.id, c.nameKey, c.nameFr, c.nameEn].filter(Boolean);
      keys.forEach((k) => {
        const kk = normalizeKey(k);
        if (!kk) return;

        // multi list
        if (!CHAR_MULTI.has(kk)) CHAR_MULTI.set(kk, []);
        CHAR_MULTI.get(kk).push(c);

        // map "simple" : on garde le meilleur selon score
        const existing = CHAR_MAP.get(kk);
        if (!existing) {
          CHAR_MAP.set(kk, c);
        } else {
          const scNew = scoreCharacterMatch(c, kk);
          const scOld = scoreCharacterMatch(existing, kk);
          if (scNew > scOld) CHAR_MAP.set(kk, c);
        }
      });
    });

    // Teams
    TEAMS = (teamsRaw || [])
      .map((t) => {
        const team = (t.team ?? t.Team ?? "").toString().trim();
        const mode = (t.mode ?? t.Mode ?? "").toString().trim();
        const characters = Array.isArray(t.characters)
          ? t.characters.map((c) => (c ?? "").toString().trim()).filter(Boolean)
          : [];
        return { team, mode, characters };
      })
      .filter((t) => t.team);

    // Joueurs
    JOUEURS = (joueursRaw || [])
      .map((r) => ({
        player: (r.player ?? r.joueur ?? r.JOUEURS ?? "").toString().trim(),
        alliance: (r.alliance ?? r.ALLIANCES ?? "").toString().trim(),
      }))
      .filter((r) => r.player);

    // Rosters
    ROSTERS = (rostersRaw || [])
      .map((r) => ({
        player: (r.player ?? "").toString().trim(),
        chars: r.chars && typeof r.chars === "object" ? r.chars : {},
      }))
      .filter((r) => r.player);

    // Map player -> normalized chars keys
    ROSTER_MAP = new Map();
    for (const r of ROSTERS) {
      const normChars = {};
      for (const [k, v] of Object.entries(r.chars || {})) {
        normChars[normalizeKey(k)] = v;
      }
      ROSTER_MAP.set(normalizeKey(r.player), normChars);
    }

    renderModeOptions();
    renderTeamOptions();
    renderSelectedTeam("");
    renderRanking();
  }

  modeSelect?.addEventListener("change", onModeChange);
  teamSelect?.addEventListener("change", onTeamChange);

  filterZeus?.addEventListener("change", renderRanking);
  filterDionysos?.addEventListener("change", renderRanking);
  filterPoseidon?.addEventListener("change", renderRanking);

  boot().catch((e) => console.error(e));
})();